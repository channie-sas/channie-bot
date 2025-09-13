// src/interactions/buttonHandlers/collectionButtons.js
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

/**
 * 컬렉션/시리즈 관련 버튼 핸들러
 * @param {Object} interaction - 상호작용 객체
 */
async function handleCollectionInteraction(interaction) {
  const customId = interaction.customId;
  
  // 컬렉션 페이지네이션 버튼 처리
  if (customId.startsWith('cc_')) {
    return await handleCollectionPagination(interaction);
  }
  // 시리즈 페이지네이션 버튼 처리
  else if (customId.startsWith('series_')) {
    return await handleSeriesPagination(interaction);
  }
}

/**
 * 컬렉션 페이지네이션 핸들러
 * @param {Object} interaction - 상호작용 객체
 */
async function handleCollectionPagination(interaction) {
  const customId = interaction.customId;
  const parts = customId.split('_');
  const action = parts[1]; // 'first', 'prev', 'next', 'last', 'sort'
  const targetUserId = parts[2];
  const currentPage = parseInt(parts[3] || '1');
  
  // 다른 사용자의 버튼 클릭 방지 추가 - 메시지 요청자만 버튼 클릭 가능
  if (interaction.user.id !== parts[4]) {
    await interaction.reply({ 
      content: 'You can only interact with buttons on messages you requested.',
      ephemeral: true 
    });
    return;
  }
  
  // 정렬 버튼은 자신의 컬렉션에서만 사용 가능
  if (action === 'sort' && targetUserId !== interaction.user.id) {
    await interaction.reply({ content: 'You can only sort your own collection!', ephemeral: true });
    return;
  }
  
  // 페이지 계산
  let newPage = currentPage;
  
  switch (action) {
    case 'first':
      newPage = 1;
      break;
    case 'prev':
      newPage = Math.max(1, currentPage - 1);
      break;
    case 'next':
      newPage = currentPage + 1;
      break;
    case 'last':
      newPage = 9999; // 의도적으로 큰 값 설정
      break;
    case 'sort':
      // 정렬 기능은 나중에 구현
      await interaction.reply({ 
        content: 'Sorting options will be available soon!', 
        ephemeral: true 
      });
      return;
  }
  
  // 페이지 업데이트
  const { updateCollectionPage } = require('../../commands/showCollection');
  await updateCollectionPage(interaction, targetUserId, newPage);
}

/**
 * 시리즈 페이지네이션 핸들러
 * @param {Object} interaction - 상호작용 객체
 */
async function handleSeriesPagination(interaction) {
  const customId = interaction.customId;
  
  try {
    // 버튼 정보 파싱
    const parts = customId.split(':');
    const action = parts[0]; // 'series_first', 'series_prev', 'series_next', 'series_last'
    const seriesName = parts[1];
    const currentPage = parseInt(parts[2]);
    
    console.log(`시리즈 페이지네이션 처리: ${action}, 시리즈: ${seriesName}, 현재 페이지: ${currentPage}`);
    
    // 페이지 계산
    let newPage = currentPage;
    if (action === 'series_first') {
      newPage = 0;
    } else if (action === 'series_prev') {
      newPage = Math.max(0, currentPage - 1);
    } else if (action === 'series_next') {
      newPage = currentPage + 1;
    } else if (action === 'series_last') {
      // 마지막 페이지 계산을 위해 시리즈 정보 필요
      const { getSeriesByName } = require('../../database/cardSeries');
      const series = getSeriesByName(seriesName);
      if (series) {
        const pageSize = 10;
        const totalPages = Math.ceil(series.cards.length / pageSize);
        newPage = totalPages - 1;
      }
    }
    
    console.log(`새 페이지: ${newPage}`);
    
    // 시리즈 정보 페이지 생성 - createSeriesEmbed 함수 사용 (변경)
    const { createSeriesEmbed } = require('../../commands/seriesListCommand');
    const result = await createSeriesEmbed(seriesName, interaction.user.id, newPage);
    
    if (result.error) {
      await interaction.reply({
        content: result.message,
        ephemeral: true
      });
      return;
    }
    
    // 활성 뷰 등록
    const { registerActiveSeriesView, removeActiveSeriesView } = require('../../utils/activeViews');
    
    // 기존 활성 뷰 제거
    removeActiveSeriesView(interaction.channel.id);
    
    // 새로운 활성 뷰 등록 (2분 유효)
    const expiresAt = Date.now() + (2 * 60 * 1000);
    registerActiveSeriesView(
      interaction.channel.id, 
      interaction.message.id, 
      interaction.user.id, 
      result.seriesName, 
      result.pageCards.map(card => ({ id: card.id, name: card.name, collected: card.collected })),
      expiresAt
    );
    
    // 메시지 업데이트 - rows 배열 사용 (변경)
    await interaction.update({ 
      embeds: [result.embed], 
      components: result.rows // 중요: rows 배열 사용
    });
    
  } catch (error) {
    console.error('Error handling series pagination:', error);
    console.error('Error stack:', error.stack);
    await interaction.reply({ 
      content: 'An error occurred while navigating series pages.', 
      ephemeral: true 
    });
  }
}

module.exports = {
  handleCollectionInteraction
};