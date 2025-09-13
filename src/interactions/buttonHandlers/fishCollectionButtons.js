// src/interactions/buttonHandlers/fishCollectionButtons.js
// 물고기 컬렉션 버튼 핸들러 (간소화 버전)

/**
 * 물고기 컬렉션 페이지네이션 핸들러
 * @param {Object} interaction - 상호작용 객체
 */
async function handleFishCollectionPagination(interaction) {
  const customId = interaction.customId;
  const parts = customId.split('_');
  const action = parts[1]; // 'first', 'prev', 'next', 'last'
  const targetUserId = parts[2];
  const currentPage = parseInt(parts[3] || '1');
  const callerId = parts[4]; // 버튼을 누를 수 있는 사용자 ID
  const sortOption = parts[5] || 'recent'; // 정렬 옵션 (기본값: recent)
  
  // 다른 사용자의 버튼 클릭 방지
  if (interaction.user.id !== callerId) {
    await interaction.reply({ 
      content: 'You can only interact with buttons on messages you requested.',
      ephemeral: true 
    });
    return;
  }
  
  try {
    // 페이지 계산
    let newPage = currentPage;
    
    // 총 페이지 수 계산을 위해 데이터 가져오기
    const { initUserData } = require('../../database/userData');
    const user = initUserData(targetUserId);
    const fishCount = user.fish ? user.fish.length : 0;
    const totalPages = Math.ceil(fishCount / 15);
    
    switch (action) {
      case 'first':
        newPage = 1;
        break;
      case 'prev':
        newPage = Math.max(1, currentPage - 1);
        break;
      case 'next':
        newPage = Math.min(totalPages, currentPage + 1);
        break;
      case 'last':
        newPage = totalPages;
        break;
      default:
        console.error(`Unknown action: ${action}`);
        return;
    }
    
    // 페이지 업데이트 (정렬 옵션 포함)
    const { updateFishCollectionPage } = require('../../commands/showFishCollection');
    await updateFishCollectionPage(interaction, targetUserId, newPage, sortOption);
    
  } catch (error) {
    console.error('Error handling fish collection pagination:', error);
    
    try {
      const errorMessage = {
        content: 'An error occurred while processing your request.',
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
  handleFishCollectionPagination
};