// src/database/cardLoader.js
const fs = require('fs');
const path = require('path');
const { config, getSeriesDirectory } = require('../../config');

/**
 * 텍스트 파일에서 카드 데이터 파싱
 * 형식: seriesName: [ ... ] 와 같은 JS 배열 구문
 */
function parseCardSeriesFromTextFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      console.error(`파일을 찾을 수 없음: ${filePath}`);
      return null;
    }
    
    const fileContent = fs.readFileSync(filePath, 'utf8');
    
    // 시리즈 이름 추출 (예: "bts: [" 에서 "bts" 추출)
    const seriesMatch = fileContent.match(/^([^:]+)\s*:\s*\[/);
    if (!seriesMatch || !seriesMatch[1]) {
      console.error(`파일 ${filePath}에서 시리즈 이름을 찾을 수 없습니다.`);
      return null;
    }
    
    const seriesId = seriesMatch[1].trim();
    
    // 카드 데이터 배열 추출
    const cardsText = fileContent.substring(fileContent.indexOf('['), fileContent.lastIndexOf(']') + 1);
    
    // Function 대신 JSON.parse 사용을 준비하기 위해 텍스트 변환
    // 1. 작은따옴표를 큰따옴표로 변환
    // 2. 속성명에 큰따옴표 추가 (예: id: -> "id":)
    // 3. 마지막 쉼표 제거
    let jsonText = cardsText
      .replace(/'/g, '"')
      .replace(/(\w+):/g, '"$1":')
      .replace(/,(\s*[\]}])/g, '$1'); 
    
    // 파싱 (안전한 방법)
    const cards = JSON.parse(jsonText);
    
    if (!Array.isArray(cards)) {
      console.error(`파일 ${filePath}의 카드 데이터가 배열이 아닙니다.`);
      return null;
    }

    // 시리즈 이름 가져오기 (첫 번째 카드의 series 속성 사용)
    let seriesName = '';
    if (cards.length > 0 && cards[0].series) {
      seriesName = cards[0].series;
    } else {
      // 기본 이름: 첫 글자 대문자로 변환
      seriesName = seriesId.charAt(0).toUpperCase() + seriesId.slice(1);
    }
    
    // 모든 카드에 seriesId 추가 (없는 경우)
    cards.forEach(card => {
      if (!card.seriesId) {
        card.seriesId = seriesId;
      }
      
      // 원래 시리즈 이름 저장 (표시용)
      if (!card.seriesName && card.series) {
        card.seriesName = card.series;
      }
      
      // series 속성이 있지만 폴더 이름으로 사용하기 어려운 경우 정규화된 seriesId 사용
      if (card.series) {
        // 특수 문자가 포함된 시리즈 이름이 있다면 정규화
        const normalizedSeriesId = card.series.toLowerCase()
                                            .replace(/[^\w\s]/g, '')
                                            .replace(/\s+/g, '');
        
        // 정규화된 ID가 파일에서 추출한 seriesId와 다르다면 로그 출력
        if (normalizedSeriesId !== seriesId) {
          console.log(`Series name normalization: "${card.series}" -> "${seriesId}" (in file ${path.basename(filePath)})`);
        }
      }
    });
    
    return {
      seriesId,
      seriesName,
      cards
    };
  } catch (error) {
    console.error(`파일 ${filePath}에서 카드를 파싱하는 중 오류 발생:`, error);
    return null;
  }
}

/**
 * JSON 파일에서 카드 시리즈 파싱
 */
function parseCardSeriesFromJsonFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      console.error(`파일을 찾을 수 없음: ${filePath}`);
      return null;
    }
    
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(fileContent);
    
    // 필수 필드 확인
    if (!data.seriesId || !Array.isArray(data.cards)) {
      console.error(`JSON 파일 ${filePath}의 형식이 잘못되었습니다. 'seriesId'와 'cards' 배열이 필요합니다.`);
      return null;
    }

    // 시리즈 이름 확인 (없으면 첫 번째 카드에서 가져오기)
    let seriesName = data.seriesName || '';
    if (!seriesName && data.cards.length > 0 && data.cards[0].series) {
      seriesName = data.cards[0].series;
    }
    
    // 그래도 없으면 기본 이름 사용 (첫 글자 대문자로)
    if (!seriesName) {
      seriesName = data.seriesId.charAt(0).toUpperCase() + data.seriesId.slice(1);
    }
    
    // 모든 카드에 seriesId 추가 (없는 경우)
    data.cards.forEach(card => {
      if (!card.seriesId) {
        card.seriesId = data.seriesId;
      }
    });
    
    return {
      seriesId: data.seriesId,
      seriesName: seriesName,
      cards: data.cards
    };
  } catch (error) {
    console.error(`JSON 파일 ${filePath}에서 카드를 파싱하는 중 오류 발생:`, error);
    return null;
  }
}

/**
 * 카드 시리즈를 JavaScript 파일로 내보내기
 */
function exportCardSeriesToJsFile(seriesId, seriesName, cards, outputPath) {
  try {
    if (!seriesId || !Array.isArray(cards)) {
      console.error(`잘못된 카드 시리즈 데이터: ${seriesId}`);
      return false;
    }
    
    // 출력 디렉토리 확인
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
      console.log(`디렉토리 생성됨: ${outputDir}`);
    }
    
    // 카드 이미지 디렉토리 확인 및 생성
    ensureSeriesDirectory(seriesId);
    
    // 파일 내용 생성
    const fileContent = `// src/database/cards/${seriesId}.js\n\n/**\n * ${seriesName} 시리즈 카드 정의\n */\nconst ${seriesId}Cards = ${JSON.stringify(cards, null, 2)};\n\nmodule.exports = ${seriesId}Cards;`;
    
    // 파일 저장
    fs.writeFileSync(outputPath, fileContent, 'utf8');
    console.log(`시리즈 ${seriesId}(${seriesName})를 ${outputPath}에 저장했습니다.`);
    
    return true;
  } catch (error) {
    console.error(`시리즈 ${seriesId}를 파일로 내보내는 중 오류 발생:`, error);
    return false;
  }
}

/**
 * 시리즈 디렉토리 확인 및 생성
 */
function ensureSeriesDirectory(seriesId) {
  if (!seriesId) return null;
  
  // seriesId를 직접 사용하여 디렉토리 경로 생성
  const seriesDir = path.join(config.paths.CARDS_DIR, seriesId);
  
  if (!fs.existsSync(seriesDir)) {
    fs.mkdirSync(seriesDir, { recursive: true });
    console.log(`시리즈 디렉토리 생성됨: ${seriesDir}`);
  }
  
  return seriesDir;
}

/**
 * card-series 디렉토리의 모든 카드 파일을 cards 디렉토리로 변환
 */
function convertAllCardSeriesToJsFiles() {
  try {
    // 소스 디렉토리 (텍스트 파일이 있는 곳)
    const sourceDir = path.join(config.paths.DATA_DIR, 'card-series');
    
    // 대상 디렉토리 (JS 파일을 저장할 곳)
    const targetDir = path.join(__dirname, 'cards');
    
    // 소스 디렉토리 존재 여부 확인
    if (!fs.existsSync(sourceDir)) {
      console.log(`소스 디렉토리가 없습니다: ${sourceDir}. 생성합니다.`);
      fs.mkdirSync(sourceDir, { recursive: true });
      return 0;
    }
    
    // 대상 디렉토리 존재 여부 확인
    if (!fs.existsSync(targetDir)) {
      console.log(`대상 디렉토리가 없습니다: ${targetDir}. 생성합니다.`);
      fs.mkdirSync(targetDir, { recursive: true });
    }
    
    // 소스 디렉토리의 모든 파일 읽기
    const files = fs.readdirSync(sourceDir);
    console.log(`${sourceDir}에서 ${files.length}개의 파일을 찾았습니다.`);
    
    let convertedCount = 0;
    let seriesList = [];
    
    // 각 파일 처리
    for (const file of files) {
      const filePath = path.join(sourceDir, file);
      
      // 파일인지 확인
      if (!fs.statSync(filePath).isFile()) {
        continue;
      }
      
      let cardSeries = null;
      
      // 파일 확장자에 따라 처리
      if (file.endsWith('.json')) {
        cardSeries = parseCardSeriesFromJsonFile(filePath);
      } else if (file.endsWith('.txt') || file.endsWith('.js')) {
        cardSeries = parseCardSeriesFromTextFile(filePath);
      } else {
        console.log(`지원되지 않는 파일 형식입니다: ${file} (txt, json, js만 지원)`);
        continue;
      }
      
      if (!cardSeries) {
        console.error(`${file} 파일에서 카드 시리즈를 파싱할 수 없습니다.`);
        continue;
      }
      
      // JS 파일로 내보내기
      const outputPath = path.join(targetDir, `${cardSeries.seriesId}.js`);
      const success = exportCardSeriesToJsFile(
        cardSeries.seriesId, 
        cardSeries.seriesName, 
        cardSeries.cards, 
        outputPath
      );
      
      if (success) {
        convertedCount++;
        seriesList.push({
          id: cardSeries.seriesId,
          name: cardSeries.seriesName,
          count: cardSeries.cards.length
        });
      }
    }
    
    // 변환된 시리즈 목록 출력
    //if (seriesList.length > 0) {
    //  console.log('변환된 시리즈 목록:');
    //  seriesList.forEach(series => {
    //    console.log(`- ${series.name} (${series.id}): ${series.count}개 카드`);
    //  });
    //}
    
    console.log(`${convertedCount}/${files.length}개의 파일을 성공적으로 변환했습니다.`);
    return convertedCount;
  } catch (error) {
    console.error('카드 시리즈 변환 중 오류 발생:', error);
    return 0;
  }
}

/**
 * 단일 카드 시리즈 파일 처리하기
 */
function processCardSeriesFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      console.error(`파일을 찾을 수 없음: ${filePath}`);
      return false;
    }
    
    let cardSeries = null;
    
    // 파일 확장자에 따라 처리
    if (filePath.endsWith('.json')) {
      cardSeries = parseCardSeriesFromJsonFile(filePath);
    } else if (filePath.endsWith('.txt') || filePath.endsWith('.js')) {
      cardSeries = parseCardSeriesFromTextFile(filePath);
    } else {
      console.error(`지원되지 않는 파일 형식입니다: ${filePath} (txt, json, js만 지원)`);
      return false;
    }
    
    if (!cardSeries) {
      console.error(`${filePath} 파일에서 카드 시리즈를 파싱할 수 없습니다.`);
      return false;
    }
    
    // JS 파일로 내보내기
    const targetDir = path.join(__dirname, 'cards');
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    
    const outputPath = path.join(targetDir, `${cardSeries.seriesId}.js`);
    return exportCardSeriesToJsFile(
      cardSeries.seriesId, 
      cardSeries.seriesName, 
      cardSeries.cards, 
      outputPath
    );
  } catch (error) {
    console.error(`파일 처리 중 오류 발생: ${filePath}`, error);
    return false;
  }
}

// 모듈 내보내기
module.exports = {
  parseCardSeriesFromTextFile,
  parseCardSeriesFromJsonFile,
  exportCardSeriesToJsFile,
  ensureSeriesDirectory,
  convertAllCardSeriesToJsFiles,
  processCardSeriesFile
};