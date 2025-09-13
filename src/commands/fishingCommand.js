// src/commands/fishingCommand.js
// 낚시 명령어 처리

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { FishingGame } = require('../game/fishingGame');
const { PLAYER_ACTION, GAME_RESULT } = require('../database/fishData');
const { initUserData, saveUserDataThrottled } = require('../database/userData');

// 활성 낚시 게임 저장소
const activeFishingGames = new Map();

/**
 * 낚시 명령어 핸들러
 * @param {Object} message - 메시지 객체
 * @param {Array} args - 명령어 인수
 */
async function handleFishingCommand(message, args) {
  const userId = message.author.id;
  
  // 이미 진행 중인 게임이 있는지 확인
  if (activeFishingGames.has(userId)) {
    await message.reply('You already have a fishing game in progress! Complete it first before starting a new one.');
    return;
  }
  
  try {
    // 장비 선택 UI 표시
    await showFishingEquipmentMenu(message);
  } catch (error) {
    console.error('Error showing fishing equipment menu:', error);
    await message.reply('An error occurred while preparing the fishing menu. Please try again.');
  }
}

// 빠른 낚시 명령어 (새 함수)
async function handleQuickFishingCommand(message, args) {
  const userId = message.author.id;
  
  // 이미 진행 중인 게임이 있는지 확인
  if (activeFishingGames.has(userId)) {
    await message.reply('You already have a fishing game in progress! Complete it first before starting a new one.');
    return;
  }
  
  try {
    // 현재 장착된 장비로 바로 낚시 시작
    await startFishingWithEquipment(message, userId);
  } catch (error) {
    console.error('Error starting quick fishing:', error);
    await message.reply('An error occurred while starting fishing. Please try again.');
  }
}

// 낚시 장비 메뉴 표시 (새 함수)
async function showFishingEquipmentMenu(message) {
  const userId = message.author.id;
  const { getUserFishingEquipment } = require('../database/fishingEquipment');
  const { getUserInventory } = require('../database/inventoryModel');
  const { ITEM_TYPES, ITEM_DISPLAY_NAMES, ITEM_DETAILS, ITEM_CATEGORIES } = require('../database/itemTypes');
  
  const equipment = getUserFishingEquipment(userId);
  const inventory = getUserInventory(userId);
  
  // 임베드 생성
  const embed = new EmbedBuilder()
    .setTitle('🎣 Fishing Equipment')
    .setDescription('Select your fishing equipment before starting')
    .setColor('#4169E1')
    .setThumbnail(message.author.displayAvatarURL());
  
  // 현재 장착된 장비 표시
  const currentRod = equipment.rod ? `${ITEM_DISPLAY_NAMES[equipment.rod]} (Durability: ${equipment.rodDurability})` : 'Basic Rod';
  const currentBait = equipment.bait ? ITEM_DISPLAY_NAMES[equipment.bait] : 'None';
  
  embed.addFields(
    { name: 'Current Rod', value: currentRod, inline: true },
    { name: 'Current Bait', value: currentBait, inline: true }
  );
  
  // 사용 가능한 낚싯대 목록
  const availableRods = Object.entries(inventory)
    .filter(([itemType, count]) => {
      const details = ITEM_DETAILS[itemType];
      return details && details.category === ITEM_CATEGORIES.ROD && count > 0;
    })
    .map(([itemType, count]) => {
      const details = ITEM_DETAILS[itemType];
      return `${ITEM_DISPLAY_NAMES[itemType]} (${count}) - DMG: ${details.damage}, STR: ${details.strength}, LUCK: ${details.baseLuck || 0}`;
    });
  
  if (availableRods.length > 0) {
    embed.addFields({ name: 'Available Rods', value: availableRods.join('\n'), inline: false });
  }
  
  // 사용 가능한 미끼 목록
  const availableBaits = Object.entries(inventory)
    .filter(([itemType, count]) => {
      const details = ITEM_DETAILS[itemType];
      return details && details.category === ITEM_CATEGORIES.BAIT && count > 0;
    })
    .map(([itemType, count]) => {
      const details = ITEM_DETAILS[itemType];
      return `${ITEM_DISPLAY_NAMES[itemType]} (${count}) - Luck: +${details.baseLuck || 0}, Variant: +${details.variantLuck || 0}%, Special: +${details.specialLuck || 0}%`;
    });
  
  if (availableBaits.length > 0) {
    embed.addFields({ name: 'Available Baits', value: availableBaits.join('\n'), inline: false });
  }
  
  // 버튼 생성
  const row1 = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`fishing_equip_rod_${userId}`)
        .setLabel('Change Rod')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(availableRods.length === 0),
      new ButtonBuilder()
        .setCustomId(`fishing_equip_bait_${userId}`)
        .setLabel('Change Bait')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(availableBaits.length === 0)
    );
  
  const row2 = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`fishing_start_${userId}`)
        .setLabel('Start Fishing')
        .setStyle(ButtonStyle.Success)
        .setEmoji('🎣'),
      new ButtonBuilder()
        .setCustomId(`fishing_guide_${userId}`)
        .setLabel('How to Fish')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('📖')
    );
  
  await message.reply({ embeds: [embed], components: [row1, row2] });
}

// 장착된 장비로 낚시 시작
async function startFishingWithEquipment(message, userId) {
  try {
    const { getEquipmentStats } = require('../database/fishingEquipment');
    const stats = getEquipmentStats(userId);
    
    // 낚싯대 정보로 게임 시작
    const rod = {
      damage: stats.damage || 20, // 기본값 제공
      strength: stats.strength || 1.0, // 기본값 제공
      luck: stats.baseLuck || 0, // 기본값 제공
      variantLuck: stats.variantLuck || 0, // 기본값 제공
      specialLuck: stats.specialLuck || 0 // 기본값 제공
    };
    
    console.log("Starting fishing with rod:", rod); // 디버깅용 로그 추가
    
    // 새로운 낚시 게임 시작
    const { FishingGame } = require('../game/fishingGame');
    const game = new FishingGame(userId, rod);
    activeFishingGames.set(userId, game);
    
    // 게임 UI 생성 및 전송
    const gameMessage = await createGameMessage(game);
    const response = await message.reply(gameMessage);
    
    // 게임에 메시지 ID 저장
    game.messageId = response.id;
    game.channelId = message.channel.id;
    
    // 30분 후 자동으로 게임 종료
    setTimeout(() => {
      if (activeFishingGames.has(userId)) {
        activeFishingGames.delete(userId);
        console.log(`Fishing game for user ${userId} expired due to inactivity`);
      }
    }, 30 * 60 * 1000);
  } catch (error) {
    console.error('Error in startFishingWithEquipment:', error);
    throw error; // 상위 호출자에게 오류 전파
  }
}

/**
 * 게임 메시지 생성
 * @param {FishingGame} game - 낚시 게임 인스턴스
 * @param {Object} lastTurnResult - 마지막 턴 결과 (선택적)
 * @returns {Object} 메시지 객체
 */
function createGameMessage(game, lastTurnResult = null) {
  const gameState = game.getGameState();
  
  // 임베드 생성
  const embed = new EmbedBuilder()
    .setTitle('🎣 Fishing Game')
    .setColor('#0099ff')
    .setDescription(createGameDescription(gameState, lastTurnResult))
    .setFooter({ text: `Turn ${21 - gameState.turns}/20 | Manage your line tension wisely!` });
  
  // 게임이 종료되지 않았다면 버튼 추가 (순서 변경)
  const components = [];
  if (!gameState.isGameOver) {
    const actionRow = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`fishing_action_${game.userId}_${PLAYER_ACTION.HARD_SLACK}`)
          .setLabel('Hard Slack')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('⏪'),
        new ButtonBuilder()
          .setCustomId(`fishing_action_${game.userId}_${PLAYER_ACTION.SLOW_SLACK}`)
          .setLabel('Slow Slack')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('◀️'),
        new ButtonBuilder()
          .setCustomId(`fishing_action_${game.userId}_${PLAYER_ACTION.WAIT}`)
          .setLabel('Wait')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('⏸️'),
        new ButtonBuilder()
          .setCustomId(`fishing_action_${game.userId}_${PLAYER_ACTION.SLOW_REEL}`)
          .setLabel('Slow Reel')
          .setStyle(ButtonStyle.Success)
          .setEmoji('▶️'),
        new ButtonBuilder()
          .setCustomId(`fishing_action_${game.userId}_${PLAYER_ACTION.HARD_REEL}`)
          .setLabel('Hard Reel')
          .setStyle(ButtonStyle.Success)
          .setEmoji('⏩')
      );
    components.push(actionRow);
  }
  
  return {
    embeds: [embed],
    components: components
  };
}

/**
 * 게임 설명 텍스트 생성
 * @param {Object} gameState - 게임 상태
 * @param {Object} lastTurnResult - 마지막 턴 결과
 * @returns {string} 설명 텍스트
 */
function createGameDescription(gameState, lastTurnResult = null) {
  const { fish, tension, turns, isGameOver, gameResult, rod } = gameState; // Get rod from gameState
  
  let description = '';

  // 장비 정보 표시
  if (rod) {
    description += `**Equipment:** DMG: ${rod.damage}, STR: ${rod.strength}, LUCK: ${rod.luck}`;
    if (rod.variantLuck > 0) description += `, Variant: +${rod.variantLuck}%`;
    if (rod.specialLuck > 0) description += `, Special: +${rod.specialLuck}%`;
    description += '\n\n';
  }
  
  // 물고기 정보
  description += `**${fish.name}** (${fish.rarity})\n`;
  description += `⭐ ${fish.stars} | ❤️ ${fish.currentHealth}/${fish.maxHealth}\n`;
  description += `🎯 Safe Range: ${fish.safetyRange[0]}-${fish.safetyRange[1]}\n\n`;
  
  // 텐션 바 생성
  const tensionBar = createTensionBar(tension, fish.safetyRange);
  description += `**Line Tension: ${tension}**\n${tensionBar}\n`;
  
  // 텐션 변화량 표시 (마지막 턴 결과가 있는 경우)
  if (lastTurnResult && lastTurnResult.turn > 1) {
    description += `🐟 Fish Tension Change: ${lastTurnResult.fishTensionChange >= 0 ? '+' : ''}${lastTurnResult.fishTensionChange}\n`;
    description += `🎣 Player Tension Change: ${lastTurnResult.playerTensionChange >= 0 ? '+' : ''}${lastTurnResult.playerTensionChange}\n`;
    description += `📊 Total Change: ${lastTurnResult.totalTensionChange >= 0 ? '+' : ''}${lastTurnResult.totalTensionChange}\n`;
    
    // 데미지 정보 (안전 범위 내에서만)
    if (lastTurnResult.damageDealt > 0) {
      description += `💥 Damage Dealt: ${lastTurnResult.damageDealt}\n`;
    } else if (tension >= fish.safetyRange[0] && tension <= fish.safetyRange[1]) {
      description += `💥 Damage Dealt: 0 (No damage this turn)\n`;
    } else {
      description += `⚠️ No damage - outside safe range!\n`;
    }
  }
  
  description += '\n';
  
  // 게임 상태에 따른 메시지
  if (isGameOver) {
    switch (gameResult) {
      case GAME_RESULT.SUCCESS:
        description += '🎉 **SUCCESS!** You caught the fish!';
        break;
      case GAME_RESULT.LINE_BREAK:
        description += '💥 **LINE BREAK!** The line snapped!';
        break;
      case GAME_RESULT.FISH_ESCAPED_TURNS:
        description += '⏰ **TIME UP!** The fish got away!';
        break;
    }
  } else {
    description += `Turns remaining: **${turns}**\n`;
    description += '🎣 Choose your action wisely!';
  }
  
  return description;
}

/**
 * 텐션 바 생성 (모바일 호환성을 위해 16개로 단축)
 * @param {number} tension - 현재 텐션
 * @param {Array} safetyRange - 안전 범위 [min, max]
 * @returns {string} 텐션 바 문자열
 */
function createTensionBar(tension, safetyRange) {
  const barLength = 16; // 20에서 16으로 변경 (모바일 호환성)
  const tensionPos = Math.floor((tension / 100) * barLength);
  const safeStart = Math.floor((safetyRange[0] / 100) * barLength);
  const safeEnd = Math.floor((safetyRange[1] / 100) * barLength);
  
  let bar = '';
  for (let i = 0; i < barLength; i++) {
    if (i === tensionPos) {
      bar += '🔘'; // 현재 위치
    } else if (i >= safeStart && i <= safeEnd) {
      bar += '🟢'; // 안전 범위
    } else {
      bar += '⬜'; // 위험 범위
    }
  }
  
  return bar;
}

/**
 * 낚시 액션 버튼 처리
 * @param {Object} interaction - 인터랙션 객체
 */
async function handleFishingAction(interaction) {
  const customId = interaction.customId;
  console.log(`Full CustomId: ${customId}`);
  
  // customId 형태: fishing_action_{userId}_{action}
  const parts = customId.split('_');
  console.log(`CustomId Parts: ${JSON.stringify(parts)}`);
  
  if (parts.length < 4) {
    console.error(`Invalid customId format: ${customId}`);
    await interaction.reply({
      content: 'Invalid button interaction format.',
      ephemeral: true
    });
    return;
  }
  
  const userId = parts[2];
  const action = parts.slice(3).join('_'); // 나머지 부분을 모두 합치기 (언더스코어가 포함된 액션 대비)
  
  console.log(`Parsed - UserId: ${userId}, Action: ${action}`);
  console.log(`Available PLAYER_ACTIONS: ${JSON.stringify(Object.values(PLAYER_ACTION))}`);
  
  // 사용자 확인
  if (interaction.user.id !== userId) {
    await interaction.reply({
      content: 'You can only interact with your own fishing game!',
      ephemeral: true
    });
    return;
  }
  
  // 게임 확인
  const game = activeFishingGames.get(userId);
  if (!game) {
    await interaction.reply({
      content: 'No active fishing game found. Start a new game with the `fish` command.',
      ephemeral: true
    });
    return;
  }
  
  try {
    // 플레이어 액션 처리
    const turnResult = game.processPlayerAction(action);
    
    if (turnResult.error) {
      console.error(`Error in processPlayerAction: ${turnResult.error}, Action: ${action}`);
      await interaction.reply({
        content: turnResult.error,
        ephemeral: true
      });
      return;
    }
    
    // 게임 UI 업데이트 - turnResult 전달
    const gameMessage = createGameMessage(game, turnResult);
    await interaction.update(gameMessage);
    
    // 게임이 종료된 경우 결과 처리
    if (game.isGameOver) {
      await handleGameEnd(interaction, game);
    }
    
  } catch (error) {
    console.error('Error handling fishing action:', error);
    console.error('Action was:', action);
    console.error('CustomId was:', customId);
    await interaction.reply({
      content: 'An error occurred while processing your action.',
      ephemeral: true
    });
  }
}

/**
 * 게임 종료 처리
 * @param {Object} interaction - 인터랙션 객체
 * @param {FishingGame} game - 낚시 게임 인스턴스
 */
async function handleGameEnd(interaction, game) {
  const userId = game.userId;
  
  // 활성 게임에서 제거
  activeFishingGames.delete(userId);
  
  // 장비 업데이트 (내구도 감소, 미끼 소모)
  const { updateFishingEquipment } = require('../database/fishingEquipment');
  const equipmentUpdate = updateFishingEquipment(userId);
  
  // 성공적으로 잡은 경우 물고기를 컬렉션에 추가
  if (game.gameResult === GAME_RESULT.SUCCESS) {
    const caughtFish = game.generateCaughtFish();
    
    if (caughtFish) {
      // 사용자 데이터에 물고기 추가
      const userData = initUserData(userId);
      if (!userData.fish) {
        userData.fish = [];
      }
      userData.fish.push(caughtFish);
      
      // 데이터 저장
      saveUserDataThrottled();
      
      // 결과 메시지 생성
      const resultEmbed = new EmbedBuilder()
        .setTitle('🎉 Fish Caught!')
        .setColor('#00ff00')
        .setDescription(createCatchResultDescription(caughtFish))
        .setFooter({ text: `Fish ID: ${caughtFish.id}` });
      
      // 장비 관련 메시지 추가
      if (equipmentUpdate.messages.length > 0) {
        resultEmbed.addFields({ 
          name: 'Equipment Status', 
          value: equipmentUpdate.messages.join('\n') 
        });
      }
      
      // 3초 후 결과 메시지 전송
      setTimeout(async () => {
        try {
          await interaction.followUp({
            embeds: [resultEmbed]
          });
        } catch (error) {
          console.error('Error sending catch result:', error);
        }
      }, 3000);
    }
  } else {
    // 실패한 경우에도 장비 업데이트 메시지 표시
    if (equipmentUpdate.messages.length > 0) {
      setTimeout(async () => {
        try {
          await interaction.followUp({
            content: equipmentUpdate.messages.join('\n')
          });
        } catch (error) {
          console.error('Error sending equipment update:', error);
        }
      }, 1000);
    }
  }
}

/**
 * 잡힌 물고기 결과 설명 생성
 * @param {Object} fish - 잡힌 물고기 데이터
 * @returns {string} 결과 설명
 */
function createCatchResultDescription(fish) {
  let description = `**${fish.name}** (${fish.rarity})\n`;
  description += `⭐ ${fish.stars} Star${fish.stars > 1 ? 's' : ''}\n`;
  
  // 사이즈 표시 추가
  if (fish.actualSize) {
    if (fish.actualSize >= 100) {
      const sizeInMeters = (fish.actualSize / 100).toFixed(1);
      description += `📏 Size: ${sizeInMeters}m\n`;
    } else {
      description += `📏 Size: ${fish.actualSize}cm\n`;
    }
  }
  
  description += `💰 Value: $${fish.value}\n`;
  
  if (fish.variants && fish.variants.length > 0) {
    description += `✨ Variants: ${fish.variants.join(', ')}\n`;
  }
  
  description += `\n🎣 Added to your fish collection!`;
  description += `\nView your collection with \`ccf\``;
  
  return description;
}

/**
 * 활성 게임 정리 (봇 재시작 시 사용)
 */
function clearActiveFishingGames() {
  activeFishingGames.clear();
  console.log('Cleared all active fishing games');
}

module.exports = {
  handleFishingCommand,
  handleQuickFishingCommand,
  handleFishingAction,
  clearActiveFishingGames,
  startFishingWithEquipment
};