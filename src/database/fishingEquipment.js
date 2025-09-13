// src/database/fishingEquipment.js
const { initUserData, saveUserDataThrottled } = require('./userData');

/**
 * 사용자의 낚시 장비 가져오기
 * @param {string} userId - 사용자 ID
 * @returns {Object} 장착된 장비 정보
 */
function getUserFishingEquipment(userId) {
  const userData = initUserData(userId);
  
  if (!userData.fishingEquipment) {
    userData.fishingEquipment = {
      rod: null,
      bait: null,
      rodDurability: null
    };
  }
  
  return userData.fishingEquipment;
}

/**
 * 낚싯대 장착
 * @param {string} userId - 사용자 ID
 * @param {string} rodType - 낚싯대 타입
 * @returns {Object} 결과
 */
function equipRod(userId, rodType) {
  const userData = initUserData(userId);
  const equipment = getUserFishingEquipment(userId);
  const { ITEM_DETAILS } = require('./itemTypes');
  
  // 낚싯대 정보 확인
  const rodDetails = ITEM_DETAILS[rodType];
  if (!rodDetails || rodDetails.category !== 'rod') {
    return { success: false, message: 'Invalid rod type' };
  }
  
  // 인벤토리에서 낚싯대 확인
  const { getUserItem, removeUserItem } = require('./inventoryModel');
  const rodCount = getUserItem(userId, rodType);
  
  if (rodCount <= 0) {
    return { success: false, message: 'You don\'t have this rod in your inventory' };
  }
  
  // 이전 낚싯대가 있으면 인벤토리로 반환
  if (equipment.rod) {
    const { addUserItem } = require('./inventoryModel');
    addUserItem(userId, equipment.rod, 1);
  }
  
  // 새 낚싯대 장착
  removeUserItem(userId, rodType, 1);
  equipment.rod = rodType;
  equipment.rodDurability = rodDetails.durability;
  
  saveUserDataThrottled();
  
  return { success: true, message: `Equipped ${rodType}` };
}

/**
 * 미끼 장착
 * @param {string} userId - 사용자 ID
 * @param {string} baitType - 미끼 타입
 * @returns {Object} 결과
 */
function equipBait(userId, baitType) {
  const userData = initUserData(userId);
  const equipment = getUserFishingEquipment(userId);
  const { ITEM_DETAILS } = require('./itemTypes');
  
  // 미끼 정보 확인
  const baitDetails = ITEM_DETAILS[baitType];
  if (!baitDetails || baitDetails.category !== 'bait') {
    return { success: false, message: 'Invalid bait type' };
  }
  
  // 인벤토리에서 미끼 확인
  const { getUserItem } = require('./inventoryModel');
  const baitCount = getUserItem(userId, baitType);
  
  if (baitCount <= 0) {
    return { success: false, message: 'You don\'t have this bait in your inventory' };
  }
  
  // 미끼 장착
  equipment.bait = baitType;
  
  saveUserDataThrottled();
  
  return { success: true, message: `Equipped ${baitType}` };
}

/**
 * 낚시 후 장비 업데이트 (내구도 감소, 미끼 소모)
 * @param {string} userId - 사용자 ID
 * @returns {Object} 결과
 */
function updateFishingEquipment(userId) {
  const equipment = getUserFishingEquipment(userId);
  const { removeUserItem } = require('./inventoryModel');
  
  let messages = [];
  
  // 미끼 소모
  if (equipment.bait) {
    const baitRemoved = removeUserItem(userId, equipment.bait, 1);
    if (!baitRemoved) {
      equipment.bait = null;
      messages.push('You ran out of bait');
    }
  }
  
  // 낚싯대 내구도 감소
  if (equipment.rod && equipment.rodDurability > 0) {
    equipment.rodDurability--;
    
    if (equipment.rodDurability <= 0) {
      messages.push(`Your ${equipment.rod} broke!`);
      equipment.rod = null;
      equipment.rodDurability = null;
    }
  }
  
  saveUserDataThrottled();
  
  return { messages };
}

/**
 * 현재 장착된 장비의 종합 스탯 가져오기
 * @param {string} userId - 사용자 ID
 * @returns {Object} 종합 스탯
 */
function getEquipmentStats(userId) {
  const equipment = getUserFishingEquipment(userId);
  const { ITEM_DETAILS } = require('./itemTypes');
  const { DEFAULT_ROD } = require('../database/fishData'); // 올바른 경로로 수정
  
  let stats = {
    damage: DEFAULT_ROD.damage,
    strength: DEFAULT_ROD.strength,
    luck: DEFAULT_ROD.luck || 0,
    variantLuck: 0,
    specialLuck: 0
  };
  
  // 낚싯대 스탯 적용
  if (equipment.rod) {
    const rodDetails = ITEM_DETAILS[equipment.rod];
    if (rodDetails) {
      stats.damage = rodDetails.damage;
      stats.strength = rodDetails.strength;
      stats.baseLuck = rodDetails.baseLuck || 0;
    }
  }
  
  // 미끼 스탯 적용
  if (equipment.bait) {
    const baitDetails = ITEM_DETAILS[equipment.bait];
    if (baitDetails) {
      stats.baseLuck += baitDetails.baseLuck || 0;
      stats.variantLuck += baitDetails.variantLuck || 0;
      stats.specialLuck += baitDetails.specialLuck || 0;
    }
  }
  
  return stats;
}

module.exports = {
  getUserFishingEquipment,
  equipRod,
  equipBait,
  updateFishingEquipment,
  getEquipmentStats
};