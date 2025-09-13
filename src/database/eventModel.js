// src/database/eventModel.js
const fs = require('fs');
const path = require('path');
const { config } = require('../../config');

// 이벤트 채널 및 활성 이벤트 데이터
let eventData = {
    eventChannels: [],
    activeEvents: {},
    lastEventCheck: 0,
    eventRoles: {},
    werewolfRoles: {},
    channelActivity: {},  // 채널별 액티비티 추적
    lastEventTimes: {}    // 채널별 마지막 이벤트 시간
};

// 데이터 저장 스로틀링
let saveTimeout = null;
const SAVE_DELAY = 1000; // 1초

function scheduleSave() {
    if (saveTimeout) {
        clearTimeout(saveTimeout);
    }
    
    saveTimeout = setTimeout(() => {
        saveEventDataNow();
        saveTimeout = null;
    }, SAVE_DELAY);
}

// 이벤트 데이터 로드
function loadEventData() {
    try {
        const filePath = path.join(config.paths.DATA_DIR, 'eventData.json');
        if (fs.existsSync(filePath)) {
            const rawData = fs.readFileSync(filePath, 'utf8');
            const loadedData = JSON.parse(rawData);
            
            // 기본 구조 보장 - 누락된 필드들 추가
            eventData = {
                eventChannels: loadedData.eventChannels || [],
                activeEvents: loadedData.activeEvents || {},
                lastEventCheck: loadedData.lastEventCheck || 0,
                eventRoles: loadedData.eventRoles || {},
                werewolfRoles: loadedData.werewolfRoles || {},
                channelActivity: loadedData.channelActivity || {}, // 누락 가능성
                lastEventTimes: loadedData.lastEventTimes || {}    // 누락 가능성
            };
            
            console.log('Event data loaded successfully');
            
            // 활성 이벤트 복구 정보 로그
            const activeEventCount = Object.keys(eventData.activeEvents).length;
            if (activeEventCount > 0) {
                console.log(`Found ${activeEventCount} active events to potentially restore`);
                
                // 각 활성 이벤트의 상태 로그
                for (const [channelId, event] of Object.entries(eventData.activeEvents)) {
                    console.log(`Channel ${channelId}: ${event.type} (status: ${event.data?.status || 'unknown'})`);
                }
            }
        } else {
            console.log('No existing event data file found, using defaults');
        }
    } catch (error) {
        console.error('Error loading event data:', error);
        // 오류 발생 시 기본값 사용 - 모든 필드 포함
        eventData = {
            eventChannels: [],
            activeEvents: {},
            lastEventCheck: 0,
            eventRoles: {},
            werewolfRoles: {},
            channelActivity: {},  
            lastEventTimes: {}   
        };
    }
}

// 즉시 저장 (내부 함수)
function saveEventDataNow() {
    try {
        // 타이머 관련 객체들을 제거한 깨끗한 데이터 생성
        const dataToSave = {
            eventChannels: eventData.eventChannels || [],
            activeEvents: {},
            lastEventCheck: eventData.lastEventCheck || 0,
            eventRoles: eventData.eventRoles || {},
            werewolfRoles: eventData.werewolfRoles || {}
        };
        
        // 활성 이벤트 데이터 정리
        for (const [channelId, event] of Object.entries(eventData.activeEvents || {})) {
            if (event && typeof event === 'object') {
                dataToSave.activeEvents[channelId] = {
                    type: event.type,
                    startTime: event.startTime,
                    data: cleanEventData(event.data)
                };
            }
        }
        
        const filePath = path.join(config.paths.DATA_DIR, 'eventData.json');
        fs.writeFileSync(filePath, JSON.stringify(dataToSave, null, 2), 'utf8');
        
        console.log('Event data saved successfully');
    } catch (error) {
        console.error('Error saving event data:', error);
    }
}

// 이벤트 데이터 정리 함수
function cleanEventData(data) {
    if (!data || typeof data !== 'object') {
        return {};
    }
    
    // 순환 참조 방지 및 타이머 객체 제거
    return JSON.parse(JSON.stringify(data, (key, value) => {
        // 타이머 관련 필드들은 저장하지 않음
        if (key === 'autoEndTimerId' || 
            key === 'timerDisplayInterval' || 
            key === 'actionTimeouts' ||
            key === 'extensionVoteTimer' ||
            (typeof value === 'object' && value !== null && 
             (value.constructor?.name === 'Timeout' || 
              value.constructor?.name === 'Timer'))) {
            return undefined;
        }
        return value;
    }));
}

// 공개 저장 함수 (스로틀링 적용)
function saveEventData() {
    scheduleSave();
}

// 이벤트 채널 추가/제거
function toggleEventChannel(channelId) {
    if (!channelId) {
        console.error('Invalid channelId provided to toggleEventChannel');
        return false;
    }
    
    const index = eventData.eventChannels.indexOf(channelId);
    if (index === -1) {
        eventData.eventChannels.push(channelId);
        saveEventData();
        console.log(`Added event channel: ${channelId}`);
        return true; // 추가됨
    } else {
        eventData.eventChannels.splice(index, 1);
        saveEventData();
        console.log(`Removed event channel: ${channelId}`);
        return false; // 제거됨
    }
}

// 이벤트 채널 리스트 가져오기
function getEventChannels() {
    return [...(eventData.eventChannels || [])];
}

// 활성 이벤트 설정
function setActiveEvent(channelId, eventType, eventDataParam) {
    if (!channelId || !eventType) {
        console.error('Invalid parameters provided to setActiveEvent');
        return false;
    }
    
    try {
        eventData.activeEvents[channelId] = {
            type: eventType,
            startTime: Date.now(),
            data: eventDataParam || {}
        };
        
        saveEventData();
        console.log(`Set active event for channel ${channelId}: type ${eventType}`);
        return true;
    } catch (error) {
        console.error('Error setting active event:', error);
        return false;
    }
}

// 활성 이벤트 제거
function removeActiveEvent(channelId) {
    if (!channelId) {
        console.error('Invalid channelId provided to removeActiveEvent');
        return false;
    }
    
    if (eventData.activeEvents[channelId]) {
        delete eventData.activeEvents[channelId];
        saveEventData();
        console.log(`Removed active event for channel ${channelId}`);
        return true;
    }
    
    console.log(`No active event found to remove for channel ${channelId}`);
    return false;
}

// 활성 이벤트 확인
function getActiveEvent(channelId) {
    if (!channelId) {
        return null;
    }
    
    const event = eventData.activeEvents[channelId];
    if (!event) {
        return null;
    }
    
    // 이벤트 데이터 유효성 검사
    if (!event.type || !event.data) {
        console.warn(`Invalid event data found for channel ${channelId}, removing`);
        removeActiveEvent(channelId);
        return null;
    }
    
    return event;
}

// 모든 활성 이벤트 가져오기
function getAllActiveEvents() {
    return { ...eventData.activeEvents };
}

// 마지막 이벤트 체크 시간 업데이트
function updateLastEventCheck() {
    eventData.lastEventCheck = Date.now();
    saveEventData();
}

// 마지막 이벤트 체크 시간 가져오기
function getLastEventCheck() {
    return eventData.lastEventCheck || 0;
}

// 이벤트 역할 설정
function setEventRole(guildId, roleId) {
    if (!guildId || !roleId) {
        console.error('Invalid parameters provided to setEventRole');
        return false;
    }
    
    if (!eventData.eventRoles) {
        eventData.eventRoles = {};
    }
    
    eventData.eventRoles[guildId] = roleId;
    saveEventData();
    console.log(`Set event role for guild ${guildId}: ${roleId}`);
    return true;
}

// 이벤트 역할 가져오기
function getEventRole(guildId) {
    if (!guildId || !eventData.eventRoles) {
        return null;
    }
    
    return eventData.eventRoles[guildId] || null;
}

// 웨어울프 게임 역할 설정
function setWerewolfRole(guildId, roleId) {
    if (!guildId || !roleId) {
        console.error('Invalid parameters provided to setWerewolfRole');
        return false;
    }
    
    if (!eventData.werewolfRoles) {
        eventData.werewolfRoles = {};
    }
    
    eventData.werewolfRoles[guildId] = roleId;
    saveEventData();
    console.log(`Set werewolf role for guild ${guildId}: ${roleId}`);
    return true;
}

// 웨어울프 게임 역할 가져오기
function getWerewolfRole(guildId) {
    if (!guildId || !eventData.werewolfRoles) {
        return null;
    }
    
    return eventData.werewolfRoles[guildId] || null;
}

// 이벤트 데이터 정리 (관리자용)
function cleanupEventData() {
    const now = Date.now();
    const twoHours = 2 * 60 * 60 * 1000;
    let cleanedCount = 0;
    
    for (const [channelId, event] of Object.entries(eventData.activeEvents)) {
        // 2시간 이상 된 이벤트는 정리
        if (now - event.startTime > twoHours) {
            console.warn(`Cleaning up stale event in channel ${channelId} (age: ${Math.floor((now - event.startTime) / 60000)} minutes)`);
            delete eventData.activeEvents[channelId];
            cleanedCount++;
        }
    }
    
    if (cleanedCount > 0) {
        saveEventData();
        console.log(`Cleaned up ${cleanedCount} stale events`);
    }
    
    return cleanedCount;
}

// 통계 정보 가져오기
function getEventStats() {
    const activeEventCount = Object.keys(eventData.activeEvents).length;
    const eventChannelCount = eventData.eventChannels.length;
    const eventRoleCount = Object.keys(eventData.eventRoles || {}).length;
    const werewolfRoleCount = Object.keys(eventData.werewolfRoles || {}).length;
    
    return {
        activeEvents: activeEventCount,
        eventChannels: eventChannelCount,
        eventRoles: eventRoleCount,
        werewolfRoles: werewolfRoleCount,
        lastCheck: eventData.lastEventCheck
    };
}

// 채널 액티비티 추적
function trackChannelActivity(channelId) {
    if (!eventData.channelActivity) {
        eventData.channelActivity = {};
    }
    if (!eventData.lastEventTimes) {
        eventData.lastEventTimes = {};
    }
    
    if (!eventData.channelActivity[channelId]) {
        eventData.channelActivity[channelId] = {
            messageCount: 0,
            lastActivity: Date.now()
        };
    }
    
    eventData.channelActivity[channelId].messageCount++;
    eventData.channelActivity[channelId].lastActivity = Date.now();
    
    saveEventData();
    console.log(`Channel ${channelId} activity tracked: ${eventData.channelActivity[channelId].messageCount} messages`);
}

// 채널이 이벤트 준비 상태인지 확인
function isChannelReadyForEvent(channelId) {
    if (!eventData.lastEventTimes) {
        eventData.lastEventTimes = {};
    }
    if (!eventData.channelActivity) {
        eventData.channelActivity = {};
    }
    
    const { config } = require('../../config');
    const now = Date.now();
    
    // 마지막 이벤트 시간 가져오기 (없으면 현재 시간으로 설정)
    if (!eventData.lastEventTimes[channelId]) {
        eventData.lastEventTimes[channelId] = now;
        saveEventData();
        return false; // 첫 설정이므로 아직 준비 안됨
    }
    
    const lastEventTime = eventData.lastEventTimes[channelId];
    
    // 기본 대기 시간
    const baseInterval = config.EVENT_SYSTEM.BASE_INTERVAL; // 3시간
    const activityReduction = config.EVENT_SYSTEM.ACTIVITY_REDUCTION; // 1분
    const minInterval = config.EVENT_SYSTEM.MIN_INTERVAL; // 30분
    
    // 해당 채널의 액티비티 정보
    const activity = eventData.channelActivity[channelId];
    let messageCount = 0;
    
    if (activity) {
        // 마지막 이벤트 이후의 메시지만 카운트
        if (activity.lastActivity > lastEventTime) {
            messageCount = activity.messageCount || 0;
        }
    }
    
    // 실제 대기 시간 계산 (메시지 하나당 1분씩 감소)
    const timeReduction = messageCount * activityReduction;
    const actualInterval = Math.max(minInterval, baseInterval - timeReduction);
    
    // 충분한 시간이 지났는지 확인
    const timeSinceLastEvent = now - lastEventTime;
    const isReady = timeSinceLastEvent >= actualInterval;
    
    if (isReady) {
        console.log(`Channel ${channelId} is ready for event. Time since last: ${Math.floor(timeSinceLastEvent / (60 * 1000))}m, Required: ${Math.floor(actualInterval / (60 * 1000))}m, Messages: ${messageCount}`);
    }
    
    return isReady;
}

// 채널 액티비티 리셋 (이벤트 시작 후)
function resetChannelActivity(channelId) {
    if (!eventData.lastEventTimes) {
        eventData.lastEventTimes = {};
    }
    if (!eventData.channelActivity) {
        eventData.channelActivity = {};
    }
    
    // 마지막 이벤트 시간 업데이트
    eventData.lastEventTimes[channelId] = Date.now();
    
    // 액티비티 카운터 리셋
    if (eventData.channelActivity[channelId]) {
        eventData.channelActivity[channelId].messageCount = 0;
    }
    
    saveEventData();
    console.log(`Channel ${channelId} activity reset after event start`);
}

// 채널 액티비티 정보 가져오기
function getChannelActivityInfo(channelId) {
    if (!eventData.lastEventTimes) {
        eventData.lastEventTimes = {};
    }
    if (!eventData.channelActivity) {
        eventData.channelActivity = {};
    }
    
    const { config } = require('../../config');
    const now = Date.now();
    
    const lastEventTime = eventData.lastEventTimes[channelId] || now;
    const activity = eventData.channelActivity[channelId];
    const messageCount = activity?.messageCount || 0;
    
    const baseInterval = config.EVENT_SYSTEM.BASE_INTERVAL;
    const activityReduction = config.EVENT_SYSTEM.ACTIVITY_REDUCTION;
    const minInterval = config.EVENT_SYSTEM.MIN_INTERVAL;
    
    const timeReduction = messageCount * activityReduction;
    const actualInterval = Math.max(minInterval, baseInterval - timeReduction);
    const timeSinceLastEvent = now - lastEventTime;
    const timeUntilNext = Math.max(0, actualInterval - timeSinceLastEvent);
    
    return {
        lastEventTime,
        messageCount: messageCount,
        timeSinceLastEvent,
        timeUntilNext,
        actualInterval,
        baseInterval,
        timeReduction,
        activityCount: messageCount
    };
}

module.exports = {
    loadEventData,
    saveEventData,
    saveEventDataNow, // 즉시 저장용 (비상시 사용)
    toggleEventChannel,
    getEventChannels,
    setActiveEvent,
    removeActiveEvent,
    getActiveEvent,
    getAllActiveEvents,
    updateLastEventCheck,
    getLastEventCheck,
    setEventRole,
    getEventRole,
    setWerewolfRole,
    getWerewolfRole,
    cleanupEventData,
    getEventStats,
    trackChannelActivity,
    isChannelReadyForEvent,
    resetChannelActivity,
    getChannelActivityInfo
};