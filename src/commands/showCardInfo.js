// src/commands/showCardInfo.js
const { findUserCard } = require('../database/cardModel');
const { showDetailedCardById } = require('./cardLookupById');
const { showCardInfoByName } = require('./cardLookupByName');

/**
 * 메인 카드 정보 표시 함수 - ID와 이름 모두 처리
 */
async function showCardInfo(message, searchQuery) {
  // 검색어가 비어있는 경우
  if (!searchQuery || searchQuery.trim() === '') {
    return message.reply('Please specify a card name or ID to search for. Example: `clu Felix` or `clu ABC123`');
  }

  // 사용자 ID
  const userId = message.author.id;
  
  // 먼저 카드 ID로 검색
  const card = findUserCard(userId, searchQuery);
  
  // 카드 ID로 찾은 경우 상세 정보 표시
  if (card) {
    return showDetailedCardById(message, searchQuery);
  } 
  // 카드 ID로 찾지 못한 경우 카드 이름으로 검색
  else {
    return showCardInfoByName(message, searchQuery);
  }
}

// 다른 모듈에서 필요한 함수들 재내보내기
module.exports = {
  showCardInfo,
  // 이전 기능과의 호환성을 위해 다른 모듈의 함수들도 내보냄
  showDetailedCardById,
  showCardInfoByName,
  ...require('./cardLookupByName'),
  ...require('./cardInfoPages')
};