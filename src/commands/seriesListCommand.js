// src/commands/seriesListCommand.js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getAllSeries, getSeriesByName, getCollectionStatus } = require('../database/cardSeries');
const { getSeriesOwnerRankingCached } = require('../database/cardStats');
const { registerActiveSeriesView } = require('../utils/activeViews');

/**
 * 시리즈 정보 임베드 생성 함수
 * @param {string} seriesName - 시리즈 이름
 * @param {string} userId - 사용자 ID
 * @param {number} page - 페이지 번호 (0부터 시작)
 * @param {Object} options - 추가 옵션 (customTitle, highlightCardId 등)
 * @returns {Object} - 생성된 임베드, 버튼, 상태 정보 객체
 */
async function createSeriesEmbed(seriesName, userId, page = 0, options = {}) {
  const { customTitle, highlightCardId, showButtons = true } = options;
  
  const series = getSeriesByName(seriesName);
  
  if (!series) {
    return {
      error: true,
      message: `No series found with name "${seriesName}".`
    };
  }
  
  // 사용자의 수집 현황 가져오기
  const collectionStatus = getCollectionStatus(series.name, userId);
  
  // 시리즈 ID 준비
  const seriesId = series.id || series.name.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, '');
  
  // 시리즈 컬렉터 랭킹 가져오기
  const collectorRanking = getSeriesOwnerRankingCached(seriesId);
  
  // 위시리스트 상태 확인 (추가)
  const { getSeriesWishlistStatus, isUserInWishlist, getWishlistUsers } = require('../database/wishlistDatabase');
  const wishlistStatus = getSeriesWishlistStatus(userId, series.name);
  
  // 랭킹 정보 생성
  let rankingText = '';
  if (collectorRanking.length > 0) {
    rankingText = '**Top Collectors:**\n';
    collectorRanking.slice(0, 5).forEach(([rankUserId, count], index) => {
      rankingText += `${index + 1}. <@${rankUserId}>: ${count} cards\n`;
    });
    
    // 사용자 랭킹 추가
    const userRank = collectorRanking.findIndex(([rankUserId]) => rankUserId === userId);
    if (userRank !== -1 && userRank >= 5) {
      const [, userCount] = collectorRanking[userRank];
      rankingText += `\nYour Rank: #${userRank + 1} (${userCount} cards)`;
    }
  } else {
    rankingText = 'No one has collected cards from this series yet.';
  }
  
  // 각 카드에 위시리스트 수 추가
  const cardsWithWishlist = collectionStatus.cardStatus.map(card => {
    const wishlistUsers = getWishlistUsers(card.name, series.name);
    return {
      ...card,
      wishlistCount: wishlistUsers.length
    };
  });

  // 위시리스트 수에 따라 카드 정렬 (많은 순서대로)
  cardsWithWishlist.sort((a, b) => b.wishlistCount - a.wishlistCount);

  // 시리즈 전체 위시리스트 총합 계산
  const totalWishlistCount = cardsWithWishlist.reduce((sum, card) => sum + card.wishlistCount, 0);
  
  // 페이지네이션 설정
  const pageSize = 10;
  const totalPages = Math.ceil(cardsWithWishlist.length / pageSize);
  const validPage = Math.max(0, Math.min(page, totalPages - 1));
  const startIdx = validPage * pageSize;
  const endIdx = Math.min(startIdx + pageSize, cardsWithWishlist.length);
  const pageCards = cardsWithWishlist.slice(startIdx, endIdx);
  
  // 임베드 제목 설정 (커스텀 제목 또는 기본 제목)
  const title = customTitle || `${series.name} Series`;
  
  // 위시리스트 상태 텍스트 (추가)
  let wishlistText = '';
  if (wishlistStatus.allInWishlist) {
    wishlistText = '❤️ All cards in this series are in your wishlist';
  } else if (wishlistStatus.partiallyInWishlist) {
    wishlistText = `🤍 ${wishlistStatus.count}/${wishlistStatus.total} cards in this series are in your wishlist`;
  } else {
    wishlistText = '🤍 No cards in this series are in your wishlist';
  }
  
  // 임베드 생성
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor('#0099ff')
    .setDescription(`Collection Progress: \`[ ${collectionStatus.collected}/${collectionStatus.total} ]\` cards
Series Wishlist Count: \`[ 🤍 ${totalWishlistCount} ]\` total wishes

${rankingText}

Enter a number (1-${pageCards.length}) to view card details`)
    .setFooter({ text: `Page ${validPage + 1}/${totalPages} • ${wishlistText} • Will expire in 2 minutes` })
    .setTimestamp();
  
  // 카드 정보를 번호와 함께 한 줄로 추가
  let cardList = '';
  pageCards.forEach((card, index) => {
    // 수집 여부에 따라 체크/엑스 이모지 표시
    const icon = card.collected ? '✅' : '❌';
    // 강조 표시할 카드인지 확인
    const isHighlighted = highlightCardId && card.id === highlightCardId;
    const highlight = isHighlighted ? '**' : '';
    const highlightText = isHighlighted ? ' (Current)' : '';
    
    // 사용자 위시리스트 상태에 따라 하트 색상 결정
    const userWishlistIcon = isUserInWishlist(userId, card.name, series.name) ? '❤️' : '🤍';
    // 위시리스트 수가 0이어도 표시
    const wishlistText = `\`[${userWishlistIcon} ${card.wishlistCount} ]\``;
    
    cardList += `**${index + 1}.** ${icon} ${wishlistText} ${highlight}${card.name}${highlight}${highlightText} ${userWishlistIcon}\n`;
  });
  
  embed.addFields({ name: 'Cards', value: cardList });
  
  // 버튼 행 초기화
  let rows = [];
  
  // 페이지 이동 버튼 생성 (요청된 경우만)
  if (showButtons) {
    // 페이지네이션 버튼 행
    const paginationRow = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`series_first:${series.name}:${validPage}`)
          .setLabel('<<')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(validPage === 0),
        new ButtonBuilder()
          .setCustomId(`series_prev:${series.name}:${validPage}`)
          .setLabel('<')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(validPage === 0),
        new ButtonBuilder()
          .setCustomId(`series_next:${series.name}:${validPage}`)
          .setLabel('>')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(validPage === totalPages - 1),
        new ButtonBuilder()
          .setCustomId(`series_last:${series.name}:${validPage}`)
          .setLabel('>>')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(validPage === totalPages - 1)
      );
    
    // 위시리스트 버튼 행 (추가)
    const wishlistRow = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`series_wishlist_toggle:${series.name}`) // 인코딩 제거, 쿼리 파라미터 방식을 사용하지 않음
          .setLabel(wishlistStatus.allInWishlist ? '❤️ Remove All from Wishlist' : '🤍 Add All to Wishlist')
          .setStyle(wishlistStatus.allInWishlist ? ButtonStyle.Danger : ButtonStyle.Secondary)
          .setDisabled(false)
      );
    rows = [paginationRow, wishlistRow];
  }
  
  return {
    embed,
    rows, // rows 배열로 반환
    seriesName: series.name,
    page: validPage,
    totalPages,
    pageCards,
    collectionStatus,
    wishlistStatus  // 위시리스트 상태 추가
  };
}

/**
 * 시리즈 목록 명령어 처리 함수 
 */
async function handleSeriesListCommand(message, seriesOption) {
  // 특정 시리즈를 검색하는 경우
  if (seriesOption) {
    const result = await createSeriesEmbed(seriesOption, message.author.id, 0);
    
    if (result.error) {
      return message.reply(result.message);
    }
    
    // 임베드와 버튼 전송 (수정: rows 배열 사용)
    const reply = await message.reply({ 
      embeds: [result.embed], 
      components: result.rows 
    });
    
    // 활성 시리즈 뷰 등록 (2분 유효)
    const expiresAt = Date.now() + (2 * 60 * 1000);
    registerActiveSeriesView(
      message.channel.id, 
      reply.id, 
      message.author.id, 
      result.seriesName, 
      result.pageCards.map(card => ({ id: card.id, name: card.name, collected: card.collected })),
      expiresAt
    );
    
    // 2분 후 버튼 비활성화 (수정: 여러 행의 버튼 비활성화)
    setTimeout(() => {
      if (result.rows.length > 0) {
        try {
          // 모든 버튼 행을 비활성화
          const disabledRows = result.rows.map(row => {
            const newRow = new ActionRowBuilder();
            
            row.components.forEach(component => {
              newRow.addComponents(
                ButtonBuilder.from(component).setDisabled(true)
              );
            });
            
            return newRow;
          });
          
          reply.edit({ 
            embeds: [
              EmbedBuilder.from(result.embed).setDescription(
                `Collection Progress: **${result.collectionStatus.collected}/${result.collectionStatus.total}** cards\n\n${result.embed.data.description.split('\n\n')[1]}\n\n*This view has expired. Use \`csl ${result.seriesName}\` again to view card details.*`
              )
            ], 
            components: disabledRows 
          }).catch(err => console.error('Failed to disable buttons:', err));
        } catch (error) {
          console.error('Error disabling buttons after timeout:', error);
        }
      }
    }, 2 * 60 * 1000); // 2분
    
    return;
  }
}

module.exports = {
  handleSeriesListCommand,
  createSeriesEmbed  // 함수 내보내기 추가
};