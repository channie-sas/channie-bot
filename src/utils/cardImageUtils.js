const fs = require('fs');
const path = require('path');
const https = require('https');
const { createCanvas, loadImage } = require('canvas');
const { config, getSeriesDirectory } = require('../../config');

/**
 * 파일명 안전화 처리
 */
function sanitizeFilename(name) {
  return String(name).replace(/[^\w.-]/g, '_');
}

/**
 * 이미지 시그니처로 형식 감지
 */
function detectImageFormat(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return 'UNKNOWN';
  
  // PNG: 89 50 4E 47
  const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
  // JPEG: FF D8 FF
  const isJpeg = buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
  // WEBP: "RIFF"...."WEBP"
  const isWebp = buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 && 
                 buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50;
  
  if (isPng) return 'PNG';
  if (isJpeg) return 'JPEG';
  if (isWebp) return 'WEBP';
  return 'UNKNOWN';
}

/**
 * 이미지 크기 검증
 * @param {string} imageUrl - 이미지 URL
 * @returns {Promise<Object>} 검증 결과
 */
async function validateImageDimensions(imageUrl) {
  try {
    console.log('[IMAGE DEBUG] Validating image dimensions for:', imageUrl);
    
    // 이미지를 메모리로 로드 (메모리 효율성 개선)
    const imageBuffer = await downloadImage(imageUrl);
    const image = await loadImage(imageBuffer);
    
    const width = image.width;
    const height = image.height;
    
    console.log('[IMAGE DEBUG] Image dimensions:', `${width}x${height}`);
    
    // 요구사항과 비교
    const requiredWidth = config.cardImageWidth; // 330
    const requiredHeight = config.cardImageHeight; // 470
    
    const isValid = width === requiredWidth && height === requiredHeight;
    
    if (isValid) {
      console.log('[IMAGE DEBUG] Image dimensions are valid');
      return {
        isValid: true,
        message: 'Image dimensions are correct',
        actualWidth: width,
        actualHeight: height
      };
    } else {
      console.log('[IMAGE DEBUG] Image dimensions are invalid:', `Expected ${requiredWidth}x${requiredHeight}, got ${width}x${height}`);
      return {
        isValid: false,
        message: `Image dimensions are incorrect`,
        actualWidth: width,
        actualHeight: height,
        requiredWidth,
        requiredHeight
      };
    }
    
  } catch (error) {
    console.error('[IMAGE ERROR] Error validating image dimensions:', error);
    return {
      isValid: false,
      message: 'Failed to process image. Please make sure it\'s a valid image file.',
      error: error.message
    };
  }
}

/**
 * 이미지 다운로드 (메모리 효율성 개선)
 * @param {string} url - 이미지 URL
 * @returns {Promise<Buffer>} 이미지 버퍼
 */
function downloadImage(url) {
  return new Promise((resolve, reject) => {
    console.log('[IMAGE DEBUG] Downloading image from:', url);
    
    const chunks = [];
    
    https.get(url, (response) => {
      console.log('[IMAGE DEBUG] Response status:', response.statusCode);
      
      // 리다이렉트 처리
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        console.log('[IMAGE DEBUG] Redirecting to:', response.headers.location);
        return downloadImage(response.headers.location)
          .then(resolve)
          .catch(reject);
      }
      
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
        return;
      }
      
      // 스트림 기반으로 메모리 효율성 개선
      response.on('data', (chunk) => {
        chunks.push(chunk);
      });
      
      response.on('end', () => {
        const buffer = Buffer.concat(chunks);
        
        // 이미지 시그니처 검증
        const format = detectImageFormat(buffer);
        if (format === 'UNKNOWN') {
          reject(new Error('Unsupported or unknown image format'));
          return;
        }
        
        console.log('[IMAGE DEBUG] Image downloaded successfully, size:', buffer.length, 'bytes, format:', format);
        resolve(buffer);
      });
      
      response.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * 카드 이미지 저장 (파일명 안전화 + 정규화된 PNG 출력)
 * @param {string} imageUrl - 이미지 URL
 * @param {string} seriesId - 시리즈 ID
 * @param {string} cardId - 카드 ID
 * @param {string} variant - 변형 (v1, v2 등)
 * @returns {Promise<boolean>} 저장 성공 여부
 */
async function saveCardImage(imageUrl, seriesId, cardId, variant) {
  try {
    console.log('[IMAGE DEBUG] Saving card image:', `${cardId}_${variant}`, 'for series:', seriesId);
    
    // 파일명 안전화
    const safeSeriesId = sanitizeFilename(seriesId);
    const safeCardId = sanitizeFilename(cardId);
    const safeVariant = sanitizeFilename(variant);
    
    // 시리즈 디렉토리 확인/생성
    const seriesDir = getSeriesDirectory(safeSeriesId);
    if (!fs.existsSync(seriesDir)) {
      fs.mkdirSync(seriesDir, { recursive: true });
      console.log('[IMAGE DEBUG] Created series directory:', seriesDir);
    }
    
    // 이미지 다운로드 (메모리 효율성 개선 + 시그니처 검증 포함)
    const imageBuffer = await downloadImage(imageUrl);
    
    // 정규화된 PNG 출력을 위해 Canvas로 변환
    const image = await loadImage(imageBuffer);
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    const pngBuffer = canvas.toBuffer('image/png');
    
    // 파일 경로 생성 (안전화된 파일명 사용)
    const fileName = `${safeCardId}_${safeVariant}.png`;
    const filePath = path.join(seriesDir, fileName);
    
    console.log('[IMAGE DEBUG] Saving to:', filePath);
    
    // 백업 생성 (기존 파일이 있는 경우)
    if (fs.existsSync(filePath)) {
      const backupPath = path.join(seriesDir, `${safeCardId}_${safeVariant}_backup_${Date.now()}.png`);
      fs.copyFileSync(filePath, backupPath);
      console.log('[IMAGE DEBUG] Created backup:', backupPath);
    }
    
    // PNG로 정규화된 이미지 저장
    fs.writeFileSync(filePath, pngBuffer);
    console.log('[IMAGE DEBUG] Card image saved successfully as PNG:', filePath);
    
    // 이미지 캐시 정리 (기존 캐시된 이미지 무효화)
    try {
      const { cleanupImageCache } = require('./imageUtils');
      cleanupImageCache();
      console.log('[IMAGE DEBUG] Image cache cleaned up');
    } catch (cacheError) {
      console.warn('[IMAGE WARN] Could not clean image cache:', cacheError.message);
    }
    
    return true;
    
  } catch (error) {
    console.error('[IMAGE ERROR] Error saving card image:', error);
    return false;
  }
}

/**
 * 이미지 미리보기 생성 (향상된 미리보기)
 * @param {string} imageUrl - 이미지 URL
 * @param {string} cardName - 카드 이름
 * @param {string} seriesName - 시리즈 이름
 * @returns {Promise<Buffer>} 미리보기 이미지 버퍼
 */
async function createImagePreview(imageUrl, cardName, seriesName) {
  try {
    console.log('[IMAGE DEBUG] Creating image preview for:', cardName);
    
    // 이미지 다운로드 (메모리 효율성 + 시그니처 검증 포함)
    const imageBuffer = await downloadImage(imageUrl);
    const image = await loadImage(imageBuffer);
    
    // 미리보기 캔버스 생성 (원본보다 작게)
    const previewWidth = 165; // 330의 절반
    const previewHeight = 235; // 470의 절반
    const canvas = createCanvas(previewWidth, previewHeight);
    const ctx = canvas.getContext('2d');
    
    // 고품질 렌더링 설정
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    
    // 이미지 그리기
    ctx.drawImage(image, 0, 0, previewWidth, previewHeight);
    
    // 향상된 텍스트 라벨
    const labelHeight = 25;
    const padding = 8;
    
    // 그라디언트 배경
    const gradient = ctx.createLinearGradient(0, previewHeight - labelHeight, 0, previewHeight);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0.8)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.9)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, previewHeight - labelHeight, previewWidth, labelHeight);
    
    // 카드 이름 텍스트 (향상된 폰트)
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // 텍스트 길이 제한 및 말줄임표
    const maxLength = 20;
    const displayName = cardName.length > maxLength ? cardName.slice(0, maxLength) + '...' : cardName;
    
    ctx.fillText(displayName, previewWidth / 2, previewHeight - labelHeight / 2);
    
    // 시리즈 이름 추가 (작은 글씨)
    if (seriesName) {
      ctx.font = '9px Arial, sans-serif';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      const maxSeriesLength = 15;
      const displaySeries = seriesName.length > maxSeriesLength ? seriesName.slice(0, maxSeriesLength) + '...' : seriesName;
      ctx.fillText(displaySeries, previewWidth / 2, previewHeight - 6);
    }
    
    const previewBuffer = canvas.toBuffer('image/png');
    console.log('[IMAGE DEBUG] Enhanced image preview created successfully');
    
    return previewBuffer;
  } catch (error) {
    console.error('[IMAGE ERROR] Error creating image preview:', error);
    throw error;
  }
}

/**
 * 이미지 메타데이터 추출
 * @param {string} imageUrl - 이미지 URL
 * @returns {Promise<Object>} 이미지 정보
 */
async function getImageInfo(imageUrl) {
  try {
    console.log('[IMAGE DEBUG] Getting image info for:', imageUrl);
    
    const imageBuffer = await downloadImage(imageUrl);
    const image = await loadImage(imageBuffer);
    
    // 이미지 시그니처 검증으로 정확한 형식 감지
    const format = detectImageFormat(imageBuffer);
    
    const info = {
      width: image.width,
      height: image.height,
      size: imageBuffer.length,
      format: format
    };
    
    console.log('[IMAGE DEBUG] Image info:', info);
    return info;
  } catch (error) {
    console.error('[IMAGE ERROR] Error getting image info:', error);
    throw error;
  }
}

/**
 * 이미지 형식 검증 (이미지 시그니처 검증)
 * @param {string} imageUrl - 이미지 URL
 * @returns {Promise<boolean>} 유효한 이미지 형식인지 여부
 */
async function validateImageFormat(imageUrl) {
  try {
    console.log('[IMAGE DEBUG] Validating image format for:', imageUrl);
    
    const imageBuffer = await downloadImage(imageUrl);
    
    // 이미지 시그니처 검증
    const format = detectImageFormat(imageBuffer);
    const isValid = ['PNG', 'JPEG', 'WEBP'].includes(format);
    
    console.log('[IMAGE DEBUG] Image format validation:', {
      format: format,
      isValid: isValid
    });
    
    return isValid;
  } catch (error) {
    console.error('[IMAGE ERROR] Error validating image format:', error);
    return false;
  }
}

module.exports = {
  validateImageDimensions,
  downloadImage,
  saveCardImage,
  createImagePreview,
  getImageInfo,
  validateImageFormat,
  // 새로 추가된 유틸리티 함수들
  sanitizeFilename,
  detectImageFormat
};