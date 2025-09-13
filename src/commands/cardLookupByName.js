// src/commands/cardLookupByName.js
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, EmbedBuilder } = require('discord.js');
const { getAllCards } = require('../database/cardDatabase');
const { createSingleCardImage } = require('../utils/imageUtils');
const { getCardStats, getCardOwnerRankingCached, getSeriesOwnerRankingCached, getBurnedCardStats } = require('../database/cardStats');
const { isUserInWishlist } = require('../database/wishlistDatabase');
/**
 * 카드 이름으로 카드 검색 (부분 일치도 가능)
 */
function searchCardByName(cardName) {
  if (!cardName || cardName.trim() === '') {
    return [];
  }
  
  const searchTerm = cardName.toLowerCase();
  const allCards = getAllCards();
  
  // 일치하는 카드 찾기 (이름 부분 일치)
  return allCards.filter(card => 
    card.name && card.name.toLowerCase().includes(searchTerm)
  );
}

/**
 * 카드 검색 결과 리스트를 표시하는 함수
 */
async function showCardListByName(message, cardName, matchingCards, page = 0) {
  try {
    const pageSize = 10; // 한 페이지당 표시할 카드 수
    const totalPages = Math.ceil(matchingCards.length / pageSize);
    
    // 페이지 번호 범위 확인
    const validPage = Math.max(0, Math.min(page, totalPages - 1));
    
    // 현재 페이지에 표시할 카드 계산
    const startIdx = validPage * pageSize;
    const endIdx = Math.min(startIdx + pageSize, matchingCards.length);
    const pageCards = matchingCards.slice(startIdx, endIdx);
    
    // 임베드 생성
    const embed = new EmbedBuilder()
      .setTitle(`Search Results for "${cardName}"`)
      .setDescription(`Found ${matchingCards.length} cards matching your search.
        Enter a number (1-${pageCards.length}) to view card details.`)
      .setColor('#0099ff')
      .setFooter({ text: `Page ${validPage + 1}/${totalPages} • Will expire in 2 minutes` })
      .setTimestamp();
    
    // 카드 목록 추가
    let cardListText = '';
    pageCards.forEach((card, index) => {
      cardListText += `**${index + 1}.** ${card.name} (${card.series})\n`;
    });
    
    embed.addFields({ name: 'Cards', value: cardListText });
    
    // 페이지네이션 버튼 생성
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`card_first:${cardName}:${validPage}`)
          .setLabel('<<')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(validPage === 0),
        new ButtonBuilder()
          .setCustomId(`card_prev:${cardName}:${validPage}`)
          .setLabel('<')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(validPage === 0),
        new ButtonBuilder()
          .setCustomId(`card_next:${cardName}:${validPage}`)
          .setLabel('>')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(validPage === totalPages - 1),
        new ButtonBuilder()
          .setCustomId(`card_last:${cardName}:${validPage}`)
          .setLabel('>>')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(validPage === totalPages - 1)
      );
    
    // 필요한 모듈 임포트 추가
    const { registerActiveCardView, removeActiveCardView } = require('../utils/activeViews');
    
    // 기존 활성 뷰 제거
    removeActiveCardView(message.channel.id);
    
    // 메시지 전송
    const sentMessage = await message.reply({ embeds: [embed], components: [row] });
    
    // 새로운 활성 뷰 등록 (2분 유효)
    const expiresAt = Date.now() + (2 * 60 * 1000);
    registerActiveCardView(
      message.channel.id,
      sentMessage.id,
      message.author.id,
      cardName,
      pageCards.map(card => ({ id: card.id || card.cardId, name: card.name, series: card.series })),
      matchingCards,
      expiresAt
    );
    
    // 추가: 2분 후 자동 비활성화 타이머 설정
    const { disableCardButtons } = require('../interactions/buttonHandlers');
    setTimeout(() => {
      // 리스트용 버튼 비활성화 - 다른 버튼 형태이므로 별도 함수 필요
      try {
        const message = sentMessage;
        if (!message) return;
        
        // 버튼 비활성화
        const disabledRow = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`card_first_expired`)
              .setLabel('<<')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true),
            new ButtonBuilder()
              .setCustomId(`card_prev_expired`)
              .setLabel('<')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true),
            new ButtonBuilder()
              .setCustomId(`card_next_expired`)
              .setLabel('>')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true),
            new ButtonBuilder()
              .setCustomId(`card_last_expired`)
              .setLabel('>>')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true)
          );
        
        message.edit({ components: [disabledRow] });
      } catch (error) {
        console.error('Error disabling list buttons after timeout:', error);
      }
    }, 2 * 60 * 1000);
    
    return true;
  } catch (error) {
    console.error('Error showing card list:', error);
    message.reply('An error occurred while displaying search results.');
    return false;
  }
}

/**
 * 카드 정보 표시 함수 (카드 이름으로 검색)
 */
async function showCardInfoByName(message, cardName) {
  try {
    if (!cardName || cardName.trim() === '') {
      return message.reply('Please specify a card name to search for. Example: `clu Felix`');
    }
    
    // 카드 검색
    const matchingCards = searchCardByName(cardName);
    
    if (matchingCards.length === 0) {
      return message.reply(`No cards found matching "${cardName}".`);
    }
    
    // 완전히 일치하는 카드 먼저 찾기
    const exactMatch = matchingCards.find(card => 
      card.name.toLowerCase() === cardName.toLowerCase()
    );
    
    // 검색 결과가 하나이거나 완전히 일치하는 카드가 있고 총 결과가 2개 이하일 경우에만 바로 상세 정보 표시
    if (matchingCards.length === 1 || (exactMatch && matchingCards.length <= 2)) {
      // 보여줄 카드 (완전 일치 또는 첫 번째 일치 카드)
      const card = exactMatch || matchingCards[0];
      const cardId = card.id || card.cardId;
      const userId = message.author.id;
      
      // 위시리스트 상태 확인 - 카드 이름과 시리즈 이름으로 확인
      const { isUserInWishlist } = require('../database/wishlistDatabase');
      const isInWishlist = isUserInWishlist(userId, card.name, card.series);
      
      // 카드 정보 페이지 생성 (기본 정보 탭)
      const { createCardInfoPage } = require('./cardInfoPages');
      const { embed, attachment } = await createCardInfoPage(card, message.author.id);
      
      // 탐색 버튼 생성
      const navigationRow = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`card_page_info_${cardId}`)
          .setLabel('Information')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(true), // info 페이지가 초기 페이지이므로 비활성화
        new ButtonBuilder()
          .setCustomId(`card_page_ranking_${cardId}`)
          .setLabel('Rankings')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(false),
        new ButtonBuilder()
          .setCustomId(`card_page_variants_${cardId}`)
          .setLabel('Variants')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(false),
        new ButtonBuilder()
          .setCustomId(`card_page_series_${cardId}`)
          .setLabel('Series')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(false)
      );

      // 위시리스트 버튼 (두 번째 줄)
      const wishlistRow = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`wishlist_toggle_${cardId}_${encodeURIComponent(card.name)}`)
          .setLabel(isInWishlist ? '❤️ Wishlist' : '🤍 Wishlist')
          .setStyle(isInWishlist ? ButtonStyle.Danger : ButtonStyle.Secondary)
          .setDisabled(false)
      );
            
      // 메시지 전송
      const sentMessage = await message.reply({ 
        embeds: [embed], 
        files: [attachment],
        components: [navigationRow, wishlistRow]
      });
      
      // 활성 뷰 등록
      const { registerActiveCardView } = require('../utils/activeViews');
      const expiresAt = Date.now() + (2 * 60 * 1000); // 2분
      
      registerActiveCardView(
        message.channel.id,
        sentMessage.id,
        message.author.id,
        cardName,
        [card], // 현재 페이지 카드
        [card], // 전체 카드 (단일 카드)
        expiresAt
      );
      
      // 추가: 2분 후 자동 비활성화 타이머 설정
      const { disableCardButtons } = require('../interactions/buttonHandlers');
      setTimeout(() => {
        disableCardButtons(message.channel, sentMessage.id);
      }, 2 * 60 * 1000);
      
      return true;
    } else {
      // 검색 결과가 여러 개인 경우 리스트 표시
      return showCardListByName(message, cardName, matchingCards);
    }
  } catch (error) {
    console.error('Error showing card info:', error);
    message.reply('An error occurred while getting card information.');
    return false;
  }
}

/**
 * 카드 정보를 표시하고 기존 메시지를 업데이트
 */
async function replaceWithCardInfo(channel, messageId, cardName, interactingUserId = null) {
  try {
    if (!cardName || cardName.trim() === '') {
      return channel.send('Please specify a card name to search for.');
    }
    
    // 카드 검색
    const matchingCards = searchCardByName(cardName);
    
    if (matchingCards.length === 0) {
      return channel.send(`No cards found matching "${cardName}".`);
    }
    
    // 완전히 일치하는 카드 먼저 찾기
    const exactMatch = matchingCards.find(card => 
      card.name.toLowerCase() === cardName.toLowerCase()
    );
    
    // 보여줄 카드 (완전 일치 또는 첫 번째 일치 카드)
    const card = exactMatch || matchingCards[0];
    const cardId = card.id || card.cardId;
    
    // 카드 정보 생성
    const { createCardInfoPage } = require('./cardInfoPages');
    const { embed, attachment } = await createCardInfoPage(card);

    // 메시지를 먼저 가져와서 원 작성자의 ID를 알아내기
    let message;
    let userId = interactingUserId || 'unknown';
    try {
      message = await channel.messages.fetch(messageId);
      if (message && !interactingUserId) {
        // interactingUserId가 제공되지 않은 경우에만 메시지 작성자 ID 사용
        userId = message.author.id;
      }
    } catch (error) {
      console.error('Error fetching message:', error);
    }

    // 위시리스트 상태 확인 - 카드 이름과 시리즈 이름을 사용
    const isInWishlist = isUserInWishlist(userId, card.name, card.series);
    
    // 임베드 푸터 업데이트
    embed.setFooter({ text: isInWishlist ? '❤️ This card is in your wishlist' : '🤍 Add this card to your wishlist' });
    
    // 탐색 버튼 생성
    const navigationRow = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`card_page_info_${cardId}`)
          .setLabel('Information')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(true), // info 페이지가 초기 페이지이므로 비활성화
        new ButtonBuilder()
          .setCustomId(`card_page_ranking_${cardId}`)
          .setLabel('Rankings')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(false),
        new ButtonBuilder()
          .setCustomId(`card_page_variants_${cardId}`)
          .setLabel('Variants')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(false),
        new ButtonBuilder()
          .setCustomId(`card_page_series_${cardId}`)
          .setLabel('Series')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(false)
      );

    // 위시리스트 버튼 (두 번째 줄)
    const wishlistRow = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`wishlist_toggle_${cardId}_${encodeURIComponent(card.name)}`)
          .setLabel(isInWishlist ? '❤️ Wishlist' : '🤍 Wishlist')
          .setStyle(isInWishlist ? ButtonStyle.Danger : ButtonStyle.Secondary)
          .setDisabled(false)
      );
    
    // 기존 메시지 업데이트
    try {
        if (!message) {
          message = await channel.messages.fetch(messageId);
        }
        await message.edit({ 
          embeds: [embed], 
          files: [attachment], 
          components: [navigationRow, wishlistRow]
        });
      
      // 활성 뷰 등록
      const { registerActiveCardView } = require('../utils/activeViews');
      const expiresAt = Date.now() + (2 * 60 * 1000); // 2분
      
      registerActiveCardView(
        channel.id,
        messageId,
        userId, // 상호작용하는 사용자 ID 사용
        cardName,
        [card], // 현재 페이지 카드
        [card], // 전체 카드 (단일 카드)
        expiresAt
      );
      
      // 추가: 2분 후 자동 비활성화 타이머 설정
      const { disableCardButtons } = require('../interactions/buttonHandlers');
      setTimeout(() => {
        disableCardButtons(channel, messageId);
      }, 2 * 60 * 1000);
      
      return true;
    } catch (editError) {
      console.error('Error updating message with card info:', editError);
      // 메시지를 업데이트할 수 없으면 새 메시지 전송
      const sentMessage = await channel.send({ 
        embeds: [embed], 
        files: [attachment],
        components: [navigationRow, wishlistRow]
      });
      
      // 활성 뷰 등록 (새 메시지로)
      const { registerActiveCardView } = require('../utils/activeViews');
      const expiresAt = Date.now() + (2 * 60 * 1000); // 2분
      
      registerActiveCardView(
        channel.id,
        sentMessage.id,
        userId, // 상호작용하는 사용자 ID 사용
        cardName,
        [card], // 현재 페이지 카드
        [card], // 전체 카드 (단일 카드)
        expiresAt
      );
      
      // 추가: 2분 후 자동 비활성화 타이머 설정
      const { disableCardButtons } = require('../interactions/buttonHandlers');
      setTimeout(() => {
        disableCardButtons(channel, sentMessage.id);
      }, 2 * 60 * 1000);
      
      return false;
    }
  } catch (error) {
    console.error('Error replacing with card info:', error);
    await channel.send('An error occurred while getting card information.');
    return false;
  }
}

/**
 * 특정 카드 정보로 메시지 업데이트
 */
async function replaceWithSpecificCardInfo(channel, messageId, cardName, series = null, interactingUserId = null) {
  try {
    if (!cardName || cardName.trim() === '') {
      return channel.send('Please specify a card name to search for.');
    }
    
    // 카드 검색
    const matchingCards = searchCardByName(cardName);
    
    if (matchingCards.length === 0) {
      return channel.send(`No cards found matching "${cardName}".`);
    }
    
    // 특정 시리즈의 카드만 찾기 (시리즈가 제공된 경우)
    let card;
    if (series) {
      card = matchingCards.find(c => 
        c.name.toLowerCase() === cardName.toLowerCase() && 
        c.series && c.series.toLowerCase() === series.toLowerCase()
      );
    } else {
      // 시리즈가 제공되지 않은 경우 완전히 일치하는 첫 번째 카드 사용
      card = matchingCards.find(c => 
        c.name.toLowerCase() === cardName.toLowerCase()
      ) || matchingCards[0];
    }
    
    const cardId = card.id || card.cardId;
    
    // 메시지를 먼저 가져와서 원 작성자의 ID를 알아내기
    let message;
    let userId = interactingUserId || 'unknown';
    try {
      message = await channel.messages.fetch(messageId);
      if (message && !interactingUserId) {
        // interactingUserId가 제공되지 않은 경우에만 메시지 작성자 ID 사용
        userId = message.author.id;
      }
    } catch (error) {
      console.error('Error fetching message:', error);
    }
    
    // 위시리스트 상태 확인 - 카드 이름과 시리즈 이름 사용
    const isInWishlist = isUserInWishlist(userId, card.name, card.series);
    
    // 카드 정보 페이지 생성
    const { createCardInfoPage } = require('./cardInfoPages');
    const { embed, attachment } = await createCardInfoPage(card);
    
    // 임베드 푸터 업데이트
    embed.setFooter({ text: isInWishlist ? '❤️ This card is in your wishlist' : '🤍 Add this card to your wishlist' });
    
    // 네비게이션 버튼 생성
    const navigationRow = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`card_page_info_${cardId}`)
          .setLabel('Information')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(true), // info 페이지가 초기 페이지이므로 비활성화
        new ButtonBuilder()
          .setCustomId(`card_page_ranking_${cardId}`)
          .setLabel('Rankings')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(false),
        new ButtonBuilder()
          .setCustomId(`card_page_variants_${cardId}`)
          .setLabel('Variants')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(false),
        new ButtonBuilder()
          .setCustomId(`card_page_series_${cardId}`)
          .setLabel('Series')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(false)
      );

    // 위시리스트 버튼 (두 번째 줄)
    const wishlistRow = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`wishlist_toggle_${cardId}_${encodeURIComponent(card.name)}`)
          .setLabel(isInWishlist ? '❤️ Wishlist' : '🤍 Wishlist')
          .setStyle(isInWishlist ? ButtonStyle.Danger : ButtonStyle.Secondary)
          .setDisabled(false)
      );
    
    // 기존 메시지 업데이트
    try {
      if (!message) {
        message = await channel.messages.fetch(messageId);
      }
      await message.edit({ 
        embeds: [embed], 
        files: [attachment], 
        components: [navigationRow, wishlistRow]
      });
      
      // 활성 뷰 등록
      const { registerActiveCardView } = require('../utils/activeViews');
      const expiresAt = Date.now() + (2 * 60 * 1000); // 2분
      
      registerActiveCardView(
        channel.id,
        messageId,
        userId, // 상호작용하는 사용자 ID 사용
        cardName,
        [card], // 현재 페이지 카드
        matchingCards, // 전체 검색 결과
        expiresAt
      );
      
      // 추가: 2분 후 자동 비활성화 타이머 설정
      const { disableCardButtons } = require('../interactions/buttonHandlers');
      setTimeout(() => {
        disableCardButtons(channel, messageId);
      }, 2 * 60 * 1000);
      
      return true;
    } catch (editError) {
      console.error('Error updating message with card info:', editError);
      // 메시지를 업데이트할 수 없으면 새 메시지 전송
      const sentMessage = await channel.send({ 
        embeds: [embed], 
        files: [attachment],
        components: [navigationRow, wishlistRow]
      });
      
      // 활성 뷰 등록 (새 메시지로)
      const { registerActiveCardView } = require('../utils/activeViews');
      const expiresAt = Date.now() + (2 * 60 * 1000); // 2분
      
      registerActiveCardView(
        channel.id,
        sentMessage.id,
        userId, // 상호작용하는 사용자 ID 사용
        cardName,
        [card], // 현재 페이지 카드
        matchingCards, // 전체 검색 결과
        expiresAt
      );
      
      // 추가: 2분 후 자동 비활성화 타이머 설정
      const { disableCardButtons } = require('../interactions/buttonHandlers');
      setTimeout(() => {
        disableCardButtons(channel, sentMessage.id);
      }, 2 * 60 * 1000);
      
      return false;
    }
  } catch (error) {
    console.error('Error replacing with specific card info:', error);
    await channel.send('An error occurred while getting card information.');
    return false;
  }
}

module.exports = {
  searchCardByName,
  showCardInfoByName,
  showCardListByName,
  replaceWithCardInfo,
  replaceWithSpecificCardInfo
};