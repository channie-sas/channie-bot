// src/database/wishlistDatabase.js - 최적화 버전
const fs = require('fs');
const path = require('path');
const { config } = require('../../config');

// 위시리스트 데이터 구조
let wishlistData = {};

// 저장 스로틀링 변수
let isSaveWishlistPending = false;
let lastWishlistSaveTime = 0;
const WISHLIST_SAVE_THROTTLE = 10000; // 10초

// ========= 캐싱 시스템 추가 =========
const wishlistCache = new Map();
let wishlistCacheTimestamp = 0;
const WISHLIST_CACHE_DURATION = 30 * 1000; // 30초 캐시

/**
 * 위시리스트 데이터 로드
 */
function loadWishlistData() {
  try {
    const filePath = path.join(config.paths.DATA_DIR, 'wishlistData.json');
    if (fs.existsSync(filePath)) {
      wishlistData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      console.log('Wishlist data loaded successfully');
    } else {
      console.log('No wishlist data file found. Starting with empty wishlist.');
      saveWishlistData(); // 빈 상태로 파일 생성
    }
  } catch (error) {
    console.error('Error loading wishlist data:', error);
    wishlistData = {}; // 오류 시 초기화
  }
  
  // 캐시 초기화
  clearWishlistCache();
}

/**
 * 위시리스트 데이터 저장
 */
function saveWishlistData() {
  try {
    fs.writeFileSync(
      path.join(config.paths.DATA_DIR, 'wishlistData.json'),
      JSON.stringify(wishlistData, null, 2),
      'utf8'
    );
    
    // 저장 시 캐시 무효화
    clearWishlistCache();
  } catch (error) {
    console.error('Error saving wishlist data:', error);
  }
}

/**
 * 스로틀링된 위시리스트 데이터 저장 함수
 */
function saveWishlistDataThrottled() {
  const now = Date.now();
  
  if (isSaveWishlistPending || (now - lastWishlistSaveTime < WISHLIST_SAVE_THROTTLE)) {
    if (!isSaveWishlistPending) {
      isSaveWishlistPending = true;
      setTimeout(() => {
        saveWishlistData();
        isSaveWishlistPending = false;
        lastWishlistSaveTime = Date.now();
      }, WISHLIST_SAVE_THROTTLE);
    }
    return;
  }
  
  // 즉시 저장
  saveWishlistData();
  lastWishlistSaveTime = now;
}

/**
 * 위시리스트 캐시 초기화
 */
function clearWishlistCache() {
  wishlistCache.clear();
  wishlistCacheTimestamp = 0;
}

/**
 * 카드 식별자 생성 (카드 이름과 시리즈 이름 기반)
 * @param {string} cardName - 카드 이름
 * @param {string} seriesName - 시리즈 이름 (선택적)
 * @returns {string} - 카드 식별자
 */
function createCardIdentifier(cardName, seriesName = null) {
  if (!cardName) return 'unknown';
  
  const normalizedCardName = cardName.toLowerCase().replace(/\s+/g, '_');
  
  // 시리즈 이름이 있으면 "시리즈명:카드명" 형식, 없으면 카드명만
  if (seriesName) {
    const normalizedSeriesName = seriesName.toLowerCase().replace(/\s+/g, '_');
    return `${normalizedSeriesName}:${normalizedCardName}`;
  }
  
  return normalizedCardName;
}

/**
 * 카드 위시리스트에 유저 추가/제거
 * @param {string} userId - 사용자 ID
 * @param {string} cardName - 카드 이름
 * @param {string} seriesName - 시리즈 이름 (선택적)
 * @param {boolean} add - true면 추가, false면 제거
 * @returns {Object} - 작업 결과
 */
function toggleWishlist(userId, cardName, seriesName = null, add = null) {
  if (!cardName) {
    return { 
      success: false, 
      added: false, 
      removed: false, 
      message: 'Card name is required' 
    };
  }
  
  // 카드 식별자 생성
  const cardIdentifier = createCardIdentifier(cardName, seriesName);
  
  // 카드 위시리스트 초기화 (없는 경우)
  if (!wishlistData[cardIdentifier]) {
    wishlistData[cardIdentifier] = {
      users: [],
      cardName: cardName,
      seriesName: seriesName, // 시리즈 이름 저장
      lastUpdated: Date.now()
    };
  }

  // 유저가 위시리스트에 있는지 확인
  const userIndex = wishlistData[cardIdentifier].users.indexOf(userId);
  const isInWishlist = userIndex !== -1;
  
  // add 파라미터가 null이면 토글 모드
  const shouldAdd = add === null ? !isInWishlist : add;
  
  // 추가 작업
  if (shouldAdd && !isInWishlist) {
    wishlistData[cardIdentifier].users.push(userId);
    wishlistData[cardIdentifier].lastUpdated = Date.now();
    clearWishlistCache(); // 캐시 무효화
    saveWishlistDataThrottled();
    return { success: true, added: true, removed: false };
  } 
  // 제거 작업
  else if (!shouldAdd && isInWishlist) {
    wishlistData[cardIdentifier].users.splice(userIndex, 1);
    wishlistData[cardIdentifier].lastUpdated = Date.now();
    clearWishlistCache(); // 캐시 무효화
    saveWishlistDataThrottled();
    return { success: true, added: false, removed: true };
  }
  
  // 이미 원하는 상태인 경우
  return { 
    success: false, 
    added: false, 
    removed: false, 
    message: isInWishlist ? 'Card is already in wishlist' : 'Card is not in wishlist' 
  };
}

/**
 * 카드 위시리스트에 유저가 있는지 확인
 * @param {string} userId - 사용자 ID
 * @param {string} cardName - 카드 이름
 * @param {string} seriesName - 시리즈 이름 (선택적)
 * @returns {boolean} - 위시리스트에 있으면 true
 */
function isUserInWishlist(userId, cardName, seriesName = null) {
  if (!cardName) return false;
  
  // 시리즈 이름이 있는 경우 먼저 시리즈+카드 형식으로 확인
  if (seriesName) {
    const fullIdentifier = createCardIdentifier(cardName, seriesName);
    if (wishlistData[fullIdentifier] && wishlistData[fullIdentifier].users.includes(userId)) {
      return true;
    }
  }
  
  // 시리즈 이름이 없거나 시리즈+카드로 찾지 못한 경우 카드 이름만으로 확인
  const nameOnlyIdentifier = createCardIdentifier(cardName);
  if (wishlistData[nameOnlyIdentifier] && wishlistData[nameOnlyIdentifier].users.includes(userId)) {
    return true;
  }
  
  return false;
}

/**
 * 카드 위시리스트 유저 목록 가져오기 (최적화 버전)
 * @param {string} cardName - 카드 이름
 * @param {string} seriesName - 시리즈 이름 (선택적)
 * @returns {Array} - 유저 ID 배열
 */
function getWishlistUsers(cardName, seriesName = null) {
  // 캐시 키 생성
  const cacheKey = seriesName ? `${seriesName}:${cardName}` : cardName;
  const now = Date.now();
  
  // 캐시 확인
  if (wishlistCache.has(cacheKey)) {
    const cached = wishlistCache.get(cacheKey);
    if (now - cached.timestamp < WISHLIST_CACHE_DURATION) {
      return [...cached.users]; // 배열 복사본 반환
    }
  }
  
  // 캐시 미스 - 실제 조회
  let users = [];
  
  // 시리즈 이름이 있는 경우 시리즈+카드 형식의 식별자 생성
  if (seriesName) {
    const fullIdentifier = createCardIdentifier(cardName, seriesName);
    
    if (wishlistData[fullIdentifier]) {
      users = [...wishlistData[fullIdentifier].users];
    }
  }
  
  // 시리즈+카드로 찾지 못한 경우 또는 시리즈가 없는 경우 카드 이름만으로 시도
  if (users.length === 0) {
    const nameOnlyIdentifier = createCardIdentifier(cardName);
    
    if (wishlistData[nameOnlyIdentifier]) {
      users = [...wishlistData[nameOnlyIdentifier].users];
    }
  }
  
  // 캐시에 저장
  wishlistCache.set(cacheKey, {
    users: [...users], // 배열 복사본 저장
    timestamp: now
  });
  
  return users;
}

/**
 * 배치 위시리스트 조회 (최적화 - 한 번에 여러 카드 조회)
 * @param {Array} cards - 카드 배열
 * @returns {Map} - 카드별 위시리스트 유저 맵
 */
function getBatchWishlistUsers(cards) {
  const results = new Map();
  
  for (const card of cards) {
    if (card.type === 'resource') continue; // 자원 카드는 위시리스트 제외
    
    const series = card.series || "Unknown Series";
    const cacheKey = `${series}:${card.name}`;
    
    if (!results.has(cacheKey)) {
      const users = getWishlistUsers(card.name, series);
      results.set(cacheKey, users);
    }
  }
  
  return results;
}

/**
 * 유저의 위시리스트 카드 목록 가져오기
 * @param {string} userId - 사용자 ID
 * @returns {Array} - 카드 정보 배열
 */
function getUserWishlist(userId) {
  const userWishlist = [];
  
  for (const [cardIdentifier, data] of Object.entries(wishlistData)) {
    if (data.users.includes(userId)) {
      userWishlist.push({
        cardId: cardIdentifier,
        cardName: data.cardName,
        seriesName: data.seriesName || null, // 시리즈 이름 추가
        addedAt: data.lastUpdated
      });
    }
  }
  
  // 최근에 추가된 순으로 정렬
  return userWishlist.sort((a, b) => b.addedAt - a.addedAt);
}

/**
 * 사용자 ID로 위시리스트 카드 이름 목록 가져오기 (디버깅용)
 * @param {string} userId - 사용자 ID
 * @returns {Array} - 카드 이름 배열
 */
function getUserWishlistNames(userId) {
  return getUserWishlist(userId).map(item => item.cardName);
}

// 마이그레이션: 기존 userData의 wishlist 필드에서 데이터 가져오기 (필요한 경우)
function migrateFromUserData(userData) {
  console.log("Migrating wishlist data from user data...");
  
  let migratedCount = 0;
  
  userData.forEach((user, userId) => {
    if (user.wishlist && Array.isArray(user.wishlist)) {
      user.wishlist.forEach(wishItem => {
        const cardId = wishItem.cardId;
        const cardName = wishItem.cardName;
        
        if (cardId || cardName) {
          const result = toggleWishlist(userId, cardId, cardName, true);
          if (result.success && result.added) {
            migratedCount++;
          }
        }
      });
    }
  });
  
  console.log(`Migrated ${migratedCount} wishlist items.`);
  saveWishlistData();
  return migratedCount;
}

/**
 * 시리즈의 카드들이 모두 위시리스트에 있는지 확인
 * @param {string} userId - 사용자 ID
 * @param {string} seriesName - 시리즈 이름
 * @returns {Object} - 상태 정보 {allInWishlist, partiallyInWishlist, count, total}
 */
function getSeriesWishlistStatus(userId, seriesName) {
  const { getSeriesByName } = require('../database/cardSeries');
  
  // 시리즈 정보 가져오기
  const series = getSeriesByName(seriesName);
  if (!series || !series.cards || series.cards.length === 0) {
    return { allInWishlist: false, partiallyInWishlist: false, count: 0, total: 0 };
  }
  
  // 각 카드의 위시리스트 상태 확인
  let inWishlistCount = 0;
  const totalCards = series.cards.length;
  
  for (const card of series.cards) {
    const cardName = card.name;
    
    // 카드 이름과 시리즈 이름으로 위시리스트 확인
    if (isUserInWishlist(userId, cardName, seriesName)) {
      inWishlistCount++;
    }
  }
  
  return {
    allInWishlist: inWishlistCount === totalCards && totalCards > 0,
    partiallyInWishlist: inWishlistCount > 0 && inWishlistCount < totalCards,
    count: inWishlistCount,
    total: totalCards
  };
}

/**
 * 시리즈의 모든 카드 위시리스트 토글
 * @param {string} userId - 사용자 ID
 * @param {string} seriesName - 시리즈 이름
 * @param {boolean} add - true면 추가, false면 제거, null이면 현재 상태 반전
 * @returns {Object} - 처리 결과 {success, added, removed, count}
 */
function toggleSeriesWishlist(userId, seriesName, add = null) {
  const { getSeriesByName } = require('../database/cardSeries');
  
  // 시리즈 정보 가져오기
  const series = getSeriesByName(seriesName);
  if (!series || !series.cards || series.cards.length === 0) {
    return { success: false, added: 0, removed: 0, total: 0 };
  }
  
  // 현재 위시리스트 상태 확인
  const status = getSeriesWishlistStatus(userId, seriesName);
  
  // add 파라미터가 null이면 토글 모드 (현재 모든 카드가 위시리스트에 있으면 제거, 아니면 추가)
  const shouldAdd = add === null ? !status.allInWishlist : add;
  
  let addedCount = 0;
  let removedCount = 0;
  
  // 각 카드에 대해 위시리스트 처리
  for (const card of series.cards) {
    const cardName = card.name;
    
    // 카드 이름과 시리즈 이름으로 위시리스트 처리
    const result = toggleWishlist(userId, cardName, seriesName, shouldAdd);
    
    if (result.success) {
      if (result.added) addedCount++;
      if (result.removed) removedCount++;
    }
  }
  
  const finalResult = {
    success: true,
    added: addedCount,
    removed: removedCount,
    total: series.cards.length
  };
  
  // 변경 사항이 있으면 강제 저장
  if (addedCount > 0 || removedCount > 0) {
    saveWishlistData();
  }
  
  return finalResult;
}

/**
 * 위시리스트 통계 정보 (디버깅/모니터링용)
 * @returns {Object} - 통계 정보
 */
function getWishlistStats() {
  const totalCards = Object.keys(wishlistData).length;
  let totalUsers = new Set();
  let totalWishlists = 0;
  
  for (const data of Object.values(wishlistData)) {
    if (data.users && Array.isArray(data.users)) {
      data.users.forEach(userId => totalUsers.add(userId));
      totalWishlists += data.users.length;
    }
  }
  
  return {
    totalCards,
    totalUsers: totalUsers.size,
    totalWishlists,
    cacheSize: wishlistCache.size,
    cacheHitRate: wishlistCache.size > 0 ? '캐시 활성화됨' : '캐시 비어있음'
  };
}

module.exports = {
  loadWishlistData,
  saveWishlistData,
  saveWishlistDataThrottled,
  toggleWishlist,
  isUserInWishlist,
  getWishlistUsers,
  getBatchWishlistUsers, // 새로 추가
  getUserWishlist,
  getUserWishlistNames,
  migrateFromUserData,
  getSeriesWishlistStatus,
  toggleSeriesWishlist,
  clearWishlistCache,    // 새로 추가
  getWishlistStats       // 새로 추가 (디버깅용)
};