// src/commands/cardLookupById.js
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, EmbedBuilder } = require('discord.js');
const { findUserCard } = require('../database/cardModel');
const { createSingleCardImage, getCachedImage } = require('../utils/imageUtils');
const { prettyVariantName } = require('../../config');
const { generateSkillStats } = require('../utils/cardUtils');
const { ITEM_DISPLAY_NAMES, ITEM_TYPES } = require('../database/itemTypes');

/**
 * 카드 ID로 특정 유저의 카드 검색
 */
function showDetailedCardById(message, cardId) {
  try {
    // 카드 ID가 입력되지 않은 경우
    if (!cardId || cardId.trim() === '') {
      return message.reply('Please specify a card ID to search for. Example: `clu ABC123`');
    }
    
    // 메시지 작성자의 ID 가져오기
    const userId = message.author.id;
    
    // 카드 검색
    const card = findUserCard(userId, cardId);
    
    // 카드를 찾지 못한 경우
    if (!card) {
      return message.reply(`No card found with ID "${cardId}" in your collection.`);
    }
    
    // cacheKey 정의 추가
    const uniqueId = card.uniqueId || card.dropId || 'unknown';
    const variant = card.variant || 'v1';
    const type = card.type || 'normal';
    const cacheKey = `cardInfo_${uniqueId}_${variant}_${type}`;
    
    // 카드 이미지 생성
    getCachedImage(cacheKey, async () => createSingleCardImage(card)).then(async (cardImage) => {
      const attachment = new AttachmentBuilder(cardImage, { name: 'card.png' });
      
      // 카드 소유자 정보
      const ownerText = `<@${userId}>`;
      
      // 획득 시간 (있는 경우) - UTC 타임존 표시
      const obtainedDate = card.obtainedAt ? new Date(card.obtainedAt).toLocaleString('en-US', { timeZone: 'UTC' }) : 'Unknown';
      
      let embed;
      let row;
      
      // 자원 카드인 경우 특별 표시
      if (card.type === 'resource') {
        // 자원 구성 정보
        let resourceCompText = '';
        
        // 광물 구성이 있는 경우 (채광 자원)
        if (card.mineralComposition) {
          resourceCompText = '**Mineral Composition:**\n';
          for (const [mineral, percent] of Object.entries(card.mineralComposition)) {
            resourceCompText += `• ${mineral}: ${percent}%\n`;
          }
        }
        // 일반 자원 구성이 있는 경우 (채집 자원)
        else if (card.resourceComposition) {
          resourceCompText = '**Resource Composition:**\n';
          for (const [resource, percent] of Object.entries(card.resourceComposition)) {
            resourceCompText += `• ${resource}: ${percent}%\n`;
          }
        }
        
        // 자원 값 정보
        const resourceValueText = `**Resource Value:** ${card.resourceValue.toLocaleString()}\n`;
        
        // 사용 가능한 유저 목록
        let allowedUsersText = '';
        
        // 채광 가능 유저
        if (card.subType === 'mining' && card.minableUsers && card.minableUsers.length > 0) {
          allowedUsersText = '**Minable Users:**\n';
          card.minableUsers.forEach(userId => {
            allowedUsersText += `• <@${userId}>\n`;
          });
        }
        // 채집 가능 유저
        else if (card.subType === 'gathering' && card.gatherableUsers && card.gatherableUsers.length > 0) {
          allowedUsersText = '**Gatherable Users:**\n';
          card.gatherableUsers.forEach(userId => {
            allowedUsersText += `• <@${userId}>\n`;
          });
        }
        else {
          allowedUsersText = card.subType === 'mining' ? 
            'No users can mine this meteorite yet.' : 
            'No users can gather from this forest yet.';
        }
      
        // 자원 카드 타입에 따라 다른 메시지 표시
        const cardTitle = card.subType === 'mining' ? 
          `${card.name} - Mining Resource` : 
          `${card.name} - Gathering Resource`;
        
        const commandHint = card.subType === 'mining' ? 
          `Use \`cad ${card.uniqueId} @user\` to add or remove users from the mining list.` :
          `Use \`cad ${card.uniqueId} @user\` to add or remove users from the gathering list.`;

        // 자원 카드인 경우 Information 버튼만 표시
        row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`card_page_info_${card.uniqueId || card.dropId}`)
            .setLabel('Information')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(true) // 현재 페이지이므로 비활성화
        );
      
        // 임베드 생성 (자원 카드용)
        embed = new EmbedBuilder()
          .setTitle(cardTitle)
          .setDescription(`**Owner:** ${ownerText}
          **Card ID:** \`${card.uniqueId || card.dropId}\`
          ${resourceValueText}
          ${resourceCompText}
          
          **Obtained at:** ${obtainedDate} UTC
          
          ${allowedUsersText}
          
          ${card.description || 'No description available.'}
          
          ${commandHint}`)
          .setColor('#8B4513')
          .setThumbnail('attachment://card.png')
          .setFooter({ text: `Resource Card | ID: ${card.uniqueId || card.dropId}` });
      }
      // 일반 카드인 경우 기존 표시 방식 유지
      else {
        // 스킬 정보 생성 부분을 수정
        let skillText = '';
        if (card.skillType) {
        skillText = `**Skill Type:** ${card.skillType.charAt(0).toUpperCase() + card.skillType.slice(1)}\n`;
        const { saveUserDataThrottled } = require('../database/userData');
        // 스킬 능력치가 없다면 생성하고 영구적으로 저장
        if (!card.skillStats) {
            card.skillStats = generateSkillStats(card.skillType);
            saveUserDataThrottled(); // 변경 사항 저장
            console.log(`Generated and saved skill stats for card: ${card.name} (${card.uniqueId}) with skill type: ${card.skillType}`);
        }
        
        // 이 부분을 디버깅을 위해 확장
        if (card.skillStats) {
            skillText += '**Skill Stats:**\n';
            console.log(`Card ${card.uniqueId} skill stats:`, JSON.stringify(card.skillStats));
            
            // 객체가 비어있는지 확인
            if (Object.keys(card.skillStats).length === 0) {
            console.log(`Empty skill stats for card: ${card.uniqueId}`);
            // 빈 객체인 경우 다시 생성
            card.skillStats = generateSkillStats(card.skillType);
            saveUserDataThrottled();
            }
            
            Object.entries(card.skillStats).forEach(([key, value]) => {
            const formattedKey = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
            skillText += `• ${formattedKey}: ${value}\n`;
            });
        } else {
            console.log(`No skill stats found for card: ${card.uniqueId}`);
        }
}

        // 카드 쿨다운 상태 확인
        const { getCardCooldown, userData, initUserData } = require('../database/userData');
        const cardCooldown = getCardCooldown(userId, card.uniqueId);
        const isOnCooldown = cardCooldown > 0;

        // 쿨다운 텍스트 생성
        let cooldownText = '';
        if (isOnCooldown) {
        const cooldownMinutes = Math.ceil(cardCooldown / 60000);
        const cooldownHours = Math.floor(cooldownMinutes / 60);
        const remainingMinutes = cooldownMinutes % 60;
        
        cooldownText = `\n**Cooldown:** ${cooldownHours > 0 ? `${cooldownHours}h ` : ''}${remainingMinutes}m remaining`;
        }

        // 일반 카드인 경우 Information과 Level Up 버튼만 표시 (Building 버튼 제거)
        row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`card_page_info_${card.uniqueId}`)
            .setLabel('Information')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(true), // 현재 페이지이므로 비활성화
          new ButtonBuilder()
            .setCustomId(`card_page_levelup_${card.uniqueId}`)
            .setLabel('Level Up')
            .setStyle(ButtonStyle.Success)
        );
        
        // G값 정보
        const gValueText = card.gValue ? `**G Value:** ${card.gValue}` : '';
        
        // 레벨 정보 추가
        const levelText = `**Level:** ${card.level || 1}`;
        
        // 변형 정보
        const variantText = card.variant ? 
          `**Variant:** ${prettyVariantName(card.variant)}` : 
          '**Variant:** Standard';
        
        // 임베드 생성 (일반 카드용)
        embed = new EmbedBuilder()
            .setTitle(`${card.name} - Personal Card`)
            .setDescription(`**Owner:** ${ownerText}
            **Card ID:** \`${card.uniqueId || card.dropId}\`
            **Series:** ${card.series}
            ${variantText}
            ${levelText}
            ${gValueText}
            
            **Obtained at:** ${obtainedDate} UTC
            ${cooldownText}
            
            ${skillText}
            
            ${card.description || 'No description available.'}`)
            .setColor('#303136')
            .setThumbnail('attachment://card.png')  // .setImage 대신 .setThumbnail 사용
            .setFooter({ text: `Personal Card Info | ID: ${card.uniqueId || card.dropId}` });
      }
      
      // 메시지 전송 시 버튼 행 추가
      const sentMessage = await message.reply({ embeds: [embed], files: [attachment], components: [row] });
      
      // 여기에 활성 뷰 등록 코드 추가
      const { registerActiveCardView } = require('../utils/activeViews');
      const expiresAt = Date.now() + (2 * 60 * 1000); // 2분 타이머
      
      // 활성 뷰 등록
      registerActiveCardView(
        message.channel.id,
        sentMessage.id,
        message.author.id,
        card.name || '',
        [card], // 현재 페이지 카드
        [card], // 전체 카드
        expiresAt
      );
      
    }).catch(error => {
      console.error('Error creating card image:', error);
      message.reply('An error occurred while generating the card image.');
    });
  } catch (error) {
    console.error('Error showing detailed card info:', error);
    message.reply('An error occurred while getting detailed card information.');
  }
}

module.exports = {
  showDetailedCardById,
};