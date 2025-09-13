// src/utils/imageUtils.js
const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');
const { config, prettyVariantName, getFrameImagePath, shouldUseFrame, getSeriesDirectory } = require('../../config');

// 이미지 캐싱 시스템
const imageCache = new Map();
const CACHE_TTL = 15 * 60 * 1000; // 15분 캐시 유지

// 이미지 파일 경로 가져오기 함수
function getCardImagePath(card) {

  // 자원 카드인 경우 특별 경로 사용
  if (card.type === 'resource') {
    const cardId = card.id || card.cardId;
    return path.join(config.paths.RESOURCE_CARDS_DIR, `${cardId}.png`);
  }

  // 카드 ID와 시리즈 확인
  const cardId = card.id || card.cardId;
  let seriesId;
  
  // seriesId가 있으면 우선 사용 (이미 정규화된 ID)
  if (card.seriesId) {
    seriesId = card.seriesId;
  }
  // seriesId가 없는 경우 series에서 추출
  else if (card.series) {
    // 카드 시리즈가 문자열인 경우 (시리즈 이름)
    if (typeof card.series === 'string') {
      // 시리즈 이름에서 ID 형태로 변환 - 특수문자 제거 추가
      seriesId = card.series.toLowerCase()
                           .replace(/[^\w\s]/g, '')  // 알파벳, 숫자, 언더스코어, 공백만 남김
                           .replace(/\s+/g, '');     // 공백 제거
    } else {
      // 이미 ID인 경우
      seriesId = card.series;
    }
  } else {
    // 시리즈 정보가 없는 경우, cardId에서 추출 시도
    // 예: 'felixskz'에서 'skz'가 시리즈 식별자로 가정하고 추출
    const idParts = cardId.match(/^(\w+?)([a-z]+)$/);
    if (idParts && idParts[2]) {
      seriesId = idParts[2];
    } else {
      // 추출 실패 시 기본값 사용
      seriesId = 'unknown';
    }
  }
  
  // 변형 가져오기
  const variant = card.selectedVariant || card.variant || 'v1';
  
  // 시리즈 디렉토리 가져오기
  const seriesDir = getSeriesDirectory(seriesId);
  
  // 최종 이미지 경로 조합
  const imagePath = path.join(seriesDir, `${cardId}_${variant}.png`);
  
  return imagePath;
}

// 스킬 타입별 프레임 경로 가져오기 함수
function getSkillFramePath(skillType) {
  if (!skillType) return null;
  
  const framePath = path.join(
    config.paths.FRAMES_DIR,
    `default-${skillType}.png`
  );
  
  if (fs.existsSync(framePath)) {
    return framePath;
  }
  
  // 스킬별 프레임이 없으면 기본 프레임 반환
  return path.join(config.paths.FRAMES_DIR, 'default.png');
}

// 둥근 모서리 사각형 그리기 함수
function roundRect(ctx, x, y, width, height, radius) {
  if (typeof radius === 'undefined') {
    radius = 5;
  }
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  return ctx;
}

// G값 텍스트 렌더링 함수
function renderGValue(ctx, x, y, width, gValue) {
  // G값 텍스트
  const gValueText = `G${gValue || '?'}`;
  ctx.fillStyle = '#664B52';
  ctx.font = '18px sans';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  // 텍스트 그림자 효과 (더 잘 보이게)
  ctx.shadowColor = 'white';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  
  // G값 텍스트 그리기
  ctx.fillText(gValueText, x + width - 30, y + 15);
  
  // 그림자 효과 초기화
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
}

// 카드 이름 렌더링 함수
function renderCardName(ctx, x, y, width, height, name) {
  // 카드 이름 표시
  ctx.fillStyle = '#664B52';
  ctx.font = '18px sans';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  
  // 그림자 효과 추가
  ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  
  ctx.fillText(name, x + width/2, y + height - 25);
  
  // 그림자 리셋
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

// 스킬 타입 렌더링 함수
function renderSkillType(ctx, x, y, width, height, skillType) {
  if (!skillType) return;
  
  // 스킬 타입 아이콘 매핑
  const skillEmoji = {
    'mining': '⛏️',
    'fishing': '🎣',
    'battle': '⚔️',
    'building': '🏗️',
    'farming': '🌾',
    'crafting': '🔨',
    'excavation': '🔍',
    'researching': '📚',
    'gathering': '🌲'
  };
  
  const icon = skillEmoji[skillType] || '';
  const skillText = `${icon} ${skillType.toUpperCase()}`;
  
  ctx.fillStyle = '#664B52';
  ctx.font = '16px sans';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  
  // 그림자 효과 추가
  ctx.shadowColor = 'white';
  ctx.shadowBlur = 1;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  
  // 스킬 타입 배경 (반투명)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  roundRect(ctx, x + 10, y + height - 45, width - 20, 25, 5);
  ctx.fill();
  
  // 스킬 타입 텍스트
  ctx.fillStyle = '#333333';
  ctx.fillText(skillText, x + 20, y + height - 33);
  
  // 그림자 리셋
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
}

// 둥근 모서리로 이미지 자르기
function clipRoundedImage(ctx, x, y, width, height, radius) {
  roundRect(ctx, x, y, width, height, radius);
  ctx.clip();
}

// 자원 카드 이미지 생성 함수
async function createResourceCardImage(card) {
  const canvas = createCanvas(config.cardImageWidth, config.cardImageHeight);
  const ctx = canvas.getContext('2d');
  
  // 배경 설정 (투명하게)
  ctx.clearRect(0, 0, config.cardImageWidth, config.cardImageHeight);
  
  try {
    // 카드 이미지 파일 경로
    const imagePath = path.join(config.paths.RESOURCE_CARDS_DIR, `${card.id}.png`);
    
    // 이미지 파일이 존재하는지 확인
    if (!fs.existsSync(imagePath)) {
      // 이미지가 없는 경우 대체 이미지 생성
      ctx.fillStyle = '#3A3F44'; // 운석 카드 색상 (어두운 회색)
      
      // 둥근 모서리로 그리기
      roundRect(ctx, 0, 0, config.cardImageWidth, config.cardImageHeight, config.cardCornerRadius);
      ctx.fill();
      
      // 카드 텍스트 중앙에 표시
      ctx.fillStyle = '#ffffff';
      ctx.font = '20px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(`${card.name}`, config.cardImageWidth / 2, config.cardImageHeight / 2);
      
      console.log(`Warning: Resource image file not found: ${imagePath}`);
    } else {
      // 버퍼로 이미지 로드 시도
      try {
        const imageBuffer = fs.readFileSync(imagePath);
        const image = await loadImage(Buffer.from(imageBuffer));
        
        // 새 캔버스에서 이미지를 둥근 모서리로 그리기
        const tempCanvas = createCanvas(config.cardImageWidth, config.cardImageHeight);
        const tempCtx = tempCanvas.getContext('2d');
        
        // 둥근 모서리 클리핑 적용
        tempCtx.save();
        clipRoundedImage(tempCtx, 0, 0, config.cardImageWidth, config.cardImageHeight, config.cardCornerRadius);
        
        // 이미지 그리기
        tempCtx.drawImage(image, 0, 0, config.cardImageWidth, config.cardImageHeight);
        tempCtx.restore();
        
        // 메인 캔버스에 결과 이미지 복사
        ctx.drawImage(tempCanvas, 0, 0);
      } catch (loadError) {
        console.error(`Failed to load resource image with buffer for ${card.name}:`, loadError);
        
        // 대체 이미지 생성 (둥근 모서리)
        ctx.fillStyle = '#3A3F44';
        roundRect(ctx, 0, 0, config.cardImageWidth, config.cardImageHeight, config.cardCornerRadius);
        ctx.fill();
        
        ctx.fillStyle = '#ffffff';
        ctx.font = '20px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`${card.name}`, config.cardImageWidth / 2, config.cardImageHeight / 2);
        ctx.fillText(`(Image Load Error)`, config.cardImageWidth / 2, config.cardImageHeight / 2 + 30);
      }
    }
    
  } catch (error) {
    console.error(`Error creating resource card image for ${card.name}:`, error);
    
    // 에러 발생 시 대체 표시 (둥근 모서리)
    ctx.fillStyle = '#ff0000';
    roundRect(ctx, 0, 0, config.cardImageWidth, config.cardImageHeight, config.cardCornerRadius);
    ctx.fill();
    
    ctx.fillStyle = '#ffffff';
    ctx.font = '20px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Error Loading Resource Card', config.cardImageWidth / 2, config.cardImageHeight / 2);
  }
  
  return canvas.toBuffer('image/png');
}

// 기존 카드 이미지 생성 함수 - 변경 없음
async function createRegularCardImage(card) {
  const canvas = createCanvas(config.cardImageWidth, config.cardImageHeight);
  const ctx = canvas.getContext('2d');
  
  // 배경 설정 (투명하게)
  ctx.clearRect(0, 0, config.cardImageWidth, config.cardImageHeight);
  
  try {
    // 카드 이미지 파일 경로
    const imagePath = getCardImagePath(card);
    
    // 이미지 파일이 존재하는지 확인
    if (!fs.existsSync(imagePath)) {
      // 이미지가 없는 경우 대체 이미지 생성
      ctx.fillStyle = '#565656';
      
      // 둥근 모서리로 그리기
      roundRect(ctx, 0, 0, config.cardImageWidth, config.cardImageHeight, config.cardCornerRadius);
      ctx.fill();
      
      // 카드 텍스트 중앙에 표시
      ctx.fillStyle = '#ffffff';
      ctx.font = '20px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(`${card.name}`, config.cardImageWidth / 2, config.cardImageHeight / 2);
      ctx.fillText(`(No Image)`, config.cardImageWidth / 2, config.cardImageHeight / 2 + 30);
      
      console.log(`Warning: Image file not found: ${imagePath}`);
    } else {
      // 버퍼로 이미지 로드 시도
      try {
        const imageBuffer = fs.readFileSync(imagePath);
        const image = await loadImage(Buffer.from(imageBuffer));
        
        // 새 캔버스에서 이미지를 둥근 모서리로 그리기
        const tempCanvas = createCanvas(config.cardImageWidth, config.cardImageHeight);
        const tempCtx = tempCanvas.getContext('2d');
        
        // 둥근 모서리 클리핑 적용
        tempCtx.save();
        clipRoundedImage(tempCtx, 0, 0, config.cardImageWidth, config.cardImageHeight, config.cardCornerRadius);
        
        // 이미지 그리기
        tempCtx.drawImage(image, 0, 0, config.cardImageWidth, config.cardImageHeight);
        tempCtx.restore();
        
        // 메인 캔버스에 결과 이미지 복사
        ctx.drawImage(tempCanvas, 0, 0);
      } catch (loadError) {
        console.error(`Failed to load image with buffer for ${card.name}:`, loadError);
        
        // 대체 이미지 생성 (둥근 모서리)
        ctx.fillStyle = '#565656';
        roundRect(ctx, 0, 0, config.cardImageWidth, config.cardImageHeight, config.cardCornerRadius);
        ctx.fill();
        
        ctx.fillStyle = '#ffffff';
        ctx.font = '20px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`${card.name}`, config.cardImageWidth / 2, config.cardImageHeight / 2);
        ctx.fillText(`(Image Load Error)`, config.cardImageWidth / 2, config.cardImageHeight / 2 + 30);
      }
    }
    
    // 프레임 이미지 로드 및 그리기 (기본 변형인 경우만)
    if (shouldUseFrame(card)) {
      // 스킬 타입별 프레임 경로 가져오기
      let frameImagePath = null;
      
      // 카드에 스킬 타입이 있는 경우 스킬별 프레임 시도
      if (card.skillType) {
        frameImagePath = getSkillFramePath(card.skillType);
      } else {
        // 스킬 타입이 없으면 기본 프레임 사용
        frameImagePath = getFrameImagePath(card);
      }
      
      if (frameImagePath && fs.existsSync(frameImagePath)) {
        try {
          const frameBuffer = fs.readFileSync(frameImagePath);
          const frameImage = await loadImage(Buffer.from(frameBuffer));
          ctx.drawImage(frameImage, 0, 0, config.cardImageWidth, config.cardImageHeight);
        } catch (frameError) {
          console.error(`Failed to load frame image: ${frameError}`);
        }
      } else {
        console.log(`Frame image not found: ${frameImagePath}, using default rendering`);
      }
    }
    
    // G값 표시 - 항상 표시
    renderGValue(ctx, -30, 0, config.cardImageWidth, card.gValue);
    
    // 카드 이름 표시 - 항상 표시
    renderCardName(ctx, -150, 4, config.cardImageWidth, config.cardImageHeight, card.name);
    
    // 스킬 타입 표시 (있는 경우)
    //if (card.skillType) {
    //  renderSkillType(ctx, 0, 0, config.cardImageWidth, config.cardImageHeight, card.skillType);
    //}
    
  } catch (error) {
    console.error(`Error details for ${card.name}:`, error);
    
    // 에러 발생 시 대체 표시 (둥근 모서리)
    ctx.fillStyle = '#ff0000';
    roundRect(ctx, 0, 0, config.cardImageWidth, config.cardImageHeight, config.cardCornerRadius);
    ctx.fill();
    
    ctx.fillStyle = '#ffffff';
    ctx.font = '20px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Error Loading Card', config.cardImageWidth / 2, config.cardImageHeight / 2);
  }
  
  return canvas.toBuffer('image/png');
}

// 조건에 따라 적절한 카드 이미지 생성 함수 호출
async function createSingleCardImage(card) {
  // 카드 ID와 변형으로 캐시 키 생성
  const cardId = card.id || card.cardId;
  const variant = card.selectedVariant || card.variant || 'v1';
  const type = card.type || 'normal';
  const cacheKey = `card_${cardId}_${variant}_${type}`;
  
  // 캐시된 이미지 사용 또는 새로 생성
  return getCachedImage(cacheKey, async () => {
    if (type === 'resource') {
      return createResourceCardImage(card);
    } else {
      return createRegularCardImage(card);
    }
  });
}

// 카드 드롭 이미지 생성 함수
async function createCardDropImage(cards) {
  // 카드 ID로 캐시 키 생성
  const cardsKey = cards.map(c => {
    const id = c.id || c.cardId;
    const variant = c.selectedVariant || c.variant || 'v1';
    return `${id}_${variant}`;
  }).join('|');
  
  const cacheKey = `drop_${cardsKey}`;
  
  // 캐시된 이미지 사용 또는 새로 생성
  return getCachedImage(cacheKey, async () => {
    // 캔버스 설정
    const width = config.cardImageWidth * config.CARDS_PER_DROP + config.cardSpacing * (config.CARDS_PER_DROP - 1);
    const height = config.cardImageHeight;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    
    // 배경 설정 (투명하게)
    ctx.clearRect(0, 0, width, height);
    
    // 카드 이미지 모두 비동기적으로 생성 (병렬 처리)
    const cardImagesPromises = cards.map(card => createSingleCardImage(card));
    const cardImages = await Promise.all(cardImagesPromises);
    
    // 생성된 카드 이미지를 캔버스에 그리기
    for (let i = 0; i < cards.length; i++) {
      const x = i * (config.cardImageWidth + config.cardSpacing);
      const cardImage = await loadImage(cardImages[i]);
      ctx.drawImage(cardImage, x, 0);
    }
    
    return canvas.toBuffer('image/png');
  });
}


/**
 * 이미지 캐시에서 가져오거나 새로 생성
 * @param {string} cacheKey - 캐시 키
 * @param {Function} createFn - 이미지 생성 함수
 * @returns {Promise<Buffer>} - 이미지 버퍼
 */
async function getCachedImage(cacheKey, createFn) {
  const now = Date.now();
  
  // 캐시에 있는지 확인
  if (imageCache.has(cacheKey)) {
    const { buffer, timestamp } = imageCache.get(cacheKey);
    
    // 유효한 캐시인지 확인
    if (now - timestamp < CACHE_TTL) {
      console.log(`[CACHE] Using cached image: ${cacheKey}`);
      return buffer;
    } else {
      // 만료된 캐시 삭제
      imageCache.delete(cacheKey);
    }
  }
  
  // 캐시가 없으면 새로 생성
  console.log(`[CACHE] Creating new image: ${cacheKey}`);
  const buffer = await createFn();
  
  // 캐시에 저장
  imageCache.set(cacheKey, {
    buffer,
    timestamp: now
  });
  
  return buffer;
}


// 캐시 크기 관리를 위한 함수
function cleanupImageCache() {
  const now = Date.now();
  let count = 0;
  
  // 만료된 캐시 항목 제거
  for (const [key, data] of imageCache.entries()) {
    if (now - data.timestamp > CACHE_TTL) {
      imageCache.delete(key);
      count++;
    }
  }
  
  // 캐시가 너무 크면 오래된 항목부터 제거
  const MAX_CACHE_SIZE = 100;
  if (imageCache.size > MAX_CACHE_SIZE) {
    const entries = [...imageCache.entries()]
      .sort((a, b) => a[1].timestamp - b[1].timestamp);
    
    const toRemove = entries.slice(0, imageCache.size - MAX_CACHE_SIZE);
    for (const [key] of toRemove) {
      imageCache.delete(key);
      count++;
    }
  }
  
  if (count > 0) {
    console.log(`[CACHE] Cleaned up ${count} cached images, current size: ${imageCache.size}`);
  }
}

// 주기적으로 캐시 정리 (30분마다)
setInterval(cleanupImageCache, 30 * 60 * 1000);

module.exports = {
  createCardDropImage,
  createSingleCardImage,
  getCardImagePath,
  getCachedImage,
  cleanupImageCache
};