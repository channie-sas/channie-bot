// src/commands/werewolfGame.js
const { 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    StringSelectMenuBuilder, 
    EmbedBuilder,
    PermissionsBitField
} = require('discord.js');
const { setActiveEvent, getActiveEvent, removeActiveEvent } = require('../database/eventModel');
const { addUserItem } = require('../database/inventoryModel');
const { ITEM_TYPES } = require('../database/itemTypes');
const { EVENT_TYPES } = require('../database/eventTypes');
const lockManager = require('../utils/gameLockManager');
const timerManager = require('../utils/gameTimerManager');

const ROLE_DETAILS = {
    werewolf: {
        detailedDescription: "You are a Werewolf, secretly trying to avoid getting caught.",
        strategy: "Strategy: If alone, check a center card. Act like a villager. Consider claiming to be a Seer or another information role. Accuse others confidently."
    },
    seer: {
        detailedDescription: "You have the power to see hidden information during the night.",
        strategy: "Strategy: Look at suspicious players or check center cards. Share your findings, but be aware Werewolves may claim to be Seer too."
    },
    robber: {
        detailedDescription: "You can steal another player's card and see what you've become.",
        strategy: "Strategy: Swap with someone you're suspicious of, or with someone who likely has a good role. Be careful - you might become a Werewolf!"
    },
    troublemaker: {
        detailedDescription: "You can swap two other players' cards without seeing them.",
        strategy: "Strategy: Swap two players to create confusion. Target suspicious players or those claiming powerful roles. This can protect villagers by moving a Werewolf card."
    },
    drunk: {
        detailedDescription: "You exchange your card with a center card without seeing it.",
        strategy: "Strategy: You won't know your new role. Be honest about being the Drunk - this helps track card movements. Try to get others to reveal information about what you might have become."
    },
    insomniac: {
        detailedDescription: "You wake up at the end of the night to check if your role has changed.",
        strategy: "Strategy: Share if your role changed or not - this helps track who might have affected you. Pay attention to Robber and Troublemaker claims."
    },
    villager: {
        detailedDescription: "You are a simple Villager with no special powers.",
        strategy: "Strategy: Observe carefully and look for inconsistencies in others' claims. Sometimes claiming Villager makes you seem innocent, but it can also make you an easy target."
    },
    tanner: {
        detailedDescription: "You hate your job and want to be voted out. You win ONLY if you get voted out.",
        strategy: "Strategy: Act suspicious without being too obvious. Make some logical errors in your claims. Your goal is different from everyone else - you want to be voted out!"
    },
    hunter: {
        detailedDescription: "If you are voted out, the player you voted for is also eliminated.",
        strategy: "Strategy: Make your ability known so others might avoid voting for you. If you suspect someone is a Werewolf, vote for them - even if you're eliminated, they will go down with you."
    },
    mason: {
        detailedDescription: "You wake up to see other Masons. You're on the village team.",
        strategy: "Strategy: Confirm with other Masons. If you're the only Mason awake, one or both other Mason cards might be in the center. This helps narrow down possibilities."
    },
    doppelganger: {
        detailedDescription: "You copy another player's role and gain their abilities.",
        strategy: "Strategy: Choose a player you think has a valuable role. You will see their card and become that role, using its ability during that role's turn. Adapt your strategy based on what role you copy."
    },
    witch: {
        detailedDescription: "You can secretly swap a center card with any player's card and see both.",
        strategy: "Strategy: This is powerful for creating confusion or fixing problematic card distributions. Consider swapping a Werewolf into the center or a powerful role to a player you trust."
    },
    mysticwolf: {
        detailedDescription: "You are a Werewolf who can also look at another player's card.",
        strategy: "Strategy: You have all Werewolf abilities plus extra information. Use this to your advantage by identifying important village roles and creating effective deflection strategies."
    },
    apprenticeseer: {
        detailedDescription: "You can look at one center card.",
        strategy: "Strategy: Similar to the Seer but with more limited information. Still valuable for the village team to narrow down possibilities about what cards might be in play."
    },
    paranormalinvestigator: {
        detailedDescription: "Look at up to two players' cards in sequence. If you see a Werewolf or Tanner, you stop and become that role.",
        strategy: "Strategy: Choose carefully who to investigate. If you become a Werewolf or Tanner mid-investigation, your win condition changes immediately!"
    }
};

// 역할 정의
const ROLES = {
    WEREWOLF: {
        id: 'werewolf',
        name: 'Werewolf',
        emoji: '🐺',
        description: 'Wake up and see other werewolves. Your goal is to avoid being voted out.',
        team: 'werewolves'
    },
    SEER: {
        id: 'seer',
        name: 'Seer',
        emoji: '👁️',
        description: 'Look at another player\'s role or two cards in the center.',
        team: 'villagers'
    },
    ROBBER: {
        id: 'robber',
        name: 'Robber',
        emoji: '🦝',
        description: 'Exchange your role with another player\'s role and see your new role.',
        team: 'villagers'
    },
    TROUBLEMAKER: {
        id: 'troublemaker',
        name: 'Troublemaker',
        emoji: '😈',
        description: 'Switch the roles of two other players without looking at them.',
        team: 'villagers'
    },
    DRUNK: {
        id: 'drunk',
        name: 'Drunk',
        emoji: '🍺',
        description: 'Exchange your role with a random card from the center without looking at it.',
        team: 'villagers'
    },
    INSOMNIAC: {
        id: 'insomniac',
        name: 'Insomniac',
        emoji: '😴',
        description: 'Check your role at the end of the night to see if it changed.',
        team: 'villagers'
    },
    VILLAGER: {
        id: 'villager',
        name: 'Villager',
        emoji: '👨‍🌾',
        description: 'You have no special ability. Try to identify the werewolves.',
        team: 'villagers'
    },
    TANNER: {
        id: 'tanner',
        name: 'Tanner',
        emoji: '☠️',
        description: 'You win only if you are voted out. You\'re on neither team.',
        team: 'tanner'
    },
    HUNTER: {
        id: 'hunter',
        name: 'Hunter',
        emoji: '🏹',
        description: 'If you are voted out, the player you voted for is eliminated too.',
        team: 'villagers'
    },
    MASON: {
        id: 'mason',
        name: 'Mason',
        emoji: '👷',
        description: 'Wake up and see other masons. You\'re on the village team.',
        team: 'villagers'
    },
    DOPPELGANGER: {
        id: 'doppelganger',
        name: 'Doppelganger',
        emoji: '🎭',
        description: 'Look at another player\'s card and become that role with its abilities.',
        team: 'villagers'
    },
    WITCH: {
        id: 'witch',
        name: 'Witch',
        emoji: '🧙',
        description: 'Swap a center card with any player\'s card, and view both cards.',
        team: 'villagers'
    },
    MYSTICWOLF: {
        id: 'mysticwolf',
        name: 'Mystic Wolf',
        emoji: '🌙',
        description: 'A Werewolf who can also look at another player\'s card.',
        team: 'werewolves'
    },
    APPRENTICESEER: {
        id: 'apprenticeseer',
        name: 'Apprentice Seer',
        emoji: '🔮',
        description: 'Look at one center card.',
        team: 'villagers'
    },
    PARANORMALINVESTIGATOR: {
        id: 'paranormalinvestigator',
        name: 'Paranormal Investigator',
        emoji: '🕵️',
        description: 'Look at up to two players\' cards. Stop if you see a Werewolf or Tanner and become that role.',
        team: 'villagers'
    }
};

// 기본 역할 설정 (인원수별)
const getDefaultRoles = (playerCount) => {
    const centerCards = 3;
    if (playerCount < 3 || playerCount > 15) return null;
    
    let roles = [];
    
    if (playerCount <= 4) {
        roles = [
            ROLES.WEREWOLF,
            ROLES.SEER,
            ROLES.ROBBER,
            ROLES.TROUBLEMAKER,
            ROLES.VILLAGER,
            ROLES.VILLAGER,
            ROLES.VILLAGER
        ];
    } else if (playerCount <= 6) {
        roles = [
            ROLES.WEREWOLF,
            ROLES.WEREWOLF,
            ROLES.SEER,
            ROLES.ROBBER,
            ROLES.TROUBLEMAKER,
            ROLES.DRUNK,
            ROLES.INSOMNIAC,
            ROLES.MASON,
            ROLES.MASON
        ];
    } else if (playerCount <= 8) {
        roles = [
            ROLES.WEREWOLF,
            ROLES.WEREWOLF,
            ROLES.SEER,
            ROLES.ROBBER,
            ROLES.TROUBLEMAKER,
            ROLES.DRUNK,
            ROLES.INSOMNIAC,
            ROLES.MASON,
            ROLES.MASON,
            ROLES.HUNTER,
            ROLES.TANNER
        ];
    } else if (playerCount <= 10) {
        roles = [
            ROLES.WEREWOLF,
            ROLES.WEREWOLF,
            ROLES.SEER,
            ROLES.ROBBER,
            ROLES.TROUBLEMAKER,
            ROLES.DRUNK,
            ROLES.INSOMNIAC,
            ROLES.MASON,
            ROLES.MASON,
            ROLES.HUNTER,
            ROLES.TANNER,
            ROLES.DOPPELGANGER,
            ROLES.VILLAGER
        ];
    } else if (playerCount <= 12) {
        roles = [
            ROLES.WEREWOLF,
            ROLES.WEREWOLF,
            ROLES.MYSTICWOLF,
            ROLES.SEER,
            ROLES.APPRENTICESEER,
            ROLES.ROBBER,
            ROLES.WITCH,
            ROLES.TROUBLEMAKER,
            ROLES.DRUNK,
            ROLES.INSOMNIAC,
            ROLES.MASON,
            ROLES.MASON,
            ROLES.HUNTER,
            ROLES.TANNER,
            ROLES.DOPPELGANGER
        ];
    } else {
        roles = [
            ROLES.WEREWOLF,
            ROLES.WEREWOLF,
            ROLES.WEREWOLF,
            ROLES.MYSTICWOLF,
            ROLES.SEER,
            ROLES.APPRENTICESEER,
            ROLES.ROBBER,
            ROLES.WITCH,
            ROLES.TROUBLEMAKER,
            ROLES.DRUNK,
            ROLES.INSOMNIAC,
            ROLES.MASON,
            ROLES.MASON,
            ROLES.HUNTER,
            ROLES.TANNER,
            ROLES.DOPPELGANGER,
            ROLES.PARANORMALINVESTIGATOR,
            ROLES.VILLAGER
        ];
    }
    
    const totalCardsNeeded = playerCount + centerCards;
    
    while (roles.length > totalCardsNeeded) {
        const toRemove = ['villager', 'mason', 'tanner', 'insomniac', 'apprenticeseer', 'drunk', 'troublemaker'];
        for (const role of toRemove) {
            const index = roles.findIndex(r => r.id === role);
            if (index !== -1) {
                roles.splice(index, 1);
                break;
            }
        }
    }
    
    while (roles.length < totalCardsNeeded) {
        roles.push(ROLES.VILLAGER);
    }
    
    return roles;
};

// 웨어울프 게임 시작 함수
async function startWerewolfGame(message, args) {
    const channelId = message.channel.id;
    
    if (!lockManager.acquireLock(channelId, 'start_game', 10000)) {
        console.log(`Game start already in progress for channel ${channelId}`);
        return null;
    }
    
    try {
        if (!message || !message.author) {
            console.error('Invalid message or message.author is undefined');
            return null;
        }
        
        const activeEvent = getActiveEvent(channelId);
        if (activeEvent && activeEvent.type === EVENT_TYPES.WEREWOLF_GAME) {
            await message.reply('There is already an active Werewolf game in this channel.');
            return null;
        }
        
        const joinGameRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('werewolf_join')
                    .setLabel('Join Game')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('werewolf_start')
                    .setLabel('Start Game')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('werewolf_cancel')
                    .setLabel('Cancel Game')
                    .setStyle(ButtonStyle.Danger)
            );
        
        const embed = new EmbedBuilder()
            .setTitle('🐺 One Night Werewolf')
            .setDescription(
                '**Game Overview:**\n' +
                'In this game, each player is secretly assigned a role. During the night, everyone closes their eyes and certain roles wake up to perform special actions. Then, in the morning, players have 5 minutes to discuss and figure out who the Werewolves are.\n\n' +
                '**How to Win:**\n' +
                '• **Villagers win** if at least one Werewolf is eliminated\n' +
                '• **Werewolves win** if no Werewolf is eliminated\n' +
                '• **Tanner wins** if the Tanner is eliminated\n\n' +
                'Click "Join Game" to participate! Anyone can click "Start Game" when enough players have joined.\n\n' +
                '**Player Requirements:**\n' +
                '• Minimum 3 players required\n' +
                '• For random events: 5+ players to start manually\n' +
                '• Maximum 15 players allowed\n' +
                '**Automatic Start:**\n' +
                '• Game will automatically start in 1 minute if there are 3+ players'
            )
            .setColor('#800020')
            .addFields(
                { name: 'Participants (0)', value: 'No players yet', inline: false },
                { name: 'Auto-start Timer', value: 'Game will auto-start in 1:00 with 3+ players', inline: false }
            )
            .setFooter({ text: 'Game will start once enough players join or auto-start timer expires' });
        
        const gameMessage = await message.channel.send({
            embeds: [embed],
            components: [joinGameRow]
        });
        
        const isRandomEvent = !message.author.id || message.author.id === message.client?.user?.id;
        
        const eventData = {
            status: 'joining',
            gameMessageId: gameMessage.id,
            players: [],
            host: message.author.id,
            roles: [],
            playerRoles: {},
            originalRoles: {},
            centerCards: [],
            nightActions: {},
            startTime: null,
            discussionEndTime: null,
            discussionExtended: false,
            votes: {},
            voteCount: {},
            currentNightRole: null,
            roleMessages: {},
            fromRandomEvent: isRandomEvent,
            autoStartTime: Date.now() + (60 * 1000),
            doppelgangerInfo: {
                players: {},
                processedRoles: {}
            }
        };
        
        setActiveEvent(channelId, EVENT_TYPES.WEREWOLF_GAME, eventData);
        
        timerManager.scheduleTimer(
            `autostart_${channelId}`,
            () => timerManager.handleAutoStart(message.client, channelId),
            60 * 1000,
            { channelId, gameMessageId: gameMessage.id }
        );
        
        const updateTimerInterval = setInterval(async () => {
          try {
              const currentEvent = getActiveEvent(channelId);
              if (!currentEvent || currentEvent.type !== EVENT_TYPES.WEREWOLF_GAME || currentEvent.data.status !== 'joining') {
                  clearInterval(updateTimerInterval);
                  return;
              }
              
              const timeLeft = Math.max(0, currentEvent.data.autoStartTime - Date.now());
              const minutes = Math.floor(timeLeft / 60000);
              const seconds = Math.floor((timeLeft % 60000) / 1000);
              const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;
              
              try {
                  const currentEmbed = gameMessage.embeds[0];
                  if (currentEmbed && currentEmbed.fields && currentEmbed.fields.length >= 2) {
                      const updatedEmbed = EmbedBuilder.from(currentEmbed)
                          .spliceFields(1, 1, {
                              name: '⏰ Auto-start Timer ⏰',
                              value: `**🚨 Game will auto-start in ${timeString} with 5+ players 🚨**`,
                              inline: false
                          });
                      
                      await gameMessage.edit({ embeds: [updatedEmbed] });
                  }
              } catch (embedError) {
                  console.error('Error updating timer embed:', embedError);
              }
              
              if (timeLeft <= 0) {
                  clearInterval(updateTimerInterval);
              }
          } catch (error) {
              console.error('Error in timer update interval:', error);
              clearInterval(updateTimerInterval);
          }
      }, 1000); // 5000 → 1000으로 변경 (1초마다 업데이트)
        
        return gameMessage;
        
    } catch (error) {
        console.error('Error in startWerewolfGame:', error);
        if (message && message.channel) {
            await message.channel.send('An error occurred while starting the game. Please try again.');
        }
        return null;
    } finally {
        lockManager.releaseLock(channelId, 'start_game');
    }
}

// 참가자 임베드 업데이트
async function updateJoinEmbed(interaction) {
    try {
        const activeEvent = getActiveEvent(interaction.channel.id);
        if (!activeEvent || activeEvent.type !== EVENT_TYPES.WEREWOLF_GAME) return;

        const eventData = activeEvent.data;
        const currentEmbed = interaction.message.embeds[0];
        
        if (currentEmbed && currentEmbed.fields) {
            const embed = EmbedBuilder.from(currentEmbed);
            
            embed.spliceFields(0, 1, {
                name: `Participants (${eventData.players.length})`,
                value: eventData.players.length > 0
                    ? eventData.players.map(p => `<@${p.id}>`).join('\n')
                    : 'No players yet',
                inline: false
            });
            
            await interaction.message.edit({ embeds: [embed] });
        }
    } catch (error) {
        console.error('Error updating join embed:', error);
    }
}

// 게임 시작 함수 (실제 역할 배분 등)
async function beginWerewolfGame(interaction) {
    const channelId = interaction.channel?.id;
    if (!channelId) {
        console.error('Invalid channel ID in beginWerewolfGame');
        return;
    }
    
    if (!lockManager.acquireLock(channelId, 'begin_game', 30000)) {
        console.log(`Game begin already in progress for channel ${channelId}`);
        try {
            await interaction.editReply({ content: 'The game is already starting. Please wait...' });
        } catch (error) {
            console.log('Error replying to duplicate begin:', error);
        }
        return;
    }
    
    try {
        const activeEvent = getActiveEvent(channelId);
        if (!activeEvent || activeEvent.type !== EVENT_TYPES.WEREWOLF_GAME) {
            return;
        }
        
        const eventData = activeEvent.data;
        
        if (eventData.status !== 'joining') {
            try {
                await interaction.editReply({ content: 'The game has already started.' });
            } catch (error) {
                console.log('Error replying for already started game:', error);
            }
            return;
        }
        
        if (eventData.players.length < 5) {
            try {
                await interaction.editReply({ content: 'At least 5 players are required to start the game.' });
            } catch (error) {
                console.log('Error replying for not enough players:', error);
            }
            return;
        }
        
        if (eventData.fromRandomEvent && eventData.players.length < 5) {
            try {
                await interaction.editReply({
                    content: `For random events, at least 5 players are required to start the game. Current players: ${eventData.players.length}`
                });
            } catch (error) {
                console.log('Error replying for random event requirement:', error);
            }
            return;
        }
        
        timerManager.clearTimer(`autostart_${channelId}`);
        
        eventData.status = 'night';
        
        if (eventData.players.length > 15) {
            console.log(`Limiting players from ${eventData.players.length} to 15`);
            eventData.players = eventData.players.slice(0, 15);
        }
        
        const roles = getDefaultRoles(eventData.players.length);
        eventData.roles = [...roles];
        
        for (let i = roles.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [roles[i], roles[j]] = [roles[j], roles[i]];
        }
        
        const assignedPlayers = new Set();
        eventData.players.forEach((player, index) => {
            if (index < eventData.players.length && !assignedPlayers.has(player.id)) {
                eventData.playerRoles[player.id] = roles[index];
                eventData.originalRoles[player.id] = roles[index];
                assignedPlayers.add(player.id);
            }
        });
        
        eventData.centerCards = roles.slice(-3);
        
        const uniqueRoles = Array.from(new Set(roles.map(role => role.id)))
            .map(id => roles.find(role => role.id === id));
        
        const disabledRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('werewolf_join')
                    .setLabel('Join Game')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId('werewolf_start')
                    .setLabel('Game Started')
                    .setStyle(ButtonStyle.Success)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId('werewolf_cancel')
                    .setLabel('Cancel Game')
                    .setStyle(ButtonStyle.Danger)
                    .setDisabled(true)
            );
        
        try {
            const embed = EmbedBuilder.from(interaction.message.embeds[0])
                .setTitle('🐺 One Night Werewolf - Night Phase')
                .setDescription(
                    '**The game has started - Night Phase!**\n\n' +
                    'Each player will receive their role privately. Check your DMs!\n\n' +
                    'During the night, certain roles will wake up and perform their actions in order.'
                )
                .setFields([
                    {
                        name: `Players (${assignedPlayers.size})`,
                        value: Array.from(assignedPlayers).map(id => `<@${id}>`).join('\n'),
                        inline: false
                    },
                    {
                        name: 'Roles in play',
                        value: uniqueRoles.map(role => `${role.emoji} ${role.name}`).join('\n'),
                        inline: false
                    }
                ])
                .setFooter({ text: 'Wait for all players to complete their night actions...' });
            
            await interaction.message.edit({
                embeds: [embed],
                components: [disabledRow]
            });
        } catch (error) {
            console.error('Error updating game message:', error);
        }
        
        setActiveEvent(channelId, EVENT_TYPES.WEREWOLF_GAME, eventData);
        
        try {
            await interaction.editReply({ content: 'The game has started! Check your DMs for your role.' });
        } catch (error) {
            console.error('Error updating reply:', error);
        }
        
        await sendPlayerRoles(interaction.channel, eventData);
        await assignGameRole(interaction.channel, eventData);
        
        setTimeout(() => {
            startNightPhase(interaction.client, interaction.channel, eventData)
                .catch(error => console.error('Error starting night phase:', error));
        }, 3000);
        
    } catch (error) {
        console.error('Error in beginWerewolfGame:', error);
        try {
            await interaction.editReply({ content: 'An error occurred while starting the game. Please try again.' });
        } catch (replyError) {
            console.error('Error sending error reply:', replyError);
        }
    } finally {
        lockManager.releaseLock(channelId, 'begin_game');
    }
}

// 플레이어들에게 역할 DM 보내기
async function sendPlayerRoles(channel, eventData) {
    const roleSentPlayers = new Set();
    const dmFailedPlayers = new Set();
    
    for (const player of eventData.players) {
        if (roleSentPlayers.has(player.id)) {
            console.log(`Skipping duplicate role message for player ${player.id}`);
            continue;
        }
        
        try {
            const role = eventData.playerRoles[player.id];
            if (!role) {
                console.error(`No role assigned for player ${player.id}`);
                continue;
            }
            
            const roleDetail = ROLE_DETAILS[role.id];
            
            const embed = new EmbedBuilder()
                .setTitle(`Your role: ${role.emoji} ${role.name}`)
                .setDescription(
                    `**${role.description}**\n\n` +
                    `${roleDetail.detailedDescription}\n\n` +
                    `${roleDetail.strategy}\n\n` +
                    `Wait for night phase instructions...`
                )
                .setColor(role.team === 'werewolves' ? '#FF0000' : '#00FF00')
                .setFooter({ text: 'One Night Werewolf Game' });
            
            try {
                const user = await channel.client.users.fetch(player.id);
                await user.send({
                    content: `Your role in the One Night Werewolf game:`,
                    embeds: [embed]
                });
                
                roleSentPlayers.add(player.id);
                await new Promise(resolve => setTimeout(resolve, 300));
            } catch (dmError) {
                console.error(`Failed to send DM to player ${player.id}:`, dmError);
                dmFailedPlayers.add(player.id);
                
                try {
                    await channel.send(`<@${player.id}>, I couldn't send your role via DM. Please enable DMs from server members.`);
                } catch (channelError) {
                    console.error('Failed to send channel message:', channelError);
                }
            }
        } catch (error) {
            console.error(`Failed to process role for player ${player.id}:`, error);
        }
    }
    
    if (dmFailedPlayers.size > 0) {
        try {
            await channel.send({
                content: `**ATTENTION:** ${dmFailedPlayers.size} player(s) could not receive their role through DMs.\n` +
                         `If you didn't receive your role, please check that you have server DMs enabled:\n` +
                         `Right-click server name -> Privacy Settings -> Allow direct messages from server members.`
            });
        } catch (error) {
            console.error('Failed to send DM failure notification:', error);
        }
    }
    
    console.log(`Sent role messages to ${roleSentPlayers.size}/${eventData.players.length} players. DM failed for ${dmFailedPlayers.size} players.`);
}

// 밤 페이즈 시작
async function startNightPhase(client, channel, eventData) {
    try {
        const roleOrder = [
            { role: 'doppelganger', announcement: '🎭 **Doppelganger wakes up** and chooses a player to copy.' },
            { role: 'werewolf', announcement: '🐺 **Werewolves wake up** and look for other werewolves.' },
            { role: 'mysticwolf', announcement: '🌙 **Mystic Wolf wakes up** and may look at another player\'s card.' },
            { role: 'mason', announcement: '👷 **Masons wake up** and look for other masons.' },
            { role: 'seer', announcement: '👁️ **Seer wakes up** and may look at another player\'s card or two center cards.' },
            { role: 'apprenticeseer', announcement: '🔮 **Apprentice Seer wakes up** and may look at one center card.' },
            { role: 'paranormalinvestigator', announcement: '🕵️ **Paranormal Investigator wakes up** and may investigate up to two players.' },
            { role: 'robber', announcement: '🦝 **Robber wakes up** and may exchange cards with another player.' },
            { role: 'witch', announcement: '🧙 **Witch wakes up** and may swap a center card with a player\'s card.' },
            { role: 'troublemaker', announcement: '😈 **Troublemaker wakes up** and may switch two players\' cards.' },
            { role: 'drunk', announcement: '🍺 **Drunk wakes up** and exchanges their card with a center card.' },
            { role: 'insomniac', announcement: '😴 **Insomniac wakes up** and checks their card.' }
        ];
        
        const embed = new EmbedBuilder()
            .setTitle('🌙 Night Phase')
            .setDescription('Everyone close your eyes...\n\nThe night phase is beginning. Roles will wake up in sequence.')
            .setColor('#191970');
        
        const nightMessage = await channel.send({ embeds: [embed] });
        
        eventData.doppelgangerInfo = {
            players: {},
            processedRoles: {}
        };
        
        setActiveEvent(channel.id, EVENT_TYPES.WEREWOLF_GAME, eventData);
        
        for (let i = 0; i < roleOrder.length; i++) {
            const roleInfo = roleOrder[i];
            
            const currentEvent = getActiveEvent(channel.id);
            if (!currentEvent || currentEvent.type !== EVENT_TYPES.WEREWOLF_GAME || currentEvent.data.status !== 'night') {
                console.log('Game ended or status changed during night phase');
                return;
            }
            
            eventData.currentNightRole = roleInfo.role;
            eventData.currentRoleIndex = i;
            setActiveEvent(channel.id, EVENT_TYPES.WEREWOLF_GAME, eventData);
            
            const announceEmbed = EmbedBuilder.from(embed)
                .setDescription(roleInfo.announcement);
            
            try {
                await nightMessage.edit({ embeds: [announceEmbed] });
            } catch (error) {
                console.error('Error updating night message:', error);
            }
            
            try {
                await processRoleActions(channel, roleInfo, eventData);
            } catch (roleError) {
                console.error(`Error processing role ${roleInfo.role}:`, roleError);
            }
            
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        await startDayPhase(client, channel, eventData);
        
    } catch (error) {
        console.error('Error in startNightPhase:', error);
        try {
            await channel.send('An error occurred during the night phase. The game will be cancelled.');
            await endGame(client, channel, eventData, true);
        } catch (endError) {
            console.error('Error ending game after night phase error:', endError);
            removeActiveEvent(channel.id);
        }
    }
}

// 역할 액션 처리
async function processRoleActions(channel, roleInfo, eventData) {
    const originalPlayers = [];
    const doppelgangerPlayers = [];
    
    Object.entries(eventData.playerRoles).forEach(([playerId, role]) => {
        if (role.id === roleInfo.role) {
            if (role.originalId === 'doppelganger') {
                doppelgangerPlayers.push(playerId);
            } else {
                originalPlayers.push(playerId);
            }
        }
    });
    
    console.log(`${roleInfo.role} 역할 차례: 원래 플레이어 ${originalPlayers.length}명, 도플갱어 ${doppelgangerPlayers.length}명`);
    
    if (roleInfo.role === 'mason') {
        const allMasonPlayers = [...originalPlayers, ...doppelgangerPlayers];
        if (allMasonPlayers.length > 0) {
            await handleMasonRole(channel, allMasonPlayers, eventData);
            await new Promise(resolve => setTimeout(resolve, 2000));
        } else {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    } else if (roleInfo.role === 'insomniac') {
        const allInsomniacPlayers = [...originalPlayers, ...doppelgangerPlayers];
        if (allInsomniacPlayers.length > 0) {
            await handleInsomniacRole(channel, allInsomniacPlayers, eventData);
            await new Promise(resolve => setTimeout(resolve, 2000));
        } else {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    } else if (roleInfo.role === 'werewolf') {
        const allWerewolfPlayers = [...originalPlayers, ...doppelgangerPlayers];
        
        if (allWerewolfPlayers.length > 0) {
            if (allWerewolfPlayers.length > 1) {
                await handleWerewolfRole(channel, allWerewolfPlayers, eventData);
                await new Promise(resolve => setTimeout(resolve, 2000));
            } else {
                const pendingPlayers = allWerewolfPlayers.filter(playerId => 
                    !eventData.nightActions[playerId] || 
                    !eventData.nightActions[playerId].action.includes('werewolf')
                );
                
                if (pendingPlayers.length > 0) {
                    const actionPromises = pendingPlayers.map(playerId => 
                        sendNightActionMenu(channel, playerId, 'werewolf', eventData)
                    );
                    
                    await Promise.all(actionPromises);
                    await waitForRoleActions(channel, pendingPlayers, eventData, 30);
                } else {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
        } else {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    } else {
        if (originalPlayers.length > 0) {
            const pendingOriginalPlayers = originalPlayers.filter(playerId => 
                !eventData.nightActions[playerId] || 
                eventData.nightActions[playerId].actionType !== roleInfo.role
            );
            
            if (pendingOriginalPlayers.length > 0) {
                const actionPromises = pendingOriginalPlayers.map(playerId => 
                    sendNightActionMenu(channel, playerId, roleInfo.role, eventData)
                );
                
                await Promise.all(actionPromises);
                await waitForRoleActions(channel, pendingOriginalPlayers, eventData, 30);
            }
        }
        
        if (doppelgangerPlayers.length > 0) {
            const pendingDoppelgangerPlayers = doppelgangerPlayers.filter(playerId => {
                const hasActionForRole = eventData.nightActions[playerId] && 
                                      (eventData.nightActions[playerId].actionType === roleInfo.role ||
                                       eventData.nightActions[playerId].action === 'automatic_doppelganger' ||
                                       (eventData.nightActions[playerId].action === 'skip' && 
                                        eventData.nightActions[playerId].role === roleInfo.role));
                
                return !hasActionForRole;
            });
            
            if (pendingDoppelgangerPlayers.length > 0) {
                console.log(`도플갱어에서 변환된 ${roleInfo.role} 역할 플레이어 ${pendingDoppelgangerPlayers.length}명 처리`);
                
                const doppelActionPromises = pendingDoppelgangerPlayers.map(playerId => 
                    sendNightActionMenu(channel, playerId, roleInfo.role, eventData, true)
                );
                
                await Promise.all(doppelActionPromises);
                await waitForRoleActions(channel, pendingDoppelgangerPlayers, eventData, 30);
            }
        }
        
        if (originalPlayers.length === 0 && doppelgangerPlayers.length === 0) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
}

// 인섬니악 역할 자동 처리 함수
async function handleInsomniacRole(channel, players, eventData) {
    const insomniacPromises = players.map(async (playerId) => {
        try {
            eventData.nightActions[playerId] = { action: 'check_role' };
            
            if (eventData.originalRoles[playerId]?.id === 'insomniac') {
                const currentRole = eventData.playerRoles[playerId];
                
                const embed = new EmbedBuilder()
                    .setTitle('😴 Insomniac Night Action')
                    .setDescription(
                        `As the Insomniac, you wake up at the end of the night and check your role.\n\n` +
                        `Your current role is: **${currentRole.name}** ${currentRole.emoji}`
                    )
                    .setColor('#9370DB')
                    .setFooter({ text: 'One Night Werewolf Game' });
                
                try {
                    const user = await channel.client.users.fetch(playerId);
                    await user.send({ embeds: [embed] });
                } catch (dmError) {
                    console.error(`Failed to send DM to Insomniac player ${playerId}:`, dmError);
                }
            }
        } catch (error) {
            console.error(`Error handling Insomniac player ${playerId}:`, error);
        }
    });
    
    try {
        await Promise.race([
            Promise.all(insomniacPromises),
            new Promise(resolve => setTimeout(resolve, 3000))
        ]);
    } catch (error) {
        console.error('Error in Insomniac role processing:', error);
    }
    
    setActiveEvent(channel.id, EVENT_TYPES.WEREWOLF_GAME, eventData);
}

// 메이슨 역할 자동 처리 함수
async function handleMasonRole(channel, players, eventData) {
    console.log("처리 중인 메이슨:", players);
    
    const centerMasons = eventData.centerCards
        .map((card, index) => card.id === 'mason' ? index : -1)
        .filter(index => index !== -1);
    
    console.log("중앙 카드의 메이슨:", centerMasons);
    
    for (const playerId of players) {
        try {
            const otherMasons = players.filter(id => id !== playerId);
            
            const otherMasonUsers = [];
            for (const id of otherMasons) {
                try {
                    const user = await channel.client.users.fetch(id);
                    otherMasonUsers.push({
                        id: id,
                        username: user.username || `Player ${id}`
                    });
                } catch (e) {
                    console.error(`메이슨 사용자 정보 가져오기 실패 ${id}:`, e);
                    otherMasonUsers.push({
                        id: id,
                        username: `Player ${id}`
                    });
                }
            }
            
            console.log(`메이슨 ${playerId}에게 정보 전송 중. 다른 메이슨:`, otherMasonUsers);
            
            let description;
            if (otherMasonUsers.length > 0) {
                description = `You wake up and see other Masons: ${otherMasonUsers.map(u => u.username).join(', ')}`;
            } else if (centerMasons.length > 0) {
                const centerMasonPositions = centerMasons.map(index => `Card ${index + 1}`);
                description = `You wake up and look for other Masons, but you don't see any players. The other Mason card(s) must be in the center: ${centerMasonPositions.join(', ')}`;
            } else {
                description = 'You wake up and look for other Masons, but you don\'t see any. The other Mason cards might be in the center.';
            }
            
            const embed = new EmbedBuilder()
                .setTitle('👷 Mason Night Action')
                .setDescription(description)
                .setColor('#4B0082')
                .setFooter({ text: 'One Night Werewolf Game' });
            
            try {
                const user = await channel.client.users.fetch(playerId);
                await user.send({ embeds: [embed] });
                console.log(`메이슨 ${playerId}에게 DM 전송 성공`);
            } catch (dmError) {
                console.error(`메이슨 ${playerId}에게 DM 전송 실패:`, dmError);
                try {
                    await channel.send(`<@${playerId}>, I couldn't send you a DM with your Mason information.`);
                } catch (e) {
                    // 무시
                }
            }
            
            eventData.nightActions[playerId] = { action: 'check_masons' };
        } catch (error) {
            console.error(`메이슨 ${playerId} 처리 중 오류:`, error);
            eventData.nightActions[playerId] = { action: 'check_masons' };
        }
    }
    
    setActiveEvent(channel.id, EVENT_TYPES.WEREWOLF_GAME, eventData);
}

// 웨어울프 처리 함수
async function handleWerewolfRole(channel, players, eventData) {
    console.log("처리 중인 웨어울프:", players);
    
    const centerWerewolves = eventData.centerCards
        .map((card, index) => card.id === 'werewolf' ? index : -1)
        .filter(index => index !== -1);
    
    console.log("중앙 카드의 웨어울프:", centerWerewolves);
    
    for (const playerId of players) {
        try {
            const otherWerewolves = players.filter(id => id !== playerId);
            
            const otherWerewolfUsers = [];
            for (const id of otherWerewolves) {
                try {
                    const user = await channel.client.users.fetch(id);
                    otherWerewolfUsers.push({
                        id: id,
                        username: user.username || `Player ${id}`
                    });
                } catch (e) {
                    console.error(`웨어울프 사용자 정보 가져오기 실패 ${id}:`, e);
                    otherWerewolfUsers.push({
                        id: id,
                        username: `Player ${id}`
                    });
                }
            }
            
            console.log(`웨어울프 ${playerId}에게 정보 전송 중. 다른 웨어울프:`, otherWerewolfUsers);
            
            let description;
            if (otherWerewolfUsers.length > 0) {
                description = `You wake up and see other Werewolves: ${otherWerewolfUsers.map(u => u.username).join(', ')}`;
                eventData.nightActions[playerId] = { action: 'check_werewolves' };
            } else if (centerWerewolves.length > 0) {
                const centerWerewolfPositions = centerWerewolves.map(index => `Card ${index + 1}`);
                description = `You wake up and look for other Werewolves, but you don't see any players. The other Werewolf card(s) must be in the center: ${centerWerewolfPositions.join(', ')}. You may look at a center card.`;
            } else {
                description = 'You wake up and look for other Werewolves, but you don\'t see any. You are the only Werewolf! You may look at a center card.';
            }
            
            const embed = new EmbedBuilder()
                .setTitle('🐺 Werewolf Night Action')
                .setDescription(description)
                .setColor('#8B0000')
                .setFooter({ text: 'One Night Werewolf Game' });
            
            let components = [];
            if (otherWerewolfUsers.length === 0) {
                const actionRow = new ActionRowBuilder()
                    .addComponents(
                        new StringSelectMenuBuilder()
                            .setCustomId(`werewolf_center_${channel.id}_${playerId}`)
                            .setPlaceholder('Select a center card to view or skip')
                            .addOptions([
                                { label: 'Card 1', value: 'center_0', emoji: '⬅️', description: 'View the first center card' },
                                { label: 'Card 2', value: 'center_1', emoji: '⬆️', description: 'View the second center card' },
                                { label: 'Card 3', value: 'center_2', emoji: '➡️', description: 'View the third center card' },
                                { label: 'Skip Action', value: 'skip', emoji: '⏭️', description: 'Skip your night action' }
                            ])
                    );
                components = [actionRow];
            }
            
            try {
                const user = await channel.client.users.fetch(playerId);
                await user.send({ 
                    content: 'It\'s time for your night action in the Werewolf game:',
                    embeds: [embed],
                    components: components
                });
                console.log(`웨어울프 ${playerId}에게 DM 전송 성공`);
                
                if (components.length > 0) {
                    const messages = await user.dmChannel.messages.fetch({ limit: 1 });
                    if (messages.size > 0) {
                        const message = messages.first();
                        eventData.roleMessages[playerId] = message.id;
                    }
                }
            } catch (dmError) {
                console.error(`웨어울프 ${playerId}에게 DM 전송 실패:`, dmError);
                try {
                    await channel.send(`<@${playerId}>, I couldn't send you a DM with your Werewolf information.`);
                } catch (e) {
                    // 무시
                }
            }
        } catch (error) {
            console.error(`웨어울프 ${playerId} 처리 중 오류:`, error);
            eventData.nightActions[playerId] = { action: 'check_werewolves' };
        }
    }
    
    setActiveEvent(channel.id, EVENT_TYPES.WEREWOLF_GAME, eventData);
}

// 역할 액션 완료 대기 함수
async function waitForRoleActions(channel, players, eventData, timeoutSeconds) {
    return new Promise(resolve => {
        const timeoutId = setTimeout(() => {
            for (const playerId of players) {
                if (!eventData.nightActions[playerId]) {
                    console.log(`Auto-skipping action for player ${playerId}`);
                    eventData.nightActions[playerId] = { action: 'skip', auto: true };
                }
            }
            
            setActiveEvent(channel.id, EVENT_TYPES.WEREWOLF_GAME, eventData);
            resolve();
        }, timeoutSeconds * 1000);
        
        const checkInterval = setInterval(() => {
            const allCompleted = players.every(playerId => eventData.nightActions[playerId]);
            
            if (allCompleted) {
                clearTimeout(timeoutId);
                clearInterval(checkInterval);
                
                setActiveEvent(channel.id, EVENT_TYPES.WEREWOLF_GAME, eventData);
                resolve();
            }
        }, 1000);
    });
}

// 밤 액션 메뉴 전송
async function sendNightActionMenu(channel, playerId, role, eventData, isDoppelganger = false) {
    try {
        console.log(`Sending night action menu to player ${playerId} with role ${role}${isDoppelganger ? ' (as Doppelganger)' : ''}`);
        
        const actionRow = createNightActionMenu(playerId, role, channel.id, eventData, channel);
        
        if (!actionRow) {
            console.log(`No action menu created for player ${playerId} with role ${role}`);
            
            if (isDoppelganger) {
                eventData.nightActions[playerId] = { 
                    actionType: role,
                    action: 'automatic_doppelganger',
                    processed: true,
                    role: role
                };
                setActiveEvent(channel.id, EVENT_TYPES.WEREWOLF_GAME, eventData);
            }
            
            return;
        }
        
        const embed = new EmbedBuilder()
            .setTitle(`${ROLES[role.toUpperCase()].emoji} Night Action: ${ROLES[role.toUpperCase()].name}${isDoppelganger ? ' (as Doppelganger)' : ''}`)
            .setDescription(getNightActionDescription(role))
            .setColor('#191970')
            .setFooter({ text: `You have 30 seconds to choose your action` });
        
        addRoleSpecificInfo(embed, playerId, role, eventData);
        
        if (isDoppelganger) {
            embed.setDescription(
                `**As a Doppelganger, you've become a ${ROLES[role.toUpperCase()].name}!**\n\n` +
                `Now use your copied ability:\n\n` +
                getNightActionDescription(role)
            );
            embed.setColor('#800080');
        }
        
        const user = await channel.client.users.fetch(playerId);
        
        const message = await user.send({
            content: `It's time for your night action in the Werewolf game:`,
            embeds: [embed],
            components: [actionRow]
        });
        
        eventData.roleMessages[playerId] = message.id;
        setActiveEvent(channel.id, EVENT_TYPES.WEREWOLF_GAME, eventData);
        
        return message;
    } catch (error) {
        console.error(`Failed to send night action menu to player ${playerId}:`, error);
        
        if (isDoppelganger) {
            eventData.nightActions[playerId] = { 
                actionType: role,
                action: 'automatic_doppelganger_error',
                processed: true,
                role: role
            };
            setActiveEvent(channel.id, EVENT_TYPES.WEREWOLF_GAME, eventData);
        }
    }
}

// 역할별 액션 메뉴 생성
function createNightActionMenu(playerId, role, channelId, eventData, channel) {
    if (eventData.nightActions[playerId]) {
        return null;
    }
    
    // 서버 닉네임을 포함한 플레이어 정보 가져오기
    const getPlayerDisplayName = async (playerObj) => {
        let displayName = playerObj.username;
        try {
            if (channel && channel.guild) {
                const member = await channel.guild.members.fetch(playerObj.id);
                displayName = member.displayName || member.user.username;
            }
        } catch (error) {
            console.log(`Could not fetch member info for ${playerObj.id}, using username`);
        }
        return displayName;
    };
    
    // 플레이어 선택 옵션 생성 함수 (비동기)
    const createPlayerOptions = async (excludePlayerId = null) => {
        const playerOptions = [];
        
        for (const player of eventData.players) {
            if (excludePlayerId && player.id === excludePlayerId) continue;
            
            try {
                let displayName = player.username;
                if (channel && channel.guild) {
                    const member = await channel.guild.members.fetch(player.id);
                    displayName = member.displayName || member.user.username;
                }
                
                playerOptions.push({
                    label: displayName.substring(0, 80), // 서버 닉네임 사용
                    value: `player_${player.id}`,
                    emoji: '👤',
                    description: player.username !== displayName ? `@${player.username}` : 'Select this player'
                });
            } catch (error) {
                console.error(`Error fetching member info for ${player.id}:`, error);
                playerOptions.push({
                    label: player.username.substring(0, 80),
                    value: `player_${player.id}`,
                    emoji: '👤',
                    description: 'Select this player'
                });
            }
        }
        
        return playerOptions;
    };
    
    if (role === 'doppelganger') {
        // 비동기 처리를 위해 Promise 반환
        return new Promise(async (resolve) => {
            try {
                const playerOptions = await createPlayerOptions(playerId);
                
                const actionRow = new ActionRowBuilder()
                    .addComponents(
                        new StringSelectMenuBuilder()
                            .setCustomId(`doppelganger_action_${channelId}_${playerId}`)
                            .setPlaceholder('Choose a player to copy')
                            .addOptions(playerOptions)
                    );
                
                resolve(actionRow);
            } catch (error) {
                console.error('Error creating doppelganger menu:', error);
                resolve(null);
            }
        });
    }
    
    else if (role === 'mysticwolf') {
        return new Promise(async (resolve) => {
            try {
                const playerOptions = await createPlayerOptions(playerId);
                
                playerOptions.push({ 
                    label: 'Skip Action', 
                    value: 'skip', 
                    emoji: '⏭️',
                    description: 'Skip looking at a card' 
                });
                
                const actionRow = new ActionRowBuilder()
                    .addComponents(
                        new StringSelectMenuBuilder()
                            .setCustomId(`mysticwolf_action_${channelId}_${playerId}`)
                            .setPlaceholder('Choose a player\'s card to view')
                            .addOptions(playerOptions)
                    );
                
                resolve(actionRow);
            } catch (error) {
                console.error('Error creating mysticwolf menu:', error);
                resolve(null);
            }
        });
    }
    
    else if (role === 'paranormalinvestigator') {
        return new Promise(async (resolve) => {
            try {
                const playerOptions = await createPlayerOptions(playerId);
                
                playerOptions.push({ 
                    label: 'Skip Action', 
                    value: 'skip', 
                    emoji: '⏭️',
                    description: 'Skip investigation' 
                });
                
                const actionRow = new ActionRowBuilder()
                    .addComponents(
                        new StringSelectMenuBuilder()
                            .setCustomId(`paranormal_first_${channelId}_${playerId}`)
                            .setPlaceholder('Choose first player to investigate')
                            .addOptions(playerOptions)
                    );
                
                resolve(actionRow);
            } catch (error) {
                console.error('Error creating paranormal menu:', error);
                resolve(null);
            }
        });
    }
    
    else if (role === 'seer') {
        return new Promise(async (resolve) => {
            try {
                const playerOptions = await createPlayerOptions(playerId);
                
                const centerOptions = [
                    { label: 'View Center Cards', value: 'center_cards', emoji: '🃏', description: 'Look at two center cards' },
                    { label: 'Skip Action', value: 'skip', emoji: '⏭️', description: 'Skip your action' }
                ];
                
                const actionRow = new ActionRowBuilder()
                    .addComponents(
                        new StringSelectMenuBuilder()
                            .setCustomId(`seer_action_${channelId}_${playerId}`)
                            .setPlaceholder('Choose your Seer action')
                            .addOptions([...playerOptions, ...centerOptions])
                    );
                
                resolve(actionRow);
            } catch (error) {
                console.error('Error creating seer menu:', error);
                resolve(null);
            }
        });
    }
    
    else if (role === 'robber') {
        return new Promise(async (resolve) => {
            try {
                const playerOptions = await createPlayerOptions(playerId);

                playerOptions.push({ 
                    label: 'Skip Action', 
                    value: 'skip', 
                    emoji: '⏭️',
                    description: 'Skip your night action'
                });
                
                const actionRow = new ActionRowBuilder()
                    .addComponents(
                        new StringSelectMenuBuilder()
                            .setCustomId(`robber_action_${channelId}_${playerId}`)
                            .setPlaceholder('Choose a player to rob or skip')
                            .addOptions(playerOptions)
                    );
                
                resolve(actionRow);
            } catch (error) {
                console.error('Error creating robber menu:', error);
                resolve(null);
            }
        });
    }
    
    else if (role === 'troublemaker') {
        return new Promise(async (resolve) => {
            try {
                const playerOptions = [];
                
                for (const player of eventData.players) {
                    if (player.id === playerId) continue;
                    
                    try {
                        let displayName = player.username;
                        if (channel && channel.guild) {
                            const member = await channel.guild.members.fetch(player.id);
                            displayName = member.displayName || member.user.username;
                        }
                        
                        playerOptions.push({
                            label: displayName.substring(0, 80), // 서버 닉네임 사용
                            value: player.id,
                            emoji: '👤',
                            description: player.username !== displayName ? `@${player.username}` : 'Select as first player'
                        });
                    } catch (error) {
                        console.error(`Error fetching member for troublemaker menu: ${player.id}`, error);
                        playerOptions.push({
                            label: player.username.substring(0, 80),
                            value: player.id,
                            emoji: '👤',
                            description: 'Select as first player'
                        });
                    }
                }
                
                playerOptions.push({ 
                    label: 'Skip Action', 
                    value: 'skip', 
                    emoji: '⏭️', 
                    description: 'Skip your action'
                });
                
                console.log(`Creating troublemaker menu for ${playerId} with ${playerOptions.length} options`);
                
                const actionRow = new ActionRowBuilder()
                    .addComponents(
                        new StringSelectMenuBuilder()
                            .setCustomId(`troublemaker_player1_${channelId}_${playerId}`)
                            .setPlaceholder('Select first player or skip')
                            .addOptions(playerOptions)
                    );
                
                resolve(actionRow);
            } catch (error) {
                console.error('Error creating troublemaker menu:', error);
                resolve(null);
            }
        });
    }
    
    else if (role === 'witch') {
        const centerOptions = [
            { label: 'Center Card 1', value: 'center_0', emoji: '⬅️', description: 'Select the first center card' },
            { label: 'Center Card 2', value: 'center_1', emoji: '⬆️', description: 'Select the second center card' },
            { label: 'Center Card 3', value: 'center_2', emoji: '➡️', description: 'Select the third center card' },
            { label: 'Skip Action', value: 'skip', emoji: '⏭️', description: 'Skip your night action' }
        ];
        
        return new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(`witch_center_${channelId}_${playerId}`)
                    .setPlaceholder('Choose a center card to swap')
                    .addOptions(centerOptions)
            );
    }
    
    if (role === 'werewolf') {
        const otherWerewolves = Object.entries(eventData.playerRoles)
            .filter(([id, r]) => r.id === 'werewolf' && id !== playerId)
            .map(([id, _]) => id);
        
        if (otherWerewolves.length > 0) {
            return null;
        }
        
        return new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(`werewolf_center_${channelId}_${playerId}`)
                    .setPlaceholder('Select a center card to view or skip')
                    .addOptions([
                        { label: 'Card 1', value: 'center_0', emoji: '⬅️', description: 'View the first center card' },
                        { label: 'Card 2', value: 'center_1', emoji: '⬆️', description: 'View the second center card' },
                        { label: 'Card 3', value: 'center_2', emoji: '➡️', description: 'View the third center card' },
                        { label: 'Skip Action', value: 'skip', emoji: '⏭️', description: 'Skip your night action' }
                    ])
            );
    }
    
    else if (role === 'mason') {
        return null;
    }
    
    else if (role === 'apprenticeseer') {
        return new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(`apprenticeseer_action_${channelId}_${playerId}`)
                    .setPlaceholder('Choose a center card to view')
                    .addOptions([
                        { label: 'Card 1', value: 'center_0', emoji: '⬅️', description: 'View the first center card' },
                        { label: 'Card 2', value: 'center_1', emoji: '⬆️', description: 'View the second center card' },
                        { label: 'Card 3', value: 'center_2', emoji: '➡️', description: 'View the third center card' },
                        { label: 'Skip Action', value: 'skip', emoji: '⏭️', description: 'Skip your night action' }
                    ])
            );
    }
    
    else if (role === 'drunk') {
        return new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(`drunk_action_${channelId}_${playerId}`)
                    .setPlaceholder('Select a center card position')
                    .addOptions([
                        { 
                            label: 'Card 1', 
                            value: 'center_0', 
                            emoji: '⬅️', 
                            description: 'Swap with Card 1' 
                        },
                        { 
                            label: 'Card 2', 
                            value: 'center_1', 
                            emoji: '⬆️', 
                            description: 'Swap with Card 2' 
                        },
                        { 
                            label: 'Card 3', 
                            value: 'center_2', 
                            emoji: '➡️', 
                            description: 'Swap with Card 3' 
                        }
                    ])
            );
    }
    
    else if (role === 'insomniac') {
        return null;
    }
    
    return null;
}

// 역할별 특수 정보 추가
function addRoleSpecificInfo(embed, playerId, role, eventData) {
    if (role === 'insomniac') {
        const currentRole = eventData.playerRoles[playerId];
        embed.setDescription(`You wake up and check your role. You are now a **${currentRole.name}** ${currentRole.emoji}.`);
        
        eventData.nightActions[playerId] = { action: 'check_role' };
    }
    
    if (role === 'mason') {
        const otherMasons = Object.entries(eventData.playerRoles)
            .filter(([id, r]) => r.id === 'mason' && id !== playerId)
            .map(([id, _]) => id);
        
        if (otherMasons.length > 0) {
            embed.setDescription(`You wake up and see other Masons: ${otherMasons.map(id => `<@${id}>`).join(', ')}`);
        } else {
            embed.setDescription('You wake up and look for other Masons, but you don\'t see any. You might be the only Mason, or the other Mason card(s) might be in the center.');
        }
        
        eventData.nightActions[playerId] = { action: 'check_masons' };
    }
    
    if (role === 'werewolf') {
        const otherWerewolves = Object.entries(eventData.playerRoles)
            .filter(([id, r]) => r.id === 'werewolf' && id !== playerId)
            .map(([id, _]) => id);
        
        if (otherWerewolves.length > 0) {
            embed.setDescription(`You wake up and see other Werewolves: ${otherWerewolves.map(id => `<@${id}>`).join(', ')}\n\nIf you are the only Werewolf awake, you may look at a center card.`);
            
            eventData.nightActions[playerId] = { action: 'check_werewolves' };
        } else {
            embed.setDescription('You wake up and look for other Werewolves, but you don\'t see any. You are the only Werewolf! You may look at a center card.');
        }
    }
}

// 역할별 밤 액션 설명 가져오기
function getNightActionDescription(role) {
    switch (role) {
        case 'doppelganger':
            return 'Choose a player to copy their role. You will immediately become that role and use their ability when their turn comes.';
        case 'werewolf':
            return 'You may look at one card in the center if you are the only Werewolf.';
        case 'mysticwolf':
            return 'As a Mystic Wolf, you may look at one other player\'s card.';
        case 'seer':
            return 'Choose to either:\n1. Look at one player\'s card\n2. Look at two cards in the center';
        case 'apprenticeseer':
            return 'You may look at one card in the center.';
        case 'paranormalinvestigator':
            return 'Look at up to two players\' cards. If you see a Werewolf or Tanner, you become that role and stop investigating.';
        case 'robber':
            return 'You may exchange your card with another player\'s card and then view your new card.';
        case 'witch':
            return 'You may swap a center card with any player\'s card and view both cards.';
        case 'troublemaker':
            return 'You may exchange cards between two other players without looking at them.';
        case 'drunk':
            return 'You must exchange your card with a card from the center without looking at it.';
        case 'insomniac':
            return 'At the end of the night, you wake up and check your card to see if it changed.';
        case 'mason':
            return 'You wake up and look for other Masons.';
        default:
            return 'No special night action.';
    }
}

// 밤 액션 처리 함수 (버튼/메뉴 클릭시) - 여기서 모든 인터랙션 처리
async function handleNightAction(interaction) {
    try {
        try {
            await interaction.deferUpdate().catch(() => {
                console.log('Interaction already acknowledged, continuing...');
            });
        } catch (deferError) {
            console.log('Error deferring update:', deferError);
        }
        
        const customId = interaction.customId;
        console.log(`처리 중인 인터랙션: ${customId}`);
        
        const parts = customId.split('_');
        const actionType = parts[0];
        
        let channelId = null;
        let playerId = interaction.user.id;
        
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (/^\d+$/.test(part) && part.length > 17) {
                if (!channelId) {
                    channelId = part;
                } else if (i === parts.length - 1) {
                    playerId = part;
                }
            }
        }
        
        if (!channelId) {
            channelId = interaction.channelId;
            console.log(`채널 ID를 커스텀 ID에서 찾지 못해 인터랙션의 채널 ID를 사용: ${channelId}`);
        }
        
        console.log(`최종 추출된 정보: 액션 타입=${actionType}, 채널 ID=${channelId}, 플레이어 ID=${playerId}`);
        
        const activeEvent = getActiveEvent(channelId);
        if (!activeEvent) {
            console.error(`채널 ${channelId}에서 활성 이벤트를 찾을 수 없음`);
            await interaction.editReply({ content: 'No active event found in this channel.', components: [] });
            return;
        }
        if (activeEvent.type !== EVENT_TYPES.WEREWOLF_GAME) {
            console.error(`채널 ${channelId}의 이벤트가 웨어울프 게임이 아님: ${activeEvent.type}`);
            await interaction.editReply({ content: 'This is not a Werewolf game.', components: [] });
            return;
        }
        if (activeEvent.data.status !== 'night') {
            console.error(`채널 ${channelId}의 웨어울프 게임이 밤 단계가 아님: ${activeEvent.data.status}`);
            await interaction.editReply({ content: 'This game is no longer in the night phase.', components: [] });
            return;
        }
        
        const eventData = activeEvent.data;
        let actionData = {};
        
        if (interaction.isStringSelectMenu() && interaction.values[0] === 'skip') {
            actionData = { action: 'skip' };
            await interaction.editReply({ 
                content: 'You decided to skip your action.', 
                embeds: [], 
                components: []
            });
        }

        // 여기서부터 각 역할별 액션 처리 (원본 코드의 switch문 유지)
        switch (actionType) {
            case 'doppelganger':
                if (interaction.isStringSelectMenu() && customId.includes('action')) {
                    const selectedValue = interaction.values[0];
                    
                    if (selectedValue.startsWith('player_')) {
                        const targetId = selectedValue.split('_')[1];
                        const targetPlayer = eventData.players.find(p => p.id === targetId);
                        
                        if (!targetPlayer) {
                            console.error(`대상 플레이어를 찾을 수 없음: ${targetId}`);
                            await interaction.editReply({ 
                                content: 'An error occurred. Could not find the selected player.', 
                                components: [] 
                            });
                            return;
                        }
                        
                        const targetRole = eventData.playerRoles[targetId];
                        
                        actionData = { 
                            actionType: 'doppelganger',
                            action: 'copy_role',
                            target: targetId,
                            copiedRole: targetRole.id,
                            processed: true
                        };
                        
                        eventData.playerRoles[playerId] = {
                            ...targetRole,
                            originalId: 'doppelganger'
                        };
                        
                        const roleOrder = [
                            'doppelganger', 'werewolf', 'mysticwolf', 'mason', 'seer', 'apprenticeseer', 
                            'paranormalinvestigator', 'robber', 'witch', 'troublemaker', 'drunk', 'insomniac'
                        ];
                        
                        const currentRoleIndex = roleOrder.indexOf(eventData.currentNightRole);
                        const targetRoleIndex = roleOrder.indexOf(targetRole.id);
                        
                        const embed = new EmbedBuilder()
                            .setTitle('🎭 Doppelganger Night Action')
                            .setDescription(
                                `You looked at ${targetPlayer.username}'s card and copied their role.\n\n` +
                                `You are now a **${targetRole.name}** ${targetRole.emoji}\n\n` +
                                `${targetRoleIndex <= currentRoleIndex ? 
                                    "This role's turn has already passed. You won't be able to use its ability." : 
                                    "When the " + targetRole.name + " wakes up, you will use their ability."}`
                            )
                            .setColor('#800080')
                            .setFooter({ text: 'One Night Werewolf Game' });
                        
                        await interaction.editReply({ embeds: [embed], components: [] });
                        
                        const actionRequiredRoles = ['werewolf', 'mysticwolf', 'seer', 'apprenticeseer', 
                                                    'paranormalinvestigator', 'robber', 'witch', 'troublemaker', 'drunk'];
                                                    
                        if (actionRequiredRoles.includes(targetRole.id) && targetRoleIndex > currentRoleIndex) {
                            console.log(`도플갱어가 ${targetRole.id} 역할을 복사했습니다. 해당 역할의 액션을 즉시 수행합니다.`);
                            
                            try {
                                eventData.doppelgangerCopied = {
                                    playerId: playerId,
                                    originalRole: 'doppelganger',
                                    copiedRole: targetRole.id
                                };
                                
                                setActiveEvent(channelId, EVENT_TYPES.WEREWOLF_GAME, eventData);
                                
                                const user = await interaction.client.users.fetch(playerId);
                                
                                const roleActionEmbed = new EmbedBuilder()
                                    .setTitle(`${ROLES[targetRole.id.toUpperCase()].emoji} Doppelganger as ${targetRole.name}`)
                                    .setDescription(
                                        `As a Doppelganger, you've become a ${targetRole.name}! Now use your new ability.\n\n` +
                                        getNightActionDescription(targetRole.id)
                                    )
                                    .setColor('#800080')
                                    .setFooter({ text: 'You must complete this action to proceed.' });
                                
                                const newActionRow = createNightActionMenu(playerId, targetRole.id, channelId, eventData, interaction.channel);
                                
                                if (newActionRow) {
                                    await user.send({
                                        content: `**Use your new ${targetRole.name} ability:**`,
                                        embeds: [roleActionEmbed],
                                        components: [newActionRow]
                                    });
                                } else {
                                    await user.send({
                                        content: `This role doesn't require any night action.`,
                                        embeds: [roleActionEmbed]
                                    });
                                    
                                    eventData.nightActions[playerId] = { 
                                        actionType: targetRole.id,
                                        action: 'automatic_doppelganger',
                                        processed: true
                                    };
                                    setActiveEvent(channelId, EVENT_TYPES.WEREWOLF_GAME, eventData);
                                }
                            } catch (error) {
                                console.error('도플갱어 복사 역할 액션 메뉴 표시 오류:', error);
                            }
                        } else if (actionRequiredRoles.includes(targetRole.id) && targetRoleIndex <= currentRoleIndex) {
                            try {
                                const user = await interaction.client.users.fetch(playerId);
                                await user.send({
                                    content: `Unfortunately, the ${targetRole.name} role has already had its turn. You won't be able to use its night ability.`
                                });
                            } catch (error) {
                                console.error('도플갱어 역할 알림 전송 오류:', error);
                            }
                        }
                    }
                }
                break;
                
            case 'seer':
                if (interaction.isStringSelectMenu()) {
                    if (customId.includes('action')) {
                        const selectedValue = interaction.values[0];
                        
                        if (selectedValue === 'center_cards') {
                            const centerSelectRow = new ActionRowBuilder()
                                .addComponents(
                                    new StringSelectMenuBuilder()
                                        .setCustomId(`seer_center_${channelId}_${playerId}`)
                                        .setPlaceholder('Select two center cards')
                                        .setMinValues(2)
                                        .setMaxValues(2)
                                        .addOptions([
                                            { label: 'Left Card', value: 'center_0', emoji: '⬅️' },
                                            { label: 'Middle Card', value: 'center_1', emoji: '⬆️' },
                                            { label: 'Right Card', value: 'center_2', emoji: '➡️' }
                                        ])
                                );
                            
                            await interaction.editReply({ 
                                content: 'Select TWO center cards to view:',
                                embeds: [],
                                components: [centerSelectRow]
                            });
                            return;
                        } 
                        else if (selectedValue.startsWith('player_')) {
                            const targetId = selectedValue.split('_')[1];
                            const targetPlayer = eventData.players.find(p => p.id === targetId);
                            const targetRole = eventData.playerRoles[targetId];
                            
                            actionData = { 
                                actionType: 'seer',
                                action: 'view_player',
                                target: targetId
                            };
                            
                            const embed = new EmbedBuilder()
                                .setTitle('👁️ Seer Night Action')
                                .setDescription(
                                    `You looked at ${targetPlayer.username}'s card.\n\n` +
                                    `${targetPlayer.username} is a **${targetRole.name}** ${targetRole.emoji}`
                                )
                                .setColor('#4B0082')
                                .setFooter({ text: 'One Night Werewolf Game' });
                                
                            await interaction.editReply({ embeds: [embed], components: [] });
                        }
                    }
                    else if (customId.includes('center')) {
                        const selectedValues = interaction.values;
                        const cardIndices = selectedValues.map(v => parseInt(v.split('_')[1]));
                        
                        actionData = { 
                            actionType: 'seer',
                            action: 'view_center',
                            targets: cardIndices
                        };
                        
                        const cardInfo = cardIndices.map(index => {
                            const card = eventData.centerCards[index];
                            return `Center card ${index + 1}: **${card.name}** ${card.emoji}`;
                        }).join('\n');
                        
                        const embed = new EmbedBuilder()
                            .setTitle('👁️ Seer Night Action')
                            .setDescription(
                                `You looked at two center cards.\n\n${cardInfo}`
                            )
                            .setColor('#4B0082')
                            .setFooter({ text: 'One Night Werewolf Game' });
                            
                        await interaction.editReply({ embeds: [embed], components: [] });
                    }
                }
                break;
                
            case 'apprenticeseer':
                if (interaction.isStringSelectMenu() && customId.includes('action')) {
                    const selectedValue = interaction.values[0];
                    
                    if (selectedValue.startsWith('center_')) {
                        const centerIndex = parseInt(selectedValue.split('_')[1]);
                        const centerCard = eventData.centerCards[centerIndex];
                        
                        actionData = { 
                            actionType: 'apprenticeseer',
                            action: 'view_center',
                            target: `center_${centerIndex}`
                        };
                        
                        const embed = new EmbedBuilder()
                            .setTitle('🔮 Apprentice Seer Night Action')
                            .setDescription(
                                `You look at a center card.\n\n` +
                                `Card ${centerIndex + 1}: **${centerCard.name}** ${centerCard.emoji}`
                            )
                            .setColor('#4B0082')
                            .setFooter({ text: 'One Night Werewolf Game' });
                            
                        await interaction.editReply({ embeds: [embed], components: [] });
                    }
                }
                break;
                
            case 'witch':
                if (interaction.isStringSelectMenu()) {
                    if (customId.includes('center')) {
                        const selectedValue = interaction.values[0];
                        
                        if (selectedValue.startsWith('center_')) {
                            const centerIndex = parseInt(selectedValue.split('_')[1]);
                            const centerCard = eventData.centerCards[centerIndex];
                            
                            const playerOptions = eventData.players
                                .map(player => ({
                                    label: player.username.substring(0, 80),
                                    value: `player_${player.id}`,
                                    emoji: '👤',
                                    description: 'Swap with this player'
                                }));
                            
                            playerOptions.push({ 
                                label: 'Skip Swap', 
                                value: 'skip', 
                                emoji: '⏭️',
                                description: 'Just view the center card' 
                            });
                            
                            const playerSelectRow = new ActionRowBuilder()
                                .addComponents(
                                    new StringSelectMenuBuilder()
                                        .setCustomId(`witch_player_${centerIndex}_${channelId}_${playerId}`)
                                        .setPlaceholder('Choose a player to swap with')
                                        .addOptions(playerOptions)
                                );
                            
                            const embed = new EmbedBuilder()
                                .setTitle('🧙 Witch Night Action')
                                .setDescription(
                                    `You looked at center card ${centerIndex + 1}.\n\n` +
                                    `The card is a **${centerCard.name}** ${centerCard.emoji}.\n\n` +
                                    `You may swap this card with a player's card.`
                                )
                                .setColor('#800080')
                                .setFooter({ text: 'One Night Werewolf Game' });
                            
                            await interaction.editReply({ 
                                embeds: [embed], 
                                components: [playerSelectRow] 
                            });
                            return;
                        }
                    }
                    else if (customId.includes('player')) {
                        const parts = customId.split('_');
                        const centerIndex = parseInt(parts[2]);
                        const centerCard = eventData.centerCards[centerIndex];
                        const selectedValue = interaction.values[0];
                        
                        if (selectedValue.startsWith('player_')) {
                            const targetId = selectedValue.split('_')[1];
                            const targetPlayer = eventData.players.find(p => p.id === targetId);
                            const targetRole = eventData.playerRoles[targetId];
                            
                            const tempRole = targetRole;
                            eventData.playerRoles[targetId] = centerCard;
                            eventData.centerCards[centerIndex] = tempRole;
                            
                            actionData = { 
                                actionType: 'witch',
                                action: 'swap',
                                centerCard: centerIndex,
                                playerTarget: targetId,
                                processed: true
                            };
                            
                            const embed = new EmbedBuilder()
                                .setTitle('🧙 Witch Night Action')
                                .setDescription(
                                    `You swapped center card ${centerIndex + 1} (${centerCard.name} ${centerCard.emoji}) ` +
                                    `with ${targetPlayer.username}'s card (${targetRole.name} ${targetRole.emoji}).\n\n` +
                                    `${targetPlayer.username} is now a ${centerCard.name}.\n` +
                                    `Center card ${centerIndex + 1} is now a ${targetRole.name}.`
                                )
                                .setColor('#800080')
                                .setFooter({ text: 'One Night Werewolf Game' });
                                
                            await interaction.editReply({ embeds: [embed], components: [] });
                        } else if (selectedValue === 'skip') {
                            actionData = { 
                                actionType: 'witch',
                                action: 'view_only',
                                centerCard: centerIndex
                            };
                            
                            const embed = new EmbedBuilder()
                                .setTitle('🧙 Witch Night Action')
                                .setDescription(
                                    `You looked at center card ${centerIndex + 1}.\n\n` +
                                    `The card is a **${centerCard.name}** ${centerCard.emoji}.\n\n` +
                                    `You decided not to swap it.`
                                )
                                .setColor('#800080')
                                .setFooter({ text: 'One Night Werewolf Game' });
                                
                            await interaction.editReply({ embeds: [embed], components: [] });
                        }
                    }
                }
                break;
                
            case 'robber':
                if (interaction.isStringSelectMenu() && customId.includes('action')) {
                    const selectedValue = interaction.values[0];
                    
                    if (selectedValue.startsWith('player_')) {
                        const targetId = selectedValue.split('_')[1];
                        const targetPlayer = eventData.players.find(p => p.id === targetId);
                        const targetRole = eventData.playerRoles[targetId];
                        const robberRole = eventData.playerRoles[playerId];
                        
                        // 역할 교환
                        eventData.playerRoles[playerId] = targetRole;
                        eventData.playerRoles[targetId] = robberRole;
                        
                        actionData = { 
                            actionType: 'robber',
                            action: 'rob',
                            target: targetId,
                            processed: true
                        };
                        
                        const embed = new EmbedBuilder()
                            .setTitle('🦝 Robber Night Action')
                            .setDescription(
                                `You robbed ${targetPlayer.username}'s card and gave them your Robber card.\n\n` +
                                `You are now a **${targetRole.name}** ${targetRole.emoji}\n\n` +
                                `${targetPlayer.username} is now a **Robber** 🦝`
                            )
                            .setColor('#8B4513')
                            .setFooter({ text: 'One Night Werewolf Game' });
                            
                        await interaction.editReply({ embeds: [embed], components: [] });
                    }
                }
                break;
                
            case 'troublemaker':
                if (interaction.isStringSelectMenu()) {
                    if (customId.includes('player1')) {
                        const selectedValue = interaction.values[0];
                        
                        if (selectedValue !== 'skip') {
                            const firstPlayerId = selectedValue;
                            const firstPlayer = eventData.players.find(p => p.id === firstPlayerId);
                            
                            const remainingPlayers = eventData.players
                                .filter(p => p.id !== playerId && p.id !== firstPlayerId)
                                .map(player => ({
                                    label: player.username.substring(0, 80),
                                    value: player.id,
                                    emoji: '👤',
                                    description: 'Select as second player'
                                }));
                            
                            if (remainingPlayers.length === 0) {
                                await interaction.editReply({ 
                                    content: 'Not enough players to perform troublemaker action.', 
                                    components: [] 
                                });
                                return;
                            }
                            
                            const secondPlayerSelectRow = new ActionRowBuilder()
                                .addComponents(
                                    new StringSelectMenuBuilder()
                                        .setCustomId(`troublemaker_player2_${firstPlayerId}_${channelId}_${playerId}`)
                                        .setPlaceholder('Select second player')
                                        .addOptions(remainingPlayers)
                                );
                            
                            await interaction.editReply({ 
                                content: `You selected ${firstPlayer.username} as the first player. Now select the second player:`,
                                embeds: [],
                                components: [secondPlayerSelectRow]
                            });
                            return;
                        }
                    }
                    else if (customId.includes('player2')) {
                        const parts = customId.split('_');
                        const firstPlayerId = parts[2];
                        const secondPlayerId = interaction.values[0];
                        
                        const firstPlayer = eventData.players.find(p => p.id === firstPlayerId);
                        const secondPlayer = eventData.players.find(p => p.id === secondPlayerId);
                        
                        // 두 플레이어의 역할 교환
                        const firstRole = eventData.playerRoles[firstPlayerId];
                        const secondRole = eventData.playerRoles[secondPlayerId];
                        
                        eventData.playerRoles[firstPlayerId] = secondRole;
                        eventData.playerRoles[secondPlayerId] = firstRole;
                        
                        actionData = { 
                            actionType: 'troublemaker',
                            action: 'swap_players',
                            targets: [firstPlayerId, secondPlayerId],
                            processed: true
                        };
                        
                        const embed = new EmbedBuilder()
                            .setTitle('😈 Troublemaker Night Action')
                            .setDescription(
                                `You swapped the cards of ${firstPlayer.username} and ${secondPlayer.username}.\n\n` +
                                `${firstPlayer.username} now has ${secondPlayer.username}'s original card.\n` +
                                `${secondPlayer.username} now has ${firstPlayer.username}'s original card.\n\n` +
                                `(You don't know what the cards were)`
                            )
                            .setColor('#8B0000')
                            .setFooter({ text: 'One Night Werewolf Game' });
                            
                        await interaction.editReply({ embeds: [embed], components: [] });
                    }
                }
                break;
                
            case 'drunk':
                if (interaction.isStringSelectMenu() && customId.includes('action')) {
                    const selectedValue = interaction.values[0];
                    
                    if (selectedValue.startsWith('center_')) {
                        const centerIndex = parseInt(selectedValue.split('_')[1]);
                        const centerCard = eventData.centerCards[centerIndex];
                        const drunkRole = eventData.playerRoles[playerId];
                        
                        // 드럭과 중앙 카드 교환
                        eventData.playerRoles[playerId] = centerCard;
                        eventData.centerCards[centerIndex] = drunkRole;
                        
                        actionData = { 
                            actionType: 'drunk',
                            action: 'swap_center',
                            centerCard: centerIndex,
                            processed: true
                        };
                        
                        const embed = new EmbedBuilder()
                            .setTitle('🍺 Drunk Night Action')
                            .setDescription(
                                `You exchanged your Drunk card with center card ${centerIndex + 1}.\n\n` +
                                `You don't know what your new role is!\n\n` +
                                `Center card ${centerIndex + 1} is now a **Drunk** 🍺`
                            )
                            .setColor('#FFD700')
                            .setFooter({ text: 'One Night Werewolf Game' });
                            
                        await interaction.editReply({ embeds: [embed], components: [] });
                    }
                }
                break;
                
            case 'mysticwolf':
                if (interaction.isStringSelectMenu() && customId.includes('action')) {
                    const selectedValue = interaction.values[0];
                    
                    if (selectedValue.startsWith('player_')) {
                        const targetId = selectedValue.split('_')[1];
                        const targetPlayer = eventData.players.find(p => p.id === targetId);
                        const targetRole = eventData.playerRoles[targetId];
                        
                        actionData = { 
                            actionType: 'mysticwolf',
                            action: 'view_player',
                            target: targetId
                        };
                        
                        const embed = new EmbedBuilder()
                            .setTitle('🌙 Mystic Wolf Night Action')
                            .setDescription(
                                `As a Mystic Wolf, you looked at ${targetPlayer.username}'s card.\n\n` +
                                `${targetPlayer.username} is a **${targetRole.name}** ${targetRole.emoji}`
                            )
                            .setColor('#4B0082')
                            .setFooter({ text: 'One Night Werewolf Game' });
                            
                        await interaction.editReply({ embeds: [embed], components: [] });
                    }
                }
                break;
                
            case 'paranormal':
                if (interaction.isStringSelectMenu()) {
                    if (customId.includes('first')) {
                        const selectedValue = interaction.values[0];
                        
                        if (selectedValue.startsWith('player_')) {
                            const targetId = selectedValue.split('_')[1];
                            const targetPlayer = eventData.players.find(p => p.id === targetId);
                            const targetRole = eventData.playerRoles[targetId];
                            
                            if (targetRole.id === 'werewolf' || targetRole.id === 'tanner') {
                                // 웨어울프나 테너를 발견한 경우 그 역할이 됨
                                eventData.playerRoles[playerId] = {
                                    ...targetRole,
                                    originalId: 'paranormalinvestigator'
                                };
                                
                                actionData = { 
                                    actionType: 'paranormalinvestigator',
                                    action: 'transform',
                                    target: targetId,
                                    newRole: targetRole.id,
                                    processed: true
                                };
                                
                                const embed = new EmbedBuilder()
                                    .setTitle('🕵️ Paranormal Investigator Night Action')
                                    .setDescription(
                                        `You investigated ${targetPlayer.username} and found they are a **${targetRole.name}** ${targetRole.emoji}!\n\n` +
                                        `You immediately become a ${targetRole.name} and stop investigating.\n\n` +
                                        `Your win condition has changed to match the ${targetRole.name}.`
                                    )
                                    .setColor(targetRole.id === 'werewolf' ? '#8B0000' : '#654321')
                                    .setFooter({ text: 'One Night Werewolf Game' });
                                    
                                await interaction.editReply({ embeds: [embed], components: [] });
                            } else {
                                // 일반 역할을 발견한 경우 두 번째 조사 선택
                                const remainingPlayers = eventData.players
                                    .filter(p => p.id !== playerId && p.id !== targetId)
                                    .map(player => ({
                                        label: player.username.substring(0, 80),
                                        value: `player_${player.id}`,
                                        emoji: '👤',
                                        description: 'Investigate this player'
                                    }));
                                
                                remainingPlayers.push({ 
                                    label: 'Stop Investigating', 
                                    value: 'stop', 
                                    emoji: '⏹️',
                                    description: 'Stop investigating and remain Paranormal Investigator' 
                                });
                                
                                const secondSelectRow = new ActionRowBuilder()
                                    .addComponents(
                                        new StringSelectMenuBuilder()
                                            .setCustomId(`paranormal_second_${targetId}_${channelId}_${playerId}`)
                                            .setPlaceholder('Choose second player to investigate or stop')
                                            .addOptions(remainingPlayers)
                                    );
                                
                                const embed = new EmbedBuilder()
                                    .setTitle('🕵️ Paranormal Investigator Night Action')
                                    .setDescription(
                                        `You investigated ${targetPlayer.username} and found they are a **${targetRole.name}** ${targetRole.emoji}.\n\n` +
                                        `This is not a Werewolf or Tanner, so you may investigate one more player.`
                                    )
                                    .setColor('#4B0082')
                                    .setFooter({ text: 'One Night Werewolf Game' });
                                
                                await interaction.editReply({ 
                                    embeds: [embed], 
                                    components: [secondSelectRow] 
                                });
                                return;
                            }
                        }
                    }
                    else if (customId.includes('second')) {
                        const parts = customId.split('_');
                        const firstTargetId = parts[2];
                        const selectedValue = interaction.values[0];
                        
                        if (selectedValue === 'stop') {
                            actionData = { 
                                actionType: 'paranormalinvestigator',
                                action: 'investigate_one',
                                targets: [firstTargetId]
                            };
                            
                            const firstPlayer = eventData.players.find(p => p.id === firstTargetId);
                            const firstRole = eventData.playerRoles[firstTargetId];
                            
                            const embed = new EmbedBuilder()
                                .setTitle('🕵️ Paranormal Investigator Night Action')
                                .setDescription(
                                    `You investigated one player.\n\n` +
                                    `${firstPlayer.username} is a **${firstRole.name}** ${firstRole.emoji}\n\n` +
                                    `You remain a Paranormal Investigator.`
                                )
                                .setColor('#4B0082')
                                .setFooter({ text: 'One Night Werewolf Game' });
                                
                            await interaction.editReply({ embeds: [embed], components: [] });
                        } 
                        else if (selectedValue.startsWith('player_')) {
                            const secondTargetId = selectedValue.split('_')[1];
                            const secondPlayer = eventData.players.find(p => p.id === secondTargetId);
                            const secondRole = eventData.playerRoles[secondTargetId];
                            
                            if (secondRole.id === 'werewolf' || secondRole.id === 'tanner') {
                                // 두 번째에서 웨어울프나 테너를 발견
                                eventData.playerRoles[playerId] = {
                                    ...secondRole,
                                    originalId: 'paranormalinvestigator'
                                };
                                
                                actionData = { 
                                    actionType: 'paranormalinvestigator',
                                    action: 'transform_second',
                                    targets: [firstTargetId, secondTargetId],
                                    newRole: secondRole.id,
                                    processed: true
                                };
                                
                                const firstPlayer = eventData.players.find(p => p.id === firstTargetId);
                                const firstRole = eventData.playerRoles[firstTargetId];
                                
                                const embed = new EmbedBuilder()
                                    .setTitle('🕵️ Paranormal Investigator Night Action')
                                    .setDescription(
                                        `You investigated two players:\n\n` +
                                        `${firstPlayer.username}: **${firstRole.name}** ${firstRole.emoji}\n` +
                                        `${secondPlayer.username}: **${secondRole.name}** ${secondRole.emoji}\n\n` +
                                        `You found a ${secondRole.name} and immediately transform into one!\n\n` +
                                        `Your win condition has changed to match the ${secondRole.name}.`
                                    )
                                    .setColor(secondRole.id === 'werewolf' ? '#8B0000' : '#654321')
                                    .setFooter({ text: 'One Night Werewolf Game' });
                                    
                                await interaction.editReply({ embeds: [embed], components: [] });
                            } else {
                                // 두 번째도 일반 역할
                                actionData = { 
                                    actionType: 'paranormalinvestigator',
                                    action: 'investigate_two',
                                    targets: [firstTargetId, secondTargetId]
                                };
                                
                                const firstPlayer = eventData.players.find(p => p.id === firstTargetId);
                                const firstRole = eventData.playerRoles[firstTargetId];
                                
                                const embed = new EmbedBuilder()
                                    .setTitle('🕵️ Paranormal Investigator Night Action')
                                    .setDescription(
                                        `You investigated two players:\n\n` +
                                        `${firstPlayer.username}: **${firstRole.name}** ${firstRole.emoji}\n` +
                                        `${secondPlayer.username}: **${secondRole.name}** ${secondRole.emoji}\n\n` +
                                        `Neither was a Werewolf or Tanner. You remain a Paranormal Investigator.`
                                    )
                                    .setColor('#4B0082')
                                    .setFooter({ text: 'One Night Werewolf Game' });
                                    
                                await interaction.editReply({ embeds: [embed], components: [] });
                            }
                        }
                    }
                }
                break;
                
            case 'werewolf':
                if (interaction.isStringSelectMenu() && customId.includes('center')) {
                    const selectedValue = interaction.values[0];
                    
                    if (selectedValue.startsWith('center_')) {
                        const centerIndex = parseInt(selectedValue.split('_')[1]);
                        const centerCard = eventData.centerCards[centerIndex];
                        
                        actionData = { 
                            actionType: 'werewolf',
                            action: 'view_center',
                            target: `center_${centerIndex}`
                        };
                        
                        const embed = new EmbedBuilder()
                            .setTitle('🐺 Werewolf Night Action')
                            .setDescription(
                                `As a lone Werewolf, you looked at center card ${centerIndex + 1}.\n\n` +
                                `Card ${centerIndex + 1}: **${centerCard.name}** ${centerCard.emoji}`
                            )
                            .setColor('#8B0000')
                            .setFooter({ text: 'One Night Werewolf Game' });
                            
                        await interaction.editReply({ embeds: [embed], components: [] });
                    }
                }
                break;
                
            default:
                console.error(`알 수 없는 액션 타입: ${actionType}`);
                await interaction.editReply({ 
                    content: 'Unknown action type.', 
                    components: [] 
                });
                return;
        }
        
        // 액션 데이터 저장
        if (Object.keys(actionData).length > 0) {
            eventData.nightActions[playerId] = actionData;
            setActiveEvent(channelId, EVENT_TYPES.WEREWOLF_GAME, eventData);
            console.log(`플레이어 ${playerId}의 밤 액션 저장됨:`, actionData);
        }
        
    } catch (error) {
        console.error('밤 액션 처리 중 오류:', error);
        try {
            await interaction.editReply({ 
                content: 'An error occurred while processing your action.', 
                components: [] 
            });
        } catch (replyError) {
            console.error('오류 응답 전송 실패:', replyError);
        }
    }
}

// 아침 단계 시작
async function startDayPhase(client, channel, eventData) {
    try {
        eventData.status = 'day';
        eventData.discussionEndTime = Date.now() + (5 * 60 * 1000); // 5분
        setActiveEvent(channel.id, EVENT_TYPES.WEREWOLF_GAME, eventData);
        
        const embed = new EmbedBuilder()
            .setTitle('☀️ Morning Phase - Discussion Time')
            .setDescription(
                '**Good morning, everyone!**\n\n' +
                'The night has ended. It\'s time to discuss what happened and figure out who the Werewolves are!\n\n' +
                '**Discussion Rules:**\n' +
                '• Share information about your night actions\n' +
                '• Ask questions and analyze claims\n' +
                '• Try to identify the Werewolves\n' +
                '• Remember: Werewolves will try to deceive you!\n\n' +
                '**Time limit:** 5 minutes\n' +
                '**Players can vote to extend once by 2 minutes**'
            )
            .setColor('#FFD700')
            .setFooter({ text: 'Discussion phase will end automatically in 5 minutes' });
        
        const extensionRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('werewolf_extend_yes')
                    .setLabel('Extend Discussion (+2 min)')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('⏰'),
                new ButtonBuilder()
                    .setCustomId('werewolf_extend_no')
                    .setLabel('Start Voting Now')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🗳️')
            );
        
        const dayMessage = await channel.send({
            embeds: [embed],
            components: [extensionRow]
        });
        
        eventData.dayMessageId = dayMessage.id;
        eventData.extensionVotes = { yes: [], no: [] };
        setActiveEvent(channel.id, EVENT_TYPES.WEREWOLF_GAME, eventData);
        
        // 자동 투표 시작 타이머
        timerManager.scheduleTimer(
            `voting_start_${channel.id}`,
            () => startVotingPhase(client, channel, eventData),
            5 * 60 * 1000,
            { channelId: channel.id }
        );
        
        // 토론 시간 카운트다운 업데이트
        const discussionUpdateInterval = setInterval(async () => {
            try {
                const currentEvent = getActiveEvent(channel.id);
                if (!currentEvent || currentEvent.type !== EVENT_TYPES.WEREWOLF_GAME || currentEvent.data.status !== 'day') {
                    clearInterval(discussionUpdateInterval);
                    return;
                }
                
                const timeLeft = Math.max(0, currentEvent.data.discussionEndTime - Date.now());
                if (timeLeft <= 0) {
                    clearInterval(discussionUpdateInterval);
                    return;
                }
                
                const minutes = Math.floor(timeLeft / 60000);
                const seconds = Math.floor((timeLeft % 60000) / 1000);
                const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;
                
                try {
                    const currentEmbed = dayMessage.embeds[0];
                    if (currentEmbed) {
                        const updatedEmbed = EmbedBuilder.from(currentEmbed)
                            .setFooter({ text: `Discussion time remaining: ${timeString}` });
                        
                        await dayMessage.edit({ embeds: [updatedEmbed] });
                    }
                } catch (updateError) {
                    console.error('Error updating discussion timer:', updateError);
                }
            } catch (error) {
                console.error('Error in discussion update interval:', error);
                clearInterval(discussionUpdateInterval);
            }
        }, 10000); // 10초마다 업데이트
        
    } catch (error) {
        console.error('Error starting day phase:', error);
        await channel.send('An error occurred during the day phase. The game will be cancelled.');
        await endGame(client, channel, eventData, true);
    }
}

// 연장 투표 처리
async function handleExtensionVote(interaction) {
    try {
        const activeEvent = getActiveEvent(interaction.channel.id);
        if (!activeEvent || activeEvent.type !== EVENT_TYPES.WEREWOLF_GAME || activeEvent.data.status !== 'day') {
            await interaction.reply({ content: 'This game is not in the discussion phase.', ephemeral: true });
            return;
        }
        
        const eventData = activeEvent.data;
        const userId = interaction.user.id;
        
        // 플레이어 확인
        if (!eventData.players.some(p => p.id === userId)) {
            await interaction.reply({ content: 'You are not a player in this game.', ephemeral: true });
            return;
        }
        
        // 이미 투표했는지 확인
        if (eventData.extensionVotes.yes.includes(userId) || eventData.extensionVotes.no.includes(userId)) {
            await interaction.reply({ content: 'You have already voted on the extension.', ephemeral: true });
            return;
        }
        
        // 이미 연장되었는지 확인
        if (eventData.discussionExtended) {
            await interaction.reply({ content: 'The discussion has already been extended.', ephemeral: true });
            return;
        }
        
        const voteType = interaction.customId === 'werewolf_extend_yes' ? 'yes' : 'no';
        eventData.extensionVotes[voteType].push(userId);
        
        const totalVotes = eventData.extensionVotes.yes.length + eventData.extensionVotes.no.length;
        const requiredVotes = Math.ceil(eventData.players.length / 2);
        
        await interaction.reply({ 
            content: `You voted **${voteType.toUpperCase()}** for extension. (${totalVotes}/${requiredVotes} votes needed)`, 
            ephemeral: true 
        });
        
        // 충분한 표가 모이면 결과 처리
        if (totalVotes >= requiredVotes) {
            const yesVotes = eventData.extensionVotes.yes.length;
            const noVotes = eventData.extensionVotes.no.length;
            
            if (yesVotes > noVotes) {
                // 연장 승인
                eventData.discussionExtended = true;
                eventData.discussionEndTime += (2 * 60 * 1000); // 2분 추가
                
                // 기존 타이머 취소하고 새 타이머 설정
                timerManager.clearTimer(`voting_start_${interaction.channel.id}`);
                timerManager.scheduleTimer(
                    `voting_start_${interaction.channel.id}`,
                    () => startVotingPhase(interaction.client, interaction.channel, eventData),
                    2 * 60 * 1000,
                    { channelId: interaction.channel.id }
                );
                
                await interaction.followUp({
                    content: `📢 **Discussion extended by 2 minutes!** (${yesVotes} yes, ${noVotes} no)`,
                    ephemeral: false
                });
                
                // 버튼 비활성화
                const disabledRow = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('werewolf_extend_yes')
                            .setLabel('Extended')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(true),
                        new ButtonBuilder()
                            .setCustomId('werewolf_extend_no')
                            .setLabel('Start Voting Now')
                            .setStyle(ButtonStyle.Primary)
                            .setEmoji('🗳️')
                    );
                
                try {
                    await interaction.message.edit({ components: [disabledRow] });
                } catch (error) {
                    console.error('Error disabling extension button:', error);
                }
            } else {
                // 연장 거부, 즉시 투표 시작
                await interaction.followUp({
                    content: `📢 **Starting voting now!** (${yesVotes} yes, ${noVotes} no)`,
                    ephemeral: false
                });
                
                timerManager.clearTimer(`voting_start_${interaction.channel.id}`);
                await startVotingPhase(interaction.client, interaction.channel, eventData);
            }
        }
        
        setActiveEvent(interaction.channel.id, EVENT_TYPES.WEREWOLF_GAME, eventData);
        
    } catch (error) {
        console.error('Error handling extension vote:', error);
        await interaction.reply({ content: 'An error occurred while processing your vote.', ephemeral: true });
    }
}

// 투표 단계 시작
async function startVotingPhase(client, channel, eventData) {
    try {
        eventData.status = 'voting';
        eventData.votes = {};
        eventData.voteCount = {};
        setActiveEvent(channel.id, EVENT_TYPES.WEREWOLF_GAME, eventData);
        
        // 플레이어 번호 할당 시 서버 닉네임 가져오기
        const playerList = [];
        for (let i = 0; i < eventData.players.length; i++) {
            const player = eventData.players[i];
            let displayName = player.username;
            
            // 서버 닉네임 가져오기 시도
            try {
                if (channel.guild) {
                    const member = await channel.guild.members.fetch(player.id);
                    displayName = member.displayName || member.user.username;
                }
            } catch (error) {
                console.log(`Could not fetch member for ${player.id}, using username`);
            }
            
            playerList.push({
                ...player,
                number: i + 1,
                displayName: displayName
            });
        }
        
        const embed = new EmbedBuilder()
            .setTitle('🗳️ Voting Phase')
            .setDescription(
                '**Time to vote!**\n\n' +
                'Each player must vote for who they think is a Werewolf.\n' +
                'Vote by typing the **number** of the player you want to eliminate.\n\n' +
                '**Player List:**\n' +
                playerList.map(p => `**${p.number}.** @${p.displayName}`).join('\n') + '\n\n' +
                '**Voting Rules:**\n' +
                '• Type only the number (1, 2, 3, etc.)\n' +
                '• You must vote within 2 minutes\n' +
                '• You cannot change your vote once submitted\n' +
                '• Ties will be handled by eliminating all tied players'
            )
            .setColor('#FF4500')
            .addFields(
                { name: 'Votes Received', value: 'Waiting for votes...', inline: false },
                { name: 'Time Remaining', value: '2:00', inline: true }
            )
            .setFooter({ text: 'Vote by typing the player number in chat' });
        
        const voteMessage = await channel.send({ embeds: [embed] });
        eventData.voteMessageId = voteMessage.id;
        
        // 투표 종료 타이머
        timerManager.scheduleTimer(
            `voting_end_${channel.id}`,
            () => endVotingAndGame(client, channel, eventData),
            2 * 60 * 1000,
            { channelId: channel.id }
        );
        
        // 투표 카운트다운 업데이트
        const votingUpdateInterval = setInterval(async () => {
            try {
                const currentEvent = getActiveEvent(channel.id);
                if (!currentEvent || currentEvent.type !== EVENT_TYPES.WEREWOLF_GAME || currentEvent.data.status !== 'voting') {
                    clearInterval(votingUpdateInterval);
                    return;
                }
                
                const startTime = Date.now() - (2 * 60 * 1000 - (eventData.votingEndTime ? eventData.votingEndTime - Date.now() : 2 * 60 * 1000));
                const timeLeft = Math.max(0, (2 * 60 * 1000) - (Date.now() - startTime));
                
                if (timeLeft <= 0) {
                    clearInterval(votingUpdateInterval);
                    return;
                }
                
                const minutes = Math.floor(timeLeft / 60000);
                const seconds = Math.floor((timeLeft % 60000) / 1000);
                const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;
                
                // 투표 현황 업데이트
                const voteCounts = {};
                Object.values(currentEvent.data.votes).forEach(vote => {
                    voteCounts[vote] = (voteCounts[vote] || 0) + 1;
                });
                
                const voteDisplay = playerList.map(p => {
                    const count = voteCounts[p.number] || 0;
                    return `**${p.number}.** ${p.username}: ${count} vote${count !== 1 ? 's' : ''}`;
                }).join('\n') || 'No votes yet';
                
                const votedPlayers = Object.keys(currentEvent.data.votes).length;
                const totalPlayers = currentEvent.data.players.length;
                
                try {
                    const currentEmbed = voteMessage.embeds[0];
                    if (currentEmbed) {
                        const updatedEmbed = EmbedBuilder.from(currentEmbed)
                            .spliceFields(0, 2, 
                                { name: `Votes Received (${votedPlayers}/${totalPlayers})`, value: voteDisplay, inline: false },
                                { name: 'Time Remaining', value: timeString, inline: true }
                            );
                        
                        await voteMessage.edit({ embeds: [updatedEmbed] });
                    }
                } catch (updateError) {
                    console.error('Error updating voting display:', updateError);
                }
                
                // 모든 플레이어가 투표했으면 즉시 종료
                if (votedPlayers >= totalPlayers) {
                    clearInterval(votingUpdateInterval);
                    timerManager.clearTimer(`voting_end_${channel.id}`);
                    setTimeout(() => {
                        endVotingAndGame(client, channel, currentEvent.data);
                    }, 1000);
                }
            } catch (error) {
                console.error('Error in voting update interval:', error);
                clearInterval(votingUpdateInterval);
            }
        }, 5000); // 5초마다 업데이트
        
        setActiveEvent(channel.id, EVENT_TYPES.WEREWOLF_GAME, eventData);
        
    } catch (error) {
        console.error('Error starting voting phase:', error);
        await endGame(client, channel, eventData, true);
    }
}

// 번호 투표 처리
async function handleNumberVote(message) {
    try {
        const channelId = message.channel.id;
        const activeEvent = getActiveEvent(channelId);
        
        if (!activeEvent || activeEvent.type !== EVENT_TYPES.WEREWOLF_GAME || activeEvent.data.status !== 'voting') {
            return false;
        }
        
        const eventData = activeEvent.data;
        const userId = message.author.id;
        
        // 플레이어 확인
        if (!eventData.players.some(p => p.id === userId)) {
            return false;
        }
        
        // 이미 투표했는지 확인
        if (eventData.votes[userId]) {
            await message.react('❌');
            try {
                await message.reply('You have already voted!');
            } catch (error) {
                console.error('Error sending vote duplicate message:', error);
            }
            return true;
        }
        
        const content = message.content.trim();
        const voteNumber = parseInt(content);
        
        // 유효한 번호인지 확인
        if (isNaN(voteNumber) || voteNumber < 1 || voteNumber > eventData.players.length) {
            await message.react('❌');
            try {
                await message.reply(`Please vote with a valid player number (1-${eventData.players.length})`);
            } catch (error) {
                console.error('Error sending invalid vote message:', error);
            }
            return true;
        }
        
        // 자기 자신에게 투표하는지 확인
        const targetPlayer = eventData.players[voteNumber - 1];
        if (targetPlayer.id === userId) {
            await message.react('❌');
            try {
                await message.reply('You cannot vote for yourself!');
            } catch (error) {
                console.error('Error sending self-vote message:', error);
            }
            return true;
        }
        
        // 투표 저장
        eventData.votes[userId] = voteNumber;
        setActiveEvent(channelId, EVENT_TYPES.WEREWOLF_GAME, eventData);
        
        await message.react('✅');
        
        // 모든 플레이어가 투표했는지 확인
        const votedCount = Object.keys(eventData.votes).length;
        const totalPlayers = eventData.players.length;
        
        if (votedCount >= totalPlayers) {
            console.log('All players have voted, ending voting phase');
            timerManager.clearTimer(`voting_end_${channelId}`);
            setTimeout(() => {
                endVotingAndGame(message.client, message.channel, eventData);
            }, 2000);
        }
        
        return true;
    } catch (error) {
        console.error('Error handling number vote:', error);
        return false;
    }
}

// 투표 종료 및 게임 결과 처리
async function endVotingAndGame(client, channel, eventData) {
    try {
        eventData.status = 'ended';
        setActiveEvent(channel.id, EVENT_TYPES.WEREWOLF_GAME, eventData);
        
        // 투표 집계
        const voteCounts = {};
        const playerVotes = {};
        
        Object.entries(eventData.votes).forEach(([voterId, voteNumber]) => {
            const voterName = eventData.players.find(p => p.id === voterId)?.username || 'Unknown';
            const targetName = eventData.players[voteNumber - 1]?.username || 'Unknown';
            
            voteCounts[voteNumber] = (voteCounts[voteNumber] || 0) + 1;
            if (!playerVotes[voteNumber]) playerVotes[voteNumber] = [];
            playerVotes[voteNumber].push(voterName);
        });
        
        // 최고 득표수 찾기
        const maxVotes = Math.max(...Object.values(voteCounts));
        const eliminatedNumbers = Object.keys(voteCounts)
            .filter(num => voteCounts[num] === maxVotes)
            .map(num => parseInt(num));
        
        const eliminatedPlayers = eliminatedNumbers.map(num => eventData.players[num - 1]);
        
        // 승리 조건 확인
        const { winners, winCondition } = determineWinners(eventData, eliminatedPlayers);
        
        // 결과 임베드 생성
        const resultEmbed = createGameResultEmbed(eventData, eliminatedPlayers, winners, winCondition, voteCounts, playerVotes);
        
        await channel.send({ embeds: [resultEmbed] });
        
        // 보상 지급
        await distributeRewards(eventData, winners);
        
        // 게임 정리
        await endGame(client, channel, eventData, false);
        
    } catch (error) {
        console.error('Error ending voting and game:', error);
        await endGame(client, channel, eventData, true);
    }
}

// 승리자 결정
function determineWinners(eventData, eliminatedPlayers) {
    const eliminatedIds = eliminatedPlayers.map(p => p.id);
    // 여기서 currentRoles는 이미 트러블메이커 등의 교환이 반영된 최종 역할이어야 함
    const currentRoles = eventData.playerRoles; // 이 부분이 이미 교환 후 역할을 담고 있어야 함
    
    // 제거된 플레이어들의 현재 역할 확인 (교환 후 역할)
    const eliminatedWerewolves = eliminatedIds.filter(id => {
        const role = currentRoles[id];
        return role && (role.id === 'werewolf' || role.id === 'mysticwolf');
    });
    
    const eliminatedTanners = eliminatedIds.filter(id => {
        const role = currentRoles[id];
        return role && role.id === 'tanner';
    });
    
    // 테너가 제거되었다면 테너가 승리
    if (eliminatedTanners.length > 0) {
        return {
            winners: eliminatedTanners,
            winCondition: 'tanner'
        };
    }
    
    // 웨어울프가 제거되었다면 마을 사람들이 승리
    if (eliminatedWerewolves.length > 0) {
        const villagers = Object.entries(currentRoles)
            .filter(([id, role]) => {
                return role && role.team === 'villagers' && !eliminatedIds.includes(id);
            })
            .map(([id, role]) => id);
        
        return {
            winners: villagers,
            winCondition: 'villagers'
        };
    }
    
    // 웨어울프가 제거되지 않았다면 웨어울프들이 승리
    const werewolves = Object.entries(currentRoles)
        .filter(([id, role]) => {
            return role && (role.id === 'werewolf' || role.id === 'mysticwolf');
        })
        .map(([id, role]) => id);
    
    return {
        winners: werewolves,
        winCondition: 'werewolves'
    };
}

// 게임 결과 임베드 생성
function createGameResultEmbed(eventData, eliminatedPlayers, winners, winCondition, voteCounts, playerVotes) {
    const embed = new EmbedBuilder()
        .setTitle('🎭 One Night Werewolf - Game Results')
        .setColor(winCondition === 'werewolves' ? '#8B0000' : winCondition === 'tanner' ? '#654321' : '#008000');
    
    // 투표 결과
    let voteResultText = '';
    Object.entries(voteCounts).forEach(([playerNum, count]) => {
        const player = eventData.players[parseInt(playerNum) - 1];
        const voters = playerVotes[playerNum] || [];
        voteResultText += `**${player.username}**: ${count} vote${count !== 1 ? 's' : ''} (${voters.join(', ')})\n`;
    });
    
    embed.addFields({ name: 'Voting Results', value: voteResultText || 'No votes', inline: false });
    
    // 제거된 플레이어
    const eliminatedText = eliminatedPlayers.length > 0 
        ? eliminatedPlayers.map(p => {
            const role = eventData.playerRoles[p.id];
            return `${p.username} (${role.name} ${role.emoji})`;
        }).join('\n')
        : 'No one was eliminated';
    
    embed.addFields({ name: 'Eliminated Players', value: eliminatedText, inline: false });
    
    // 승리 조건 및 승리자
    let winText = '';
    let winColor = '';
    
    switch (winCondition) {
        case 'tanner':
            winText = '🎊 **THE TANNER WINS!**\nThe Tanner successfully got voted out!';
            winColor = '#654321';
            break;
        case 'villagers':
            winText = '🎉 **THE VILLAGERS WIN!**\nAt least one Werewolf was eliminated!';
            winColor = '#008000';
            break;
        case 'werewolves':
            winText = '🐺 **THE WEREWOLVES WIN!**\nNo Werewolves were eliminated!';
            winColor = '#8B0000';
            break;
    }
    
    embed.setDescription(winText);
    embed.setColor(winColor);
    
    // 승리자 목록
    const winnerNames = winners.map(id => {
        const player = eventData.players.find(p => p.id === id);
        const role = eventData.playerRoles[id];
        return `${player.username} (${role.name} ${role.emoji})`;
    }).join('\n');
    
    if (winnerNames) {
        embed.addFields({ name: 'Winners', value: winnerNames, inline: false });
    }
    
    // 모든 플레이어의 최종 역할
    const roleRevealText = eventData.players.map(player => {
        const currentRole = eventData.playerRoles[player.id];
        const originalRole = eventData.originalRoles[player.id];
        
        if (currentRole.id === originalRole.id) {
            return `${player.username}: ${currentRole.name} ${currentRole.emoji}`;
        } else {
            return `${player.username}: ${currentRole.name} ${currentRole.emoji} (was ${originalRole.name})`;
        }
    }).join('\n');
    
    embed.addFields({ name: 'Final Roles', value: roleRevealText, inline: false });
    
    // 중앙 카드
    const centerText = eventData.centerCards.map((card, index) => 
        `Card ${index + 1}: ${card.name} ${card.emoji}`
    ).join('\n');
    
    embed.addFields({ name: 'Center Cards', value: centerText, inline: false });
    
    return embed;
}

// 보상 지급
async function distributeRewards(eventData, winners) {
    try {
        const baseReward = 100;
        const winnerReward = Math.floor(baseReward * 1.5);
        const participationReward = Math.floor(baseReward * 0.5);
        
        for (const player of eventData.players) {
            try {
                const isWinner = winners.includes(player.id);
                const reward = isWinner ? winnerReward : participationReward;
                
                addUserItem(player.id, ITEM_TYPES.CREDIT, reward);
                console.log(`Gave ${reward} credits to ${player.username} (winner: ${isWinner})`);
            } catch (rewardError) {
                console.error(`Error giving reward to player ${player.id}:`, rewardError);
            }
        }
    } catch (error) {
        console.error('Error distributing rewards:', error);
    }
}

// 게임 역할 할당 (디스코드 서버 역할)
async function assignGameRole(channel, eventData) {
    try {
        if (!channel.guild) return;
        
        const { getWerewolfRole } = require('../database/eventModel');
        const werewolfRoleId = getWerewolfRole(channel.guild.id);
        
        if (!werewolfRoleId) return;
        
        const werewolfRole = await channel.guild.roles.fetch(werewolfRoleId).catch(() => null);
        if (!werewolfRole) return;
        
        for (const player of eventData.players) {
            try {
                const member = await channel.guild.members.fetch(player.id).catch(() => null);
                if (member && !member.roles.cache.has(werewolfRoleId)) {
                    await member.roles.add(werewolfRole);
                    console.log(`Added werewolf role to ${player.username}`);
                }
            } catch (error) {
                console.error(`Error adding role to ${player.id}:`, error);
            }
        }
    } catch (error) {
        console.error('Error assigning game roles:', error);
    }
}

// 게임 역할 제거 (디스코드 서버 역할)
async function removeGameRole(channel, eventData) {
    try {
        if (!channel.guild) return;
        
        const { getWerewolfRole } = require('../database/eventModel');
        const werewolfRoleId = getWerewolfRole(channel.guild.id);
        
        if (!werewolfRoleId) return;
        
        const werewolfRole = await channel.guild.roles.fetch(werewolfRoleId).catch(() => null);
        if (!werewolfRole) return;
        
        for (const player of eventData.players) {
            try {
                const member = await channel.guild.members.fetch(player.id).catch(() => null);
                if (member && member.roles.cache.has(werewolfRoleId)) {
                    await member.roles.remove(werewolfRole);
                    console.log(`Removed werewolf role from ${player.username}`);
                }
            } catch (error) {
                console.error(`Error removing role from ${player.id}:`, error);
            }
        }
    } catch (error) {
        console.error('Error removing game roles:', error);
    }
}

// 게임 종료
async function endGame(client, channel, eventData, forced = false) {
    try {
        console.log(`Ending werewolf game in channel ${channel.id} (forced: ${forced})`);
        
        // 모든 타이머 정리
        timerManager.clearTimer(`autostart_${channel.id}`);
        timerManager.clearTimer(`voting_start_${channel.id}`);
        timerManager.clearTimer(`voting_end_${channel.id}`);
        
        // 게임 역할 제거
        await removeGameRole(channel, eventData);
        
        if (forced) {
            await channel.send('⚠️ The Werewolf game has been forcefully ended.');
        }
        
        // 활성 이벤트 제거
        removeActiveEvent(channel.id);
        
        // 모든 락 해제
        lockManager.releaseAllLocks(channel.id);
        
        console.log(`Werewolf game ended in channel ${channel.id}`);
    } catch (error) {
        console.error('Error ending werewolf game:', error);
        // 최소한 데이터베이스는 정리
        removeActiveEvent(channel.id);
        lockManager.releaseAllLocks(channel.id);
    }
}

// 게임 참가 핸들러
async function handleJoinGame(interaction) {
    const channelId = interaction.channel.id;
    const userId = interaction.user.id;
    
    if (lockManager.isLocked(channelId, 'begin_game')) {
        await interaction.reply({
            content: 'The game is currently starting. Please wait for the next round.',
            ephemeral: true
        });
        return;
    }
    
    if (!lockManager.acquireLock(channelId, 'join_game', 10000)) {
        await interaction.reply({
            content: 'Please wait, processing another join request...',
            ephemeral: true
        });
        return;
    }
    
    try {
        const activeEvent = getActiveEvent(channelId);
        if (!activeEvent || activeEvent.type !== EVENT_TYPES.WEREWOLF_GAME) {
            await interaction.reply({
                content: 'There is no active Werewolf game in this channel.',
                ephemeral: true
            });
            return;
        }
        
        const eventData = activeEvent.data;
        
        if (eventData.status !== 'joining') {
            await interaction.reply({
                content: 'The game has already started.',
                ephemeral: true
            });
            return;
        }
        
        if (eventData.players.length >= 15) {
            await interaction.reply({
                content: 'The game is already full (15 players maximum).',
                ephemeral: true
            });
            return;
        }
        
        if (eventData.players.some(p => p.id === userId)) {
            await interaction.reply({
                content: 'You have already joined this game.',
                ephemeral: true
            });
            return;
        }
        
        eventData.players.push({
            id: userId,
            username: interaction.user.username
        });
        
        setActiveEvent(channelId, EVENT_TYPES.WEREWOLF_GAME, eventData);
        
        await interaction.reply({
            content: `You have joined the Werewolf game! (${eventData.players.length} players)`,
            ephemeral: true
        });
        
        await updateJoinEmbed(interaction);
        
    } catch (error) {
        console.error('Error handling join game:', error);
        try {
            await interaction.reply({
                content: 'An error occurred while joining the game. Please try again.',
                ephemeral: true
            });
        } catch (replyError) {
            console.error('Error sending error reply:', replyError);
        }
    } finally {
        lockManager.releaseLock(channelId, 'join_game');
    }
}

// 게임 시작 핸들러
async function handleStartGame(interaction) {
    const activeEvent = getActiveEvent(interaction.channel.id);
    if (!activeEvent || activeEvent.type !== EVENT_TYPES.WEREWOLF_GAME) {
        await interaction.reply({
            content: 'There is no active Werewolf game in this channel.',
            ephemeral: true
        });
        return;
    }
    
    const eventData = activeEvent.data;
    
    const isAdmin = interaction.member && interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
    const isHost = eventData.host === interaction.user.id;
    
    if (!isAdmin && !isHost) {
        await interaction.reply({
            content: 'Only the game host or administrators can start the game.',
            ephemeral: true
        });
        return;
    }
    
    if (eventData.status !== 'joining') {
        await interaction.reply({
            content: 'The game has already started.',
            ephemeral: true
        });
        return;
    }
    
    if (eventData.players.length < 5) {
        await interaction.reply({
            content: 'At least 5 players are required to start the game.',
            ephemeral: true
        });
        return;
    }
    
    if (eventData.fromRandomEvent && eventData.players.length < 5) {
        await interaction.reply({
            content: `For random events, at least 5 players are required to start the game. Current players: ${eventData.players.length}`,
            ephemeral: true
        });
        return;
    }
    
    await interaction.deferReply({ ephemeral: true });
    
    try {
        await beginWerewolfGame(interaction);
    } catch (error) {
        console.error('Error starting werewolf game:', error);
        await interaction.editReply({
            content: 'An error occurred while starting the game. Please try again.'
        });
    }
}

// 게임 취소 핸들러
async function handleCancelGame(interaction) {
    const channelId = interaction.channel.id;
    
    const activeEvent = getActiveEvent(channelId);
    if (!activeEvent || activeEvent.type !== EVENT_TYPES.WEREWOLF_GAME) {
        await interaction.reply({
            content: 'There is no active Werewolf game in this channel.',
            ephemeral: true
        });
        return;
    }
    
    const eventData = activeEvent.data;
    
    const isAdmin = interaction.member && interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
    const isHost = eventData.host === interaction.user.id;
    
    if (!isAdmin && !isHost) {
        await interaction.reply({
            content: 'Only the game host or administrators can cancel the game.',
            ephemeral: true
        });
        return;
    }
    
    timerManager.clearTimer(`autostart_${channelId}`);
    
    await endGame(interaction.client, interaction.channel, eventData, true);
    
    await interaction.reply({
        content: 'The Werewolf game has been cancelled.',
        ephemeral: false
    });
    
    try {
        await interaction.message.edit({ components: [] });
    } catch (error) {
        console.error('Error disabling components:', error);
    }
}

// 모든 버튼 인터랙션 처리 함수
async function handleWerewolfButtonInteraction(interaction) {
    const customId = interaction.customId;
    
    try {
        if (customId === 'werewolf_join') {
            await handleJoinGame(interaction);
        } else if (customId === 'werewolf_start') {
            await handleStartGame(interaction);
        } else if (customId === 'werewolf_cancel') {
            await handleCancelGame(interaction);
        } else if (customId === 'werewolf_extend_yes' || customId === 'werewolf_extend_no') {
            await handleExtensionVote(interaction);
        } else if (customId === 'werewolf_vote') {
            await handleStartVoting(interaction);
        }
    } catch (error) {
        console.error(`Error handling werewolf button ${customId}:`, error);
        try {
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'An error occurred while processing your request.',
                    ephemeral: true
                });
            } else {
                await interaction.followUp({
                    content: 'An error occurred while processing your request.',
                    ephemeral: true
                });
            }
        } catch (replyError) {
            console.error('Error sending error reply:', replyError);
        }
    }
}

// 선택 메뉴 인터랙션 처리 함수
async function handleWerewolfSelectMenuInteraction(interaction) {
    return await handleNightAction(interaction);
}

module.exports = {
    startWerewolfGame,
    beginWerewolfGame,
    handleWerewolfButtonInteraction,
    handleWerewolfSelectMenuInteraction,
    handleNumberVote,
    endGame,
    clearLocks: (channelId) => lockManager.releaseAllLocks(channelId),
    ROLES
};