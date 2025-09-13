// src/commands/cardInfoPages.js
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, EmbedBuilder } = require('discord.js');
const { createSingleCardImage } = require('../utils/imageUtils');
const { getCardStats, getCardOwnerRankingCached, getSeriesOwnerRankingCached, getBurnedCardStats } = require('../database/cardStats');
const { ITEM_DISPLAY_NAMES } = require('../database/itemTypes');

/**
 * 카드 정보 페이지 생성 (기본 정보)
 */
async function createCardInfoPage(card, currentUserId) {
  try {
    // 카드 이미지 생성
    const cardImage = await createSingleCardImage(card);
    const attachment = new AttachmentBuilder(cardImage, { name: 'card.png' });
    
    // 변형별 카운트 계산
    const cardId = card.id || card.cardId;
    const cardStat = getCardStats(cardId);
    const burnedCardStat = getBurnedCardStats(cardId);

    // 위시리스트 사용자 수 가져오기
    const { getWishlistUsers } = require('../database/wishlistDatabase');
    // 카드 이름과 시리즈 이름을 사용하여 위시리스트 사용자 가져오기
    const wishlistUsers = getWishlistUsers(card.name, card.series);
    const wishlistCount = wishlistUsers.length;

    // 시리즈 ID 가져오기
    const seriesId = card.seriesId || 
      (card.series ? card.series.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, '') : null);
    
    // 변형별 정보 텍스트 생성
    let variantsText = '**Variants in circulation:**\n';
    const variants = cardStat.variants || {};
    
    if (Object.keys(variants).length > 0) {
      Object.entries(variants).forEach(([variant, count]) => {
        const burnedVariantCount = burnedCardStat.variants && 
                                  burnedCardStat.variants[variant] && 
                                  burnedCardStat.variants[variant].total || 0;
        
        const currentCount = Math.max(0, count - burnedVariantCount);
        
        variantsText += `${variant}: \`${currentCount} cards\`\n`;
      });
    } else {
      variantsText += `v1: \`0 cards\`\n`;
    }
    
    // 통계 계산
    const totalCreated = cardStat.total || 0;
    const totalBurned = burnedCardStat.total || 0;
    const inCollections = Math.max(0, totalCreated - totalBurned);
    
    // 위시리스트 정보를 포함한 임베드 생성
    const embed = new EmbedBuilder()
      .setTitle(`${card.name}`)
      .setDescription(`Series: **${card.series}**
        Card ID: \`${cardId}\`
  
        **Card Circulation Stats:**
        • Total Created: \`${totalCreated} cards\`
        • Total Burned: \`${totalBurned} cards\`
        • In Collections: \`${inCollections} cards\`
        • On Wishlists: \`${wishlistCount} users\`
  
        ${variantsText}`)
      .setColor('#303136')
      .setThumbnail('attachment://card.png')
      .setFooter({ text: 'Information Page | Expires in 2 minutes' });
    
    return { embed, attachment };
  } catch (error) {
    console.error('Error creating card info page:', error);
    throw error;
  }
}

/**
 * 카드 랭킹 페이지 생성
 */
async function createCardRankingPage(card, currentUserId) {
  try {
    // 카드 이미지 생성
    const cardImage = await createSingleCardImage(card);
    const attachment = new AttachmentBuilder(cardImage, { name: 'card.png' });
    
    const cardId = card.id || card.cardId;
    
    // 시리즈 ID 가져오기
    const seriesId = card.seriesId || 
      (card.series ? card.series.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, '') : null);
    
    // 소유자 랭킹 가져오기 (최대 10위까지)
    const ownerRanking = getCardOwnerRankingCached(cardId);
    
    let ownerRankingText = '**Top Card Collectors:**\n';
    if (ownerRanking.length > 0) {
      ownerRanking.slice(0, 10).forEach(([userId, count], index) => {
        ownerRankingText += `${index + 1}. <@${userId}> (${count}pts)\n`;
      });
      
      // 현재 사용자의 랭킹 추가 (명령어 실행자)
      if (currentUserId) {
        const userIndex = ownerRanking.findIndex(([userId]) => userId === currentUserId);
        if (userIndex !== -1) {
          const [, userCount] = ownerRanking[userIndex];
          if (userIndex >= 10) { // 10위 밖이면 별도 표시
            ownerRankingText += `\nYour Rank: #${userIndex + 1} (${userCount}pts)`;
          }
        } else {
          ownerRankingText += '\nYour Rank: Not collected yet';
        }
      }
    } else {
      ownerRankingText += 'No collectors yet';
    }
    
    // 시리즈 랭킹
    let seriesRankingText = `**${card.series} Series Collectors:**\n`;
    if (seriesId) {
      const seriesRanking = getSeriesOwnerRankingCached(seriesId);
      
      if (seriesRanking.length > 0) {
        seriesRanking.slice(0, 10).forEach(([userId, count], index) => {
          seriesRankingText += `${index + 1}. <@${userId}> (${count}pts)\n`;
        });
        
        // 현재 사용자의 시리즈 랭킹 추가
        if (currentUserId) {
          const userSeriesIndex = seriesRanking.findIndex(([userId]) => userId === currentUserId);
          if (userSeriesIndex !== -1) {
            const [, userSeriesCount] = seriesRanking[userSeriesIndex];
            if (userSeriesIndex >= 10) { // 10위 밖이면 별도 표시
              seriesRankingText += `\nYour Series Rank: #${userSeriesIndex + 1} (${userSeriesCount}pts)`;
            }
          } else {
            seriesRankingText += '\nYour Series Rank: Not collected yet';
          }
        }
      } else {
        seriesRankingText += 'No collectors yet';
      }
    } else {
      seriesRankingText += 'Series information not available';
    }
    
    // 임베드 생성
    const embed = new EmbedBuilder()
      .setTitle(`${card.name}`)
      .setDescription(`Series: **${card.series}**
        Card ID: \`${cardId}\`
        
        ${ownerRankingText}
        
        ${seriesRankingText}`)
      .setColor('#303136')
      .setThumbnail('attachment://card.png')
      .setFooter({ text: 'Rankings Page | Expires in 2 minutes' });
    
    return { embed, attachment };
  } catch (error) {
    console.error('Error creating card ranking page:', error);
    throw error;
  }
}

/**
 * 카드 변형 페이지 생성
 */
async function createCardVariantsPage(card) {
  try {
    // 카드 이미지 생성
    const cardImage = await createSingleCardImage(card);
    const attachment = new AttachmentBuilder(cardImage, { name: 'card.png' });
    
    const cardId = card.id || card.cardId;
    const cardStat = getCardStats(cardId);
    const burnedCardStat = getBurnedCardStats(cardId);
    
    // 변형별 상세 정보 표시
    let variantsDetailText = '';
    const variants = cardStat.variants || {};
    
    if (Object.keys(variants).length > 0) {
      Object.entries(variants).forEach(([variant, count]) => {
        const burnedVariantCount = burnedCardStat.variants && 
                                  burnedCardStat.variants[variant] && 
                                  burnedCardStat.variants[variant].total || 0;
        
        const currentCount = Math.max(0, count - burnedVariantCount);
        
        // 변형별 자세한 통계 추가
        variantsDetailText += `**${variant}**\n`;
        variantsDetailText += `• In Circulation: \`${currentCount} cards\`\n`;
        variantsDetailText += `• Total Created: \`${count} cards\`\n`;
        variantsDetailText += `• Total Burned: \`${burnedVariantCount} cards\`\n\n`;
      });
    } else {
      variantsDetailText = 'No variant information available';
    }
    
    // 임베드 생성
    const embed = new EmbedBuilder()
      .setTitle(`${card.name} - Variants`)
      .setDescription(`Series: **${card.series}**
        Card ID: \`${cardId}\`
        
        ${variantsDetailText}`)
      .setColor('#303136')
      .setThumbnail('attachment://card.png')
      .setFooter({ text: 'Variants Page | Expires in 2 minutes' });
    
    return { embed, attachment };
  } catch (error) {
    console.error('Error creating card variants page:', error);
    throw error;
  }
}

/**
 * 카드 상세 정보 페이지를 업데이트
 */
async function updateCardInfoPage(interaction, card, page = 'info') {
  try {
    let content;
    const userId = interaction.user.id;
    const cardId = card.id || card.cardId;
    
    // series 페이지는 특별 처리 - 시리즈 목록 명령어와 동일하게 처리
    if (page === 'series' && card.series) {
      // 시리즈 페이지 처리는 그대로 유지
      const { createSeriesEmbed } = require('./seriesListCommand');
      const seriesResult = await createSeriesEmbed(card.series, userId, 0);
      
      if (seriesResult.error) {
        await interaction.reply({
          content: seriesResult.message,
          ephemeral: true
        });
        return false;
      }
      
      // 시리즈 목록 표시 (csl 명령어와 동일한 형태)
      await interaction.update({
        embeds: [seriesResult.embed],
        files: [], // 첨부 파일 제거
        components: seriesResult.rows // rows 배열 사용
      });
      
      // 활성 시리즈 뷰 등록 - 이 부분은 변경하지 않음
      const { registerActiveSeriesView, removeActiveSeriesView } = require('../utils/activeViews');
      removeActiveSeriesView(interaction.channel.id);
      
      const expiresAt = Date.now() + (2 * 60 * 1000);
      registerActiveSeriesView(
        interaction.channel.id,
        interaction.message.id,
        userId,
        seriesResult.seriesName,
        seriesResult.pageCards.map(card => ({
          id: card.id, 
          name: card.name, 
          collected: card.collected
        })),
        expiresAt
      );
      
      // 2분 후 버튼 비활성화 부분은 그대로 유지
      setTimeout(() => {
        if (seriesResult.rows && seriesResult.rows.length > 0) {
          const disabledRows = seriesResult.rows.map(row => {
            const newRow = new ActionRowBuilder();
            
            row.components.forEach(component => {
              newRow.addComponents(
                ButtonBuilder.from(component).setDisabled(true)
              );
            });
            
            return newRow;
          });
          
          interaction.message.edit({
            embeds: [
              EmbedBuilder.from(seriesResult.embed).setDescription(
                `Collection Progress: **${seriesResult.collectionStatus.collected}/${seriesResult.collectionStatus.total}** cards\n\n${seriesResult.embed.data.description.split('\n\n')[1]}\n\n*This view has expired. Use \`csl ${seriesResult.seriesName}\` again to view card details.*`
              )
            ],
            components: disabledRows
          }).catch(err => console.error('Failed to disable series buttons:', err));
        }
      }, 2 * 60 * 1000);
      
      return true;
    }
    
    // 기존 페이지 처리 (info, ranking, variants)
    switch (page) {
      case 'info':
        content = await createCardInfoPage(card, userId);
        break;
      case 'ranking':
        content = await createCardRankingPage(card, userId);
        break;
      case 'variants':
        content = await createCardVariantsPage(card);
        break;
      default:
        content = await createCardInfoPage(card, userId);
    }
    
    // 네비게이션 버튼 생성 - 첫 번째 행
    const navigationRow = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`card_page_info_${cardId}`)
          .setLabel('Information')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(page === 'info'),
        new ButtonBuilder()
          .setCustomId(`card_page_ranking_${cardId}`)
          .setLabel('Rankings')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(page === 'ranking'),
        new ButtonBuilder()
          .setCustomId(`card_page_variants_${cardId}`)
          .setLabel('Variants')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(page === 'variants'),
        new ButtonBuilder()
          .setCustomId(`card_page_series_${cardId}`)
          .setLabel('Series')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(false) // 시리즈 버튼은 항상 활성화
      );
    
    // 위시리스트 버튼 - 두 번째 행
    // 위시리스트 상태 확인 - 카드 이름과 시리즈 이름 사용
    const { isUserInWishlist } = require('../database/wishlistDatabase');
    const isInWishlist = isUserInWishlist(userId, card.name, card.series);
    
    const wishlistRow = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`wishlist_toggle_${cardId}_${encodeURIComponent(card.name)}`)
          .setLabel(isInWishlist ? '❤️ Wishlist' : '🤍 Wishlist')
          .setStyle(isInWishlist ? ButtonStyle.Danger : ButtonStyle.Secondary)
          .setDisabled(false)
      );
    
    // 메시지 업데이트 - 두 개의 버튼 행 사용
    await interaction.update({ 
      embeds: [content.embed], 
      files: [content.attachment], 
      components: [navigationRow, wishlistRow]  // 두 개의 버튼 행 사용
    });
    
    return true;
  } catch (error) {
    console.error('Error updating card info page:', error);
    await interaction.reply({ 
      content: 'An error occurred while updating the card information.',
      ephemeral: true
    });
    return false;
  }
}

/**
 * 카드 레벨업 페이지 생성
 */
async function showLevelUpPage(interaction, cardId) {
  try {
    // 먼저 응답 지연을 등록합니다 - 3초 제한 문제 해결
    await interaction.deferUpdate();

    const userId = interaction.user.id;
    
    // 대상 카드 찾기
    const { findUserCard, getUserCards } = require('../database/cardModel');
    const targetCard = findUserCard(userId, cardId);
    
    if (!targetCard) {
      await interaction.reply({
        content: 'Card not found in your collection.',
        ephemeral: true
      });
      return;
    }
    
    // 같은 이름의 카드 중 레벨업의 재료로 사용 가능한 카드 찾기
    const userCards = getUserCards(userId);
    const materialCards = userCards.filter(card => 
      card.name === targetCard.name && // 같은 이름의 카드만
      card.uniqueId !== targetCard.uniqueId && // 대상 카드 자신은 제외
      card.type !== 'resource' // 자원 카드는 제외
    );
    
    if (materialCards.length === 0) {
      await interaction.reply({
        content: `You don't have any duplicate cards of "${targetCard.name}" to use as material for level up.`,
        ephemeral: true
      });
      return;
    }
    
    // 레벨업 비용 계산
    const creditCost = 1000 * targetCard.level;
    const fragmentCost = 25 * targetCard.level;
    
    // 유저 데이터 가져오기
    const { userData, initUserData } = require('../database/userData');
    const userDataObj = initUserData(userId);
    
    // 카드 이미지 가져오기
    const uniqueId = targetCard.uniqueId || targetCard.dropId || 'unknown';
    const variant = targetCard.variant || 'v1';
    const type = targetCard.type || 'normal';
    const cacheKey = `cardInfo_${uniqueId}_${variant}_${type}`;
    
    const { getCachedImage, createSingleCardImage } = require('../utils/imageUtils');
    const cardImage = await getCachedImage(cacheKey, async () => createSingleCardImage(targetCard));
    const attachment = new AttachmentBuilder(cardImage, { name: 'card_thumb.png' });
    
    // 재료 카드 선택 드롭다운 메뉴 생성
    const { StringSelectMenuBuilder } = require('discord.js');
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`levelup_select_${targetCard.uniqueId}`)
      .setPlaceholder('Select a card to use as material')
      .setMinValues(1)
      .setMaxValues(1);
    
    // 선택 옵션 추가
    materialCards.slice(0, 25).forEach(card => {
      selectMenu.addOptions({
        label: `${card.name} (G•${card.gValue || 'N/A'})`,
        description: `ID: ${card.uniqueId.substring(0, 10)}... Level: ${card.level || 1}`,
        value: card.uniqueId
      });
    });
    
    // 선택 메뉴를 포함한 ActionRow 생성
    const row = new ActionRowBuilder()
      .addComponents(selectMenu);
    
    // 돌아가기 버튼을 포함한 두 번째 ActionRow 생성
    const backRow = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`card_page_info_${targetCard.uniqueId}`)
          .setLabel('Back to Information')
          .setStyle(ButtonStyle.Secondary)
      );
    
    // 레벨업 임베드 생성 - 썸네일로 카드 이미지 추가
    const embed = new EmbedBuilder()
      .setTitle(`Level Up: ${targetCard.name}`)
      .setColor('#FFA500') // 주황색 계열
      .setThumbnail('attachment://card_thumb.png') // 카드 이미지를 썸네일로 표시
      .addFields(
        { name: 'Target Card', value: `**${targetCard.name}** (Level ${targetCard.level})\nID: \`${targetCard.uniqueId}\`\nVariant: ${targetCard.variant || 'v1'}\nG•${targetCard.gValue || 'N/A'}`, inline: true },
        { name: 'Cost', value: `${creditCost} ${ITEM_DISPLAY_NAMES[ITEM_TYPES.CREDIT]}\n${fragmentCost} ${ITEM_DISPLAY_NAMES[ITEM_TYPES.CARD_FRAGMENT]}`, inline: true },
        { name: 'Your Balance', value: `${userDataObj.inventory[ITEM_TYPES.CREDIT]} ${ITEM_DISPLAY_NAMES[ITEM_TYPES.CREDIT]}\n${userDataObj.inventory[ITEM_TYPES.CARD_FRAGMENT]} ${ITEM_DISPLAY_NAMES[ITEM_TYPES.CARD_FRAGMENT]}`, inline: true }
      )
      .setDescription('Select a card to use as material for level up. This will consume the selected card and resources. This action cannot be undone.')
      .setFooter({ text: 'Select a card from the dropdown menu' });
    
    // 불충분한 자원이 있으면 경고 메시지 추가
    if (userDataObj.inventory[ITEM_TYPES.CREDIT] < creditCost || userDataObj.inventory[ITEM_TYPES.CARD_FRAGMENT] < fragmentCost) {
      embed.setDescription('⚠️ **Warning:** You do not have enough resources for this level up!\n\nSelect a card to use as material for level up. This will consume the selected card and resources. This action cannot be undone.');
      embed.setColor('#FF0000'); // 빨간색으로 변경
    }
    
    // 드롭다운 메뉴와 임베드로 메시지 업데이트
    await interaction.editReply({
      embeds: [embed],
      files: [attachment], // 썸네일용 이미지 첨부
      components: [row, backRow]
    });
    
  } catch (error) {
    console.error('Error showing level up page:', error);
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({
          content: 'An error occurred while preparing the level up page.',
          ephemeral: true
        });
      } else {
        await interaction.reply({
          content: 'An error occurred while preparing the level up page.',
          ephemeral: true
        });
      }
    } catch (replyError) {
      console.error('Error sending error message:', replyError);
    }
  }
}

module.exports = {
  createCardInfoPage,
  createCardRankingPage,
  createCardVariantsPage,
  updateCardInfoPage,
  showLevelUpPage
};