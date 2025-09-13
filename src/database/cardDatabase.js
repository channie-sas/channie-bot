// src/database/cardDatabase.js
const fs = require('fs');
const path = require('path');
const { config } = require('../../config');

// 카드 데이터베이스 객체 초기화
const cardDatabase = {};

/**
 * cards/ 폴더에서 모든 카드 시리즈 파일 로드
 */
function loadAllCardSeries() {
  try {
    // 카드 시리즈 폴더 경로
    const cardsDir = path.join(__dirname, 'cards');
    
    // 폴더가 존재하는지 확인
    if (!fs.existsSync(cardsDir)) {
      console.warn(`카드 시리즈 폴더가 존재하지 않습니다: ${cardsDir}`);
      fs.mkdirSync(cardsDir, { recursive: true });
      console.log(`카드 시리즈 폴더 생성됨: ${cardsDir}`);
      return 0;
    }
    
    // 폴더의 모든 JS 파일 가져오기
    const files = fs.readdirSync(cardsDir).filter(file => file.endsWith('.js'));
    
    console.log(`${files.length}개의 카드 시리즈 파일을 발견했습니다.`);
    
    // 각 파일에서 카드 시리즈 로드
    let loadedCount = 0;
    let seriesList = [];
    
    // 먼저 cardDatabase 초기화
    Object.keys(cardDatabase).forEach(key => {
      delete cardDatabase[key];
    });
    
    for (const file of files) {
      try {
        // 파일 이름에서 시리즈 ID 추출 (확장자 제외)
        const seriesId = path.basename(file, '.js');
        
        // 캐시 초기화를 위해 require 캐시에서 제거
        delete require.cache[require.resolve(`./cards/${seriesId}`)];
        
        // 모듈 로드
        const seriesCards = require(`./cards/${seriesId}`);
        
        // 카드 데이터베이스에 추가
        if (Array.isArray(seriesCards)) {
          // 모든 카드에 seriesId 필드 추가 (없는 경우)
          const processedCards = seriesCards.map(card => {
            if (!card.seriesId) {
              return { ...card, seriesId };
            }
            return card;
          });
          
          cardDatabase[seriesId] = processedCards;
          loadedCount++;
          
          // 시리즈 정보 저장
          let seriesName = '';
          if (processedCards.length > 0 && processedCards[0].series) {
            seriesName = processedCards[0].series;
          } else {
            seriesName = seriesId.charAt(0).toUpperCase() + seriesId.slice(1);
          }
          
          seriesList.push({
            id: seriesId,
            name: seriesName,
            count: processedCards.length
          });
          
          //console.log(`카드 시리즈 로드됨: ${seriesId} (${processedCards.length}개의 카드)`);
        } else {
          console.error(`오류: ${file}이 유효한 카드 배열을 내보내지 않습니다.`);
        }
      } catch (err) {
        console.error(`카드 시리즈 파일 로드 오류 ${file}:`, err);
      }
    }
    
    // 시리즈 목록 출력
    //if (seriesList.length > 0) {
    //  console.log('로드된 시리즈 목록:');
    //  seriesList.forEach(series => {
    //    console.log(`- ${series.name} (${series.id}): ${series.count}개 카드`);
    //  });
    //}
    
    console.log(`총 ${loadedCount}/${files.length}개의 카드 시리즈를 로드했습니다.`);
    return loadedCount;
  } catch (err) {
    console.error('카드 시리즈 로드 중 오류 발생:', err);
    return 0;
  }
}

/**
 * 모든 카드의 목록을 얻는 함수
 */
function getAllCards() {
  const allCards = [];
  for (const seriesCards of Object.values(cardDatabase)) {
    allCards.push(...seriesCards);
  }
  return allCards;
}

/**
 * 특정 시리즈의 카드 목록 가져오기
 */
function getCardsBySeries(seriesId) {
  return cardDatabase[seriesId] || [];
}

/**
 * 카드 ID로 카드 정보 찾기
 */
function getCardById(cardId) {
  for (const seriesCards of Object.values(cardDatabase)) {
    const card = seriesCards.find(card => (card.id || card.cardId) === cardId);
    if (card) return card;
  }
  return null;
}

/**
 * 카테고리별 카드 가져오기
 */
function getCardsByCategory(category) {
  const allCards = getAllCards();
  return allCards.filter(card => 
    card.category && 
    (Array.isArray(card.category) ? 
      card.category.includes(category) : 
      card.category === category)
  );
}

// 모듈 내보내기
module.exports = {
  cardDatabase,
  loadAllCardSeries,
  getAllCards,
  getCardsBySeries,
  getCardById,
  getCardsByCategory
};