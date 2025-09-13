// src/commands/adminCommands.js
const fs = require('fs');
const path = require('path');
const { config, setSpecialVariants } = require('../../config');
const { PermissionsBitField } = require('discord.js');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { 
  addCredits, 
  removeCredits,
} = require('../database/userData');
const { addUserItem } = require('../database/inventoryModel');

/**
 * 승인 요청 관리 명령어 핸들러
 * @param {Object} message - 메시지 객체
 * @param {Array} args - 명령어 인수 ['list'|'clear'|'cleanup']
 */
async function handleApprovalManagementCommand(message, args) {
  // 관리자 권한 확인
  if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    return message.reply('❌ You need administrator permissions to manage approval requests.');
  }

  if (args.length === 0) {
    return message.reply('Usage: `ca approval [list|clear|cleanup]`');
  }

  const action = args[0].toLowerCase();
  const { 
    getAllApprovalRequests, 
    clearAllApprovalRequests, 
    cleanupExpiredRequests 
  } = require('../utils/cardApprovalPersistence');

  try {
    switch (action) {
      case 'list':
        // 현재 대기 중인 승인 요청 목록 표시
        const requests = getAllApprovalRequests();
        
        if (requests.length === 0) {
          return message.reply('📋 No pending approval requests.');
        }

        const embed = new EmbedBuilder()
          .setTitle('📋 Pending Approval Requests')
          .setColor('#FFA500')
          .setFooter({ text: `Total: ${requests.length} requests` });

        let description = '';
        requests.forEach((request, index) => {
          const timeAgo = Date.now() - request.timestamp;
          const daysAgo = Math.floor(timeAgo / (1000 * 60 * 60 * 24));
          const hoursAgo = Math.floor((timeAgo % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
          
          let timeText = '';
          if (daysAgo > 0) {
            timeText = `${daysAgo}d ${hoursAgo}h ago`;
          } else {
            timeText = `${hoursAgo}h ago`;
          }
          
          description += `**${index + 1}.** ${request.characterName} (${request.seriesName}) - ${request.variant}\n`;
          description += `   └ Requested by <@${request.requesterUserId}> ${timeText}\n\n`;
        });

        embed.setDescription(description.slice(0, 4096)); // Discord embed description limit
        await message.reply({ embeds: [embed] });
        break;

      case 'clear':
        // 모든 승인 요청 삭제 (확인 필요)
        const confirmEmbed = new EmbedBuilder()
          .setTitle('⚠️ Confirm Action')
          .setDescription('Are you sure you want to clear ALL pending approval requests? This action cannot be undone.\n\n**Note**: Only requests older than 7 days are automatically cleaned up.')
          .setColor('#FF0000');

        const confirmRow = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`approval_clear_confirm_${message.author.id}`)
              .setLabel('✅ Yes, Clear All')
              .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
              .setCustomId(`approval_clear_cancel_${message.author.id}`)
              .setLabel('❌ Cancel')
              .setStyle(ButtonStyle.Secondary)
          );

        await message.reply({ embeds: [confirmEmbed], components: [confirmRow] });
        break;

      case 'cleanup':
        // 만료된 요청만 정리 (7일 이상)
        const beforeCount = getAllApprovalRequests().length;
        cleanupExpiredRequests();
        const afterCount = getAllApprovalRequests().length;
        const removedCount = beforeCount - afterCount;

        if (removedCount > 0) {
          await message.reply(`🧹 Cleaned up ${removedCount} expired approval requests (older than 7 days).`);
        } else {
          await message.reply('✅ No expired approval requests to clean up (older than 7 days).');
        }
        break;

      default:
        await message.reply('❌ Invalid action. Use: `ca approval [list|clear|cleanup]`');
        break;
    }
  } catch (error) {
    console.error('Error handling approval management command:', error);
    await message.reply('❌ An error occurred while managing approval requests.');
  }
}

/**
 * 승인 요청 삭제 확인 버튼 핸들러
 * @param {Object} interaction - 버튼 인터랙션
 */
async function handleApprovalClearConfirmation(interaction) {
  const customId = interaction.customId;
  const userId = customId.split('_')[3];

  // 권한 확인
  if (interaction.user.id !== userId) {
    return interaction.reply({
      content: 'You can only confirm your own actions.',
      ephemeral: true
    });
  }

  if (customId.includes('confirm')) {
    // 모든 승인 요청 삭제
    const { clearAllApprovalRequests, getAllApprovalRequests } = require('../utils/cardApprovalPersistence');
    const beforeCount = getAllApprovalRequests().length;
    
    clearAllApprovalRequests();
    
    const successEmbed = new EmbedBuilder()
      .setTitle('✅ Approval Requests Cleared')
      .setDescription(`Successfully cleared ${beforeCount} pending approval requests.`)
      .setColor('#00FF00');

    await interaction.update({ embeds: [successEmbed], components: [] });
  } else {
    // 취소
    const cancelEmbed = new EmbedBuilder()
      .setTitle('❌ Action Cancelled')
      .setDescription('Approval requests clearing has been cancelled.')
      .setColor('#6C757D');

    await interaction.update({ embeds: [cancelEmbed], components: [] });
  }
}

/**
 * 카드 변형 관리 명령어 핸들러
 * @param {Object} message - 메시지 객체
 * @param {Array} args - 명령어 인수 ['add'|'remove'|'list', variant]
 */
async function handleVariantManagementCommand(message, args) {
  // 관리자 권한 확인
  if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    return message.reply('❌ You need administrator permissions to manage variants.');
  }

  if (args.length === 0) {
    return message.reply('Usage: `ca variant [add|remove|list] [variant_name]`\nExample: `ca variant add v6`');
  }

  const action = args[0].toLowerCase();
  const { getAddableVariants, addVariantToConfig, removeVariantFromConfig } = require('../../config');

  try {
    switch (action) {
      case 'list':
        // 현재 추가 가능한 변형 목록 표시
        const currentVariants = getAddableVariants();
        const embed = new EmbedBuilder()
          .setTitle('📋 Addable Variants List')
          .setDescription(currentVariants.length > 0 ? currentVariants.join(', ') : 'No variants configured')
          .setColor('#0099ff')
          .addFields({
            name: 'Total Variants',
            value: currentVariants.length.toString(),
            inline: true
          })
          .setFooter({ text: 'Use "ca variant add/remove [variant]" to modify' });
        
        await message.reply({ embeds: [embed] });
        break;

      case 'add':
        // 새 변형 추가
        if (args.length < 2) {
          return message.reply('❌ Please specify a variant to add. Example: `ca variant add v6`');
        }
        
        const variantToAdd = args[1].toLowerCase();
        
        // 변형 형식 검증 (v숫자 또는 특수 변형)
        const validVariants = /^(v\d+|sparkle|holo|rainbow|special|limited)$/;
        if (!validVariants.test(variantToAdd)) {
          return message.reply('❌ Invalid variant format. Use: v1, v2, v3... or special variants like sparkle, holo, rainbow');
        }
        
        const addSuccess = addVariantToConfig(variantToAdd);
        if (addSuccess) {
          await message.reply(`✅ Added variant "${variantToAdd}" to the addable variants list.`);
        } else {
          await message.reply(`⚠️ Variant "${variantToAdd}" is already in the list.`);
        }
        break;

      case 'remove':
        // 변형 제거
        if (args.length < 2) {
          return message.reply('❌ Please specify a variant to remove. Example: `ca variant remove v6`');
        }
        
        const variantToRemove = args[1].toLowerCase();
        
        // v1은 제거할 수 없음 (기본 변형)
        if (variantToRemove === 'v1') {
          return message.reply('❌ Cannot remove v1 variant as it is the base variant.');
        }
        
        const removeSuccess = removeVariantFromConfig(variantToRemove);
        if (removeSuccess) {
          await message.reply(`✅ Removed variant "${variantToRemove}" from the addable variants list.`);
        } else {
          await message.reply(`⚠️ Variant "${variantToRemove}" was not found in the list.`);
        }
        break;

      default:
        await message.reply('❌ Invalid action. Use: `ca variant [add|remove|list] [variant_name]`');
        break;
    }
  } catch (error) {
    console.error('Error handling variant management command:', error);
    await message.reply('❌ An error occurred while managing variants.');
  }
}

/**
 * 누락된 카드 캐시 관리 명령어 핸들러
 * @param {Object} message - 메시지 객체
 * @param {Array} args - 명령어 인수 ['refresh'|'status']
 */
async function handleMissingCardsManagementCommand(message, args) {
  // 관리자 권한 확인
  if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    return message.reply('❌ You need administrator permissions to manage missing cards cache.');
  }

  if (args.length === 0) {
    return message.reply('Usage: `ca missing [refresh|status]`');
  }

  const action = args[0].toLowerCase();
  const { getCacheInfo, forceCacheUpdate } = require('../utils/missingCardsCache');

  try {
    switch (action) {
      case 'status':
        // 캐시 상태 정보 표시
        const cacheInfo = getCacheInfo();
        const cacheAge = Date.now() - cacheInfo.lastUpdate;
        const cacheAgeHours = Math.floor(cacheAge / (1000 * 60 * 60));
        const cacheAgeMinutes = Math.floor((cacheAge % (1000 * 60 * 60)) / (1000 * 60));
        
        const embed = new EmbedBuilder()
          .setTitle('🔍 Missing Cards Cache Status')
          .setColor(cacheInfo.isHealthy ? '#00FF00' : '#FF9900')
          .addFields(
            { name: 'Total Missing Cards', value: cacheInfo.totalMissingCards.toString(), inline: true },
            { name: 'Last Update', value: cacheInfo.lastUpdate ? new Date(cacheInfo.lastUpdate).toLocaleString() : 'Never', inline: true },
            { name: 'Cache Age', value: `${cacheAgeHours}h ${cacheAgeMinutes}m`, inline: true },
            { name: 'Status', value: cacheInfo.isHealthy ? '✅ Healthy' : '⚠️ Needs Update', inline: true }
          )
          .setFooter({ text: 'Use "ca missing refresh" to update cache' });
        
        await message.reply({ embeds: [embed] });
        break;

      case 'refresh':
        // 캐시 강제 새로고침
        await message.reply('🔄 Updating missing cards cache... This may take a moment.');
        
        const updateSuccess = forceCacheUpdate();
        const newCacheInfo = getCacheInfo();
        
        if (updateSuccess) {
          await message.channel.send(`✅ Cache updated successfully! Found ${newCacheInfo.totalMissingCards} missing v1 images.`);
        } else {
          await message.channel.send('❌ Failed to update cache. Please check the logs for errors.');
        }
        break;

      default:
        await message.reply('❌ Invalid action. Use: `ca missing [refresh|status]`');
        break;
    }
  } catch (error) {
    console.error('Error handling missing cards management command:', error);
    await message.reply('❌ An error occurred while managing missing cards cache.');
  }
}

// 시스템 칭호 목록을 로드하는 함수
function loadSystemTitles() {
  try {
    const filePath = path.join(config.paths.DATA_DIR, 'systemTitles.json');
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
    return { titles: [] };
  } catch (error) {
    console.error('Error loading system titles:', error);
    return { titles: [] };
  }
}

// 시스템 칭호 목록을 저장하는 함수
function saveSystemTitles(titleData) {
  try {
    const filePath = path.join(config.paths.DATA_DIR, 'systemTitles.json');
    fs.writeFileSync(filePath, JSON.stringify(titleData, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving system titles:', error);
  }
}

// 칭호 추가 명령어 처리
async function handleAddTitleCommand(message, args) {
  // 관리자 권한 확인
  if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    message.reply('This command can only be used by server administrators.');
    return;
  }
  
  if (args.length < 2) {
    message.reply('Usage: ad name add [title name]');
    return;
  }
  
  // 'add' 이후의 모든 단어를 칭호 이름으로 사용
  const titleName = args.slice(1).join(' ');
  
  // 시스템 칭호 목록 로드
  const titleData = loadSystemTitles();
  
  // 이미 존재하는 칭호인지 확인
  if (titleData.titles.includes(titleName)) {
    message.reply(`The title "${titleName}" already exists in the system.`);
    return;
  }
  
  // 칭호 추가
  titleData.titles.push(titleName);
  saveSystemTitles(titleData);
  
  message.reply(`Successfully added title "${titleName}" to the system.`);
}

// 칭호 목록 조회 명령어 처리
async function handleListTitlesCommand(message) {
  // 관리자 권한 확인
  if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    message.reply('This command can only be used by server administrators.');
    return;
  }
  
  // 시스템 칭호 목록 로드
  const titleData = loadSystemTitles();
  
  if (titleData.titles.length === 0) {
    message.reply('There are no titles registered in the system yet.');
    return;
  }
  
  // 칭호 목록 표시
  const titleList = titleData.titles.map((title, index) => `${index + 1}. ${title}`).join('\n');
  
  message.reply(`**System Titles:**\n${titleList}`);
}

// 칭호 삭제 명령어 처리
async function handleRemoveTitleCommand(message, args) {
  // 관리자 권한 확인
  if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    message.reply('This command can only be used by server administrators.');
    return;
  }
  
  if (args.length < 2) {
    message.reply('Usage: ad name remove [title name]');
    return;
  }
  
  // 'remove' 이후의 모든 단어를 칭호 이름으로 사용
  const titleName = args.slice(1).join(' ');
  
  // 시스템 칭호 목록 로드
  const titleData = loadSystemTitles();
  
  // 칭호가 있는지 확인
  const titleIndex = titleData.titles.indexOf(titleName);
  if (titleIndex === -1) {
    message.reply(`The title "${titleName}" does not exist in the system.`);
    return;
  }
  
  // 칭호 삭제
  titleData.titles.splice(titleIndex, 1);
  saveSystemTitles(titleData);
  
  message.reply(`Successfully removed title "${titleName}" from the system.`);
}

// 유저에게 칭호 부여 명령어 처리
async function handleGiveTitleCommand(message, args) {
  // 관리자 권한 확인
  if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    message.reply('This command can only be used by server administrators.');
    return;
  }
  
  if (args.length < 3 || !message.mentions.users.size) {
    message.reply('Usage: ad name give [@user] [title name]');
    return;
  }
  
  const targetUser = message.mentions.users.first();
  // '@user' 이후의 모든 단어를 칭호 이름으로 사용
  const titleName = args.slice(2).join(' ');
  
  // 시스템 칭호 목록 로드
  const titleData = loadSystemTitles();
  
  // 칭호가 시스템에 있는지 확인
  if (!titleData.titles.includes(titleName)) {
    message.reply(`The title "${titleName}" does not exist in the system. Please add it first with "ad name add [title name]".`);
    return;
  }
  
  // 유저 데이터 로드
  const { initUserData, saveUserDataThrottled } = require('../database/userData');
  const userData = initUserData(targetUser.id);
  
  // 프로필 정보 초기화 확인
  if (!userData.profile) {
    userData.profile = {
      level: 1,
      exp: 0,
      maxExp: 100,
      lastActive: Date.now(),
      titles: [],
      customInfo: {}
    };
  }
  
  if (!userData.profile.titles) {
    userData.profile.titles = [];
  }
  
  // 이미 가지고 있는 칭호인지 확인
  if (userData.profile.titles.includes(titleName)) {
    message.reply(`${targetUser.username} already has the title "${titleName}".`);
    return;
  }
  
  // 칭호 추가
  userData.profile.titles.push(titleName);
  saveUserDataThrottled();
  
  message.reply(`Successfully gave the title "${titleName}" to ${targetUser.username}.`);
}

// 특수 변형 설정 명령어 처리
async function handleSpecialVariantsCommand(message, args) {
  // 관리자 권한 확인
  if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    message.reply('This command can only be used by server administrators.');
    return;
  }
  
  const variants = args.filter(v => v.trim() !== '');
  setSpecialVariants(variants);
  message.reply(`Special variants set to: ${variants.join(', ') || 'None'}`);
}

// 카드 설정 변경 명령어 처리
async function handleConfigCommand(message, args) {
  // 관리자 권한 확인
  if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    message.reply('This command can only be used by server administrators.');
    return;
  }
  
  if (args.length < 2) {
    message.reply('Usage: cconfig [parameter] [value]');
    return;
  }
  
  const [param, value] = args;
  const numValue = parseInt(value);
  
  if (isNaN(numValue)) {
    message.reply('Value must be a number');
    return;
  }
  
  // 설정 파라미터 업데이트
  switch (param.toLowerCase()) {
    case 'textoffset':
      config.cardTextYOffset = numValue;
      message.reply(`Card text Y offset set to: ${numValue}`);
      break;
    case 'fontsize':
      config.cardNameFontSize = numValue;
      message.reply(`Card name font size set to: ${numValue}`);
      break;
    case 'variantfontsize':
      config.cardVariantFontSize = numValue;
      message.reply(`Card variant font size set to: ${numValue}`);
      break;
    default:
      message.reply(`Unknown parameter: ${param}. Available parameters: textOffset, fontSize, variantFontSize`);
  }
}

// 크레딧 수정 명령어 처리 (cmod)
async function handleCreditModCommand(message, args) {
  // 관리자 권한 확인
  if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    message.reply('This command can only be used by server administrators.');
    return;
  }
  
  if (args.length < 3) {
    message.reply('Usage: cmod [add/remove] [item type] [@user] [amount]');
    return;
  }
  
  const [action, userMention, amountStr] = args;
  
  // 멘션에서 유저 ID 추출
  const userId = userMention.replace(/[<@!>]/g, '');
  const amount = parseInt(amountStr);
  
  if (isNaN(amount) || amount <= 0) {
    message.reply('Amount must be a positive number.');
    return;
  }
  
  let newBalance;
  let actionTaken;
  
  // 크레딧 추가 또는 제거
  if (action.toLowerCase() === 'add') {
    newBalance = addCredits(userId, amount);
    actionTaken = 'added to';
  } else if (action.toLowerCase() === 'remove') {
    newBalance = removeCredits(userId, amount);
    actionTaken = 'removed from';
  } else {
    message.reply('Action must be either "add" or "remove".');
    return;
  }
  
  message.reply(`Successfully ${actionTaken} <@${userId}>'s credits. New balance: ${newBalance} credits.`);
}

// 칭호 관리 명령어 처리 메인 함수
async function handleTitleManagementCommand(message, args) {
  if (args.length < 1) {
    message.reply('Usage: ad name [add/list/remove/give] [parameters]');
    return;
  }
  
  const subCommand = args[0].toLowerCase();
  
  switch (subCommand) {
    case 'add':
      await handleAddTitleCommand(message, args);
      break;
    case 'list':
      await handleListTitlesCommand(message);
      break;
    case 'remove':
      await handleRemoveTitleCommand(message, args);
      break;
    case 'give':
      await handleGiveTitleCommand(message, args);
      break;
    default:
      message.reply('Invalid subcommand. Available options: add, list, remove, give');
  }
}


// 드롭 채널 설정 명령어 처리
async function handleSetDropChannelCommand(message) {
  // 관리자 권한 확인
  if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    message.reply('This command can only be used by server administrators.');
    return;
  }
  
  const channelId = message.channel.id;
  
  // 이미 드롭 채널인 경우 제거
  if (config.dropChannels.includes(channelId)) {
    config.dropChannels = config.dropChannels.filter(id => id !== channelId);
    message.reply('This channel is no longer a designated drop channel.');
    saveDropChannels(); // 채널 설정 저장
    return;
  }
  
  // 드롭 채널 추가
  config.dropChannels.push(channelId);
  message.reply('This channel is now a designated drop channel.');
  saveDropChannels(); // 채널 설정 저장
}

// 드롭 채널 설정 저장 함수
function saveDropChannels() {
  try {
    const filePath = path.join(config.paths.DATA_DIR, 'dropChannels.json');
    fs.writeFileSync(filePath, JSON.stringify(config.dropChannels), 'utf8');
    console.log('Drop channels saved successfully');
  } catch (error) {
    console.error('Error saving drop channels:', error);
  }
}

// 드롭 채널 설정 로드 함수
function loadDropChannels() {
  try {
    const filePath = path.join(config.paths.DATA_DIR, 'dropChannels.json');
    if (fs.existsSync(filePath)) {
      config.dropChannels = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      console.log('Drop channels loaded successfully');
    }
  } catch (error) {
    console.error('Error loading drop channels:', error);
  }
}

// 상점 채널 설정 명령어 처리
async function handleShopChannelCommand(message) {
  // 관리자 권한 확인
  if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    message.reply('This command can only be used by server administrators.');
    return;
  }
  
  const { toggleShopChannel } = require('../systems/shopSystem');
  const channelId = message.channel.id;
  
  const isEnabled = toggleShopChannel(channelId);
  
  if (isEnabled) {
    message.reply('This channel is now a shop channel. Shops will appear here every hour.');
  } else {
    message.reply('This channel is no longer a shop channel.');
  }
}

// 건물 완성 어드민 명령어 처리
async function handleCompleteBuildingCommand(message, args) {
  // 관리자 권한 확인
  if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    message.reply('This command can only be used by server administrators.');
    return;
  }
  
  if (args.length < 1 || !message.mentions.users.size) {
    message.reply('Usage: a cbd [@user]');
    return;
  }
  
  const targetUser = message.mentions.users.first();
  const targetUserId = targetUser.id;
  
  // 건설 중인 건물 정보 가져오기
  const { getUserBuildings, completeBuilding } = require('../../junk/buildingModel');
  const { BUILDING_STATUS } = require('../../junk/buildingTypes');
  
  const buildings = getUserBuildings(targetUserId);
  const constructingBuildings = buildings.filter(b => b.status === BUILDING_STATUS.CONSTRUCTING);
  
  if (constructingBuildings.length === 0) {
    message.reply(`${targetUser.username} has no buildings under construction.`);
    return;
  }
  
  let completedCount = 0;
  let buildingNames = [];
  
  // 모든 건설 중인 건물 완성
  for (const building of constructingBuildings) {
    // 건물 완성 처리
    completeBuilding(targetUserId, building.id);
    completedCount++;
    buildingNames.push(building.name);
  }
  
  // 결과 메시지
  const buildingList = buildingNames.map(name => `**${name}**`).join(', ');
  message.reply(`Successfully completed ${completedCount} building(s) for ${targetUser.username}: ${buildingList}`);
}

module.exports = {
  handleSpecialVariantsCommand,
  handleConfigCommand,
  handleCreditModCommand,
  handleTitleManagementCommand,  
  loadSystemTitles,              
  saveSystemTitles,             
  handleSetDropChannelCommand,  
  loadDropChannels,
  handleCompleteBuildingCommand,
  handleShopChannelCommand,
  handleVariantManagementCommand,
  handleMissingCardsManagementCommand,
  handleApprovalManagementCommand,
  handleApprovalClearConfirmation    
};