// src/commands/wishlistCommand.js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getUserWishlist, getWishlistUsers } = require('../database/wishlistDatabase');
const { getAllCards, getCardById } = require('../database/cardDatabase');
const { registerActiveView, removeActiveView } = require('../utils/activeViews');

/**
 * 위시리스트 목록 표시 명령어 처리 함수
 * @param {Object} message - 메시지 객체
 * @param {Array} args - 명령어 인수
 */
async function handleWishlistCommand(message, args) {
  try {
    // 멘션된 사용자 확인
    let targetUserId = message.author.id;
    let targetUser = message.author;
    
    // 멘션이 있는 경우 멘션된 사용자로 설정
    if (args.length > 0 && args[0].match(/<@!?(\d+)>/)) {
      const mentionId = args[0].match(/<@!?(\d+)>/)[1];
      
      try {
        targetUser = await message.client.users.fetch(mentionId);
        targetUserId = targetUser.id;
      } catch (error) {
        return message.reply("Could not find the mentioned user.");
      }
    }
    
    // 위시리스트 데이터 가져오기
    const wishlist = getUserWishlist(targetUserId);
    
    if (wishlist.length === 0) {
      const noWishlistMessage = targetUserId === message.author.id ? 
        "You don't have any cards in your wishlist yet. Use the wishlist button when viewing a card to add it." :
        `${targetUser.username} doesn't have any cards in their wishlist yet.`;
      
      return message.reply(noWishlistMessage);
    }
    
    // 위시리스트 카드 정보 가져오기 - cardDatabase 활용하여 정확한 정보 수집
    const enhancedWishlist = await enhanceWishlistData(wishlist);
    
    // 정렬: 위시리스트 수 (인기도) 기준 내림차순
    enhancedWishlist.sort((a, b) => b.wishlistCount - a.wishlistCount);
    
    // 페이지네이션 설정
    const page = 1; // 첫 페이지로 시작
    const itemsPerPage = 10;
    const totalPages = Math.ceil(enhancedWishlist.length / itemsPerPage);
    
    // 현재 페이지의 아이템들
    const displayList = getPageItems(enhancedWishlist, page, itemsPerPage);
    
    // 위시리스트 표시
    await showWishlistPage(message, displayList, page, totalPages, enhancedWishlist.length, enhancedWishlist, targetUser);
    
  } catch (error) {
    console.error('Error handling wishlist command:', error);
    await message.reply('An error occurred while retrieving the wishlist.');
  }
}

/**
 * 위시리스트 데이터 강화 (위시리스트 수와 시리즈 정보 추가)
 * @param {Array} wishlist - 위시리스트 아이템 배열
 * @returns {Array} - 강화된 위시리스트 데이터
 */
async function enhanceWishlistData(wishlist) {
  const allCards = getAllCards();
  
  return Promise.all(wishlist.map(async (item) => {
    const cardName = item.cardName;
    let seriesName = null;
    let card = null;
    
    // cardDatabase에서 카드 정보 찾기
    const matchingCards = allCards.filter(c => 
      c.name && c.name.toLowerCase() === cardName.toLowerCase()
    );
    
    if (matchingCards.length > 0) {
      // 카드 식별자에서 시리즈 이름 추출 시도
      if (item.cardId && item.cardId.includes(':')) {
        const seriesFromId = item.cardId.split(':')[0].replace(/_/g, ' ');
        
        // 추출한 시리즈 이름과 일치하는 카드 찾기
        const exactMatch = matchingCards.find(c => 
          c.series && c.series.toLowerCase() === seriesFromId.toLowerCase()
        );
        
        if (exactMatch) {
          card = exactMatch;
          seriesName = exactMatch.series;
        } else {
          card = matchingCards[0];
          seriesName = matchingCards[0].series;
        }
      } else {
        card = matchingCards[0];
        seriesName = matchingCards[0].series;
      }
    }
    
    // 위시리스트에 있는 사용자 수 가져오기 - 시리즈 이름과 함께 전달
    // 직접 getWishlistUsers 함수 호출하여 위시리스트 수 계산
    const wishlistUsers = getWishlistUsers(cardName, seriesName);
    
    // 반환 객체
    return {
      ...item,
      seriesName,
      card,
      wishlistCount: wishlistUsers.length || 0
    };
  }));
}

/**
 * 페이지에 해당하는 아이템 가져오기
 * @param {Array} items - 전체 아이템 배열
 * @param {number} page - 현재 페이지 번호
 * @param {number} itemsPerPage - 페이지당 아이템 수
 * @returns {Array} - 현재 페이지의 아이템들
 */
function getPageItems(items, page, itemsPerPage) {
  const startIndex = (page - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  return items.slice(startIndex, endIndex);
}

/**
 * 위시리스트 페이지 표시
 * @param {Object} message - 메시지 객체
 * @param {Array} items - 표시할 아이템 배열
 * @param {number} page - 현재 페이지 번호
 * @param {number} totalPages - 전체 페이지 수
 * @param {number} totalItems - 전체 아이템 수
 * @param {Array} allItems - 전체 아이템 목록
 * @param {Object} targetUser - 대상 사용자 객체
 */
async function showWishlistPage(message, items, page, totalPages, totalItems, allItems, targetUser) {
  // 임베드 생성
  const embed = new EmbedBuilder()
    .setTitle(`${targetUser.username}'s Wishlist`)
    .setColor('#FF69B4')
    .setDescription(`${targetUser.username} has ${totalItems} card${totalItems > 1 ? 's' : ''} in their wishlist.\nSorted by popularity (number of users who wishlisted each card).`)
    .setFooter({ text: `Page ${page}/${totalPages} • Type a number (1-${items.length}) to view card details` })
    .setTimestamp();
  
  if (targetUser.displayAvatarURL) {
    embed.setThumbnail(targetUser.displayAvatarURL());
  }
  
  // 카드 목록 표시 - 주어진 포맷으로 수정
  const cardsText = items.map((item, index) => {
    // 시리즈 정보 추가
    const seriesInfo = item.seriesName ? ` - ${item.seriesName}` : '';
    
    // 위시리스트 수를 재계산하여 가장 정확한 값 확보
    const wishlistCount = getWishlistUsers(item.cardName, item.seriesName).length;
    
    return `**${index + 1}.** \`[ 🤍 ${wishlistCount} ]\` **${item.cardName}**${seriesInfo}`;
  }).join('\n');
  
  embed.addFields({ name: 'Cards', value: cardsText || 'No cards' });
  
  // 페이지네이션 버튼 생성
  const paginationRow = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`wl_first_${targetUser.id}_${page}_${message.author.id}`)
        .setLabel('<<')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(page === 1),
      new ButtonBuilder()
        .setCustomId(`wl_prev_${targetUser.id}_${page}_${message.author.id}`)
        .setLabel('<')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(page === 1),
      new ButtonBuilder()
        .setCustomId(`wl_next_${targetUser.id}_${page}_${message.author.id}`)
        .setLabel('>')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(page === totalPages),
      new ButtonBuilder()
        .setCustomId(`wl_last_${targetUser.id}_${page}_${message.author.id}`)
        .setLabel('>>')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(page === totalPages)
    );
  
  // 메시지 전송
  const sentMessage = await message.reply({
    embeds: [embed],
    components: [paginationRow]
  });
  
  // 활성 위시리스트 뷰 등록 - 직접 registerActiveView 사용
  const expiresAt = Date.now() + (2 * 60 * 1000); // 2분 유효
  registerActiveView(
    message.channel.id,
    sentMessage.id,
    message.author.id, // 명령어 사용자 ID
    'wishlist',       // 뷰 타입
    items,            // 현재 페이지 아이템들
    expiresAt,
    {                 // 추가 데이터
      allItems: allItems,
      currentPage: page,
      totalPages: totalPages,
      targetUserId: targetUser.id // 위시리스트 소유자 ID
    }
  );
  
  // 2분 후 자동 비활성화
  setTimeout(() => {
    try {
      // 버튼 비활성화
      const disabledRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`wl_first_expired`)
            .setLabel('<<')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
          new ButtonBuilder()
            .setCustomId(`wl_prev_expired`)
            .setLabel('<')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
          new ButtonBuilder()
            .setCustomId(`wl_next_expired`)
            .setLabel('>')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
          new ButtonBuilder()
            .setCustomId(`wl_last_expired`)
            .setLabel('>>')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true)
        );
      
      sentMessage.edit({ components: [disabledRow] });
      
      // 활성 뷰 제거
      removeActiveView(message.channel.id, sentMessage.id, 'wishlist');
    } catch (error) {
      console.error('Error disabling wishlist buttons after timeout:', error);
    }
  }, 2 * 60 * 1000);
}

module.exports = {
  handleWishlistCommand
};