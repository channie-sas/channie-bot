// src/database/cardSeries.js
const fs = require('fs');
const path = require('path');
const { userData, initUserData } = require('./userData');

// 모든 카드 시리즈 정보를 저장할 객체
let seriesMap = {};
let initialized = false;

/**
 * 카드 시리즈 정보 초기화 - 모든 카드 파일에서 시리즈 정보 추출
 */
function initSeriesData() {
  if (initialized) return seriesMap;
  
  const cardsDir = path.join(__dirname, 'cards');
  const files = fs.readdirSync(cardsDir);
  
  // 카드 파일마다 시리즈 정보 추출
  files.forEach(file => {
    if (file.endsWith('.js')) {
      const cards = require(path.join(cardsDir, file));
      
      // 각 카드에서 시리즈 정보 추출
      cards.forEach(card => {
        const seriesName = card.series;
        const seriesId = card.seriesId || file.replace('.js', '').toLowerCase();
        
        if (!seriesMap[seriesName.toLowerCase()]) {
          seriesMap[seriesName.toLowerCase()] = {
            name: seriesName,
            id: seriesId,
            cards: []
          };
        }
        
        // 중복 방지를 위해 이미 추가된 카드인지 확인
        if (!seriesMap[seriesName.toLowerCase()].cards.some(c => c.id === card.id)) {
          seriesMap[seriesName.toLowerCase()].cards.push(card);
        }
      });
    }
  });
  
  initialized = true;
  return seriesMap;
}

/**
 * 시리즈 이름으로 카드 검색
 * @param {string} seriesName - 검색할 시리즈 이름
 * @returns {Object|null} - 시리즈 정보 또는 null
 */
function getSeriesByName(seriesName) {
  initSeriesData();
  return seriesMap[seriesName.toLowerCase()] || null;
}

/**
 * 카드 ID에서 시리즈 ID 추출 함수
 * @param {string} cardId - 카드 ID
 * @returns {string|null} 시리즈 ID 또는 null
 */
function getCardSeriesId(cardId) {
  if (!cardId) return null;
  
  // 가장 간단한 방법: cardId에서 시리즈 부분 추출
  // 대부분의 카드 ID는 'seriesId_cardNumber' 형식일 것으로 가정
  const parts = cardId.split('_');
  if (parts.length > 1) {
    return parts[0].toLowerCase();
  }
  
  // 다른 방법: cardStats의 기존 데이터를 활용
  // 이 부분은 cardStats 구조에 따라 달라질 수 있음
  
  // 대체 방법으로 카드 이름이나 기타 정보만 반환
  return "unknown_series";
}

/**
 * 모든 시리즈 목록 반환
 * @returns {Array} - 시리즈 목록
 */
function getAllSeries() {
  initSeriesData();
  return Object.values(seriesMap);
}


/**
 * 사용자가 특정 시리즈에서 수집한 카드 현황 확인
 * @param {string} seriesName - 시리즈 이름
 * @param {string} userId - 사용자 ID
 * @returns {Object} 수집 현황 정보
 */
function getCollectionStatus(seriesName, userId) {
    const series = getSeriesByName(seriesName);
    if (!series) return null;
    
    // 사용자 데이터 확인
    let user = userData.get(userId); // Collection 객체의 get 메서드 사용
    
    // 사용자 데이터가 없으면 초기화
    if (!user) {
      user = initUserData(userId);
    }
    
    if (!user.cards || user.cards.length === 0) {
      return {
        series: series.name,
        collected: 0,
        total: series.cards.length,
        cardStatus: series.cards.map(card => ({ 
          id: card.id, 
          name: card.name, 
          collected: false 
        }))
      };
    }
    
    // 사용자가 수집한 카드 ID 목록 생성
    const collectedCardIds = new Set();
    user.cards.forEach(card => {
      collectedCardIds.add(card.cardId);
    });
    
    // 각 카드별 수집 상태 확인
    const cardStatus = series.cards.map(card => ({
      id: card.id,
      name: card.name,
      collected: collectedCardIds.has(card.id)
    }));
    
    // 총 수집한 카드 수
    const collectedCount = cardStatus.filter(card => card.collected).length;
    
    return {
      series: series.name,
      collected: collectedCount,
      total: series.cards.length,
      cardStatus: cardStatus
    };
  }

module.exports = {
  initSeriesData,
  getSeriesByName,
  getAllSeries,
  getCollectionStatus,
  getCardSeriesId
};