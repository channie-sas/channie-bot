// src/interactions/grabCard.js - 빌딩 기능 제거 버전
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { config, prettyVariantName } = require('../../config');
const { initUserData, saveUserDataThrottled, saveUserData } = require('../database/userData');
const { generateUniqueCardId } = require('../utils/cardIdGenerator');
const { generateGValue, generateSkillStats } = require('../utils/cardUtils');
const { getCardOwnerRanking, incrementCardStat } = require('../database/cardStats');
const { formatTimeRemaining, setCooldownTimer } = require('../utils/timeUtils');

// 카드 입찰자 저장을 위한 맵 (key: `${dropId}_${cardIndex}`, value: 입찰 데이터)
const cardBidders = new Map();

// 글로벌 타이머 관리 객체
if (!global.bidTimers) {
  global.bidTimers = {};
}

// 카드 처리 중 상태를 추적하는 맵 (동시성 문제 방지)
const processingCards = new Set();

// 사용자별 그랩 처리 락 맵 (동시성 문제 방지 강화)
const userGrabLocks = new Map();

// 입찰 타이머 설정 함수 (개선)
function setBidTimer(bidKey, interaction, delay) {
  console.log(`Setting bid timer for ${bidKey}, will process in ${delay}ms`);
  
  // 기존 타이머가 있으면 제거
  if (global.bidTimers[bidKey]) {
    clearTimeout(global.bidTimers[bidKey]);
    console.log(`Cleared existing timer for ${bidKey}`);
  }
  
  // 새 타이머 설정
  global.bidTimers[bidKey] = setTimeout(async () => {
    try {
      await processBidding(interaction, bidKey);
    } catch (error) {
      console.error(`Error in bid timer for ${bidKey}:`, error);
    } finally {
      delete global.bidTimers[bidKey]; // 처리 후 타이머 참조 제거
    }
  }, delay);
  
  return global.bidTimers[bidKey];
}

// 드롭 소유자 ID 안전하게 추출하는 함수
function extractDropOwnerId(dropId) {
  try {
    const parts = dropId.split('_');
    if (parts.length >= 3 && parts[0] === 'drop') {
      return parts[2]; // 'drop_timestamp_userId' 형태
    }
    console.error(`Invalid dropId format: ${dropId}`);
    return null;
  } catch (error) {
    console.error(`Error parsing dropId ${dropId}:`, error);
    return null;
  }
}

// 사용자별 그랩 락 획득 함수
function acquireUserGrabLock(userId) {
  if (userGrabLocks.has(userId)) {
    return false; // 이미 락이 걸려있음
  }
  
  userGrabLocks.set(userId, Date.now());
  return true;
}

// 사용자별 그랩 락 해제 함수
function releaseUserGrabLock(userId) {
  userGrabLocks.delete(userId);
}

// 원자적 그랩 횟수 체크 및 차감 함수
function atomicGrabCountCheck(userId, maxGrabCount) {
  const user = initUserData(userId);
  
  // remainingGrabs 필드가 없으면 초기화
  if (user.remainingGrabs === undefined) {
    user.remainingGrabs = maxGrabCount;
  }
  
  // 그랩 횟수가 충분한지 확인
  if (user.remainingGrabs <= 0) {
    return false;
  }
  
  // 그랩 횟수 차감
  user.remainingGrabs--;
  
  // 즉시 저장
  saveUserData();
  
  console.log(`Atomic grab count check: userId=${userId}, remaining=${user.remainingGrabs}/${maxGrabCount}`);
  return true;
}

// 그랩 횟수 복구 함수 (에러 발생 시 사용)
function restoreGrabCount(userId, maxGrabCount) {
  const user = initUserData(userId);
  user.remainingGrabs = Math.min(maxGrabCount, user.remainingGrabs + 1);
  saveUserData();
  console.log(`Restored grab count for userId=${userId}, remaining=${user.remainingGrabs}/${maxGrabCount}`);
}

// 카드 그랩 (선택) 처리 함수 - 빌딩 기능 제거 버전
async function grabCard(interaction, userId, dropId, cardIndex) {
  let interactionSuccess = true;
  const bidKey = `${dropId}_${cardIndex}`;
  
  // 사용자별 그랩 락 획득 시도
  if (!acquireUserGrabLock(userId)) {
    console.log(`User ${userId} is already processing a grab request`);
    try {
      await interaction.deferUpdate();
      await interaction.followUp({ 
        content: 'You are already processing another grab request. Please wait.', 
        ephemeral: true 
      });
    } catch (err) {
      console.error(`Could not send processing message to ${userId}:`, err.message);
    }
    return;
  }
  
  // 동시성 문제 방지: 이미 처리 중인 카드인지 확인
  if (processingCards.has(bidKey)) {
    console.log(`Card ${bidKey} is already being processed by another request`);
    try {
      await interaction.deferUpdate();
      await interaction.followUp({ 
        content: 'This card is currently being processed. Please wait.', 
        ephemeral: true 
      });
    } catch (err) {
      console.error(`Could not send processing message to ${userId}:`, err.message);
    } finally {
      releaseUserGrabLock(userId);
    }
    return;
  }
  
  // 처리 중 상태로 설정
  processingCards.add(bidKey);
  
  try {
    // 상호작용 즉시 응답 시도
    try {
      await interaction.deferUpdate();
    } catch (deferError) {
      console.log(`Interaction defer failed for user ${userId}, card ${cardIndex}: ${deferError.message}`);
      interactionSuccess = false;
    }
    
    const user = initUserData(userId);
    const now = Date.now();
    
    // 기본값으로 고정 (빌딩 효과 제거)
    const maxGrabCount = 1;
    const adjustedGrabCooldown = config.GRAB_COOLDOWN;
    
    // 드롭 소유자 ID 안전하게 추출
    const dropOwnerId = extractDropOwnerId(dropId);
    if (!dropOwnerId) {
      if (interactionSuccess) {
        await interaction.followUp({ content: 'Invalid drop data format.', ephemeral: true });
      }
      return;
    }
    
    console.log(`Grab attempt: userId=${userId}, dropOwnerId=${dropOwnerId}, isOwner=${userId === dropOwnerId}`);
    
    const dropOwner = initUserData(dropOwnerId);
    
    if (!dropOwner.pendingDrops || !dropOwner.pendingDrops[dropId]) {
      if (interactionSuccess) {
        await interaction.followUp({ content: 'This drop is no longer available.', ephemeral: true });
      }
      return;
    }
    
    const dropData = dropOwner.pendingDrops[dropId];
    
    // 이미 클레임된 카드인지 확인
    if (dropData.claimed[cardIndex]) {
      if (interactionSuccess) {
        await interaction.followUp({ content: 'This card has already been claimed.', ephemeral: true });
      }
      return;
    }
    
    // 선택한 카드 찾기
    const selectedCard = dropData.cards[cardIndex];
    if (!selectedCard) {
      if (interactionSuccess) {
        await interaction.followUp({ content: 'Invalid card selection.', ephemeral: true });
      }
      return;
    }
    
    // 쿨다운 확인 (그랩 횟수 체크 전에 먼저 확인)
    if (user.remainingGrabs === undefined) {
      user.remainingGrabs = maxGrabCount;
    }
    
    if (user.remainingGrabs <= 0) {
      if (user.lastGrab && now - user.lastGrab < adjustedGrabCooldown * 1000) {
        const timeLeft = adjustedGrabCooldown * 1000 - (now - user.lastGrab);
        if (interactionSuccess) {
          await interaction.followUp({
            content: `You need to wait ${formatTimeRemaining(timeLeft)} before grabbing another card. (0/${maxGrabCount} grabs available)`,
            ephemeral: true
          });
        }
        return;
      } else {
        // 쿨다운이 끝났으면 모든 그랩 횟수 복원
        user.remainingGrabs = maxGrabCount;
        user.lastGrab = 0;
        saveUserData();
      }
    }
    
    // 10초 경과 여부 확인 (더 정확한 계산)
    const bidWindowEnd = dropData.timestamp + (config.CARD_BID_DURATION * 1000);
    const isWithinBidWindow = now < bidWindowEnd;
    const remainingBidTime = Math.max(0, bidWindowEnd - now);
    
    console.log(`Bid window check: now=${now}, bidWindowEnd=${bidWindowEnd}, isWithin=${isWithinBidWindow}, remaining=${remainingBidTime}ms`);
    
    // 10초 이내 - 입찰 시스템 적용
    if (isWithinBidWindow) {
      console.log(`User ${userId} is bidding for card ${cardIndex} in drop ${dropId}`);
      
      // 원자적 그랩 횟수 체크 및 차감
      if (!atomicGrabCountCheck(userId, maxGrabCount)) {
        if (interactionSuccess) {
          await interaction.followUp({
            content: `You don't have any grabs remaining. (0/${maxGrabCount} grabs available)`,
            ephemeral: true
          });
        }
        return;
      }
      
      // 기존 입찰 데이터 확인
      let bidData = cardBidders.get(bidKey);
      
      if (bidData) {
        // 이미 참여한 사용자인지 확인
        if (bidData.bidders.some(b => b.userId === userId)) {
          // 이미 참여한 경우 그랩 횟수 복구
          restoreGrabCount(userId, maxGrabCount);
          
          if (interactionSuccess) {
            await interaction.followUp({
              content: `You've already placed a bid on this card! Bidding ends soon.`,
              ephemeral: true
            });
          }
          return;
        }
        
        // 입찰자 목록에 추가
        bidData.bidders.push({
          userId: userId,
          timestamp: now,
          isOwner: userId === dropOwnerId // 소유자 여부 명시적으로 저장
        });
        
        cardBidders.set(bidKey, bidData);
        
        console.log(`Added bidder ${userId} to existing bid. Total bidders: ${bidData.bidders.length}`);
        console.log(`Bidders: ${bidData.bidders.map(b => `${b.userId}(owner:${b.isOwner})`).join(', ')}`);
        
      } else {
        // 새로운 입찰 데이터 생성
        bidData = {
          bidders: [{
            userId: userId,
            timestamp: now,
            isOwner: userId === dropOwnerId // 소유자 여부 명시적으로 저장
          }],
          dropOwnerId: dropOwnerId,
          dropId: dropId,
          cardIndex: cardIndex,
          card: selectedCard,
          bidEndTime: bidWindowEnd
        };
        
        cardBidders.set(bidKey, bidData);
        
        console.log(`Created new bid for ${bidKey} with first bidder ${userId} (owner: ${userId === dropOwnerId})`);
        
        // 입찰 종료 타이머 설정
        setBidTimer(bidKey, interaction, remainingBidTime);
      }
      
      // 즉시 저장
      saveUserData();
      
      // 사용자에게 입찰 참여 알림
      const timeLeft = Math.max(0, Math.ceil(remainingBidTime / 1000));
      const bidMessage = `You've ${bidData.bidders.length === 1 ? 'placed a bid' : 'joined the bidding'} on this card! Bidding ends in ${timeLeft} seconds. (${user.remainingGrabs}/${maxGrabCount} grabs remaining)`;
      
      if (interactionSuccess) {
        await interaction.followUp({
          content: bidMessage,
          ephemeral: true
        });
      } else {
        // 상호작용이 실패한 경우 채널에 공개 메시지로 알림
        try {
          const channel = await interaction.client.channels.fetch(interaction.channelId);
          await channel.send(`<@${userId}> ${bidMessage}`);
        } catch (channelError) {
          console.error(`Could not send channel message to ${userId}:`, channelError);
        }
      }
    }
    // 10초 이후 - 즉시 획득 시스템 적용
    else {
      console.log(`User ${userId} is claiming card ${cardIndex} in drop ${dropId} directly (after bid window)`);
      
      // 원자적 그랩 횟수 체크 및 차감
      if (!atomicGrabCountCheck(userId, maxGrabCount)) {
        if (interactionSuccess) {
          await interaction.followUp({
            content: `You don't have any grabs remaining. (0/${maxGrabCount} grabs available)`,
            ephemeral: true
          });
        }
        return;
      }
      
      // 즉시 카드 할당
      await assignCardDirectly(interaction, userId, dropId, cardIndex);
    }
    
  } catch (error) {
    console.error('Error in grabCard function:', error);
    
    // 에러 발생 시 그랩 횟수 복구
    const maxGrabCount = 1; // 기본값
    restoreGrabCount(userId, maxGrabCount);
    
    if (interactionSuccess) {
      try {
        await interaction.followUp({
          content: 'An error occurred while processing your card grab request.',
          ephemeral: true
        });
      } catch (followupError) {
        console.error('Error sending error followup:', followupError);
      }
    }
  } finally {
    // 처리 중 상태 해제
    processingCards.delete(bidKey);
    // 사용자 그랩 락 해제
    releaseUserGrabLock(userId);
  }
}

// 입찰 처리 함수 - 개선 버전
async function processBidding(interaction, bidKey) {
  try {
    console.log(`Processing bidding for key: ${bidKey}`);
    
    if (!cardBidders.has(bidKey)) {
      console.error(`Bid key ${bidKey} not found.`);
      return;
    }
    
    const { bidders, dropOwnerId, dropId, cardIndex, card } = cardBidders.get(bidKey);
    
    // 입찰 데이터 즉시 제거 (중복 처리 방지)
    cardBidders.delete(bidKey);
    
    if (bidders.length === 0) {
      console.error(`No bidders found for ${bidKey}.`);
      return;
    }

    // 드롭 데이터 가져오기
    const dropOwner = initUserData(dropOwnerId);
    
    // 드롭 데이터가 아직 존재하는지 확인
    if (!dropOwner.pendingDrops || !dropOwner.pendingDrops[dropId]) {
      console.log(`Drop ${dropId} no longer exists. Returning grabs to all bidders.`);
      // 모든 입찰자에게 그랩 횟수 반환
      await returnGrabsToAllBidders(bidders);
      return;
    }
    
    const dropData = dropOwner.pendingDrops[dropId];
    
    // 이미 클레임되었는지 다시 확인
    if (dropData.claimed[cardIndex]) {
      console.log(`Card at index ${cardIndex} in drop ${dropId} is already claimed. Returning grabs to all bidders.`);
      // 모든 입찰자에게 그랩 횟수 반환
      await returnGrabsToAllBidders(bidders);
      return;
    }

    // 로그 출력
    console.log(`Processing bid completion: dropId=${dropId}, cardIndex=${cardIndex}`);
    console.log(`Drop owner ID: ${dropOwnerId}`);
    console.log(`Total bidders: ${bidders.length}`);
    console.log(`Bidders:`, bidders.map(b => `${b.userId}(owner:${b.isOwner})`));
    
    // 드롭 소유자가 입찰에 참여했는지 확인 (명시적으로 저장된 정보 사용)
    const ownerBidders = bidders.filter(b => b.isOwner === true);
    console.log(`Owner bidders found: ${ownerBidders.length}`);
    
    let winner;
    let winReason;
    
    if (ownerBidders.length > 0) {
      // 소유자가 입찰에 참여했으면 무조건 승리 (첫 번째 소유자 선택)
      winner = ownerBidders[0].userId;
      winReason = 'owner_priority';
      console.log(`Drop owner ${winner} wins the bidding for ${bidKey} using priority`);
    } else {
      // 랜덤으로 승자 선택
      const randomIndex = Math.floor(Math.random() * bidders.length);
      winner = bidders[randomIndex].userId;
      winReason = 'random_selection';
      console.log(`Random winner ${winner} (index ${randomIndex} of ${bidders.length}) selected for ${bidKey}`);
    }
    
    // 패배자들에게 그랩 횟수 반환
    const losers = bidders.filter(b => b.userId !== winner);
    console.log(`Returning grabs to ${losers.length} losers`);
    
    await returnGrabsToLosers(losers);
    
    // 변경 사항 저장
    saveUserData();
    
    // 카드 획득 처리 - 승리 이유도 함께 전달
    await assignCardToWinner(interaction, winner, dropId, cardIndex, bidders, winReason);
    
  } catch (error) {
    console.error('Error in processBidding function:', error);
    
    // 오류 발생 시 모든 입찰자에게 그랩 횟수 반환
    if (cardBidders.has(bidKey)) {
      const { bidders } = cardBidders.get(bidKey);
      await returnGrabsToAllBidders(bidders);
      cardBidders.delete(bidKey);
    }
  }
}

// 패배자들에게 그랩 횟수 반환하는 함수
async function returnGrabsToLosers(losers) {
  for (const loser of losers) {
    const loserUser = initUserData(loser.userId);
    
    // 기본값 사용 (빌딩 효과 제거)
    const maxGrabCount = 1;
    
    // 그랩 횟수 복원 (최대치를 넘지 않도록)
    loserUser.remainingGrabs = Math.min(maxGrabCount, loserUser.remainingGrabs + 1);
    
    console.log(`Returned grab count to loser ${loser.userId}: ${loserUser.remainingGrabs}/${maxGrabCount}`);
  }
}

// 모든 입찰자에게 그랩 횟수 반환하는 함수
async function returnGrabsToAllBidders(bidders) {
  for (const bidder of bidders) {
    const bidderUser = initUserData(bidder.userId);
    const maxGrabCount = 1; // 기본값
    bidderUser.remainingGrabs = Math.min(maxGrabCount, bidderUser.remainingGrabs + 1);
    console.log(`Returned grab count to bidder ${bidder.userId}: ${bidderUser.remainingGrabs}/${maxGrabCount}`);
  }
  saveUserData();
}

// 입찰 기간 이후 즉시 카드 할당 함수
async function assignCardDirectly(interaction, userId, dropId, cardIndex) {
  try {
    const user = initUserData(userId);
    const now = Date.now();

    // 기본값 사용 (빌딩 효과 제거)
    const maxGrabCount = 1;
    
    // 입찰 중이면 활성 입찰 해제
    if (user.activeBids > 0) {
      user.activeBids = 0;
    }
    
    // 드롭 소유자 ID 안전하게 추출
    const dropOwnerId = extractDropOwnerId(dropId);
    if (!dropOwnerId) {
      await interaction.followUp({ content: 'Invalid drop data format.', ephemeral: true });
      return;
    }
    
    const dropOwner = initUserData(dropOwnerId);
    
    if (!dropOwner.pendingDrops || !dropOwner.pendingDrops[dropId]) {
      await interaction.followUp({ content: 'This drop is no longer available.', ephemeral: true });
      return;
    }
    
    const dropData = dropOwner.pendingDrops[dropId];
    
    // 이미 클레임되었는지 확인
    if (dropData.claimed[cardIndex]) {
      await interaction.followUp({ content: 'This card has already been claimed.', ephemeral: true });
      return;
    }
    
    // 선택한 카드 찾기
    const selectedCard = dropData.cards[cardIndex];
    
    // 카드를 클레임된 상태로 표시하기 전에 진행중인 입찰 타이머 취소
    const bidKey = `${dropId}_${cardIndex}`;
    if (global.bidTimers && global.bidTimers[bidKey]) {
      clearTimeout(global.bidTimers[bidKey]);
      delete global.bidTimers[bidKey];
      console.log(`Canceled bid timer for ${bidKey} due to direct claim`);
    }
    
    // 카드를 클레임된 상태로 표시 (최대한 빨리)
    dropData.claimed[cardIndex] = true;
    
    // 고유 ID 생성 및 카드 데이터 준비
    const uniqueId = generateUniqueCardId();
    const skillType = selectedCard.skillType || 'common';
    const skillStats = generateSkillStats(skillType);

    // 카드 데이터 추가
    user.cards.push({
      uniqueId: uniqueId,
      cardId: selectedCard.id,
      name: selectedCard.name,
      series: selectedCard.series,
      variant: selectedCard.selectedVariant || selectedCard.variant,
      level: 1,
      type: selectedCard.type || 'normal',
      skillType: selectedCard.skillType || 'common',
      gValue: selectedCard.gValue || generateGValue(),
      skillStats: skillStats,
      obtainedAt: now
    });

    // 통계 업데이트
    const cardId = selectedCard.id;
    const variant = selectedCard.selectedVariant || selectedCard.variant;
    incrementCardStat(cardId, userId, variant, 1, selectedCard.series);
    
    // 남은 그랩 횟수 감소 (이미 atomicGrabCountCheck에서 처리됨)
    console.log(`User ${userId} direct grab, remaining: ${user.remainingGrabs}/${maxGrabCount}`);
    
    // 모든 그랩 횟수를 사용했으면 쿨다운 시작
    if (user.remainingGrabs <= 0) {
      user.lastGrab = now;
    
      // 기본 쿨다운 사용
      const adjustedGrabCooldown = config.GRAB_COOLDOWN;
      
      // 타이머 설정
      setCooldownTimer('grab', userId, async () => {
        try {
          const channel = await interaction.client.channels.fetch(interaction.channelId);
          if (!channel) {
            console.error(`Channel not found for cooldown notification to user ${userId}`);
            return;
          }
          
          const updatedUser = initUserData(userId);
          updatedUser.remainingGrabs = maxGrabCount;
          updatedUser.lastGrab = 0;
          saveUserData();
          
          await channel.send(`<@${userId}> Your grabs have been recharged! You now have ${maxGrabCount} grabs available.`);
          console.log(`Grab cooldown notification sent to user ${userId}`);
        } catch (error) {
          console.error(`Error sending grab notification to user ${userId}:`, error);
        }
      }, adjustedGrabCooldown * 1000);
    }
    
    // 모든 카드가 클레임되었는지 확인
    const allClaimed = dropData.claimed.every(claimed => claimed === true);
    if (allClaimed) {
      delete dropOwner.pendingDrops[dropId];
      console.log(`All cards claimed for drop ${dropId}, removing from pending drops`);
    }
    
    // 즉시 저장
    saveUserData();
    
    // 드롭 버튼 상태 업데이트
    const row = new ActionRowBuilder();
    
    dropData.cards.forEach((card, idx) => {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`select:${dropId}:${idx}`)
          .setLabel(`${idx + 1}`)
          .setStyle(dropData.claimed[idx] ? ButtonStyle.Secondary : ButtonStyle.Primary)
          .setDisabled(dropData.claimed[idx])
      );
    });
    
    // 드롭 메시지 수정
    try {
      await interaction.message.edit({ components: [row] });
    } catch (editError) {
      console.error('Error updating message buttons:', editError);
    }
    
    // 카드 소유 랭킹 가져오기
    const ownerRanking = getCardOwnerRanking(cardId);
    let userRankText = "Not ranked";
    
    for (let i = 0; i < ownerRanking.length; i++) {
      if (ownerRanking[i][0] === userId) {
        const count = ownerRanking[i][1];
        const totalCollectors = ownerRanking.length;
        userRankText = `Card Collector Rank: #${i + 1}/${totalCollectors} (${count} owned)`;
        break;
      }
    }
    
    // 카드 획득 메시지 생성
    const bidResultPrefix = `<@${userId}> claimed card ${cardIndex + 1} with no competition! `;
    
    let skillStatsText = '';
    
    if (skillType === 'mining' && skillStats) {
      skillStatsText = `\n• Mining Stats: Power ${skillStats.miningPower}, Speed ${skillStats.miningSpeed}%, ` +
        `Accuracy ${skillStats.accuracy}%, Luck ${skillStats.luck}%, Capacity ${skillStats.maxCapacity}`;
    }
    else if (skillType === 'gathering' && skillStats) {
      skillStatsText = `\n• Gathering Stats: Detection ${skillStats.detection}, Power ${skillStats.gatheringPower}, ` +
        `Speed ${skillStats.gatheringSpeed}%, Accuracy ${skillStats.accuracy}%, ` +
        `Luck ${skillStats.luck}%, Capacity ${skillStats.maxCapacity}`;
    }

    const acquisitionMessage = `${bidResultPrefix}**${selectedCard.name}** (${selectedCard.series}) • ` +
      `${prettyVariantName(selectedCard.selectedVariant || selectedCard.variant)} • ` +
      `Skill: ${selectedCard.skillType || 'common'} • ` +
      `G•${selectedCard.gValue || generateGValue()} • ` +
      `ID: \`${uniqueId}\` • ` +
      `${userRankText}` +
      `${skillStatsText}` +
      `\n\`*You have ${user.remainingGrabs}/${maxGrabCount} grabs remaining.*\``;

    await interaction.channel.send({ content: acquisitionMessage });
    
  } catch (error) {
    console.error('Error in assignCardDirectly function:', error);
    await interaction.followUp({
      content: 'An error occurred while claiming the card.',
      ephemeral: true
    });
  }
}

// 카드를 당첨자에게 할당하는 함수
async function assignCardToWinner(interaction, userId, dropId, cardIndex, bidders, winReason = 'unknown') {
  try {
    const user = initUserData(userId);
    const now = Date.now();
    
    // 기본값 사용 (빌딩 효과 제거)
    const maxGrabCount = 1;
    
    // 드롭 소유자 ID 안전하게 추출
    const dropOwnerId = extractDropOwnerId(dropId);
    if (!dropOwnerId) {
      console.error(`Invalid dropId format in winner assignment: ${dropId}`);
      return;
    }
    
    const dropOwner = initUserData(dropOwnerId);
    
    if (!dropOwner.pendingDrops || !dropOwner.pendingDrops[dropId]) {
      console.log(`Drop ${dropId} no longer exists.`);
      return;
    }
    
    const dropData = dropOwner.pendingDrops[dropId];
    
    // 이미 클레임 되었는지 다시 확인
    if (dropData.claimed[cardIndex]) {
      console.log(`Card at index ${cardIndex} in drop ${dropId} is already claimed. Aborting winner assignment.`);
      return;
    }
    
    // 카드 클레임 상태 표시 - 최대한 빨리 상태 업데이트
    dropData.claimed[cardIndex] = true;
    saveUserData(); // 즉시 저장
    
    // 선택한 카드 찾기
    const selectedCard = dropData.cards[cardIndex];
    
    // 고유 ID 생성
    const uniqueId = generateUniqueCardId();
    
    // 스킬 세부 능력치 추가
    const skillType = selectedCard.skillType || 'common';
    const skillStats = generateSkillStats(skillType);

    // 카드 그랩 시 카드 정보 추가
    user.cards.push({
      uniqueId: uniqueId,
      cardId: selectedCard.id,
      name: selectedCard.name,
      series: selectedCard.series,
      variant: selectedCard.selectedVariant || selectedCard.variant,
      level: 1,
      type: selectedCard.type || 'normal',
      skillType: selectedCard.skillType || 'common',
      gValue: selectedCard.gValue || generateGValue(),
      skillStats: skillStats,
      obtainedAt: now
    });

    // 카드 통계 업데이트
    const cardId = selectedCard.id;
    const variant = selectedCard.selectedVariant || selectedCard.variant;
    incrementCardStat(cardId, userId, variant, 1, selectedCard.series);
    
    // 모든 그랩 횟수를 사용했으면 쿨다운 시작
    if (user.remainingGrabs <= 0) {
      user.lastGrab = now;

      // 기본 쿨다운 사용
      const adjustedGrabCooldown = config.GRAB_COOLDOWN;
      
      // 쿨다운 타이머 설정
      setCooldownTimer('grab', userId, async () => {
        try {
          const channel = await interaction.client.channels.fetch(interaction.channelId);
          if (!channel) {
            console.error(`Channel not found for cooldown notification to user ${userId}`);
            return;
          }
          
          const updatedUser = initUserData(userId);
          updatedUser.remainingGrabs = maxGrabCount;
          updatedUser.lastGrab = 0;
          saveUserData();
          
          await channel.send(`<@${userId}> Your grabs have been recharged! You now have ${maxGrabCount} grabs available.`);
          console.log(`Grab cooldown notification sent to user ${userId}`);
        } catch (error) {
          console.error(`Error sending grab notification to user ${userId}:`, error);
        }
      }, adjustedGrabCooldown * 1000);
    }
    
    // 모든 카드가 클레임되었는지 확인
    const allClaimed = dropData.claimed.every(claimed => claimed === true);
    if (allClaimed) {
      delete dropOwner.pendingDrops[dropId];
      console.log(`All cards claimed for drop ${dropId}, removing from pending drops`);
    }
    
    // 변경사항 즉시 저장
    saveUserData();
    
    // 드롭 버튼 상태 업데이트
    const row = new ActionRowBuilder();
    
    dropData.cards.forEach((card, idx) => {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`select:${dropId}:${idx}`)
          .setLabel(`${idx + 1}`)
          .setStyle(dropData.claimed[idx] ? ButtonStyle.Secondary : ButtonStyle.Primary)
          .setDisabled(dropData.claimed[idx])
      );
    });
    
    // 드롭 메시지 수정 (버튼만 업데이트)
    try {
      await interaction.message.edit({ components: [row] });
    } catch (editError) {
      console.error('Error updating message buttons:', editError);
    }
    
    // 카드 소유 랭킹 가져오기
    const ownerRanking = getCardOwnerRanking(cardId);
    let userRankText = "Not ranked";
    
    for (let i = 0; i < ownerRanking.length; i++) {
      if (ownerRanking[i][0] === userId) {
        const count = ownerRanking[i][1];
        const totalCollectors = ownerRanking.length;
        userRankText = `Card Collector Rank: #${i + 1}/${totalCollectors} (${count} owned)`;
        break;
      }
    }
    
    // 입찰 결과 메시지 생성
    const bidderIds = bidders.map(b => b.userId);
    
    console.log(`Winner: ${userId}, Reason: ${winReason}`);
    console.log(`Total bidders: ${bidderIds.length}`);
    console.log(`Bidder IDs: ${bidderIds.join(', ')}`);
    
    // 경쟁자 수 계산 - 당첨자 자신을 제외한 모든 입찰자
    const competitorsCount = bidders.length - 1;
    const isOwner = userId === dropOwnerId;
    
    let bidResultPrefix = '';
    
    if (competitorsCount === 0) {
      // 경쟁 없음
      bidResultPrefix = `<@${userId}> claimed card ${cardIndex + 1} with no competition! `;
    } else if (winReason === 'owner_priority') {
      // 드롭 소유자가 우선권으로 이긴 경우
      bidResultPrefix = `<@${userId}> used owner priority to claim card ${cardIndex + 1}, beating ${competitorsCount} other bidders! `;
    } else if (competitorsCount === 1) {
      // 한 명만 경쟁한 경우
      const competitor = bidderIds.find(bId => bId !== userId);
      bidResultPrefix = `<@${userId}> beat <@${competitor}> and claimed card ${cardIndex + 1}! `;
    } else {
      // 여러 명과 경쟁한 경우
      bidResultPrefix = `<@${userId}> beat ${competitorsCount} other bidders and claimed card ${cardIndex + 1}! `;
    }
    
    let skillStatsText = '';
    
    if (skillType === 'mining' && skillStats) {
      skillStatsText = `\n• Mining Stats: Power ${skillStats.miningPower}, Speed ${skillStats.miningSpeed}%, ` +
        `Accuracy ${skillStats.accuracy}%, Luck ${skillStats.luck}%, Capacity ${skillStats.maxCapacity}`;
    }
    else if (skillType === 'gathering' && skillStats) {
      skillStatsText = `\n• Gathering Stats: Detection ${skillStats.detection}, Power ${skillStats.gatheringPower}, ` +
        `Speed ${skillStats.gatheringSpeed}%, Accuracy ${skillStats.accuracy}%, ` +
        `Luck ${skillStats.luck}%, Capacity ${skillStats.maxCapacity}`;
    }

    const acquisitionMessage = `${bidResultPrefix}**${selectedCard.name}** (${selectedCard.series}) • ` +
      `${prettyVariantName(selectedCard.selectedVariant || selectedCard.variant)} • ` +
      `Skill: ${selectedCard.skillType || 'common'} • ` +
      `G•${selectedCard.gValue || generateGValue()} • ` +
      `ID: \`${uniqueId}\` • ` +
      `${userRankText}` +
      `${skillStatsText}` +
      `\n\`*You have ${user.remainingGrabs}/${maxGrabCount} grabs remaining.*\``;

    await interaction.channel.send({ content: acquisitionMessage });
    
  } catch (error) {
    console.error('Error in assignCardToWinner function:', error);
  }
}

module.exports = {
  grabCard
};