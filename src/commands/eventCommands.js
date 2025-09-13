// src/commands/eventCommands.js
const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const { EVENT_TYPES, EVENT_NAMES } = require('../database/eventTypes');
const { 
    toggleEventChannel, 
    getEventChannels,
    setActiveEvent,
    removeActiveEvent,
    getEventRole,
    getActiveEvent,
    isChannelReadyForEvent,
    resetChannelActivity,
    getChannelActivityInfo
} = require('../database/eventModel');
const { addUserItem } = require('../database/inventoryModel');
const { ITEM_TYPES } = require('../database/itemTypes');
const { startWerewolfGame } = require('../commands/werewolfGame');
const lockManager = require('../utils/gameLockManager');
const timerManager = require('../utils/gameTimerManager');

// 업데이트 락 관리 클래스
class UpdateLockManager {
    constructor() {
        this.locks = new Map();
        this.timeouts = new Map();
        this.cleanupInterval = null;
        this.startCleanup();
    }
    
    startCleanup() {
        if (this.cleanupInterval) return; // 이미 시작됨
        
        // 1분마다 오래된 락 정리
        this.cleanupInterval = setInterval(() => {
            this.cleanup();
        }, 60000);
    }
    
    cleanup() {
        const now = Date.now();
        let cleanedLocks = 0;
        
        for (const [channelId, timestamp] of [...this.locks.entries()]) {
            if (now - timestamp > 30000) { // 30초 이상된 락 정리
                this.releaseLock(channelId);
                cleanedLocks++;
            }
        }
        
        // 5분마다 한 번만 로그 (로그 스팸 방지)
        if (cleanedLocks > 0 && now % (5 * 60 * 1000) < 60000) {
            console.log(`[UPDATELOCK] Cleaned ${cleanedLocks} expired locks, active: ${this.locks.size}`);
        }
        
        // 메모리 압박시 강제 정리
        if (this.locks.size > 100) {
            console.warn(`[UPDATELOCK] Too many locks (${this.locks.size}), forcing cleanup`);
            this.locks.clear();
            
            // 모든 타이머 정리
            for (const timeoutId of this.timeouts.values()) {
                clearTimeout(timeoutId);
            }
            this.timeouts.clear();
        }
    }
    
    acquireLock(channelId, timeoutMs = 5000) {
        if (this.locks.has(channelId)) {
            return false;
        }
        
        this.locks.set(channelId, Date.now());
        
        const timeoutId = setTimeout(() => {
            this.releaseLock(channelId);
            // 로그 스팸 방지 - 5분에 한 번만
            if (Date.now() % (5 * 60 * 1000) < 5000) {
                console.warn(`[UPDATELOCK] Auto-released lock for channel ${channelId}`);
            }
        }, Math.max(timeoutMs, 1000)); // 최소 1초
        
        this.timeouts.set(channelId, timeoutId);
        return true;
    }
    
    releaseLock(channelId) {
        const timeoutId = this.timeouts.get(channelId);
        if (timeoutId) {
            clearTimeout(timeoutId);
            this.timeouts.delete(channelId);
        }
        
        return this.locks.delete(channelId);
    }
    
    isLocked(channelId) {
        // 만료된 락은 자동으로 제거
        if (this.locks.has(channelId)) {
            const timestamp = this.locks.get(channelId);
            if (Date.now() - timestamp > 30000) { // 30초 초과
                this.releaseLock(channelId);
                return false;
            }
            return true;
        }
        return false;
    }
    
    // 정리 작업 중단 (프로그램 종료시)
    destroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        
        // 모든 타이머 정리
        for (const timeoutId of this.timeouts.values()) {
            clearTimeout(timeoutId);
        }
        
        this.locks.clear();
        this.timeouts.clear();
    }
}


const updateLockManager = new UpdateLockManager();

// 프로세스 종료시 정리
process.on('beforeExit', () => updateLockManager.destroy());
process.on('SIGINT', () => updateLockManager.destroy());
process.on('SIGTERM', () => updateLockManager.destroy());

// 이벤트 채널 설정 명령어
async function handleSetEventChannelCommand(message, args) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        message.reply('This command can only be used by server administrators.');
        return;
    }
    
    if (args.length >= 2 && args[0] === '2' && args[1] === 'role') {
        await handleSetWerewolfRoleCommand(message, args.slice(2));
        return;
    }
    
    const channelId = message.channel.id;
    const isAdded = toggleEventChannel(channelId);
    
    if (isAdded) {
        message.reply('This channel is now an event channel. Random events will occur here.');
    } else {
        message.reply('This channel is no longer an event channel.');
    }
}

// 이벤트 시작 명령어 (개선된 버전)
async function handleStartEventCommand(message, args) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        message.reply('This command can only be used by server administrators.');
        return;
    }
    
    if (args.length < 1) {
        const eventList = Object.entries(EVENT_TYPES)
            .filter(([name, id]) => id !== EVENT_TYPES.NONE)
            .map(([name, id]) => `${id}: ${EVENT_NAMES[id]}`)
            .join('\n');
            
        message.reply(`Usage: event start [event_id]\nAvailable events:\n${eventList}`);
        return;
    }
    
    const eventId = parseInt(args[0]);
    if (isNaN(eventId) || !EVENT_NAMES[eventId]) {
        message.reply('Invalid event ID. Please provide a valid event ID.');
        return;
    }
    
    const activeEvent = getActiveEvent(message.channel.id);
    if (activeEvent) {
        message.reply('There is already an active event in this channel. Please wait for it to finish.');
        return;
    }
    
    try {
        switch (eventId) {
            case EVENT_TYPES.COUNTING_GAME:
                await startEyesightGame(message);
                break;
            case EVENT_TYPES.WEREWOLF_GAME:
                await startWerewolfGame(message, args.slice(1));
                break;
            default:
                message.reply('This event is not yet implemented.');
        }
    } catch (error) {
        console.error(`Error starting event ${eventId}:`, error);
        message.reply('An error occurred while starting the event. Please try again.');
    }
}

// 눈치게임(카운팅 게임) 시작 함수 (개선된 버전)
async function startEyesightGame(message) {
    const channelId = message.channel.id;
    
    // 락 획득
    if (!lockManager.acquireLock(channelId, 'counting_game', 10000)) {
        await message.reply('A counting game is already starting in this channel.');
        return null;
    }
    
    try {
        const eventData = {
            participants: {},
            currentNumber: 0,
            participantCount: 0,
            startTime: Date.now(),
            endTime: Date.now() + (5 * 60 * 1000),
            status: 'active',
            participantOrder: [],
            gameMessageId: null
        };
        
        setActiveEvent(channelId, EVENT_TYPES.COUNTING_GAME, eventData);
        
        const embed = new EmbedBuilder()
            .setTitle('🎮 Counting Game Started!')
            .setDescription(
                'Count up from 1 in order! Each person can only say one number.\n\n' +
                '**Rules:**\n' +
                '• Start with 1 and count upward in sequence (1, 2, 3, ...)\n' +
                '• Each person can participate only ONCE\n' +
                '• Only type the next correct number (not text, just the number)\n' +
                '• Game ends immediately if someone types the wrong number\n' +
                '• Game also ends if the same person tries to enter twice\n' +
                '• Game will automatically end after 5 minutes\n\n' +
                '**Rewards:**\n' +
                '• First player: Total Players × 50 credits\n' +
                '• Middle players: (Remaining Players) × 50 credits\n' +
                '• Last player: 50 credits'
            )
            .setColor('#00FF00')
            .addFields(
                { name: 'Current Number', value: '0', inline: true },
                { name: 'Next Number', value: '1', inline: true },
                { name: 'Time Remaining', value: '5:00', inline: true }
            )
            .setFooter({ text: 'Game ends automatically in 5 minutes • Updates every 5 seconds' });
        
        const { getEventRole } = require('../database/eventModel');
        const guildId = message.guild ? message.guild.id : (message.channel.guild ? message.channel.guild.id : null);
        
        let content = '';
        if (guildId) {
            const eventRoleId = getEventRole(guildId);
            if (eventRoleId) {
                content = `<@&${eventRoleId}> A new event has started!`;
            }
        }
        
        const gameMessage = await message.channel.send({ 
            content: content,
            embeds: [embed] 
        });
        
        eventData.gameMessageId = gameMessage.id;
        setActiveEvent(channelId, EVENT_TYPES.COUNTING_GAME, eventData);
        
        // 자동 종료 타이머 설정 (개선된 방식)
        timerManager.scheduleTimer(
            `counting_game_${channelId}`,
            () => endEyesightGame(message.channel, 'timeout'),
            5 * 60 * 1000,
            { channelId, startTime: eventData.startTime }
        );
        
        // 타이머 디스플레이 업데이트 인터벌 설정
        const timerDisplayInterval = setInterval(async () => {
            try {
                const currentEvent = getActiveEvent(channelId);
                if (!currentEvent || currentEvent.type !== EVENT_TYPES.COUNTING_GAME || currentEvent.data.status !== 'active') {
                    clearInterval(timerDisplayInterval);
                    return;
                }
                
                await updateEyesightGameEmbedSafe(message.channel);
            } catch (error) {
                console.error('Error updating timer display:', error);
                clearInterval(timerDisplayInterval);
            }
        }, 5000);
        
        console.log(`Counting game started in channel ${channelId}. Will end at ${new Date(eventData.endTime)}`);
        return gameMessage;
        
    } catch (error) {
        console.error('Error starting counting game:', error);
        await message.reply('An error occurred while starting the counting game.');
        return null;
    } finally {
        lockManager.releaseLock(channelId, 'counting_game');
    }
}

// 숫자 입력 처리 함수 (개선된 버전)
async function handleEyesightGameInput(message) {
    const channelId = message.channel.id;
    
    const activeEvent = getActiveEvent(channelId);
    if (!activeEvent || activeEvent.type !== EVENT_TYPES.COUNTING_GAME || activeEvent.data.status !== 'active') {
        return false;
    }
    
    const eventData = activeEvent.data;
    const userId = message.author.id;
    const content = message.content.trim();
    
    if (!/^\d+$/.test(content)) {
        return false;
    }
    
    const number = parseInt(content);
    const expectedNumber = eventData.currentNumber + 1;
    
    // 중복 참가 체크
    if (eventData.participants[userId]) {
        try {
            await endEyesightGame(message.channel, 'duplicate_user', userId);
        } catch (error) {
            console.error('Error ending game on duplicate user:', error);
            // 게임 데이터 정리
            timerManager.clearTimer(`counting_game_${channelId}`);
            removeActiveEvent(channelId);
        }
        return true;
    }
    
    // 잘못된 숫자 체크
    if (number !== expectedNumber) {
        try {
            await endEyesightGame(message.channel, 'wrong_number', userId, number);
        } catch (error) {
            console.error('Error ending game on wrong number:', error);
            // 게임 데이터 정리
            timerManager.clearTimer(`counting_game_${channelId}`);
            removeActiveEvent(channelId);
        }
        return true;
    }
    
    // 올바른 숫자 입력 처리
    eventData.participants[userId] = {
        number: number,
        timestamp: Date.now(),
        messageId: message.id
    };
    eventData.participantOrder.push(userId);
    eventData.currentNumber = number;
    eventData.participantCount++;
    
    // 체크 반응 추가
    try {
        await message.react('✅');
    } catch (error) {
        console.error('Error adding reaction:', error);
    }
    
    setActiveEvent(channelId, EVENT_TYPES.COUNTING_GAME, eventData);
    
    // 즉시 임베드 업데이트
    try {
        await updateEyesightGameEmbedSafe(message.channel);
    } catch (updateError) {
        console.error('Error updating game embed immediately:', updateError);
    }
    
    return true;
}

// 안전한 임베드 업데이트 함수
async function updateEyesightGameEmbedSafe(channel) {
    const channelId = channel.id;
    
    if (updateLockManager.isLocked(channelId)) {
        return false; // 로그 제거 - 스팸 방지
    }
    
    if (!updateLockManager.acquireLock(channelId)) {
        return false;
    }
    
    try {
        const result = await updateEyesightGameEmbed(channel);
        return result;
    } catch (error) {
        console.error('[EMBED] Error in safe embed update:', error);
        return false;
    } finally {
        updateLockManager.releaseLock(channelId);
    }
}

// 게임 임베드 업데이트 함수
async function updateEyesightGameEmbed(channel) {
    try {
        const activeEvent = getActiveEvent(channel.id);
        if (!activeEvent || activeEvent.type !== EVENT_TYPES.COUNTING_GAME) {
            return false;
        }
        
        const eventData = activeEvent.data;
        
        if (eventData.status !== 'active') {
            return false;
        }
        
        const currentNumber = eventData.currentNumber;
        const now = Date.now();
        const timeLeft = Math.max(0, eventData.endTime - now);
        const minutes = Math.floor(timeLeft / 60000);
        const seconds = Math.floor((timeLeft % 60000) / 1000);
        const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        
        // 시간 초과 체크
        if (timeLeft <= 0) {
            setImmediate(() => {
                endEyesightGame(channel, 'timeout').catch(error => {
                    console.error('[GAME] Error in timeout game end:', error);
                });
            });
            return false;
        }
        
        // 참여자 목록 생성 (에러 방지 강화)
        let participants = '';
        try {
            if (eventData.participantOrder && Array.isArray(eventData.participantOrder)) {
                participants = eventData.participantOrder.map((userId, index) => {
                    const participant = eventData.participants[userId];
                    if (!participant) return `${index + 1}. <@${userId}>: Error`;
                    return `${index + 1}. <@${userId}>: ${participant.number}`;
                }).join('\n').slice(0, 1024);
            }
        } catch (participantError) {
            console.error('[EMBED] Error generating participants list:', participantError);
            participants = 'Error generating participant list';
        }
        
        const embed = new EmbedBuilder()
            .setTitle('🎮 Counting Game in Progress')
            .setDescription(
                'Count up from 1 in order! Each person can only participate once.\n\n' +
                '**Rules:**\n' +
                '• Only type the next number in sequence\n' +
                '• Each person can participate only ONCE\n' +
                '• Game ends if someone types the wrong number\n' +
                '• Game also ends if the same person participates twice\n\n' +
                `Current participants: ${eventData.participantCount}`
            )
            .setColor('#00FF00')
            .addFields(
                { name: 'Current Number', value: `${currentNumber}`, inline: true },
                { name: 'Next Number', value: `${currentNumber + 1}`, inline: true },
                { name: 'Time Remaining', value: timeString, inline: true }
            );
        
        if (participants) {
            embed.addFields({ name: 'Participants', value: participants });
        }
        
        // 메시지 업데이트 (에러 처리 강화)
        let messageUpdated = false;
        
        if (eventData.gameMessageId) {
            try {
                const gameMessage = await channel.messages.fetch(eventData.gameMessageId);
                if (gameMessage && gameMessage.embeds.length > 0) {
                    await gameMessage.edit({ embeds: [embed] });
                    messageUpdated = true;
                }
            } catch (fetchError) {
                // 로그 스팸 방지 - 5분마다만 로그
                if (Date.now() % (5 * 60 * 1000) < 5000) {
                    console.log(`[EMBED] Could not update game message ${eventData.gameMessageId}`);
                }
                eventData.gameMessageId = null;
            }
        }
        
        if (!messageUpdated) {
            try {
                const messages = await channel.messages.fetch({ limit: 15 });
                const gameMessages = messages.filter(msg => 
                    msg.author.bot && 
                    msg.embeds.length > 0 && 
                    msg.embeds[0].title && 
                    (msg.embeds[0].title.includes('Counting Game in Progress') || 
                     msg.embeds[0].title.includes('Counting Game Started'))
                );
                
                if (gameMessages.size > 0) {
                    const latestGameMessage = gameMessages.first();
                    await latestGameMessage.edit({ embeds: [embed] });
                    
                    eventData.gameMessageId = latestGameMessage.id;
                    setActiveEvent(channel.id, EVENT_TYPES.COUNTING_GAME, eventData);
                    messageUpdated = true;
                }
            } catch (searchError) {
                console.error('[EMBED] Error searching for game messages:', searchError);
            }
        }
        
        if (!messageUpdated) {
            try {
                const newMessage = await channel.send({ embeds: [embed] });
                eventData.gameMessageId = newMessage.id;
                setActiveEvent(channel.id, EVENT_TYPES.COUNTING_GAME, eventData);
                messageUpdated = true;
            } catch (createError) {
                console.error('[EMBED] Error creating new game message:', createError);
                return false;
            }
        }
        
        return messageUpdated;
        
    } catch (error) {
        console.error('[EMBED] Error in updateEyesightGameEmbed:', error);
        return false;
    }
}

// 게임 종료 함수 (개선된 버전)
async function endEyesightGame(channel, reason, userId = null, wrongNumber = null) {
    const channelId = channel.id;
    console.log(`Starting game end process for channel ${channelId}, reason: ${reason}`);
    
    // 락 획득
    if (!lockManager.acquireLock(channelId, 'end_counting_game', 30000)) {
        console.log(`Game ending already in progress for channel ${channelId}`);
        return;
    }
    
    try {
        const activeEvent = getActiveEvent(channelId);
        if (!activeEvent || activeEvent.type !== EVENT_TYPES.COUNTING_GAME) {
            console.log(`No active counting game found in channel ${channelId}`);
            return;
        }
        
        const eventData = activeEvent.data;
        
        if (eventData.status === 'ending' || eventData.status === 'ended') {
            console.log(`Game in channel ${channelId} is already being ended: ${eventData.status}`);
            return;
        }
        
        eventData.status = 'ending';
        setActiveEvent(channelId, EVENT_TYPES.COUNTING_GAME, eventData);
        
        // 타이머 정리
        timerManager.clearTimer(`counting_game_${channelId}`);
        
        eventData.status = 'ended';
        
        // 결과 메시지 생성
        let resultTitle = '🎮 Counting Game Ended';
        let resultDesc = '';
        
        switch (reason) {
            case 'timeout':
                resultDesc = 'The game has ended due to time limit.';
                break;
            case 'duplicate_user':
                resultDesc = `<@${userId}> tried to participate more than once! The game has ended.`;
                break;
            case 'wrong_number':
                resultDesc = `<@${userId}> entered the wrong number (${wrongNumber})! The game has ended.`;
                break;
            case 'admin_end':
                resultDesc = `The game has been forcefully ended by an administrator <@${userId}>.`;
                break;
            default:
                resultDesc = 'The game has ended.';
                break;
        }
        
        // 승리자 및 보상 계산
        let winners = [];
        let totalReward = 0;
        
        try {
            if (eventData.participantCount > 0) {
                for (let i = 0; i < eventData.participantOrder.length; i++) {
                    const playerId = eventData.participantOrder[i];
                    const player = eventData.participants[playerId];
                    
                    if (player && player.number === i + 1) {
                        let reward = 50;
                        
                        if (i === 0) {
                            reward = eventData.participantCount * 50;
                        } else if (i === eventData.participantCount - 1) {
                            reward = 50;
                        } else {
                            reward = (eventData.participantCount - i) * 50;
                        }
                        
                        winners.push({
                            userId: playerId,
                            number: player.number,
                            reward: reward
                        });
                        
                        totalReward += reward;
                    }
                }
            }
        } catch (rewardError) {
            console.error('Error calculating rewards:', rewardError);
            winners = [];
            totalReward = 0;
        }
        
        // 결과 임베드 생성 및 전송
        try {
            const embed = new EmbedBuilder()
                .setTitle(resultTitle)
                .setDescription(`${resultDesc}\n\n**Total participants:** ${eventData.participantCount}\n**Total rewards:** ${totalReward} credits`)
                .setColor('#FF9900');
            
            if (winners.length > 0) {
                const winnersList = winners.map(winner => 
                    `<@${winner.userId}> (#${winner.number}): ${winner.reward} credits`
                ).join('\n');
                
                embed.addFields({ name: 'Winners', value: winnersList });
            } else {
                embed.addFields({ name: 'Winners', value: 'No winners in this game.' });
            }
            
            await channel.send({ embeds: [embed] });
            
        } catch (embedError) {
            console.error('Error sending result embed:', embedError);
            try {
                await channel.send(`Game ended: ${resultDesc} Total participants: ${eventData.participantCount}`);
            } catch (textError) {
                console.error('Error sending text result:', textError);
            }
        }
        
        // 보상 지급
        for (const winner of winners) {
            try {
                addUserItem(winner.userId, ITEM_TYPES.CREDIT, winner.reward);
            } catch (rewardError) {
                console.error(`Error giving reward to user ${winner.userId}:`, rewardError);
            }
        }
        
        console.log(`Game ended in channel ${channelId} with ${winners.length} winners, total reward: ${totalReward}`);
        
    } catch (error) {
        console.error('Critical error in endEyesightGame:', error);
    } finally {
        // 항상 정리 작업 수행
        try {
            removeActiveEvent(channelId);
            console.log(`Active event removed for channel ${channelId}`);
        } catch (removeError) {
            console.error('Critical error removing active event:', removeError);
        }
        
        lockManager.releaseLock(channelId, 'end_counting_game');
    }
}

// 정기적인 이벤트 체크 함수 (개선된 버전)
async function checkRandomEvents(client) {
    const { config } = require('../../config');
    const eventChannels = getEventChannels();
    const { 
        isChannelReadyForEvent, 
        resetChannelActivity, 
        getChannelActivityInfo 
    } = require('../database/eventModel');
    
    // 사용 가능한 게임 타입들 가져오기
    const availableGames = config.EVENT_SYSTEM.AVAILABLE_GAMES || [EVENT_TYPES.COUNTING_GAME, EVENT_TYPES.WEREWOLF_GAME];
    
    if (availableGames.length === 0) {
        console.log('No games available for random events');
        return;
    }
    
    for (const channelId of eventChannels) {
        try {
            // 이미 해당 채널에서 처리 중인지 확인
            if (lockManager.isLocked(channelId, 'random_event')) {
                continue;
            }
            
            const activeEvent = getActiveEvent(channelId);
            if (activeEvent) {
                continue; // 이미 활성 이벤트가 있음
            }
            
            // 채널이 이벤트 준비 상태인지 확인
            if (!isChannelReadyForEvent(channelId)) {
                // 디버그 정보 출력
                const activityInfo = getChannelActivityInfo(channelId);
                const hoursLeft = Math.floor(activityInfo.timeUntilNext / (60 * 60 * 1000));
                const minutesLeft = Math.floor((activityInfo.timeUntilNext % (60 * 60 * 1000)) / (60 * 1000));
                
                if (activityInfo.timeUntilNext > 0) {
                    // 5분마다만 로그 출력 (스팸 방지)
                    if (Date.now() % (5 * 60 * 1000) < 60 * 1000) {
                        const { config } = require('../../config');
                        const baseHours = Math.floor(config.EVENT_SYSTEM.BASE_INTERVAL / (60 * 60 * 1000));
                        const savedMinutes = Math.floor((activityInfo.activityCount * config.EVENT_SYSTEM.ACTIVITY_REDUCTION) / (60 * 1000));
                        
                        console.log(`Channel ${channelId}: ${hoursLeft}h ${minutesLeft}m left (Base: ${baseHours}h, Saved: ${savedMinutes}m from ${activityInfo.activityCount} messages)`);
                    }
                }
                continue;
            }
            
            console.log(`Channel ${channelId} is ready for a random event!`);
            
            // 락 획득
            if (!lockManager.acquireLock(channelId, 'random_event', 60000)) {
                continue;
            }
            
            try {
                const channel = await client.channels.fetch(channelId);
                if (!channel) {
                    lockManager.releaseLock(channelId, 'random_event');
                    continue;
                }
                
                // 사용 가능한 게임 중에서 랜덤 선택
                const eventId = availableGames[Math.floor(Math.random() * availableGames.length)];
                const eventName = EVENT_NAMES[eventId];
                
                const guildId = channel.guild ? channel.guild.id : null;
                let content = '';
                
                if (guildId) {
                    const eventRoleId = getEventRole(guildId);
                    if (eventRoleId) {
                        content = `<@&${eventRoleId}> A random event is starting!`;
                    }
                }
                
                const embed = new EmbedBuilder()
                    .setTitle(`🎉 Random Event Starting: ${eventName}`)
                    .setDescription('A random event is starting in this channel!')
                    .setColor('#9B59B6');
                
                await channel.send({ 
                    content: content,
                    embeds: [embed] 
                });
                
                // 이벤트 시작
                switch (eventId) {
                    case EVENT_TYPES.COUNTING_GAME:
                        await startEyesightGame({ channel, guild: channel.guild });
                        break;
                    case EVENT_TYPES.WEREWOLF_GAME:
                        const fakeMessage = {
                            channel: channel,
                            author: { id: client.user.id },
                            guild: channel.guild,
                            reply: (content) => channel.send(content),
                            client: client
                        };
                        
                        await startWerewolfGame(fakeMessage, []);
                        break;
                }
                
                // 이벤트 시작 성공 시 액티비티 리셋
                resetChannelActivity(channelId);
                console.log(`Random event started in channel ${channelId}: ${eventName}`);
                
            } catch (eventError) {
                console.error(`Error starting random event in channel ${channelId}:`, eventError);
            } finally {
                lockManager.releaseLock(channelId, 'random_event');
            }
        } catch (error) {
            console.error(`Error processing random event check for channel ${channelId}:`, error);
        }
    }
}

// 이벤트 강제 종료 명령어 처리 (개선된 버전)
async function handleEndEventCommand(message) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        message.reply('This command can only be used by server administrators.');
        return;
    }
    
    const channelId = message.channel.id;
    const activeEvent = getActiveEvent(channelId);
    
    if (!activeEvent) {
        message.reply('There is no active event in this channel.');
        return;
    }
    
    try {
        switch (activeEvent.type) {
            case EVENT_TYPES.COUNTING_GAME:
                await endEyesightGame(message.channel, 'admin_end', message.author.id);
                break;
            case EVENT_TYPES.WEREWOLF_GAME:
                const { endGame } = require('./werewolfGame');
                
                try {
                    // 모든 락 초기화
                    lockManager.releaseAllLocks(channelId);
                    
                    // 강제 종료로 게임 종료 처리
                    await endGame(message.client, message.channel, activeEvent.data, true);
                    
                    message.reply('The Werewolf game has been forcefully ended by an administrator.');
                } catch (error) {
                    console.error('Error ending Werewolf game:', error);
                    
                    removeActiveEvent(channelId);
                    message.reply('There was an error ending the Werewolf game, but the event has been forcefully removed.');
                }
                break;
            default:
                removeActiveEvent(channelId);
                message.reply('The active event has been forcefully ended by an administrator.');
        }
    } catch (error) {
        console.error('Error ending event:', error);
        message.reply('An error occurred while ending the event, but it has been forcefully removed.');
        
        // 정리 작업
        removeActiveEvent(channelId);
        lockManager.releaseAllLocks(channelId);
    }
}

// 이벤트 역할 설정 명령어 처리
async function handleSetEventRoleCommand(message, args) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        message.reply('This command can only be used by server administrators.');
        return;
    }
    
    if (args.length < 1 || !message.mentions.roles.size) {
        message.reply('Usage: cevent role @rolename');
        return;
    }
    
    const role = message.mentions.roles.first();
    if (!role) {
        message.reply('Please mention a valid role.');
        return;
    }
    
    const { setEventRole } = require('../database/eventModel');
    setEventRole(message.guild.id, role.id);
    
    message.reply(`Event role has been set to ${role.name}. This role will be mentioned when events start.`);
}

// 웨어울프 역할 설정 명령어 처리
async function handleSetWerewolfRoleCommand(message, args) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        message.reply('This command can only be used by server administrators.');
        return;
    }
    
    if (!message.mentions.roles.size) {
        message.reply('Usage: cevent set 2 role @rolename');
        return;
    }
    
    const role = message.mentions.roles.first();
    if (!role) {
        message.reply('Please mention a valid role.');
        return;
    }
    
    const { setWerewolfRole } = require('../database/eventModel');
    setWerewolfRole(message.guild.id, role.id);
    
    let colorMsg = '';
    if (role.color) {
        colorMsg = `\nRole color: #${role.color.toString(16).padStart(6, '0')}`;
    } else {
        colorMsg = '\nThis role has no custom color. Consider adding a color to make participants more visible.';
    }
    
    message.reply(`Werewolf game role has been set to ${role.name}. Players will receive this role when they join the game.${colorMsg}`);
}

module.exports = {
    handleSetEventChannelCommand,
    handleStartEventCommand,
    handleEndEventCommand,
    handleSetEventRoleCommand,
    handleSetWerewolfRoleCommand,
    handleEyesightGameInput,
    checkRandomEvents
};