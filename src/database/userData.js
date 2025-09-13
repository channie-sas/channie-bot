// src/database/userData.js
const fs = require('fs');
const path = require('path');
const { Collection } = require('discord.js');
const { config } = require('../../config');
const { ITEM_TYPES } = require('./itemTypes');
const { getLastCardIdNumber, setLastCardIdNumber } = require('../utils/cardIdGenerator');

// 사용자 데이터 컬렉션
const userData = new Collection();

// 저장 스로틀링 변수
let isSaveUserDataPending = false;
let lastUserDataSaveTime = 0;
const USER_DATA_SAVE_THROTTLE = 10000; // 10초

/**
 * 스로틀링된 유저 데이터 저장 함수
 */
function saveUserDataThrottled() {
  const now = Date.now();
  
  // 이미 저장 예약이 되어 있거나 마지막 저장 후 일정 시간이 지나지 않았으면 건너뜀
  if (isSaveUserDataPending || (now - lastUserDataSaveTime < USER_DATA_SAVE_THROTTLE)) {
    if (!isSaveUserDataPending) {
      isSaveUserDataPending = true;
      setTimeout(() => {
        saveUserData();
        isSaveUserDataPending = false;
        lastUserDataSaveTime = Date.now();
      }, USER_DATA_SAVE_THROTTLE);
    }
    return;
  }
  
  // 즉시 저장
  saveUserData();
  lastUserDataSaveTime = now;
}

/**
 * 유저 데이터 로드
 */
function loadUserData() {
  try {
    const filePath = path.join(config.paths.DATA_DIR, 'userData.json');
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      
      // lastCardIdNumber 로드 (존재할 경우)
      if (data.lastCardIdNumber !== undefined) {
        setLastCardIdNumber(data.lastCardIdNumber);
      }
      
      // 사용자 데이터 로드
      if (data.users) {
        Object.keys(data.users).forEach(userId => {
          userData.set(userId, data.users[userId]);
        });
      } else {
        // 이전 형식 호환성 유지
        Object.keys(data).forEach(userId => {
          if (userId !== 'lastCardIdNumber') {
            userData.set(userId, data[userId]);
          }
        });
      }
      
      console.log('User data loaded successfully');
    }
  } catch (error) {
    console.error('Error loading user data:', error);
  }
}

/**
 * 유저 데이터 저장
 */
function saveUserData() {
  try {
    const users = {};
    userData.forEach((value, key) => {
      users[key] = value;
    });
    
    // 카드 ID도 함께 저장
    const data = {
      users,
      lastCardIdNumber: getLastCardIdNumber()
    };
    
    fs.writeFileSync(
      path.join(config.paths.DATA_DIR, 'userData.json'),
      JSON.stringify(data, null, 2),
      'utf8'
    );
  } catch (error) {
    console.error('Error saving user data:', error);
  }
}

/**
 * 유저 데이터 초기화 함수
 * @param {string} userId - 사용자 ID
 * @returns {Object} 초기화된 사용자 데이터
 */
function initUserData(userId) {
  if (!userData.has(userId)) {
    userData.set(userId, {
      cards: [],
      lastDrop: 0,                // 마지막 드롭 쿨다운 시작 시간
      remainingDrops: 1,          // 남은 드롭 횟수
      lastGrab: 0,                // 마지막 그랩 쿨다운 시작 시간
      remainingGrabs: 1,          // 남은 그랩 횟수
      pendingDrops: {},           // pendingSelection 대신 pendingDrops 객체로 변경
      activeBids: 0,              // 현재 진행 중인 입찰 수 추적
      inventory: {
        // 기본 인벤토리 초기화
        [ITEM_TYPES.CREDIT]: 0,
        [ITEM_TYPES.CARD_FRAGMENT]: 0,
        [ITEM_TYPES.BASIC_PACK]: 0,
        [ITEM_TYPES.WOOD]: 0,
        [ITEM_TYPES.IRON_ORE]: 0,
        [ITEM_TYPES.GOLD_ORE]: 0,   // 금 광석 추가
        [ITEM_TYPES.COPPER_ORE]: 0, // 구리 광석 추가
        [ITEM_TYPES.STONE]: 0,      // 돌 추가
        [ITEM_TYPES.STAR_FRAGMENT]: 0
      },
      // 카드 쿨다운 관리
      cardCooldowns: {},
      // 프로필 정보 추가
      profile: {
        level: 1,
        exp: 0,
        maxExp: 100,
        lastActive: Date.now(),
        titles: [],
        customInfo: {
          age: null,
          pronoun: null,
          mbti: null,
          zodiac: null,
          collectingSeries: null,
          hobby: null,
          bio: null
        }
      }
    });
    saveUserDataThrottled();
  }
  
  // 기존 사용자 데이터 마이그레이션 및 업데이트
  const user = userData.get(userId);

  // 프로필 정보 초기화 확인
  if (!user.profile) {
    user.profile = {
      level: 1,
      exp: 0,
      maxExp: 100,
      lastActive: Date.now(),
      titles: [],
      customInfo: {
        age: null,
        pronoun: null,
        mbti: null,
        zodiac: null,
        collectingSeries: null,
        hobby: null,
        bio: null
      }
    };
  } else if (!user.profile.customInfo) {
    user.profile.customInfo = {
      age: null,
      pronoun: null,
      mbti: null,
      zodiac: null,
      collectingSeries: null,
      hobby: null,
      bio: null
    };
  }

  // remainingDrops 필드 초기화 확인
  if (user.remainingDrops === undefined) {
    user.remainingDrops = 1;
  }

  // remainingGrabs 필드 초기화 확인
  if (user.remainingGrabs === undefined) {
    user.remainingGrabs = 1;
  }

  // activeBids 필드 초기화 확인
  if (user.activeBids === undefined) {
    user.activeBids = 0;
  }
  
  // 인벤토리 마이그레이션
  if (!user.inventory) {
    user.inventory = {
      [ITEM_TYPES.CREDIT]: user.credits || 0, // 기존 크레딧 마이그레이션
      [ITEM_TYPES.CARD_FRAGMENT]: 0,
      [ITEM_TYPES.BASIC_PACK]: 0,
      [ITEM_TYPES.WOOD]: 0,
      [ITEM_TYPES.IRON_ORE]: 0,
      [ITEM_TYPES.GOLD_ORE]: 0,   // 금 광석 추가
      [ITEM_TYPES.COPPER_ORE]: 0, // 구리 광석 추가
      [ITEM_TYPES.STONE]: 0,      // 돌 추가
      [ITEM_TYPES.STAR_FRAGMENT]: 0
    };
    // 기존 credits 필드 제거
    delete user.credits;
  } else {
    // 새로운 자원 유형 확인 및 추가
    if (user.inventory[ITEM_TYPES.GOLD_ORE] === undefined) {
      user.inventory[ITEM_TYPES.GOLD_ORE] = 0;
    }
    if (user.inventory[ITEM_TYPES.COPPER_ORE] === undefined) {
      user.inventory[ITEM_TYPES.COPPER_ORE] = 0;
    }
    if (user.inventory[ITEM_TYPES.STONE] === undefined) {
      user.inventory[ITEM_TYPES.STONE] = 0;
    }
    if (user.inventory[ITEM_TYPES.STAR_FRAGMENT] === undefined) {
      user.inventory[ITEM_TYPES.STAR_FRAGMENT] = 0;
    }
  }
  
  // 카드 쿨다운 시스템 초기화
  if (!user.cardCooldowns) {
    user.cardCooldowns = {};
  }

  // 레거시 데이터 정리 (건물/액션 포인트 관련)
  if (user.actionPoints) {
    delete user.actionPoints;
  }
  if (user.workingCards) {
    delete user.workingCards;
  }
  
  saveUserDataThrottled();
  return user;
}

/**
 * 카드 사용 및 쿨다운 설정
 * @param {string} userId - 유저 ID
 * @param {string} cardId - 카드 ID
 * @param {number} energyLevel - 카드 에너지 레벨 (0-100)
 * @param {Object} card - 카드 객체 (이름 표시용)
 * @param {Object} message - 디스코드 메시지 객체 (알림용)
 * @returns {boolean} - 카드 사용 성공 여부
 */
function useCard(userId, cardId, energyLevel = 0, card = null, message = null, restSeconds = null) {
  const user = initUserData(userId);
  const now = Date.now();
  
  // 카드 쿨다운 확인
  if (user.cardCooldowns[cardId] && now < user.cardCooldowns[cardId]) {
    return false;
  }
  
  let cooldownTime;
  
  if (restSeconds !== null) {
    // 작업량 기반 휴식 시간 사용 (초를 밀리초로 변환)
    cooldownTime = restSeconds * 1000;
    console.log(`Using work-based cooldown time for card ${cardId}: ${restSeconds} seconds`);
  } else {
    // 기본 에너지 기반 쿨다운 계산 (에너지 0: 10분, 에너지 100: 5분)
    cooldownTime = Math.max(5, 10 - (energyLevel / 20)) * 60 * 1000;
    console.log(`Using default energy-based cooldown time for card ${cardId}: ${cooldownTime/1000} seconds`);
  }
  
  // 쿨다운 설정
  user.cardCooldowns[cardId] = now + cooldownTime;
  
  // 쿨다운 종료 시 알림 설정 (메시지 객체가 있는 경우)
  if (message && card) {
    setTimeout(() => {
      const cardName = card.name || "Your card";
      const actionText = card.skillType === 'mining' ? "mining" : "use";
      message.channel.send(`<@${userId}> ${cardName} (ID: ${cardId}) is now ready for ${actionText} again!`);
    }, cooldownTime);
  }
  
  saveUserDataThrottled();
  return true;
}

/**
 * 카드 쿨다운 정보 가져오기
 * @param {string} userId - 유저 ID
 * @param {string} cardId - 카드 ID
 * @returns {number} - 남은 쿨다운 시간 (ms)
 */
function getCardCooldown(userId, cardId) {
  const user = initUserData(userId);
  const now = Date.now();
  
  if (!user.cardCooldowns[cardId] || now >= user.cardCooldowns[cardId]) {
    return 0;
  }
  
  return user.cardCooldowns[cardId] - now;
}

/**
 * 모든 사용자 데이터 가져오기
 * @returns {Collection} 모든 사용자 데이터
 */
function getAllUserData() {
  return userData;
}

/**
 * 사용자 데이터 즉시 저장 (스로틀링 없이)
 */
function saveUserDataNow() {
  saveUserData();
}

module.exports = {
  userData,
  loadUserData,
  saveUserData,
  saveUserDataThrottled,
  initUserData,
  useCard,
  getCardCooldown,
  getAllUserData,   
  saveUserDataNow
};