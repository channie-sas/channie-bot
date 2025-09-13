// src/database/itemTypes.js
// 지원하는 아이템 타입 정의
const ITEM_TYPES = {
  CREDIT: 'credit',
  CARD_FRAGMENT: 'card_fragment',
  BASIC_PACK: 'basic_pack',
  WOOD: 'wood',
  IRON_ORE: 'iron_ore',
  GOLD_ORE: 'gold_ore',
  COPPER_ORE: 'copper_ore',
  STONE: 'stone',
  STAR_FRAGMENT: 'star_fragment',
  MUSHROOM: 'mushroom',
  HERB: 'herb',
  BERRY: 'berry',
  FLOWER: 'flower',
  // 낚시 관련 아이템 추가
  GRASSHOPPER: 'grasshopper',
  WORM: 'worm',
  STURDY_ROD: 'sturdy_rod',
  LUCKY_ROD: 'lucky_rod'
};

// 아이템 이름과 표시 이름 매핑
const ITEM_DISPLAY_NAMES = {
  [ITEM_TYPES.CREDIT]: 'Credits',
  [ITEM_TYPES.CARD_FRAGMENT]: 'Card Fragments',
  [ITEM_TYPES.BASIC_PACK]: 'Basic Card Pack',
  [ITEM_TYPES.WOOD]: 'Wood',
  [ITEM_TYPES.IRON_ORE]: 'Iron Ore',
  [ITEM_TYPES.GOLD_ORE]: 'Gold Ore',
  [ITEM_TYPES.COPPER_ORE]: 'Copper Ore',
  [ITEM_TYPES.STONE]: 'Stone',
  [ITEM_TYPES.STAR_FRAGMENT]: 'Star Fragment',
  [ITEM_TYPES.MUSHROOM]: 'Mushroom',
  [ITEM_TYPES.HERB]: 'Herb',
  [ITEM_TYPES.BERRY]: 'Berry',
  [ITEM_TYPES.FLOWER]: 'Flower',
  // 낚시 관련 아이템 추가
  [ITEM_TYPES.GRASSHOPPER]: 'Grasshopper',
  [ITEM_TYPES.WORM]: 'Worm',
  [ITEM_TYPES.STURDY_ROD]: 'Sturdy Rod',
  [ITEM_TYPES.LUCKY_ROD]: 'Lucky Rod'
};

// 아이템 카테고리 정의
const ITEM_CATEGORIES = {
  BAIT: 'bait',
  ROD: 'rod',
  RESOURCE: 'resource',
  PACK: 'pack',
  CURRENCY: 'currency'
};

// 아이템 상세 정보
const ITEM_DETAILS = {
  [ITEM_TYPES.GRASSHOPPER]: {
    category: ITEM_CATEGORIES.BAIT,
    basePrice: 5,
    shopQuantity: { min: 15, max: 50 },
    baseLuck: 5,
    variantLuck: 0,
    specialLuck: 5
  },
  [ITEM_TYPES.WORM]: {
    category: ITEM_CATEGORIES.BAIT,
    basePrice: 10,
    shopQuantity: { min: 10, max: 30 },
    baseLuck: 5,
    variantLuck: 10,
    specialLuck: 0
  },
  [ITEM_TYPES.STURDY_ROD]: {
    category: ITEM_CATEGORIES.ROD,
    basePrice: 1000,
    shopQuantity: { min: 1, max: 1 },
    baseLuck: 0,
    damage: 30,
    strength: 2,
    durability: 100
  },
  [ITEM_TYPES.LUCKY_ROD]: {
    category: ITEM_CATEGORIES.ROD,
    basePrice: 1000,
    shopQuantity: { min: 1, max: 1 },
    baseLuck: 5,
    damage: 20,
    strength: 1.2,
    durability: 100
  }
};

module.exports = {
  ITEM_TYPES,
  ITEM_DISPLAY_NAMES,
  ITEM_CATEGORIES,
  ITEM_DETAILS
};