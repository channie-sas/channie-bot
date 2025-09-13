// src/database/cardModel.js
const { initUserData, saveUserDataThrottled } = require('./userData');
const { decrementCardStat } = require('./cardStats');

/**
 * 카드 찾기 함수
 * @param {string} userId - 사용자 ID
 * @param {string} cardId - 카드 ID
 * @returns {Object|null} 찾은 카드 객체 또는 null
 */
function findUserCard(userId, cardId) {
  if (!cardId) return null;
  
  console.log(`findUserCard 호출: userId=${userId}, cardId=${cardId}`);
  
  const user = initUserData(userId);
  const searchId = cardId.toLowerCase();
  
  // 인덱스 맵 사용하여 빠르게 검색
  const indexMap = buildCardIndexMap(userId);
  
  // 디버깅을 위한 로그
  console.log(`인덱스 맵 크기: ${Object.keys(indexMap).length}`);
  
  // 정확한 ID 일치 확인
  if (indexMap[searchId] !== undefined) {
    console.log(`정확한 ID 일치 카드 찾음: ${searchId}`);
    return user.cards[indexMap[searchId]];
  }
  
  // 짧은 ID 일치 확인
  for (const [key, index] of Object.entries(indexMap)) {
    if (key.startsWith(searchId)) {
      console.log(`부분 ID 일치 카드 찾음: ${key}`);
      return user.cards[index];
    }
  }
  
  // 인덱스 맵에서 찾지 못한 경우 기존 방식으로 검색 (안전장치)
  const card = user.cards.find(card => 
    card.uniqueId.toLowerCase() === searchId || 
    card.uniqueId.toLowerCase().startsWith(searchId)
  );
  
  if (card) {
    console.log(`기존 방식으로 카드 찾음: ${card.uniqueId}`);
    return card;
  }
  
  console.log(`카드를 찾을 수 없음: ${searchId}`);
  return null;
}

/**
 * 카드 인덱스 맵 생성 함수
 * @param {string} userId - 사용자 ID
 * @returns {Object} 카드 ID를 키로 하는 인덱스 맵
 */
function buildCardIndexMap(userId) {
  const user = initUserData(userId);
  
  // 카드 인덱스 맵이 이미 있고 최신이면 그대로 사용
  if (user._cardIndexMap && user._cardIndexMapUpdated === user.cards.length) {
    return user._cardIndexMap;
  }
  
  // 새 카드 인덱스 맵 생성
  const indexMap = {};
  
  user.cards.forEach((card, index) => {
    if (card.uniqueId) {
      indexMap[card.uniqueId.toLowerCase()] = index;
      
      // 짧은 ID도 인덱싱 (앞 6자리)
      const shortId = card.uniqueId.substring(0, 6).toLowerCase();
      // 이미 다른 카드가 같은 짧은 ID를 사용 중인지 확인
      if (indexMap[shortId] === undefined) {
        indexMap[shortId] = index;
      }
    }
  });
  
  // 캐싱
  user._cardIndexMap = indexMap;
  user._cardIndexMapUpdated = user.cards.length;
  
  return indexMap;
}

/**
 * 사용자에게 카드 추가
 * @param {string} userId - 사용자 ID
 * @param {Object} card - 추가할 카드 객체
 * @returns {Object} 추가된 카드 객체
 */
function addCardToUser(userId, card) {
  const user = initUserData(userId);
  
  // 카드 복사 후 추가
  const newCard = { ...card };
  if (!newCard.obtainedAt) {
    newCard.obtainedAt = Date.now();
  }
  
  user.cards.push(newCard);
  
  // 카드 인덱스 맵 초기화
  delete user._cardIndexMap;
  
  saveUserDataThrottled();
  return newCard;
}



/**
 * 사용자에게서 카드 제거
 * @param {string} userId - 사용자 ID
 * @param {string} cardId - 제거할 카드 ID
 * @param {boolean} updateStats - 통계 업데이트 여부 (기본값: true)
 * @returns {Object} 제거 결과
 */
function removeCardFromUser(userId, cardId, updateStats = true) {
  const user = initUserData(userId);
  const searchId = cardId.toLowerCase();
  
  const cardIndex = user.cards.findIndex(card => 
    card.uniqueId.toLowerCase() === searchId || 
    card.uniqueId.toLowerCase().startsWith(searchId)
  );
  
  if (cardIndex === -1) {
    return { 
      success: false, 
      message: "Card not found in your collection." 
    };
  }
  
  const removedCard = user.cards[cardIndex];
  
  // 통계 업데이트 옵션이 true인 경우에만 통계 감소
  // 수정: 소각이나 레벨업 사용 시에는 updateStats를 false로 전달해 통계에서 제외
  if (updateStats) {
    decrementCardStat(removedCard.cardId, userId, removedCard.variant, removedCard.level || 1);
  }
  
  // 카드 제거
  user.cards.splice(cardIndex, 1);
  
  // 카드 인덱스 맵 초기화
  delete user._cardIndexMap;
  
  saveUserDataThrottled();
  
  return {
    success: true,
    message: `Successfully removed ${removedCard.name} card.`,
    card: removedCard
  };
}

/**
 * 사용자의 모든 카드 가져오기
 * @param {string} userId - 사용자 ID
 * @returns {Array} 카드 배열
 */
function getUserCards(userId) {
  const user = initUserData(userId);
  return user.cards || [];
}



/**
 * 운석 카드의 채굴 가능 유저 추가/제거
 * @param {string} userId - 카드 소유자 ID
 * @param {string} cardId - 운석 카드 ID
 * @param {string} targetUserId - 추가/제거할 유저 ID
 * @param {boolean} add - true면 추가, false면 제거
 * @return {boolean} - 성공 여부
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
    if (!card.minableUsers) {
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

module.exports = {
  findUserCard,
  buildCardIndexMap,
  addCardToUser,
  removeCardFromUser,
  getUserCards,
  updateMinableUsers
};