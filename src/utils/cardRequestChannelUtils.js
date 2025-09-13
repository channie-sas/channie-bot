// src/utils/cardRequestChannelUtils.js
const fs = require('fs');
const path = require('path');
const { config } = require('../../config');

// 카드 요청 채널 목록
let cardRequestChannels = [];

/**
 * 카드 요청 채널 설정 로드
 */
function loadCardRequestChannels() {
  try {
    const filePath = path.join(config.paths.DATA_DIR, 'cardRequestChannels.json');
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      cardRequestChannels = JSON.parse(data);
      console.log(`Loaded ${cardRequestChannels.length} card request channels`);
    } else {
      cardRequestChannels = [];
      console.log('No card request channels configuration found, using default empty list');
    }
  } catch (error) {
    console.error('Error loading card request channels:', error);
    cardRequestChannels = [];
  }
}

/**
 * 카드 요청 채널 설정 저장
 */
function saveCardRequestChannels() {
  try {
    const filePath = path.join(config.paths.DATA_DIR, 'cardRequestChannels.json');
    fs.writeFileSync(filePath, JSON.stringify(cardRequestChannels, null, 2), 'utf8');
    console.log(`Saved ${cardRequestChannels.length} card request channels`);
  } catch (error) {
    console.error('Error saving card request channels:', error);
  }
}

/**
 * 카드 요청 채널 목록 가져오기
 * @returns {Array} 카드 요청 채널 ID 배열
 */
function getCardRequestChannels() {
  return [...cardRequestChannels]; // 복사본 반환
}

/**
 * 카드 요청 채널 토글 (추가/제거)
 * @param {string} channelId - 채널 ID
 * @returns {boolean} 채널이 활성화되었는지 여부
 */
function toggleCardRequestChannel(channelId) {
  const index = cardRequestChannels.indexOf(channelId);
  
  if (index === -1) {
    // 채널이 목록에 없으면 추가
    cardRequestChannels.push(channelId);
    console.log(`Added card request channel: ${channelId}`);
    saveCardRequestChannels();
    return true;
  } else {
    // 채널이 목록에 있으면 제거
    cardRequestChannels.splice(index, 1);
    console.log(`Removed card request channel: ${channelId}`);
    saveCardRequestChannels();
    return false;
  }
}

/**
 * 특정 채널이 카드 요청 채널인지 확인
 * @param {string} channelId - 채널 ID
 * @returns {boolean} 카드 요청 채널인지 여부
 */
function isCardRequestChannel(channelId) {
  return cardRequestChannels.includes(channelId);
}

/**
 * 카드 요청 채널 추가
 * @param {string} channelId - 채널 ID
 * @returns {boolean} 성공적으로 추가되었는지 여부
 */
function addCardRequestChannel(channelId) {
  if (!cardRequestChannels.includes(channelId)) {
    cardRequestChannels.push(channelId);
    console.log(`Added card request channel: ${channelId}`);
    saveCardRequestChannels();
    return true;
  }
  return false; // 이미 존재함
}

/**
 * 카드 요청 채널 제거
 * @param {string} channelId - 채널 ID
 * @returns {boolean} 성공적으로 제거되었는지 여부
 */
function removeCardRequestChannel(channelId) {
  const index = cardRequestChannels.indexOf(channelId);
  if (index !== -1) {
    cardRequestChannels.splice(index, 1);
    console.log(`Removed card request channel: ${channelId}`);
    saveCardRequestChannels();
    return true;
  }
  return false; // 존재하지 않음
}

/**
 * 모든 카드 요청 채널 초기화
 */
function clearAllCardRequestChannels() {
  cardRequestChannels = [];
  console.log('Cleared all card request channels');
  saveCardRequestChannels();
}

/**
 * 카드 요청 채널 설정 정보 가져오기
 * @returns {Object} 설정 정보
 */
function getCardRequestChannelInfo() {
  return {
    totalChannels: cardRequestChannels.length,
    channels: [...cardRequestChannels], // 복사본 반환
    isEmpty: cardRequestChannels.length === 0
  };
}

// 초기 로드
loadCardRequestChannels();

module.exports = {
  loadCardRequestChannels,
  saveCardRequestChannels,
  getCardRequestChannels,
  toggleCardRequestChannel,
  isCardRequestChannel,
  addCardRequestChannel,
  removeCardRequestChannel,
  clearAllCardRequestChannels,
  getCardRequestChannelInfo
};