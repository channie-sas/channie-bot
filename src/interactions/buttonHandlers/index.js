// src/interactions/buttonHandlers/index.js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const cardButtons = require('./cardButtons');
const collectionButtons = require('./collectionButtons');
const navigationButtons = require('./navigationButtons');
const transferButtons = require('./transferButtons');

/**
 * 버튼 인터랙션 핸들러
 * @param {Object} interaction - 상호작용 객체
 */
async function handleButtonInteraction(interaction) {
  if (!interaction.isButton()) return;
  
  const customId = interaction.customId;

  // 카드 추가 리스트 페이지네이션 버튼 처리
  if (customId.startsWith('caddlist_')) {
    const { handleMissingCardsListPagination } = require('../../commands/cardAddCommand');
    await handleMissingCardsListPagination(interaction);
    return;
  }

  if (customId.startsWith('approval_clear_')) {
    const { handleApprovalClearConfirmation } = require('../../commands/adminCommands');
    await handleApprovalClearConfirmation(interaction);
    return;
  }

  // 카드 추가 승인/거절 버튼 처리 - handleButtonInteraction 함수의 맨 앞에 추가
  if (customId.startsWith('card_approve_') || customId.startsWith('card_reject_')) {
    console.log('[BUTTON DEBUG] Card approval button detected:', customId);
    try {
      const { handleAdminApproval } = require('../../commands/cardAddCommand');
      const isApproval = customId.startsWith('card_approve_');
      console.log('[BUTTON DEBUG] Processing approval:', isApproval);
      await handleAdminApproval(interaction, isApproval);
      return;
    } catch (error) {
      console.error('[BUTTON ERROR] Error handling card approval button:', error);
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: '❌ An error occurred while processing the approval.',
            ephemeral: true
          });
        } else {
          await interaction.followUp({
            content: '❌ An error occurred while processing the approval.',
            ephemeral: true
          });
        }
      } catch (replyError) {
        console.error('[BUTTON ERROR] Could not reply with error message:', replyError);
      }
      return;
    }
  }

  // 위시리스트 버튼 처리 (가장 위에 위치시켜 먼저 처리되도록 함)
  if (customId.startsWith('wishlist_toggle_')) {
    return await cardButtons.handleCardInteraction(interaction);
  }

  // 시리즈 위시리스트 토글 버튼 처리
  if (customId.startsWith('series_wishlist_toggle:')) {
    console.log('Series wishlist toggle button detected:', customId);
    return await cardButtons.handleCardInteraction(interaction);
  }

  // 위시리스트 페이지네이션 버튼
  else if (customId.startsWith('wl_')) {
    const { handleWishlistButtonInteraction } = require('./wishlistButtons');
    await handleWishlistButtonInteraction(interaction);
  }

  // 낚시 액션 버튼 처리
  if (customId.startsWith('fishing_action_')) {
    const { handleFishingAction } = require('../../commands/fishingCommand');
    await handleFishingAction(interaction);
    return;
  }

  // 물고기 컬렉션 페이지네이션 버튼 처리
  if (customId.startsWith('fcf_')) {
    const { handleFishCollectionPagination } = require('./fishCollectionButtons');
    await handleFishCollectionPagination(interaction);
    return;
  }

  // 웨어울프 게임 버튼 처리
  if (customId.startsWith('werewolf_')) {
    try {
        const { handleWerewolfButtonInteraction } = require('../../commands/werewolfGame');
        return await handleWerewolfButtonInteraction(interaction);
    } catch (error) {
        console.error('Error handling werewolf button interaction:', error);
        
        try {
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'An error occurred while processing your werewolf game action.',
                    ephemeral: true
                });
            } else {
                await interaction.followUp({
                    content: 'An error occurred while processing your werewolf game action.',
                    ephemeral: true
                });
            }
        } catch (replyError) {
            console.error('Error sending werewolf error reply:', replyError);
        }
        return;
    }
}
  
  // 카드 관련 버튼
  if (customId.startsWith('card_page_') || 
      customId.startsWith('burn_') ||
      customId.startsWith('levelup_') ||
      customId.startsWith('select:') ||
      customId.startsWith('card_first:') || 
      customId.startsWith('card_prev:') || 
      customId.startsWith('card_next:') || 
      customId.startsWith('card_last:')) {
    return await cardButtons.handleCardInteraction(interaction);
  }
  
  // 컬렉션/시리즈 관련 버튼
  if (customId.startsWith('cc_') || 
      customId.startsWith('series_')) {
    return await collectionButtons.handleCollectionInteraction(interaction);
  }
  
  // 네비게이션 버튼
  if (customId.startsWith('nav_')) {
    return await navigationButtons.handleNavigationInteraction(interaction);
  }
  
  // 카드 전송 관련 버튼
  if (customId.startsWith('transfer_')) {
    return await transferButtons.handleTransferInteraction(interaction);
  }
  
  if (customId.startsWith('activitylog_')) {
    const { handleActivityLogButton } = require('./cardButtons');
    await handleActivityLogButton(interaction);
    return;
  }
  
  console.log(`처리되지 않은 버튼 인터랙션: ${customId}`);
}



/**
 * 스킬 버튼 핸들러 함수 (원래 handleSkillButton)
 * @param {Object} interaction - 상호작용 객체
 * @param {string} skillType - 스킬 타입 ('mining' 또는 'gathering')
 * @param {string} cardId - 카드 ID
 */
async function handleSkillButton(interaction, skillType, cardId) {
  try {
    // 응답 지연 등록 (시간 초과 방지)
    await interaction.deferReply({ ephemeral: true });

    // 사용자 ID 가져오기
    const userId = interaction.user.id;
    
    // 카드 확인
    const { findUserCard, getUserCards } = require('../../database/cardModel');
    const skillCard = findUserCard(userId, cardId);
    
    if (!skillCard) {
      return interaction.editReply({
        content: 'Card not found in your collection.'
      });
    }
    
    // 카드 쿨다운 재확인 (버튼 상태가 변경되었을 수 있음)
    const { getCardCooldown } = require('../../database/userData');
    const cardCooldown = getCardCooldown(userId, cardId);
    
    if (cardCooldown > 0) {
      const cooldownMinutes = Math.ceil(cardCooldown / 60000);
      return interaction.editReply({
        content: `This card is on cooldown. It will be available in ${cooldownMinutes} minutes.`
      });
    }
    
    // 행동력 확인
    const { getActionPointInfo, initUserData } = require('../../database/userData');
    const actionInfo = getActionPointInfo(userId);
    
    if (actionInfo.current <= 0) {
      const recoveryTime = new Date(actionInfo.recoveryTime);
      return interaction.editReply({
        content: `You don't have enough action points. Your action points will recover at ${recoveryTime.toLocaleTimeString()}.`
      });
    }

    // 현재 작업 중인지 확인 (채광인 경우)
    if (skillType === 'mining') {
      const userData = initUserData(userId);
      if (userData.workingCards && userData.workingCards.mining) {
        return interaction.editReply({
          content: "You already have a mining operation in progress. Use `cact` to check status."
        });
      }
    }
    
    // 적절한 자원 카드 찾기
    const userCards = getUserCards(userId);
    const resourceCards = userCards.filter(card => 
      card.type === 'resource' && 
      card.subType === skillType // mining 카드면 mining 자원, gathering 카드면 gathering 자원
    );
    
    if (resourceCards.length === 0) {
      return interaction.editReply({
        content: skillType === 'mining' 
          ? 'You don\'t have any meteorite cards for mining.'
          : 'You don\'t have any forest cards for gathering.'
      });
    }
    
    // 선택 메뉴 생성
    const { StringSelectMenuBuilder } = require('discord.js');
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`resource_select_${skillType}_${cardId}`)
      .setPlaceholder(skillType === 'mining' ? 'Select a meteorite to mine' : 'Select a forest to gather from')
      .setMinValues(1)
      .setMaxValues(1);
    
    // 선택 옵션 추가
    resourceCards.forEach(card => {
      // 자원 구성 설명 추가
      let description = `ID: ${card.uniqueId.substring(0, 10)}...`;
      if (card.resourceComposition) {
        const mainResource = Object.entries(card.resourceComposition)
          .sort(([, a], [, b]) => b - a)[0]; // 가장 비율이 높은 자원
        if (mainResource) {
          description = `Main: ${mainResource[0]} ${mainResource[1]}%, Value: ${card.resourceValue}`;
        }
      }
      
      selectMenu.addOptions({
        label: `${card.name} (Value: ${card.resourceValue})`,
        description: description,
        value: card.uniqueId
      });
    });
    
    // 선택 메뉴를 포함한 ActionRow 생성
    const row = new ActionRowBuilder()
      .addComponents(selectMenu);
    
    // 임베드 생성
    const { EmbedBuilder } = require('discord.js');
    const embed = new EmbedBuilder()
      .setTitle(skillType === 'mining' ? 'Mining Action' : 'Gathering Action')
      .setColor('#4169E1')
      .setDescription(
        `**${skillCard.name}** (${skillCard.skillType}) - G${skillCard.gValue || 'N/A'}\n` +
        `Select a ${skillType === 'mining' ? 'meteorite' : 'forest'} to use your skill on.`
      );
    
    if (skillCard.skillStats) {
      const statsText = Object.entries(skillCard.skillStats)
        .map(([key, value]) => `• ${key.replace(/([A-Z])/g, ' $1').trim()}: ${value}`)
        .join('\n');
      
      embed.addFields({ name: 'Skill Stats', value: statsText });
    }
    
    // 응답 업데이트
    await interaction.editReply({
      embeds: [embed],
      components: [row]
    });
    
  } catch (error) {
    console.error('Error handling skill button:', error);
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: 'An error occurred while processing the skill action.',
          ephemeral: true
        });
      } else {
        await interaction.editReply({
          content: 'An error occurred while processing the skill action.'
        });
      }
    } catch (replyError) {
      console.error('Failed to send error response:', replyError);
    }
  }
}

module.exports = {
  handleButtonInteraction,
  disableCardButtons: cardButtons.disableCardButtons
};