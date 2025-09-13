// src/commands/checkCooldown.js
const { EmbedBuilder } = require('discord.js');
const { config } = require('../../config');
const { initUserData, getCardCooldown, saveUserDataThrottled } = require('../database/userData');

// 쿨다운 확인 함수
function checkCooldown(message, userId) {
  const user = initUserData(userId);
  const now = Date.now();
  
  // 기본 최대 횟수 (건물 효과 제거로 기본값 사용)
  const maxDropCount = 1;
  const maxGrabCount = 1;
  
  // 기본 쿨다운 시간 (건물 효과 제거로 기본값 사용)
  const adjustedDropCooldown = config.DROP_COOLDOWN;
  const adjustedGrabCooldown = config.GRAB_COOLDOWN;
  
  // 현재 남은 횟수 가져오기 (없으면 기본값 설정)
  if (user.remainingDrops === undefined) {
    user.remainingDrops = maxDropCount;
    saveUserDataThrottled();
  }
  
  if (user.remainingGrabs === undefined) {
    user.remainingGrabs = maxGrabCount;
    saveUserDataThrottled();
  }
  
  // 쿨다운 회복 체크
  if (user.remainingDrops <= 0 && user.lastDrop && now - user.lastDrop >= adjustedDropCooldown * 1000) {
    user.remainingDrops = maxDropCount;
    user.lastDrop = 0;
    saveUserDataThrottled();
  }
  
  if (user.remainingGrabs <= 0 && user.lastGrab && now - user.lastGrab >= adjustedGrabCooldown * 1000) {
    user.remainingGrabs = maxGrabCount;
    user.lastGrab = 0;
    saveUserDataThrottled();
  }
  
  // 드롭 쿨다운 확인
  let dropCooldown = 0;
  if (user.remainingDrops <= 0 && user.lastDrop) {
    dropCooldown = Math.max(0, adjustedDropCooldown * 1000 - (now - user.lastDrop));
  }
  
  // 그랩 쿨다운 확인
  let grabCooldown = 0;
  if (user.remainingGrabs <= 0 && user.lastGrab) {
    grabCooldown = Math.max(0, adjustedGrabCooldown * 1000 - (now - user.lastGrab));
  }
  
  // 이모지 상태 결정
  const dropStatus = user.remainingDrops > 0 ? "🟢" : (dropCooldown > 0 ? "⚫" : "🟢");
  const grabStatus = user.remainingGrabs > 0 ? "🟢" : (grabCooldown > 0 ? "⚫" : "🟢");
  
  // 시간 형식화 함수 - 초 단위까지 포함
  function formatTime(milliseconds) {
    if (milliseconds <= 0) return "Ready";
    
    const totalSeconds = Math.ceil(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    
    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  }
  
  // 각 상태에 대한 텍스트 (충전식 시스템 표시 + 초 단위 시간)
  let dropText = '';
  if (user.remainingDrops > 0) {
    dropText = `Ready (${user.remainingDrops}/${maxDropCount})`;
  } else if (dropCooldown > 0) {
    dropText = `${formatTime(dropCooldown)} (0/${maxDropCount})`;
  } else {
    dropText = `Ready (${maxDropCount}/${maxDropCount})`;
  }
  
  let grabText = '';
  if (user.remainingGrabs > 0) {
    grabText = `Ready (${user.remainingGrabs}/${maxGrabCount})`;
  } else if (grabCooldown > 0) {
    grabText = `${formatTime(grabCooldown)} (0/${maxGrabCount})`;
  } else {
    grabText = `Ready (${maxGrabCount}/${maxGrabCount})`;
  }
  
  // 사용 중인 카드 쿨다운 확인 (최대 5개만 표시)
  const cardCooldowns = [];
  if (user.cardCooldowns) {
    const activeCards = user.cards.filter(card => 
      user.cardCooldowns[card.uniqueId] && 
      user.cardCooldowns[card.uniqueId] > now
    ).slice(0, 5);
    
    for (const card of activeCards) {
      const cooldownTime = user.cardCooldowns[card.uniqueId] - now;
      // 카드 쿨다운도 초 단위 표시
      cardCooldowns.push(`⚫ ${card.name} | ID: \`${card.uniqueId}\` | ${formatTime(cooldownTime)}`);
    }
  }
  
  // 간결한 임베드 생성 (액션 포인트 제거)
  const embed = new EmbedBuilder()
  .setTitle('Cooldowns')
  .setDescription(
    `${dropStatus} • Drop | ${dropText}\n` +
    `${grabStatus} • Grab | ${grabText}`
  )
  .setColor('#4169E1')
  .setFooter({ text: 'Use these commands when Ready' });
  
  // 카드 쿨다운 정보가 있으면 필드 추가
  if (cardCooldowns.length > 0) {
    embed.addFields({ 
      name: 'Card Cooldowns', 
      value: cardCooldowns.join('\n') 
    });
  }
  
  message.reply({ embeds: [embed] });
}

module.exports = {
  checkCooldown
};