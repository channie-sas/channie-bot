// src/interactions/buttonHandlers/wishlistButtons.js
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { getUserWishlist, getWishlistUsers } = require('../../database/wishlistDatabase');
const { getAllCards } = require('../../database/cardDatabase');
const { getActiveView, registerActiveView, refreshTimer } = require('../../utils/activeViews');

/**
 * 위시리스트 버튼 핸들러
 * @param {Object} interaction - 상호작용 객체
 */
async function handleWishlistButtonInteraction(interaction) {
  const customId = interaction.customId;
  
  if (customId.startsWith('wl_')) {
    try {
      const parts = customId.split('_');
      const action = parts[1]; // 'first', 'prev', 'next', 'last'
      const targetUserId = parts[2]; // 위시리스트 소유자 ID
      const currentPage = parseInt(parts[3]); // 현재 페이지
      const requesterId = parts[4]; // 요청자 ID
      
      // 요청자 ID가 현재 사용자와 다른 경우 접근 거부
      if (requesterId !== interaction.user.id) {
        await interaction.reply({
          content: 'You can only interact with buttons on messages you requested.',
          ephemeral: true
        });
        return;
      }
      
      // 메시지 업데이트를 위해 응답 지연
      await interaction.deferUpdate();
      
      // 활성 위시리스트 뷰 가져오기 - 직접 getActiveView 사용
      const activeView = getActiveView(interaction.channelId, 'wishlist');
      if (!activeView) {
        await interaction.followUp({
          content: 'This wishlist view has expired. Please use the `cwl` command again.',
          ephemeral: true
        });
        return;
      }
      
      // 위시리스트 소유자 정보 가져오기
      let targetUser;
      try {
        targetUser = await interaction.client.users.fetch(targetUserId);
      } catch (error) {
        console.error('Error fetching target user:', error);
        await interaction.followUp({
          content: 'Could not fetch user information. Please try again.',
          ephemeral: true
        });
        return;
      }
      
      // 모든 위시리스트 아이템 가져오기
      const allItems = activeView.additionalData.allItems;
      const totalPages = Math.ceil(allItems.length / 10); // 페이지당 10개 아이템
      
      // 새 페이지 계산
      let newPage = currentPage;
      switch(action) {
        case 'first':
          newPage = 1;
          break;
        case 'prev':
          newPage = Math.max(1, currentPage - 1);
          break;
        case 'next':
          newPage = Math.min(totalPages, currentPage + 1);
          break;
        case 'last':
          newPage = totalPages;
          break;
      }
      
      // 현재 페이지의 아이템들
      const itemsPerPage = 10;
      const startIndex = (newPage - 1) * itemsPerPage;
      const endIndex = Math.min(startIndex + itemsPerPage, allItems.length);
      const displayList = allItems.slice(startIndex, endIndex);
      
      // 임베드 생성
      const embed = new EmbedBuilder()
        .setTitle(`${targetUser.username}'s Wishlist`)
        .setColor('#FF69B4')
        .setDescription(`${targetUser.username} has ${allItems.length} card${allItems.length > 1 ? 's' : ''} in their wishlist.\nSorted by popularity (number of users who wishlisted each card).`)
        .setFooter({ text: `Page ${newPage}/${totalPages} • Type a number (1-${displayList.length}) to view card details` })
        .setTimestamp();
      
      if (targetUser.displayAvatarURL) {
        embed.setThumbnail(targetUser.displayAvatarURL());
      }
      
      // 카드 목록 표시 - 주어진 포맷으로 수정
      const cardsText = displayList.map((item, index) => {
        // 시리즈 정보 추가
        const seriesInfo = item.seriesName ? ` - ${item.seriesName}` : '';
        
        // 위시리스트 수를 재계산하여 가장 정확한 값 확보
        const wishlistCount = getWishlistUsers(item.cardName, item.seriesName).length;
        
        return `**${index + 1}.** \`[ 🤍 ${wishlistCount} ]\` **${item.cardName}**${seriesInfo}`;
      }).join('\n');
      
      embed.addFields({ name: 'Cards', value: cardsText || 'No cards' });
      
      // 페이지네이션 버튼 생성
      const paginationRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`wl_first_${targetUserId}_${newPage}_${interaction.user.id}`)
            .setLabel('<<')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(newPage === 1),
          new ButtonBuilder()
            .setCustomId(`wl_prev_${targetUserId}_${newPage}_${interaction.user.id}`)
            .setLabel('<')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(newPage === 1),
          new ButtonBuilder()
            .setCustomId(`wl_next_${targetUserId}_${newPage}_${interaction.user.id}`)
            .setLabel('>')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(newPage === totalPages),
          new ButtonBuilder()
            .setCustomId(`wl_last_${targetUserId}_${newPage}_${interaction.user.id}`)
            .setLabel('>>')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(newPage === totalPages)
        );
      
      // 메시지 업데이트
      await interaction.editReply({
        embeds: [embed],
        components: [paginationRow]
      });
      
      // 활성 위시리스트 뷰 업데이트
      registerActiveView(
        interaction.channelId,
        interaction.message.id,
        interaction.user.id,
        'wishlist',       // 뷰 타입
        displayList,      // 현재 페이지 아이템들
        Date.now() + (2 * 60 * 1000), // 2분 유효
        {                 // 추가 데이터
          allItems: allItems,
          currentPage: newPage,
          totalPages: totalPages,
          targetUserId: targetUserId // 위시리스트 소유자 ID
        }
      );
      
      // 타이머 갱신
      refreshTimer(interaction.channelId, interaction.message.id, 2 * 60 * 1000);
      
    } catch (error) {
      console.error('Error handling wishlist button:', error);
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: 'An error occurred while navigating the wishlist.',
            ephemeral: true
          });
        } else {
          await interaction.followUp({
            content: 'An error occurred while navigating the wishlist.',
            ephemeral: true
          });
        }
      } catch (replyError) {
        console.error('Error sending error message:', replyError);
      }
    }
  }
}

module.exports = {
  handleWishlistButtonInteraction
};