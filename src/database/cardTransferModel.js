// src/database/cardTransferModel.js
const { config } = require('../../config');
const { initUserData, saveUserDataThrottled } = require('./userData');
const { getUserItem, removeUserItem } = require('./inventoryModel'); 
const { ITEM_TYPES } = require('./itemTypes');
const { transferCardStat } = require('./cardStats');
const { removeCardFromUser } = require('./cardModel');
// 보류 중인 카드 전송 저장소
const pendingCardTransfers = new Map();

/**
 * 카드 전송 함수
 * @param {string} fromUserId - 보내는 사용자 ID
 * @param {string} toUserId - 받는 사용자 ID
 * @param {string} cardId - 카드 ID
 * @returns {Object} 전송 결과
 */
function transferCard(fromUserId, toUserId, cardId) {
  const fromUser = initUserData(fromUserId);
  const toUser = initUserData(toUserId);
  
  const searchId = cardId.toLowerCase();
  
  const cardIndex = fromUser.cards.findIndex(card => 
    card.uniqueId.toLowerCase() === searchId || 
    card.uniqueId.toLowerCase().startsWith(searchId)
  );
  
  if (cardIndex === -1) {
    return { 
      success: false, 
      message: "Card not found in your collection. Please check the card ID."
    };
  }
  
  // 카드 복사 및 이동
  const card = { ...fromUser.cards[cardIndex] };
  card.obtainedAt = Date.now(); // 새로운 획득 시간 설정

  // 카드 통계 업데이트 (전송) - 레벨 정보 포함
  const level = card.level || 1;
  transferCardStat(card.cardId, fromUserId, toUserId, card.variant, level);
  
  // 카드 추가 및 제거
  toUser.cards.push(card);
  fromUser.cards.splice(cardIndex, 1);
  
  saveUserDataThrottled();

  // 카드 인덱스 맵 초기화
  delete fromUser._cardIndexMap;
  delete toUser._cardIndexMap;
  
  return {
    success: true,
    message: `Successfully transferred ${card.name} card to the recipient.`,
    card: card
  };
}

/**
 * 여러 카드 전송 함수
 * @param {string} fromUserId - 보내는 사용자 ID
 * @param {string} toUserId - 받는 사용자 ID
 * @param {Array} cardIds - 카드 ID 배열
 * @returns {Object} 전송 결과
 */
function transferMultipleCards(fromUserId, toUserId, cardIds) {
  const fromUser = initUserData(fromUserId);
  const toUser = initUserData(toUserId);
  
  // 크레딧 확인
  const transferFee = config.CARD_TRANSFER_FEE;
  const userCredits = getUserItem(fromUserId, ITEM_TYPES.CREDIT);
  
  if (userCredits < transferFee) {
    return {
      success: false,
      message: `You need ${transferFee} credits to transfer cards. Your current balance: ${userCredits} credits.`
    };
  }
  
  // 카드 존재 확인
  const cardsToTransfer = [];
  const notFoundCardIds = [];
  
  for (const cardId of cardIds) {
    const searchId = cardId.toLowerCase();
    const cardIndex = fromUser.cards.findIndex(card => 
      card.uniqueId.toLowerCase() === searchId || 
      card.uniqueId.toLowerCase().startsWith(searchId)
    );
    
    if (cardIndex === -1) {
      notFoundCardIds.push(cardId);
    } else {
      cardsToTransfer.push({
        card: fromUser.cards[cardIndex],
        index: cardIndex
      });
    }
  }
  
  if (notFoundCardIds.length > 0) {
    return {
      success: false,
      message: `The following cards were not found: ${notFoundCardIds.join(", ")}`
    };
  }
  
  // 전송 ID 생성
  const transferId = `transfer_${Date.now()}_${fromUserId}_${toUserId}`;
  
  // 보류 중인 전송 저장
  pendingCardTransfers.set(transferId, {
    fromUserId,
    toUserId,
    cardsToTransfer,
    status: {
      fromUserAccepted: false,
      toUserAccepted: false
    },
    timestamp: Date.now(),
    fee: transferFee
  });
  
  // 타임아웃 설정
  setTimeout(() => {
    if (pendingCardTransfers.has(transferId)) {
      pendingCardTransfers.delete(transferId);
      console.log(`Card transfer ${transferId} expired`);
    }
  }, config.CARD_TRANSFER_TIMEOUT);
  
  return {
    success: true,
    transferId,
    cards: cardsToTransfer.map(item => item.card),
    fee: transferFee
  };
}

/**
 * 카드 전송 수락 함수
 * @param {string} transferId - 전송 ID
 * @param {string} userId - 사용자 ID
 * @returns {Object} 수락 결과
 */
function acceptCardTransfer(transferId, userId) {
  const transfer = pendingCardTransfers.get(transferId);
  
  if (!transfer) {
    return {
      success: false,
      message: "The transfer request has expired or doesn't exist."
    };
  }
  
  if (userId === transfer.fromUserId) {
    transfer.status.fromUserAccepted = true;
  } else if (userId === transfer.toUserId) {
    transfer.status.toUserAccepted = true;
  } else {
    return {
      success: false,
      message: "You are not part of this transfer."
    };
  }
  
  // 양쪽 모두 수락했는지 확인
  if (transfer.status.fromUserAccepted && transfer.status.toUserAccepted) {
    const fromUser = initUserData(transfer.fromUserId);
    const toUser = initUserData(transfer.toUserId);
    
    // 전송 수수료 차감
    removeUserItem(transfer.fromUserId, ITEM_TYPES.CREDIT, transfer.fee);
    
    // 카드 복사 및 이동 (인덱스가 큰 것부터 제거하여 인덱스 변화 방지)
    const transferredCards = [];
    
    // 인덱스 큰 순서대로 정렬
    const sortedTransfers = [...transfer.cardsToTransfer].sort((a, b) => b.index - a.index);
    
    // transferMultipleCards 함수 내부에서 카드 제거 시 updateStats를 false로 설정
    for (const item of sortedTransfers) {
      const card = { ...item.card };
      card.obtainedAt = Date.now();
      transferredCards.push(card);

      // 카드 통계 업데이트 (전송) - 수정된 transferCardStat 사용
      transferCardStat(card.cardId, transfer.fromUserId, transfer.toUserId, card.variant, card.level || 1);

      toUser.cards.push(card);
      // 인덱스로 직접 삭제하는 대신 removeCardFromUser 사용
      removeCardFromUser(transfer.fromUserId, item.card.uniqueId, false);
    }
        
    // 카드 인덱스 맵 초기화
    delete fromUser._cardIndexMap;
    delete toUser._cardIndexMap;
    
    saveUserDataThrottled();
    pendingCardTransfers.delete(transferId);
    
    return {
      success: true,
      message: "Cards transferred successfully!",
      transferredCards,
      fee: transfer.fee
    };
  }
  
  return {
    success: true,
    message: "Transfer accepted. Waiting for the other party to accept.",
    fromUserAccepted: transfer.status.fromUserAccepted,
    toUserAccepted: transfer.status.toUserAccepted
  };
}

/**
 * 카드 전송 거절 함수
 * @param {string} transferId - 전송 ID
 * @param {string} userId - 사용자 ID
 * @returns {Object} 거절 결과
 */
function rejectCardTransfer(transferId, userId) {
  const transfer = pendingCardTransfers.get(transferId);
  
  if (!transfer) {
    return {
      success: false,
      message: "The transfer request has expired or doesn't exist."
    };
  }
  
  if (userId !== transfer.fromUserId && userId !== transfer.toUserId) {
    return {
      success: false,
      message: "You are not part of this transfer."
    };
  }
  
  pendingCardTransfers.delete(transferId);
  
  return {
    success: true,
    message: "Transfer has been rejected."
  };
}

/**
 * 카드 전송 상태 확인 함수
 * @param {string} transferId - 전송 ID
 * @returns {Object} 전송 상태 객체
 */
function getCardTransferStatus(transferId) {
  return pendingCardTransfers.get(transferId);
}

module.exports = {
  transferCard,
  transferMultipleCards,
  acceptCardTransfer,
  rejectCardTransfer,
  getCardTransferStatus
};