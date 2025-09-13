// src/commands/burnCard.js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { initUserData } = require('../database/userData');
const { addUserItem } = require('../database/inventoryModel');
const { findUserCard, removeCardFromUser } = require('../database/cardModel');
const { ITEM_TYPES } = require('../database/itemTypes');
const { incrementBurnedCardStat } = require('../database/cardStats');

/**
 * 카드 태우기 명령어 처리 함수
 * 사용자가 보유한 카드를 태워서 재화를 얻는 기능
 */
async function handleBurnCardCommand(message, args) {
  const userId = message.author.id;
  
  // 사용자 데이터 초기화
  const userData = initUserData(userId);
  
  // args가 없는 경우 가장 최근에 획득한 카드 사용
  if (args.length < 1) {
    if (!userData.cards || userData.cards.length === 0) {
      message.reply("You don't have any cards to burn.");
      return;
    }
    
    // 카드를 획득 시간 기준 내림차순으로 정렬하여 가장 최근 카드 찾기
    const sortedCards = [...userData.cards].sort((a, b) => b.obtainedAt - a.obtainedAt);
    const recentCard = sortedCards[0];
    
    if (!recentCard) {
      message.reply("Unable to find your most recent card.");
      return;
    }
    
    // 최근 카드로 처리 진행
    showBurnConfirmation(message, recentCard);
    return;
  }

  const cardId = args[0];

  // 사용자의 카드 찾기
  const card = findUserCard(userId, cardId);
  
  // 카드가 존재하지 않는 경우
  if (!card) {
    message.reply("Card not found in your collection. Please check the card ID.");
    return;
  }
  
  // 카드 확인 메시지 표시
  showBurnConfirmation(message, card);
}

/**
 * 카드 태우기 확인 메시지 표시 함수
 * @param {Message} message - Discord 메시지 객체
 * @param {Object} card - 태울 카드 객체
 */
async function showBurnConfirmation(message, card) {
  // 카드 정보 표시
  const gValue = card.gValue || 0;

  // 획득할 재화 계산 (확정 값은 버튼 클릭 시에 결정됨)
  const { minCredits, maxCredits, minFragments, maxFragments, starFragment } = calculateRewards(gValue);
  
  // 획득일 표시용 날짜 포맷팅
  const obtainedDate = card.obtainedAt ? new Date(card.obtainedAt).toLocaleString() : 'Unknown';

  // 카드 태우기 확인 임베드 생성
  const embed = new EmbedBuilder()
    .setTitle("Confirm Card Burning")
    .setDescription(`Are you sure you want to burn the following card?\nThis action cannot be undone.`)
    .addFields(
      { name: "Card", value: `${card.name}${card.variant ? ` (${card.variant})` : ''}`, inline: true },
      { name: "Series", value: card.series || 'Unknown', inline: true },
      { name: "G-Value", value: `G•${gValue}`, inline: true },
      { name: "Obtained At", value: obtainedDate, inline: false },
      { name: "Potential Rewards", value: 
        `Credits: ${minCredits}-${maxCredits}\n` +
        `Card Fragments: ${minFragments}-${maxFragments}` +
        (starFragment ? '\nStar Fragment: 1' : '')
      }
    )
    .setColor("#ff5555")
    .setFooter({ text: `Card ID: ${card.uniqueId} • This interaction will expire in 30 seconds` });

  // 확인 및 취소 버튼 생성 (체크 아이콘과 X 아이콘 사용)
  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`burn_confirm_${card.uniqueId}`)
        .setLabel('✓ Confirm')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`burn_cancel_${card.uniqueId}`)
        .setLabel('✗ Cancel')
        .setStyle(ButtonStyle.Danger)
    );

  // 메시지 전송
  const sentMessage = await message.reply({ embeds: [embed], components: [row] });
  
  // 30초 후 버튼 비활성화 (상호작용 만료)
  setTimeout(async () => {
    try {
      // 메시지가 아직 존재하고 components가 있는지 확인
      const fetchedMessage = await message.channel.messages.fetch(sentMessage.id).catch(() => null);
      if (fetchedMessage && fetchedMessage.components && fetchedMessage.components.length > 0) {
        await fetchedMessage.edit({ 
          components: [],
          embeds: [
            EmbedBuilder.from(embed)
              .setFooter({ text: 'This interaction has expired' })
              .setColor('#808080')
          ]
        });
      }
    } catch (error) {
      console.error('Error disabling burn card buttons:', error);
    }
  }, 30000); // 30초 타임아웃
}

/**
 * 카드 태우기 버튼 인터랙션 처리
 * burnCard.js에서 정의했지만 buttonHandlers.js에서 호출되는 함수
 */
async function handleBurnCardInteraction(interaction) {
  const customId = interaction.customId;
  const cardId = customId.replace(/^burn_(confirm|cancel)_/, '');
  const isConfirm = customId.startsWith('burn_confirm_');
  
  // 원래 메시지 작성자와 상호작용한 사용자가 같은지 확인
  const originalMessage = interaction.message;
  
  // 메시지가 리플라이인 경우 원래 사용자 ID 확인
  if (originalMessage.reference && originalMessage.mentions.repliedUser) {
    const originalUserId = originalMessage.mentions.repliedUser.id;
    
    // 다른 사용자가 버튼을 클릭하는 경우 차단
    if (originalUserId !== interaction.user.id) {
      await interaction.reply({ 
        content: "You cannot interact with another user's card burning buttons.", 
        ephemeral: true 
      });
      return;
    }
  }
  
  // 취소한 경우
  if (!isConfirm) {
    await interaction.update({ 
      content: "Card burning cancelled.", 
      embeds: [], 
      components: [] 
    });
    return;
  }

  const userId = interaction.user.id;
  const card = findUserCard(userId, cardId);
  
  // 카드가 존재하지 않는 경우 (이미 태워진 경우 등)
  if (!card) {
    await interaction.update({ 
      content: "Card not found. It may have already been burned or removed.", 
      embeds: [], 
      components: [] 
    });
    return;
  }

  // 사용자 데이터 초기화
  const userData = initUserData(userId);
  
  // g값 확인
  const gValue = card.gValue || 0;
  
  // 기존 카드 제거 방식을 removeCardFromUser 함수로 대체
  const removeResult = removeCardFromUser(userId, card.uniqueId, true);
  
  if (removeResult.success) {
    // 소각 통계 업데이트 추가 - 카드 ID와 레벨 정보 확인
    const cardId = card.cardId || "unknown"; // cardId가 없으면 "unknown" 사용
    const variant = card.variant || "v1"; // variant가 없으면 "v1" 사용
    const level = card.level || 1; // level이 없으면 1 사용
      
    // 소각 통계 증가 - 이제 카드 정보가 제거되더라도 소각 통계는 업데이트
    incrementBurnedCardStat(cardId, userId, variant, level);
    
    // 랜덤 보상 계산
    const { credits, fragments, starFragment } = generateRandomRewards(gValue, card.level || 1);
    
    // 보상 지급
    addUserItem(userId, ITEM_TYPES.CREDIT, credits);
    addUserItem(userId, ITEM_TYPES.CARD_FRAGMENT, fragments);
    
    // 별의 조각이 있다면 지급
    if (starFragment && ITEM_TYPES.STAR_FRAGMENT) {
      addUserItem(userId, ITEM_TYPES.STAR_FRAGMENT, starFragment);
    }
    
    // 결과 임베드 생성
    const resultEmbed = new EmbedBuilder()
      .setTitle("Card Burned Successfully")
      .setDescription(`You have burned ${card.name}${card.variant ? ` (${card.variant})` : ''} and received:`)
      .addFields(
        { name: "Card Info", value: `Series: ${card.series || 'Unknown'}\nG-Value: G•${gValue}`, inline: false },
        { name: "Rewards Received", value: 
          `**${credits}** Credits\n` +
          `**${fragments}** Card Fragments` +
          (starFragment ? `\n**${starFragment}** Star Fragment` : ''),
          inline: false
        }
      )
      .setColor("#00aa00")
      .setFooter({ text: `Your card has been converted to valuable resources! Use them wisely.` });
    
    // 버튼 완전히 제거
    await interaction.update({ embeds: [resultEmbed], components: [] });
  } else {
    await interaction.update({ 
      content: "Error burning card. Please try again.", 
      embeds: [], 
      components: [] 
    });
  }
}

/**
 * gValue에 따른 최소/최대 보상 범위 계산 함수
 */
function calculateRewards(gValue) {
  // g값에 따른 보상 계산
  if (gValue >= 500) {
    return { minCredits: 10, maxCredits: 50, minFragments: 1, maxFragments: 3, starFragment: 0 };
  } else if (gValue >= 250) {
    return { minCredits: 30, maxCredits: 70, minFragments: 2, maxFragments: 5, starFragment: 0 };
  } else if (gValue >= 100) {
    return { minCredits: 50, maxCredits: 100, minFragments: 3, maxFragments: 7, starFragment: 0 };
  } else if (gValue >= 50) {
    return { minCredits: 70, maxCredits: 200, minFragments: 5, maxFragments: 15, starFragment: 0 };
  } else if (gValue >= 10) {
    return { minCredits: 300, maxCredits: 700, minFragments: 15, maxFragments: 50, starFragment: 0 };
  } else if (gValue >= 5) {
    return { minCredits: 500, maxCredits: 1500, minFragments: 25, maxFragments: 70, starFragment: 0 };
  } else {
    return { minCredits: 2500, maxCredits: 7000, minFragments: 50, maxFragments: 150, starFragment: 1 };
  }
}

/**
 * 카드 레벨을 고려한 실제 랜덤 보상 생성 함수
 */
function generateRandomRewards(gValue, level = 1) {
  const { minCredits, maxCredits, minFragments, maxFragments, starFragment } = calculateRewards(gValue);
  
  // 카드 레벨에 따른 보상 승수 계산 (레벨 1: 1x, 레벨 2: 1.5x, 레벨 3: 2x, 레벨 4: 2.5x, 레벨 5+: 3x)
  const levelMultiplier = 1 + (Math.min(level, 5) - 1) * 0.5;
  
  // 크레딧 랜덤 값에 레벨 승수 적용
  const credits = Math.floor((Math.floor(Math.random() * (maxCredits - minCredits + 1)) + minCredits) * levelMultiplier);
  
  // 카드 조각 랜덤 값에 레벨 승수 적용
  const fragments = Math.floor((Math.floor(Math.random() * (maxFragments - minFragments + 1)) + minFragments) * levelMultiplier);
  
  // 별의 조각은 고레벨 또는 저G값 카드에서만 나오도록
  const isHighLevelOrRare = level >= 5 || gValue <= 10;
  const finalStarFragment = isHighLevelOrRare ? starFragment : 0;
  
  return {
    credits,
    fragments,
    starFragment: finalStarFragment
  };
}

module.exports = {
  handleBurnCardCommand,
  handleBurnCardInteraction,
  showBurnConfirmation
};