// src/commands/dropCards.js - 최적화 버전
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const { config, prettyVariantName } = require('../../config');
const { initUserData, saveUserDataThrottled } = require('../database/userData');
const { getRandomCards } = require('../utils/cardUtils');
const { createCardDropImage } = require('../utils/imageUtils');
const { getWishlistUsers, getBatchWishlistUsers } = require('../database/wishlistDatabase');
const { formatTimeRemaining, setCooldownTimer } = require('../utils/timeUtils');

// 카드 드롭 처리 함수 - 최적화 버전
async function dropCards(message, userId) {
  try {
    // 드롭 채널 확인
    if (config.dropChannels.length > 0 && !config.dropChannels.includes(message.channel.id)) {
      await message.reply("Cards can only be dropped in designated drop channels.");
      return;
    }

    // 첫 단계: 쿨다운 체크만 수행하는 메시지 전송
    const loadingMessage = await message.reply("Checking drop cooldown...");
    
    const user = initUserData(userId);
    const now = Date.now();
    
    // 쿨다운 계산
    const maxDropCount = 1; // 기본값으로 고정
    const adjustedDropCooldown = config.DROP_COOLDOWN; // 기본 쿨다운 사용
    
    // remainingDrops 필드가 없으면 초기화
    if (user.remainingDrops === undefined) {
      user.remainingDrops = maxDropCount;
    }
    
    // 쿨다운 체크 - 남은 횟수가 0인 경우만
    if (user.remainingDrops <= 0) {
      if (user.lastDrop && now - user.lastDrop < adjustedDropCooldown * 1000) {
        const timeLeft = adjustedDropCooldown * 1000 - (now - user.lastDrop);
        await loadingMessage.edit(`You need to wait ${formatTimeRemaining(timeLeft)} before dropping cards again. (0/${maxDropCount} drops available)`);
        return;
      } else {
        // 쿨다운이 끝났으면 모든 드롭 횟수 복원
        user.remainingDrops = maxDropCount;
        user.lastDrop = 0; // 쿨다운 초기화
        saveUserDataThrottled();
      }
    }
    
    // 카드 준비 및 위시리스트 확인을 병렬로 처리
    await loadingMessage.edit(`Preparing your card drop... (${user.remainingDrops}/${maxDropCount} drops available)`);
    
    // 병렬 처리: 카드 선택과 이미지 생성 준비
    const [cards, wishlistInfo] = await Promise.all([
      // 카드 선택
      Promise.resolve().then(() => {
        console.time('cardSelection');
        const selectedCards = getRandomCards(config.CARDS_PER_DROP);
        console.timeEnd('cardSelection');
        return selectedCards;
      }),
      
      // 위시리스트 미리 준비 (카드 선택 후 진행하기 위해 일단 빈 객체 반환)
      Promise.resolve({})
    ]);
    
    // 위시리스트 확인 (카드가 선택된 후)
    console.time('wishlistCheck');
    const wishlistResult = await checkWishlistNotifications(cards, userId);
    // 배치 위시리스트 결과도 함께 가져오기 (텍스트 생성 시 재사용, 일반 카드만)
    const { getBatchWishlistUsers } = require('../database/wishlistDatabase');
    const wishlistBatchResults = getBatchWishlistUsers(cards); // 자원 카드는 자동으로 제외됨
    console.timeEnd('wishlistCheck');
    
    // 이미지 생성 시작
    await loadingMessage.edit("Generating cards drop...");
    
    // 위시리스트 알림과 이미지 생성을 병렬로 처리
    const [dropImageBuffer] = await Promise.all([
      // 이미지 생성
      Promise.resolve().then(async () => {
        console.time('imageCreation');
        try {
          const buffer = await createCardDropImage(cards);
          console.timeEnd('imageCreation');
          return buffer;
        } catch (error) {
          console.error('Error creating drop image:', error);
          throw new Error('Image creation failed');
        }
      }),
      
      // 위시리스트 알림 처리 (있는 경우에만)
      wishlistResult.hasNotifications ? 
        sendWishlistNotifications(message, wishlistResult.users) : 
        Promise.resolve()
    ]);
    
    // 드롭 데이터 구성
    const dropId = `drop_${now}_${userId}`;
    const dropData = {
      cards: cards,
      timestamp: now,
      messageId: null,
      claimed: new Array(cards.length).fill(false)
    };
    
    // 유저 데이터 업데이트
    if (!user.pendingDrops) {
      user.pendingDrops = {};
    }
    user.pendingDrops[dropId] = dropData;
    
    // 남은 드롭 횟수 감소
    user.remainingDrops--;
    
    // 모든 드롭 횟수를 사용했으면 쿨다운 시작
    if (user.remainingDrops <= 0) {
      user.lastDrop = now;
      
      setCooldownTimer('drop', userId, async () => {
        try {
          const channel = await message.client.channels.fetch(message.channel.id);
          if (!channel) {
            console.error(`Channel not found for cooldown notification to user ${userId}`);
            return;
          }
          
          const updatedUser = initUserData(userId);
          updatedUser.remainingDrops = maxDropCount;
          updatedUser.lastDrop = 0;
          saveUserDataThrottled();
          
          await channel.send(`<@${userId}> Your drops have been recharged! You now have ${maxDropCount} drops available.`);
          console.log(`Drop cooldown notification sent to user ${userId}`);
        } catch (error) {
          console.error(`Error sending drop notification to user ${userId}:`, error);
        }
      }, adjustedDropCooldown * 1000);
    }
    
    saveUserDataThrottled();
    
    // 버튼 생성
    const row = new ActionRowBuilder();
    cards.forEach((card, index) => {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`select:${dropId}:${index}`)
          .setLabel(`${index + 1}`)
          .setStyle(ButtonStyle.Primary)
      );
    });
    
    // 이미지 첨부
    const attachment = new AttachmentBuilder(dropImageBuffer, { name: 'cards_drop.png' });
    
    // 1단계: 이미지만 먼저 전송
    const reply = await loadingMessage.edit({ 
      content: `<@${userId}> dropped some cards! Click a button to claim one!`, 
      files: [attachment], 
      components: [row] 
    });
    
    dropData.messageId = reply.id;
    saveUserDataThrottled();
    
    // 2단계: 카드 정보를 별도 메시지로 전송 (배치 위시리스트 결과 재사용)
    const skillInfo = generateCardInfoText(cards, userId, wishlistBatchResults);
    const infoContent = `${skillInfo}\n\`*You have ${user.remainingDrops}/${maxDropCount} drops remaining.*\``;
    
    await message.channel.send(infoContent);
    
    // 60초 후에 버튼 비활성화
    setTimeout(async () => {
      try {
        const updatedUser = initUserData(userId);
        if (!updatedUser.pendingDrops || !updatedUser.pendingDrops[dropId]) {
          return;
        }
        
        const dropData = updatedUser.pendingDrops[dropId];
        const disabledRow = new ActionRowBuilder();
        
        cards.forEach((card, index) => {
          disabledRow.addComponents(
            new ButtonBuilder()
              .setCustomId(`select:${dropId}:${index}`)
              .setLabel(`${index + 1}`)
              .setStyle(dropData.claimed[index] ? ButtonStyle.Secondary : ButtonStyle.Primary)
              .setDisabled(true)
          );
        });
        
        await reply.edit({ 
          content: `<@${userId}> dropped some cards! *(Expired)*`, 
          components: [disabledRow] 
        });
        
      } catch (error) {
        console.error(`Error disabling buttons for drop ${dropId}:`, error);
      }
    }, 60000);
    
  } catch (error) {
    console.error('Error in dropCards function:', error);
    await message.reply('An unexpected error occurred while processing your card drop. Please try again later.');
  }
}

/**
 * 위시리스트 알림 확인 (최적화 - 배치 조회 사용, 자원 카드 제외)
 */
async function checkWishlistNotifications(cards, userId) {
  const { getBatchWishlistUsers } = require('../database/wishlistDatabase');
  
  const wishlistUsers = new Set();
  let hasNotifications = false;
  
  // 배치로 일반 카드의 위시리스트를 한 번에 조회 (자원 카드 제외)
  const batchResults = getBatchWishlistUsers(cards);
  
  // 결과 처리
  for (const [cacheKey, usersWithWishlist] of batchResults.entries()) {
    // 드롭한 유저 제외
    const otherUsers = usersWithWishlist.filter(id => id !== userId);
    
    if (otherUsers.length > 0) {
      otherUsers.forEach(user => wishlistUsers.add(user));
      hasNotifications = true;
    }
  }
  
  return {
    hasNotifications,
    users: Array.from(wishlistUsers)
  };
}

/**
 * 위시리스트 알림 전송 (최적화 - 대기시간 제거)
 */
async function sendWishlistNotifications(message, users) {
  if (users.length === 0) return;
  
  const mentions = users.map(id => `<@${id}>`).join(' ');
  
  // 알림 전송 (대기시간 완전 제거)
  await message.channel.send(
    `${mentions} a card from your wishlist is about to drop!`
  );
  
  // await 덕분에 메시지 순서는 보장됨 - 대기시간 불필요
}

/**
 * 카드 정보 텍스트 생성
 */
function generateCardInfoText(cards, userId, wishlistBatchResults = null) {
  const { getWishlistUsers } = require('../database/wishlistDatabase');
  
  return cards.map((card, idx) => {
    // 자원 카드 처리 부분 완전 제거 - 모든 카드를 일반 카드로 처리
    const series = card.series || "Unknown Series";
    const variant = card.selectedVariant || card.variant || "v1";
    
    // 배치 결과가 있으면 재사용, 없으면 개별 조회
    let wishlistUsers = [];
    if (wishlistBatchResults) {
      const cacheKey = `${series}:${card.name}`;
      wishlistUsers = wishlistBatchResults.get(cacheKey) || [];
    } else {
      wishlistUsers = getWishlistUsers(card.name, series);
    }
    
    const wishlistCount = wishlistUsers.length;
    const isInDropperWishlist = wishlistUsers.includes(userId);
    const heartIcon = isInDropperWishlist ? '❤️' : '🤍';
    const wishlistText = ` \`[${heartIcon} ${wishlistCount}]\``;
    
    return `Card ${idx + 1} ${wishlistText} : ${card.name} - [${series}] \`(${variant})\` - ${card.skillType || 'Unknown skill'}`;
  }).join('\n');
}

module.exports = {
  dropCards
};