// src/utils/gameTimerManager.js
class GameTimerManager {
    constructor() {
        this.timers = new Map();
        this.timerData = new Map();
    }
    
    scheduleTimer(id, callback, delay, data = {}) {
        // 기존 타이머가 있으면 제거
        this.clearTimer(id);
        
        const timerId = setTimeout(async () => {
            try {
                console.log(`Executing timer ${id}`);
                await callback();
            } catch (error) {
                console.error(`Error in timer ${id}:`, error);
            } finally {
                // 타이머 실행 후 정리
                this.timers.delete(id);
                this.timerData.delete(id);
            }
        }, delay);
        
        this.timers.set(id, timerId);
        this.timerData.set(id, {
            scheduledAt: Date.now(),
            executeAt: Date.now() + delay,
            data
        });
        
        console.log(`Timer ${id} scheduled for ${delay}ms`);
        return timerId;
    }
    
    clearTimer(id) {
        const timerId = this.timers.get(id);
        if (timerId) {
            clearTimeout(timerId);
            this.timers.delete(id);
            this.timerData.delete(id);
            console.log(`Timer ${id} cleared`);
            return true;
        }
        return false;
    }
    
    clearAllTimers() {
        const timerCount = this.timers.size;
        
        for (const [id, timerId] of this.timers.entries()) {
            clearTimeout(timerId);
        }
        
        this.timers.clear();
        this.timerData.clear();
        
        console.log(`Cleared ${timerCount} timers`);
        return timerCount;
    }
    
    getTimerInfo(id) {
        return this.timerData.get(id);
    }
    
    getAllTimers() {
        return Array.from(this.timerData.entries()).map(([id, data]) => ({
            id,
            ...data
        }));
    }
    
    restoreTimersFromData(client, gameTimerData) {
        console.log('Restoring game timers...');
        let restoredCount = 0;
        let expiredCount = 0;
        
        for (const [channelId, timerInfo] of Object.entries(gameTimerData)) {
            try {
                const timeLeft = timerInfo.executeAt - Date.now();
                
                if (timeLeft > 0) {
                    // 타이머 복구 - 최소 시간 제한 추가
                    if (timeLeft > 1000) { // 1초 이상 남아있을 때만 복구
                        this.scheduleTimer(
                            `autostart_${channelId}`,
                            () => this.handleAutoStart(client, channelId),
                            timeLeft,
                            timerInfo.data
                        );
                        restoredCount++;
                        console.log(`Restored timer for channel ${channelId}, ${Math.floor(timeLeft/1000)}s remaining`);
                    } else {
                        // 1초 미만으로 남은 경우 즉시 실행
                        console.log(`Timer for channel ${channelId} expires soon, executing immediately`);
                        setImmediate(() => this.handleAutoStart(client, channelId));
                        expiredCount++;
                    }
                } else {
                    // 이미 만료된 타이머 처리
                    const expiredBy = Math.floor(Math.abs(timeLeft) / 1000);
                    console.log(`Timer for channel ${channelId} already expired by ${expiredBy}s, handling...`);
                    setImmediate(() => this.handleExpiredTimer(client, channelId, timerInfo));
                    expiredCount++;
                }
            } catch (error) {
                console.error(`Error restoring timer for channel ${channelId}:`, error);
            }
        }
        
        console.log(`Timer restoration completed: ${restoredCount} timers restored, ${expiredCount} expired/immediate`);
        return restoredCount;
    }
    
    async handleAutoStart(client, channelId) {
        try {
            const { getActiveEvent, removeActiveEvent } = require('../database/eventModel');
            const { EVENT_TYPES } = require('../database/eventTypes');
            
            const activeEvent = getActiveEvent(channelId);
            if (!activeEvent || activeEvent.type !== EVENT_TYPES.WEREWOLF_GAME) {
                console.log(`No active werewolf game found for auto-start in channel ${channelId}`);
                return;
            }
            
            const eventData = activeEvent.data;
            if (eventData.status !== 'joining') {
                console.log(`Game in channel ${channelId} is not in joining phase: ${eventData.status}`);
                return;
            }
            
            // 채널 접근 검증 강화
            let channel;
            try {
                channel = await client.channels.fetch(channelId);
                if (!channel) {
                    throw new Error('Channel not found');
                }
            } catch (fetchError) {
                console.error(`Channel ${channelId} not accessible for auto-start:`, fetchError);
                // 접근할 수 없는 채널의 이벤트 정리
                removeActiveEvent(channelId);
                return;
            }
            
            // 플레이어 수 검증
            if (eventData.players.length >= 5) {
                await channel.send('**Auto-start timer expired!** Starting the game with ' + eventData.players.length + ' players...');
                
                // 게임 시작 처리
                const { beginWerewolfGame } = require('../commands/werewolfGame');
                
                // 더 안전한 fake interaction 객체 생성
                const fakeInteraction = {
                    message: { 
                        id: eventData.gameMessageId || null,
                        embeds: [{ fields: [] }] // 기본 구조 제공
                    },
                    channel: channel,
                    client: client,
                    user: { id: eventData.host || 'system' },
                    guild: channel.guild || null,
                    deferReply: async () => {
                        console.log('Auto-start fake deferReply called');
                    },
                    editReply: async (content) => {
                        if (typeof content === 'string') {
                            await channel.send(content);
                        } else {
                            await channel.send(content.content || 'Game started');
                        }
                    },
                    followUp: async (content) => {
                        await channel.send(content);
                    }
                };
                
                await beginWerewolfGame(fakeInteraction);
            } else {
                await channel.send(`Auto-start timer expired, but there are not enough players (minimum 5 required, current: ${eventData.players.length}). Cancelling the game.`);
                removeActiveEvent(channelId);
            }
        } catch (error) {
            console.error(`Error in auto-start for channel ${channelId}:`, error);
            // 에러 발생시 이벤트 정리
            try {
                const { removeActiveEvent } = require('../database/eventModel');
                removeActiveEvent(channelId);
            } catch (cleanupError) {
                console.error('Error cleaning up failed auto-start:', cleanupError);
            }
        }
    }
    
    async handleExpiredTimer(client, channelId, timerInfo) {
        // 만료된 타이머 처리 로직
        console.log(`Handling expired timer for channel ${channelId}`);
        await this.handleAutoStart(client, channelId);
    }
}

const timerManager = new GameTimerManager();

module.exports = timerManager;