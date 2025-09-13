// src/data/fishData.js
// 물고기 타입 및 데이터 정의

// 물고기 희귀도 정의
const FISH_RARITY = {
  COMMON: 'Common',
  UNCOMMON: 'Uncommon', 
  RARE: 'Rare',
  EPIC: 'Epic',
  LEGENDARY: 'Legendary'
};

// 물고기 상태 enum
const FISH_STATE = {
  STRONG_PULL: 'STRONG_PULL',
  SLACKENING_OFF: 'SLACKENING_OFF', 
  NIBBLING: 'NIBBLING',
  DRIFTING: 'DRIFTING',
  RECOVER: 'RECOVER'
};

// 플레이어 행동 enum
const PLAYER_ACTION = {
  SLOW_SLACK: 'SLOW_SLACK',
  HARD_SLACK: 'HARD_SLACK',
  SLOW_REEL: 'SLOW_REEL', 
  HARD_REEL: 'HARD_REEL',
  WAIT: 'WAIT'
};

// 게임 결과 enum
const GAME_RESULT = {
  SUCCESS: 'CAUGHT',
  LINE_BREAK: 'LINE_BREAK',
  FISH_ESCAPED_TURNS: 'FISH_ESCAPED_TURNS'
};

// 통일된 물고기 행동 확률
const DEFAULT_STATE_PROBABILITIES = {
  [FISH_STATE.STRONG_PULL]: 26,
  [FISH_STATE.SLACKENING_OFF]: 24,
  [FISH_STATE.NIBBLING]: 14,
  [FISH_STATE.DRIFTING]: 16,
  [FISH_STATE.RECOVER]: 20
};

// 물고기 타입 데이터 (30종) - 현실적인 크기와 밸런스된 체력
const FISH_TYPES = {
  goldfish: {
    name: 'Goldfish',
    rarity: FISH_RARITY.COMMON,
    baseHealth: 20,
    basePower: 5,
    baseSize: 10, // cm
    safetyRange: [10, 90],
    stateProbabilities: { ...DEFAULT_STATE_PROBABILITIES },
    baseValue: 5,
    recoverHealth: { min: 5, max: 10 }
  },
  crucianCarp: {
    name: 'Crucian Carp',
    rarity: FISH_RARITY.COMMON,
    baseHealth: 30,
    basePower: 7,
    baseSize: 25, // cm
    safetyRange: [15, 85],
    stateProbabilities: { ...DEFAULT_STATE_PROBABILITIES },
    baseValue: 12,
    recoverHealth: { min: 8, max: 12 }
  },
  pike: {
    name: 'Pike',
    rarity: FISH_RARITY.COMMON,
    baseHealth: 50,
    basePower: 8,
    baseSize: 60, // cm
    safetyRange: [15, 85],
    stateProbabilities: { ...DEFAULT_STATE_PROBABILITIES },
    baseValue: 10,
    recoverHealth: { min: 10, max: 15 }
  },
  salmon: {
    name: 'Salmon',
    rarity: FISH_RARITY.COMMON,
    baseHealth: 60,
    basePower: 9,
    baseSize: 80, // cm
    safetyRange: [18, 82],
    stateProbabilities: { ...DEFAULT_STATE_PROBABILITIES },
    baseValue: 14,
    recoverHealth: { min: 12, max: 18 }
  },
  trout: {
    name: 'Trout',
    rarity: FISH_RARITY.UNCOMMON,
    baseHealth: 40,
    basePower: 10,
    baseSize: 35, // cm
    safetyRange: [20, 80],
    stateProbabilities: { ...DEFAULT_STATE_PROBABILITIES },
    baseValue: 18,
    recoverHealth: { min: 8, max: 15 }
  },
  bass: {
    name: 'Bass',
    rarity: FISH_RARITY.UNCOMMON,
    baseHealth: 60,
    basePower: 12,
    baseSize: 45, // cm
    safetyRange: [20, 80],
    stateProbabilities: { ...DEFAULT_STATE_PROBABILITIES },
    baseValue: 22,
    recoverHealth: { min: 10, max: 15 }
  },
  piranha: {
    name: 'Piranha',
    rarity: FISH_RARITY.UNCOMMON,
    baseHealth: 40,
    basePower: 15,
    baseSize: 25, // cm
    safetyRange: [20, 80],
    stateProbabilities: { ...DEFAULT_STATE_PROBABILITIES },
    baseValue: 25,
    recoverHealth: { min: 8, max: 20 }
  },
  tuna: {
    name: 'Tuna',
    rarity: FISH_RARITY.UNCOMMON,
    baseHealth: 100,
    basePower: 14,
    baseSize: 200, // cm
    safetyRange: [22, 78],
    stateProbabilities: { ...DEFAULT_STATE_PROBABILITIES },
    baseValue: 28,
    recoverHealth: { min: 15, max: 25 }
  },
  redSeabream: {
    name: 'Red Seabream',
    rarity: FISH_RARITY.RARE,
    baseHealth: 80,
    basePower: 15,
    baseSize: 50, // cm
    safetyRange: [25, 75],
    stateProbabilities: { ...DEFAULT_STATE_PROBABILITIES },
    baseValue: 30,
    recoverHealth: { min: 12, max: 18 }
  },
  mandarinFish: {
    name: 'Mandarin Fish',
    rarity: FISH_RARITY.RARE,
    baseHealth: 100,
    basePower: 18,
    baseSize: 90, // cm
    safetyRange: [25, 75],
    stateProbabilities: { ...DEFAULT_STATE_PROBABILITIES },
    baseValue: 35,
    recoverHealth: { min: 15, max: 20 }
  },
  anglerfish: {
    name: 'Anglerfish',
    rarity: FISH_RARITY.RARE,
    baseHealth: 90,
    basePower: 18,
    baseSize: 80, // cm
    safetyRange: [25, 75],
    stateProbabilities: { ...DEFAULT_STATE_PROBABILITIES },
    baseValue: 40,
    recoverHealth: { min: 12, max: 18 }
  },
  swordfish: {
    name: 'Swordfish',
    rarity: FISH_RARITY.RARE,
    baseHealth: 150,
    basePower: 20,
    baseSize: 300, // cm
    safetyRange: [28, 72],
    stateProbabilities: { ...DEFAULT_STATE_PROBABILITIES },
    baseValue: 45,
    recoverHealth: { min: 18, max: 25 }
  },
  sevenbandGrouper: {
    name: 'Sevenband Grouper',
    rarity: FISH_RARITY.EPIC,
    baseHealth: 120,
    basePower: 22,
    baseSize: 100, // cm
    safetyRange: [30, 70],
    stateProbabilities: { ...DEFAULT_STATE_PROBABILITIES },
    baseValue: 50,
    recoverHealth: { min: 15, max: 20 }
  },
  oarfish: {
    name: 'Oarfish',
    rarity: FISH_RARITY.EPIC,
    baseHealth: 150,
    basePower: 25,
    baseSize: 600, // cm (6m)
    safetyRange: [30, 70],
    stateProbabilities: { ...DEFAULT_STATE_PROBABILITIES },
    baseValue: 60,
    recoverHealth: { min: 20, max: 30 }
  },
  giantSquid: {
    name: 'Giant Squid',
    rarity: FISH_RARITY.EPIC,
    baseHealth: 180,
    basePower: 28,
    baseSize: 800, // cm (8m)
    safetyRange: [30, 70],
    stateProbabilities: { ...DEFAULT_STATE_PROBABILITIES },
    baseValue: 70,
    recoverHealth: { min: 25, max: 35 }
  },
  shark: {
    name: 'Shark',
    rarity: FISH_RARITY.EPIC,
    baseHealth: 160,
    basePower: 26,
    baseSize: 350, // cm
    safetyRange: [32, 68],
    stateProbabilities: { ...DEFAULT_STATE_PROBABILITIES },
    baseValue: 65,
    recoverHealth: { min: 20, max: 30 }
  },
  marlin: {
    name: 'Marlin',
    rarity: FISH_RARITY.EPIC,
    baseHealth: 200,
    basePower: 24,
    baseSize: 400, // cm
    safetyRange: [30, 70],
    stateProbabilities: { ...DEFAULT_STATE_PROBABILITIES },
    baseValue: 58,
    recoverHealth: { min: 25, max: 35 }
  },
  coelacanth: {
    name: 'Coelacanth',
    rarity: FISH_RARITY.LEGENDARY,
    baseHealth: 200,
    basePower: 30,
    baseSize: 150, // cm
    safetyRange: [35, 65],
    stateProbabilities: { ...DEFAULT_STATE_PROBABILITIES },
    baseValue: 100,
    recoverHealth: { min: 15, max: 25 }
  },
  megalodon: {
    name: 'Megalodon',
    rarity: FISH_RARITY.LEGENDARY,
    baseHealth: 300,
    basePower: 40,
    baseSize: 1500, // cm (15m)
    safetyRange: [35, 65],
    stateProbabilities: { ...DEFAULT_STATE_PROBABILITIES },
    baseValue: 150,
    recoverHealth: { min: 30, max: 50 }
  },
  leviathan: {
    name: 'Leviathan',
    rarity: FISH_RARITY.LEGENDARY,
    baseHealth: 250,
    basePower: 50,
    baseSize: 3000, // cm (30m - 전설의 바다괴물)
    safetyRange: [40, 60],
    stateProbabilities: { ...DEFAULT_STATE_PROBABILITIES },
    baseValue: 200,
    recoverHealth: { min: 20, max: 40 }
  }
};

// 변형 데이터 (25개)
const FISH_VARIANTS = {
  golden: { name: 'Golden', multiplier: 1.5 },
  glowing: { name: 'Glowing', multiplier: 1.3 },
  zombie: { name: 'Zombie', multiplier: 0.8 },
  rainbow: { name: 'Rainbow', multiplier: 2.0 },
  ancient: { name: 'Ancient', multiplier: 1.8 },
  giant: { name: 'Giant', multiplier: 1.6 },
  tiny: { name: 'Tiny', multiplier: 0.7 },
  scarred: { name: 'Scarred', multiplier: 0.9 },
  shiny: { name: 'Shiny', multiplier: 1.4 },
  shadow: { name: 'Shadow', multiplier: 1.7 },
  frozen: { name: 'Frozen', multiplier: 1.2 },
  blazing: { name: 'Blazing', multiplier: 1.2 },
  electric: { name: 'Electric', multiplier: 1.2 },
  poisonous: { name: 'Poisonous', multiplier: 0.9 },
  mutated: { name: 'Mutated', multiplier: 1.1 },
  mystic: { name: 'Mystic', multiplier: 1.9 },
  steel: { name: 'Steel', multiplier: 1.3 },
  ghostly: { name: 'Ghostly', multiplier: 1.5 },
  volcanic: { name: 'Volcanic', multiplier: 1.4 },
  crystal: { name: 'Crystal', multiplier: 1.6 },
  abyssal: { name: 'Abyssal', multiplier: 1.7 },
  elder: { name: 'Elder', multiplier: 1.9 },
  spectral: { name: 'Spectral', multiplier: 1.5 },
  cursed: { name: 'Cursed', multiplier: 0.85 },
  blessed: { name: 'Blessed', multiplier: 1.8 }
};

// 기본 낚시대 스탯
const DEFAULT_ROD = {
  damage: 20,
  strength: 1.0,
  luck: 0,
  variantLuck: 0,
  specialLuck: 0
};

module.exports = {
  FISH_RARITY,
  FISH_STATE,
  PLAYER_ACTION, 
  GAME_RESULT,
  FISH_TYPES,
  FISH_VARIANTS,
  DEFAULT_ROD,
  DEFAULT_STATE_PROBABILITIES
};