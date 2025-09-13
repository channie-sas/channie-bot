// src/utils/gameLockManager.js - 메모리 누수 수정 버전
class GameLockManager {
    constructor() {
        this.locks = new Map();
        this.timeouts = new Map();
        this.cleanupInterval = null;
        this.isInitialized = false;
        
        // 한 번만 초기화
        this.init();
    }
    
    init() {
        if (this.isInitialized) return;
        
        this.isInitialized = true;
        
        // 주기적 정리 작업 시작 (10분마다)
        this.cleanupInterval = setInterval(() => {
            this.cleanup();
        }, 10 * 60 * 1000);
        
        // 프로세스 종료시 정리 등록
        process.on('beforeExit', () => this.destroy());
        process.on('SIGINT', () => this.destroy());
        process.on('SIGTERM', () => this.destroy());
    }
    
    acquireLock(channelId, type, timeoutMs = 30000) {
        const key = `${channelId}_${type}`;
        
        if (this.locks.has(key)) {
            return false; // 로그 제거 - 스팸 방지
        }
        
        this.locks.set(key, {
            timestamp: Date.now(),
            channelId,
            type
        });
        
        // 자동 해제 타이머 (최소 5초)
        const safeTimeout = Math.max(timeoutMs, 5000);
        const timeoutId = setTimeout(() => {
            this.releaseLock(channelId, type);
            // 5분마다만 로그 출력
            if (Date.now() % (5 * 60 * 1000) < 10000) {
                console.warn(`[GAMELOCK] Auto-released lock ${key} after timeout`);
            }
        }, safeTimeout);
        
        this.timeouts.set(key, timeoutId);
        return true;
    }
    
    releaseLock(channelId, type) {
        const key = `${channelId}_${type}`;
        
        const lockInfo = this.locks.get(key);
        if (lockInfo) {
            this.locks.delete(key);
        }
        
        const timeoutId = this.timeouts.get(key);
        if (timeoutId) {
            clearTimeout(timeoutId);
            this.timeouts.delete(key);
        }
        
        return !!lockInfo;
    }
    
    isLocked(channelId, type) {
        const key = `${channelId}_${type}`;
        
        if (!this.locks.has(key)) {
            return false;
        }
        
        // 만료된 락 자동 제거 (1시간 초과)
        const lockInfo = this.locks.get(key);
        if (Date.now() - lockInfo.timestamp > 60 * 60 * 1000) {
            this.releaseLock(channelId, type);
            return false;
        }
        
        return true;
    }
    
    releaseAllLocks(channelId) {
        const releasedLocks = [];
        
        // 채널의 모든 락 찾기 및 해제
        for (const [key, lockInfo] of [...this.locks.entries()]) {
            if (lockInfo.channelId === channelId) {
                const { type } = lockInfo;
                this.releaseLock(channelId, type);
                releasedLocks.push(type);
            }
        }
        
        // 5분마다만 로그 출력
        if (releasedLocks.length > 0 && Date.now() % (5 * 60 * 1000) < 10000) {
            console.log(`[GAMELOCK] Released ${releasedLocks.length} locks for channel ${channelId}`);
        }
        
        return releasedLocks;
    }
    
    cleanup() {
        const now = Date.now();
        const oneHour = 60 * 60 * 1000;
        let cleanedLocks = 0;
        
        // 오래된 락들 정리 (1시간 이상)
        for (const [key, lockInfo] of [...this.locks.entries()]) {
            if (now - lockInfo.timestamp > oneHour) {
                this.releaseLock(lockInfo.channelId, lockInfo.type);
                cleanedLocks++;
            }
        }
        
        // 메모리 압박시 강제 정리
        if (this.locks.size > 500) {
            console.warn(`[GAMELOCK] Too many locks (${this.locks.size}), forcing cleanup`);
            
            // 가장 오래된 락들부터 정리
            const oldLocks = [...this.locks.entries()]
                .sort(([,a], [,b]) => a.timestamp - b.timestamp)
                .slice(0, 250); // 절반 정리
            
            for (const [key, lockInfo] of oldLocks) {
                this.releaseLock(lockInfo.channelId, lockInfo.type);
                cleanedLocks++;
            }
        }
        
        // 10분마다 한 번만 로그 출력
        if (cleanedLocks > 0) {
            console.log(`[GAMELOCK] Cleaned ${cleanedLocks} stale locks, active: ${this.locks.size}`);
        }
    }
    
    // 시스템 정리 (프로그램 종료시)
    destroy() {
        console.log('[GAMELOCK] Shutting down GameLockManager...');
        
        // 정리 인터벌 중단
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        
        // 모든 타이머 정리
        for (const timeoutId of this.timeouts.values()) {
            clearTimeout(timeoutId);
        }
        
        // Map들 정리
        this.locks.clear();
        this.timeouts.clear();
        
        console.log('[GAMELOCK] GameLockManager shutdown complete');
    }
    
    // 상태 정보 가져오기
    getStats() {
        return {
            activeLocks: this.locks.size,
            activeTimeouts: this.timeouts.size,
            isInitialized: this.isInitialized
        };
    }
}

// 전역 락 매니저 인스턴스 (싱글톤)
const lockManager = new GameLockManager();

// 모듈이 여러 번 require되어도 인터벌은 한 번만 생성됨 (생성자에서 처리)

module.exports = lockManager;