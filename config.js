// config.js (간소화된 버전)
const path = require('path');
const fs = require('fs');

// 기본 경로 설정
const BASE_DIR = __dirname;
const DATA_DIR = path.join(BASE_DIR, 'data');
const CARDS_DIR = path.join(BASE_DIR, 'cards');
const FRAMES_DIR = path.join(BASE_DIR, 'frames');
const FONTS_DIR = path.join(BASE_DIR, 'fonts');

// 스킬 타입 정의
const SKILL_TYPES = [
  'mining', 
  'fishing', 
  'battle', 
  'building', 
  'farming', 
  'crafting', 
  'excavation', 
  'researching', 
  'gathering'
];

// 카드 봇 설정
const config = {
  // 시간 관련 설정 (초 단위)
  DROP_COOLDOWN: 480,       // 카드 드롭 쿨다운 480초
  GRAB_COOLDOWN: 240,       // 카드 그랩 쿨다운 240초
  MIN_DROP_COOLDOWN: 120,   // 최소 드롭 쿨다운 (2분 = 120초)
  MIN_GRAB_COOLDOWN: 60,    // 최소 그랩 쿨다운 (1분 = 60초)
  CARD_BID_DURATION: 15,    // 카드 입찰 기간

  // 카드 추가 가능한 변형 목록 (수동 관리)
  addableVariants: ['v1', 'v2'], // 관리자가 수동으로 추가 가능한 변형들
  
  // 카드 추가 시스템 설정
  CARD_ADD_SYSTEM: {
    ITEMS_PER_PAGE: 15,           // 페이지당 표시할 아이템 수
    CACHE_UPDATE_INTERVAL: 24,   // 캐시 업데이트 간격 (시간)
    MAX_MISSING_CARDS: 1000      // 최대 표시할 누락 카드 수
  },

  // 채널 설정 (반드시 초기화된 배열이어야 함)
  dropChannels: [],           // 드롭 전용 채널 ID 목록

    // 이벤트 시스템 설정
  EVENT_SYSTEM: {
    AVAILABLE_GAMES: [1],    // 등장 가능한 게임 타입들 (1: COUNTING_GAME, 2: WEREWOLF_GAME)
    BASE_INTERVAL: 3 * 60 * 60 * 1000,  // 기본 대기 시간: 3시간 (밀리초)
    ACTIVITY_REDUCTION: 60 * 1000,      // 액티비티당 차감 시간: 1분 (밀리초)
    CHECK_INTERVAL: 60 * 1000,          // 이벤트 체크 간격: 1분 (밀리초)
    MIN_INTERVAL: 30 * 60 * 1000        // 최소 대기 시간: 30분 (밀리초)
  },

  // UI 시간 설정
  CC_REMAINING_TIME: 120, // CC 사라지는 초 단위
  
  // 카드 관련 설정
  CARDS_PER_DROP: 3,           // 한 번에 드롭되는 카드 수
  enabledSpecialVariants: [],  // 활성화된 특수 변형들

  // 카드 전송 관련 설정
  CARD_TRANSFER_FEE: 100,     // 카드 전송 시 필요한 크레딧
  CARD_TRANSFER_TIMEOUT: 60000, // 카드 전송 확인 제한 시간 (1분 = 60000ms)

  // 카드 이미지 설정
  cardImageWidth: 330,         // 카드 이미지 너비
  cardImageHeight: 470,        // 카드 이미지 높이
  cardSpacing: 20,             // 카드 사이 간격
  cardCornerRadius: 31,        // 카드 모서리 둥글기 정도
  
  // 특수 변형 목록 (프레임을 사용하지 않는 변형들)
  specialVariants: ['sparkle', 'holo', 'rainbow'],
  
  // 기본 프레임 이름
  defaultFrame: 'default',
  
  // 스킬 타입 정보
  SKILL_TYPES: SKILL_TYPES,

  // 경로 설정
  paths: {
    DATA_DIR,
    CARDS_DIR,
    FRAMES_DIR,
    FONTS_DIR
  }
};

// 추가 가능한 변형 관리 함수들
function addVariantToConfig(variant) {
  if (!config.addableVariants.includes(variant)) {
    config.addableVariants.push(variant);
    console.log(`Added variant '${variant}' to addable variants list`);
    return true;
  }
  return false;
}

function removeVariantFromConfig(variant) {
  const index = config.addableVariants.indexOf(variant);
  if (index > -1) {
    config.addableVariants.splice(index, 1);
    console.log(`Removed variant '${variant}' from addable variants list`);
    return true;
  }
  return false;
}

function getAddableVariants() {
  return [...config.addableVariants]; // 복사본 반환
}

// 특수 변형 관리 함수
function setSpecialVariants(variants) {
  config.enabledSpecialVariants = Array.isArray(variants) ? variants : [];
  console.log(`Special variants enabled: ${config.enabledSpecialVariants.join(', ') || 'None'}`);
}

// 기본 변형만 필터링 함수 
function getAvailableVariants(cardVariants) {
  // v로 시작하는 것은 항상 포함 (기본 버전)
  const basicVariants = cardVariants.filter(v => v.startsWith('v'));
  
  // 활성화된 특수 변형 추가
  const specialVariants = cardVariants.filter(v => 
    !v.startsWith('v') && config.enabledSpecialVariants.includes(v)
  );
  
  return [...basicVariants, ...specialVariants];
}

// 변형 이름을 보기 좋게 변환
function prettyVariantName(variant) {
  if (variant.startsWith('v')) {
    return `Version ${variant.substring(1)}`;
  }
  // 첫 글자를 대문자로 변환
  return variant.charAt(0).toUpperCase() + variant.slice(1);
}

// 특정 카드에 대한 프레임 사용 여부 판단
function shouldUseFrame(card) {

  // 자원 카드는 프레임을 사용하지 않음
  if (card && card.type === 'resource') {
    return false;
  }

  const variant = card.selectedVariant || card.variant || 'v1';
  
  // 특수 변형(sparkle, holo 등)이면 프레임 사용 안 함
  if (config.specialVariants.includes(variant)) {
    return false;
  }
  
  // 사용자가 프레임을 지정했는지 확인 (나중에 프레임 변경 기능 추가시 사용)
  if (card.customFrame) {
    return true;
  }
  
  // 기본 변형(v1, v2, v3 등)이면 기본 프레임 사용
  if (variant.startsWith('v')) {
    return true;
  }
  
  return false;
}

// 시리즈 디렉토리 가져오기 (동적 방식)
function getSeriesDirectory(seriesId) {
  if (!seriesId) return config.paths.CARDS_DIR;
  
  // 시리즈 ID를 소문자로 정규화
  const normalizedId = seriesId.toLowerCase().trim();
  
  // 해당 디렉토리 경로 생성
  const seriesDir = path.join(config.paths.CARDS_DIR, normalizedId);
  
  // 디렉토리가 존재하는지 확인하고 없으면 생성
  if (!fs.existsSync(seriesDir)) {
    try {
      fs.mkdirSync(seriesDir, { recursive: true });
      console.log(`Created directory for series: ${seriesDir}`);
    } catch (error) {
      console.error(`Error creating directory for series ${normalizedId}:`, error);
      // 실패하면 기본 카드 디렉토리 반환
      return config.paths.CARDS_DIR;
    }
  }
  
  return seriesDir;
}

// 프레임 이미지 경로 가져오기
function getFrameImagePath(card) {
  // 프레임을 사용하지 않으면 null 반환
  if (!shouldUseFrame(card)) {
    return null;
  }
  
  // 스킬 타입에 맞는 프레임 이미지 경로 (스킬 타입이 있는 경우)
  if (card.skillType && config.SKILL_TYPES.includes(card.skillType)) {
    const skillFramePath = path.join(config.paths.FRAMES_DIR, `default-${card.skillType}.png`);
    
    // 파일이 존재하는지 확인
    if (fs.existsSync(skillFramePath)) {
      return skillFramePath;
    }
  }
  
  // 사용자 지정 프레임이 있으면 그 프레임 사용 (나중에 프레임 변경 기능 추가시 사용)
  const frameName = card.customFrame || config.defaultFrame;
  
  return path.join(config.paths.FRAMES_DIR, `${frameName}.png`);
}

// 랜덤 스킬 타입 가져오기
function getRandomSkillType() {
  const randomIndex = Math.floor(Math.random() * config.SKILL_TYPES.length);
  return config.SKILL_TYPES[randomIndex];
}

// 필요한 기본 디렉토리 생성
function ensureDirectories() {
  const dirs = [
    config.paths.DATA_DIR,
    config.paths.CARDS_DIR,
    config.paths.FRAMES_DIR,
    config.paths.FONTS_DIR
    // 자원 카드 관련 디렉토리 제거
  ];
  
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`Created directory: ${dir}`);
    }
  }
  
  // 카드 시리즈 디렉토리 목록 확인
  try {
    const items = fs.readdirSync(config.paths.CARDS_DIR);
    for (const item of items) {
      const itemPath = path.join(config.paths.CARDS_DIR, item);
      const isDirectory = fs.statSync(itemPath).isDirectory();
    }
  } catch (error) {
    console.error('Error checking card series directories:', error);
  }
}

module.exports = {
  config,
  setSpecialVariants,
  getAvailableVariants,
  prettyVariantName,
  shouldUseFrame,
  getFrameImagePath,
  getSeriesDirectory,
  getRandomSkillType,
  ensureDirectories,
  addVariantToConfig,
  removeVariantFromConfig,
  getAddableVariants
};