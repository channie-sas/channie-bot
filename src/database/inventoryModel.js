// src/database/inventoryModel.js
const { initUserData, saveUserDataThrottled } = require('./userData');
const { ITEM_TYPES, ITEM_DISPLAY_NAMES } = require('./itemTypes');

/**
 * 유저 아이템 확인
 * @param {string} userId - 사용자 ID
 * @param {string} itemType - 아이템 타입
 * @returns {number} 아이템 수량
 */
function getUserItem(userId, itemType) {
  const user = initUserData(userId);
  return user.inventory[itemType] || 0;
}

/**
 * 유저 아이템 설정
 * @param {string} userId - 사용자 ID
 * @param {string} itemType - 아이템 타입
 * @param {number} amount - 설정할 수량
 * @returns {number} 설정된 수량
 */
function setUserItem(userId, itemType, amount) {
  if (!Object.values(ITEM_TYPES).includes(itemType)) {
    throw new Error(`Invalid item type: ${itemType}`);
  }
  
  const user = initUserData(userId);
  user.inventory[itemType] = Math.max(0, Math.floor(amount)); // 음수와 소수점 방지
  saveUserDataThrottled();
  return user.inventory[itemType];
}

/**
 * 유저에게 아이템 추가
 * @param {string} userId - 사용자 ID
 * @param {string} itemType - 아이템 타입
 * @param {number} amount - 추가할 수량
 * @returns {number} 추가 후 수량
 */
function addUserItem(userId, itemType, amount) {
  const currentAmount = getUserItem(userId, itemType);
  return setUserItem(userId, itemType, currentAmount + amount);
}

/**
 * 유저에게서 아이템 제거
 * @param {string} userId - 사용자 ID
 * @param {string} itemType - 아이템 타입
 * @param {number} amount - 제거할 수량
 * @returns {number} 제거 후 수량
 */
function removeUserItem(userId, itemType, amount) {
  const currentAmount = getUserItem(userId, itemType);
  return setUserItem(userId, itemType, currentAmount - amount);
}

/**
 * 유저 간 아이템 전송
 * @param {string} fromUserId - 보내는 사용자 ID
 * @param {string} toUserId - 받는 사용자 ID
 * @param {string} itemType - 아이템 타입
 * @param {number} amount - 전송 수량
 * @returns {Object} 전송 결과
 */
function transferUserItem(fromUserId, toUserId, itemType, amount) {
  amount = Math.abs(parseInt(amount)); // 양수로 변환
  
  if (isNaN(amount) || amount <= 0) {
    return { success: false, message: "Please enter a valid positive amount." };
  }
  
  if (!Object.values(ITEM_TYPES).includes(itemType)) {
    return { success: false, message: `Invalid item type: ${itemType}` };
  }
  
  const fromUserItemAmount = getUserItem(fromUserId, itemType);
  
  // 송금자가 충분한 아이템을 가지고 있는지 확인
  if (fromUserItemAmount < amount) {
    return { 
      success: false, 
      message: `You don't have enough ${ITEM_DISPLAY_NAMES[itemType]} for this transfer.`,
      currentAmount: fromUserItemAmount 
    };
  }
  
  // 아이템 차감 및 추가
  removeUserItem(fromUserId, itemType, amount);
  addUserItem(toUserId, itemType, amount);
  
  return { 
    success: true, 
    message: `Successfully transferred ${amount} ${ITEM_DISPLAY_NAMES[itemType]}.`,
    fromUserAmount: getUserItem(fromUserId, itemType),
    toUserAmount: getUserItem(toUserId, itemType)
  };
}

/**
 * 전체 인벤토리 가져오기
 * @param {string} userId - 사용자 ID
 * @returns {Object} 사용자 인벤토리 객체
 */
function getUserInventory(userId) {
  const user = initUserData(userId);
  return user.inventory || {};
}

module.exports = {
  getUserItem,
  setUserItem,
  addUserItem,
  removeUserItem,
  transferUserItem,
  getUserInventory
};