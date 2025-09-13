// helpCommand.js - 봇 명령어 도움말 표시 기능
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { config } = require('../../config');

// 명령어 정보 - 명령어명과 설명을 매핑 (건물/작업 관련 명령어 제거)
const commandDescriptions = {
  'drop': 'Draw random cards',
  'd': 'Short for drop, draw random cards',
  'c': 'View your card collection',
  'cd': 'Check your cooldowns',
  'lu': 'Look up card information by name or ID',
  'lvl': 'Level up your card by consuming other cards',
  'b': 'Burn cards to get resources',
  'burn': 'Burn cards to get resources',
  'i': 'Check your inventory (resources, currency)',
  'mod': 'Modify items',
  'g': 'Give items or cards to other users',
  'ad': 'Admin card commands',
  'sl': 'View series list',
  'special': 'Special card variant commands',
  'set': 'Set channel configurations',
  'wl': 'Check your wishlist',
  'wishlist': 'Check your wishlist',
  'event': 'Manage events',
  'pf': 'View @user\'s profile or edit your profile',
  'fish': 'Go fishing with your equipment',
  'f': 'Quick fishing with current equipment',
  'cf': 'View fish collection',
  'a': 'Admin commands',
  'config': 'Configure bot settings',
  'help': 'Show this help message',
  'h': 'Short for help, show this help message'
};

// 명령어를 카테고리별로 그룹화 (건물/작업 관련 명령어 제거 및 낚시 추가)
const commandCategories = {
  'Card Collection': ['drop', 'd', 'c', 'cd', 'lu', 'lvl', 'b', 'burn', 'wl', 'wishlist'],
  'Resources & Items': ['i', 'g'],
  'Fishing': ['fish', 'f', 'cf'],
  'Profile & Misc': ['pf'],
  'Admin Commands': ['mod', 'ad', 'special', 'set', 'event', 'a', 'config'],
  'Help': ['help', 'h']
};

/**
 * 도움말 명령어 처리 함수
 * @param {Object} message - 메시지 객체
 * @param {Array} args - 명령어 인자
 */
async function handleHelpCommand(message, args) {
  const PREFIX = 'c'; // 명령어 접두사
  
  // 특정 명령어의 도움말을 요청한 경우
  if (args.length > 0) {
    const commandName = args[0].toLowerCase();
    if (commandDescriptions[commandName]) {
      const embed = new EmbedBuilder()
        .setTitle(`Command: ${PREFIX}${commandName}`)
        .setDescription(commandDescriptions[commandName])
        .setColor('#00AAFF');
      
      await message.channel.send({ embeds: [embed] });
      return;
    }
  }
  
  // 모든 명령어 도움말 표시
  const mainEmbed = new EmbedBuilder()
    .setTitle('Card Collector Bot Commands')
    .setDescription(`All commands must be prefixed with \`${PREFIX}\`. Example: \`${PREFIX}help\``)
    .setColor('#00AAFF')
    .setFooter({ text: 'Use chelp [command] for more details about a specific command' });

  // 카테고리별로 명령어 추가
  for (const [category, commands] of Object.entries(commandCategories)) {
    // 중복 제거를 위한 Set 사용 (별칭이 있는 경우 등)
    const uniqueCommands = new Set(commands);
    
    const commandList = Array.from(uniqueCommands)
      .map(cmd => `\`${PREFIX}${cmd}\` - ${commandDescriptions[cmd]}`)
      .join('\n');
    
    mainEmbed.addFields({ name: category, value: commandList });
  }

  await message.channel.send({ embeds: [mainEmbed] });
}

module.exports = { handleHelpCommand };