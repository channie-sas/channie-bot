// src/utils/cardApprovalPersistence.js
const fs = require('fs');
const path = require('path');
const { config } = require('../../config');

// 승인 요청 데이터 파일 경로
const APPROVAL_REQUESTS_FILE = path.join(config.paths.DATA_DIR, 'cardApprovalRequests.json');

/**
 * 승인 요청 데이터를 파일에 저장
 */
function saveApprovalRequests() {
  try {
    if (!global.cardApprovalRequests) {
      global.cardApprovalRequests = new Map();
    }
    
    // Map을 객체로 변환
    const dataToSave = {};
    for (const [key, value] of global.cardApprovalRequests.entries()) {
      dataToSave[key] = value;
    }
    
    fs.writeFileSync(APPROVAL_REQUESTS_FILE, JSON.stringify(dataToSave, null, 2), 'utf8');
    console.log(`[APPROVAL] Saved ${Object.keys(dataToSave).length} approval requests`);
  } catch (error) {
    console.error('[APPROVAL] Error saving approval requests:', error);
  }
}

/**
 * 승인 요청 데이터를 파일에서 로드
 */
function loadApprovalRequests() {
  try {
    if (!global.cardApprovalRequests) {
      global.cardApprovalRequests = new Map();
    }
    
    if (fs.existsSync(APPROVAL_REQUESTS_FILE)) {
      const data = fs.readFileSync(APPROVAL_REQUESTS_FILE, 'utf8');
      const parsedData = JSON.parse(data);
      
      // 객체를 Map으로 변환
      for (const [key, value] of Object.entries(parsedData)) {
        global.cardApprovalRequests.set(key, value);
      }
      
      console.log(`[APPROVAL] Loaded ${global.cardApprovalRequests.size} approval requests`);
      
      // 만료된 요청 정리 (24시간 이상 된 요청)
      cleanupExpiredRequests();
    } else {
      console.log('[APPROVAL] No existing approval requests file found');
    }
  } catch (error) {
    console.error('[APPROVAL] Error loading approval requests:', error);
    global.cardApprovalRequests = new Map();
  }
}

/**
 * 만료된 승인 요청 정리
 */
function cleanupExpiredRequests() {
  if (!global.cardApprovalRequests) return;
  
  const now = Date.now();
  const EXPIRY_TIME = 7 * 24 * 60 * 60 * 1000; // 7일 (1주일)
  let removedCount = 0;
  
  for (const [key, value] of global.cardApprovalRequests.entries()) {
    // timestamp가 1주일 이상 된 요청 제거
    if (value.timestamp && (now - value.timestamp) > EXPIRY_TIME) {
      global.cardApprovalRequests.delete(key);
      removedCount++;
    }
  }
  
  if (removedCount > 0) {
    console.log(`[APPROVAL] Cleaned up ${removedCount} expired approval requests (older than 7 days)`);
    saveApprovalRequests(); // 정리 후 저장
  }
}

/**
 * 승인 요청 추가
 * @param {string} approvalId - 승인 ID
 * @param {Object} approvalData - 승인 데이터
 */
function addApprovalRequest(approvalId, approvalData) {
  if (!global.cardApprovalRequests) {
    global.cardApprovalRequests = new Map();
  }
  
  // 타임스탬프 추가 (없는 경우)
  if (!approvalData.timestamp) {
    approvalData.timestamp = Date.now();
  }
  
  global.cardApprovalRequests.set(approvalId, approvalData);
  saveApprovalRequests();
  console.log(`[APPROVAL] Added approval request: ${approvalId}`);
}

/**
 * 승인 요청 제거
 * @param {string} approvalId - 승인 ID
 */
function removeApprovalRequest(approvalId) {
  if (!global.cardApprovalRequests) return false;
  
  const removed = global.cardApprovalRequests.delete(approvalId);
  if (removed) {
    saveApprovalRequests();
    console.log(`[APPROVAL] Removed approval request: ${approvalId}`);
  }
  return removed;
}

/**
 * 승인 요청 가져오기
 * @param {string} approvalId - 승인 ID
 * @returns {Object|null} 승인 데이터
 */
function getApprovalRequest(approvalId) {
  if (!global.cardApprovalRequests) return null;
  return global.cardApprovalRequests.get(approvalId) || null;
}

/**
 * 모든 승인 요청 목록 가져오기
 * @returns {Array} 승인 요청 배열
 */
function getAllApprovalRequests() {
  if (!global.cardApprovalRequests) return [];
  return Array.from(global.cardApprovalRequests.entries()).map(([id, data]) => ({
    id,
    ...data
  }));
}

/**
 * 승인 요청 파일 삭제 (초기화용)
 */
function clearAllApprovalRequests() {
  try {
    if (global.cardApprovalRequests) {
      global.cardApprovalRequests.clear();
    }
    
    if (fs.existsSync(APPROVAL_REQUESTS_FILE)) {
      fs.unlinkSync(APPROVAL_REQUESTS_FILE);
      console.log('[APPROVAL] Cleared all approval requests');
    }
  } catch (error) {
    console.error('[APPROVAL] Error clearing approval requests:', error);
  }
}

/**
 * 정기적인 정리 작업 시작 (매일 한 번씩 만료된 요청 정리)
 */
function startCleanupSchedule() {
  setInterval(() => {
    cleanupExpiredRequests();
  }, 24 * 60 * 60 * 1000); // 24시간마다 (하루에 한 번)
  
  console.log('[APPROVAL] Started cleanup schedule (daily cleanup for requests older than 7 days)');
}

module.exports = {
  saveApprovalRequests,
  loadApprovalRequests,
  cleanupExpiredRequests,
  addApprovalRequest,
  removeApprovalRequest,
  getApprovalRequest,
  getAllApprovalRequests,
  clearAllApprovalRequests,
  startCleanupSchedule
};