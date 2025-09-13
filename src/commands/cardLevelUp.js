// src/commands/cardLevelUp.js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { findUserCard, getUserCards, removeCardFromUser } = require('../database/cardModel'); // removeCardFromUser 추가
const { initUserData, saveUserDataThrottled } = require('../database/userData');
const { ITEM_TYPES, ITEM_DISPLAY_NAMES } = require('../database/itemTypes');
const { incrementBurnedCardStat, decrementCardStat, incrementCardStat } = require('../database/cardStats'); // 필요한 함수 import 추가

/**
 * 카드 레벨업 명령어 처리
 * @param {Object} message - 디스코드 메시지 객체
 * @param {Array} args - 명령어 인자 (targetCardId, materialCardId)
 */
async function handleCardLevelUpCommand(message, args) {
    const userId = message.author.id;
    
    // 인자 확인
    if (args.length < 2) {
      return message.reply("Usage: `clvl [target card id] [material card id]`");
    }
    
    const targetCardId = args[0];
    const materialCardId = args[1];
    
    // 카드 찾기
    const targetCard = findUserCard(userId, targetCardId);
    const materialCard = findUserCard(userId, materialCardId);
    
    // 카드가 존재하는지 확인
    if (!targetCard) {
      return message.reply("Target card not found in your collection.");
    }
    
    if (!materialCard) {
      return message.reply("Material card not found in your collection.");
    }
    
    // 같은 카드인지 확인
    if (targetCard.uniqueId === materialCard.uniqueId) {
      return message.reply("You cannot use the same card as both target and material.");
    }
    
    // 카드 타입(이름)이 같은지 확인
    if (targetCard.name !== materialCard.name) {
      return message.reply(`Cards must be of the same type. Target: ${targetCard.name}, Material: ${materialCard.name}`);
    }
    
    // 비용 계산 (레벨에 따라 증가)
    const creditCost = 1000 * targetCard.level;
    const fragmentCost = 25 * targetCard.level;
    
    // 유저 데이터 가져오기
    const userData = initUserData(userId);
    
    // 확인 버튼 생성
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`levelup_confirm_${targetCard.uniqueId}_${materialCard.uniqueId}`)
          .setLabel('Confirm')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`levelup_cancel`)
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary)
      );
    
    // 임베드 생성
    const embed = new EmbedBuilder()
      .setTitle('Card Level Up Confirmation')
      .setColor('#FFA500') // 주황색 계열
      .addFields(
        { name: 'Target Card', value: `**${targetCard.name}** (Level ${targetCard.level})\nID: \`${targetCard.uniqueId}\``, inline: true },
        { name: 'Material Card', value: `**${materialCard.name}** (Level ${materialCard.level})\nID: \`${materialCard.uniqueId}\``, inline: true },
        { name: '\u200B', value: '\u200B', inline: false }, // 빈 줄 추가
        { name: 'Cost', value: `${creditCost} ${ITEM_DISPLAY_NAMES[ITEM_TYPES.CREDIT]}\n${fragmentCost} ${ITEM_DISPLAY_NAMES[ITEM_TYPES.CARD_FRAGMENT]}`, inline: true },
        { name: 'Your Balance', value: `${userData.inventory[ITEM_TYPES.CREDIT]} ${ITEM_DISPLAY_NAMES[ITEM_TYPES.CREDIT]}\n${userData.inventory[ITEM_TYPES.CARD_FRAGMENT]} ${ITEM_DISPLAY_NAMES[ITEM_TYPES.CARD_FRAGMENT]}`, inline: true }
      )
      .setFooter({ text: 'Please confirm or cancel this level up request' })
      .setTimestamp();
    
    // 불충분한 자원이 있으면 경고 메시지 추가
    if (userData.inventory[ITEM_TYPES.CREDIT] < creditCost || userData.inventory[ITEM_TYPES.CARD_FRAGMENT] < fragmentCost) {
      embed.setDescription('⚠️ **Warning:** You do not have enough resources for this level up!');
      embed.setColor('#FF0000'); // 빨간색으로 변경
    } else {
      embed.setDescription('Level up will consume the material card and resources. This action cannot be undone.');
    }
    
    // 비용 및 확인 메시지 전송
    await message.reply({
      embeds: [embed],
      components: [row]
    });
  }

/**
 * 카드 레벨업 확인 버튼 처리
 * @param {Object} interaction - 디스코드 인터랙션 객체
 * @param {string} targetCardId - 대상 카드 ID
 * @param {string} materialCardId - 재료 카드 ID
 */
async function handleLevelUpConfirmation(interaction, targetCardId, materialCardId) {
  console.log(`handleLevelUpConfirmation called with targetCardId: ${targetCardId}, materialCardId: ${materialCardId}`);
  
  const userId = interaction.user.id;
  
  try {
    // 상호작용 지연 응답
    await interaction.deferUpdate();
    
    // 카드 찾기
    const targetCard = findUserCard(userId, targetCardId);
    const materialCard = findUserCard(userId, materialCardId);
    
    console.log("Target card:", targetCard ? `${targetCard.name} (${targetCard.uniqueId})` : "not found");
    console.log("Material card:", materialCard ? `${materialCard.name} (${materialCard.uniqueId})` : "not found");
    
    // 카드가 존재하는지 다시 확인
    if (!targetCard || !materialCard) {
      return interaction.followUp({ 
        content: "One or both cards are no longer available.", 
        ephemeral: true 
      });
    }
    
    // 유저 데이터 가져오기
    const userData = initUserData(userId);
    
    // 비용 계산
    const creditCost = 1000 * targetCard.level;
    const fragmentCost = 25 * targetCard.level;
    
    // 자원 충분한지 확인
    if (userData.inventory[ITEM_TYPES.CREDIT] < creditCost) {
      return interaction.followUp({ 
        content: `You don't have enough credits. Needed: ${creditCost}, You have: ${userData.inventory[ITEM_TYPES.CREDIT]}`, 
        ephemeral: true 
      });
    }
    
    if (userData.inventory[ITEM_TYPES.CARD_FRAGMENT] < fragmentCost) {
      return interaction.followUp({ 
        content: `You don't have enough card fragments. Needed: ${fragmentCost}, You have: ${userData.inventory[ITEM_TYPES.CARD_FRAGMENT]}`, 
        ephemeral: true 
      });
    }
    
    // 자원 차감
    userData.inventory[ITEM_TYPES.CREDIT] -= creditCost;
    userData.inventory[ITEM_TYPES.CARD_FRAGMENT] -= fragmentCost;
    
    // 이전 레벨 저장
    const oldLevel = targetCard.level;
    
    try {
      // 기존 레벨 통계 제거
      decrementCardStat(targetCard.cardId, userId, targetCard.variant, oldLevel);
    } catch (error) {
      console.error("Error decrementing old level stat:", error);
    }
    
    // 레벨 업
    targetCard.level += 1;
    
    try {
      // 새 레벨 통계 추가
      incrementCardStat(targetCard.cardId, userId, targetCard.variant, targetCard.level);
    } catch (error) {
      console.error("Error incrementing new level stat:", error);
    }
    
    try {
      // 재료 카드 소각 통계에 추가
      const materialCardIdForStats = materialCard.cardId || "unknown";
      const materialVariant = materialCard.variant || "v1";
      const materialLevel = materialCard.level || 1;
      
      // 소각 통계 증가
      incrementBurnedCardStat(materialCardIdForStats, userId, materialVariant, materialLevel);
      
      // 재료 카드 제거 (false로 설정하여 removeCardFromUser 내부에서 소각 통계를 다시 증가시키지 않음)
      removeCardFromUser(userId, materialCard.uniqueId, false);
    } catch (burnError) {
      console.error("Error handling material card removal:", burnError);
    }
    
    // 변경사항 저장
    saveUserDataThrottled();
    
    // 성공 메시지 전송 (ephemeral)
    await interaction.followUp({
      content: `<@${userId}> successfully leveled up **${targetCard.name}** to Level ${targetCard.level}!`,
      ephemeral: true
    });
    
    // 카드 ID 검색용 정보 페이지 생성
    const uniqueId = targetCard.uniqueId || targetCard.dropId || 'unknown';
    const variant = targetCard.variant || 'v1';
    const type = targetCard.type || 'normal';
    const cacheKey = `cardInfo_${uniqueId}_${variant}_${type}`;
    
    const { getCachedImage, createSingleCardImage } = require('../utils/imageUtils');
    
    // 카드 이미지 생성
    getCachedImage(cacheKey, async () => createSingleCardImage(targetCard)).then(async (cardImage) => {
      const { AttachmentBuilder } = require('discord.js');
      const attachment = new AttachmentBuilder(cardImage, { name: 'card_thumb.png' });
      
      // 카드 소유자 정보
      const ownerText = `<@${userId}>`;
      
      // 획득 시간 (있는 경우) - UTC 타임존 표시
      const obtainedDate = targetCard.obtainedAt ? new Date(targetCard.obtainedAt).toLocaleString('en-US', { timeZone: 'UTC' }) : 'Unknown';
      
      // 일반 카드 정보 생성
      // 스킬 정보 생성
      let skillText = '';
      if (targetCard.skillType) {
        skillText = `**Skill Type:** ${targetCard.skillType.charAt(0).toUpperCase() + targetCard.skillType.slice(1)}\n`;
        
        // 스킬 능력치 계산 (있는 경우)
        const { generateSkillStats } = require('../utils/cardUtils');
        const skillStats = targetCard.skillStats || generateSkillStats(targetCard.skillType);
        
        if (skillStats) {
          skillText += '**Skill Stats:**\n';
          Object.entries(skillStats).forEach(([key, value]) => {
            const formattedKey = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
            skillText += `• ${formattedKey}: ${value}\n`;
          });
        }
      }

      // 일반 카드인 경우 Information과 Level Up 버튼 표시
      const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`card_page_info_${targetCard.uniqueId}`)
          .setLabel('Information')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(true), // 현재 페이지이므로 비활성화
        new ButtonBuilder()
          .setCustomId(`card_page_levelup_${targetCard.uniqueId}`)
          .setLabel('Level Up')
          .setStyle(ButtonStyle.Success)
      );
      
      // G값 정보
      const gValueText = targetCard.gValue ? `**G Value:** ${targetCard.gValue}` : '';
      
      // 레벨 정보 추가
      const levelText = `**Level:** ${targetCard.level || 1}`;
      
      // 변형 정보
      const { prettyVariantName } = require('../../config');
      const variantText = targetCard.variant ? 
        `**Variant:** ${prettyVariantName(targetCard.variant)}` : 
        '**Variant:** Standard';
      
      // 임베드 생성 (일반 카드용)
      const embed = new EmbedBuilder()
      .setTitle(`${targetCard.name} - Personal Card`)
      .setDescription(`**Owner:** ${ownerText}
      **Card ID:** \`${targetCard.uniqueId || targetCard.dropId}\`
      **Series:** ${targetCard.series}
      ${variantText}
      ${levelText}
      ${gValueText}
      
      **Obtained at:** ${obtainedDate} UTC
      
      ${skillText}
      
      ${targetCard.description || 'No description available.'}`)
      .setColor('#303136')
      .setThumbnail('attachment://card_thumb.png') // 썸네일로 표시
      .setFooter({ text: `Personal Card Info | ID: ${targetCard.uniqueId || targetCard.dropId}` });
    
      // 메시지 업데이트
      await interaction.message.edit({
        embeds: [embed],
        files: [attachment],
        components: [row]
      });
      
      // 여기에 활성 뷰 등록 코드 추가
      const { registerActiveCardView } = require('../utils/activeViews');
      const expiresAt = Date.now() + (2 * 60 * 1000); // 2분 타이머
      
      // 활성 뷰 등록
      registerActiveCardView(
        interaction.message.channel.id,
        interaction.message.id,
        userId,
        targetCard.name || '',
        [targetCard], // 현재 페이지 카드
        [targetCard], // 전체 카드
        expiresAt
      );
    }).catch(error => {
      console.error('Error creating card image:', error);
      interaction.followUp({
        content: 'An error occurred while generating the card image after level up.',
        ephemeral: true
      });
    });
    
  } catch (error) {
    console.error('Error handling level up confirmation:', error);
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ 
          content: "An error occurred while processing the level up.", 
          ephemeral: true 
        });
      } else {
        await interaction.followUp({ 
          content: "An error occurred while processing the level up.", 
          ephemeral: true 
        });
      }
    } catch (replyError) {
      console.error('Error sending error message:', replyError);
    }
  }
}

/**
 * 레벨업 카드 선택 처리
 * @param {Object} interaction - 디스코드 인터랙션 객체
 * @param {string} targetCardId - 대상 카드 ID
 * @param {string} materialCardId - 선택된 재료 카드 ID
 */
async function handleLevelUpSelection(interaction, targetCardId, materialCardId) {
  const userId = interaction.user.id;
  
  try {
    // 상호작용 지연 응답
    await interaction.deferUpdate();
    
    // 카드 찾기
    const targetCard = findUserCard(userId, targetCardId);
    const materialCard = findUserCard(userId, materialCardId);
    
    // 카드 존재 여부 확인
    if (!targetCard || !materialCard) {
      return interaction.followUp({ 
        content: "One or both cards are no longer available.", 
        ephemeral: true 
      });
    }
    
    // 같은 카드인지 확인
    if (targetCard.uniqueId === materialCard.uniqueId) {
      return interaction.followUp({ 
        content: "You cannot use the same card as both target and material.", 
        ephemeral: true 
      });
    }
    
    // 카드 타입(이름)이 같은지 확인
    if (targetCard.name !== materialCard.name) {
      return interaction.followUp({ 
        content: `Cards must be of the same type. Target: ${targetCard.name}, Material: ${materialCard.name}`, 
        ephemeral: true 
      });
    }
    
    // 비용 계산 (레벨에 따라 증가)
    const creditCost = 1000 * targetCard.level;
    const fragmentCost = 25 * targetCard.level;
    
    // 유저 데이터 가져오기
    const userData = initUserData(userId);



    
    
    // 카드 이미지 가져오기
    const { getCachedImage, createSingleCardImage } = require('../utils/imageUtils');
    const uniqueId = targetCard.uniqueId || targetCard.dropId || 'unknown';
    const variant = targetCard.variant || 'v1';
    const type = targetCard.type || 'normal';
    const cacheKey = `cardInfo_${uniqueId}_${variant}_${type}`;
    
    const cardImage = await getCachedImage(cacheKey, async () => createSingleCardImage(targetCard));
    const attachment = new AttachmentBuilder(cardImage, { name: 'card_thumb.png' });
    
    // 확인 버튼 생성
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`levelup_confirm_${targetCard.uniqueId}_${materialCard.uniqueId}`)
          .setLabel('Confirm')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`levelup_cancel`)
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`card_page_info_${targetCard.uniqueId}`)
          .setLabel('Back to Card')
          .setStyle(ButtonStyle.Secondary)
      );
    
    // 임베드 생성 - 썸네일 사용
    const embed = new EmbedBuilder()
      .setTitle('Card Level Up Confirmation')
      .setColor('#FFA500') // 주황색 계열
      .setThumbnail('attachment://card_thumb.png') // 카드 이미지를 썸네일로 표시
      .addFields(
        { name: 'Target Card', value: `**${targetCard.name}** (Level ${targetCard.level})\nID: \`${targetCard.uniqueId}\`\nVariant: ${targetCard.variant || 'v1'}\nG•${targetCard.gValue || 'N/A'}`, inline: true },
        { name: 'Material Card', value: `**${materialCard.name}** (Level ${materialCard.level || 1})\nID: \`${materialCard.uniqueId}\`\nVariant: ${materialCard.variant || 'v1'}\nG•${materialCard.gValue || 'N/A'}`, inline: true },
        { name: '\u200B', value: '\u200B', inline: false }, // 빈 줄 추가
        { name: 'Cost', value: `${creditCost} ${ITEM_DISPLAY_NAMES[ITEM_TYPES.CREDIT]}\n${fragmentCost} ${ITEM_DISPLAY_NAMES[ITEM_TYPES.CARD_FRAGMENT]}`, inline: true },
        { name: 'Your Balance', value: `${userData.inventory[ITEM_TYPES.CREDIT]} ${ITEM_DISPLAY_NAMES[ITEM_TYPES.CREDIT]}\n${userData.inventory[ITEM_TYPES.CARD_FRAGMENT]} ${ITEM_DISPLAY_NAMES[ITEM_TYPES.CARD_FRAGMENT]}`, inline: true }
      )
      .setFooter({ text: 'Please confirm or cancel this level up request' })
      .setTimestamp();
    
    // 불충분한 자원이 있으면 경고 메시지 추가
    if (userData.inventory[ITEM_TYPES.CREDIT] < creditCost || userData.inventory[ITEM_TYPES.CARD_FRAGMENT] < fragmentCost) {
      embed.setDescription('⚠️ **Warning:** You do not have enough resources for this level up!');
      embed.setColor('#FF0000'); // 빨간색으로 변경
    } else {
      embed.setDescription('Level up will consume the material card and resources. This action cannot be undone.');
    }
    
    // 비용 및 확인 메시지 업데이트
    await interaction.editReply({
      embeds: [embed],
      files: [attachment], // 썸네일용 이미지 첨부
      components: [row]
    });
    
  } catch (error) {
    console.error('Error handling level up selection:', error);
    try {
      // 이미 응답했는지 확인
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ 
          content: "An error occurred while processing your level up selection.", 
          ephemeral: true 
        });
      } else {
        await interaction.followUp({ 
          content: "An error occurred while processing your level up selection.", 
          ephemeral: true 
        });
      }
    } catch (replyError) {
      console.error('Error sending error message:', replyError);
    }
  }
}

// 모듈 내보내기 부분 업데이트
module.exports = {
  handleCardLevelUpCommand,
  handleLevelUpConfirmation,
  handleLevelUpSelection
};