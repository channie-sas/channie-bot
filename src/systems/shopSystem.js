// src/systems/shopSystem.js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { ITEM_TYPES, ITEM_DISPLAY_NAMES, ITEM_DETAILS } = require('../database/itemTypes');
const { getUserItem, addUserItem, removeUserItem } = require('../database/inventoryModel');
const { initUserData, saveUserDataThrottled } = require('../database/userData');
const fs = require('fs');
const path = require('path');
const { config } = require('../../config');

// 상점 데이터
let shopData = {
  channels: [],
  currentShops: {},
  purchaseHistory: {}
};

// 상점 데이터 파일 경로
const SHOP_DATA_PATH = path.join(config.paths.DATA_DIR, 'shopData.json');

/**
 * 상점 데이터 로드
 */
function loadShopData() {
  try {
    if (fs.existsSync(SHOP_DATA_PATH)) {
      const data = JSON.parse(fs.readFileSync(SHOP_DATA_PATH, 'utf8'));
      shopData = { ...shopData, ...data };
    }
  } catch (error) {
    console.error('Error loading shop data:', error);
  }
}

/**
 * 상점 데이터 저장
 */
function saveShopData() {
  try {
    fs.writeFileSync(SHOP_DATA_PATH, JSON.stringify(shopData, null, 2));
  } catch (error) {
    console.error('Error saving shop data:', error);
  }
}

/**
 * 상점 채널 설정/해제
 * @param {string} channelId - 채널 ID
 * @returns {boolean} 설정 여부
 */
function toggleShopChannel(channelId) {
  const index = shopData.channels.indexOf(channelId);
  if (index === -1) {
    shopData.channels.push(channelId);
    saveShopData();
    return true;
  } else {
    shopData.channels.splice(index, 1);
    saveShopData();
    return false;
  }
}

/**
 * 랜덤 상점 아이템 생성
 * @returns {Array} 상점 아이템 목록
 */
function generateShopItems() {
  const shopItems = [];
  const availableItems = Object.entries(ITEM_DETAILS)
    .filter(([_, details]) => details.basePrice)
    .map(([itemType, _]) => itemType);
  
  // 랜덤하게 2개 아이템 선택
  const selectedItems = [];
  while (selectedItems.length < 2 && availableItems.length > 0) {
    const randomIndex = Math.floor(Math.random() * availableItems.length);
    const item = availableItems[randomIndex];
    if (!selectedItems.includes(item)) {
      selectedItems.push(item);
    }
  }
  
  // 각 아이템에 대한 정보 생성
  for (const itemType of selectedItems) {
    const details = ITEM_DETAILS[itemType];
    const quantity = details.shopQuantity
      ? Math.floor(Math.random() * (details.shopQuantity.max - details.shopQuantity.min + 1)) + details.shopQuantity.min
      : 1;
    
    // 가격 시세 계산 (-50% ~ +100%)
    const priceMultiplier = 0.5 + Math.random() * 1.5;
    const finalPrice = Math.floor(details.basePrice * quantity * priceMultiplier);
    
    shopItems.push({
      type: itemType,
      quantity: quantity,
      basePrice: details.basePrice,
      priceMultiplier: priceMultiplier,
      finalPrice: finalPrice
    });
  }
  
  return shopItems;
}

/**
 * 상점 메시지 생성
 * @param {Array} shopItems - 상점 아이템 목록
 * @returns {Object} 메시지 옵션
 */
function createShopMessage(shopItems) {
  const embed = new EmbedBuilder()
    .setTitle('🛒 Shop')
    .setDescription('Limited time offers! Each player can only buy each item once.')
    .setColor('#FFD700')
    .setFooter({ text: 'Shop refreshes every hour' });
  
  shopItems.forEach((item, index) => {
    const displayName = ITEM_DISPLAY_NAMES[item.type];
    const priceChange = Math.round((item.priceMultiplier - 1) * 100);
    const priceEmoji = priceChange >= 0 ? '📈' : '📉';
    
    embed.addFields({
      name: `${index + 1}. ${displayName} x${item.quantity}`,
      value: `Price: ${item.finalPrice} credits ${priceEmoji} (${priceChange >= 0 ? '+' : ''}${priceChange}%)`,
      inline: true
    });
  });
  
  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('shop_buy_0')
        .setLabel('Buy Item 1')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('shop_buy_1')
        .setLabel('Buy Item 2')
        .setStyle(ButtonStyle.Primary)
    );
  
  return { embeds: [embed], components: [row] };
}

/**
 * 상점 생성 및 표시
 * @param {Object} client - Discord 클라이언트
 */
async function spawnShops(client) {
  // 이전 상점 메시지 삭제
  for (const [channelId, shopInfo] of Object.entries(shopData.currentShops)) {
    try {
      const channel = client.channels.cache.get(channelId);
      if (channel && shopInfo.messageId) {
        const message = await channel.messages.fetch(shopInfo.messageId).catch(() => null);
        if (message) {
          await message.delete().catch(() => {});
        }
      }
    } catch (error) {
      console.error('Error deleting old shop message:', error);
    }
  }
  
  // 새로운 상점 생성
  shopData.currentShops = {};
  shopData.purchaseHistory = {};
  
  for (const channelId of shopData.channels) {
    try {
      const channel = client.channels.cache.get(channelId);
      if (!channel) continue;
      
      const shopItems = generateShopItems();
      const messageOptions = createShopMessage(shopItems);
      
      const message = await channel.send(messageOptions);
      
      shopData.currentShops[channelId] = {
        messageId: message.id,
        items: shopItems,
        createdAt: Date.now()
      };
    } catch (error) {
      console.error(`Error spawning shop in channel ${channelId}:`, error);
    }
  }
  
  saveShopData();
}

/**
 * 상점 구매 처리
 * @param {Object} interaction - 인터랙션 객체
 * @param {number} itemIndex - 아이템 인덱스
 */
async function handleShopPurchase(interaction, itemIndex) {
  const channelId = interaction.channel.id;
  const userId = interaction.user.id;
  const shopInfo = shopData.currentShops[channelId];
  
  if (!shopInfo || !shopInfo.items[itemIndex]) {
    return interaction.reply({
      content: 'This shop is no longer available.',
      ephemeral: true
    });
  }
  
  const item = shopInfo.items[itemIndex];
  
  // 구매 이력 확인
  const purchaseKey = `${channelId}_${itemIndex}`;
  if (shopData.purchaseHistory[purchaseKey]?.includes(userId)) {
    return interaction.reply({
      content: 'You have already purchased this item.',
      ephemeral: true
    });
  }
  
  // 크레딧 확인
  const userCredits = getUserItem(userId, ITEM_TYPES.CREDIT);
  if (userCredits < item.finalPrice) {
    return interaction.reply({
      content: `You need ${item.finalPrice} credits to purchase this item. You have ${userCredits} credits.`,
      ephemeral: true
    });
  }
  
  // 구매 처리
  removeUserItem(userId, ITEM_TYPES.CREDIT, item.finalPrice);
  addUserItem(userId, item.type, item.quantity);
  
  // 구매 이력 기록
  if (!shopData.purchaseHistory[purchaseKey]) {
    shopData.purchaseHistory[purchaseKey] = [];
  }
  shopData.purchaseHistory[purchaseKey].push(userId);
  
  saveShopData();
  
  // 응답
  const displayName = ITEM_DISPLAY_NAMES[item.type];
  await interaction.reply({
    content: `Successfully purchased ${item.quantity}x ${displayName} for ${item.finalPrice} credits!`,
    ephemeral: true
  });
}

module.exports = {
  loadShopData,
  toggleShopChannel,
  spawnShops,
  handleShopPurchase
};