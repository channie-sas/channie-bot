// src/commands/profileCommand.js
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { initUserData, saveUserDataThrottled } = require('../database/userData');
const { config } = require('../../config');

/**
 * 유저 프로필 표시 명령어 처리
 * @param {Object} message - 메시지 객체
 * @param {Array} args - 명령어 인자
 */
async function handleProfileCommand(message, args) {
    try {
      let targetUser = message.author;
      let targetUserId = message.author.id;
      
      // 멘션된 사용자가 있는지 확인
      if (message.mentions.users.size > 0) {
        targetUser = message.mentions.users.first();
        targetUserId = targetUser.id;
      }
      
      // 유저 데이터 가져오기
      const userData = initUserData(targetUserId);
      
      // 서버 멤버 정보 가져오기
      const member = await message.guild.members.fetch(targetUserId);
      
      // 사용자 프로필 생성
      const embed = await createProfileEmbed(targetUser, member, userData);
      
      // 현재 시간 업데이트 (본인 프로필을 볼 때만)
      if (targetUserId === message.author.id) {
        userData.profile.lastActive = Date.now();
        saveUserDataThrottled();
      }
      
      // 네비게이션 버튼 생성
      const navigationRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
            .setCustomId(`nav_profile_${targetUserId}_${message.author.id}`)
            .setLabel('Profile')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(true),
            new ButtonBuilder()
            .setCustomId(`nav_inventory_${targetUserId}_${message.author.id}`)
            .setLabel('Inventory')
            .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
            .setCustomId(`nav_collection_${targetUserId}_${message.author.id}`)
            .setLabel('Collection')
            .setStyle(ButtonStyle.Secondary)
        );
      
      await message.reply({ 
        embeds: [embed],
        components: [navigationRow]
      });
    } catch (error) {
      console.error('Error handling profile command:', error);
      await message.reply('An error occurred while displaying the profile. Please try again later.');
    }
  }

/**
 * 프로필 임베드 생성 함수
 */
async function createProfileEmbed(user, member, userData) {
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
  const discordJoinDate = new Date(user.createdTimestamp).toLocaleDateString();
  const lastActiveDate = new Date(profile.lastActive).toLocaleDateString();
  
    // 보유 칭호 목록 (시스템 칭호 확인)
    const { loadSystemTitles } = require('../commands/adminCommands');
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
    .setTitle(`${user.username}'s Profile`)
    .setColor('#0099ff')
    .setThumbnail(user.displayAvatarURL())
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
  
  return embed;
}

/**
 * 프로필 편집 명령어 처리
 * @param {Object} message - 메시지 객체
 * @param {Array} args - 명령어 인자
 */
async function handleProfileEditCommand(message, args) {
  try {
    const userId = message.author.id;
    const userData = initUserData(userId);
    
    // 프로필 정보가 없으면 초기화
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
    
    if (!userData.profile.customInfo) {
      userData.profile.customInfo = {};
    }
    
    // 인자 확인
    if (args.length < 2) {
      await message.reply('Please specify what you want to edit and the new value. Example: `cpf edit b Your bio here`');
      return;
    }
    
    const editType = args[0].toLowerCase();
    const newValue = args.slice(1).join(' ');
    
    // 편집 타입에 따라 처리
    switch (editType) {
      case 'a':
        userData.profile.customInfo.age = newValue;
        await message.reply('Your age has been updated successfully!');
        break;
      case 'p':
        userData.profile.customInfo.pronoun = newValue;
        await message.reply('Your pronoun has been updated successfully!');
        break;
      case 'm':
        userData.profile.customInfo.mbti = newValue;
        await message.reply('Your MBTI has been updated successfully!');
        break;
      case 'z':
        userData.profile.customInfo.zodiac = newValue;
        await message.reply('Your zodiac sign has been updated successfully!');
        break;
      case 'c':
        userData.profile.customInfo.collectingSeries = newValue;
        await message.reply('Your collecting series has been updated successfully!');
        break;
      case 'h':
        userData.profile.customInfo.hobby = newValue;
        await message.reply('Your hobby has been updated successfully!');
        break;
      case 'b':
        userData.profile.customInfo.bio = newValue;
        await message.reply('Your bio has been updated successfully!');
        break;
      default:
        await message.reply('Invalid edit option. Available options: a (age), p (pronoun), m (mbti), z (zodiac), c (series), h (hobby), b (bio)');
        return;
    }
    
    // 변경사항 저장
    saveUserDataThrottled();
    
  } catch (error) {
    console.error('Error handling profile edit command:', error);
    await message.reply('An error occurred while updating your profile. Please try again later.');
  }
}

/**
 * 관리자용 칭호 추가 명령어
 * @param {Object} message - 메시지 객체
 * @param {Array} args - 명령어 인자
 */
async function handleAddTitleCommand(message, args) {
  try {
    // 관리자 권한 확인
    if (!message.member.permissions.has('ADMINISTRATOR')) {
      await message.reply('You need administrator permissions to use this command.');
      return;
    }
    
    // 인자 확인
    if (args.length < 3) {
      await message.reply('Please specify a user and the title to add. Example: `ad name add @user New Title`');
      return;
    }
    
    // 사용자 확인
    const targetUser = message.mentions.users.first();
    if (!targetUser) {
      await message.reply('Please mention a valid user.');
      return;
    }
    
    const titleName = args.slice(2).join(' ');
    
    // 유저 데이터 가져오기
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
    
    // 이미 있는 칭호인지 확인
    if (userData.profile.titles.includes(titleName)) {
      await message.reply(`${targetUser.username} already has the title "${titleName}".`);
      return;
    }
    
    // 칭호 추가
    userData.profile.titles.push(titleName);
    saveUserDataThrottled();
    
    await message.reply(`Title "${titleName}" has been added to ${targetUser.username}'s profile.`);
    
  } catch (error) {
    console.error('Error handling add title command:', error);
    await message.reply('An error occurred while adding the title. Please try again later.');
  }
}

module.exports = {
  handleProfileCommand,
  handleProfileEditCommand,
  handleAddTitleCommand
};