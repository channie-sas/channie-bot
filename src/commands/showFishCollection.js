// src/commands/showFishCollection.js
// 물고기 컬렉션 보기 명령어 (개선된 UI)

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder } = require('discord.js');
const { initUserData } = require('../database/userData');
const { config } = require('../../config');
const { FISH_RARITY } = require('../database/fishData');

// 정렬 옵션 정의
const SORT_OPTIONS = {
  RECENT: 'recent',
  RARITY_ASC: 'rarity_asc',
  RARITY_DESC: 'rarity_desc',
  VALUE_ASC: 'value_asc',
  VALUE_DESC: 'value_desc',
  STARS_ASC: 'stars_asc',
  STARS_DESC: 'stars_desc'
};

// 희귀도 순서 매핑 (정렬용)
const RARITY_ORDER = {
  [FISH_RARITY.COMMON]: 1,
  [FISH_RARITY.UNCOMMON]: 2,
  [FISH_RARITY.RARE]: 3,
  [FISH_RARITY.EPIC]: 4,
  [FISH_RARITY.LEGENDARY]: 5
};

/**
 * 물고기 배열 정렬
 * @param {Array} fish - 물고기 배열
 * @param {string} sortOption - 정렬 옵션
 * @returns {Array} 정렬된 물고기 배열
 */
function sortFish(fish, sortOption = SORT_OPTIONS.RECENT) {
  const fishCopy = [...fish];
  
  switch (sortOption) {
    case SORT_OPTIONS.RECENT:
      return fishCopy.sort((a, b) => b.caughtAt - a.caughtAt);
      
    case SORT_OPTIONS.RARITY_ASC:
      return fishCopy.sort((a, b) => {
        const rarityDiff = RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity];
        if (rarityDiff !== 0) return rarityDiff;
        return b.caughtAt - a.caughtAt;
      });
      
    case SORT_OPTIONS.RARITY_DESC:
      return fishCopy.sort((a, b) => {
        const rarityDiff = RARITY_ORDER[b.rarity] - RARITY_ORDER[a.rarity];
        if (rarityDiff !== 0) return rarityDiff;
        return b.caughtAt - a.caughtAt;
      });
      
    case SORT_OPTIONS.VALUE_ASC:
      return fishCopy.sort((a, b) => {
        const valueDiff = a.value - b.value;
        if (valueDiff !== 0) return valueDiff;
        return b.caughtAt - a.caughtAt;
      });
      
    case SORT_OPTIONS.VALUE_DESC:
      return fishCopy.sort((a, b) => {
        const valueDiff = b.value - a.value;
        if (valueDiff !== 0) return valueDiff;
        return b.caughtAt - a.caughtAt;
      });
      
    case SORT_OPTIONS.STARS_ASC:
      return fishCopy.sort((a, b) => {
        const starsDiff = a.stars - b.stars;
        if (starsDiff !== 0) return starsDiff;
        return b.caughtAt - a.caughtAt;
      });
      
    case SORT_OPTIONS.STARS_DESC:
      return fishCopy.sort((a, b) => {
        const starsDiff = b.stars - a.stars;
        if (starsDiff !== 0) return starsDiff;
        return b.caughtAt - a.caughtAt;
      });
      
    default:
      return fishCopy.sort((a, b) => b.caughtAt - a.caughtAt);
  }
}

/**
 * 정렬 옵션 이름 가져오기
 * @param {string} sortOption - 정렬 옵션
 * @returns {string} 정렬 옵션 이름
 */
function getSortOptionName(sortOption) {
  switch (sortOption) {
    case SORT_OPTIONS.RECENT: return 'Recent';
    case SORT_OPTIONS.RARITY_ASC: return 'Rarity ↑';
    case SORT_OPTIONS.RARITY_DESC: return 'Rarity ↓';
    case SORT_OPTIONS.VALUE_ASC: return 'Value ↑';
    case SORT_OPTIONS.VALUE_DESC: return 'Value ↓';
    case SORT_OPTIONS.STARS_ASC: return 'Stars ↑';
    case SORT_OPTIONS.STARS_DESC: return 'Stars ↓';
    default: return 'Recent';
  }
}

/**
 * 유저 물고기 컬렉션 보기
 * @param {Object} message - 메시지 객체
 * @param {string} targetUserIdOrMention - 대상 사용자 ID 또는 멘션
 * @param {number} page - 페이지 번호
 * @param {string} sortOption - 정렬 옵션
 */
async function showFishCollection(message, targetUserIdOrMention = null, page = 1, sortOption = SORT_OPTIONS.RECENT) {
  // 대상 사용자 ID 처리
  let targetUserId = message.author.id;
  
  if (targetUserIdOrMention) {
    const mentionMatch = targetUserIdOrMention.match(/<@!?(\d+)>/);
    if (mentionMatch) {
      targetUserId = mentionMatch[1];
    } else if (/^\d+$/.test(targetUserIdOrMention)) {
      targetUserId = targetUserIdOrMention;
    }
  }
  
  const user = initUserData(targetUserId);
  const isOwnCollection = targetUserId === message.author.id;
  
  if (!user.fish) {
    user.fish = [];
  }
  
  if (user.fish.length === 0) {
    const noFishMessage = isOwnCollection ? 
      'You have not caught any fish yet. Try the `fish` command to start fishing!' : 
      'This user has not caught any fish yet.';
    message.reply(noFishMessage);
    return;
  }
  
  // 물고기 목록 정렬
  const sortedFish = sortFish(user.fish, sortOption);
  
  // 페이지네이션 설정
  const fishPerPage = 15;
  const totalPages = Math.ceil(sortedFish.length / fishPerPage);
  
  if (page < 1) page = 1;
  if (page > totalPages) page = totalPages;
  
  const startIndex = (page - 1) * fishPerPage;
  const endIndex = Math.min(startIndex + fishPerPage, sortedFish.length);
  const fishToShow = sortedFish.slice(startIndex, endIndex);
  
  // 임베드 및 컴포넌트 생성
  const { embed, components } = createFishCollectionDisplay(
    fishToShow, 
    user.fish.length, 
    page, 
    totalPages, 
    sortOption, 
    targetUserId, 
    message.author.id, 
    isOwnCollection
  );
  
  // 메시지 전송
  const response = await message.reply({ 
    embeds: [embed], 
    components: components 
  });
  
  // 활성 뷰 등록
  const { registerActiveFishCollectionView } = require('../utils/activeViews');
  registerActiveFishCollectionView(
    message.channel.id,
    response.id,
    message.author.id,
    targetUserId,
    fishToShow,
    Date.now() + (config.CC_REMAINING_TIME * 1000),
    { sortOption, page }
  );
  
  // 120초 후 버튼 비활성화
  setTimeout(async () => {
    try {
      const { embed: disabledEmbed, components: disabledComponents } = createFishCollectionDisplay(
        fishToShow, 
        user.fish.length, 
        page, 
        totalPages, 
        sortOption, 
        targetUserId, 
        message.author.id, 
        isOwnCollection,
        true // disabled = true
      );
      
      await response.edit({ 
        embeds: [disabledEmbed], 
        components: disabledComponents 
      });
      
      const { removeActiveFishCollectionView } = require('../utils/activeViews');
      removeActiveFishCollectionView(message.channel.id);
      
    } catch (error) {
      console.error('Error disabling fish collection buttons:', error);
    }
  }, config.CC_REMAINING_TIME * 1000);
}

/**
 * 물고기 컬렉션 디스플레이 생성
 * @param {Array} fishToShow - 표시할 물고기 목록
 * @param {number} totalFish - 총 물고기 수
 * @param {number} page - 현재 페이지
 * @param {number} totalPages - 총 페이지 수
 * @param {string} sortOption - 정렬 옵션
 * @param {string} targetUserId - 대상 사용자 ID
 * @param {string} callerId - 호출자 ID
 * @param {boolean} isOwnCollection - 본인 컬렉션 여부
 * @param {boolean} disabled - 비활성화 여부
 * @returns {Object} embed와 components 객체
 */
function createFishCollectionDisplay(fishToShow, totalFish, page, totalPages, sortOption, targetUserId, callerId, isOwnCollection, disabled = false) {
  // 희귀도별 이모지 매핑
  const rarityEmoji = {
    [FISH_RARITY.COMMON]: '⚪',
    [FISH_RARITY.UNCOMMON]: '🟢', 
    [FISH_RARITY.RARE]: '🔵',
    [FISH_RARITY.EPIC]: '🟣',
    [FISH_RARITY.LEGENDARY]: '🟡'
  };
  
  const getStarDisplay = (stars) => '⭐'.repeat(Math.min(stars, 5)) + (stars > 5 ? `+${stars - 5}` : '');
  
  // 컬렉션 소유자 이름 (임시로 사용)
  let collectionOwner = isOwnCollection ? "YOUR" : "USER";
  
  // 임베드 설명 생성
  let description = `**${collectionOwner}'S FISH COLLECTION** 🎣\n`;
  
  if (sortOption !== SORT_OPTIONS.RECENT) {
    description += `*Sorted by: ${getSortOptionName(sortOption)}*\n`;
  }
  description += '\n';
  
  // 물고기 정보 추가
  fishToShow.forEach((fish, index) => {
    const fishNumber = index + 1;
    const rarityEmj = rarityEmoji[fish.rarity] || '⚪';
    const fishId = fish.id.substring(0, 8);
    
    let variantText = '';
    if (fish.variants && fish.variants.length > 0) {
      variantText = ` [${fish.variants.join(', ')}]`;
    }
    
    const starDisplay = getStarDisplay(fish.stars);
    
    let sizeDisplay = '';
    if (fish.actualSize) {
      if (fish.actualSize >= 100) {
        const sizeInMeters = (fish.actualSize / 100).toFixed(1);
        sizeDisplay = ` • ${sizeInMeters}m`;
      } else {
        sizeDisplay = ` • ${fish.actualSize}cm`;
      }
    }
    
    description += `**${fishNumber}.** ${rarityEmj} • \`${fishId}\` • ${starDisplay}${sizeDisplay} • \`$${fish.value}\` • ${fish.name}${variantText}\n`;
  });
  
  description += `\nPage: ${page}/${totalPages} | Total fish: ${totalFish}`;
  
  if (!isOwnCollection) {
    description += `\n\n*Viewing another user's fish collection.*`;
  }
  
  // 임베드 생성
  const embed = new EmbedBuilder()
    .setDescription(description)
    .setColor('#4A90E2');
  
  // 컴포넌트 생성
  const components = [];
  
  // 페이지네이션 버튼
  const pageRow = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`fcf_first_${targetUserId}_${page}_${callerId}_${sortOption}`)
        .setLabel('«')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(disabled || page === 1),
      new ButtonBuilder()
        .setCustomId(`fcf_prev_${targetUserId}_${page}_${callerId}_${sortOption}`)
        .setLabel('‹')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(disabled || page === 1),
      new ButtonBuilder()
        .setCustomId(`fcf_next_${targetUserId}_${page}_${callerId}_${sortOption}`)
        .setLabel('›')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(disabled || page === totalPages),
      new ButtonBuilder()
        .setCustomId(`fcf_last_${targetUserId}_${page}_${callerId}_${sortOption}`)
        .setLabel('»')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(disabled || page === totalPages)
    );
  
  components.push(pageRow);
  
  // 정렬 선택 메뉴 (본인 컬렉션인 경우에만)
  if (isOwnCollection) {
    const sortMenu = new StringSelectMenuBuilder()
      .setCustomId(`fcf_select_sort_${targetUserId}_${page}`)
      .setPlaceholder(`Sort by: ${getSortOptionName(sortOption)}`)
      .setDisabled(disabled)
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions([
        {
          label: 'Recent (Default)',
          description: 'Sort by catch date (newest first)',
          value: SORT_OPTIONS.RECENT,
          default: sortOption === SORT_OPTIONS.RECENT
        },
        {
          label: 'Rarity ↑',
          description: 'Sort by rarity (Common → Legendary)',
          value: SORT_OPTIONS.RARITY_ASC,
          default: sortOption === SORT_OPTIONS.RARITY_ASC
        },
        {
          label: 'Rarity ↓',
          description: 'Sort by rarity (Legendary → Common)',
          value: SORT_OPTIONS.RARITY_DESC,
          default: sortOption === SORT_OPTIONS.RARITY_DESC
        },
        {
          label: 'Value ↑',
          description: 'Sort by value (lowest first)',
          value: SORT_OPTIONS.VALUE_ASC,
          default: sortOption === SORT_OPTIONS.VALUE_ASC
        },
        {
          label: 'Value ↓',
          description: 'Sort by value (highest first)',
          value: SORT_OPTIONS.VALUE_DESC,
          default: sortOption === SORT_OPTIONS.VALUE_DESC
        },
        {
          label: 'Stars ↑',
          description: 'Sort by stars (least first)',
          value: SORT_OPTIONS.STARS_ASC,
          default: sortOption === SORT_OPTIONS.STARS_ASC
        },
        {
          label: 'Stars ↓',
          description: 'Sort by stars (most first)',
          value: SORT_OPTIONS.STARS_DESC,
          default: sortOption === SORT_OPTIONS.STARS_DESC
        }
      ]);

    const sortRow = new ActionRowBuilder().addComponents(sortMenu);
    components.push(sortRow);
  }
  
  return { embed, components };
}

/**
 * 물고기 컬렉션 페이지 업데이트 함수
 * @param {Object} interaction - 인터랙션 객체
 * @param {string} targetUserId - 대상 사용자 ID
 * @param {number} newPage - 새 페이지 번호
 * @param {string} sortOption - 정렬 옵션
 */
async function updateFishCollectionPage(interaction, targetUserId, newPage, sortOption = SORT_OPTIONS.RECENT) {
  try {
    const callerId = interaction.user.id;
    const isOwnCollection = callerId === targetUserId;
    
    const user = initUserData(targetUserId);
    
    if (!user.fish) {
      user.fish = [];
    }
    
    const sortedFish = sortFish(user.fish, sortOption);
    const fishPerPage = 15;
    const totalPages = Math.ceil(sortedFish.length / fishPerPage);
    
    if (newPage < 1) newPage = 1;
    if (newPage > totalPages) newPage = totalPages;
    
    const startIndex = (newPage - 1) * fishPerPage;
    const endIndex = Math.min(startIndex + fishPerPage, sortedFish.length);
    const fishToShow = sortedFish.slice(startIndex, endIndex);
    
    // 디스플레이 생성
    const { embed, components } = createFishCollectionDisplay(
      fishToShow, 
      user.fish.length, 
      newPage, 
      totalPages, 
      sortOption, 
      targetUserId, 
      callerId, 
      isOwnCollection
    );
    
    // 활성 뷰 업데이트
    const { updateActiveFishCollectionView } = require('../utils/activeViews');
    updateActiveFishCollectionView(
      interaction.channel.id,
      interaction.message.id,
      interaction.user.id,
      targetUserId,
      fishToShow,
      Date.now() + (config.CC_REMAINING_TIME * 1000),
      { sortOption, page: newPage }
    );
    
    // 인터랙션 응답 - update 대신 editReply 사용
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ 
        embeds: [embed], 
        components: components 
      });
    } else {
      await interaction.update({ 
        embeds: [embed], 
        components: components 
      });
    }
    
  } catch (error) {
    console.error('Error updating fish collection page:', error);
    
    try {
      const errorMessage = { 
        content: 'There was an error updating the fish collection page.', 
        ephemeral: true 
      };
      
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(errorMessage);
      } else {
        await interaction.reply(errorMessage);
      }
    } catch (replyError) {
      console.error('Error sending error message:', replyError);
    }
  }
}

module.exports = {
  showFishCollection,
  updateFishCollectionPage,
  SORT_OPTIONS,
  getSortOptionName
};