// src/interactions/buttonHandlers/fishingButtons.js
const { StringSelectMenuBuilder, ActionRowBuilder } = require('discord.js');

/**
 * 낚시 장비 버튼 처리
 * @param {Object} interaction - 인터랙션 객체
 */
async function handleFishingEquipmentButton(interaction) {
  const customId = interaction.customId;
  
  // customId 파싱 로직 수정
  const parts = customId.split('_');
  
  // fishing_start_userId, fishing_guide_userId, fishing_back_userId 형태와 fishing_equip_type_userId 형태를 구분
  let action, type, userId;
  
  if (parts.length === 3) {
    // fishing_start_userId, fishing_guide_userId, fishing_back_userId 형태
    [, action, userId] = parts;
    type = null;
  } else if (parts.length === 4) {
    // fishing_equip_type_userId 형태
    [, action, type, userId] = parts;
  } else {
    console.error('Invalid fishing button customId format:', customId);
    return interaction.reply({
      content: 'Invalid button format.',
      flags: 64
    });
  }
  
  // 사용자 확인
  if (interaction.user.id !== userId) {
    return interaction.reply({
      content: 'You can only modify your own fishing equipment!',
      flags: 64
    });
  }
  
  try {
    // 장비 변경 UI 표시
    if (action === 'equip') {
      if (type === 'rod') {
        await showRodSelection(interaction);
      } else if (type === 'bait') {
        await showBaitSelection(interaction);
      }
    } else if (action === 'start') {
      // 낚시 시작 - interaction 대신 메시지 객체를 생성하여 전달
      const { startFishingWithEquipment } = require('../../commands/fishingCommand');
      
      // 인터랙션과 호환되는 메시지 객체 생성
      const messageObj = {
        author: {
          id: userId,
          displayAvatarURL: () => interaction.user.displayAvatarURL()
        },
        channel: interaction.channel,
        reply: async (content) => {
          if (typeof content === 'string') {
            return interaction.channel.send(content);
          } else {
            return interaction.channel.send(content);
          }
        }
      };
      
      // 인터랙션 응답 업데이트 후 낚시 시작
      await interaction.deferUpdate();
      await interaction.editReply({ content: 'Starting fishing...', embeds: [], components: [] });
      await startFishingWithEquipment(messageObj, userId);
    } else if (action === 'guide') {
      // 낚시 가이드 표시
      await showFishingGuide(interaction);
    } else if (action === 'back') {
      // 장비 메뉴로 돌아가기
      const { showFishingEquipmentMenu } = require('../../commands/fishingCommand');
      
      // 메시지 객체 생성
      const messageObj = {
        author: {
          id: userId,
          displayAvatarURL: () => interaction.user.displayAvatarURL()
        },
        reply: async (content) => {
          await interaction.update(content);
        }
      };
      
      await showFishingEquipmentMenu(messageObj);
    }
  } catch (error) {
    console.error('Error handling fishing equipment button:', error);
    
    // 이미 응답한 경우 followUp 사용, 그렇지 않으면 reply 사용
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({
          content: 'An error occurred while processing your request.',
          flags: 64
        });
      } else {
        await interaction.reply({
          content: 'An error occurred while processing your request.',
          flags: 64
        });
      }
    } catch (replyError) {
      console.error('Error sending error message:', replyError);
    }
  }
}


/**
 * 낚시 가이드 표시
 * @param {Object} interaction - 인터랙션 객체
 */
async function showFishingGuide(interaction) {
  const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
  
  const guideEmbed = new EmbedBuilder()
    .setTitle('🎣 Fishing Game Guide')
    .setDescription('Learn how to master the art of fishing!')
    .setColor('#00ff7f')
    .addFields(
      {
        name: '🎯 Game Objective',
        value: 'Catch fish by managing line tension within the safe range for 20 turns or until the fish\'s health reaches 0.',
        inline: false
      },
      {
        name: '🎮 Controls',
        value: `⏪ **Hard Slack** - Reduces tension by 20-30
◀️ **Slow Slack** - Reduces tension by 5-15
⏸️ **Wait** - No tension change
▶️ **Slow Reel** - Increases tension by 5-15
⏩ **Hard Reel** - Increases tension by 20-30`,
        inline: false
      },
      {
        name: '📊 Tension System',
        value: `🟢 **Safe Range** - Deal damage to fish (varies per fish)
⬜ **Danger Zone** - No damage, risk of line break
🔘 **Current Position** - Your line tension marker
💥 **Line Break** - Game over if tension reaches 0 or 100`,
        inline: false
      },
      {
        name: '🐟 Fish Behavior',
        value: `Fish will randomly change their behavior each turn:
- **Strong Pull** - Increases tension significantly
- **Slackening Off** - Decreases tension significantly  
- **Nibbling** - Moderate tension increase
- **Drifting** - Moderate tension decrease
- **Recover** - Fish heals some health`,
        inline: false
      },
      {
        name: '🎣 Equipment System',
        value: `**Rods:**
- Basic Rod: DMG 20, STR 1.0, LUCK 0
- Better rods have higher damage, strength, and luck

**Baits:**
- Increase luck for better fish and variants
- Consumed after each fishing session`,
        inline: false
      },
      {
        name: '⭐ Fish & Rarities',
        value: `**Rarities:** Common → Uncommon → Rare → Epic → Legendary
**Stars:** Larger fish = more valuable (luck affects star chance)
**Variants:** Special modifiers with value multipliers
**Size:** Affects fish health and value`,
        inline: false
      },
      {
        name: '🏆 Win Conditions',
        value: `✅ **Success:** Reduce fish health to 0
❌ **Line Break:** Tension reaches 0 or 100
⏰ **Time Up:** 20 turns expire without catching`,
        inline: false
      },
      {
        name: '💡 Pro Tips',
        value: `• Stay in the green safe range as much as possible
- Watch fish behavior patterns
- Use equipment that matches your playstyle
- Higher strength rods reduce fish tension effects
- Luck affects fish rarity and star chances`,
        inline: false
      }
    )
    .setFooter({ text: 'Good luck and happy fishing! 🎣' });

  const backButton = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`fishing_back_${interaction.user.id}`)
        .setLabel('Back to Equipment')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('⬅️')
    );

  await interaction.reply({
    embeds: [guideEmbed],
    components: [backButton],
    flags: 64
  });
}

/**
 * 낚싯대 선택 UI 표시
 * @param {Object} interaction - 인터랙션 객체
 */
async function showRodSelection(interaction) {
  const userId = interaction.user.id;
  const { getUserInventory } = require('../../database/inventoryModel');
  const { getUserFishingEquipment } = require('../../database/fishingEquipment');
  const { ITEM_DETAILS, ITEM_CATEGORIES, ITEM_DISPLAY_NAMES } = require('../../database/itemTypes');
  
  const inventory = getUserInventory(userId);
  const equipment = getUserFishingEquipment(userId);
  
  // 사용 가능한 낚싯대 목록
  const availableRods = Object.entries(inventory)
    .filter(([itemType, count]) => {
      const details = ITEM_DETAILS[itemType];
      return details && details.category === ITEM_CATEGORIES.ROD && count > 0;
    });
  
  // 선택 메뉴 생성
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`fishing_select_rod_${userId}`)
    .setPlaceholder('Select a fishing rod')
    .setMinValues(1)
    .setMaxValues(1);
  
  // 기본 낚싯대 옵션 추가 (항상 표시)
  const isCurrentlyBasic = !equipment.rod;
  selectMenu.addOptions({
    label: isCurrentlyBasic ? 'Basic Rod (Currently Equipped)' : 'Basic Rod',
    description: 'DMG: 20, STR: 1.0, LUCK: 0',
    value: 'basic'
  });
  
  // 인벤토리 낚싯대 옵션 추가
  for (const [itemType, count] of availableRods) {
    const details = ITEM_DETAILS[itemType];
    const isCurrentlyEquipped = equipment.rod === itemType;
    selectMenu.addOptions({
      label: isCurrentlyEquipped 
        ? `${ITEM_DISPLAY_NAMES[itemType]} (Currently Equipped) (${count})` 
        : `${ITEM_DISPLAY_NAMES[itemType]} (${count})`,
      description: `DMG: ${details.damage}, STR: ${details.strength}, LUCK: ${details.baseLuck || 0}`,
      value: itemType
    });
  }
  
  const row = new ActionRowBuilder().addComponents(selectMenu);
  
  await interaction.reply({
    content: 'Select a fishing rod:',
    components: [row],
    flags: 64
  });
}

/**
 * 미끼 선택 UI 표시
 * @param {Object} interaction - 인터랙션 객체
 */
async function showBaitSelection(interaction) {
  const userId = interaction.user.id;
  const { getUserInventory } = require('../../database/inventoryModel');
  const { getUserFishingEquipment } = require('../../database/fishingEquipment');
  const { ITEM_DETAILS, ITEM_CATEGORIES, ITEM_DISPLAY_NAMES } = require('../../database/itemTypes');
  
  const inventory = getUserInventory(userId);
  const equipment = getUserFishingEquipment(userId);
  
  // 사용 가능한 미끼 목록
  const availableBaits = Object.entries(inventory)
    .filter(([itemType, count]) => {
      const details = ITEM_DETAILS[itemType];
      return details && details.category === ITEM_CATEGORIES.BAIT && count > 0;
    });
  
  // 선택 메뉴 생성
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`fishing_select_bait_${userId}`)
    .setPlaceholder('Select bait')
    .setMinValues(1)
    .setMaxValues(1);
  
  // 미끼 없음 옵션 추가 (항상 표시)
  const isCurrentlyNone = !equipment.bait;
  selectMenu.addOptions({
    label: isCurrentlyNone ? 'No Bait (Currently Selected)' : 'No Bait',
    description: 'Fish without bait',
    value: 'none'
  });
  
  // 인벤토리 미끼 옵션 추가
  for (const [itemType, count] of availableBaits) {
    const details = ITEM_DETAILS[itemType];
    const isCurrentlyEquipped = equipment.bait === itemType;
    selectMenu.addOptions({
      label: isCurrentlyEquipped 
        ? `${ITEM_DISPLAY_NAMES[itemType]} (Currently Equipped) (${count})` 
        : `${ITEM_DISPLAY_NAMES[itemType]} (${count})`,
      description: `Luck: +${details.baseLuck || 0}, Variant: +${details.variantLuck || 0}%, Special: +${details.specialLuck || 0}%`,
      value: itemType
    });
  }
  
  const row = new ActionRowBuilder().addComponents(selectMenu);
  
  await interaction.reply({
    content: 'Select bait:',
    components: [row],
    flags: 64
  });
}

module.exports = {
  handleFishingEquipmentButton
};