// src/commands/showCollection.js
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { initUserData } = require('../database/userData');
const { config } = require('../../config');

// 유저 카드 컬렉션 보기
async function showCollection(message, targetUserIdOrMention = null, page = 1) {
  // 대상 사용자 ID 처리 - 멘션이 있는 경우 해당 사용자의 ID 추출
  let targetUserId = message.author.id; // 기본값은 메시지 작성자
  
  if (targetUserIdOrMention) {
    // @멘션에서 ID 추출 (<@123456789> 형식)
    const mentionMatch = targetUserIdOrMention.match(/<@!?(\d+)>/);
    if (mentionMatch) {
      targetUserId = mentionMatch[1];
    } else if (/^\d+$/.test(targetUserIdOrMention)) {
      // 숫자 ID가 직접 입력된 경우
      targetUserId = targetUserIdOrMention;
    }
  }
  
  // 대상 사용자의 데이터 가져오기
  const user = initUserData(targetUserId);
  const isOwnCollection = targetUserId === message.author.id;
  
  // 카드가 없는 경우 처리
  if (user.cards.length === 0) {
    const noCardsMessage = isOwnCollection ? 
      'You do not have any cards in your collection yet.' : 
      'This user does not have any cards in their collection yet.';
    message.reply(noCardsMessage);
    return;
  }
  
  // 카드 목록 생성 (최신 획득 순)
  const sortedCards = [...user.cards].sort((a, b) => b.obtainedAt - a.obtainedAt);
  
  // 페이지네이션 설정
  const cardsPerPage = 15;
  const totalPages = Math.ceil(sortedCards.length / cardsPerPage);
  
  // 페이지 번호 유효성 검사
  if (page < 1) page = 1;
  if (page > totalPages) page = totalPages;
  
  // 현재 페이지의 카드들
  const startIndex = (page - 1) * cardsPerPage;
  const endIndex = Math.min(startIndex + cardsPerPage, sortedCards.length);
  const cardsToShow = sortedCards.slice(startIndex, endIndex);
  
  // 변형별 이모지 매핑 업데이트
  const variantEmoji = {
    'v1': '🔵', 
    'v2': '🟢',
    'v3': '🟣',
    'sparkle': '✨',
    'holo': '🌈',
    'rainbow': '🔮'
  };
  
  // 스킬 타입별 이모지 매핑
  const skillEmoji = {
    'mining': '⛏️',
    'fishing': '🎣',
    'battle': '⚔️',
    'building': '🏗️',
    'farming': '🌾',
    'crafting': '🔨',
    'excavation': '🔍',
    'researching': '📚',
    'gathering': '🧺'
  };
  
  // 컬렉션 소유자 표시
  let collectionOwner = isOwnCollection ? 
    message.author.username.toUpperCase() : 
    (message.guild ? message.guild.members.cache.get(targetUserId)?.user.username : "USER") || "USER";
  
  // 컬렉션 표시를 위한 문자열 생성
  let description = `**${collectionOwner}'S COLLECTION**\n`;
  
  // 카드 정보를 간결한 형식으로 추가
  cardsToShow.forEach((card, index) => {
    const cardNumber = index + 1;
    
    // 변형 이모지 선택
    const varEmoji = variantEmoji[card.variant] || '⚪';
    const skillEmj = skillEmoji[card.skillType] || '❓';
    
    // 카드 ID (전체 ID)
    const cardId = card.uniqueId;
    
    // 자원 카드인 경우 시리즈를 "Resource"로 표시
    const seriesName = (card.type === 'resource') ? "Resource" : (card.series || 'Unknown');
    
    // 카드 정보 라인 추가 (변형 이모지를 맨 앞에 표시)
    description += `**${cardNumber}.** ${varEmoji} • \`${cardId}\` • ${skillEmj} • \`G•${card.gValue || '???'}\` • ${card.name} • *${seriesName}*\n`;
  });
  
  // 페이지 정보 추가
  description += `\nPage: ${page}/${totalPages} | Total cards: ${user.cards.length}`;
  
  // 다른 사용자 컬렉션 보는 경우 안내 추가
  if (!isOwnCollection) {
    description += `\n\n*Viewing ${collectionOwner}'s collection. Type a number (1-${cardsToShow.length}) to view card details.*`;
  } else {
    description += `\n\n*Type a number (1-${cardsToShow.length}) to view card details.*`;
  }
  
  // 임베드 생성
  const embed = new EmbedBuilder()
    .setDescription(description)
    .setColor('#303136');
  
  // 페이지네이션 버튼 생성
  const row = new ActionRowBuilder()
  .addComponents(
    new ButtonBuilder()
      .setCustomId(`cc_first_${targetUserId}_${page}_${message.author.id}`) // 마지막에 메시지 작성자 ID 추가
      .setLabel('«')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(page === 1),
    new ButtonBuilder()
      .setCustomId(`cc_prev_${targetUserId}_${page}_${message.author.id}`)
      .setLabel('‹')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(page === 1),
    new ButtonBuilder()
      .setCustomId(`cc_next_${targetUserId}_${page}_${message.author.id}`)
      .setLabel('›')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(page === totalPages),
    new ButtonBuilder()
      .setCustomId(`cc_last_${targetUserId}_${page}_${message.author.id}`)
      .setLabel('»')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(page === totalPages)
  );
  
  // 정렬 메뉴 추가 (자신의 컬렉션인 경우에만)
  let components = [row];
  if (isOwnCollection) {
    const sortRow = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`cc_sort_${targetUserId}`)
          .setLabel('Sort by')
          .setStyle(ButtonStyle.Secondary)
      );
    components.push(sortRow);
  }
  
  // 네비게이션 버튼 추가
  const navigationRow = new ActionRowBuilder()
  .addComponents(
    new ButtonBuilder()
      .setCustomId(`nav_profile_${targetUserId}_${message.author.id}`)
      .setLabel('Profile')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`nav_inventory_${targetUserId}_${message.author.id}`)
      .setLabel('Inventory')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`nav_collection_${targetUserId}_${message.author.id}`)
      .setLabel('Collection')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(true)
  );
  
  // 네비게이션 버튼을 components 배열에 추가
  components.push(navigationRow);
  
  // 메시지 전송
  const response = await message.reply({ 
    embeds: [embed], 
    components: components 
  });
  
  // 활성 컬렉션 뷰 등록 (숫자 입력으로 카드 보기 기능 위함)
  const { registerActiveCollectionView } = require('../utils/activeViews');
  registerActiveCollectionView(
    message.channel.id,
    response.id,
    message.author.id,
    targetUserId,
    cardsToShow,
    Date.now() + (config.CC_REMAINING_TIME * 1000)
  );
  
  // 120초 후 버튼 비활성화
  setTimeout(async () => {
    try {
      const disabledRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`cc_first_${targetUserId}_${page}`)
            .setLabel('«')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(true),
          new ButtonBuilder()
            .setCustomId(`cc_prev_${targetUserId}_${page}`)
            .setLabel('‹')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(true),
          new ButtonBuilder()
            .setCustomId(`cc_next_${targetUserId}_${page}`)
            .setLabel('›')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(true),
          new ButtonBuilder()
            .setCustomId(`cc_last_${targetUserId}_${page}`)
            .setLabel('»')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(true)
        );
      
      let disabledComponents = [disabledRow];
      if (isOwnCollection) {
        const disabledSortRow = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`cc_sort_${targetUserId}`)
              .setLabel('Sort by')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true)
          );
        disabledComponents.push(disabledSortRow);
      }
      
      // 네비게이션 버튼도 비활성화
      const disabledNavRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`nav_profile_${targetUserId}_${message.author.id}`) // 요청자 ID 추가
            .setLabel('Profile')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
          new ButtonBuilder()
            .setCustomId(`nav_inventory_${targetUserId}_${message.author.id}`) // 요청자 ID 추가
            .setLabel('Inventory')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
          new ButtonBuilder()
            .setCustomId(`nav_collection_${targetUserId}_${message.author.id}`) // 요청자 ID 추가
            .setLabel('Collection')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(true)
        );
      
      // 비활성화된 모든 버튼 행 포함
      disabledComponents.push(disabledNavRow);
      
      await response.edit({ 
        embeds: [embed], 
        components: disabledComponents 
      });
      
      // 활성 컬렉션 뷰 제거
      const { removeActiveCollectionView } = require('../utils/activeViews');
      removeActiveCollectionView(message.channel.id);
      
    } catch (error) {
      console.error('Error disabling collection buttons:', error);
    }
  }, config.CC_REMAINING_TIME * 1000);
}

// 컬렉션 페이지 업데이트 함수 (버튼 클릭 시 호출)
async function updateCollectionPage(interaction, targetUserId, newPage) {
  try {
    // 호출자 ID 확인
    const callerId = interaction.user.id;
    const isOwnCollection = callerId === targetUserId;
    
    const user = initUserData(targetUserId);
    
    // 카드 목록 생성 (최신 획득 순)
    const sortedCards = [...user.cards].sort((a, b) => b.obtainedAt - a.obtainedAt);
    
    // 페이지네이션 설정
    const cardsPerPage = 15;
    const totalPages = Math.ceil(sortedCards.length / cardsPerPage);
    
    // 페이지 번호 유효성 검사
    if (newPage < 1) newPage = 1;
    if (newPage > totalPages) newPage = totalPages;
    
    // 현재 페이지의 카드들
    const startIndex = (newPage - 1) * cardsPerPage;
    const endIndex = Math.min(startIndex + cardsPerPage, sortedCards.length);
    const cardsToShow = sortedCards.slice(startIndex, endIndex);
    
    // 변형별 이모지 매핑 업데이트
    const variantEmoji = {
      'v1': '🔵', 
      'v2': '🟢',
      'v3': '🟣',
      'sparkle': '✨',
      'holo': '🌈',
      'rainbow': '🔮'
    };
    
    // 스킬 타입별 이모지 매핑
    const skillEmoji = {
      'mining': '⛏️',
      'fishing': '🎣',
      'battle': '⚔️',
      'building': '🏗️',
      'farming': '🌾',
      'crafting': '🔨',
      'excavation': '🔍',
      'researching': '📚',
      'gathering': '🧺'
    };
    
    // 컬렉션 소유자 이름 가져오기
    let collectionOwner = isOwnCollection ? 
      interaction.user.username.toUpperCase() : 
      (interaction.guild ? interaction.guild.members.cache.get(targetUserId)?.user.username : "USER") || "USER";
    
    // 컬렉션 표시를 위한 문자열 생성
    let description = `**${collectionOwner}'S COLLECTION**\n`;
    
    // 카드 정보를 간결한 형식으로 추가
    cardsToShow.forEach((card, index) => {
      const cardNumber = index + 1;
      
      // 변형 이모지 선택
      const varEmoji = variantEmoji[card.variant] || '⚪';
      const skillEmj = skillEmoji[card.skillType] || '❓';
      
      // 카드 ID (전체 ID)
      const cardId = card.uniqueId;
      
      // 자원 카드인 경우 시리즈를 "Resource"로 표시
      const seriesName = (card.type === 'resource') ? "Resource" : (card.series || 'Unknown');
      
      // 카드 정보 라인 추가 (변형 이모지를 맨 앞에 표시)
      description += `**${cardNumber}.** ${varEmoji} • \`${cardId}\` • ${skillEmj} • \`G•${card.gValue || '???'}\` • ${card.name} • *${seriesName}*\n`;
    });
    
    // 페이지 정보 추가
    description += `\nPage: ${newPage}/${totalPages} | Total cards: ${user.cards.length}`;
    
    // 다른 사용자 컬렉션 보는 경우 안내 추가
    if (!isOwnCollection) {
      description += `\n\n*Viewing ${collectionOwner}'s collection. Type a number (1-${cardsToShow.length}) to view card details.*`;
    } else {
      description += `\n\n*Type a number (1-${cardsToShow.length}) to view card details.*`;
    }
    
    // 임베드 생성
    const embed = new EmbedBuilder()
      .setDescription(description)
      .setColor('#303136');
    
    // 새 버튼 로우 생성
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`cc_first_${targetUserId}_${newPage}_${interaction.user.id}`) // 사용자 ID 추가
          .setLabel('«')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(newPage === 1),
        new ButtonBuilder()
          .setCustomId(`cc_prev_${targetUserId}_${newPage}_${interaction.user.id}`) // 사용자 ID 추가
          .setLabel('‹')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(newPage === 1),
        new ButtonBuilder()
          .setCustomId(`cc_next_${targetUserId}_${newPage}_${interaction.user.id}`) // 사용자 ID 추가
          .setLabel('›')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(newPage === totalPages),
        new ButtonBuilder()
          .setCustomId(`cc_last_${targetUserId}_${newPage}_${interaction.user.id}`) // 사용자 ID 추가
          .setLabel('»')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(newPage === totalPages)
      );
    
    // 정렬 메뉴 유지 (자신의 컬렉션인 경우에만)
    let components = [row];
    if (isOwnCollection) {
      const sortRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`cc_sort_${targetUserId}`)
            .setLabel('Sort by')
            .setStyle(ButtonStyle.Secondary)
        );
      components.push(sortRow);
    }
    
    // 네비게이션 버튼 추가
    const navigationRow = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`nav_profile_${targetUserId}_${interaction.user.id}`)
          .setLabel('Profile')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`nav_inventory_${targetUserId}_${interaction.user.id}`)
          .setLabel('Inventory')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`nav_collection_${targetUserId}_${interaction.user.id}`)
          .setLabel('Collection')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(true)
      );
    
    // 네비게이션 버튼을 components 배열에 추가
    components.push(navigationRow);
    
    // 활성 컬렉션 뷰 업데이트
    const { updateActiveCollectionView } = require('../utils/activeViews');
    updateActiveCollectionView(
      interaction.channel.id,
      interaction.message.id,
      interaction.user.id,
      targetUserId,
      cardsToShow,
      Date.now() + (config.CC_REMAINING_TIME * 1000)
    );
    
    // 인터랙션 응답
    await interaction.update({ 
      embeds: [embed], 
      components: components 
    });
  } catch (error) {
    console.error('Error updating collection page:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ 
        content: 'There was an error updating the collection page.', 
        ephemeral: true 
      });
    }
  }
}

module.exports = {
  showCollection,
  updateCollectionPage
};