// src/interactions/buttonHandlers/navigationButtons.js
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { refreshTimer } = require('../../utils/activeViews');
const { initUserData } = require('../../database/userData');
const { getUserInventory } = require('../../database/inventoryModel');
const { ITEM_DISPLAY_NAMES } = require('../../database/itemTypes');

/**
 * 네비게이션 버튼 핸들러
 * @param {Object} interaction - 상호작용 객체
 */
async function handleNavigationInteraction(interaction) {
  const customId = interaction.customId;
  
  if (customId.startsWith('nav_')) {
    try {
      const parts = customId.split('_');
      const navType = parts[1]; // 'profile', 'inventory', 'collection'
      const targetUserId = parts[2];
      const requesterId = parts[3]; // 요청자 ID
  
      // 요청자 ID가 지정되어 있지 않거나 현재 사용자와 다른 경우 접근 거부
      if (!requesterId || requesterId !== interaction.user.id) {
        await interaction.reply({
          content: 'You can only interact with buttons on messages you requested.',
          ephemeral: true
        });
        return;
      }
      
      // 메시지 업데이트를 위해 응답 지연
      await interaction.deferUpdate();
      
      // 네비게이션 유형에 따라 임베드와 버튼 생성
      if (navType === 'profile') {
        await handleProfileNavigation(interaction, targetUserId);
      }
      else if (navType === 'inventory') {
        await handleInventoryNavigation(interaction, targetUserId);
      } 
      else if (navType === 'collection') {
        await handleCollectionNavigation(interaction, targetUserId);
      }
      // 'town' 네비게이션 처리 완전 제거
      
    } catch (error) {
        console.error('Error handling navigation button:', error);
        console.error('Error stack:', error.stack);
        console.error('Navigation type:', parts[1] || 'undefined');
        console.error('Target user ID:', targetUserId);
        console.error('Interaction channel ID:', interaction.channelId);
        try {
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
              content: 'An error occurred while navigating to the requested page.',
              ephemeral: true
            });
          } else {
            await interaction.followUp({
              content: 'An error occurred while navigating to the requested page.',
              ephemeral: true
            });
          }
        } catch (replyError) {
          console.error('Error sending error message:', replyError);
        }
      }
  }
}

/**
 * 프로필 네비게이션 처리
 * @param {Object} interaction - 상호작용 객체
 * @param {string} targetUserId - 타겟 사용자 ID
 */
async function handleProfileNavigation(interaction, targetUserId) {
  // 프로필 데이터 가져오기
  const targetUser = await interaction.client.users.fetch(targetUserId);
  const member = await interaction.guild.members.fetch(targetUserId);
  
  // 프로필 임베드 직접 생성
  const userData = initUserData(targetUserId);
  const profile = userData.profile || {
    level: 1,
    exp: 0,
    maxExp: 100,
    lastActive: Date.now(),
    titles: [],
    customInfo: {}
  };
  
  // 경험치 바 생성
  const expBarLength = 10;
  const expProgress = Math.floor((profile.exp / profile.maxExp) * expBarLength);
  const expBar = '█'.repeat(expProgress) + '░'.repeat(expBarLength - expProgress);
  
  // 기본 정보
  const serverJoinDate = new Date(member.joinedTimestamp).toLocaleDateString();
  const discordJoinDate = new Date(targetUser.createdTimestamp).toLocaleDateString();
  const lastActiveDate = new Date(profile.lastActive).toLocaleDateString();
  
  // 보유 칭호 목록 (시스템 칭호 확인)
  const { loadSystemTitles } = require('../../commands/adminCommands');
  const systemTitles = loadSystemTitles();

  // 유저가 가진 칭호 중 시스템에 있는 칭호만 표시
  const validTitles = profile.titles && profile.titles.length > 0 
    ? profile.titles.filter(title => systemTitles.titles.includes(title))
    : [];

  const titles = validTitles.length > 0 
    ? validTitles.join(', ') 
    : 'No titles yet';
  
  // 커스텀 정보
  const customInfo = profile.customInfo || {};
  
  const age = customInfo.age || 'Use `cpf edit a (age)` to set your age';
  const pronoun = customInfo.pronoun || 'Use `cpf edit p (pronoun)` to set your pronoun';
  const mbti = customInfo.mbti || 'Use `cpf edit m (mbti)` to set your MBTI';
  const zodiac = customInfo.zodiac || 'Use `cpf edit z (zodiac)` to set your zodiac sign';
  const collectingSeries = customInfo.collectingSeries || 'Use `cpf edit c (series)` to set your collecting series';
  const hobby = customInfo.hobby || 'Use `cpf edit h (hobby)` to set your hobby';
  const bio = customInfo.bio || 'Use `cpf edit b (bio)` to set your bio';
  
  // 임베드 생성
  const embed = new EmbedBuilder()
    .setTitle(`${targetUser.username}'s Profile`)
    .setColor('#0099ff')
    .setThumbnail(targetUser.displayAvatarURL())
    .addFields(
      { name: 'Server', value: member.guild.name, inline: true },
      { name: 'Level', value: `${profile.level}`, inline: true },
      { name: 'Experience', value: `${profile.exp}/${profile.maxExp}\n${expBar}`, inline: true },
      { name: 'Joined Discord', value: discordJoinDate, inline: true },
      { name: 'Joined Server', value: serverJoinDate, inline: true },
      { name: 'Last Active', value: lastActiveDate, inline: true },
      { name: 'Titles', value: titles },
      { name: '📋 Custom Information', value: '───────────────────────' },
      { name: 'Age', value: age, inline: true },
      { name: 'Pronoun', value: pronoun, inline: true },
      { name: 'MBTI', value: mbti, inline: true },
      { name: 'Zodiac', value: zodiac, inline: true },
      { name: 'Collecting Series', value: collectingSeries, inline: true },
      { name: 'Hobby', value: hobby, inline: true },
      { name: 'Bio', value: bio }
    )
    .setFooter({ text: 'Use cpf edit to customize your profile' })
    .setTimestamp();
    
  // 네비게이션 버튼 생성 (Town 버튼 제거)
  const navigationRow = new ActionRowBuilder()
    .addComponents(
        new ButtonBuilder()
        .setCustomId(`nav_profile_${targetUserId}_${interaction.user.id}`)
        .setLabel('Profile')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(true), // 현재 프로필 보는 중이므로 비활성화
        new ButtonBuilder()
        .setCustomId(`nav_inventory_${targetUserId}_${interaction.user.id}`)
        .setLabel('Inventory')
        .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
        .setCustomId(`nav_collection_${targetUserId}_${interaction.user.id}`)
        .setLabel('Collection')
        .setStyle(ButtonStyle.Secondary)
    );
  
  // 메시지 업데이트
  await interaction.editReply({
    embeds: [embed],
    components: [navigationRow]
  });
  
  // 타이머 갱신
  refreshTimer(interaction.channelId, interaction.message.id, 2 * 60 * 1000);
}

/**
 * 인벤토리 네비게이션 처리
 * @param {Object} interaction - 상호작용 객체
 * @param {string} targetUserId - 타겟 사용자 ID
 */
async function handleInventoryNavigation(interaction, targetUserId) {
  // 인벤토리 임베드 생성
  const targetUser = await interaction.client.users.fetch(targetUserId);
  const userName = targetUser.username;
  
  // 사용자 데이터 초기화
  const userData = initUserData(targetUserId);
  const userInventory = getUserInventory(targetUserId);
  const userCards = userData.cards || [];
  
  // 인벤토리 임베드 생성
  const embed = new EmbedBuilder()
    .setTitle(`${userName}'s Inventory`)
    .setColor('#303136')
    .setThumbnail(targetUser.displayAvatarURL());
  
  // 인벤토리 아이템 표시
  let inventoryText = '';
  for (const [itemType, amount] of Object.entries(userInventory)) {
    if (ITEM_DISPLAY_NAMES[itemType]) {
      inventoryText += `**${ITEM_DISPLAY_NAMES[itemType]}**: ${amount}\n`;
    }
  }
  
  embed.addFields({ name: 'Items', value: inventoryText || 'No items', inline: false });
  embed.addFields({ name: 'Cards', value: `${userCards.length} cards collected`, inline: false });
  
  // 최근 획득한 3개의 카드 표시 (있는 경우)
  if (userCards.length > 0) {
    // 최신순으로 정렬
    const sortedCards = [...userCards].sort((a, b) => b.obtainedAt - a.obtainedAt);
    const recentCards = sortedCards
      .slice(0, 3)
      .map(card => {
        const variantText = card.variant ? ` (${card.variant})` : '';
        return `${card.name}${variantText}`;
      })
      .join('\n');
    
    embed.addFields({ 
      name: 'Recent Cards', 
      value: recentCards || 'No cards yet', 
      inline: false 
    });
  }
  
  // 네비게이션 버튼 생성 (Town 버튼 제거)
  const navigationRow = new ActionRowBuilder()
  .addComponents(
    new ButtonBuilder()
      .setCustomId(`nav_profile_${targetUserId}_${interaction.user.id}`)
      .setLabel('Profile')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`nav_inventory_${targetUserId}_${interaction.user.id}`)
      .setLabel('Inventory')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(true), // 현재 인벤토리 보는 중이므로 비활성화
    new ButtonBuilder()
      .setCustomId(`nav_collection_${targetUserId}_${interaction.user.id}`)
      .setLabel('Collection')
      .setStyle(ButtonStyle.Secondary)
  );
  
  // 메시지 업데이트
  await interaction.editReply({
    embeds: [embed],
    components: [navigationRow]
  });
  
  // 타이머 갱신
  refreshTimer(interaction.channelId, interaction.message.id, 2 * 60 * 1000);
}

/**
 * 컬렉션 네비게이션 처리
 * @param {Object} interaction - 상호작용 객체
 * @param {string} targetUserId - 타겟 사용자 ID
 */
async function handleCollectionNavigation(interaction, targetUserId) {
  const { config } = require('../../../config');
  
  // 컬렉션 데이터 가져오기
  const user = initUserData(targetUserId);
  
  // 카드가 없는 경우 처리
  if (user.cards.length === 0) {
    const noCardsMessage = targetUserId === interaction.user.id ? 
      'You do not have any cards in your collection yet.' : 
      'This user does not have any cards in their collection yet.';
    
    await interaction.editReply({ 
      content: noCardsMessage,
      embeds: [],
      components: []
    });
    return;
  }
  
  // 카드 목록 생성 (최신 획득 순)
  const sortedCards = [...user.cards].sort((a, b) => b.obtainedAt - a.obtainedAt);
  
  // 페이지네이션 설정
  const cardsPerPage = 15;
  const totalPages = Math.ceil(sortedCards.length / cardsPerPage);
  const page = 1; // 첫 페이지로 시작
  
  // 현재 페이지의 카드들
  const startIndex = (page - 1) * cardsPerPage;
  const endIndex = Math.min(startIndex + cardsPerPage, sortedCards.length);
  const cardsToShow = sortedCards.slice(startIndex, endIndex);
  
  // 변형별 이모지 매핑
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
    'farming': '🌾',
    'crafting': '🔨',
    'excavation': '🔍',
    'researching': '📚',
    'gathering': '🧺'
  };
  
  // 컬렉션 소유자 표시
  let collectionOwner;
  try {
    const targetUser = await interaction.client.users.fetch(targetUserId);
    collectionOwner = targetUser.username.toUpperCase();
  } catch (error) {
    collectionOwner = "USER";
  }
  
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
  description += `\n\n*Type a number (1-${cardsToShow.length}) to view card details.*`;
  
  // 임베드 생성
  const embed = new EmbedBuilder()
    .setDescription(description)
    .setColor('#303136');
  
  // 페이지네이션 버튼 생성
  const paginationRow = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`cc_first_${targetUserId}_${page}_${interaction.user.id}`)
        .setLabel('«')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(page === 1),
      new ButtonBuilder()
        .setCustomId(`cc_prev_${targetUserId}_${page}_${interaction.user.id}`)
        .setLabel('‹')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(page === 1),
      new ButtonBuilder()
        .setCustomId(`cc_next_${targetUserId}_${page}_${interaction.user.id}`)
        .setLabel('›')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(page === totalPages),
      new ButtonBuilder()
        .setCustomId(`cc_last_${targetUserId}_${page}_${interaction.user.id}`)
        .setLabel('»')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(page === totalPages)
    );
  
  // 정렬 메뉴 추가 (자신의 컬렉션인 경우에만)
  const isOwnCollection = targetUserId === interaction.user.id;
  const components = [paginationRow];
  
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
  
  // 네비게이션 버튼 추가 (Town 버튼 제거)
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
  
  components.push(navigationRow);
  
  // 메시지 업데이트
  await interaction.editReply({
    embeds: [embed],
    components: components
  });
  
  // 활성 컬렉션 뷰 등록/업데이트
  const { registerActiveCollectionView } = require('../../utils/activeViews');
  registerActiveCollectionView(
    interaction.channelId,
    interaction.message.id,
    interaction.user.id,
    targetUserId,
    cardsToShow,
    Date.now() + (config.CC_REMAINING_TIME || 120) * 1000 // 기본값 120초 제공
  );
  
  // 타이머 갱신
  refreshTimer(interaction.channelId, interaction.message.id, 2 * 60 * 1000);
}

module.exports = {
  handleNavigationInteraction
};