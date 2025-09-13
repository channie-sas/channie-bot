// src/commands/cardAdmin.js
const { initUserData, saveUserDataThrottled } = require('../database/userData');
const { findUserCard } = require('../database/cardModel');

/**
 * 운석 카드 채굴 유저 관리 함수
 */
function updateMinableUsers(userId, cardId, targetUserId, add = true) {
  try {
    // 카드 찾기
    const card = findUserCard(userId, cardId);
    
    // 카드가 없거나 자원 카드가 아닌 경우
    if (!card || card.type !== 'resource') {
      return false;
    }
    
    // 채굴 가능 사용자 목록 초기화 (없는 경우)
    if (!Array.isArray(card.minableUsers)) {
      card.minableUsers = [];
    }
    
    if (add) {
      // 이미 목록에 있는지 확인
      if (!card.minableUsers.includes(targetUserId)) {
        card.minableUsers.push(targetUserId);
      } else {
        return false; // 이미 목록에 있음
      }
    } else {
      // 목록에서 제거
      const index = card.minableUsers.indexOf(targetUserId);
      if (index > -1) {
        card.minableUsers.splice(index, 1);
      } else {
        return false; // 목록에 없음
      }
    }
    
    // 유저 데이터 저장
    saveUserDataThrottled();
    return true;
  } catch (error) {
    console.error('Error updating minable users:', error);
    return false;
  }
}

/**
 * 운석 카드 관리 명령어 처리
 */
async function handleCardAdmin(message, args) {
  const userId = message.author.id;
  
  // 인자 확인
  if (!args || args.length < 2) {
    return message.reply('Usage: `cad <meteorite_card_id> @user`');
  }
  
  const cardId = args[0];
  
  // 멘션된 유저 확인
  const mentionedUser = message.mentions.users.first();
  if (!mentionedUser) {
    return message.reply('Please mention a user to add/remove from the mining list.');
  }
  
  const targetUserId = mentionedUser.id;
  
  // 운석 카드 찾기
  const card = findUserCard(userId, cardId);
  
  // 카드가 없거나 자원 카드가 아닌 경우
  if (!card) {
    return message.reply(`You don't have a card with ID: ${cardId}`);
  }
  
  if (card.type !== 'resource') {
    return message.reply(`Card ${cardId} is not a resource card.`);
  }
  
  // 소유자 확인
  if (card.ownerId && card.ownerId !== userId) {
    return message.reply('You can only manage mining rights for cards you own.');
  }
  
  // 채굴 가능 사용자 목록 확인
  const isAlreadyMinable = Array.isArray(card.minableUsers) && card.minableUsers.includes(targetUserId);
  
  // 추가 또는 제거
  const success = updateMinableUsers(userId, cardId, targetUserId, !isAlreadyMinable);
  
  if (success) {
    if (isAlreadyMinable) {
      return message.reply(`<@${targetUserId}> has been removed from the mining list for your ${card.name}.`);
    } else {
      return message.reply(`<@${targetUserId}> has been added to the mining list for your ${card.name}.`);
    }
  } else {
    return message.reply('Failed to update the mining list.');
  }
}

module.exports = {
  handleCardAdmin,
  updateMinableUsers
};