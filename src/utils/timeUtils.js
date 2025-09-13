// src/utils/timeUtils.js
// 사용자별 활성 쿨다운 타이머를 저장하는 맵
const activeTimers = {
    grab: new Map(),
    drop: new Map()
  };


  /**
     * 사용자의 쿨다운 타이머 설정 (기존 타이머가 있으면 취소 후 새로 설정)
     * @param {string} type - 타이머 유형 ('grab' 또는 'drop')
     * @param {string} userId - 사용자 ID
     * @param {function} callback - 쿨다운 완료 시 실행할 콜백
     * @param {number} delay - 타이머 지연 시간 (밀리초)
     */
    function setCooldownTimer(type, userId, callback, delay) {
        // 기존 타이머가 있으면 취소
        if (activeTimers[type].has(userId)) {
        clearTimeout(activeTimers[type].get(userId));
        console.log(`Cancelled existing ${type} timer for user ${userId}`);
        }
        
        // 새 타이머 설정
        const timerId = setTimeout(() => {
        // 콜백 실행
        callback();
        
        // 타이머 맵에서 제거
        activeTimers[type].delete(userId);
        console.log(`${type} timer completed and removed for user ${userId}`);
        }, delay);
        
        // 타이머 ID 저장
        activeTimers[type].set(userId, timerId);
        console.log(`Set new ${type} timer for user ${userId}, will trigger in ${Math.floor(delay/1000)}s`);
    }
    
    /**
     * 모든 활성 타이머 취소 (서버 재시작 등에 사용)
     */
    function clearAllTimers() {
        for (const type of ['grab', 'drop']) {
        activeTimers[type].forEach((timerId, userId) => {
            clearTimeout(timerId);
            console.log(`Cleared ${type} timer for user ${userId}`);
        });
        activeTimers[type].clear();
        }
        console.log('All cooldown timers cleared');
    }

/**
 * 밀리초를 읽기 쉬운 시간 형식으로 변환
 * @param {number} milliseconds - 변환할 밀리초
 * @returns {string} 형식화된 시간 (예: "2m 30s" 또는 "45s")
 */
function formatTimeRemaining(milliseconds) {
    if (milliseconds <= 0) return "0s";
    
    const totalSeconds = Math.ceil(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    
    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  }
  
  module.exports = {
    formatTimeRemaining,
    setCooldownTimer,
    clearAllTimers
  };