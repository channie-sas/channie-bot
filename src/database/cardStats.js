// src/database/cardStats.js
const fs = require('fs');
const path = require('path');
const { config } = require('../../config');
const { getCardById } = require('./cardDatabase');
const { getCardSeriesId, getSeriesByName } = require('./cardSeries');

// 랭킹 캐싱
const rankingCache = new Map();
const CACHE_TTL = 60 * 1000; // 1분


/**
 * 카드 소유자 랭킹 캐싱된 조회 함수
 */
function getCardOwnerRankingCached(cardId, limit = 5) {
  const cacheKey = `card_${cardId}_${limit}`;
  
  // 캐시 확인
  if (rankingCache.has(cacheKey)) {
    const cached = rankingCache.get(cacheKey);
    
    // 캐시가 유효한지 확인
    if (Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }
  }
  
  // 새로 계산
  const ranking = getCardOwnerRanking(cardId, limit);
  
  // 캐시에 저장
  rankingCache.set(cacheKey, {
    data: ranking,
    timestamp: Date.now()
  });
  
  return ranking;
}

/**
 * 시리즈 소유자 랭킹 캐싱된 조회 함수
 */
function getSeriesOwnerRankingCached(seriesId, limit = 5) {
  const cacheKey = `series_${seriesId}_${limit}`;
  
  // 캐시 확인
  if (rankingCache.has(cacheKey)) {
    const cached = rankingCache.get(cacheKey);
    
    // 캐시가 유효한지 확인
    if (Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }
  }
  
  // 새로 계산
  const ranking = getSeriesOwnerRanking(seriesId, limit);
  
  // 캐시에 저장
  rankingCache.set(cacheKey, {
    data: ranking,
    timestamp: Date.now()
  });
  
  return ranking;
}


// 시리즈 ID 캐싱
const cardSeriesCache = new Map();

// 저장 스로틀링 관련 변수
let isSavePending = false;
let lastSaveTime = 0;
const SAVE_THROTTLE = 5000; // 5초마다 저장


/**
 * 스로틀링된 저장 함수 - 일정 시간 내에 여러 호출이 있을 경우 한 번만 실행
 */
function saveCardStatsThrottled() {
  const now = Date.now();
  
  // 이미 저장 예약이 되어 있거나 마지막 저장 후 일정 시간이 지나지 않았으면 건너뜀
  if (isSavePending || (now - lastSaveTime < SAVE_THROTTLE)) {
    if (!isSavePending) {
      isSavePending = true;
      setTimeout(() => {
        saveCardStats();
        isSavePending = false;
        lastSaveTime = Date.now();
      }, SAVE_THROTTLE);
    }
    return;
  }
  
  // 즉시 저장
  saveCardStats();
  lastSaveTime = now;
}

// 카드 통계 데이터 저장소
const cardStats = {
  cards: {}, // 카드별 통계 정보 저장
  series: {},  // 시리즈별 통계 정보 저장 추가
  burnedCards: {} // 소각된 카드 통계 추가
};

/**
 * 카드 통계 초기화 및 로드
 */
function loadCardStats() {
try {
    const filePath = path.join(config.paths.DATA_DIR, 'cardStats.json');
    if (fs.existsSync(filePath)) {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    Object.assign(cardStats, data);
    console.log('Card statistics loaded successfully');
    } else {
    console.log('No card statistics file found. Starting with empty stats.');
    saveCardStats(); // 빈 상태로 파일 생성
    }
} catch (error) {
    console.error('Error loading card statistics:', error);
}
}

/**
 * 카드 통계 저장
 */
function saveCardStats() {
try {
    fs.writeFileSync(
    path.join(config.paths.DATA_DIR, 'cardStats.json'),
    JSON.stringify(cardStats, null, 2),
    'utf8'
    );
} catch (error) {
    console.error('Error saving card statistics:', error);
}
}

// 시리즈 통계 업데이트 함수 추가 (레벨 고려)
function updateSeriesStat(seriesId, userId, increment = true, level = 1) {
  if (!seriesId || !userId) return;
  
  // 시리즈 통계가 없으면 초기화
  if (!cardStats.series[seriesId]) {
    cardStats.series[seriesId] = {
      total: 0,
      owners: {}
    };
  }
  
  // 증가 또는 감소 (레벨 고려)
  const changeValue = increment ? level : -level;
  
  // 총 개수 업데이트
  cardStats.series[seriesId].total = (cardStats.series[seriesId].total || 0) + changeValue;
  if (cardStats.series[seriesId].total < 0) cardStats.series[seriesId].total = 0;
  
  // 소유자별 개수 업데이트
  if (!cardStats.series[seriesId].owners[userId]) {
    cardStats.series[seriesId].owners[userId] = 0;
  }
  
  cardStats.series[seriesId].owners[userId] += changeValue;
  
  // 값이 0 이하면 제거
  if (cardStats.series[seriesId].owners[userId] <= 0) {
    delete cardStats.series[seriesId].owners[userId];
  }
  
  return cardStats.series[seriesId];
}

/**
 * 향상된 시리즈 ID 조회 함수
 * @param {string} cardId - 카드 ID
 * @param {string} seriesName - 시리즈 이름 (선택적)
 * @returns {string|null} 시리즈 ID 또는 null
 */
function getSeriesIdFromCardId(cardId, seriesName = null) {
  // 캐시 확인
  if (cardSeriesCache.has(cardId)) {
    return cardSeriesCache.get(cardId);
  }
  
  // 기존 로직으로 시리즈 ID 조회
  let seriesId = null;
  
  try {
    // 1. 직접 전달된 시리즈 이름이 있는 경우
    if (seriesName) {
      seriesId = seriesName.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, '');
    } 
    // 2. 카드 정보 조회
    else {
      const card = getCardById(cardId);
      if (card) {
        if (card.seriesId) {
          seriesId = card.seriesId;
        } else if (card.series) {
          seriesId = card.series.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, '');
        }
      }
      
      // 3. cardSeries 모듈의 함수 사용
      if (!seriesId) {
        seriesId = getCardSeriesId(cardId);
      }
    }
  } catch (error) {
    console.error(`Error getting series ID for card ${cardId}:`, error);
  }
  
  // 캐시에 저장 (null이라도 저장하여 반복적인 실패 방지)
  if (seriesId) {
    cardSeriesCache.set(cardId, seriesId);
  }
  
  return seriesId;
}

/**
 * 카드 추가 시 통계 업데이트 - 내부에서 시리즈 정보도 처리
 * @param {string} cardId - 카드 ID 
 * @param {string} userId - 사용자 ID
 * @param {string} variant - 카드 변형
 * @param {number} level - 카드 레벨 (기본값: 1)
 * @param {string} seriesId - 시리즈 ID (기본값: null)
 */
function incrementCardStat(cardId, userId, variant, level = 1, seriesId = null) {
  if (!cardId) return;
  
  // 카드 통계가 없으면 초기화
  if (!cardStats.cards[cardId]) {
    cardStats.cards[cardId] = {
      total: 0,
      variants: {},
      owners: {}
    };
  }
  
  // 총 개수 증가 (레벨 고려)
  cardStats.cards[cardId].total = (cardStats.cards[cardId].total || 0) + level;
  
  // 변형별 개수 증가 (레벨 고려)
  const variantKey = variant || 'v1';
  if (!cardStats.cards[cardId].variants[variantKey]) {
    cardStats.cards[cardId].variants[variantKey] = 0;
  }
  cardStats.cards[cardId].variants[variantKey] += level;
  
  // 소유자별 개수 증가 (레벨 고려)
  if (userId) {
    if (!cardStats.cards[cardId].owners[userId]) {
      cardStats.cards[cardId].owners[userId] = 0;
    }
    cardStats.cards[cardId].owners[userId] += level;
  }
  
  // 시리즈 통계 업데이트 (레벨 고려)
  try {
    // 시리즈 ID가 직접 제공된 경우 사용
    const seriesIdToUse = seriesId || getSeriesIdFromCardId(cardId);
    
    if (seriesIdToUse && userId) {
      updateSeriesStat(seriesIdToUse, userId, true, level);
    }
  } catch (error) {
    console.error(`Error updating series stats for card ${cardId}:`, error);
  }
  
  // 스로틀링된 저장 함수 사용
  saveCardStatsThrottled();
  return cardStats.cards[cardId];
}

/**
 * 카드 제거 시 통계 업데이트 - 내부에서 시리즈 정보도 처리
 * @param {string} cardId - 카드 ID
 * @param {string} userId - 사용자 ID
 * @param {string} variant - 카드 변형
 * @param {number} level - 카드 레벨 (기본값: 1)
 */
function decrementCardStat(cardId, userId, variant, level = 1) {
  if (!cardId || !cardStats.cards[cardId]) return;
  
  // 총 개수 감소 (레벨 고려)
  if (cardStats.cards[cardId].total >= level) {
    cardStats.cards[cardId].total -= level;
  } else {
    cardStats.cards[cardId].total = 0;
  }
  
  // 변형별 개수 감소
  const variantKey = variant || 'v1';
  if (cardStats.cards[cardId].variants[variantKey] >= level) {
    cardStats.cards[cardId].variants[variantKey] -= level;
    
    // 0이 되면 변형 항목 제거
    if (cardStats.cards[cardId].variants[variantKey] === 0) {
      delete cardStats.cards[cardId].variants[variantKey];
    }
  }
  
  // 소유자별 개수 감소 (레벨 고려)
  if (userId && cardStats.cards[cardId].owners[userId] >= level) {
    cardStats.cards[cardId].owners[userId] -= level;
    
    // 0이 되면 소유자 항목 제거
    if (cardStats.cards[cardId].owners[userId] === 0) {
      delete cardStats.cards[cardId].owners[userId];
    }
  }
  
  // 시리즈 통계 업데이트 (레벨 고려)
  const seriesId = getSeriesIdFromCardId(cardId);
  if (seriesId && userId) {
    updateSeriesStat(seriesId, userId, false, level);
  }
  
  // 스로틀링된 저장 함수 사용
  saveCardStatsThrottled();
  return cardStats.cards[cardId];
}

/**
 * 카드 통계 전송 함수 (레벨 고려)
 * @param {string} cardId - 카드 ID
 * @param {string} fromUserId - 보내는 사용자 ID
 * @param {string} toUserId - 받는 사용자 ID
 * @param {string} variant - 카드 변형
 * @param {number} level - 카드 레벨 (기본값: 1)
 */
function transferCardStat(cardId, fromUserId, toUserId, variant, level = 1) {
  // 소유자 변경에 따른 기본 통계 업데이트 (기존 방식)
  decrementCardStat(cardId, fromUserId, variant);
  incrementCardStat(cardId, toUserId, variant);
}

/**
 * 시리즈별 소유자 랭킹 조회
 */
function getSeriesOwnerRanking(seriesId, limit = 5) {
  if (!seriesId || !cardStats.series[seriesId]) {
    return [];
  }
  
  // 소유자 목록 추출
  const owners = cardStats.series[seriesId].owners || {};
  
  // 소유 횟수별로 정렬
  return Object.entries(owners)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

/**
 * 특정 카드의 통계 정보 조회
 */
function getCardStats(cardId) {
    if (!cardId || !cardStats.cards[cardId]) {
      return {
        total: 0,
        variants: {},
        owners: {}
      };
    }
    
    return cardStats.cards[cardId];
  }
  
  /**
   * 카드 랭킹 정보 조회
   */
  function getCardOwnerRanking(cardId, limit = 5) {
    if (!cardId || !cardStats.cards[cardId]) {
      return [];
    }
    
    // 소유자 목록 추출
    const owners = cardStats.cards[cardId].owners || {};
    
    // 소유 횟수별로 정렬
    return Object.entries(owners)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);
  }

/**
 * 특정 시리즈의 통계 정보 조회
 */
function getSeriesStats(seriesId) {
  if (!seriesId || !cardStats.series[seriesId]) {
    return {
      total: 0,
      owners: {}
    };
  }
  
  return cardStats.series[seriesId];
}

/**
 * 소각된 카드 통계 증가 함수
 * @param {string} cardId - 카드 ID
 * @param {string} userId - 사용자 ID
 * @param {string} variant - 카드 변형
 * @param {number} level - 카드 레벨 (기본값: 1)
 */
function incrementBurnedCardStat(cardId, userId, variant, level = 1) {
  // cardStats 객체 확인
  if (!cardStats) {
    console.error('cardStats is undefined in incrementBurnedCardStat');
    return;
  }
  
  // 소각 통계 초기화 (없는 경우)
  if (!cardStats.burnedCards) {
    cardStats.burnedCards = {};
  }

  if (!cardStats.burnedCards[cardId]) {
    cardStats.burnedCards[cardId] = {
      users: {},
      total: 0,
      variants: {}
    };
  }
  
  // 기존 속성이 없으면 초기화
  if (!cardStats.burnedCards[cardId].users) {
    cardStats.burnedCards[cardId].users = {};
  }
  
  if (!cardStats.burnedCards[cardId].total) {
    cardStats.burnedCards[cardId].total = 0;
  }
  
  // 카드 레벨에 따른 포인트 가중치 적용
  if (!cardStats.burnedCards[cardId].users[userId]) {
    cardStats.burnedCards[cardId].users[userId] = 0;
  }
  
  cardStats.burnedCards[cardId].users[userId] += level;
  cardStats.burnedCards[cardId].total += level;
  
  // 변형별 통계 추가 (선택사항)
  if (variant) {
    if (!cardStats.burnedCards[cardId].variants) {
      cardStats.burnedCards[cardId].variants = {};
    }
    
    if (!cardStats.burnedCards[cardId].variants[variant]) {
      cardStats.burnedCards[cardId].variants[variant] = {
        users: {},
        total: 0
      };
    }
    
    if (!cardStats.burnedCards[cardId].variants[variant].users) {
      cardStats.burnedCards[cardId].variants[variant].users = {};
    }
    
    if (!cardStats.burnedCards[cardId].variants[variant].users[userId]) {
      cardStats.burnedCards[cardId].variants[variant].users[userId] = 0;
    }
    
    cardStats.burnedCards[cardId].variants[variant].users[userId] += level;
    cardStats.burnedCards[cardId].variants[variant].total = (cardStats.burnedCards[cardId].variants[variant].total || 0) + level;
  }
  
  // 변경사항 저장
  saveCardStats();
}

/**
 * 특정 카드의 소각 통계 정보 조회
 */
function getBurnedCardStats(cardId) {
  if (!cardId || !cardStats.burnedCards[cardId]) {
    return {
      total: 0,
      variants: {},
      users: {}
    };
  }
  
  return cardStats.burnedCards[cardId];
}



// 마이그레이션 함수도 시리즈 통계 처리 추가
function migrateInitialCardStats(userData) {
  console.log('Migrating initial card statistics...');
  
  // 모든 기존 데이터 초기화
  cardStats.cards = {};
  cardStats.series = {};
  
  // 모든 유저 데이터 확인
  userData.forEach((user, userId) => {
    if (!user.cards) return;
    
    // 각 카드의 통계 업데이트
    user.cards.forEach(card => {
      incrementCardStat(card.cardId, userId, card.variant);
      // incrementCardStat 내부에서 시리즈 통계도 처리됨
    });
  });
  
  console.log(`Migration complete! ${Object.keys(cardStats.cards).length} cards tracked.`);
  saveCardStats();
}

// 모듈 내보내기
module.exports = {
  cardStats,
  loadCardStats,
  saveCardStats,
  saveCardStatsThrottled,
  incrementCardStat,
  decrementCardStat,
  transferCardStat,
  getCardStats,
  getCardOwnerRanking,
  getCardOwnerRankingCached,
  getSeriesOwnerRanking,
  getSeriesOwnerRankingCached,
  getSeriesStats,
  migrateInitialCardStats,
  incrementBurnedCardStat,
  getBurnedCardStats,
  getSeriesIdFromCardId
};