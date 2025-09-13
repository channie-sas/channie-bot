// src/utils/cardUtils.js
const { config } = require('../../config');
const { getAllCards } = require('../database/cardDatabase');

// 스킬 타입 목록
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

/**
 * 스킬별 세부 능력치 생성 함수
 */
function generateSkillStats(skillType) {
  // 기본 빈 객체
  const stats = {};
  
  // 채광 스킬에 대한 세부 능력치 생성
  if (skillType === 'mining') {
    stats.miningPower = Math.floor(Math.random() * 100) + 1; // 채굴 강도 1~100
    stats.miningSpeed = Math.floor(Math.random() * 100) + 1; // 채굴 속도 1~100%
    stats.accuracy = Math.floor(Math.random() * 100) + 1; // 정확도 1~100%
    stats.luck = Math.floor(Math.random() * 100) + 1; // 행운 1~100%
    stats.maxCapacity = Math.floor(Math.random() * 41) + 10; // 최대 운반량 10~50
    stats.energy = Math.floor(Math.random() * 100) + 1; // 기본 에너지 100
  }
  // 채집 스킬에 대한 세부 능력치 생성
  else if (skillType === 'gathering') {
    stats.detection = Math.floor(Math.random() * 9) + 1; // 채집 탐지 1~9
    stats.gatheringPower = Math.floor(Math.random() * 100) + 1; // 채집 강도 1~100
    stats.gatheringSpeed = Math.floor(Math.random() * 100) + 1; // 채집 속도 0~100%
    stats.accuracy = Math.floor(Math.random() * 100) + 1; // 채집 성공 확률 1~100%
    stats.luck = Math.floor(Math.random() * 100) + 1; // 행운 1~100%
    stats.maxCapacity = Math.floor(Math.random() * 41) + 10; // 최대 운반량 10~50
    stats.energy = Math.floor(Math.random() * 100) + 1; // 기본 에너지 100
  }
  // 빌딩 스킬에 대한 세부 능력치 생성
  else if (skillType === 'building') {
    stats.buildingPower = Math.floor(Math.random() * 100) + 1; // 건설 강도 1~100
    stats.buildingSpeed = Math.floor(Math.random() * 100) + 1; // 건설 속도 (크리티컬 확률) 1~100%
    stats.accuracy = Math.floor(Math.random() * 100) + 1; // 건설 성공 확률 1~100%
    stats.luck = Math.floor(Math.random() * 100) + 1; // 행운 1~100%
    stats.kindness = Math.floor(Math.random() * 100) + 1; // 친절함 1~100%
    stats.energy = Math.floor(Math.random() * 100) + 1; // 에너지 1~100
  }
  
  return stats;
}

/**
 * 랜덤 스킬 타입 가져오기 함수
 */
function getRandomSkillType() {
  const randomIndex = Math.floor(Math.random() * SKILL_TYPES.length);
  return SKILL_TYPES[randomIndex];
}

/**
 * G값 생성 함수 - 두 개의 랜덤 수 중 높은 값 선택
 */
function generateGValue() {
  const min = 1;
  const max = 1000;
  
  // 두 개의 1~1000 사이 랜덤 숫자 생성
  const random1 = Math.floor(Math.random() * (max - min + 1)) + min;
  const random2 = Math.floor(Math.random() * (max - min + 1)) + min;
  
  // 두 숫자 중 더 높은 값 반환 (낮은 G값이 나오기 어렵게)
  return Math.max(random1, random2);
}


// 카드 레벨에 따른 보너스 계산 함수 추가
function calculateLevelBonus(level) {
  // 레벨 1은 보너스 없음, 레벨 2부터 20%씩 증가
  if (level <= 1) return 0;
  
  return (level - 1) * 20;
}

// G값에 따른 효율 계산 함수 추가
function calculateGValueEfficiency(gValue) {
  // G값 범위 확인 (1~1000)
  const validGValue = Math.max(1, Math.min(1000, gValue || 500));
  
  // G값에 따른 효율 계산: 1 → 100%, 1000 → 0%
  const efficiency = 100 - ((validGValue - 1) / 999 * 100);
  
  // 소수점 2자리까지 반올림
  return Math.round(efficiency * 100) / 100;
}

/**
 * 카드의 사용 가능한 변형 중 하나를 랜덤으로 선택
 * 사용 가능한 변형이 없으면 null 반환
 */
function selectRandomVariant(card) {
  const { getAvailableVariants } = require('../../config');
  
  // 카드의 변형 목록 가져오기
  const variants = card.variants || ['v1'];
  
  // 사용 가능한 변형 필터링
  const availableVariants = getAvailableVariants(variants);
  
  // 사용 가능한 변형이 없으면 null 반환
  if (availableVariants.length === 0) {
    console.log(`카드 ${card.name}(${card.id})에 사용 가능한 변형이 없습니다.`);
    return null;
  }
  
  // 랜덤 선택
  const randomIndex = Math.floor(Math.random() * availableVariants.length);
  return availableVariants[randomIndex];
}

/**
 * 고유한 드롭 ID 생성
 */
function generateDropId() {
  // 6자리 랜덤 문자열 생성
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 6; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

/**
 * 랜덤 카드 선택 함수 (가중치 기반)
 */
function getRandomCards(count = 1, filter = null) {
  // 결과 카드 저장 배열
  const selectedCards = [];
  
  for (let i = 0; i < count; i++) {
    // 자원 카드 선택 로직 완전 제거 - 바로 일반 카드 선택으로 진행
    
    // 일반 카드 선택 로직
    const allCards = getAllCards();
    
    // 카드가 없으면 이 반복은 건너뜀
    if (!allCards || allCards.length === 0) {
      console.error('카드 데이터베이스가 비어있습니다.');
      continue;
    }
    
    // 필터 적용 (있는 경우)
    const filteredCards = filter ? allCards.filter(filter) : allCards;
    
    if (filteredCards.length === 0) {
      console.log('필터 조건에 맞는 카드가 없습니다');
      continue;
    }
      
    const remainingCards = [...filteredCards];
    
    // 각 카드의 사용 가능한 변형 미리 체크
    const validCards = remainingCards.filter(card => {
      const variant = selectRandomVariant(card);
      return variant !== null;
    });
    
    if (validCards.length === 0) {
      console.error('사용 가능한 변형이 있는 카드가 없습니다.');
      continue;
    }
    
    // 총 가중치 계산
    const totalWeight = validCards.reduce((sum, card) => sum + (card.weight || 1), 0);
    
    // 랜덤 가중치 값 선택
    let randomWeight = Math.random() * totalWeight;
    let selectedIndex = -1;
    
    // 가중치에 따라 카드 선택
    for (let j = 0; j < validCards.length; j++) {
      const card = validCards[j];
      const cardWeight = card.weight || 1;
      
      randomWeight -= cardWeight;
      if (randomWeight <= 0) {
        selectedIndex = j;
        break;
      }
    }
    
    // 선택된 카드가 없는 경우를 위한 안전장치
    if (selectedIndex === -1 && validCards.length > 0) {
      selectedIndex = 0;
    }
    
    // 카드 선택이 가능한 경우에만 처리
    if (selectedIndex >= 0 && validCards.length > 0) {
      // 선택된 카드 가져오기
      const selectedCard = validCards[selectedIndex];
      
      // 랜덤 변형 선택 (null이 아님을 이미 확인했음)
      const variant = selectRandomVariant(selectedCard);
      
      // G 값 생성 (랜덤)
      const gValue = generateGValue();
      
      // 랜덤 스킬 타입 할당
      const skillType = getRandomSkillType();
      
      // 클론 생성 및 필요한 속성 추가
      const cardClone = {
        ...selectedCard,
        selectedVariant: variant,
        variant: variant, // 호환성을 위해 두 가지로 설정
        gValue: gValue,
        skillType: skillType, // 스킬 타입 추가
        skillStats: generateSkillStats(skillType), // 스킬 능력치 생성 추가
        dropId: generateDropId() // 고유 드롭 ID 추가
      };
      
      selectedCards.push(cardClone);
    } else {
      // 유효한 카드를 선택할 수 없는 경우, 이 반복은 실패
      console.error('유효한 카드를 선택할 수 없습니다.');
      i--; // 다시 시도 (count만큼 추가하기 위해)
    }
  }
  
  // 항상 정확히 count만큼의 카드가 있는지 확인
  console.log(`선택된 카드 수: ${selectedCards.length}, 요청된 수: ${count}`);
  
  return selectedCards;
}

/**
 * 드롭할 카드 선택 (변형, G값, 스킬타입, 드롭ID 추가)
 */
function selectRandomDropCards() {
  const cards = getRandomCards(config.CARDS_PER_DROP);
  
  // 각 카드가 필요한 속성을 가지고 있는지 확인
  return cards.map(card => {
    if (!card.skillType) {
      card.skillType = getRandomSkillType();
    }
    if (!card.gValue) {
      card.gValue = generateGValue();
    }
    if (!card.selectedVariant && !card.variant) {
      card.selectedVariant = selectRandomVariant(card);
      card.variant = card.selectedVariant;
    }
    if (!card.dropId) {
      card.dropId = generateDropId();
    }
    // 스킬 능력치가 없는 경우 생성
    if (!card.skillStats && card.skillType) {
      card.skillStats = generateSkillStats(card.skillType);
    }
    return card;
  });
}

/**
 * 카드 희귀도 텍스트 가져오기
 */
function getRarityText(card) {
  if (!card || !card.weight) return 'Unknown';
  
  const weight = card.weight;
  
  if (weight <= 5) return 'Legendary';
  if (weight <= 10) return 'Epic';
  if (weight <= 15) return 'Rare';
  if (weight <= 25) return 'Uncommon';
  return 'Common';
}

// 모듈 내보내기
module.exports = {
  getRandomCards,
  selectRandomDropCards,
  generateGValue,
  generateDropId,
  selectRandomVariant,
  getRandomSkillType,
  generateSkillStats,
  getRarityText,
  calculateGValueEfficiency,
  calculateLevelBonus
};