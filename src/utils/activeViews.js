// src/utils/activeViews.js (빌딩 기능 제거 버전)
const { client } = require('../../index');
const { ActionRowBuilder, ButtonBuilder } = require('discord.js');

// 통합된 활성 뷰 맵 (channelId -> 뷰 객체)
const activeViews = new Map();

// 메시지 ID별 타이머 맵
const messageTimers = new Map();

// 정리 작업 수행 여부 추적
let cleanupIntervalId = null;
let isCleanupRunning = false;

/**
 * 만료된 뷰들과 타이머들을 정리하는 함수
 */
function cleanupExpiredViews() {
  if (isCleanupRunning) return; // 중복 실행 방지
  isCleanupRunning = true;

  try {
    const now = Date.now();
    let cleanedViews = 0;
    let cleanedTimers = 0;

    // 만료된 뷰들 정리
    for (const [channelId, view] of [...activeViews.entries()]) {
      if (now > view.expiresAt) {
        // 관련 타이머 정리
        if (messageTimers.has(view.messageId)) {
          clearTimeout(messageTimers.get(view.messageId));
          messageTimers.delete(view.messageId);
          cleanedTimers++;
        }
        activeViews.delete(channelId);
        cleanedViews++;
      }
    }

    // 고아 타이머들 정리 (뷰가 없는데 타이머만 남은 경우)
    for (const [messageId, timerId] of [...messageTimers.entries()]) {
      const hasRelatedView = [...activeViews.values()].some(view => view.messageId === messageId);
      if (!hasRelatedView) {
        clearTimeout(timerId);
        messageTimers.delete(messageId);
        cleanedTimers++;
      }
    }

    // 5분마다 한 번만 로그 출력 (로그 스팸 방지)
    if (now % (5 * 60 * 1000) < 30000 && (cleanedViews > 0 || cleanedTimers > 0)) {
      console.log(`[CLEANUP] Views: ${cleanedViews}, Timers: ${cleanedTimers}, Active: ${activeViews.size}, Timers: ${messageTimers.size}`);
    }

    // 메모리 압박시 강제 정리
    if (activeViews.size > 1000) {
      console.warn(`[CLEANUP] Too many active views (${activeViews.size}), forcing cleanup`);
      const oldestViews = [...activeViews.entries()]
        .sort(([,a], [,b]) => a.expiresAt - b.expiresAt)
        .slice(0, 500); // 가장 오래된 500개 정리

      for (const [channelId, view] of oldestViews) {
        if (messageTimers.has(view.messageId)) {
          clearTimeout(messageTimers.get(view.messageId));
          messageTimers.delete(view.messageId);
        }
        activeViews.delete(channelId);
      }
    }
  } catch (error) {
    console.error('[CLEANUP] Error in cleanup process:', error);
  } finally {
    isCleanupRunning = false;
  }
}

/**
 * 정기적 정리 작업 시작 (한 번만 실행)
 */
function startCleanupInterval() {
  if (cleanupIntervalId) return; // 이미 시작됨
  
  cleanupIntervalId = setInterval(cleanupExpiredViews, 120000); // 2분마다
  console.log('[CLEANUP] Started cleanup interval');
}

/**
 * 정리 작업 중단
 */
function stopCleanupInterval() {
  if (cleanupIntervalId) {
    clearInterval(cleanupIntervalId);
    cleanupIntervalId = null;
    console.log('[CLEANUP] Stopped cleanup interval');
  }
}

/**
 * 메시지 비활성화 타이머 설정
 */
function setDisableTimer(channelId, messageId, duration) {
  // 기존 타이머가 있는 경우 제거
  if (messageTimers.has(messageId)) {
    clearTimeout(messageTimers.get(messageId));
  }
  
  // duration이 너무 짧으면 최소값 적용
  const safeDuration = Math.max(duration, 1000); // 최소 1초
  
  const timerId = setTimeout(async () => {
    try {
      messageTimers.delete(messageId);
      removeActiveView(channelId);
      
      // 메시지 비활성화는 에러 방지를 위해 try-catch로 감싸기
      const { client } = require('../../index');
      const channel = client.channels.cache.get(channelId);
      if (channel) {
        try {
          const message = await channel.messages.fetch(messageId).catch(() => null);
          if (message && message.components && message.components.length > 0) {
            const { ActionRowBuilder, ButtonBuilder } = require('discord.js');
            const disabledComponents = message.components.map(row => {
              const newRow = new ActionRowBuilder();
              row.components.forEach(comp => {
                if (comp.type === 2) { // 버튼 타입
                  newRow.addComponents(
                    ButtonBuilder.from(comp).setDisabled(true)
                  );
                } else {
                  newRow.addComponents(comp);
                }
              });
              return newRow;
            });
            
            let updatedEmbeds = [];
            if (message.embeds && message.embeds.length > 0) {
              const { EmbedBuilder } = require('discord.js');
              updatedEmbeds = message.embeds.map(embed => 
                EmbedBuilder.from(embed)
                  .setFooter({ 
                    text: embed.footer?.text 
                      ? `${embed.footer.text} • ⚠️ Interaction expired` 
                      : '⚠️ This interaction has expired'
                  })
              );
            }
            
            await message.edit({ 
              content: message.content?.length > 0 ? message.content : null,
              embeds: updatedEmbeds.length > 0 ? updatedEmbeds : null,
              components: disabledComponents
            });
          }
        } catch (fetchError) {
          // 메시지 접근 실패는 조용히 무시 (로그 스팸 방지)
        }
      }
    } catch (error) {
      console.error('[TIMER] Error in disable timer:', error);
    }
  }, safeDuration);
  
  messageTimers.set(messageId, timerId);
  return timerId;
}

/**
 * 활성 뷰 등록 (통합 함수)
 */
function registerActiveView(channelId, messageId, userId, viewType, data, expiresAt, additionalData = {}) {
  // 정리 작업이 아직 시작되지 않았으면 시작
  startCleanupInterval();
  
  // 만료 시간이 현재보다 과거면 즉시 만료로 설정
  const safeExpiresAt = Math.max(expiresAt, Date.now() + 120000); // 최소 2분
  
  activeViews.set(channelId, { 
    viewType,
    messageId, 
    userId, 
    data, 
    expiresAt: safeExpiresAt,
    additionalData,
    createdAt: Date.now()
  });
  
  setDisableTimer(channelId, messageId, safeExpiresAt - Date.now());
}

/**
 * 활성 뷰 가져오기 (통합 함수)
 */
function getActiveView(channelId, viewType = null) {
  if (!activeViews.has(channelId)) {
    return null;
  }
  
  const view = activeViews.get(channelId);
  
  // 뷰 타입 확인 (지정된 경우)
  if (viewType && view.viewType !== viewType) {
    return null;
  }
  
  // 만료된 경우 삭제
  if (Date.now() > view.expiresAt) {
    activeViews.delete(channelId);
    if (messageTimers.has(view.messageId)) {
      clearTimeout(messageTimers.get(view.messageId));
      messageTimers.delete(view.messageId);
    }
    return null;
  }
  
  return view;
}

/**
 * 활성 뷰 삭제 (통합 함수)
 */
function removeActiveView(channelId, messageId = null, viewType = null) {
  if (!activeViews.has(channelId)) {
    return false;
  }
  
  const view = activeViews.get(channelId);
  
  // 메시지 ID가 제공된 경우 ID 확인
  if (messageId && view.messageId !== messageId) {
    return false;
  }
  
  // 뷰 타입이 제공된 경우 타입 확인
  if (viewType && view.viewType !== viewType) {
    return false;
  }
  
  // 타이머 제거
  if (messageTimers.has(view.messageId)) {
    clearTimeout(messageTimers.get(view.messageId));
    messageTimers.delete(view.messageId);
  }
  
  activeViews.delete(channelId);
  return true;
}

/**
 * 활성 뷰 업데이트 (통합 함수)
 */
function updateActiveView(channelId, messageId, userId, viewType, data, expiresAt, additionalData = {}) {
  if (!activeViews.has(channelId)) {
    return false;
  }
  
  const view = activeViews.get(channelId);
  
  if (view.messageId !== messageId) {
    return false;
  }
  
  const safeExpiresAt = Math.max(expiresAt, Date.now() + 30000);
  
  activeViews.set(channelId, { 
    viewType,
    messageId, 
    userId, 
    data, 
    expiresAt: safeExpiresAt,
    additionalData,
    createdAt: view.createdAt || Date.now()
  });
  
  setDisableTimer(channelId, messageId, safeExpiresAt - Date.now());
  return true;
}

/**
 * 타이머 갱신
 */
function refreshTimer(channelId, messageId, duration = 2 * 60 * 1000) {
  if (!activeViews.has(channelId)) {
    return false;
  }
  
  const view = activeViews.get(channelId);
  
  if (view.messageId !== messageId) {
    return false;
  }
  
  const newExpiresAt = Date.now() + duration;
  view.expiresAt = newExpiresAt;
  
  activeViews.set(channelId, view);
  setDisableTimer(channelId, messageId, duration);
  
  return true;
}

/**
 * 모든 리소스 정리 (프로그램 종료시 호출)
 */
function cleanup() {
  console.log('[CLEANUP] Cleaning up all active views and timers...');
  
  // 모든 타이머 정리
  for (const timerId of messageTimers.values()) {
    clearTimeout(timerId);
  }
  
  // 정리 인터벌 중단
  stopCleanupInterval();
  
  // Map 초기화
  activeViews.clear();
  messageTimers.clear();
  
  console.log('[CLEANUP] Cleanup completed');
}

// ========= 래퍼 함수들 (기존 호환성 유지) =========

// 시리즈 뷰 래퍼 함수
function registerActiveSeriesView(channelId, messageId, userId, seriesName, cards, expiresAt) {
  registerActiveView(channelId, messageId, userId, 'series', cards, expiresAt, { seriesName });
}

function getActiveSeriesView(channelId) {
  const view = getActiveView(channelId, 'series');
  if (!view) return null;
  
  return {
    messageId: view.messageId,
    userId: view.userId,
    seriesName: view.additionalData.seriesName,
    cards: view.data,
    expiresAt: view.expiresAt
  };
}

function removeActiveSeriesView(channelId, messageId = null) {
  return removeActiveView(channelId, messageId, 'series');
}

// 카드 리스트 뷰 래퍼 함수
function registerActiveCardView(channelId, messageId, userId, searchTerm, cards, allCards, expiresAt) {
  registerActiveView(channelId, messageId, userId, 'card', cards, expiresAt, { searchTerm, allCards });
}

function getActiveCardView(channelId) {
  const view = getActiveView(channelId, 'card');
  if (!view) return null;
  
  return {
    messageId: view.messageId,
    userId: view.userId,
    searchTerm: view.additionalData.searchTerm,
    cards: view.data,
    allCards: view.additionalData.allCards,
    expiresAt: view.expiresAt
  };
}

function removeActiveCardView(channelId, messageId = null) {
  return removeActiveView(channelId, messageId, 'card');
}

// 컬렉션 뷰 래퍼 함수
function registerActiveCollectionView(channelId, messageId, userId, targetUserId, cards, expiresAt) {
  registerActiveView(channelId, messageId, userId, 'collection', cards, expiresAt, { 
    targetUserId,
    channelId
  });
}

function getActiveCollectionView(channelId, messageId = null) {
  if (messageId) {
    for (const [chId, view] of activeViews.entries()) {
      if (view.viewType === 'collection' && view.messageId === messageId && 
          (view.additionalData.channelId === channelId || chId === channelId)) {
        if (Date.now() > view.expiresAt) {
          activeViews.delete(chId);
          return null;
        }
        return {
          channelId: view.additionalData.channelId,
          messageId: view.messageId,
          userId: view.userId,
          targetUserId: view.additionalData.targetUserId,
          cards: view.data,
          expiresAt: view.expiresAt
        };
      }
    }
    return null;
  }
  
  for (const [chId, view] of activeViews.entries()) {
    if (view.viewType === 'collection' && (view.additionalData.channelId === channelId || chId === channelId)) {
      if (Date.now() > view.expiresAt) {
        activeViews.delete(chId);
        continue;
      }
      return {
        channelId: view.additionalData.channelId,
        messageId: view.messageId,
        userId: view.userId,
        targetUserId: view.additionalData.targetUserId,
        cards: view.data,
        expiresAt: view.expiresAt
      };
    }
  }
  return null;
}

function removeActiveCollectionView(channelId, messageId = null) {
  if (messageId) {
    for (const [chId, view] of activeViews.entries()) {
      if (view.viewType === 'collection' && view.messageId === messageId &&
          (view.additionalData.channelId === channelId || chId === channelId)) {
        if (messageTimers.has(messageId)) {
          clearTimeout(messageTimers.get(messageId));
          messageTimers.delete(messageId);
        }
        activeViews.delete(chId);
        return true;
      }
    }
    return false;
  }
  
  let removed = false;
  for (const [chId, view] of [...activeViews.entries()]) {
    if (view.viewType === 'collection' && (view.additionalData.channelId === channelId || chId === channelId)) {
      if (messageTimers.has(view.messageId)) {
        clearTimeout(messageTimers.get(view.messageId));
        messageTimers.delete(view.messageId);
      }
      activeViews.delete(chId);
      removed = true;
    }
  }
  return removed;
}

function updateActiveCollectionView(channelId, messageId, userId, targetUserId, cards, expiresAt) {
  for (const [chId, view] of activeViews.entries()) {
    if (view.viewType === 'collection' && view.messageId === messageId) {
      if (view.additionalData.channelId !== channelId && chId !== channelId) {
        return false;
      }
      
      const safeExpiresAt = Math.max(expiresAt, Date.now() + 30000);
      
      activeViews.set(chId, {
        viewType: 'collection',
        messageId,
        userId,
        data: cards,
        expiresAt: safeExpiresAt,
        additionalData: {
          targetUserId,
          channelId
        },
        createdAt: view.createdAt || Date.now()
      });
      
      setDisableTimer(channelId, messageId, safeExpiresAt - Date.now());
      return true;
    }
  }
  return false;
}

// 물고기 컬렉션 뷰 래퍼 함수
function registerActiveFishCollectionView(channelId, messageId, userId, targetUserId, fish, expiresAt, extraData = {}) {
  registerActiveView(channelId, messageId, userId, 'fishCollection', fish, expiresAt, { 
    targetUserId,
    channelId,
    ...extraData
  });
}

function getActiveFishCollectionView(channelId, messageId = null) {
  if (messageId) {
    for (const [chId, view] of activeViews.entries()) {
      if (view.viewType === 'fishCollection' && view.messageId === messageId && 
          (view.additionalData.channelId === channelId || chId === channelId)) {
        if (Date.now() > view.expiresAt) {
          activeViews.delete(chId);
          return null;
        }
        return {
          channelId: view.additionalData.channelId,
          messageId: view.messageId,
          userId: view.userId,
          targetUserId: view.additionalData.targetUserId,
          fish: view.data,
          expiresAt: view.expiresAt
        };
      }
    }
    return null;
  }
  
  for (const [chId, view] of activeViews.entries()) {
    if (view.viewType === 'fishCollection' && (view.additionalData.channelId === channelId || chId === channelId)) {
      if (Date.now() > view.expiresAt) {
        activeViews.delete(chId);
        continue;
      }
      return {
        channelId: view.additionalData.channelId,
        messageId: view.messageId,
        userId: view.userId,
        targetUserId: view.additionalData.targetUserId,
        fish: view.data,
        expiresAt: view.expiresAt
      };
    }
  }
  return null;
}

function removeActiveFishCollectionView(channelId, messageId = null) {
  if (messageId) {
    for (const [chId, view] of activeViews.entries()) {
      if (view.viewType === 'fishCollection' && view.messageId === messageId &&
          (view.additionalData.channelId === channelId || chId === channelId)) {
        if (messageTimers.has(messageId)) {
          clearTimeout(messageTimers.get(messageId));
          messageTimers.delete(messageId);
        }
        activeViews.delete(chId);
        return true;
      }
    }
    return false;
  }
  
  let removed = false;
  for (const [chId, view] of [...activeViews.entries()]) {
    if (view.viewType === 'fishCollection' && (view.additionalData.channelId === channelId || chId === channelId)) {
      if (messageTimers.has(view.messageId)) {
        clearTimeout(messageTimers.get(view.messageId));
        messageTimers.delete(view.messageId);
      }
      activeViews.delete(chId);
      removed = true;
    }
  }
  return removed;
}

function updateActiveFishCollectionView(channelId, messageId, userId, targetUserId, fish, expiresAt, extraData = {}) {
  for (const [chId, view] of activeViews.entries()) {
    if (view.viewType === 'fishCollection' && view.messageId === messageId) {
      if (view.additionalData.channelId !== channelId && chId !== channelId) {
        return false;
      }
      
      const safeExpiresAt = Math.max(expiresAt, Date.now() + 30000);
      
      activeViews.set(chId, {
        viewType: 'fishCollection',
        messageId,
        userId,
        data: fish,
        expiresAt: safeExpiresAt,
        additionalData: {
          targetUserId,
          channelId,
          ...extraData
        },
        createdAt: view.createdAt || Date.now()
      });
      
      setDisableTimer(channelId, messageId, safeExpiresAt - Date.now());
      return true;
    }
  }
  return false;
}

// 프로세스 종료시 정리 작업 등록
process.on('beforeExit', cleanup);
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

module.exports = {
  // 통합 함수
  registerActiveView,
  getActiveView,
  removeActiveView,
  updateActiveView,
  refreshTimer,
  messageTimers,
  cleanup,

  // 낚시 뷰 래퍼 함수
  registerActiveFishCollectionView,
  getActiveFishCollectionView,
  removeActiveFishCollectionView,
  updateActiveFishCollectionView,

  // 시리즈 뷰 래퍼 함수
  registerActiveSeriesView,
  getActiveSeriesView,
  removeActiveSeriesView,
  
  // 카드 리스트 뷰 래퍼 함수
  registerActiveCardView,
  getActiveCardView,
  removeActiveCardView,
  
  // 컬렉션 뷰 래퍼 함수
  registerActiveCollectionView,
  getActiveCollectionView,
  removeActiveCollectionView,
  updateActiveCollectionView
};