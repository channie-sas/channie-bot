// src/utils/missingCardsCache.js
const fs = require('fs');
const path = require('path');
const { getAllCards } = require('../database/cardDatabase');
const { getSeriesDirectory, config } = require('../../config');

// 누락된 카드들을 캐시하는 맵
let missingCardsCache = new Map();
let lastCacheUpdate = 0;

/**
 * v1 이미지가 없는 카드들을 체크하고 캐시에 저장
 */
function updateMissingCardsCache() {
  console.log('[MISSING CARDS] Starting missing cards cache update...');
  const startTime = Date.now();
  
  try {
    // 모든 카드 가져오기
    const allCards = getAllCards();
    console.log(`[MISSING CARDS] Checking ${allCards.length} cards for missing v1 images...`);
    
    // 누락된 카드들을 저장할 배열
    const missingCards = [];
    
    // 각 카드에 대해 v1 이미지 존재 여부 확인
    for (const card of allCards) {
      // 자원 카드는 제외 (다른 경로를 사용)
      if (card.type === 'resource') {
        continue;
      }
      
      // v1 변형이 있는지 확인
      if (!card.variants || !card.variants.includes('v1')) {
        continue;
      }
      
      // 카드 ID 생성
      const cardId = card.id || card.cardId;
      if (!cardId) {
        console.warn(`[MISSING CARDS] Card without ID found:`, card.name);
        continue;
      }
      
      // 시리즈 디렉토리 경로
      const seriesId = card.seriesId || normalizeSeriesName(card.series);
      const seriesDir = getSeriesDirectory(seriesId);
      
      // v1 이미지 파일 경로
      const v1ImagePath = path.join(seriesDir, `${cardId}_v1.png`);
      
      // 파일 존재 여부 확인
      if (!fs.existsSync(v1ImagePath)) {
        missingCards.push({
          cardId: cardId,
          name: card.name,
          series: card.series || 'Unknown Series',
          seriesId: seriesId,
          variants: card.variants || ['v1'],
          category: card.category || [],
          weight: card.weight || 1,
          imagePath: v1ImagePath,
          skillType: card.skillType || null
        });
      }
    }
    
    // 캐시 업데이트
    missingCardsCache.clear();
    
    // 시리즈별로 그룹화
    const groupedByPriority = groupMissingCardsByPriority(missingCards);
    
    // 우선순위순으로 정렬된 배열 생성
    const sortedMissingCards = [
      ...groupedByPriority.high,    // 높은 우선순위
      ...groupedByPriority.medium,  // 중간 우선순위
      ...groupedByPriority.low      // 낮은 우선순위
    ];
    
    // 캐시에 저장
    missingCardsCache.set('cards', sortedMissingCards);
    missingCardsCache.set('total', sortedMissingCards.length);
    missingCardsCache.set('lastUpdate', Date.now());
    
    lastCacheUpdate = Date.now();
    
    const endTime = Date.now();
    console.log(`[MISSING CARDS] Cache updated successfully!`);
    console.log(`[MISSING CARDS] Found ${sortedMissingCards.length} missing v1 images`);
    console.log(`[MISSING CARDS] Update took ${endTime - startTime}ms`);
    
    // 상위 5개 누락 카드 로그
    if (sortedMissingCards.length > 0) {
      console.log(`[MISSING CARDS] Top missing cards:`);
      sortedMissingCards.slice(0, 5).forEach((card, index) => {
        console.log(`[MISSING CARDS]   ${index + 1}. ${card.name} (${card.series}) - ${card.cardId}`);
      });
    }
    
    return true;
  } catch (error) {
    console.error('[MISSING CARDS] Error updating missing cards cache:', error);
    return false;
  }
}

/**
 * 누락된 카드들을 우선순위별로 그룹화
 * @param {Array} missingCards - 누락된 카드 배열
 * @returns {Object} 우선순위별 그룹화된 객체
 */
function groupMissingCardsByPriority(missingCards) {
  const groups = {
    high: [],    // weight 1-2, 주요 카테고리
    medium: [],  // weight 3-4
    low: []      // weight 5+, 기타
  };
  
  const highPriorityCategories = ['main', 'popular', 'featured'];
  
  for (const card of missingCards) {
    const weight = card.weight || 3;
    const categories = Array.isArray(card.category) ? card.category : [card.category || ''];
    
    // 높은 우선순위 조건
    const isHighPriority = weight <= 2 || 
                          categories.some(cat => highPriorityCategories.includes(cat));
    
    if (isHighPriority) {
      groups.high.push(card);
    } else if (weight <= 4) {
      groups.medium.push(card);
    } else {
      groups.low.push(card);
    }
  }
  
  // 각 그룹 내에서 시리즈별, 이름별로 정렬
  for (const [priority, cards] of Object.entries(groups)) {
    cards.sort((a, b) => {
      // 시리즈별 정렬
      if (a.series !== b.series) {
        return a.series.localeCompare(b.series);
      }
      // 이름별 정렬
      return a.name.localeCompare(b.name);
    });
  }
  
  return groups;
}

/**
 * 캐시된 누락 카드 목록 가져오기
 * @param {number} page - 페이지 번호 (1부터 시작)
 * @param {number} itemsPerPage - 페이지당 아이템 수
 * @returns {Object} 페이지 정보와 카드 목록
 */
function getMissingCards(page = 1, itemsPerPage = 15) {
  const cards = missingCardsCache.get('cards') || [];
  const total = missingCardsCache.get('total') || 0;
  const lastUpdate = missingCardsCache.get('lastUpdate') || 0;
  
  // 페이지네이션 계산
  const totalPages = Math.ceil(total / itemsPerPage);
  const validPage = Math.max(1, Math.min(page, totalPages));
  
  const startIndex = (validPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, total);
  
  const pageCards = cards.slice(startIndex, endIndex);
  
  return {
    cards: pageCards,
    pagination: {
      currentPage: validPage,
      totalPages: totalPages,
      totalItems: total,
      itemsPerPage: itemsPerPage,
      hasNext: validPage < totalPages,
      hasPrev: validPage > 1
    },
    lastUpdate: lastUpdate
  };
}

/**
 * 특정 카드가 누락 목록에 있는지 확인
 * @param {string} cardId - 카드 ID
 * @param {string} seriesId - 시리즈 ID
 * @returns {boolean} 누락 목록에 있는지 여부
 */
function isCardMissing(cardId, seriesId) {
  const cards = missingCardsCache.get('cards') || [];
  return cards.some(card => 
    card.cardId === cardId && 
    card.seriesId === seriesId
  );
}

/**
 * 캐시에서 특정 카드 제거 (이미지가 추가된 경우)
 * @param {string} cardId - 카드 ID
 * @param {string} seriesId - 시리즈 ID
 */
function removeCardFromMissingCache(cardId, seriesId) {
  const cards = missingCardsCache.get('cards') || [];
  const filteredCards = cards.filter(card => 
    !(card.cardId === cardId && card.seriesId === seriesId)
  );
  
  if (filteredCards.length !== cards.length) {
    missingCardsCache.set('cards', filteredCards);
    missingCardsCache.set('total', filteredCards.length);
    console.log(`[MISSING CARDS] Removed ${cardId} from missing cache`);
    return true;
  }
  return false;
}

/**
 * 캐시 상태 정보 가져오기
 * @returns {Object} 캐시 상태 정보
 */
function getCacheInfo() {
  return {
    totalMissingCards: missingCardsCache.get('total') || 0,
    lastUpdate: missingCardsCache.get('lastUpdate') || 0,
    cacheAge: Date.now() - (missingCardsCache.get('lastUpdate') || 0),
    isHealthy: (Date.now() - lastCacheUpdate) < (24 * 60 * 60 * 1000) // 24시간 이내
  };
}

/**
 * 시리즈명 정규화 (cardAddCommand와 동일한 함수)
 */
function normalizeSeriesName(seriesName) {
  if (!seriesName) return '';
  return seriesName.toLowerCase()
                  .replace(/[^\w\s]/g, '')
                  .replace(/\s+/g, '');
}

/**
 * 캐시 강제 업데이트 (관리자용)
 */
function forceCacheUpdate() {
  console.log('[MISSING CARDS] Force updating cache...');
  return updateMissingCardsCache();
}

module.exports = {
  updateMissingCardsCache,
  getMissingCards,
  isCardMissing,
  removeCardFromMissingCache,
  getCacheInfo,
  forceCacheUpdate
};