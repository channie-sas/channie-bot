// src/commands/currencyCommands.js
const { PermissionsBitField } = require('discord.js');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { config } = require('../../config');
const { transferMultipleCards } = require('../database/cardTransferModel');
const { ITEM_TYPES, ITEM_DISPLAY_NAMES } = require('../database/itemTypes');
const { initUserData, saveUserDataThrottled } = require('../database/userData');
const { 
  getUserItem,
  addUserItem,
  removeUserItem,
  transferUserItem,
  getUserInventory 
} = require('../database/inventoryModel');
const { cardDatabase } = require('../database/cardDatabase');
const { generateUniqueCardId } = require('../utils/cardIdGenerator');
const { generateGValue, generateSkillStats, selectRandomVariant, getRandomSkillType } = require('../utils/cardUtils');
const { incrementCardStat } = require('../database/cardStats');

// 사용자 인벤토리 확인 명령어 (ci)
async function handleInventoryCommand(message, targetUserIdOrMention = null) {
  // 대상 사용자 ID 처리 - 멘션이 있는 경우 해당 사용자의 ID 추출
  let targetUserId = message.author.id; // 기본값은 메시지 작성자
  let targetUser = message.author;
  
  if (targetUserIdOrMention) {
    // @멘션에서 ID 추출 (<@123456789> 형식)
    const mentionMatch = targetUserIdOrMention.match(/<@!?(\d+)>/);
    if (mentionMatch) {
      targetUserId = mentionMatch[1];
      targetUser = await message.client.users.fetch(targetUserId).catch(() => message.author);
    } else if (/^\d+$/.test(targetUserIdOrMention)) {
      // 숫자 ID가 직접 입력된 경우
      targetUserId = targetUserIdOrMention;
      targetUser = await message.client.users.fetch(targetUserId).catch(() => message.author);
    }
  }
  
  const userName = targetUser.username;
  
  // 사용자 데이터 초기화
  const userData = initUserData(targetUserId);
  const userInventory = getUserInventory(targetUserId);
  const userCards = userData.cards || [];
  
  // 인벤토리 임베드 생성
  const embed = new EmbedBuilder()
    .setTitle(`${userName}'s Inventory`)
    .setColor('#303136') // SOFI 스타일 색상
    .setThumbnail(targetUser.displayAvatarURL());
  
  // 인벤토리 아이템 표시
  let inventoryText = '';
  for (const [itemType, amount] of Object.entries(userInventory)) {
    if (ITEM_DISPLAY_NAMES[itemType]) {
      inventoryText += `**${ITEM_DISPLAY_NAMES[itemType]}**: ${amount}\n`;
    }
  }
  
  embed.addFields({ name: 'Items', value: inventoryText || 'No items', inline: false });
  embed.addFields({ name: 'Cards', value: `${userCards.length} cards collected`, inline: false });
  
  // 최근 획득한 3개의 카드 표시 (있는 경우)
  if (userCards.length > 0) {
    // 최신순으로 정렬
    const sortedCards = [...userCards].sort((a, b) => b.obtainedAt - a.obtainedAt);
    const recentCards = sortedCards
      .slice(0, 3)
      .map(card => {
        const variantText = card.variant ? ` (${card.variant})` : '';
        return `${card.name}${variantText}`;
      })
      .join('\n');
    
    embed.addFields({ 
      name: 'Recent Cards', 
      value: recentCards || 'No cards yet', 
      inline: false 
    });
  }
  
  // 네비게이션 버튼 생성
  const navigationRow = new ActionRowBuilder()
  .addComponents(
    new ButtonBuilder()
      .setCustomId(`nav_profile_${targetUserId}_${message.author.id}`)
      .setLabel('Profile')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`nav_inventory_${targetUserId}_${message.author.id}`)
      .setLabel('Inventory')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`nav_collection_${targetUserId}_${message.author.id}`)
      .setLabel('Collection')
      .setStyle(ButtonStyle.Secondary)
  );
  
  message.reply({ 
    embeds: [embed],
    components: [navigationRow]
  });
}

// 아이템 수정 관리자 명령어 (cmod)
async function handleItemModCommand(message, args) {
  // 관리자 권한 확인
  if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    message.reply('This command can only be used by server administrators.');
    return;
  }
  
  if (args.length < 3) {
    let itemTypes = Object.values(ITEM_TYPES).map(type => `\`${type}\``).join(', ');
    message.reply(`Usage: cmod [add/remove] [item_type] [@user] [amount]\nFor cards: cmod add card [@user] [card name or card ID]`);
    return;
  }
  
  const [action, itemType, userMention, ...rest] = args;
  
  // Card 타입 특별 처리
  if (itemType.toLowerCase() === 'card') {
    if (action.toLowerCase() !== 'add') {
      message.reply('Only "add" action is supported for cards.');
      return;
    }
    
    return handleAddCardCommand(message, userMention, rest.join(' '));
  }
  
  // 일반 아이템 타입 검증
  if (!Object.values(ITEM_TYPES).includes(itemType)) {
    let itemTypes = Object.values(ITEM_TYPES).map(type => `\`${type}\``).join(', ');
    message.reply(`Invalid item type. Available types: ${itemTypes}`);
    return;
  }
  
  // 멘션에서 유저 ID 추출
  const userId = userMention.replace(/[<@!>]/g, '');
  const amountStr = rest[0];
  const amount = parseInt(amountStr);
  
  if (isNaN(amount) || amount <= 0) {
    message.reply('Amount must be a positive number.');
    return;
  }
  
  let newBalance;
  let actionTaken;
  
  // 아이템 추가 또는 제거
  if (action.toLowerCase() === 'add') {
    newBalance = addUserItem(userId, itemType, amount);
    actionTaken = 'added to';
  } else if (action.toLowerCase() === 'remove') {
    newBalance = removeUserItem(userId, itemType, amount);
    actionTaken = 'removed from';
  } else {
    message.reply('Action must be either "add" or "remove".');
    return;
  }
  
  message.reply(`Successfully ${actionTaken} <@${userId}>'s ${ITEM_DISPLAY_NAMES[itemType]}. New balance: ${newBalance} ${ITEM_DISPLAY_NAMES[itemType]}.`);
}


// 카드 추가 명령어 처리 함수
async function handleAddCardCommand(message, userMention, cardIdentifier) {
  // 멘션에서 유저 ID 추출
  const userId = userMention.replace(/[<@!>]/g, '');
  
  // 사용자 데이터 불러오기
  const user = initUserData(userId);
  
  // 카드 식별자가 비어있는지 확인
  if (!cardIdentifier || cardIdentifier.trim() === '') {
    message.reply('Please provide a card name or card ID.');
    return;
  }
  
  let cardName, cardSeries, foundCard;
  
  // 기존 카드 ID인지 확인 (사용자 카드 ID)
  const existingCardById = user.cards.find(card => card.uniqueId === cardIdentifier);
  
  if (existingCardById) {
    // 찾은 카드 정보 가져오기
    cardName = existingCardById.name;
    cardSeries = existingCardById.series;
    
    // 해당 이름과 시리즈의 카드 찾기
    for (const [series, cards] of Object.entries(cardDatabase)) {
      if (series === cardSeries) {
        foundCard = cards.find(c => c.name === cardName);
        if (foundCard) break;
      }
    }
  } else {
    // 이름으로 카드 찾기
    for (const [series, cards] of Object.entries(cardDatabase)) {
      foundCard = cards.find(c => c.name.toLowerCase() === cardIdentifier.toLowerCase());
      if (foundCard) {
        cardName = foundCard.name;
        cardSeries = series;
        break;
      }
    }
  }
  
  if (!foundCard) {
    message.reply(`Card "${cardIdentifier}" not found in the database.`);
    return;
  }
  
  // 현재 시간
  const now = Date.now();
  
  // 고유 ID 생성
  const uniqueId = generateUniqueCardId();
  
  // 카드의 스킬 타입 설정 - 기존 카드의 스킬 시스템과 일치하도록 
  // 랜덤 스킬 타입 가져오기 (카드 시스템과 일관되게)
  const skillType = foundCard.type === 'resource' ? 'mining' : getRandomSkillType();
  
  // 스킬 스탯 생성
  const skillStats = generateSkillStats(skillType);
  
  // 카드의 변형(variant) 결정
  let variant;
  if (foundCard.variants && foundCard.variants.length > 0) {
    // 가용 변형 중 하나 선택
    variant = selectRandomVariant(foundCard);
    if (!variant) variant = 'normal'; // 가용 변형이 없는 경우 기본값
  } else {
    // 변형 목록이 없으면 카드의 현재 변형 사용 또는 기본값
    variant = foundCard.variant || 'normal';
  }
  
  // 카드 gValue 생성
  const gValue = generateGValue();
  
  // 새 카드 생성
  const newCard = {
    uniqueId: uniqueId,
    cardId: foundCard.id,
    name: cardName,
    series: cardSeries,
    variant: variant,
    level: 1,
    type: foundCard.type || 'normal',
    skillType: skillType,
    gValue: gValue,
    skillStats: skillStats,
    obtainedAt: now
  };
  
  // 자원 카드인 경우 추가 속성
  if (foundCard.type === 'resource') {
    newCard.mineralComposition = foundCard.mineralComposition;
    newCard.resourceValue = foundCard.resourceValue;
    newCard.minableUsers = foundCard.minableUsers || [];
  }
  
  // 카드를 사용자에게 추가
  user.cards.push(newCard);
  saveUserDataThrottled();
  
  // 카드 랭킹과 총량 서버 통계에 넣기
  incrementCardStat(foundCard.id, userId, variant, 1, cardSeries);
  
  // 응답 메시지 결정
  let responseMsg;
  if (foundCard.type === 'resource') {
    responseMsg = `Successfully added resource card "${cardName}" to <@${userId}> with ID: \`${uniqueId}\``;
  } else {
    responseMsg = `Successfully added "${cardName}" (${cardSeries}) card to <@${userId}> with Variant: ${variant}, Skill: ${skillType}, G•${gValue}, ID: \`${uniqueId}\``;
  }
  
  message.reply(responseMsg);
}


// 카드 전송 명령어 처리 함수 수정
async function handleCardTransferCommand(message, args) {
  if (args.length < 3) {
    message.reply(`Usage: sg [@user] card [card-id1], [card-id2], ... - Transfer multiple cards separated by commas`);
    return;
  }
  
  const [userMention, itemType] = args;
  const cardIdsInput = args.slice(2).join(' ').trim();
  
  // 카드 전송 여부 확인
  if (itemType.toLowerCase() !== 'card') {
    return handleItemTransferCommand(message, args);
  }
  
  // 멘션에서 유저 ID 추출
  const toUserId = userMention.replace(/[<@!>]/g, '');
  const fromUserId = message.author.id;
  
  // 자기 자신에게 전송하는지 확인
  if (toUserId === fromUserId) {
    message.reply(`You cannot send cards to yourself.`);
    return;
  }
  
  // 카드 ID들 분리
  const cardIds = cardIdsInput.split(',').map(id => id.trim()).filter(id => id.length > 0);
  
  if (cardIds.length === 0) {
    message.reply(`Please provide at least one valid card ID. Card IDs can be found in your collection with the cc command.`);
    return;
  }
  
  // 전송비 안내
  const transferFee = config.CARD_TRANSFER_FEE;
  const userCredits = getUserItem(fromUserId, ITEM_TYPES.CREDIT);
  
  if (userCredits < transferFee) {
    message.reply(`You need ${transferFee} credits to transfer cards. Your current balance: ${userCredits} credits.`);
    return;
  }
  
  // 카드 전송 요청 생성
  const result = transferMultipleCards(fromUserId, toUserId, cardIds);
  
  if (!result.success) {
    message.reply(result.message);
    return;
  }
  
  // 전송 카드 정보 생성
  const cardInfoList = result.cards.map(card => {
    const gValue = card.gValue ? `G•${card.gValue}` : '';
    return `${card.name} (${card.series}) ${gValue}`;
  }).join('\n');
  
  // 양쪽 모두를 위한 버튼 생성
  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`transfer_accept_sender_${result.transferId}`)
        .setLabel('✓ Sender Confirm')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`transfer_accept_receiver_${result.transferId}`)
        .setLabel('✓ Receiver Accept')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`transfer_reject_${result.transferId}`)
        .setLabel('✗ Cancel')
        .setStyle(ButtonStyle.Danger)
    );
  
  // 공통 임베드 생성
  const transferEmbed = new EmbedBuilder()
    .setTitle(`Card Transfer - Confirmation Required`)
    .setDescription(`<@${fromUserId}> is sending ${result.cards.length} cards to <@${toUserId}>.\nTransfer fee: ${transferFee} credits\n\nBoth sender and receiver must confirm.`)
    .addFields({ name: 'Cards to transfer', value: cardInfoList })
    .setColor('#ff9900')
    .setFooter({ text: 'Expires in 1 minute' });
  
  // 하나의 메시지만 전송
  await message.channel.send({ 
    content: `Card transfer: <@${fromUserId}> → <@${toUserId}>`, 
    embeds: [transferEmbed], 
    components: [row] 
  });
}

// 아이템 전송 명령어 cg)
async function handleItemTransferCommand(message, args) {
  if (args.length < 3) {
    let itemTypes = Object.values(ITEM_TYPES).map(type => `\`${type}\``).join(', ');
    message.reply(`Usage: cg [@user] [item_type] [amount]\nAvailable item types: ${itemTypes}`);
    return;
  }
  
  const [userMention, itemType, amountStr] = args;
  
  // 아이템 타입 검증
  if (!Object.values(ITEM_TYPES).includes(itemType)) {
    let itemTypes = Object.values(ITEM_TYPES).map(type => `\`${type}\``).join(', ');
    message.reply(`Invalid item type. Available types: ${itemTypes}`);
    return;
  }
  
  // 멘션에서 유저 ID 추출
  const toUserId = userMention.replace(/[<@!>]/g, '');
  const fromUserId = message.author.id;
  
  // 자기 자신에게 전송하는지 확인
  if (toUserId === fromUserId) {
    message.reply(`You cannot send items to yourself.`);
    return;
  }
  
  const amount = parseInt(amountStr);
  
  if (isNaN(amount) || amount <= 0) {
    message.reply(`Please enter a valid positive amount.`);
    return;
  }
  
  const currentAmount = getUserItem(fromUserId, itemType);
  
  // 충분한 아이템이 있는지 확인
  if (currentAmount < amount) {
    message.reply(`You don't have enough ${ITEM_DISPLAY_NAMES[itemType]}. Your current balance: ${currentAmount} ${ITEM_DISPLAY_NAMES[itemType]}.`);
    return;
  }
  
  // 아이템 전송 실행
  const result = transferUserItem(fromUserId, toUserId, itemType, amount);
  
  if (result.success) {
    message.reply(`Successfully sent ${amount} ${ITEM_DISPLAY_NAMES[itemType]} to <@${toUserId}>. Your new balance: ${result.fromUserAmount} ${ITEM_DISPLAY_NAMES[itemType]}.`);
  } else {
    message.reply(result.message);
  }
}

module.exports = {
  handleInventoryCommand,
  handleItemModCommand,
  handleItemTransferCommand,
  handleCardTransferCommand,
  handleAddCardCommand
};