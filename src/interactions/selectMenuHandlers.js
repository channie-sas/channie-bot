// src/interactions/selectMenuHandlers.js

/**
 * 선택 메뉴 인터랙션 핸들러
 * @param {Object} interaction - 상호작용 객체
 */
async function handleSelectMenuInteraction(interaction) {
  if (!interaction.isStringSelectMenu()) return;
  
  const customId = interaction.customId;
  
  // 웨어울프 게임 선택 메뉴 처리
  if (customId.startsWith('seer_') || 
    customId.startsWith('robber_') || 
    customId.startsWith('troublemaker_') || 
    customId.startsWith('drunk_') || 
    customId.startsWith('werewolf_vote_') ||
    customId.startsWith('werewolf_center') ||
    customId.startsWith('doppelganger_') ||
    customId.startsWith('mysticwolf_') ||
    customId.startsWith('apprenticeseer_') ||
    customId.startsWith('paranormal_') ||
    customId.startsWith('witch_')) {
    
    try {
        const { handleWerewolfSelectMenuInteraction } = require('../commands/werewolfGame');
        return await handleWerewolfSelectMenuInteraction(interaction);
    } catch (error) {
        console.error('Error handling werewolf select menu interaction:', error);
        
        try {
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'An error occurred while processing your werewolf game selection.',
                    ephemeral: true
                });
            } else {
                await interaction.followUp({
                    content: 'An error occurred while processing your werewolf game selection.',
                    ephemeral: true
                });
            }
        } catch (replyError) {
            console.error('Error sending werewolf select menu error reply:', replyError);
        }
        return;
    }
}
  
  // 레벨업 선택 메뉴 처리
  else if (customId.startsWith('levelup_select_')) {
    try {
      const parts = customId.split('_');
      const targetCardId = parts[2];
      const materialCardId = interaction.values[0]; // 선택된 값 (카드 ID)
      
      // 레벨업 확인 메시지 생성
      const { handleLevelUpSelection } = require('../commands/cardLevelUp');
      await handleLevelUpSelection(interaction, targetCardId, materialCardId);
    } catch (error) {
      console.error('Error handling level up selection:', error);
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: 'An error occurred while processing the level up selection.',
            flags: 64
          });
        }
      } catch (replyError) {
        console.error('Error sending error message:', replyError);
      }
    }
  }
  
  // 낚시 장비 선택 처리
  else if (customId.startsWith('fishing_select_')) {
    await handleFishingEquipmentSelection(interaction);
  }
  
  // 물고기 컬렉션 정렬 선택 처리 (새로 추가)
  else if (customId.startsWith('fcf_select_sort_')) {
    await handleFishCollectionSortSelection(interaction);
  }
  
  // 처리되지 않은 선택 메뉴 로깅
  else {
    console.log(`처리되지 않은 선택 메뉴 인터랙션: ${customId}`);
  }
}


// 낚시 장비 선택 처리
async function handleFishingEquipmentSelection(interaction) {
  const customId = interaction.customId;
  const [_, __, type, userId] = customId.split('_');
  const selected = interaction.values[0];
  
  // 사용자 확인
  if (interaction.user.id !== userId) {
    return interaction.reply({
      content: 'You can only modify your own equipment!',
      flags: 64
    });
  }
  
  try {
    if (type === 'rod') {
      const { equipRod, getUserFishingEquipment } = require('../database/fishingEquipment');
      const { saveUserDataThrottled } = require('../database/userData');
      
      if (selected === 'basic') {
        // 기본 낚싯대로 변경
        const equipment = getUserFishingEquipment(userId);
        
        // 현재 착용한 낚싯대가 있으면 인벤토리로 반환
        if (equipment.rod) {
          const { addUserItem } = require('../database/inventoryModel');
          addUserItem(userId, equipment.rod, 1);
        }
        
        // 기본 낚싯대로 설정
        equipment.rod = null;
        equipment.rodDurability = null;
        saveUserDataThrottled();
        
        await interaction.reply({
          content: 'Switched to Basic Rod',
          flags: 64
        });
      } else {
        // 인벤토리의 낚싯대로 변경
        const result = equipRod(userId, selected);
        await interaction.reply({
          content: result.message,
          flags: 64
        });
      }
    } else if (type === 'bait') {
      const { equipBait, getUserFishingEquipment } = require('../database/fishingEquipment');
      const { saveUserDataThrottled } = require('../database/userData');
      
      if (selected === 'none') {
        // 미끼 제거
        const equipment = getUserFishingEquipment(userId);
        equipment.bait = null;
        saveUserDataThrottled();
        
        await interaction.reply({
          content: 'Removed bait',
          flags: 64
        });
      } else {
        // 인벤토리의 미끼로 변경
        const result = equipBait(userId, selected);
        await interaction.reply({
          content: result.message,
          flags: 64
        });
      }
    }
  } catch (error) {
    console.error('Error handling equipment selection:', error);
    await interaction.reply({
      content: 'An error occurred while changing equipment.',
      flags: 64
    });
  }
}

// 물고기 컬렉션 정렬 선택 처리
async function handleFishCollectionSortSelection(interaction) {
  const customId = interaction.customId;
  
  // fcf_select_sort_[targetUserId]_[page] 형태
  const parts = customId.split('_');
  
  if (parts.length < 5) {
    console.error('Invalid fish collection select customId format:', customId);
    return interaction.reply({
      content: 'Invalid selection format.',
      flags: 64
    });
  }
  
  const targetUserId = parts[3];
  const page = parseInt(parts[4]);
  const selectedSort = interaction.values[0];
  
  // 본인 컬렉션만 정렬 가능
  if (interaction.user.id !== targetUserId) {
    return interaction.reply({
      content: 'You can only sort your own fish collection!',
      flags: 64
    });
  }
  
  try {
    // 선택된 정렬로 컬렉션 업데이트
    const { updateFishCollectionPage } = require('../commands/showFishCollection');
    
    // 새로운 정렬 옵션으로 첫 페이지부터 표시
    await updateFishCollectionPage(interaction, targetUserId, 1, selectedSort);
    
  } catch (error) {
    console.error('Error handling fish collection sort selection:', error);
    
    try {
      const errorMessage = {
        content: 'An error occurred while sorting your collection.',
        flags: 64
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
  handleSelectMenuInteraction,
  handleFishingEquipmentSelection,
  handleFishCollectionSortSelection // 새로 추가된 함수 export
};