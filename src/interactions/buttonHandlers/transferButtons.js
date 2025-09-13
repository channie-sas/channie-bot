// src/interactions/buttonHandlers/transferButtons.js
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { 
  acceptCardTransfer,
  rejectCardTransfer,
  getCardTransferStatus
} = require('../../database/cardTransferModel');

/**
 * 카드 전송 관련 버튼 핸들러
 * @param {Object} interaction - 상호작용 객체
 */
async function handleTransferInteraction(interaction) {
  const customId = interaction.customId;
  
  // 카드 전송 수락 버튼 처리
  if (customId.startsWith('transfer_accept_sender_') || customId.startsWith('transfer_accept_receiver_')) {
    try {
      const parts = customId.split('_');
      const transferId = parts.slice(3).join('_');
      const userId = interaction.user.id;
      const userType = customId.includes('sender') ? 'sender' : 'receiver';
      
      const transferStatus = getCardTransferStatus(transferId);
      if (!transferStatus) {
        await interaction.reply({ content: "This transfer request has expired or doesn't exist.", ephemeral: true });
        return;
      }
      
      // 권한 확인 - 적절한 사용자만 해당 버튼을 클릭할 수 있도록
      if ((userType === 'sender' && userId !== transferStatus.fromUserId) || 
          (userType === 'receiver' && userId !== transferStatus.toUserId)) {
        await interaction.reply({ 
          content: userType === 'sender' ? "Only the sender can confirm this transfer." : "Only the receiver can accept this transfer.", 
          ephemeral: true 
        });
        return;
      }
      
      const result = acceptCardTransfer(transferId, userId);
      
      if (!result.success) {
        await interaction.reply({ content: result.message, ephemeral: true });
        return;
      }
      
      // 양쪽 모두 수락한 경우
      if (result.transferredCards) {
        const cardList = result.transferredCards.map(card => {
          const gValue = card.gValue ? `G•${card.gValue}` : '';
          return `${card.name} (${card.series}) ${gValue}`;
        }).join('\n');
        
        const embed = new EmbedBuilder()
          .setTitle('Card Transfer Complete')
          .setDescription(`The card transfer has been completed successfully.`)
          .addFields({ name: 'Cards Transferred', value: cardList })
          .addFields({ name: 'Transfer Fee', value: `${result.fee} credits` })
          .setColor('#00ff00');
        
        // 모든 버튼 비활성화
        const disabledRow = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`transfer_accepted`)
              .setLabel('✓ Transfer Completed')
              .setStyle(ButtonStyle.Success)
              .setDisabled(true)
          );
        
        await interaction.update({ embeds: [embed], components: [disabledRow] });
      } else {
        // 한 쪽만 수락한 경우 - 버튼 상태만 업데이트
        const updatedRow = new ActionRowBuilder();
        
        if (userType === 'sender') {
          updatedRow.addComponents(
            new ButtonBuilder()
              .setCustomId(`transfer_accept_sender_${transferId}`)
              .setLabel('✓ Sender Confirmed')
              .setStyle(ButtonStyle.Success)
              .setDisabled(true),
            new ButtonBuilder()
              .setCustomId(`transfer_accept_receiver_${transferId}`)
              .setLabel('✓ Receiver Accept')
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId(`transfer_reject_${transferId}`)
              .setLabel('✗ Cancel')
              .setStyle(ButtonStyle.Danger)
          );
        } else {
          updatedRow.addComponents(
            new ButtonBuilder()
              .setCustomId(`transfer_accept_sender_${transferId}`)
              .setLabel('✓ Sender Confirm')
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId(`transfer_accept_receiver_${transferId}`)
              .setLabel('✓ Receiver Confirmed')
              .setStyle(ButtonStyle.Success)
              .setDisabled(true),
            new ButtonBuilder()
              .setCustomId(`transfer_reject_${transferId}`)
              .setLabel('✗ Cancel')
              .setStyle(ButtonStyle.Danger)
          );
        }
        
        // 기존 임베드 가져오기 및 업데이트
        const originalEmbed = interaction.message.embeds[0];
        const updatedEmbed = EmbedBuilder.from(originalEmbed)
          .setDescription(originalEmbed.description + `\n\n${userType === 'sender' ? 'Sender' : 'Receiver'} has confirmed.`);
        
        await interaction.update({ embeds: [updatedEmbed], components: [updatedRow] });
      }
    } catch (error) {
      console.error('Error processing card transfer acceptance:', error);
      await interaction.reply({ content: 'An error occurred while processing the transfer.', ephemeral: true });
    }
  }
  
  // 전송 거절 버튼 처리
  else if (customId.startsWith('transfer_reject_')) {
    try {
      const parts = customId.split('_');
      const transferId = parts.slice(2).join('_');
      const userId = interaction.user.id;
      
      const result = rejectCardTransfer(transferId, userId);
      
      if (!result.success) {
        await interaction.reply({ content: result.message, ephemeral: true });
        return;
      }
      
      const embed = new EmbedBuilder()
        .setTitle('Card Transfer Cancelled')
        .setDescription('The card transfer has been cancelled.')
        .setColor('#ff0000');
      
      const disabledRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`transfer_cancelled`)
            .setLabel('✗ Transfer Cancelled')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(true)
        );
      
      await interaction.update({ embeds: [embed], components: [disabledRow] });
    } catch (error) {
      console.error('Error processing card transfer rejection:', error);
      await interaction.reply({ content: 'An error occurred while cancelling the transfer.', ephemeral: true });
    }
  }
}

module.exports = {
  handleTransferInteraction
};