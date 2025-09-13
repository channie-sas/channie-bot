// src/game/fishingGame.js
// 낚시 게임 핵심 로직

const { FISH_TYPES, FISH_VARIANTS, FISH_STATE, PLAYER_ACTION, GAME_RESULT, DEFAULT_ROD, FISH_RARITY } = require('../database/fishData');
const { generateUniqueFishId } = require('../utils/fishIdGenerator');

/**
 * 낚시 게임 클래스
 */
class FishingGame {
  constructor(userId, rod = DEFAULT_ROD) {
    this.userId = userId;
    this.rod = rod;
    this.fish = null;
    this.tension = 50; // 시작 텐션
    this.turns = 20; // 최대 턴 수
    this.isGameOver = false;
    this.gameResult = null;
    this.turnHistory = []; // 턴별 기록
    
    this.initializeFish();
  }

  /**
   * 물고기 초기화
   */
  initializeFish() {
    // 희귀도별 가중치 (특별 행운 적용)
    const rarityWeights = {
      [FISH_RARITY.COMMON]: 50,
      [FISH_RARITY.UNCOMMON]: 30,
      [FISH_RARITY.RARE]: 15,
      [FISH_RARITY.EPIC]: 4,
      [FISH_RARITY.LEGENDARY]: 1
    };
    
    // 특별 행운 적용 (희귀도 높은 물고기 확률 증가)
    if (this.rod.specialLuck > 0) {
      const specialBonus = this.rod.specialLuck / 100;
      rarityWeights[FISH_RARITY.RARE] += Math.floor(rarityWeights[FISH_RARITY.RARE] * specialBonus);
      rarityWeights[FISH_RARITY.EPIC] += Math.floor(rarityWeights[FISH_RARITY.EPIC] * specialBonus);
      rarityWeights[FISH_RARITY.LEGENDARY] += Math.floor(rarityWeights[FISH_RARITY.LEGENDARY] * specialBonus);
    }
    
    // 희귀도 결정
    const totalWeight = Object.values(rarityWeights).reduce((sum, weight) => sum + weight, 0);
    const random = Math.random() * totalWeight;
    
    let selectedRarity = FISH_RARITY.COMMON;
    let cumulativeWeight = 0;
    
    for (const [rarity, weight] of Object.entries(rarityWeights)) {
      cumulativeWeight += weight;
      if (random < cumulativeWeight) {
        selectedRarity = rarity;
        break;
      }
    }
    
    // 해당 희귀도의 물고기만 선택
    const fishOfRarity = Object.entries(FISH_TYPES)
      .filter(([_, data]) => data.rarity === selectedRarity);
    
    const [fishType, fishTypeData] = fishOfRarity[Math.floor(Math.random() * fishOfRarity.length)];

    // 랜덤 물고기 타입 선택
    const fishTypeKeys = Object.keys(FISH_TYPES);
    const randomFishType = fishTypeKeys[Math.floor(Math.random() * fishTypeKeys.length)];

    // 물고기 크기 결정 (별 개수)
    const stars = this.determineFishSize();
    const sizePercentage = this.calculateSizePercentage(stars);
    
    // 실제 사이즈 계산
    const actualSize = this.calculateActualSize(fishTypeData.baseSize, stars);

    // 물고기 스탯 계산
    const maxHealth = Math.floor(fishTypeData.baseHealth * (1 + sizePercentage));
    const fishPower = Math.floor(fishTypeData.basePower * (1 + sizePercentage));

    this.fish = {
      type: randomFishType,
      name: fishTypeData.name,
      rarity: fishTypeData.rarity,
      stars: stars,
      sizePercentage: sizePercentage,
      baseSize: fishTypeData.baseSize,
      actualSize: actualSize,
      maxHealth: maxHealth,
      currentHealth: maxHealth,
      fishPower: fishPower,
      safetyRange: [...fishTypeData.safetyRange], // 복사
      stateProbabilities: { ...fishTypeData.stateProbabilities }, // 복사
      baseValue: fishTypeData.baseValue,
      recoverHealth: { ...fishTypeData.recoverHealth }
    };
  }

  /**
   * 실제 사이즈 계산
   * @param {number} baseSize - 기본 사이즈 (cm)
   * @param {number} stars - 별 개수
   * @returns {number} 실제 사이즈 (cm)
   */
  calculateActualSize(baseSize, stars) {
    // 별 개수에 따른 사이즈 증가율 계산
    // 별 1개: 0~20%, 별 2개: 20~40%, 별 3개: 40~60% 등
    const minPercentage = (stars - 1) * 0.20;
    const maxPercentage = stars * 0.20;
    
    // 해당 범위 내에서 랜덤 증가율 계산
    const sizeIncrease = minPercentage + Math.random() * (maxPercentage - minPercentage);
    
    // 실제 사이즈 계산 (소수점 1자리까지)
    const actualSize = baseSize * (1 + sizeIncrease);
    return Math.round(actualSize * 10) / 10;
  }

  /**
   * 물고기 크기 결정 (별 개수)
   * @returns {number} 별 개수
   */
  determineFishSize() {
    let stars = 1;
    
    // 50% + (Rod.luck * 1%) 확률로 추가 별 획득
    while (true) {
      const chance = 50 + (this.rod.luck * 1);
      if (Math.random() * 100 < chance) {
        stars++;
      } else {
        break;
      }
    }
    
    return stars;
  }

  /**
   * 크기 퍼센티지 계산
   * @param {number} stars - 별 개수
   * @returns {number} 크기 퍼센티지 (0-1)
   */
  calculateSizePercentage(stars) {
    const minPercent = (stars - 1) * 0.20;
    const maxPercent = stars * 0.20;
    return minPercent + Math.random() * (maxPercent - minPercent);
  }

  /**
   * 플레이어 액션 처리
   * @param {string} action - 플레이어 액션
   * @returns {Object} 턴 결과
   */
  processPlayerAction(action) {
    if (this.isGameOver) {
      return { error: 'Game is already over' };
    }

    console.log(`Processing player action: ${action}`);
    console.log(`Available actions: ${JSON.stringify(PLAYER_ACTION)}`);

    let tensionChange = 0;

    // 플레이어 액션에 따른 텐션 변화
    switch (action) {
      case PLAYER_ACTION.SLOW_SLACK:
        tensionChange = -(Math.floor(Math.random() * 11) + 5); // -5 to -15
        console.log(`SLOW_SLACK action processed, tension change: ${tensionChange}`);
        break;
      case PLAYER_ACTION.HARD_SLACK:
        tensionChange = -(Math.floor(Math.random() * 11) + 20); // -20 to -30
        console.log(`HARD_SLACK action processed, tension change: ${tensionChange}`);
        break;
      case PLAYER_ACTION.SLOW_REEL:
        tensionChange = Math.floor(Math.random() * 11) + 5; // +5 to +15
        console.log(`SLOW_REEL action processed, tension change: ${tensionChange}`);
        break;
      case PLAYER_ACTION.HARD_REEL:
        tensionChange = Math.floor(Math.random() * 11) + 20; // +20 to +30
        console.log(`HARD_REEL action processed, tension change: ${tensionChange}`);
        break;
      case PLAYER_ACTION.WAIT:
        tensionChange = 0;
        console.log(`WAIT action processed, tension change: ${tensionChange}`);
        break;
      default:
        console.error(`Invalid action received: "${action}"`);
        console.error(`Action type: ${typeof action}`);
        console.error(`Expected actions: ${Object.values(PLAYER_ACTION).join(', ')}`);
        return { error: `Invalid action: ${action}` };
    }

    // 물고기 상태 결정
    const fishState = this.determineFishState();
    const fishTensionChange = this.calculateFishTensionChange(fishState);

    // 총 텐션 변화 적용
    const totalTensionChange = tensionChange + fishTensionChange;
    this.tension = Math.max(0, Math.min(100, this.tension + totalTensionChange));

    // 즉시 텐션 체크 (0 미만 또는 100 초과)
    if (this.tension <= 0 || this.tension >= 100) {
      this.endGame(GAME_RESULT.LINE_BREAK);
      return this.getTurnResult(action, fishState, tensionChange, fishTensionChange, totalTensionChange, true);
    }

    // 턴 종료 처리
    const damageDealt = this.processTurnEnd();
    this.turns--;

    // 승리 조건 체크
    if (this.fish.currentHealth <= 0) {
      this.endGame(GAME_RESULT.SUCCESS);
    }
    // 턴 소진 체크
    else if (this.turns <= 0) {
      this.endGame(GAME_RESULT.FISH_ESCAPED_TURNS);
    }

    const turnResult = this.getTurnResult(action, fishState, tensionChange, fishTensionChange, totalTensionChange, false, damageDealt);
    this.turnHistory.push(turnResult);

    return turnResult;
  }

  /**
   * 물고기 상태 결정
   * @returns {string} 물고기 상태
   */
  determineFishState() {
    const probabilities = this.fish.stateProbabilities;
    const random = Math.random() * 100;
    
    let cumulativeChance = 0;
    for (const [state, chance] of Object.entries(probabilities)) {
      cumulativeChance += chance;
      if (random < cumulativeChance) {
        return state;
      }
    }
    
    return FISH_STATE.NIBBLING; // 기본값
  }

  /**
   * 물고기 상태에 따른 텐션 변화 계산
   * @param {string} fishState - 물고기 상태
   * @returns {number} 텐션 변화량
   */
  calculateFishTensionChange(fishState) {
    const power = this.fish.fishPower;
    let change = 0;

    switch (fishState) {
      case FISH_STATE.STRONG_PULL:
        change = Math.floor(Math.random() * (power * 0.5)) + (power * 1.5);
        break;
      case FISH_STATE.SLACKENING_OFF:
        change = -(Math.floor(Math.random() * (power * 0.5)) + (power * 1.5));
        break;
      case FISH_STATE.NIBBLING:
        change = Math.floor(Math.random() * (power * 0.5)) + power;
        break;
      case FISH_STATE.DRIFTING:
        change = -(Math.floor(Math.random() * (power * 0.5)) + power);
        break;
      case FISH_STATE.RECOVER:
        change = 0;
        break;
    }

    // 낚시대 강도로 나누기
    return Math.floor(change / this.rod.strength);
  }

  /**
   * 턴 종료 처리
   * @returns {number} 가한 데미지
   */
  processTurnEnd() {
    let damageDealt = 0;

    // 안전 범위 체크 - 안전 범위 내에서만 데미지 적용
    if (this.tension >= this.fish.safetyRange[0] && this.tension <= this.fish.safetyRange[1]) {
      // 데미지 계산
      const damageMultiplier = this.calculateDamageMultiplier();
      damageDealt = Math.floor(this.rod.damage * damageMultiplier);
      this.fish.currentHealth = Math.max(0, this.fish.currentHealth - damageDealt);

      // 회복 상태 처리
      if (this.turnHistory.length > 0) {
        const lastTurn = this.turnHistory[this.turnHistory.length - 1];
        if (lastTurn && lastTurn.fishState === FISH_STATE.RECOVER) {
          const recoverAmount = Math.floor(Math.random() * (this.fish.recoverHealth.max - this.fish.recoverHealth.min + 1)) + this.fish.recoverHealth.min;
          this.fish.currentHealth = Math.min(this.fish.maxHealth, this.fish.currentHealth + recoverAmount);
        }
      }
    }
    // 안전 범위 밖이면 데미지 없음 (게임은 계속)

    return damageDealt;
  }

  /**
   * 데미지 배수 계산
   * @returns {number} 데미지 배수 (1.0 - 2.0)
   */
  calculateDamageMultiplier() {
    return Math.max(1.0, 2.0 - Math.abs(this.tension - 50) / 50);
  }

  /**
   * 게임 종료
   * @param {string} result - 게임 결과
   */
  endGame(result) {
    this.isGameOver = true;
    this.gameResult = result;
  }

  /**
   * 턴 결과 생성
   * @param {string} playerAction - 플레이어 액션
   * @param {string} fishState - 물고기 상태
   * @param {number} playerTensionChange - 플레이어 텐션 변화
   * @param {number} fishTensionChange - 물고기 텐션 변화
   * @param {number} totalTensionChange - 총 텐션 변화
   * @param {boolean} lineBreak - 라인 브레이크 여부
   * @param {number} damageDealt - 가한 데미지
   * @returns {Object} 턴 결과
   */
  getTurnResult(playerAction, fishState, playerTensionChange, fishTensionChange, totalTensionChange, lineBreak = false, damageDealt = 0) {
    return {
      turn: 20 - this.turns + 1,
      playerAction,
      fishState,
      playerTensionChange,
      fishTensionChange,
      totalTensionChange,
      tension: this.tension,
      fishHealth: this.fish.currentHealth,
      damageDealt,
      lineBreak,
      gameOver: this.isGameOver,
      gameResult: this.gameResult
    };
  }

  /**
   * 잡힌 물고기 데이터 생성
   * @returns {Object} 물고기 데이터
   */
  generateCaughtFish() {
    if (this.gameResult !== GAME_RESULT.SUCCESS) {
      return null;
    }

    // 변형 결정 (각각 10% 확률로 최대 3개)
    const variants = [];
    const variantKeys = Object.keys(FISH_VARIANTS);
    
    for (let i = 0; i < 3; i++) {
      if (Math.random() < 0.1) { // 10% 확률
        const randomVariant = variantKeys[Math.floor(Math.random() * variantKeys.length)];
        if (!variants.includes(randomVariant)) {
          variants.push(randomVariant);
        }
      }
    }

    // 최종 가치 계산
    let finalValue = this.fish.baseValue * (1 + this.fish.sizePercentage);
    variants.forEach(variant => {
      finalValue *= FISH_VARIANTS[variant].multiplier;
    });

    return {
      id: generateUniqueFishId(),
      type: this.fish.type,
      name: this.fish.name,
      rarity: this.fish.rarity,
      stars: this.fish.stars,
      sizePercentage: this.fish.sizePercentage,
      baseSize: this.fish.baseSize,
      actualSize: this.fish.actualSize,
      variants: variants,
      value: Math.floor(finalValue),
      caughtAt: Date.now(),
      caughtBy: this.userId
    };
  }

  /**
   * 게임 상태 정보 반환
   * @returns {Object} 게임 상태
   */
  getGameState() {
    return {
      userId: this.userId,
      fish: {
        name: this.fish.name,
        rarity: this.fish.rarity,
        stars: this.fish.stars,
        currentHealth: this.fish.currentHealth,
        maxHealth: this.fish.maxHealth,
        safetyRange: this.fish.safetyRange
      },
      tension: this.tension,
      turns: this.turns,
      isGameOver: this.isGameOver,
      gameResult: this.gameResult,
      rod: this.rod
    };
  }
}

module.exports = {
  FishingGame
};