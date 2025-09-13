// src/utils/fishIdGenerator.js
// 물고기 고유 ID 생성 시스템

// 마지막 생성된 물고기 ID 번호를 추적하는 변수
let lastFishIdNumber = 0;

/**
 * 마지막 물고기 ID 번호 설정
 * @param {number} idNumber - 새로운 마지막 ID 번호
 */
function setLastFishIdNumber(idNumber) {
  if (typeof idNumber === 'number' && idNumber >= 0) {
    lastFishIdNumber = idNumber;
    console.log(`Last fish ID number set to: ${lastFishIdNumber}`);
  }
}

/**
 * 현재 마지막 물고기 ID 번호 반환
 * @returns {number} 마지막 물고기 ID 번호
 */
function getLastFishIdNumber() {
  return lastFishIdNumber;
}

/**
 * 물고기 고유 ID 생성 함수
 * @returns {string} 생성된 고유 ID (F 접두사 포함)
 */
function generateUniqueFishId() {
  // ID 번호 증가
  lastFishIdNumber++;
  
  // 36진법으로 변환하고 6자리로 맞춤, F 접두사 추가
  return 'F' + lastFishIdNumber.toString(36).padStart(6, '0').toUpperCase();
}

/**
 * 기존 물고기 ID에서 번호 추출
 * @param {string} fishId - 물고기 ID
 * @returns {number} 추출된 번호 또는 0
 */
function extractFishIdNumber(fishId) {
  if (typeof fishId !== 'string' || !fishId.startsWith('F')) {
    return 0;
  }
  
  try {
    const numberPart = fishId.substring(1);
    return parseInt(numberPart, 36);
  } catch (error) {
    console.error('Error extracting fish ID number:', error);
    return 0;
  }
}

/**
 * 모든 물고기 ID에서 최대 번호 찾기
 * @param {Array} fishList - 물고기 배열
 * @returns {number} 최대 ID 번호
 */
function findMaxFishIdNumber(fishList) {
  let maxNumber = 0;
  
  if (Array.isArray(fishList)) {
    for (const fish of fishList) {
      if (fish && fish.id) {
        const number = extractFishIdNumber(fish.id);
        if (number > maxNumber) {
          maxNumber = number;
        }
      }
    }
  }
  
  return maxNumber;
}

/**
 * 사용자 데이터에서 물고기 ID 초기화
 * @param {Object} userData - 모든 사용자 데이터
 */
function initializeFishIdFromUserData(userData) {
  let maxNumber = 0;
  
  if (userData && typeof userData.forEach === 'function') {
    userData.forEach((user) => {
      if (user && user.fish && Array.isArray(user.fish)) {
        const userMaxNumber = findMaxFishIdNumber(user.fish);
        if (userMaxNumber > maxNumber) {
          maxNumber = userMaxNumber;
        }
      }
    });
  }
  
  setLastFishIdNumber(maxNumber);
  console.log(`Fish ID system initialized with max ID number: ${maxNumber}`);
}

module.exports = {
  generateUniqueFishId,
  getLastFishIdNumber,
  setLastFishIdNumber,
  extractFishIdNumber,
  findMaxFishIdNumber,
  initializeFishIdFromUserData
};