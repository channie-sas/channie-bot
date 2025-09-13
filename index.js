// index.js - 메인 애플리케이션 파일
const { Client, GatewayIntentBits, PermissionsBitField } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { registerFont } = require('canvas');
require('dotenv').config();

// 설정 및 데이터베이스 모듈 불러오기
const { EVENT_TYPES } = require('./src/database/eventTypes');
const { config, ensureDirectories } = require('./config');
const { cardDatabase, loadAllCardSeries } = require('./src/database/cardDatabase');
const { convertAllCardSeriesToJsFiles } = require('./src/database/cardLoader');
const { loadUserData, saveUserData, saveUserDataThrottled } = require('./src/database/userData');
const { loadCardStats } = require('./src/database/cardStats');

// 상점 시스템 모듈 추가
const { loadShopData, spawnShops, handleShopPurchase } = require('./src/systems/shopSystem');

const { 
  handleSetEventChannelCommand, 
  handleStartEventCommand,
  handleEndEventCommand,
  handleSetEventRoleCommand,
  handleEyesightGameInput,
  checkRandomEvents
} = require('./src/commands/eventCommands');
const { loadEventData } = require('./src/database/eventModel');
// 필요한 디렉토리 생성
ensureDirectories();

// Discord 클라이언트 초기화
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages, 
    GatewayIntentBits.MessageContent,
  ]
});

// 명령어 접두사
const PREFIX = 'c';

// 명령어 처리 성능 로깅 임계값 (ms)
const PERFORMANCE_THRESHOLD = 500;

// 명령어 맵 초기화 - 지연 로딩 + 라우팅 통합
const commandMap = {};

// 명령어 등록 함수
function registerCommand(name, handlerFn, options = {}) {
  const { aliases = [], dynamicRequire = null } = options;
  
  // 메인 명령어 등록
  commandMap[name] = {
    handler: async (message, args) => {
      // 성능 모니터링 시작
      const startTime = Date.now();
      
      try {
        // 모듈이 아직 로드되지 않았으면 로드
        if (dynamicRequire && !commandMap[name].module) {
          const module = require(dynamicRequire);
          commandMap[name].module = module;
          
          // 별칭도 같은 모듈 참조
          aliases.forEach(alias => {
            if (commandMap[alias]) {
              commandMap[alias].module = module;
            }
          });
        }
        
        // 명령어 실행
        if (dynamicRequire) {
          // 동적 로드된 모듈에서 핸들러 실행
          await handlerFn(message, args, commandMap[name].module);
        } else {
          // 일반 핸들러 함수 실행
          await handlerFn(message, args);
        }
        
        // 성능 모니터링 끝
        const executionTime = Date.now() - startTime;
        if (executionTime > PERFORMANCE_THRESHOLD) {
          console.log(`[PERFORMANCE] Command ${name} took ${executionTime}ms to execute`);
        }
      } catch (error) {
        console.error(`Error executing command ${name}:`, error);
        message.reply('An error occurred while processing your command.').catch(console.error);
      }
    },
    module: null,
    aliases: aliases
  };
  
  // 별칭 등록
  aliases.forEach(alias => {
    commandMap[alias] = {
      handler: commandMap[name].handler,
      module: null,
      aliases: []
    };
  });
}

// 명령어 등록

// help 명령어
registerCommand('help', 
  async (message, args) => {
    const { handleHelpCommand } = require('./src/commands/helpCommand');
    await handleHelpCommand(message, args);
  },
  { 
    aliases: ['h'],
  }
);


// 카드 드롭 명령어
registerCommand('drop', 
  async (message, args, module) => {
    const { dropCards } = module;
    await dropCards(message, message.author.id);
  },
  { 
    aliases: ['d'],
    dynamicRequire: './src/commands/dropCards'
  }
);

// 컬렉션 명령어
registerCommand('c', 
  async (message, args, module) => {
    const { showCollection } = module;
    
    // 멘션이 있는지 확인
    const mention = args.length > 0 ? args[0] : null;
    await showCollection(message, mention);
  },
  { 
    dynamicRequire: './src/commands/showCollection'
  }
);

// 쿨다운 체크 명령어
registerCommand('cd', 
  async (message, args, module) => {
    const { checkCooldown } = module;
    await checkCooldown(message, message.author.id);
  },
  { 
    dynamicRequire: './src/commands/checkCooldown'
  }
);

// 카드 정보 조회 명령어
registerCommand('lu', 
  async (message, args, module) => {
    const { showCardInfo } = module;
    const searchQuery = args.join(' ');
    await showCardInfo(message, searchQuery);
  },
  { 
    dynamicRequire: './src/commands/showCardInfo'
  }
);

// 카드 레벨업 명령어
registerCommand('lvl', 
  async (message, args, module) => {
    const { handleCardLevelUpCommand } = module;
    await handleCardLevelUpCommand(message, args);
  },
  { 
    dynamicRequire: './src/commands/cardLevelUp'
  }
);

// 카드 태우기 명령어
registerCommand('b', 
  async (message, args, module) => {
    const { handleBurnCardCommand } = module;
    await handleBurnCardCommand(message, args);
  },
  { 
    aliases: ['burn'],
    dynamicRequire: './src/commands/burnCard'
  }
);

// 인벤토리 명령어
registerCommand('i', 
  async (message, args, module) => {
    const { handleInventoryCommand } = module;
    
    // 멘션이 있는지 확인
    const mention = args.length > 0 ? args[0] : null;
    await handleInventoryCommand(message, mention);
  },
  { 
    dynamicRequire: './src/commands/currencyCommands'
  }
);

// 낚시 명령어
registerCommand('fish', 
  async (message, args, module) => {
    const { handleFishingCommand } = module;
    await handleFishingCommand(message, args);
  },
  { 
    dynamicRequire: './src/commands/fishingCommand'
  }
);

// 빠른 낚시 명령어 등록
registerCommand('f', 
  async (message, args, module) => {
    const { handleQuickFishingCommand } = module;
    await handleQuickFishingCommand(message, args);
  },
  { 
    dynamicRequire: './src/commands/fishingCommand'
  }
);

// 물고기 컬렉션 명령어
registerCommand('cf', 
  async (message, args, module) => {
    const { showFishCollection } = module;
    
    // 멘션이 있는지 확인
    const mention = args.length > 0 ? args[0] : null;
    await showFishCollection(message, mention);
  },
  { 
    dynamicRequire: './src/commands/showFishCollection'
  }
);

// 아이템 수정 명령어 (관리자용)
registerCommand('mod', 
  async (message, args, module) => {
    const { handleItemModCommand } = module;
    await handleItemModCommand(message, args);
  },
  { 
    dynamicRequire: './src/commands/currencyCommands'
  }
);

// 아이템/카드 전송 명령어
registerCommand('g', 
  async (message, args, module) => {
    const { handleItemTransferCommand, handleCardTransferCommand } = module;
    
    // 카드 전송인지 확인
    if (args.length >= 2 && args[1].toLowerCase() === 'card') {
      await handleCardTransferCommand(message, args);
    } else {
      await handleItemTransferCommand(message, args);
    }
  },
  { 
    dynamicRequire: './src/commands/currencyCommands'
  }
);

// 작업중인 카드 리스트 명령어 등록
registerCommand('act', 
  async (message, args, module) => {
    const { handleActCommand } = module;
    await handleActCommand(message, args);
  },
  { 
    dynamicRequire: './src/commands/actCommand'
  }
);

// 운석 사용자 추가 명령어
registerCommand('ad', 
  async (message, args, module) => {
    const { handleCardAdmin } = module;
    await handleCardAdmin(message, args);
  },
  { 
    dynamicRequire: './src/commands/cardAdmin'
  }
);

// 시리즈 리스트 명령어
registerCommand('sl', 
  async (message, args, module) => {
    const { handleSeriesListCommand } = module;
    const seriesName = args.length > 0 ? args.join(' ') : null;
    await handleSeriesListCommand(message, seriesName);
  },
  { 
    dynamicRequire: './src/commands/seriesListCommand'
  }
);

// 관리자 명령어
registerCommand('special', 
  async (message, args, module) => {
    const { handleSpecialVariantsCommand } = module;
    await handleSpecialVariantsCommand(message, args.filter(v => v.trim() !== ''));
  },
  { 
    dynamicRequire: './src/commands/adminCommands'
  }
);

// 채널 설정 명령어
registerCommand('set', 
  async (message, args, module) => {
    if (args.length > 0 && args[0].toLowerCase() === 'drop') {
      const { handleSetDropChannelCommand } = module;
      await handleSetDropChannelCommand(message);
    } else {
      await message.reply('Available subcommands: drop');
    }
  },
  { 
    dynamicRequire: './src/commands/adminCommands'
  }
);

// 위시리스트 명령어
registerCommand('wl', 
  async (message, args, module) => {
    const { handleWishlistCommand } = module;
    await handleWishlistCommand(message, args);
  },
  { 
    aliases: ['wishlist'],
    dynamicRequire: './src/commands/wishlistCommand'
  }
);

// 이벤트 명령어 등록
registerCommand('event', 
  async (message, args, module) => {
    if (args.length === 0) {
      message.reply('Usage: cevent [set/start] [parameters]');
      return;
    }
    
    const subCommand = args[0].toLowerCase();
    
    switch (subCommand) {
      case 'set':
        await handleSetEventChannelCommand(message, args.slice(1)); // 인자 전달 추가
        break;
      case 'start':
        await handleStartEventCommand(message, args.slice(1));
        break;
      case 'end':
        await handleEndEventCommand(message);
        break;
      case 'role':
        await handleSetEventRoleCommand(message, args.slice(1));
        break;
      default:
        message.reply('Invalid subcommand. Available options: set, start, end, role');
    }
  },
  { 
    dynamicRequire: './src/commands/eventCommands'
  }
);

// 프로필 명령어
registerCommand('pf', 
  async (message, args, module) => {
    // edit 서브 명령어 확인
    if (args.length > 0 && args[0].toLowerCase() === 'edit') {
      const { handleProfileEditCommand } = module;
      await handleProfileEditCommand(message, args.slice(1));
    } else {
      const { handleProfileCommand } = module;
      await handleProfileCommand(message, args);
    }
  },
  { 
    dynamicRequire: './src/commands/profileCommand'
  }
);

// 카드 추가 명령어 (유저용)
registerCommand('add', 
  async (message, args, module) => {
    const { handleCardAddCommand } = module;
    await handleCardAddCommand(message, args);
  },
  { 
    dynamicRequire: './src/commands/cardAddCommand'
  }
);


// 관리자 명령어
registerCommand('a', 
  async (message, args, module) => {
    // 첫 번째 인자가 'name'인지 확인
    if (args.length > 0 && args[0].toLowerCase() === 'name') {
      const { handleTitleManagementCommand } = module;
      await handleTitleManagementCommand(message, args.slice(1));
    } else if (args.length > 0 && args[0].toLowerCase() === 'special') {
      const { handleSpecialVariantsCommand } = module;
      await handleSpecialVariantsCommand(message, args.slice(1));
    } else if (args.length > 0 && args[0].toLowerCase() === 'config') {
      const { handleConfigCommand } = module;
      await handleConfigCommand(message, args.slice(1));
    } else if (args.length > 0 && args[0].toLowerCase() === 'shop') {
      // 상점 채널 설정 명령어 추가
      const { handleShopChannelCommand } = module;
      await handleShopChannelCommand(message);
    } else if (args.length > 0 && args[0].toLowerCase() === 'variant') {
      // 변형 관리 명령어 추가
      const { handleVariantManagementCommand } = module;
      await handleVariantManagementCommand(message, args.slice(1));
    } else if (args.length > 0 && args[0].toLowerCase() === 'missing') {
      // 누락된 카드 캐시 관리 명령어 추가
      const { handleMissingCardsManagementCommand } = module;
      await handleMissingCardsManagementCommand(message, args.slice(1));
    } else if (args.length > 0 && args[0].toLowerCase() === 'approval') {
      // 승인 요청 관리 명령어 추가 (새로 추가된 부분)
      const { handleApprovalManagementCommand } = module;
      await handleApprovalManagementCommand(message, args.slice(1));
    } else {
      const { handleCardAdmin } = require('./src/commands/cardAdmin');
      await handleCardAdmin(message, args);
    }
  },
  { 
    dynamicRequire: './src/commands/adminCommands'
  }
);

// 또는 간단한 별칭 명령어들 추가
registerCommand('add-refresh', 
  async (message, args) => {
    // 관리자 권한 확인
    if (!message.guild || !message.member?.permissions?.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply('❌ You need administrator permissions to refresh cache.');
    }

    try {
      await message.reply('🔄 Refreshing missing cards cache...');
      
      const { forceCacheUpdate } = require('./src/utils/missingCardsCache');
      const success = forceCacheUpdate();
      
      if (success) {
        const { getCacheInfo } = require('./src/utils/missingCardsCache');
        const cacheInfo = getCacheInfo();
        await message.channel.send(`✅ Cache refreshed! Found ${cacheInfo.totalMissingCards} missing v1 images.`);
      } else {
        await message.channel.send('❌ Failed to refresh cache.');
      }
    } catch (error) {
      console.error('Error in cadd-refresh command:', error);
      await message.channel.send('❌ An error occurred while refreshing cache.');
    }
  }
);

registerCommand('config', 
  async (message, args, module) => {
    const { handleConfigCommand } = module;
    await handleConfigCommand(message, args);
  },
  { 
    dynamicRequire: './src/commands/adminCommands'
  }
);

// 숫자 입력 처리 등 특수 메시지 처리
// 숫자 입력 처리 등 특수 메시지 처리 - 최적화 버전
async function handleSpecialMessages(message, content) {
  // 이벤트 입력 처리
  const isEventInput = await handleEyesightGameInput(message);
  if (isEventInput) return true;

  // 웨어울프 투표 번호 감지
  if (/^[0-9](\d)?$/.test(content)) {
    const { getActiveEvent } = require('./src/database/eventModel');
    const { EVENT_TYPES } = require('./src/database/eventTypes');
    
    const activeEvent = getActiveEvent(message.channel.id);
    if (activeEvent && activeEvent.type === EVENT_TYPES.WEREWOLF_GAME && activeEvent.data.status === 'voting') {
      // 웨어울프 투표 처리 함수 가져오기
      const { handleNumberVote } = require('./src/commands/werewolfGame');
      const processed = await handleNumberVote(message, content);
      if (processed) return true;
    }
  }

  // 숫자 입력 감지 (시리즈 카드 선택, 카드 리스트 선택 등)
  if (/^[1-9](\d)?$/.test(content)) {
    try {
      // 필요한 모듈 가져오기
      const { getActiveView, removeActiveView, refreshTimer } = require('./src/utils/activeViews');
      
      // 메시지가 보내진 채널의 모든 활성 메시지 가져오기
      const channel = message.channel;
      const userId = message.author.id;
      
      console.log(`숫자 입력 감지: ${content} (사용자: ${userId}, 채널: ${channel.id})`);

      // 활성 뷰 가져오기 (모든 타입)
      const activeView = getActiveView(channel.id);
      
      // 활성 뷰가 없거나 현재 사용자가 생성자가 아닌 경우 무시
      if (!activeView || activeView.userId !== userId) {
        return false;
      }
      
      // 숫자 입력 공통 처리 함수
      const handleNumberInput = async (items, validate, process) => {
        // 숫자 변환
        const index = parseInt(content) - 1;
        
        // 유효한 인덱스인지 확인
        if (index < 0 || index >= items.length) {
          if (validate) {
            console.log(`유효하지 않은 인덱스: ${index}, 항목 수: ${items.length}`);
            await message.reply(`Invalid selection. Please enter a number between 1 and ${items.length}.`);
          }
          return false;
        }
        
        // 사용자가 입력한 숫자 메시지 삭제
        try {
          await message.delete();
        } catch (deleteError) {
          console.error('Could not delete message:', deleteError);
        }
        
        // 항목 처리
        const selectedItem = items[index];
        const result = await process(selectedItem, index);
        
        return result !== false;
      };
      
      // 뷰 타입에 따른 처리
      const viewType = activeView.viewType;
      
      // 1. 위시리스트 뷰 처리 - 수정된 부분
      if (viewType === 'wishlist') {
        return await handleNumberInput(
          activeView.data,
          true,
          async (selectedCard) => {
            console.log(`선택한 위시리스트 카드: ${selectedCard.cardName} (시리즈: ${selectedCard.seriesName || '없음'})`);
            
            // cardDatabase에서 카드 정보 검색
            const { getAllCards } = require('./src/database/cardDatabase');
            const allCards = getAllCards();
            
            // 카드 이름으로 일치하는 카드 검색
            const matchingCards = allCards.filter(card => 
              card.name && card.name.toLowerCase() === selectedCard.cardName.toLowerCase()
            );
            
            // 일치하는 카드가 있는 경우
            if (matchingCards.length > 0) {
              // 시리즈가 있으면 시리즈에 맞는 카드 먼저 찾기
              let exactCard = null;
              if (selectedCard.seriesName) {
                exactCard = matchingCards.find(card => 
                  card.series && card.series.toLowerCase() === selectedCard.seriesName.toLowerCase()
                );
              }
              
              // 정확히 일치하는 카드가 없으면 첫 번째 카드 사용
              const cardToShow = exactCard || matchingCards[0];
              
              // 카드 상세 정보 표시
              const { replaceWithSpecificCardInfo } = require('./src/commands/cardLookupByName');
              await replaceWithSpecificCardInfo(
                channel, 
                null, 
                cardToShow.name, 
                cardToShow.series, 
                userId
              );
            } else {
              // 카드 데이터베이스에서 찾지 못한 경우 일반 검색 사용
              const { showCardInfoByName } = require('./src/commands/cardLookupByName');
              await showCardInfoByName(message, selectedCard.cardName);
            }
            
            return true;
          }
        );
      }
      
      // 2. 시리즈 뷰 처리
      else if (viewType === 'series') {
        return await handleNumberInput(
          activeView.data,
          false,
          async (selectedCard) => {
            const cardName = selectedCard.name;
            const seriesName = activeView.additionalData.seriesName;
            
            const { replaceWithSpecificCardInfo } = require('./src/commands/cardLookupByName');
            const success = await replaceWithSpecificCardInfo(
              channel, 
              activeView.messageId, 
              cardName, 
              seriesName,
              userId
            );
            
            // 성공적으로 업데이트되었으면 활성 뷰 제거
            if (success) {
              removeActiveView(channel.id, null, 'series');
            }
            
            return true;
          }
        );
      }
      
      // 3. 카드 리스트 뷰 처리
      else if (viewType === 'card') {
        return await handleNumberInput(
          activeView.data,
          false,
          async (selectedCard) => {
            const { replaceWithSpecificCardInfo } = require('./src/commands/cardLookupByName');
            const success = await replaceWithSpecificCardInfo(
              channel, 
              activeView.messageId, 
              selectedCard.name, 
              selectedCard.series,
              userId
            );
            
            // 성공적으로 업데이트되었으면 활성 뷰 제거
            if (success) {
              removeActiveView(channel.id, null, 'card');
            }
            
            return true;
          }
        );
      }
      
      // 4. 컬렉션 뷰 처리
      else if (viewType === 'collection') {
        return await handleNumberInput(
          activeView.data,
          false,
          async (selectedCard) => {
            const { showDetailedCardById } = require('./src/commands/cardLookupById');
            
            // 메시지 객체 생성 - 카드 소유자의 ID 사용
            const cardOwnerMessage = {
              author: {
                id: activeView.additionalData.targetUserId
              },
              channel: message.channel,
              reply: async (content) => message.channel.send(content)
            };
            
            // 카드 상세 정보 표시
            await showDetailedCardById(cardOwnerMessage, selectedCard.uniqueId);
            
            return true;
          }
        );
      }

    } catch (error) {
      console.error('Error handling number input selection:', error);
      await message.channel.send('An error occurred while processing your selection. Please try again.');
      return true;
    }
  }
  
  return false;
}

// 메시지 처리 함수
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  
  const content = message.content.toLowerCase();

  // 기본 메시지 디버깅 (모든 메시지에 대해)
  console.log(`[MESSAGE DEBUG] User: ${message.author.id}, Channel: ${message.channel.id}, Content: "${content}", Attachments: ${message.attachments.size}`);

  // 이벤트 채널 활동 추적 (새로 추가)
  try {
    const { getEventChannels, trackChannelActivity } = require('./src/database/eventModel');
    const eventChannels = getEventChannels();
    
    // 현재 채널이 이벤트 채널인 경우 활동 추적
    if (eventChannels.includes(message.channel.id)) {
      trackChannelActivity(message.channel.id);
    }
  } catch (error) {
    console.error('Error tracking channel activity:', error);
  }

  // 드롭 채널 확인
  if (config.dropChannels && config.dropChannels.includes(message.channel.id)) {
    // content가 PREFIX로 시작하는지 확인 (명령어인지 확인)
    if (content.startsWith(PREFIX)) {
      // cd 또는 cdrop 명령어인지 확인
      if (!content.startsWith(`${PREFIX}d`) && !content.startsWith(`${PREFIX}drop`)) {
        // 관리자인 경우 모든 명령어 허용
        if (!message.guild || !message.member?.permissions?.has(PermissionsBitField.Flags.Administrator)) {
          try {
            // 먼저 경고 메시지 전송
            const warningMsg = await message.channel.send(`<@${message.author.id}> This channel is for card drops only. Only \`${PREFIX}d\` command is allowed in this channel.`);
            
            // 원본 메시지 삭제
            await message.delete();
            
            // 2초 후에 경고 메시지도 삭제
            setTimeout(async () => {
              try {
                await warningMsg.delete();
              } catch (deleteError) {
                console.error('Error deleting warning message:', deleteError);
              }
            }, 2000); // 2초
          } catch (error) {
            console.error('Error handling restricted message in drop channel:', error);
          }
          return;
        }
      }
    }
    // 일반 채팅은 허용 (명령어가 아니면 그냥 통과)
  }

  // 유저 활동 시간 업데이트
  const { initUserData, saveUserDataThrottled } = require('./src/database/userData');
  const userData = initUserData(message.author.id);
  if (userData.profile) {
    userData.profile.lastActive = Date.now();
    saveUserDataThrottled();
  }
  
  // 카드 추가 요청 이미지 업로드 처리 (명령어보다 먼저 처리)
  console.log(`[ATTACHMENT DEBUG] Checking attachments...`);
  
  if (message.attachments && message.attachments.size > 0) {
    console.log(`[ATTACHMENT DEBUG] Found ${message.attachments.size} attachments`);
    
    // 각 첨부파일 정보 출력
    message.attachments.forEach((attachment, index) => {
      console.log(`[ATTACHMENT DEBUG] Attachment ${index}: ${attachment.name}, Type: ${attachment.contentType}, Size: ${attachment.size}`);
    });
    
    // 이미지 파일인지 확인
    const hasImageAttachment = Array.from(message.attachments.values())
      .some(attachment => {
        const isImage = attachment.contentType && attachment.contentType.startsWith('image/');
        console.log(`[ATTACHMENT DEBUG] ${attachment.name} is image: ${isImage}`);
        return isImage;
      });
    
    console.log(`[ATTACHMENT DEBUG] Has image attachment: ${hasImageAttachment}`);
    
    if (hasImageAttachment) {
      console.log(`[CADD DEBUG] Image attachment detected from user ${message.author.id} in channel ${message.channel.id}`);
      try {
        const { handleImageUpload } = require('./src/commands/cardAddCommand');
        console.log(`[CADD DEBUG] handleImageUpload function loaded successfully`);
        const imageProcessed = await handleImageUpload(message);
        console.log(`[CADD DEBUG] Image processing result: ${imageProcessed}`);
        if (imageProcessed) {
          console.log('[CADD DEBUG] Image upload processed successfully - returning');
          return; // 이미지 업로드가 처리되었으면 더 이상 진행하지 않음
        }
      } catch (error) {
        console.error('[CADD DEBUG] Error processing image upload:', error);
      }
    } else {
      console.log(`[ATTACHMENT DEBUG] No image attachments found`);
    }
  } else {
    console.log(`[ATTACHMENT DEBUG] No attachments found`);
  }
  
  // 특수 메시지 처리 (숫자 입력 등)
  const isSpecialMessage = await handleSpecialMessages(message, content);
  if (isSpecialMessage) return;
  
  // 명령어 처리
  if (content.startsWith(PREFIX)) {
    console.log(`[COMMAND DEBUG] Processing command: ${content}`);
    // 명령어와 인수 파싱
    const cmdParts = content.slice(PREFIX.length).trim().split(/\s+/);
    const cmdName = cmdParts[0];
    const args = cmdParts.slice(1);
    
    console.log(`[COMMAND DEBUG] Command: ${cmdName}, Args: ${JSON.stringify(args)}`);
    
    // 명령어 실행
    const command = commandMap[cmdName];
    if (command) {
      console.log(`[COMMAND DEBUG] Executing command: ${cmdName}`);
      await command.handler(message, args);
    } else {
      console.log(`[COMMAND DEBUG] Command not found: ${cmdName}`);
    }
  }
});

// 비동기 초기화 함수
async function initialize() {
  console.log('시스템 초기화 중...');

  // 타이머 복구 시스템 초기화
  try {
      console.log('Restoring game timers...');
      const timerManager = require('./src/utils/gameTimerManager');
      const { getAllActiveEvents } = require('./src/database/eventModel');
      
      const activeEvents = getAllActiveEvents();
      const gameTimerData = {};
      
      // 웨어울프 게임 타이머 복구 데이터 수집
      for (const [channelId, event] of Object.entries(activeEvents)) {
          if (event.type === EVENT_TYPES.WEREWOLF_GAME && 
              event.data.status === 'joining' && 
              event.data.autoStartTime) {
              
              gameTimerData[channelId] = {
                  executeAt: event.data.autoStartTime,
                  data: {
                      channelId,
                      gameMessageId: event.data.gameMessageId,
                      playerCount: event.data.players?.length || 0
                  }
              };
          }
      }
      
      // 타이머 복구
      const restoredCount = timerManager.restoreTimersFromData(client, gameTimerData);
      console.log(`Game timer restoration completed: ${restoredCount} timers restored`);
  } catch (error) {
      console.error('Error restoring game timers:', error);
  }

  // 주기적 정리 작업 스케줄링 (기존 코드에서 이 부분을 추가)
  try {
      console.log('Setting up periodic cleanup tasks...');
      
      // 30분마다 이벤트 데이터 정리
      setInterval(() => {
          try {
              const { cleanupEventData } = require('./src/database/eventModel');
              const lockManager = require('./src/utils/gameLockManager');
              
              cleanupEventData();
              lockManager.cleanup();
              
              console.log('Periodic cleanup completed');
          } catch (cleanupError) {
              console.error('Error in periodic cleanup:', cleanupError);
          }
      }, 30 * 60 * 1000); // 30분
      
      console.log('Periodic cleanup tasks scheduled');
  } catch (error) {
      console.error('Error setting up periodic cleanup:', error);
  }
    
  // 폰트 등록
  try {
    registerFont(path.join(config.paths.FONTS_DIR, 'NotoSans-Bold.ttf'), { family: 'NotoSans-Bold' });
    console.log('Font registered successfully');
  } catch (error) {
    console.warn('Could not register font, will use default system font:', error.message);
  }
  
  // 카드 시스템 초기화 
  try {
    console.log('카드 시리즈 파일 변환 중...');
    const convertedCount = convertAllCardSeriesToJsFiles();
    
    console.log('카드 시리즈 로드 중...');
    const loadedCount = loadAllCardSeries();
    
    const seriesCount = Object.keys(cardDatabase).length;
    const totalCards = Object.values(cardDatabase).reduce((sum, cards) => sum + cards.length, 0);
    
    console.log(`카드 시스템 초기화 완료: ${seriesCount}개의 시리즈, 총 ${totalCards}개의 카드`);
  } catch (error) {
    console.error('Error initializing card system:', error);
  }
  
  // 누락된 카드 캐시 초기화
  try {
    console.log('누락된 카드 캐시 초기화 중...');
    const { updateMissingCardsCache } = require('./src/utils/missingCardsCache');
    const cacheUpdateSuccess = updateMissingCardsCache();
    
    if (cacheUpdateSuccess) {
      console.log('Missing cards cache initialized successfully');
    } else {
      console.warn('Failed to initialize missing cards cache');
    }
  } catch (error) {
    console.error('Error initializing missing cards cache:', error);
  }
  
  // 사용자 데이터 로드
  try {
    loadUserData();
    console.log('User data loaded successfully');
  } catch (error) {
    console.error('Error loading user data:', error);
  }

  // 위시리스트 데이터 로드
  try {
    const { loadWishlistData, migrateFromUserData } = require('./src/database/wishlistDatabase');
    const { getAllUserData } = require('./src/database/userData');
    
    loadWishlistData();
    console.log('Wishlist data loaded successfully');
    
    // 기존 사용자 데이터에서 위시리스트 마이그레이션 (최초 1회만 실행)
    const migrationFile = path.join(config.paths.DATA_DIR, 'wishlist_migrated.flag');
    if (!fs.existsSync(migrationFile)) {
      console.log('Migrating wishlist data from user data...');
      const migratedCount = migrateFromUserData(getAllUserData());
      console.log(`Migrated ${migratedCount} wishlist items.`);
      
      // 마이그레이션 완료 플래그 파일 생성
      fs.writeFileSync(migrationFile, Date.now().toString(), 'utf8');
    }
  } catch (error) {
    console.error('Error loading wishlist data:', error);
  }

  // 이벤트 데이터 로드
  try {
    loadEventData();
    console.log('Event data loaded successfully');
  } catch (error) {
    console.error('Error loading event data:', error);
  }
  
  // 카드 통계 로드
  try {
    loadCardStats();
    console.log('Card stats loaded successfully');
  } catch (error) {
    console.error('Error loading card stats:', error);
  }

  // 쿨다운 타이머 초기화
  try {
    const { clearAllTimers } = require('./src/utils/timeUtils');
    clearAllTimers();
    console.log('All cooldown timers cleared successfully');
  } catch (error) {
    console.error('Error clearing cooldown timers:', error);
  }
  
  // 드롭 채널 로드
  try {
    const { loadDropChannels } = require('./src/commands/adminCommands');
    loadDropChannels();
    console.log('Drop channels loaded successfully');
  } catch (error) {
    console.error('Error loading drop channels:', error);
  }

  // 카드 요청 채널 로드 (새로 추가된 부분)
  try {
    const { loadCardRequestChannels } = require('./src/utils/cardRequestChannelUtils');
    loadCardRequestChannels();
    console.log('Card request channels loaded successfully');
  } catch (error) {
    console.error('Error loading card request channels:', error);
  }

  // 카드 승인 요청 데이터 로드 (새로 추가된 부분)
  try {
    const { loadApprovalRequests, startCleanupSchedule } = require('./src/utils/cardApprovalPersistence');
    loadApprovalRequests();
    startCleanupSchedule();
    console.log('Card approval requests loaded and cleanup schedule started');
  } catch (error) {
    console.error('Error loading card approval requests:', error);
  }

  // 물고기 ID 시스템 초기화
  try {
    const { initializeFishIdFromUserData } = require('./src/utils/fishIdGenerator');
    const { getAllUserData } = require('./src/database/userData');
    
    initializeFishIdFromUserData(getAllUserData());
    console.log('Fish ID system initialized successfully');
  } catch (error) {
    console.error('Error initializing fish ID system:', error);
  }
  
  // 상점 데이터 로드 추가
  try {
    loadShopData();
    console.log('Shop data loaded successfully');
  } catch (error) {
    console.error('Error loading shop data:', error);
  }
  
  console.log('모든 초기화 완료, 봇 준비 완료!');
}

// 전역 정리 함수
function globalCleanup() {
    console.log('[CLEANUP] Starting global resource cleanup...');
    
    try {
        // 1. activeViews 정리
        const { cleanup: cleanupActiveViews } = require('./src/utils/activeViews');
        cleanupActiveViews();
        
        // 2. 사용자 데이터 즉시 저장
        const { saveUserDataNow } = require('./src/database/userData');
        saveUserDataNow();
        
        // 3. 이벤트 데이터 즉시 저장
        const { saveEventDataNow } = require('./src/database/eventModel');
        saveEventDataNow();
        
        // 4. 게임 락 매니저 정리
        const lockManager = require('./src/utils/gameLockManager');
        if (lockManager.destroy) {
            lockManager.destroy();
        }
        
        // 5. 타이머 매니저 정리
        const timerManager = require('./src/utils/gameTimerManager');
        timerManager.clearAllTimers();
        
        // 6. Discord 클라이언트 정리
        if (client && client.destroy) {
            client.destroy();
        }
        
        // 7. 가비지 컬렉션 강제 실행 (가능한 경우)
        if (global.gc) {
            global.gc();
            console.log('[CLEANUP] Garbage collection executed');
        }
        
        console.log('[CLEANUP] Global cleanup completed');
    } catch (error) {
        console.error('[CLEANUP] Error during global cleanup:', error);
    }
}

// 메모리 모니터링 함수
function startMemoryMonitoring() {
    const MEMORY_CHECK_INTERVAL = 5 * 60 * 1000; // 5분마다
    const MEMORY_WARNING_THRESHOLD = 150 * 1024 * 1024; // 150MB
    const MEMORY_CRITICAL_THRESHOLD = 300 * 1024 * 1024; // 300MB
    
    let lastLogTime = 0;
    
    const memoryInterval = setInterval(() => {
        try {
            const usage = process.memoryUsage();
            const now = Date.now();
            
            // 메모리 사용량이 임계치를 넘으면 경고
            if (usage.heapUsed > MEMORY_CRITICAL_THRESHOLD) {
                console.error(`[MEMORY] CRITICAL: Heap usage ${Math.round(usage.heapUsed / 1024 / 1024)}MB`);
                
                // 강제 가비지 컬렉션
                if (global.gc) {
                    global.gc();
                }
                
                // 리소스 정리 실행
                try {
                    const { cleanup } = require('./src/utils/activeViews');
                    cleanup();
                } catch (cleanupError) {
                    console.error('[MEMORY] Error during emergency cleanup:', cleanupError);
                }
                
            } else if (usage.heapUsed > MEMORY_WARNING_THRESHOLD) {
                // 10분마다만 경고 로그
                if (now - lastLogTime > 10 * 60 * 1000) {
                    console.warn(`[MEMORY] High usage: ${Math.round(usage.heapUsed / 1024 / 1024)}MB`);
                    lastLogTime = now;
                }
            }
            
            // 30분마다 상세 메모리 정보 출력
            if (now % (30 * 60 * 1000) < MEMORY_CHECK_INTERVAL) {
                const stats = {
                    heap: `${Math.round(usage.heapUsed / 1024 / 1024)}MB`,
                    total: `${Math.round(usage.heapTotal / 1024 / 1024)}MB`,
                    external: `${Math.round(usage.external / 1024 / 1024)}MB`,
                    uptime: `${Math.round(process.uptime() / 3600)}h`
                };
                
                console.log('[MEMORY] Stats:', stats);
            }
            
        } catch (error) {
            console.error('[MEMORY] Error in memory monitoring:', error);
        }
    }, MEMORY_CHECK_INTERVAL);
    
    // 프로세스 종료시 인터벌 정리
    process.on('beforeExit', () => clearInterval(memoryInterval));
}

// 로그 출력 감소를 위한 필터 함수
const logFilter = (() => {
    const spamPrevention = new Map();
    const LOG_COOLDOWN = 60000; // 1분
    
    return {
        // 같은 로그가 1분 이내에 반복되면 무시
        shouldLog: (key) => {
            const now = Date.now();
            const lastTime = spamPrevention.get(key);
            
            if (!lastTime || now - lastTime > LOG_COOLDOWN) {
                spamPrevention.set(key, now);
                return true;
            }
            
            return false;
        },
        
        // 주기적으로 맵 정리
        cleanup: () => {
            const now = Date.now();
            for (const [key, time] of [...spamPrevention.entries()]) {
                if (now - time > LOG_COOLDOWN * 2) {
                    spamPrevention.delete(key);
                }
            }
        }
    };
})();

// 5분마다 로그 필터 정리
setInterval(() => logFilter.cleanup(), 5 * 60 * 1000);

// 기존 console.log 래핑하여 스팸 방지
const originalLog = console.log;
console.log = function(...args) {
    const message = args.join(' ');
    
    // 특정 패턴의 로그는 필터링
    const spamPatterns = [
        'Timer.*scheduled',
        'Lock acquired',
        'Lock released',
        'Processed.*users so far',
        'Channel.*activity tracked',
        'Updated.*cards'
    ];
    
    const isSpamLog = spamPatterns.some(pattern => new RegExp(pattern).test(message));
    
    if (isSpamLog) {
        const key = message.substring(0, 50); // 처음 50자로 키 생성
        if (!logFilter.shouldLog(key)) {
            return; // 스팸 로그 무시
        }
    }
    
    originalLog.apply(console, args);
};

// 클라이언트 준비 이벤트
client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);
  
  // 시스템 초기화
  await initialize();

  // 메모리 모니터링 시작
  startMemoryMonitoring();

  // 리소스 정리 스케줄링 (30분마다)
  setInterval(() => {
      try {
          // 만료된 뷰 정리
          const { cleanup } = require('./src/utils/activeViews');
          cleanup();
          
          // 게임 락 정리
          const lockManager = require('./src/utils/gameLockManager');
          lockManager.cleanup();
          
          // 가비지 컬렉션 (가능한 경우)
          if (global.gc && Date.now() % (60 * 60 * 1000) < 30 * 60 * 1000) {
              global.gc();
          }
          
      } catch (error) {
          console.error('[CLEANUP] Error in periodic cleanup:', error);
      }
  }, 30 * 60 * 1000);
  
  // 정기적으로 유저 데이터 저장
  setInterval(saveUserData, 300000); // 5분마다 저장
  
  // 정기적으로 이벤트 체크 (1분마다)
  setInterval(() => {
    try {
        checkRandomEvents(client);
    } catch (error) {
        console.error('[EVENT] Error in random event check:', error);
    }
  }, 60000); // 1분마다 체크
  
  // 상점 시스템 시작
  try {
    await spawnShops(client);
    console.log('Shop system started');
    
    // 매시간 상점 갱신
    setInterval(async () => {
      try {
        await spawnShops(client);
        console.log('Shops refreshed');
      } catch (error) {
        console.error('Error refreshing shops:', error);
      }
    }, 60 * 60 * 1000); // 1시간마다
  } catch (error) {
    console.error('Error starting shop system:', error);
  }
});

// 인터랙션 처리 - 지연 로딩 적용
client.on('interactionCreate', async (interaction) => {
  // 버튼 인터랙션 처리
  if (interaction.isButton()) {
    try {
      const customId = interaction.customId;
      
      // 상점 버튼 처리
      if (customId.startsWith('shop_buy_')) {
        const itemIndex = parseInt(customId.split('_')[2]);
        await handleShopPurchase(interaction, itemIndex);
        return;
      }
      
      // 낚시 장비 버튼 처리 - 수정된 부분
      if (customId.startsWith('fishing_equip_') || 
          customId.startsWith('fishing_start_') || 
          customId.startsWith('fishing_guide_') || 
          customId.startsWith('fishing_back_')) {
        const { handleFishingEquipmentButton } = require('./src/interactions/buttonHandlers/fishingButtons');
        await handleFishingEquipmentButton(interaction);
        return;
      }

      
      // 물고기 컬렉션 버튼 처리 (기존 핸들러 사용)
      if (customId.startsWith('fcf_')) {
        const { handleFishCollectionPagination } = require('./src/interactions/buttonHandlers/fishCollectionButtons');
        await handleFishCollectionPagination(interaction);
        return;
      }
      
      // 기존 버튼 핸들러로 처리
      if (!client.buttonHandler) {
        const { handleButtonInteraction } = require('./src/interactions/buttonHandlers');
        client.buttonHandler = handleButtonInteraction;
      }
      
      await client.buttonHandler(interaction);
    } catch (error) {
      console.error('Error handling button interaction:', error);
      console.error('Error stack:', error.stack);
      console.error('Button ID:', interaction.customId || 'undefined');
      
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: 'An error occurred while processing your request.',
            flags: 64
          });
        }
      } catch (replyError) {
        console.error('Could not reply with error message:', replyError);
      }
    }
  }
  // 선택 메뉴 인터랙션 처리
  else if (interaction.isStringSelectMenu()) {
    try {
      const customId = interaction.customId;
      
      // 낚시 장비 선택 처리
      if (customId.startsWith('fishing_select_')) {
        const { handleFishingEquipmentSelection } = require('./src/interactions/selectMenuHandlers');
        await handleFishingEquipmentSelection(interaction);
        return;
      }
      
      // 기존 선택 메뉴 핸들러로 처리
      if (!client.selectMenuHandler) {
        const { handleSelectMenuInteraction } = require('./src/interactions/selectMenuHandlers');
        client.selectMenuHandler = handleSelectMenuInteraction;
      }
      
      await client.selectMenuHandler(interaction);
    } catch (error) {
      console.error('Error handling select menu interaction:', error);
      console.error('Error stack:', error.stack);
      console.error('Select Menu ID:', interaction.customId || 'undefined');
      
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: 'An error occurred while processing your selection.',
            flags: 64
          });
        }
      } catch (replyError) {
        console.error('Could not reply to interaction:', replyError);
      }
    }
  }
});

// 에러 처리
client.on('error', (error) => {console.error('Discord client error:', error);});
client.on('shardError', e => console.error('shardError', e));
client.on('shardDisconnect', (ev,id)=>console.warn('shardDisconnect', {code:ev.code, id}));
client.on('warn', info => console.warn('client warn', info));

// 봇 로그인
client.login(process.env.DISCORD_TOKEN)
  .then(() => {
    console.log('Bot is connecting to Discord...');
  })
  .catch((error) => {
    console.error('Failed to login to Discord:', error);
  });

// 종료 처리
process.on('SIGINT', () => {
    console.log('[SHUTDOWN] Received SIGINT, shutting down gracefully...');
    globalCleanup();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('[SHUTDOWN] Received SIGTERM, shutting down gracefully...');
    globalCleanup();
    process.exit(0);
});

// 예기치 않은 에러 처리
process.on('uncaughtException', (error) => {
    console.error('[FATAL] Uncaught exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[FATAL] Unhandled rejection at:', promise, 'reason:', reason);
});

// beforeExit 이벤트 처리
process.on('beforeExit', (code) => {
    console.log('[SHUTDOWN] Process is about to exit with code:', code);
    globalCleanup();
});

// 메모리 압박 시그널 처리 (Linux)
process.on('SIGUSR2', () => {
    console.log('[MEMORY] Received memory pressure signal, forcing cleanup...');
    try {
        const { cleanup } = require('./src/utils/activeViews');
        cleanup();
        
        if (global.gc) {
            global.gc();
        }
    } catch (error) {
        console.error('[MEMORY] Error in pressure cleanup:', error);
    }
});


module.exports = { client };