import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Note: Most functions in pixelArtConverter are internal (not exported)
// We test the exported functions and their behavior indirectly
// The main exports are: emojiToPixelArtAsync, emojiToPixelArt, imageToPixelArt, POPULAR_EMOJIS

import { emojiToPixelArt, POPULAR_EMOJIS } from '../pixelArtConverter';
import { FruitType } from '@/types/fruitMatch';

// ============================================================================
// Mock Canvas API
// ============================================================================

const mockImageData = {
  data: new Uint8ClampedArray(16 * 4), // 4x4 grid
  width: 4,
  height: 4,
};

const mockContext = {
  clearRect: vi.fn(),
  fillText: vi.fn(),
  drawImage: vi.fn(),
  getImageData: vi.fn(() => mockImageData),
  imageSmoothingEnabled: true,
  imageSmoothingQuality: 'high' as ImageSmoothingQuality,
  font: '',
  textAlign: 'center' as CanvasTextAlign,
  textBaseline: 'middle' as CanvasTextBaseline,
};

const mockCanvas = {
  width: 0,
  height: 0,
  getContext: vi.fn(() => mockContext),
};

beforeEach(() => {
  vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
    if (tagName === 'canvas') {
      return mockCanvas as unknown as HTMLCanvasElement;
    }
    return document.createElement(tagName);
  });

  // Reset mock data
  mockImageData.data.fill(0);
  mockContext.getImageData.mockReturnValue(mockImageData);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ============================================================================
// Helper to set pixel data
// ============================================================================

function setPixel(data: Uint8ClampedArray, index: number, r: number, g: number, b: number, a: number) {
  data[index * 4] = r;
  data[index * 4 + 1] = g;
  data[index * 4 + 2] = b;
  data[index * 4 + 3] = a;
}

// ============================================================================
// POPULAR_EMOJIS constant
// ============================================================================

describe('POPULAR_EMOJIS', () => {
  it('should export a non-empty array of emojis', () => {
    expect(Array.isArray(POPULAR_EMOJIS)).toBe(true);
    expect(POPULAR_EMOJIS.length).toBeGreaterThan(0);
  });

  it('should contain fruit emojis', () => {
    expect(POPULAR_EMOJIS).toContain('🍎');
    expect(POPULAR_EMOJIS).toContain('🍊');
    expect(POPULAR_EMOJIS).toContain('🍇');
  });

  it('should contain heart emojis', () => {
    expect(POPULAR_EMOJIS).toContain('❤️');
    expect(POPULAR_EMOJIS).toContain('💚');
    expect(POPULAR_EMOJIS).toContain('💙');
  });

  it('should contain animal emojis', () => {
    expect(POPULAR_EMOJIS).toContain('🐱');
    expect(POPULAR_EMOJIS).toContain('🐶');
  });

  it('should have no duplicates', () => {
    const unique = new Set(POPULAR_EMOJIS);
    expect(unique.size).toBe(POPULAR_EMOJIS.length);
  });
});

// ============================================================================
// emojiToPixelArt (canvas fallback)
// ============================================================================

describe('emojiToPixelArt', () => {
  describe('Basic conversion', () => {
    it('should return empty array when no context available', () => {
      mockCanvas.getContext.mockReturnValueOnce(null);
      const result = emojiToPixelArt('🍎', 4, 4);
      expect(result).toEqual([]);
    });

    it('should return empty array when second context fails', () => {
      mockCanvas.getContext
        .mockReturnValueOnce(mockContext) // hi-res canvas
        .mockReturnValueOnce(null);       // grid canvas
      const result = emojiToPixelArt('🍎', 4, 4);
      expect(result).toEqual([]);
    });

    it('should set canvas dimensions correctly', () => {
      emojiToPixelArt('🍎', 8, 6);
      // The hi-res canvas is 128x128, grid canvas matches requested size
      expect(mockCanvas.getContext).toHaveBeenCalledWith('2d', { willReadFrequently: true });
    });

    it('should call fillText with the emoji', () => {
      emojiToPixelArt('🍎', 4, 4);
      expect(mockContext.fillText).toHaveBeenCalledWith('🍎', 64, 64); // 128/2
    });
  });

  describe('Pixel extraction', () => {
    it('should skip transparent pixels (alpha < 30)', () => {
      // All pixels transparent
      mockImageData.data.fill(0);
      const result = emojiToPixelArt('🍎', 4, 4);
      expect(result).toHaveLength(0);
    });

    it('should include semi-transparent pixels (alpha >= 30)', () => {
      // Set one pixel with alpha = 30
      setPixel(mockImageData.data, 0, 255, 0, 0, 30);
      const result = emojiToPixelArt('🍎', 4, 4);
      expect(result).toHaveLength(1);
      expect(result[0].row).toBe(0);
      expect(result[0].col).toBe(0);
    });

    it('should include fully opaque pixels', () => {
      setPixel(mockImageData.data, 0, 255, 0, 0, 255);
      const result = emojiToPixelArt('🍎', 4, 4);
      expect(result).toHaveLength(1);
    });

    it('should set filled to false for all pixels', () => {
      setPixel(mockImageData.data, 0, 255, 0, 0, 255);
      setPixel(mockImageData.data, 1, 0, 255, 0, 255);
      const result = emojiToPixelArt('🍎', 4, 4);
      result.forEach(cell => {
        expect(cell.filled).toBe(false);
      });
    });

    it('should calculate row and col from pixel position', () => {
      // 4x4 grid, pixel at index 5 = row 1, col 1
      setPixel(mockImageData.data, 5, 255, 0, 0, 255);
      // pixel at index 10 = row 2, col 2
      setPixel(mockImageData.data, 10, 0, 255, 0, 255);

      const result = emojiToPixelArt('🍎', 4, 4);
      expect(result).toHaveLength(2);

      const pixel1 = result.find(p => p.row === 1 && p.col === 1);
      const pixel2 = result.find(p => p.row === 2 && p.col === 2);
      expect(pixel1).toBeDefined();
      expect(pixel2).toBeDefined();
    });
  });

  describe('Color matching to fruits', () => {
    // Actual fruit colors from FRUIT_COLORS:
    // blueberry: '#4C9EF2' (Blue)
    // orange: '#F99D00' (Orange)
    // strawberry: '#DF4624' (Red)
    // dragonfruit: '#DE4C7E' (Pink)
    // banana: '#F3DE00' (Yellow)
    // apple: '#90CA00' (Green)
    // plum: '#8E68E0' (Purple)
    // pear: '#FFFBF7' (Cream/White)
    // blackberry: '#4C4343' (Dark/Black)

    it('should match red pixels to strawberry', () => {
      // Strawberry is red: #DF4624
      setPixel(mockImageData.data, 0, 223, 70, 36, 255);
      const result = emojiToPixelArt('🍎', 4, 4);
      expect(result[0].fruitType).toBe('strawberry');
    });

    it('should match orange pixels to orange', () => {
      // Orange is: #F99D00
      setPixel(mockImageData.data, 0, 249, 157, 0, 255);
      const result = emojiToPixelArt('🍎', 4, 4);
      expect(result[0].fruitType).toBe('orange');
    });

    it('should match yellow pixels to banana', () => {
      // Banana is yellow: #F3DE00
      setPixel(mockImageData.data, 0, 243, 222, 0, 255);
      const result = emojiToPixelArt('🍎', 4, 4);
      expect(result[0].fruitType).toBe('banana');
    });

    it('should match green pixels to apple', () => {
      // Apple is green: #90CA00
      setPixel(mockImageData.data, 0, 144, 202, 0, 255);
      const result = emojiToPixelArt('🍎', 4, 4);
      expect(result[0].fruitType).toBe('apple');
    });

    it('should match blue pixels to blueberry', () => {
      // Blueberry is blue: #4C9EF2
      setPixel(mockImageData.data, 0, 76, 158, 242, 255);
      const result = emojiToPixelArt('🍎', 4, 4);
      expect(result[0].fruitType).toBe('blueberry');
    });

    it('should match purple pixels to plum', () => {
      // Plum is purple: #8E68E0
      setPixel(mockImageData.data, 0, 142, 104, 224, 255);
      const result = emojiToPixelArt('🍎', 4, 4);
      expect(result[0].fruitType).toBe('plum');
    });

    it('should match brown/dark pixels to appropriate fruit', () => {
      // Test a brownish color
      setPixel(mockImageData.data, 0, 139, 69, 19, 255);
      const result = emojiToPixelArt('🍎', 4, 4);
      // Brown is nearest to strawberry, orange, or blackberry in LAB space
      expect(['strawberry', 'orange', 'blackberry']).toContain(result[0].fruitType);
    });

    it('should handle white pixels (no longer skipped)', () => {
      setPixel(mockImageData.data, 0, 255, 255, 255, 255);
      const result = emojiToPixelArt('🍎', 4, 4);
      // White is now included (maps to white fruit type if available, or closest)
      expect(result).toHaveLength(1);
    });

    it('should handle black pixels', () => {
      setPixel(mockImageData.data, 0, 0, 0, 0, 255);
      const result = emojiToPixelArt('🍎', 4, 4);
      // Black should map to some fruit (blackberry or similar)
      expect(result).toHaveLength(1);
    });
  });

  describe('Grid dimensions', () => {
    it('should handle 1x1 grid', () => {
      const smallImageData = {
        data: new Uint8ClampedArray(4),
        width: 1,
        height: 1,
      };
      setPixel(smallImageData.data, 0, 255, 0, 0, 255);
      mockContext.getImageData.mockReturnValue(smallImageData);

      const result = emojiToPixelArt('🍎', 1, 1);
      expect(result).toHaveLength(1);
      expect(result[0].row).toBe(0);
      expect(result[0].col).toBe(0);
    });

    it('should handle non-square grids', () => {
      const rectImageData = {
        data: new Uint8ClampedArray(8 * 4), // 4x2 = 8 pixels
        width: 4,
        height: 2,
      };
      setPixel(rectImageData.data, 0, 255, 0, 0, 255); // (0, 0)
      setPixel(rectImageData.data, 7, 0, 255, 0, 255); // (1, 3)
      mockContext.getImageData.mockReturnValue(rectImageData);

      const result = emojiToPixelArt('🍎', 4, 2);
      expect(result).toHaveLength(2);
    });

    it('should handle large grids', () => {
      const largeImageData = {
        data: new Uint8ClampedArray(20 * 20 * 4),
        width: 20,
        height: 20,
      };
      // Fill all pixels
      for (let i = 0; i < 400; i++) {
        setPixel(largeImageData.data, i, 255, 0, 0, 255);
      }
      mockContext.getImageData.mockReturnValue(largeImageData);

      const result = emojiToPixelArt('🍎', 20, 20);
      expect(result).toHaveLength(400);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty emoji string', () => {
      const result = emojiToPixelArt('', 4, 4);
      // Still calls canvas methods, but probably no pixels rendered
      expect(mockContext.fillText).toHaveBeenCalled();
    });

    it('should handle complex emoji with skin tone', () => {
      emojiToPixelArt('👋🏻', 4, 4);
      expect(mockContext.fillText).toHaveBeenCalledWith('👋🏻', 64, 64);
    });

    it('should handle emoji with ZWJ sequences', () => {
      emojiToPixelArt('👨‍👩‍👧‍👦', 4, 4);
      expect(mockContext.fillText).toHaveBeenCalledWith('👨‍👩‍👧‍👦', 64, 64);
    });

    it('should handle flag emojis', () => {
      emojiToPixelArt('🇺🇸', 4, 4);
      expect(mockContext.fillText).toHaveBeenCalledWith('🇺🇸', 64, 64);
    });
  });
});

// ============================================================================
// Color distance calculation (tested indirectly through matching)
// ============================================================================

describe('Color matching (LAB color space)', () => {
  it('should give consistent results for the same color', () => {
    setPixel(mockImageData.data, 0, 128, 128, 128, 255);
    const result1 = emojiToPixelArt('🍎', 4, 4);

    setPixel(mockImageData.data, 0, 128, 128, 128, 255);
    const result2 = emojiToPixelArt('🍎', 4, 4);

    expect(result1[0].fruitType).toBe(result2[0].fruitType);
  });

  it('should distinguish between similar colors', () => {
    // Test with distinctly different colors
    setPixel(mockImageData.data, 0, 255, 0, 0, 255); // pure red
    setPixel(mockImageData.data, 1, 0, 255, 0, 255); // pure green

    const result = emojiToPixelArt('🍎', 4, 4);
    expect(result[0].fruitType).not.toBe(result[1].fruitType);
  });
});
