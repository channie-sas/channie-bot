// src/utils/CardidGenerator.js

// 마지막 생성된 카드 ID 번호를 추적하는 변수
let lastCardIdNumber = 0;

/**
 * 마지막 카드 ID 번호 설정
 * @param {number} idNumber - 새로운 마지막 ID 번호
 */
function setLastCardIdNumber(idNumber) {
  if (typeof idNumber === 'number' && idNumber >= 0) {
    lastCardIdNumber = idNumber;
    console.log(`Last card ID number set to: ${lastCardIdNumber}`);
  }
}

/**
 * 현재 마지막 카드 ID 번호 반환
 * @returns {number} 마지막 카드 ID 번호
 */
function getLastCardIdNumber() {
  return lastCardIdNumber;
}

/**
 * 카드 고유 ID 생성 함수
 * @returns {string} 생성된 고유 ID
 */
function generateUniqueCardId() {
  // ID 번호 증가
  lastCardIdNumber++;
  
  // 36진법으로 변환하고 6자리로 맞춤
  return lastCardIdNumber.toString(36).padStart(6, '0').toUpperCase();
}

module.exports = {
  generateUniqueCardId,
  getLastCardIdNumber,
  setLastCardIdNumber
};