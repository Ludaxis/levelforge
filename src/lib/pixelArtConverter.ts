import { FruitType, PixelCell, FRUIT_COLORS, ALL_FRUITS } from '@/types/fruitMatch';

// ============================================================================
// Color Utilities - Using LAB color space for better perceptual matching
// ============================================================================

interface RGB {
  r: number;
  g: number;
  b: number;
}

interface LAB {
  l: number;
  a: number;
  b: number;
}

/**
 * Parse hex color to RGB
 */
function hexToRgb(hex: string): RGB {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) {
    return { r: 0, g: 0, b: 0 };
  }
  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  };
}

/**
 * Convert RGB to LAB color space for better perceptual color matching
 */
function rgbToLab(rgb: RGB): LAB {
  // First convert to XYZ
  let r = rgb.r / 255;
  let g = rgb.g / 255;
  let b = rgb.b / 255;

  r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
  g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
  b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;

  r *= 100;
  g *= 100;
  b *= 100;

  const x = r * 0.4124 + g * 0.3576 + b * 0.1805;
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const z = r * 0.0193 + g * 0.1192 + b * 0.9505;

  // Then XYZ to LAB
  let xn = x / 95.047;
  let yn = y / 100.0;
  let zn = z / 108.883;

  xn = xn > 0.008856 ? Math.pow(xn, 1/3) : (7.787 * xn) + 16/116;
  yn = yn > 0.008856 ? Math.pow(yn, 1/3) : (7.787 * yn) + 16/116;
  zn = zn > 0.008856 ? Math.pow(zn, 1/3) : (7.787 * zn) + 16/116;

  return {
    l: (116 * yn) - 16,
    a: 500 * (xn - yn),
    b: 200 * (yn - zn),
  };
}

/**
 * Calculate Delta E (color difference) in LAB space
 */
function deltaE(lab1: LAB, lab2: LAB): number {
  return Math.sqrt(
    Math.pow(lab1.l - lab2.l, 2) +
    Math.pow(lab1.a - lab2.a, 2) +
    Math.pow(lab1.b - lab2.b, 2)
  );
}

// Pre-compute fruit colors in LAB space
const FRUIT_LAB: Record<FruitType, LAB> = {} as Record<FruitType, LAB>;
for (const fruit of ALL_FRUITS) {
  FRUIT_LAB[fruit] = rgbToLab(hexToRgb(FRUIT_COLORS[fruit]));
}

/**
 * Find the closest fruit color to a given RGB color using LAB color space
 */
function findClosestFruit(rgb: RGB): FruitType {
  const lab = rgbToLab(rgb);
  let closestFruit: FruitType = 'apple';
  let minDistance = Infinity;

  for (const fruit of ALL_FRUITS) {
    const distance = deltaE(lab, FRUIT_LAB[fruit]);
    if (distance < minDistance) {
      minDistance = distance;
      closestFruit = fruit;
    }
  }

  return closestFruit;
}

/**
 * Check if a pixel should be considered "empty" (transparent or near-white)
 */
function isEmptyPixel(r: number, g: number, b: number, a: number): boolean {
  // Transparent pixels
  if (a < 30) return true;

  // Very light pixels (close to white)
  const brightness = (r + g + b) / 3;
  if (brightness > 245 && a < 200) return true;

  return false;
}

// ============================================================================
// Twemoji URL Generation
// ============================================================================

/**
 * Convert emoji to its Unicode code points for Twemoji URL
 */
function emojiToCodePoints(emoji: string): string {
  const codePoints: string[] = [];

  for (const char of emoji) {
    const codePoint = char.codePointAt(0);
    if (codePoint !== undefined) {
      // Skip variation selectors (FE0F) for cleaner URLs
      if (codePoint !== 0xFE0F) {
        codePoints.push(codePoint.toString(16));
      }
    }
  }

  return codePoints.join('-');
}

/**
 * Get Twemoji PNG URL for an emoji
 */
function getTwemojiUrl(emoji: string): string {
  const codePoints = emojiToCodePoints(emoji);
  // Use 72x72 PNG from jsDelivr CDN
  return `https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/72x72/${codePoints}.png`;
}

// ============================================================================
// Emoji to Pixel Art Conversion (using Twemoji)
// ============================================================================

/**
 * Convert emoji to pixel art using Twemoji images
 */
export async function emojiToPixelArtAsync(
  emoji: string,
  gridWidth: number,
  gridHeight: number
): Promise<PixelCell[]> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      const cells = processImageToPixelArt(img, gridWidth, gridHeight);
      resolve(cells);
    };

    img.onerror = () => {
      // Fallback to canvas-based rendering if Twemoji fails
      console.warn('Twemoji failed, falling back to canvas rendering');
      const cells = emojiToPixelArtCanvas(emoji, gridWidth, gridHeight);
      resolve(cells);
    };

    img.src = getTwemojiUrl(emoji);
  });
}

/**
 * Synchronous fallback using canvas rendering
 */
export function emojiToPixelArt(
  emoji: string,
  gridWidth: number,
  gridHeight: number
): PixelCell[] {
  return emojiToPixelArtCanvas(emoji, gridWidth, gridHeight);
}

/**
 * Canvas-based emoji rendering (fallback)
 */
function emojiToPixelArtCanvas(
  emoji: string,
  gridWidth: number,
  gridHeight: number
): PixelCell[] {
  // Step 1: Render emoji at high resolution
  const hiResSize = 128;
  const hiResCanvas = document.createElement('canvas');
  hiResCanvas.width = hiResSize;
  hiResCanvas.height = hiResSize;

  const hiResCtx = hiResCanvas.getContext('2d', { willReadFrequently: true });
  if (!hiResCtx) return [];

  hiResCtx.clearRect(0, 0, hiResSize, hiResSize);
  hiResCtx.font = `${hiResSize * 0.8}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
  hiResCtx.textAlign = 'center';
  hiResCtx.textBaseline = 'middle';
  hiResCtx.fillText(emoji, hiResSize / 2, hiResSize / 2);

  // Step 2: Downscale to grid size
  const gridCanvas = document.createElement('canvas');
  gridCanvas.width = gridWidth;
  gridCanvas.height = gridHeight;

  const gridCtx = gridCanvas.getContext('2d', { willReadFrequently: true });
  if (!gridCtx) return [];

  gridCtx.imageSmoothingEnabled = true;
  gridCtx.imageSmoothingQuality = 'high';
  gridCtx.drawImage(hiResCanvas, 0, 0, gridWidth, gridHeight);

  // Step 3: Extract pixel data
  const imageData = gridCtx.getImageData(0, 0, gridWidth, gridHeight);
  return extractPixelCells(imageData.data, gridWidth, gridHeight);
}

// ============================================================================
// Image to Pixel Art Conversion
// ============================================================================

/**
 * Load an image from a File and convert to pixel art
 */
export function imageToPixelArt(
  file: File,
  gridWidth: number,
  gridHeight: number
): Promise<PixelCell[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();

      img.onload = () => {
        const cells = processImageToPixelArt(img, gridWidth, gridHeight);
        resolve(cells);
      };

      img.onerror = () => {
        reject(new Error('Failed to load image'));
      };

      img.src = e.target?.result as string;
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Process an Image element into pixel art
 */
function processImageToPixelArt(
  img: HTMLImageElement,
  gridWidth: number,
  gridHeight: number
): PixelCell[] {
  const canvas = document.createElement('canvas');
  canvas.width = gridWidth;
  canvas.height = gridHeight;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Calculate aspect-fit dimensions
  const imgAspect = img.width / img.height;
  const canvasAspect = gridWidth / gridHeight;

  let drawWidth = gridWidth;
  let drawHeight = gridHeight;
  let offsetX = 0;
  let offsetY = 0;

  if (imgAspect > canvasAspect) {
    drawHeight = gridWidth / imgAspect;
    offsetY = (gridHeight - drawHeight) / 2;
  } else {
    drawWidth = gridHeight * imgAspect;
    offsetX = (gridWidth - drawWidth) / 2;
  }

  ctx.clearRect(0, 0, gridWidth, gridHeight);
  ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);

  const imageData = ctx.getImageData(0, 0, gridWidth, gridHeight);
  return extractPixelCells(imageData.data, gridWidth, gridHeight);
}

/**
 * Extract pixel cells from image data
 */
function extractPixelCells(
  data: Uint8ClampedArray,
  gridWidth: number,
  gridHeight: number
): PixelCell[] {
  const cells: PixelCell[] = [];

  for (let row = 0; row < gridHeight; row++) {
    for (let col = 0; col < gridWidth; col++) {
      const idx = (row * gridWidth + col) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];

      if (isEmptyPixel(r, g, b, a)) {
        continue;
      }

      const fruitType = findClosestFruit({ r, g, b });

      cells.push({
        row,
        col,
        fruitType,
        filled: false,
      });
    }
  }

  return cells;
}

// ============================================================================
// Popular Emojis for Pixel Art
// ============================================================================

export const POPULAR_EMOJIS = [
  // Fruits (natural fit for the game)
  '🍎', '🍊', '🍋', '🍇', '🍒', '🥝',
  '🍓', '🍑', '🍌', '🍉', '🍐', '🫐',
  // Animals - good shapes for pixel art
  '🐱', '🐶', '🐰', '🐻', '🦊', '🐸',
  '🐷', '🐵', '🦁', '🐼', '🐨', '🦄',
  '🐔', '🐧', '🐢', '🐙', '🦀', '🐠',
  // Hearts & Shapes
  '❤️', '🧡', '💛', '💚', '💙', '💜',
  '⭐', '🌟', '💎', '🔶', '🔷',
  // Nature
  '🌸', '🌺', '🌻', '🌹', '🌷', '🍀',
  '🌲', '🌴', '🍄', '🌵', '☀️', '🌙',
  // Food
  '🍕', '🍔', '🌮', '🍩', '🧁', '🍦',
  '🎂', '🍪', '🍫', '🍬', '🍭', '🥕',
  // Objects
  '🎃', '🎄', '🎁', '🎈', '🎯', '🏆',
  '⚽', '🏀', '🎮', '🎵', '💡', '🔔',
  // Faces & Characters
  '😀', '😎', '🥰', '😺', '👻', '💀',
  '🤖', '👽', '🐲', '🦖', '🦕', '🎅',
];
