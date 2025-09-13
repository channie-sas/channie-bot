// src/commands/cardAddCommand.js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField } = require('discord.js');
const { getCardsBySeries, getAllCards } = require('../database/cardDatabase');
const { validateImageDimensions, saveCardImage } = require('../utils/cardImageUtils');
const fs = require('fs');
const path = require('path');

console.log('[CADD DEBUG] cardAddCommand module loaded');

// 대기 중인 카드 추가 요청들 (메모리에 임시 저장)
const pendingCardRequests = new Map();

/**
 * cadd 명령어 핸들러
 * @param {Object} message - 디스코드 메시지 객체
 * @param {Array} args - 명령어 인수 [시리즈명, 캐릭터명, variant] 또는 ['list', page] 또는 ['set']
 */
async function handleCardAddCommand(message, args) {
  console.log('[CADD DEBUG] handleCardAddCommand called with args:', args);
  
  try {
    // cadd set 명령어 처리 (카드 요청 채널 설정)
    if (args.length > 0 && args[0].toLowerCase() === 'set') {
      return await handleSetCardRequestChannelCommand(message);
    }

    // cadd list 명령어 처리
    if (args.length > 0 && args[0].toLowerCase() === 'list') {
      return await handleMissingCardsList(message, args.slice(1));
    }

    // 인수 개수 확인
    if (args.length < 3) {
      return message.reply('Usage: `cadd [series_name] [character_name] [variant]`, `cadd list [page]`, or `cadd set`\nExample: `cadd Avatar "Jake Sully" v1` or `cadd list 1`');
    }

    // 인수 파싱
    let seriesName, characterName, variant;
    
    // 따옴표로 묶인 캐릭터 이름 처리
    const fullArgs = args.join(' ');
    const quotedMatch = fullArgs.match(/^(\S+)\s+"([^"]+)"\s+(\S+)$/);
    
    if (quotedMatch) {
      seriesName = quotedMatch[1];
      characterName = quotedMatch[2];
      variant = quotedMatch[3];
    } else {
      // 따옴표가 없는 경우 마지막이 variant, 나머지는 캐릭터명
      seriesName = args[0];
      variant = args[args.length - 1];
      characterName = args.slice(1, -1).join(' ');
    }

    console.log('[CADD DEBUG] Parsed:', { seriesName, characterName, variant });

    // 입력값 검증
    if (!seriesName || !characterName || !variant) {
      return message.reply('Invalid format. Use: `cadd [series_name] [character_name] [variant]`, `cadd list [page]`, or `cadd set`');
    }

    // variant 형식 확인 - config의 addableVariants 리스트 사용
    const { getAddableVariants } = require('../../config');
    const addableVariants = getAddableVariants();
    
    if (!addableVariants.includes(variant)) {
      const variantList = addableVariants.join(', ');
      return message.reply(`Variant must be one of: ${variantList}`);
    }

    // 시리즈 존재 여부 확인
    const normalizedSeriesId = normalizeSeriesName(seriesName);
    const seriesCards = getCardsBySeries(normalizedSeriesId);
    
    console.log('[CADD DEBUG] Series check:', { normalizedSeriesId, cardsFound: seriesCards.length });
    
    if (seriesCards.length === 0) {
      return message.reply(`❌ Series "${seriesName}" not found in the database. Please check the series name.`);
    }

    // 카드 ID 생성 (캐릭터명 + 시리즈명, 공백 제거 및 소문자)
    const cardId = generateCardId(characterName, normalizedSeriesId);
    
    // 기존 카드 확인
    const existingCard = seriesCards.find(card => (card.id || card.cardId) === cardId);
    const isNewCard = !existingCard;
    const hasVariant = existingCard && existingCard.variants.includes(variant);

    console.log('[CADD DEBUG] Card check:', { cardId, isNewCard, hasVariant });

    // 기존 요청 확인 및 처리 (새로 추가된 부분)
    const requestKey = `${message.author.id}_${message.channel.id}`;
    if (pendingCardRequests.has(requestKey)) {
      const oldRequest = pendingCardRequests.get(requestKey);
      console.log('[CADD DEBUG] Found existing request:', oldRequest.cardId, '-> replacing with new request:', cardId);
      
      // 기존 요청 메시지를 찾아서 만료 상태로 업데이트
      try {
        const oldMessage = await message.channel.messages.fetch(oldRequest.messageId);
        if (oldMessage) {
          const expiredEmbed = EmbedBuilder.from(oldMessage.embeds[0])
            .setColor('#FF0000')
            .setTitle('❌ Request Cancelled')
            .setDescription('This request has been cancelled due to a new request.');
          
          await oldMessage.edit({ embeds: [expiredEmbed] });
        }
      } catch (error) {
        console.error('[CADD DEBUG] Could not update old request message:', error);
      }
      
      // 기존 요청 삭제
      pendingCardRequests.delete(requestKey);
      console.log('[CADD DEBUG] Removed old request');
    }

    // 상태 메시지 생성
    let statusMessage = '';
    if (isNewCard) {
      statusMessage = `🆕 **New Card**: ${characterName} will be added to ${seriesName} series`;
    } else if (hasVariant) {
      statusMessage = `🔄 **Existing Variant**: ${characterName} already has ${variant} variant in ${seriesName}. This will replace the existing image.`;
    } else {
      statusMessage = `➕ **New Variant**: ${variant} will be added to existing card ${characterName} in ${seriesName}`;
    }

    // 이미지 업로드 요청
    const requestEmbed = new EmbedBuilder()
      .setTitle('📸 Card Image Required')
      .setDescription(`${statusMessage}\n\n**Please upload an image for this card:**\n• **Size**: Must be exactly 330x470 pixels\n• **Format**: PNG recommended\n• **Reply to this message** with the image attachment`)
      .addFields([
        { name: 'Series', value: seriesName, inline: true },
        { name: 'Character', value: characterName, inline: true },
        { name: 'Variant', value: variant, inline: true },
        { name: 'Card ID', value: cardId, inline: true }
      ])
      .setColor('#FFA500')
      .setFooter({ text: 'You have 5 minutes to upload the image' });

    const requestMessage = await message.reply({ embeds: [requestEmbed] });

    // 새 요청으로 등록 (사용자 ID + 채널 ID를 키로 사용)
    pendingCardRequests.set(requestKey, {
      userId: message.author.id,
      channelId: message.channel.id,
      messageId: requestMessage.id,
      seriesName,
      characterName,
      variant,
      cardId,
      normalizedSeriesId,
      isNewCard,
      timestamp: Date.now()
    });

    console.log('[CADD DEBUG] New request registered:', requestKey);
    console.log('[CADD DEBUG] Total pending requests:', pendingCardRequests.size);

    // 5분 후 요청 만료
    setTimeout(() => {
      if (pendingCardRequests.has(requestKey)) {
        pendingCardRequests.delete(requestKey);
        console.log('[CADD DEBUG] Request expired:', requestKey);
        requestMessage.edit({
          embeds: [requestEmbed.setColor('#FF0000').setTitle('❌ Request Expired')]
        }).catch(console.error);
      }
    }, 5 * 60 * 1000);

  } catch (error) {
    console.error('[CADD ERROR] Error in handleCardAddCommand:', error);
    message.reply('❌ An error occurred while processing your card add request.');
  }
}

/**
 * 카드 요청 채널 설정 명령어 처리
 * @param {Object} message - 메시지 객체
 */
async function handleSetCardRequestChannelCommand(message) {
  // 관리자 권한 확인
  if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    return message.reply('❌ You need administrator permissions to set card request channels.');
  }
  
  const channelId = message.channel.id;
  
  // 카드 요청 채널 설정 로드/저장 함수
  const { loadCardRequestChannels, saveCardRequestChannels, getCardRequestChannels, toggleCardRequestChannel } = require('../utils/cardRequestChannelUtils');
  
  // 현재 채널이 카드 요청 채널인지 확인
  const isEnabled = toggleCardRequestChannel(channelId);
  
  if (isEnabled) {
    message.reply('✅ This channel is now designated as a card request channel. All card approval/rejection messages will be sent here.');
  } else {
    message.reply('❌ This channel is no longer a card request channel.');
  }
}

/**
 * 이미지 업로드 처리
 * @param {Object} message - 이미지가 포함된 메시지
 */
async function handleImageUpload(message) {
  console.log('[CADD DEBUG] handleImageUpload called');
  console.log('[CADD DEBUG] User:', message.author.id, 'Channel:', message.channel.id);
  console.log('[CADD DEBUG] Attachments:', message.attachments.size);
  
  try {
    // 첨부파일이 있는지 확인
    if (!message.attachments || message.attachments.size === 0) {
      console.log('[CADD DEBUG] No attachments found');
      return false; // 이미지가 없으면 무시
    }

    // 해당 유저의 대기 중인 요청 찾기
    const requestKey = `${message.author.id}_${message.channel.id}`;
    console.log('[CADD DEBUG] Looking for request key:', requestKey);
    console.log('[CADD DEBUG] Available keys:', Array.from(pendingCardRequests.keys()));
    
    if (!pendingCardRequests.has(requestKey)) {
      console.log('[CADD DEBUG] No pending request found');
      return false; // 대기 중인 요청이 없으면 무시
    }

    const requestData = pendingCardRequests.get(requestKey);
    const attachment = message.attachments.first();

    console.log('[CADD DEBUG] Found request for card:', requestData.cardId);
    console.log('[CADD DEBUG] Attachment type:', attachment.contentType);

    // 이미지 파일인지 확인
    if (!attachment.contentType || !attachment.contentType.startsWith('image/')) {
      await message.reply('❌ Please upload a valid image file.');
      return true;
    }

    console.log('[CADD DEBUG] Validating image dimensions...');

    // 이미지 크기 검증
    const validationResult = await validateImageDimensions(attachment.url);
    
    if (!validationResult.isValid) {
      await message.reply(`❌ ${validationResult.message}\n**Required size: 330x470 pixels**\n**Your image: ${validationResult.actualWidth}x${validationResult.actualHeight} pixels**`);
      return true;
    }

    console.log('[CADD DEBUG] Image validation passed, creating approval request...');

    // 관리자 승인 요청 생성
    await createAdminApprovalRequest(message, requestData, attachment);

    // 대기 중인 요청 제거
    pendingCardRequests.delete(requestKey);
    console.log('[CADD DEBUG] Request processed and removed:', requestKey);

    return true;
  } catch (error) {
    console.error('[CADD ERROR] Error in handleImageUpload:', error);
    message.reply('❌ An error occurred while processing your image upload.');
    return true;
  }
}

/**
 * 관리자 승인 요청 생성
 */
async function createAdminApprovalRequest(message, requestData, attachment) {
  const { seriesName, characterName, variant, cardId, isNewCard } = requestData;

  // 고유한 승인 ID 생성
  const approvalId = `${message.author.id}_${Date.now()}`;

  console.log('[CADD DEBUG] Creating approval request with ID:', approvalId);

  // 승인 요청 임베드
  const approvalEmbed = new EmbedBuilder()
    .setTitle('🔍 Card Addition Request - Admin Approval Required')
    .setDescription(`**User**: <@${message.author.id}> requests to ${isNewCard ? 'add a new card' : 'add/update a variant'}`)
    .addFields([
      { name: 'Series', value: seriesName, inline: true },
      { name: 'Character', value: characterName, inline: true },
      { name: 'Variant', value: variant, inline: true },
      { name: 'Card ID', value: cardId, inline: true },
      { name: 'Image Size', value: '330x470 ✅', inline: true },
      { name: 'Action', value: isNewCard ? 'Create New Card' : 'Add/Update Variant', inline: true }
    ])
    .setImage(attachment.url)
    .setColor('#00FF00')
    .setTimestamp()
    .setFooter({ text: 'Administrators can approve or reject this request' });

  // 승인/거절 버튼
  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`card_approve_${approvalId}`)
        .setLabel('✅ Approve')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`card_reject_${approvalId}`)
        .setLabel('❌ Reject')
        .setStyle(ButtonStyle.Danger)
    );

  // 카드 요청 채널로 전송 (수정된 부분)
  const { getCardRequestChannels } = require('../utils/cardRequestChannelUtils');
  const requestChannels = getCardRequestChannels();
  
  let approvalMessage = null;
  
  if (requestChannels.length > 0) {
    // 카드 요청 채널이 설정되어 있는 경우 해당 채널들로 전송
    for (const channelId of requestChannels) {
      try {
        const channel = message.client.channels.cache.get(channelId);
        if (channel) {
          approvalMessage = await channel.send({
            embeds: [approvalEmbed],
            components: [row]
          });
          break; // 첫 번째 유효한 채널에만 전송
        }
      } catch (error) {
        console.error(`[CADD ERROR] Could not send to request channel ${channelId}:`, error);
      }
    }
  }
  
  // 카드 요청 채널이 없거나 전송에 실패한 경우 현재 채널에 전송
  if (!approvalMessage) {
    approvalMessage = await message.channel.send({
      embeds: [approvalEmbed],
      components: [row]
    });
  }

  // 승인 대기 데이터 저장
  const approvalData = {
    ...requestData,
    imageUrl: attachment.url,
    approvalMessageId: approvalMessage.id,
    approvalChannelId: approvalMessage.channel.id, // 승인 메시지가 전송된 채널 ID 추가
    requesterUserId: message.author.id,
    originalChannelId: message.channel.id, // 원래 요청한 채널 저장
    timestamp: Date.now() // 타임스탬프 추가
  };

  // 영구 저장 시스템 사용 (수정된 부분)
  const { addApprovalRequest } = require('../utils/cardApprovalPersistence');
  addApprovalRequest(approvalId, approvalData);
  
  console.log('[CADD DEBUG] Approval request stored with persistence:', approvalId);

  // 사용자에게 알림
  await message.reply('✅ Your card image has been submitted for admin approval!');
}

/**
 * 관리자 승인/거절 버튼 처리
 */
async function handleAdminApproval(interaction, isApproval) {
  console.log('[CADD DEBUG] Admin approval button pressed:', interaction.customId, 'isApproval:', isApproval);
  
  try {
    // 관리자 권한 확인
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({
        content: '❌ You need administrator permissions to approve/reject card requests.',
        ephemeral: true
      });
    }

    // 버튼 ID에서 승인 ID 추출 (card_approve_USERID_TIMESTAMP 또는 card_reject_USERID_TIMESTAMP)
    const customIdParts = interaction.customId.split('_');
    const approvalId = customIdParts.slice(2).join('_'); // USERID_TIMESTAMP 부분
    
    console.log('[CADD DEBUG] Looking for approval ID:', approvalId);
    
    // 영구 저장 시스템에서 데이터 가져오기 (수정된 부분)
    const { getApprovalRequest, removeApprovalRequest } = require('../utils/cardApprovalPersistence');
    const requestData = getApprovalRequest(approvalId);
    
    if (!requestData) {
      return interaction.reply({
        content: '❌ This approval request has expired or is no longer valid.',
        ephemeral: true
      });
    }

    console.log('[CADD DEBUG] Found request data for:', requestData.cardId);

    if (isApproval) {
      console.log('[CADD DEBUG] Processing approval for card:', requestData.cardId);
      // 승인 처리
      const success = await processCardApproval(requestData);
      
      if (success) {
        // 성공 임베드 업데이트
        const successEmbed = EmbedBuilder.from(interaction.message.embeds[0])
          .setTitle('✅ Card Addition Approved')
          .setColor('#00FF00')
          .addFields({ name: 'Status', value: `Approved by <@${interaction.user.id}>`, inline: false });

        await interaction.update({
          embeds: [successEmbed],
          components: [] // 버튼 제거
        });

        // 요청자에게 알림 (원래 채널로 전송)
        try {
          const originalChannel = interaction.client.channels.cache.get(requestData.originalChannelId);
          if (originalChannel) {
            await originalChannel.send(`🎉 <@${requestData.requesterUserId}> Your card **${requestData.characterName}** (${requestData.variant}) has been approved and added to the **${requestData.seriesName}** series!`);
          }
        } catch (notifyError) {
          console.error('[CADD ERROR] Error notifying user:', notifyError);
        }

      } else {
        await interaction.reply({
          content: '❌ Failed to process card approval. Please check the logs.',
          ephemeral: true
        });
      }
    } else {
      console.log('[CADD DEBUG] Processing rejection for card:', requestData.cardId);
      // 거절 처리
      const rejectEmbed = EmbedBuilder.from(interaction.message.embeds[0])
        .setTitle('❌ Card Addition Rejected')
        .setColor('#FF0000')
        .addFields({ name: 'Status', value: `Rejected by <@${interaction.user.id}>`, inline: false });

      await interaction.update({
        embeds: [rejectEmbed],
        components: [] // 버튼 제거
      });

      // 요청자에게 알림 (원래 채널로 전송)
      try {
        const originalChannel = interaction.client.channels.cache.get(requestData.originalChannelId);
        if (originalChannel) {
          await originalChannel.send(`❌ <@${requestData.requesterUserId}> Your card request for **${requestData.characterName}** has been rejected by an administrator.`);
        }
      } catch (notifyError) {
        console.error('[CADD ERROR] Error notifying user:', notifyError);
      }
    }

    // 영구 저장소에서 요청 데이터 제거 (수정된 부분)
    removeApprovalRequest(approvalId);
    console.log('[CADD DEBUG] Approval request cleaned up:', approvalId);

  } catch (error) {
    console.error('[CADD ERROR] Error in handleAdminApproval:', error);
    interaction.reply({
      content: '❌ An error occurred while processing the approval.',
      ephemeral: true
    });
  }
}

/**
 * 카드 승인 처리 (실제 카드 추가/업데이트)
 */
async function processCardApproval(requestData) {
  try {
    const { cardId, normalizedSeriesId, variant, imageUrl, characterName, seriesName, isNewCard } = requestData;

    console.log('[CADD DEBUG] Starting card approval process for:', cardId);

    // 1. 이미지 저장
    console.log('[CADD DEBUG] Saving card image...');
    const imageSaved = await saveCardImage(imageUrl, normalizedSeriesId, cardId, variant);
    if (!imageSaved) {
      console.error('[CADD ERROR] Failed to save card image');
      return false;
    }

    // 2. 카드 데이터 업데이트
    console.log('[CADD DEBUG] Updating card data...');
    if (isNewCard) {
      // 새 카드 추가
      await addNewCardToSeries(normalizedSeriesId, cardId, characterName, seriesName, variant);
    } else {
      // 기존 카드에 variant 추가
      await addVariantToExistingCard(normalizedSeriesId, cardId, variant);
    }

    // 3. 캐시에서 해당 카드 제거 (v1 이미지가 추가된 경우)
    if (variant === 'v1') {
      console.log('[CADD DEBUG] Removing card from missing cache...');
      const { removeCardFromMissingCache } = require('../utils/missingCardsCache');
      removeCardFromMissingCache(cardId, normalizedSeriesId);
    }

    // 4. 카드 데이터베이스 리로드
    console.log('[CADD DEBUG] Reloading card database...');
    const { loadAllCardSeries } = require('../database/cardDatabase');
    loadAllCardSeries();

    console.log('[CADD DEBUG] Card successfully processed:', cardId, variant);
    return true;

  } catch (error) {
    console.error('[CADD ERROR] Error in processCardApproval:', error);
    return false;
  }
}

/**
 * 시리즈명 정규화
 */
function normalizeSeriesName(seriesName) {
  return seriesName.toLowerCase()
                  .replace(/[^\w\s]/g, '')
                  .replace(/\s+/g, '');
}

/**
 * 카드 ID 생성
 */
function generateCardId(characterName, seriesId) {
  const cleanCharacterName = characterName.toLowerCase()
                                        .replace(/[^\w\s]/g, '')
                                        .replace(/\s+/g, '');
  return `${cleanCharacterName}${seriesId}`;
}

/**
 * 새 카드를 시리즈에 추가
 */
async function addNewCardToSeries(seriesId, cardId, characterName, seriesName, variant) {
  try {
    console.log('[CADD DEBUG] Adding new card to series:', seriesId, cardId);
    
    const seriesFilePath = path.join(__dirname, '../database/cards', `${seriesId}.js`);
    
    if (!fs.existsSync(seriesFilePath)) {
      throw new Error(`Series file not found: ${seriesFilePath}`);
    }

    // 기존 파일 읽기
    let fileContent = fs.readFileSync(seriesFilePath, 'utf8');
    
    // 새 카드 객체 생성
    const newCard = {
      id: cardId,
      name: characterName.toUpperCase(),
      series: seriesName,
      variants: [variant],
      category: ['user-added'],
      weight: 3 // 기본 가중치
    };

    // 파일 내용에서 배열 부분 찾기
    const arrayMatch = fileContent.match(/const\s+\w+Cards\s*=\s*(\[[\s\S]*\]);/);
    if (!arrayMatch) {
      throw new Error('Could not find card array in series file');
    }

    // 기존 배열 파싱
    const arrayText = arrayMatch[1];
    const existingCards = eval(arrayText); // 주의: eval 사용

    // 새 카드 추가
    existingCards.push(newCard);

    // 새 배열로 파일 내용 업데이트
    const newArrayText = JSON.stringify(existingCards, null, 6).replace(/"/g, "'");
    const newFileContent = fileContent.replace(arrayMatch[1], newArrayText);

    // 파일 저장
    fs.writeFileSync(seriesFilePath, newFileContent, 'utf8');
    console.log('[CADD DEBUG] New card added to series file:', cardId);

  } catch (error) {
    console.error('[CADD ERROR] Error adding new card to series:', error);
    throw error;
  }
}

/**
 * 기존 카드에 variant 추가
 */
async function addVariantToExistingCard(seriesId, cardId, variant) {
  try {
    console.log('[CADD DEBUG] Adding variant to existing card:', seriesId, cardId, variant);
    
    const seriesFilePath = path.join(__dirname, '../database/cards', `${seriesId}.js`);
    
    if (!fs.existsSync(seriesFilePath)) {
      throw new Error(`Series file not found: ${seriesFilePath}`);
    }

    // 기존 파일 읽기
    let fileContent = fs.readFileSync(seriesFilePath, 'utf8');
    
    // 파일 내용에서 배열 부분 찾기
    const arrayMatch = fileContent.match(/const\s+\w+Cards\s*=\s*(\[[\s\S]*\]);/);
    if (!arrayMatch) {
      throw new Error('Could not find card array in series file');
    }

    // 기존 배열 파싱
    const arrayText = arrayMatch[1];
    const existingCards = eval(arrayText);

    // 해당 카드 찾기
    const cardIndex = existingCards.findIndex(card => (card.id || card.cardId) === cardId);
    if (cardIndex === -1) {
      throw new Error(`Card not found: ${cardId}`);
    }

    // variants 배열에 새 variant 추가 (중복 방지)
    if (!existingCards[cardIndex].variants.includes(variant)) {
      existingCards[cardIndex].variants.push(variant);
    }

    // 새 배열로 파일 내용 업데이트
    const newArrayText = JSON.stringify(existingCards, null, 6).replace(/"/g, "'");
    const newFileContent = fileContent.replace(arrayMatch[1], newArrayText);

    // 파일 저장
    fs.writeFileSync(seriesFilePath, newFileContent, 'utf8');
    console.log('[CADD DEBUG] Variant added to existing card:', cardId, variant);

  } catch (error) {
    console.error('[CADD ERROR] Error adding variant to existing card:', error);
    throw error;
  }
}

/**
 * 누락된 카드 목록 표시 (cadd list 명령어) - 명령어 형태로 출력하도록 수정
 * @param {Object} message - 디스코드 메시지 객체
 * @param {Array} args - 추가 인수 [페이지번호]
 */
async function handleMissingCardsList(message, args) {
  console.log('[CADD LIST] handleMissingCardsList called with args:', args);
  
  try {
    // 페이지 번호 파싱
    let page = 1;
    if (args.length > 0) {
      const pageNum = parseInt(args[0]);
      if (!isNaN(pageNum) && pageNum > 0) {
        page = pageNum;
      }
    }

    // 누락된 카드 데이터 가져오기
    const { getMissingCards, getCacheInfo } = require('../utils/missingCardsCache');
    const { config } = require('../../config');
    
    const itemsPerPage = config.CARD_ADD_SYSTEM?.ITEMS_PER_PAGE || 15;
    const result = getMissingCards(page, itemsPerPage);
    const cacheInfo = getCacheInfo();

    console.log('[CADD LIST] Retrieved missing cards:', {
      page: result.pagination.currentPage,
      totalPages: result.pagination.totalPages,
      totalItems: result.pagination.totalItems,
      cardsInPage: result.cards.length
    });

    // 캐시가 비어있거나 오래된 경우
    if (result.pagination.totalItems === 0) {
      const embed = new EmbedBuilder()
        .setTitle('🎉 Missing Cards List')
        .setDescription('**Great news!** All cards have v1 images, or the cache is being updated.')
        .setColor('#00FF00')
        .addFields(
          { name: 'Cache Status', value: `Last updated: ${cacheInfo.lastUpdate ? new Date(cacheInfo.lastUpdate).toLocaleString() : 'Never'}`, inline: false }
        )
        .setFooter({ text: 'Use "ca missing refresh" to update the cache manually' });

      return message.reply({ embeds: [embed] });
    }

    // 캐시가 오래된 경우 경고
    const cacheAge = Date.now() - cacheInfo.lastUpdate;
    const cacheAgeHours = Math.floor(cacheAge / (1000 * 60 * 60));
    const isCacheOld = cacheAgeHours > 24;

    // 현재 페이지의 카드 목록 생성 - 명령어 형태로 수정
    let cardListText = '';
    result.cards.forEach((card, index) => {
      const listNumber = ((result.pagination.currentPage - 1) * itemsPerPage) + index + 1;
      
      // 우선순위 이모지
      const priorityEmoji = card.weight <= 2 ? '🔥' : 
                           card.weight <= 4 ? '⭐' : '📝';
      
      // 스킬 타입 이모지
      const skillEmoji = {
        'mining': '⛏️',
        'fishing': '🎣',
        'battle': '⚔️',
        'building': '🏗️',
        'farming': '🌾',
        'crafting': '🔨',
        'excavation': '🔍',
        'researching': '📚',
        'gathering': '🧺'
      };
      
      const skillEmj = skillEmoji[card.skillType] || '❓';
      
      // 시리즈명과 캐릭터명 정리 (명령어에 사용할 수 있게)
      const seriesNameForCommand = card.series;
      const characterNameForCommand = card.name;
      
      // 캐릭터명에 공백이 있으면 따옴표로 감싸기
      const formattedCharacterName = characterNameForCommand.includes(' ') 
        ? `"${characterNameForCommand}"` 
        : characterNameForCommand;
      
      // 명령어 형태로 표시
      const command = `cadd ${seriesNameForCommand} ${formattedCharacterName} v1`;
      
      cardListText += `**${listNumber}.** ${priorityEmoji} ${skillEmj} \`${command}\`\n`;
    });

    // 임베드 생성
    const embed = new EmbedBuilder()
      .setTitle('📋 Missing Cards List (v1 Images)')
      .setDescription(`Copy and paste these commands to request missing cards:\n\n${cardListText}`)
      .setColor('#FF9900')
      .addFields(
        { 
          name: 'Page Info', 
          value: `Page ${result.pagination.currentPage}/${result.pagination.totalPages} | Total: ${result.pagination.totalItems} missing cards`, 
          inline: false 
        },
        { 
          name: 'Legend', 
          value: '🔥 High Priority (Weight ≤2) | ⭐ Medium Priority (Weight 3-4) | 📝 Low Priority (Weight 5+)', 
          inline: false 
        },
        {
          name: 'How to Use',
          value: 'Copy any `cadd` command above and paste it in chat, then upload the card image when prompted.',
          inline: false
        }
      )
      .setFooter({ 
        text: `Last cache update: ${new Date(cacheInfo.lastUpdate).toLocaleString()}${isCacheOld ? ' (⚠️ Cache is old)' : ''}` 
      });

    // 캐시가 오래된 경우 경고 추가
    if (isCacheOld) {
      embed.addFields({
        name: '⚠️ Cache Warning',
        value: `Cache is ${cacheAgeHours} hours old. Consider using \`ca missing refresh\` to update.`,
        inline: false
      });
    }

    // 페이지네이션 버튼 생성
    const row = new ActionRowBuilder();
    
    // 첫 페이지 버튼
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`caddlist_first_${message.author.id}_${result.pagination.currentPage}`)
        .setLabel('⏮️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!result.pagination.hasPrev)
    );
    
    // 이전 페이지 버튼
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`caddlist_prev_${message.author.id}_${result.pagination.currentPage}`)
        .setLabel('◀️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!result.pagination.hasPrev)
    );
    
    // 다음 페이지 버튼
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`caddlist_next_${message.author.id}_${result.pagination.currentPage}`)
        .setLabel('▶️')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!result.pagination.hasNext)
    );
    
    // 마지막 페이지 버튼
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`caddlist_last_${message.author.id}_${result.pagination.currentPage}`)
        .setLabel('⏭️')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!result.pagination.hasNext)
    );
    
    // 캐시 새로고침 버튼
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`caddlist_refresh_${message.author.id}`)
        .setLabel('🔄')
        .setStyle(ButtonStyle.Success)
    );

    // 메시지 전송
    const replyMessage = await message.reply({ 
      embeds: [embed], 
      components: [row] 
    });

    // 2분 후 버튼 비활성화
    setTimeout(async () => {
      try {
        const disabledRow = new ActionRowBuilder();
        row.components.forEach(button => {
          disabledRow.addComponents(
            ButtonBuilder.from(button).setDisabled(true)
          );
        });
        
        await replyMessage.edit({ components: [disabledRow] });
      } catch (error) {
        console.error('[CADD LIST] Error disabling buttons:', error);
      }
    }, 2 * 60 * 1000);

  } catch (error) {
    console.error('[CADD LIST ERROR] Error in handleMissingCardsList:', error);
    message.reply('❌ An error occurred while loading the missing cards list.');
  }
}

/**
 * Missing Cards List 페이지네이션 버튼 처리
 * @param {Object} interaction - 버튼 인터랙션 객체
 */
async function handleMissingCardsListPagination(interaction) {
  try {
    // 버튼 ID 파싱: caddlist_[action]_[userId]_[currentPage]
    const [, action, userId, currentPageStr] = interaction.customId.split('_');
    const currentPage = parseInt(currentPageStr);
    
    // 권한 확인 (요청한 사용자만 페이지네이션 가능)
    if (interaction.user.id !== userId) {
      return interaction.reply({
        content: 'You can only navigate your own card list.',
        ephemeral: true
      });
    }

    // 새로고침 액션 처리
    if (action === 'refresh') {
      await interaction.deferUpdate();
      
      // 관리자 권한 확인 (새로고침은 관리자만 가능)
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.followUp({
          content: '❌ You need administrator permissions to refresh the cache.',
          ephemeral: true
        });
      }

      try {
        const { forceCacheUpdate } = require('../utils/missingCardsCache');
        const success = forceCacheUpdate();
        
        if (success) {
          // 캐시 업데이트 후 현재 페이지 다시 로드
          await updateMissingCardsListMessage(interaction, 1); // 첫 페이지로 리셋
          await interaction.followUp({
            content: '✅ Missing cards cache has been refreshed!',
            ephemeral: true
          });
        } else {
          await interaction.followUp({
            content: '❌ Failed to refresh cache.',
            ephemeral: true
          });
        }
      } catch (error) {
        console.error('Error refreshing cache:', error);
        await interaction.followUp({
          content: '❌ An error occurred while refreshing cache.',
          ephemeral: true
        });
      }
      return;
    }

    // 페이지 계산
    let newPage = currentPage;
    switch (action) {
      case 'first':
        newPage = 1;
        break;
      case 'prev':
        newPage = Math.max(1, currentPage - 1);
        break;
      case 'next':
        newPage = currentPage + 1;
        break;
      case 'last':
        // 마지막 페이지 계산
        const { getMissingCards } = require('../utils/missingCardsCache');
        const { config } = require('../../config');
        const itemsPerPage = config.CARD_ADD_SYSTEM?.ITEMS_PER_PAGE || 15;
        const tempResult = getMissingCards(1, itemsPerPage);
        newPage = tempResult.pagination.totalPages;
        break;
      default:
        return interaction.reply({
          content: 'Invalid pagination action.',
          ephemeral: true
        });
    }

    // 페이지 업데이트
    await interaction.deferUpdate();
    await updateMissingCardsListMessage(interaction, newPage);

  } catch (error) {
    console.error('Error handling missing cards list pagination:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: '❌ An error occurred while navigating the list.',
        ephemeral: true
      });
    } else {
      await interaction.followUp({
        content: '❌ An error occurred while navigating the list.',
        ephemeral: true
      });
    }
  }
}

/**
 * Missing Cards List 메시지 업데이트
 * @param {Object} interaction - 인터랙션 객체
 * @param {number} page - 새 페이지 번호
 */
async function updateMissingCardsListMessage(interaction, page) {
  try {
    // 누락된 카드 데이터 가져오기
    const { getMissingCards, getCacheInfo } = require('../utils/missingCardsCache');
    const { config } = require('../../config');
    
    const itemsPerPage = config.CARD_ADD_SYSTEM?.ITEMS_PER_PAGE || 15;
    const result = getMissingCards(page, itemsPerPage);
    const cacheInfo = getCacheInfo();

    // 캐시가 비어있는 경우
    if (result.pagination.totalItems === 0) {
      const embed = new EmbedBuilder()
        .setTitle('🎉 Missing Cards List')
        .setDescription('**Great news!** All cards have v1 images, or the cache is being updated.')
        .setColor('#00FF00')
        .addFields(
          { name: 'Cache Status', value: `Last updated: ${cacheInfo.lastUpdate ? new Date(cacheInfo.lastUpdate).toLocaleString() : 'Never'}`, inline: false }
        )
        .setFooter({ text: 'Use "ca missing refresh" to update the cache manually' });

      await interaction.editReply({ embeds: [embed], components: [] });
      return;
    }

    // 캐시가 오래된 경우 경고
    const cacheAge = Date.now() - cacheInfo.lastUpdate;
    const cacheAgeHours = Math.floor(cacheAge / (1000 * 60 * 60));
    const isCacheOld = cacheAgeHours > 24;

    // 현재 페이지의 카드 목록 생성 - 명령어 형태로
    let cardListText = '';
    result.cards.forEach((card, index) => {
      const listNumber = ((result.pagination.currentPage - 1) * itemsPerPage) + index + 1;
      
      // 우선순위 이모지
      const priorityEmoji = card.weight <= 2 ? '🔥' : 
                           card.weight <= 4 ? '⭐' : '📝';
      
      // 스킬 타입 이모지
      const skillEmoji = {
        'mining': '⛏️',
        'fishing': '🎣',
        'battle': '⚔️',
        'building': '🏗️',
        'farming': '🌾',
        'crafting': '🔨',
        'excavation': '🔍',
        'researching': '📚',
        'gathering': '🧺'
      };
      
      const skillEmj = skillEmoji[card.skillType] || '❓';
      
      // 시리즈명과 캐릭터명 정리
      const seriesNameForCommand = card.series;
      const characterNameForCommand = card.name;
      
      // 캐릭터명에 공백이 있으면 따옴표로 감싸기
      const formattedCharacterName = characterNameForCommand.includes(' ') 
        ? `"${characterNameForCommand}"` 
        : characterNameForCommand;
      
      // 명령어 형태로 표시
      const command = `cadd ${seriesNameForCommand} ${formattedCharacterName} v1`;
      
      cardListText += `**${listNumber}.** ${priorityEmoji} ${skillEmj} \`${command}\`\n`;
    });

    // 임베드 업데이트
    const embed = new EmbedBuilder()
      .setTitle('📋 Missing Cards List (v1 Images)')
      .setDescription(`Copy and paste these commands to request missing cards:\n\n${cardListText}`)
      .setColor('#FF9900')
      .addFields(
        { 
          name: 'Page Info', 
          value: `Page ${result.pagination.currentPage}/${result.pagination.totalPages} | Total: ${result.pagination.totalItems} missing cards`, 
          inline: false 
        },
        { 
          name: 'Legend', 
          value: '🔥 High Priority (Weight ≤2) | ⭐ Medium Priority (Weight 3-4) | 📝 Low Priority (Weight 5+)', 
          inline: false 
        },
        {
          name: 'How to Use',
          value: 'Copy any `cadd` command above and paste it in chat, then upload the card image when prompted.',
          inline: false
        }
      )
      .setFooter({ 
        text: `Last cache update: ${new Date(cacheInfo.lastUpdate).toLocaleString()}${isCacheOld ? ' (⚠️ Cache is old)' : ''}` 
      });

    // 캐시가 오래된 경우 경고 추가
    if (isCacheOld) {
      embed.addFields({
        name: '⚠️ Cache Warning',
        value: `Cache is ${cacheAgeHours} hours old. Consider using \`ca missing refresh\` to update.`,
        inline: false
      });
    }

    // 버튼 업데이트
    const row = new ActionRowBuilder();
    
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`caddlist_first_${interaction.user.id}_${result.pagination.currentPage}`)
        .setLabel('⏮️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!result.pagination.hasPrev),
      new ButtonBuilder()
        .setCustomId(`caddlist_prev_${interaction.user.id}_${result.pagination.currentPage}`)
        .setLabel('◀️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!result.pagination.hasPrev),
      new ButtonBuilder()
        .setCustomId(`caddlist_next_${interaction.user.id}_${result.pagination.currentPage}`)
        .setLabel('▶️')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!result.pagination.hasNext),
      new ButtonBuilder()
        .setCustomId(`caddlist_last_${interaction.user.id}_${result.pagination.currentPage}`)
        .setLabel('⏭️')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!result.pagination.hasNext),
      new ButtonBuilder()
        .setCustomId(`caddlist_refresh_${interaction.user.id}`)
        .setLabel('🔄')
        .setStyle(ButtonStyle.Success)
    );

    // 메시지 업데이트
    await interaction.editReply({ 
      embeds: [embed], 
      components: [row] 
    });

  } catch (error) {
    console.error('Error updating missing cards list message:', error);
    throw error;
  }
}

module.exports = {
  handleCardAddCommand,
  handleImageUpload,
  handleAdminApproval,
  handleMissingCardsListPagination
};