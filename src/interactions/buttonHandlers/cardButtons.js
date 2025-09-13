// src/interactions/buttonHandlers/cardButtons.js
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { refreshTimer } = require('../../utils/activeViews');

/**
 * 카드 관련 버튼 핸들러
 * @param {Object} interaction - 상호작용 객체
 */
async function handleCardInteraction(interaction) {
  const customId = interaction.customId;

  // 시리즈 위시리스트 토글 버튼 처리
  if (customId.startsWith('series_wishlist_toggle:')) {
    try {
      const seriesName = customId.split(':')[1];
      console.log(`Processing wishlist toggle for series: ${seriesName}`);
      
      // 위시리스트 토글 함수 호출
      const { toggleSeriesWishlist, getSeriesWishlistStatus, isUserInWishlist } = require('../../database/wishlistDatabase');
      
      // 현재 상태 확인
      const currentStatus = getSeriesWishlistStatus(interaction.user.id, seriesName);
      
      // 현재 상태에 따라 toggle 동작 결정
      const result = toggleSeriesWishlist(interaction.user.id, seriesName, !currentStatus.allInWishlist);
      
      // 상호작용 응답 지연
      await interaction.deferUpdate();
      
      // 시리즈 정보와 카드 컬렉션 상태 다시 가져오기
      const { getSeriesByName, getCollectionStatus } = require('../../database/cardSeries');
      const series = getSeriesByName(seriesName);
      
      if (!series) {
        // 시리즈를 찾을 수 없는 경우
        await interaction.followUp({
          content: 'Error: Series not found.',
          ephemeral: true
        });
        return;
      }
      
      // 사용자의 수집 현황 가져오기
      const collectionStatus = getCollectionStatus(series.name, interaction.user.id);
      
      // 새로운 위시리스트 상태 확인
      const newStatus = getSeriesWishlistStatus(interaction.user.id, seriesName);
      
      // 페이지 정보 확인 (현재 페이지)
      const footerText = interaction.message.embeds[0].footer.text;
      const pageMatch = footerText.match(/Page (\d+)\/(\d+)/);
      const currentPage = pageMatch ? parseInt(pageMatch[1]) - 1 : 0;
      
      // 페이지네이션 설정
      const pageSize = 10;
      const totalPages = Math.ceil(collectionStatus.cardStatus.length / pageSize);
      const validPage = Math.max(0, Math.min(currentPage, totalPages - 1));
      const startIdx = validPage * pageSize;
      const endIdx = Math.min(startIdx + pageSize, collectionStatus.cardStatus.length);
      const pageCards = collectionStatus.cardStatus.slice(startIdx, endIdx);
      
      // 위시리스트 상태 텍스트
      let wishlistText = '';
      if (newStatus.allInWishlist) {
        wishlistText = '❤️ All cards in this series are in your wishlist';
      } else if (newStatus.partiallyInWishlist) {
        wishlistText = `🤍 ${newStatus.count}/${newStatus.total} cards in this series are in your wishlist`;
      } else {
        wishlistText = '🤍 No cards in this series are in your wishlist';
      }
      
      // 임베드 복제 및 업데이트
      const embed = EmbedBuilder.from(interaction.message.embeds[0]);
      embed.setFooter({ text: `Page ${validPage + 1}/${totalPages} • ${wishlistText} • Will expire in 2 minutes` });
      
      // 카드 목록 업데이트 - seriesListCommand.js와 동일한 방식으로
      let cardList = '';
      pageCards.forEach((card, index) => {
        // 수집 여부에 따라 체크/엑스 이모지 표시
        const icon = card.collected ? '✅' : '❌';
        
        // 위시리스트 여부 즉시 확인 - 최신 상태 반영
        const cardInWishlist = isUserInWishlist(interaction.user.id, card.name, series.name);
        const wishlistIcon = cardInWishlist ? '❤️' : '';
        
        cardList += `**${index + 1}.** ${icon} ${card.name} ${wishlistIcon}\n`;
      });
      
      // Fields 업데이트
      if (embed.data.fields && embed.data.fields.length > 0) {
        const cardField = embed.data.fields.find(field => field.name === 'Cards');
        if (cardField) {
          cardField.value = cardList;
        }
      }
      
      // 버튼 업데이트
      // 페이지네이션 버튼 가져오기
      const paginationRow = ActionRowBuilder.from(interaction.message.components[0]);
      
      // 위시리스트 버튼 업데이트
      const wishlistRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(customId)
            .setLabel(newStatus.allInWishlist ? '❤️ Remove All from Wishlist' : '🤍 Add All to Wishlist')
            .setStyle(newStatus.allInWishlist ? ButtonStyle.Danger : ButtonStyle.Secondary)
            .setDisabled(false)
        );
      
      // 메시지 업데이트
      await interaction.editReply({
        embeds: [embed],
        components: [paginationRow, wishlistRow]
      });
      
      // 작업 결과 알림 - followUp으로 변경
      let responseMessage = '';
      if (result.added > 0 && result.removed === 0) {
        responseMessage = `✅ Added all ${result.added} cards from ${seriesName} series to your wishlist!`;
      } else if (result.removed > 0 && result.added === 0) {
        responseMessage = `❌ Removed all ${result.removed} cards from ${seriesName} series from your wishlist.`;
      } else {
        responseMessage = `Updated wishlist for ${seriesName} series: Added ${result.added}, Removed ${result.removed} cards.`;
      }
      
      await interaction.followUp({
        content: responseMessage,
        ephemeral: true
      });
    } catch (error) {
      console.error('Error handling series wishlist toggle:', error);
      console.error('Error stack:', error.stack);
      
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: `An error occurred while updating your wishlist: ${error.message}`,
            ephemeral: true
          });
        } else {
          await interaction.followUp({
            content: `An error occurred while updating your wishlist: ${error.message}`,
            ephemeral: true
          });
        }
      } catch (replyError) {
        console.error('Failed to send error message:', replyError);
      }
    }
    return;
  }

  // 위시리스트 토글 버튼 처리
  if (customId.startsWith('wishlist_toggle_')) {
    try {
      const parts = customId.split('_');
      // wishlist_toggle_cardId_cardName 형식에서 정보 추출
      // 최소 3개 부분으로 나누어져 있어야 함
      if (parts.length < 3) {
        console.error('Invalid wishlist toggle button ID format:', customId);
        await interaction.reply({
          content: 'Error processing wishlist action: Invalid button format',
          ephemeral: true
        });
        return;
      }
      
      // cardId는 항상 3번째 요소
      const cardId = parts[2];
      
      // cardName은 나머지 부분을 다시 합쳐서 사용 (언더스코어가 포함된 이름 처리)
      let cardName = parts.slice(3).join('_');
      // URL 인코딩되었을 수 있으므로 디코딩 시도
      try {
        cardName = decodeURIComponent(cardName);
      } catch (e) {
        // 디코딩 오류 무시하고 원래 값 사용
        console.log('Failed to decode card name:', cardName);
      }
      
      // 카드 시리즈 정보 가져오기
      const { getAllCards } = require('../../database/cardDatabase');
      const allCards = getAllCards();
      const card = allCards.find(c => (c.id || c.cardId) === cardId);
      const seriesName = card ? card.series : null;
      
      console.log(`Processing wishlist toggle for cardId=${cardId}, cardName=${cardName}, series=${seriesName}`);
      
      // 위시리스트에 추가/제거 - 카드 이름과 시리즈 이름 사용
      const { toggleWishlist, isUserInWishlist } = require('../../database/wishlistDatabase');
      const result = toggleWishlist(interaction.user.id, cardName, seriesName);
      
      // 현재 위시리스트 상태 확인
      const isInWishlist = isUserInWishlist(interaction.user.id, cardName, seriesName);
      
      // 기존 버튼 레이아웃 가져오기
      const components = interaction.message.components;
      
      if (components && components.length > 0) {
        // 첫 번째 행의 네비게이션 버튼들은 그대로 유지
        const navigationRow = ActionRowBuilder.from(components[0]);
        
        // 두 번째 행의 위시리스트 버튼만 업데이트
        const wishlistRow = new ActionRowBuilder();
        
        // 위시리스트 버튼이 두 번째 행에 있는 경우
        if (components.length > 1 && components[1].components.length > 0) {
          wishlistRow.addComponents(
            new ButtonBuilder()
              .setCustomId(customId)  // 원래 버튼의 ID 유지
              .setLabel(isInWishlist ? '❤️ Wishlist' : '🤍 Wishlist')
              .setStyle(isInWishlist ? ButtonStyle.Danger : ButtonStyle.Secondary)
              .setDisabled(false)
          );
        }
        
        // 임베드 업데이트 - 단, 썸네일 등 이미지 관련 속성은 그대로 유지
        const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0]);
        updatedEmbed.setFooter({ text: isInWishlist ? '❤️ This card is in your wishlist' : '🤍 Add this card to your wishlist' });
        
        // 중요: 업데이트할 때 files 필드를 포함하지 않음
        // 이렇게 하면 기존 이미지가 유지되고 새 이미지가 첨부되지 않음
        await interaction.update({
          embeds: [updatedEmbed],
          components: [navigationRow, wishlistRow],
          files: []
        });
        
        // 임시 응답 전송
        await interaction.followUp({
          content: isInWishlist 
            ? `✅ Added ${cardName} to your wishlist! You'll be notified when it drops.` 
            : `❌ Removed ${cardName} from your wishlist.`,
          ephemeral: true
        });
      }
    } catch (error) {
      console.error('Error handling wishlist toggle:', error);
      await interaction.reply({
        content: 'An error occurred while updating your wishlist.',
        ephemeral: true
      });
    }
    return;
  }
  
  // 카드 태우기 버튼 처리
  if (customId.startsWith('burn_confirm_') || customId.startsWith('burn_cancel_')) {
    const { handleBurnCardInteraction } = require('../../commands/burnCard');
    return await handleBurnCardInteraction(interaction);
  }
  
  // 카드 레벨업 확인 버튼 처리
  else if (customId.startsWith('levelup_confirm_')) {
    const parts = customId.split('_');
    console.log("Level up confirm parts:", parts);  // 디버깅을 위해 추가
    
    if (parts.length >= 4) {  // 최소 4개 부분이 있어야 함 (levelup, confirm, targetId, materialId)
      const targetCardId = parts[2];
      const materialCardId = parts[3];
      console.log(`Target card ID: ${targetCardId}, Material card ID: ${materialCardId}`);  // 디버깅 추가
      
      const { handleLevelUpConfirmation } = require('../../commands/cardLevelUp');
      return await handleLevelUpConfirmation(interaction, targetCardId, materialCardId);
    } else {
      return interaction.reply({
        content: "Invalid level up confirmation format. Please try again.",
        ephemeral: true
      });
    }
  }
  
  // 레벨업 취소 버튼 처리
  else if (customId === 'levelup_cancel') {
    // 모든 버튼 비활성화
    const disabledRow = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('levelup_cancelled')
          .setLabel('Level Up Cancelled')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true)
      );
    
    await interaction.update({
      content: interaction.message.content,
      embeds: interaction.message.embeds,
      components: [disabledRow]
    });
  }
  
  // 카드 선택 버튼 처리
  else if (customId.startsWith('select:')) {
    try {
      const parts = customId.split(':');
      
      if (parts.length < 3) {
        console.error(`Invalid customId format: ${customId}`);
        await interaction.reply({ content: 'Invalid selection. Please try again.', ephemeral: true });
        return;
      }
      
      const dropId = parts[1]; // 'drop_timestamp_userId' 형식
      const cardIndex = parseInt(parts[2]);
      
      console.log(`Processing card selection: dropId=${dropId}, cardIndex=${cardIndex}, user=${interaction.user.id}`);
      
      // grabCard 함수 호출 - 오류가 발생해도 처리를 시도
      const { grabCard } = require('../grabCard');
      await grabCard(interaction, interaction.user.id, dropId, cardIndex).catch(error => {
        console.error(`Error in grabCard for user ${interaction.user.id}:`, error);
        // 오류 발생 시 조용히 실패 - 이미 다른 사용자에 의해 처리되었을 수 있음
      });
    } catch (error) {
      console.error('Error processing card selection:', error);
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ 
            content: 'An error occurred while processing your selection.', 
            ephemeral: true 
          });
        }
      } catch (replyError) {
        console.error('Could not reply with error message:', replyError);
      }
    }
  }

  // 카드 정보 페이지 탭 버튼 처리
  else if (customId.startsWith('card_page_')) {
    try {
      const parts = customId.split('_');
      const page = parts[2]; // 'info', 'ranking', 'variants', 'series', 'levelup'
      const cardId = parts[3];
      
      // 활성 뷰 관련 함수들 가져오기
      const { 
        getActiveCardView, 
        registerActiveCardView, 
        refreshTimer 
      } = require('../../utils/activeViews');
      
      const channelId = interaction.channel.id;
      const messageId = interaction.message.id;
      
      // 레벨업 버튼 처리
      if (page === 'levelup') {
        // 레벨업 페이지 처리 함수 호출
        const { showLevelUpPage } = require('../../commands/showCardInfo');
        await showLevelUpPage(interaction, cardId);
        return;
      }
      
      // 카드 정보 가져오기
      const { getAllCards } = require('../../database/cardDatabase');
      const allCards = getAllCards();
      
      // 카드 ID로 카드 찾기
      const card = allCards.find(c => (c.id || c.cardId) === cardId);
      
      if (!card) {
        await interaction.reply({
          content: 'Card information not found or has been updated.',
          ephemeral: true
        });
        return;
      }
      
      // updateCardInfoPage 호출하여 페이지 업데이트
        const { updateCardInfoPage } = require('../../commands/showCardInfo');
        await updateCardInfoPage(interaction, card, page);
      
      // 타이머 갱신 - 이제 이 부분이 중요합니다
      refreshTimer(channelId, messageId, 2 * 60 * 1000); // 2분 갱신
      
    } catch (error) {
      console.error('Error handling card page tab:', error);
      await interaction.reply({
        content: 'An error occurred while updating the card page.',
        ephemeral: true
      });
    }
  }

  // 카드 리스트 페이지네이션 버튼 처리
  else if (customId.startsWith('card_first:') || 
           customId.startsWith('card_prev:') || 
           customId.startsWith('card_next:') || 
           customId.startsWith('card_last:')) {
    try {
      // 버튼 정보 파싱
      const parts = customId.split(':');
      const action = parts[0]; // 'card_first', 'card_prev', 'card_next', 'card_last'
      const searchTerm = parts[1];
      const currentPage = parseInt(parts[2]);
      
      // 필요한 모듈 가져오기
      const { getActiveCardView, removeActiveCardView, registerActiveCardView } = require('../../utils/activeViews');
      const { showCardListByName } = require('../../commands/showCardInfo');
      
      // 활성 뷰 가져오기
      const activeView = getActiveCardView(interaction.channel.id);
      
      if (!activeView) {
        await interaction.reply({ 
          content: 'The search results have expired. Please search again.', 
          ephemeral: true 
        });
        return;
      }
      
      // 다른 사용자의 버튼 클릭 방지
      if (activeView.userId !== interaction.user.id) {
        await interaction.reply({ 
          content: 'You can only navigate your own search results.', 
          ephemeral: true 
        });
        return;
      }
      
      // 페이지 계산
      let newPage = currentPage;
      if (action === 'card_first') {
        newPage = 0;
      } else if (action === 'card_prev') {
        newPage = Math.max(0, currentPage - 1);
      } else if (action === 'card_next') {
        newPage = currentPage + 1;
      } else if (action === 'card_last') {
        const pageSize = 10;
        const totalPages = Math.ceil(activeView.allCards.length / pageSize);
        newPage = totalPages - 1;
      }
      
      // 리스트 다시 표시
      await showCardListByName(
        { 
          reply: (content) => interaction.update(content),
          author: { id: interaction.user.id },
          channel: interaction.channel
        },
        searchTerm,
        activeView.allCards,
        newPage
      );
    } catch (error) {
      console.error('Error handling card list pagination:', error);
      await interaction.reply({ 
        content: 'An error occurred while navigating search results.', 
        ephemeral: true 
      });
    }
  }
}

/**
 * 카드 버튼 비활성화 처리 함수
 * @param {Object} channel - 채널 객체
 * @param {string} messageId - 메시지 ID
 * @returns {boolean} - 성공 여부
 */
async function disableCardButtons(channel, messageId) {
    try {
      // 메시지 찾기
      const message = await channel.messages.fetch(messageId).catch(() => null);
      if (!message) return false;
      
      // 버튼 비활성화 - 모든 버튼을 Secondary 스타일로 비활성화
      const disabledNavigationRow = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`card_page_info_expired`)
          .setLabel('Information')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId(`card_page_ranking_expired`)
          .setLabel('Rankings')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId(`card_page_variants_expired`)
          .setLabel('Variants')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId(`card_page_series_expired`)
          .setLabel('Series')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true)
      );
    
    // 두 번째 행 (위시리스트 버튼)
    const disabledWishlistRow = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`wishlist_toggle_expired`)
          .setLabel('Wishlist')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true)
      );
      
      // 기존 임베드 복사하되 썸네일 제거 및 만료 표시 추가
    const updatedEmbed = EmbedBuilder.from(message.embeds[0])
    .setThumbnail(null) // 썸네일 이미지 제거
    .setFooter({ text: 'Expired - Use clu command again to view' });
  
  // 이미지 파일 없이 메시지 업데이트
  await message.edit({ 
    embeds: [updatedEmbed], 
    components: [disabledNavigationRow, disabledWishlistRow],
    files: [] // 이미지 파일 제거
  });
  
  return true;
} catch (error) {
  console.error('Error disabling card buttons:', error);
  return false;
}
}

// 활동 로그 버튼 처리 함수
async function handleActivityLogButton(interaction) {
  try {
    const customId = interaction.customId;
    const logKey = customId.slice('activitylog_'.length);
    
    // 버튼을 누른 사용자 확인
    const [userId, timestamp] = logKey.split('_');
    if (interaction.user.id !== userId) {
      await interaction.reply({ 
        content: 'You can only view your own activity logs.', 
        ephemeral: true 
      });
      return;
    }
    
    // 저장된 로그 가져오기
    const { activityLogs } = require('./src/commands/actCommand');
    const detailedLog = activityLogs.get(logKey);
    
    if (!detailedLog) {
      await interaction.reply({
        content: "Sorry, the detailed log for this activity is no longer available.",
        ephemeral: true
      });
      return;
    }
    
    // 상세 로그 표시 (긴 로그는 분할)
    const maxLength = 1990; // 디스코드 메시지 제한
    if (detailedLog.length <= maxLength) {
      await interaction.reply({
        content: `\`\`\`${detailedLog}\`\`\``,
        ephemeral: true
      });
    } else {
      // 로그 분할
      const parts = [];
      for (let i = 0; i < detailedLog.length; i += maxLength) {
        parts.push(detailedLog.substring(i, i + maxLength));
      }
      
      // 첫 번째 부분 전송
      await interaction.reply({
        content: `\`\`\`${parts[0]}\`\`\``,
        ephemeral: true
      });
      
      // 나머지 부분 전송
      for (let i = 1; i < parts.length; i++) {
        await interaction.followUp({
          content: `\`\`\`${parts[i]}\`\`\``,
          ephemeral: true
        });
      }
    }
  } catch (error) {
    console.error('Error displaying activity log:', error);
    await interaction.reply({ 
      content: 'An error occurred while displaying the activity log.', 
      ephemeral: true 
    });
  }
}

module.exports = {
  handleCardInteraction,
  disableCardButtons,
  handleActivityLogButton
};