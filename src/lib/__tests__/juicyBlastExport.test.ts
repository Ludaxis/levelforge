import { describe, it, expect } from 'vitest';
import {
  isReferenceFormat,
  importFromReferenceFormat,
  exportToReferenceFormat,
  COLOR_TYPE_TO_HEX,
  FRUIT_TO_COLOR_TYPE,
  COLOR_TYPE_TO_FRUIT,
  DIFFICULTY_TO_NUMBER,
  NUMBER_TO_DIFFICULTY,
  hexToColorType,
  ReferenceLevel,
} from '../juicyBlastExport';
import { FruitType, DifficultyTier, PixelCell } from '@/types/fruitMatch';
import { createTestPixelArt } from './helpers/fruitMatchTestHelpers';

// ============================================================================
// Color Type Mapping
// ============================================================================

describe('Color Type Mapping', () => {
  describe('COLOR_TYPE_TO_HEX', () => {
    it('should have 9 color types (0-8)', () => {
      expect(Object.keys(COLOR_TYPE_TO_HEX)).toHaveLength(9);
    });

    it('should have valid hex colors', () => {
      for (const [, hex] of Object.entries(COLOR_TYPE_TO_HEX)) {
        expect(hex).toMatch(/^[0-9A-Fa-f]{6}$/);
      }
    });
  });

  describe('FRUIT_TO_COLOR_TYPE', () => {
    it('should map all fruit types to color types 0-8', () => {
      const fruits: FruitType[] = ['blueberry', 'orange', 'strawberry', 'dragonfruit', 'banana', 'apple', 'plum', 'pear', 'blackberry'];
      for (const fruit of fruits) {
        const colorType = FRUIT_TO_COLOR_TYPE[fruit];
        expect(colorType).toBeGreaterThanOrEqual(0);
        expect(colorType).toBeLessThanOrEqual(8);
      }
    });

    it('should map blueberry to 0 (Blue)', () => {
      expect(FRUIT_TO_COLOR_TYPE.blueberry).toBe(0);
    });

    it('should map orange to 1', () => {
      expect(FRUIT_TO_COLOR_TYPE.orange).toBe(1);
    });

    it('should map strawberry to 2 (Red)', () => {
      expect(FRUIT_TO_COLOR_TYPE.strawberry).toBe(2);
    });

    it('should map apple to 5 (Green)', () => {
      expect(FRUIT_TO_COLOR_TYPE.apple).toBe(5);
    });

    it('should map blackberry to 8 (Black)', () => {
      expect(FRUIT_TO_COLOR_TYPE.blackberry).toBe(8);
    });
  });

  describe('COLOR_TYPE_TO_FRUIT', () => {
    it('should be inverse of FRUIT_TO_COLOR_TYPE', () => {
      const fruits: FruitType[] = ['blueberry', 'orange', 'strawberry', 'dragonfruit', 'banana', 'apple', 'plum', 'pear', 'blackberry'];
      for (const fruit of fruits) {
        const colorType = FRUIT_TO_COLOR_TYPE[fruit];
        expect(COLOR_TYPE_TO_FRUIT[colorType]).toBe(fruit);
      }
    });
  });

  describe('hexToColorType', () => {
    it('should return exact match for standard colors', () => {
      expect(hexToColorType('4C9EF2')).toBe(0); // Blue
      expect(hexToColorType('F99D00')).toBe(1); // Orange
      expect(hexToColorType('DF4624')).toBe(2); // Red
    });

    it('should handle colors with hash prefix', () => {
      expect(hexToColorType('#4C9EF2')).toBe(0);
    });

    it('should find closest color for non-exact match', () => {
      // Pure red should match strawberry (red)
      const result = hexToColorType('FF0000');
      expect(result).toBe(2); // Should be close to red (strawberry)
    });

    it('should handle lowercase hex', () => {
      expect(hexToColorType('4c9ef2')).toBe(0);
    });
  });
});

// ============================================================================
// Difficulty Mapping
// ============================================================================

describe('Difficulty Mapping', () => {
  describe('DIFFICULTY_TO_NUMBER', () => {
    it('should map all difficulty tiers', () => {
      expect(DIFFICULTY_TO_NUMBER.trivial).toBe(1);
      expect(DIFFICULTY_TO_NUMBER.easy).toBe(2);
      expect(DIFFICULTY_TO_NUMBER.medium).toBe(3);
      expect(DIFFICULTY_TO_NUMBER.hard).toBe(4);
      expect(DIFFICULTY_TO_NUMBER.expert).toBe(5);
      expect(DIFFICULTY_TO_NUMBER.nightmare).toBe(6);
    });
  });

  describe('NUMBER_TO_DIFFICULTY', () => {
    it('should be inverse of DIFFICULTY_TO_NUMBER', () => {
      const tiers: DifficultyTier[] = ['trivial', 'easy', 'medium', 'hard', 'expert', 'nightmare'];
      for (const tier of tiers) {
        const num = DIFFICULTY_TO_NUMBER[tier];
        expect(NUMBER_TO_DIFFICULTY[num]).toBe(tier);
      }
    });
  });
});

// ============================================================================
// Format Detection
// ============================================================================

describe('Format Detection', () => {
  describe('isReferenceFormat', () => {
    it('should return true for valid reference format', () => {
      const data: ReferenceLevel = {
        LevelId: 'test',
        SongId: 'song',
        LevelIndex: 1,
        LevelVariant: 0,
        Difficulty: 2,
        GraphicId: 'graphic',
        Artwork: {
          Width: 10,
          Height: 10,
          PixelData: [],
        },
        SelectableItems: [],
        Requirements: [],
        UnlockStageData: [],
      };
      expect(isReferenceFormat(data)).toBe(true);
    });

    it('should return false for null', () => {
      expect(isReferenceFormat(null)).toBe(false);
    });

    it('should return false for non-object', () => {
      expect(isReferenceFormat('string')).toBe(false);
      expect(isReferenceFormat(123)).toBe(false);
    });

    it('should return false without Artwork', () => {
      expect(isReferenceFormat({ SelectableItems: [] })).toBe(false);
    });

    it('should return false without SelectableItems', () => {
      expect(isReferenceFormat({ Artwork: { Width: 10, Height: 10, PixelData: [] } })).toBe(false);
    });

    it('should return false without PixelData in Artwork', () => {
      expect(isReferenceFormat({ Artwork: { Width: 10, Height: 10 }, SelectableItems: [] })).toBe(false);
    });
  });
});

// ============================================================================
// Import from Reference Format
// ============================================================================

describe('Import from Reference Format', () => {
  const createMinimalRefLevel = (pixelData: Array<{ Position: { x: number; y: number }; ColorType: number; Group: number; ColorHex: string }>): ReferenceLevel => ({
    LevelId: 'test-level',
    SongId: 'song_001',
    LevelIndex: 1,
    LevelVariant: 0,
    Difficulty: 2,
    GraphicId: 'graphic_test',
    Artwork: {
      Width: 10,
      Height: 10,
      PixelData: pixelData,
    },
    SelectableItems: pixelData.map(p => ({ ColorType: p.ColorType, Layer: 0 })),
    Requirements: [],
    UnlockStageData: [],
  });

  describe('Basic pixel conversion', () => {
    it('should convert pixel positions with Y-axis flip', () => {
      const refLevel = createMinimalRefLevel([
        { Position: { x: 0, y: 9 }, ColorType: 5, Group: 1, ColorHex: '90CA00' }, // y=9 at bottom -> row=0 at top
      ]);

      const imported = importFromReferenceFormat(refLevel);
      const pixel = imported.pixelArt[0];

      expect(pixel.row).toBe(0); // Flipped from y=9 in height=10
      expect(pixel.col).toBe(0);
    });

    it('should convert ColorType to FruitType', () => {
      const refLevel = createMinimalRefLevel([
        { Position: { x: 0, y: 0 }, ColorType: 0, Group: 1, ColorHex: '4C9EF2' }, // Blue
        { Position: { x: 1, y: 0 }, ColorType: 2, Group: 1, ColorHex: 'DF4624' }, // Red
      ]);

      const imported = importFromReferenceFormat(refLevel);

      expect(imported.pixelArt.find(p => p.col === 0)?.fruitType).toBe('blueberry');
      expect(imported.pixelArt.find(p => p.col === 1)?.fruitType).toBe('strawberry');
    });

    it('should preserve group IDs', () => {
      const refLevel = createMinimalRefLevel([
        { Position: { x: 0, y: 0 }, ColorType: 5, Group: 3, ColorHex: '90CA00' },
      ]);

      const imported = importFromReferenceFormat(refLevel);
      expect(imported.pixelArt[0].groupId).toBe(3);
    });
  });

  describe('Metadata conversion', () => {
    it('should convert level ID', () => {
      const refLevel = createMinimalRefLevel([]);
      refLevel.LevelId = 'my_custom_level';

      const imported = importFromReferenceFormat(refLevel);
      expect(imported.levelId).toBe('my_custom_level');
    });

    it('should convert difficulty number to tier', () => {
      const refLevel = createMinimalRefLevel([]);
      refLevel.Difficulty = 4; // hard

      const imported = importFromReferenceFormat(refLevel);
      expect(imported.difficulty).toBe('hard');
    });

    it('should convert artwork dimensions', () => {
      const refLevel = createMinimalRefLevel([]);
      refLevel.Artwork.Width = 15;
      refLevel.Artwork.Height = 20;

      const imported = importFromReferenceFormat(refLevel);
      expect(imported.pixelArtWidth).toBe(15);
      expect(imported.pixelArtHeight).toBe(20);
    });
  });

  describe('Color data preservation', () => {
    it('should store raw color data for round-trip', () => {
      const refLevel = createMinimalRefLevel([
        { Position: { x: 5, y: 7 }, ColorType: 3, Group: 2, ColorHex: 'DE4C7E' },
      ]);

      const imported = importFromReferenceFormat(refLevel);
      const key = `${10 - 1 - 7},5`; // Flipped row, col
      const colorData = imported.colorData.get(key);

      expect(colorData?.colorType).toBe(3);
      expect(colorData?.colorHex).toBe('DE4C7E');
      expect(colorData?.group).toBe(2);
    });
  });

  describe('Launcher order config generation', () => {
    it('should create groups from pixel data', () => {
      const refLevel = createMinimalRefLevel([
        { Position: { x: 0, y: 0 }, ColorType: 5, Group: 1, ColorHex: '90CA00' },
        { Position: { x: 1, y: 0 }, ColorType: 5, Group: 2, ColorHex: '90CA00' },
      ]);

      const imported = importFromReferenceFormat(refLevel);
      expect(imported.launcherOrderConfig?.groups).toHaveLength(2);
    });

    it('should generate launchers for each group/color combination', () => {
      const refLevel = createMinimalRefLevel([
        { Position: { x: 0, y: 0 }, ColorType: 5, Group: 1, ColorHex: '90CA00' },
        { Position: { x: 1, y: 0 }, ColorType: 5, Group: 1, ColorHex: '90CA00' },
        { Position: { x: 2, y: 0 }, ColorType: 5, Group: 1, ColorHex: '90CA00' },
      ]);

      const imported = importFromReferenceFormat(refLevel);
      expect(imported.launcherOrderConfig?.launchers.length).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// Export to Reference Format
// ============================================================================

describe('Export to Reference Format', () => {
  describe('Basic pixel conversion', () => {
    it('should flip Y coordinates back', () => {
      const pixelArt: PixelCell[] = [
        { row: 0, col: 0, fruitType: 'apple', filled: false },
      ];

      const exported = exportToReferenceFormat({
        levelIndex: 1,
        difficulty: 'easy',
        pixelArtWidth: 10,
        pixelArtHeight: 10,
        pixelArt,
      });

      // row=0 should become y=9 (height-1-row)
      expect(exported.Artwork.PixelData[0].Position.y).toBe(9);
    });

    it('should convert FruitType to ColorType', () => {
      const pixelArt: PixelCell[] = [
        { row: 0, col: 0, fruitType: 'blueberry', filled: false },
        { row: 0, col: 1, fruitType: 'strawberry', filled: false },
      ];

      const exported = exportToReferenceFormat({
        levelIndex: 1,
        difficulty: 'easy',
        pixelArtWidth: 10,
        pixelArtHeight: 10,
        pixelArt,
      });

      expect(exported.Artwork.PixelData[0].ColorType).toBe(0); // Blue
      expect(exported.Artwork.PixelData[1].ColorType).toBe(2); // Red
    });

    it('should use correct ColorHex from mapping', () => {
      const pixelArt: PixelCell[] = [
        { row: 0, col: 0, fruitType: 'apple', filled: false },
      ];

      const exported = exportToReferenceFormat({
        levelIndex: 1,
        difficulty: 'easy',
        pixelArtWidth: 10,
        pixelArtHeight: 10,
        pixelArt,
      });

      expect(exported.Artwork.PixelData[0].ColorHex).toBe('90CA00'); // Green
    });
  });

  describe('Metadata generation', () => {
    it('should set LevelId from input or generate default', () => {
      const exported = exportToReferenceFormat({
        levelId: 'my_level',
        levelIndex: 5,
        difficulty: 'medium',
        pixelArtWidth: 10,
        pixelArtHeight: 10,
        pixelArt: [],
      });

      expect(exported.LevelId).toBe('my_level');
    });

    it('should generate default LevelId from index', () => {
      const exported = exportToReferenceFormat({
        levelIndex: 5,
        difficulty: 'medium',
        pixelArtWidth: 10,
        pixelArtHeight: 10,
        pixelArt: [],
      });

      expect(exported.LevelId).toBe('level_005');
    });

    it('should convert difficulty to number', () => {
      const exported = exportToReferenceFormat({
        levelIndex: 1,
        difficulty: 'expert',
        pixelArtWidth: 10,
        pixelArtHeight: 10,
        pixelArt: [],
      });

      expect(exported.Difficulty).toBe(5);
    });
  });

  describe('Requirements generation', () => {
    it('should generate requirements by color and group', () => {
      const pixelArt: PixelCell[] = [
        { row: 0, col: 0, fruitType: 'apple', filled: false, groupId: 1 },
        { row: 0, col: 1, fruitType: 'apple', filled: false, groupId: 1 },
        { row: 0, col: 2, fruitType: 'orange', filled: false, groupId: 1 },
      ];

      const exported = exportToReferenceFormat({
        levelIndex: 1,
        difficulty: 'easy',
        pixelArtWidth: 10,
        pixelArtHeight: 10,
        pixelArt,
      });

      const appleReq = exported.Requirements.find(r => r.ColorType === 5);
      const orangeReq = exported.Requirements.find(r => r.ColorType === 1);

      expect(appleReq?.Value).toBe(2);
      expect(orangeReq?.Value).toBe(1);
    });
  });

  describe('SelectableItems generation', () => {
    it('should create one SelectableItem per pixel', () => {
      const pixelArt = createTestPixelArt([['apple', 'orange', 'banana']]);

      const exported = exportToReferenceFormat({
        levelIndex: 1,
        difficulty: 'easy',
        pixelArtWidth: 3,
        pixelArtHeight: 1,
        pixelArt,
      });

      expect(exported.SelectableItems).toHaveLength(3);
    });

    it('should set Layer to 0', () => {
      const pixelArt = createTestPixelArt([['apple']]);

      const exported = exportToReferenceFormat({
        levelIndex: 1,
        difficulty: 'easy',
        pixelArtWidth: 1,
        pixelArtHeight: 1,
        pixelArt,
      });

      expect(exported.SelectableItems[0].Layer).toBe(0);
    });
  });

  describe('Group assignment', () => {
    it('should preserve explicit groupId from pixels', () => {
      const pixelArt: PixelCell[] = [
        { row: 0, col: 0, fruitType: 'apple', filled: false, groupId: 5 },
      ];

      const exported = exportToReferenceFormat({
        levelIndex: 1,
        difficulty: 'easy',
        pixelArtWidth: 10,
        pixelArtHeight: 10,
        pixelArt,
      });

      expect(exported.Artwork.PixelData[0].Group).toBe(5);
    });

    it('should auto-assign groups by color when no explicit groupId', () => {
      const pixelArt: PixelCell[] = [
        { row: 0, col: 0, fruitType: 'apple', filled: false },
        { row: 0, col: 1, fruitType: 'apple', filled: false },
        { row: 0, col: 2, fruitType: 'orange', filled: false },
      ];

      const exported = exportToReferenceFormat({
        levelIndex: 1,
        difficulty: 'easy',
        pixelArtWidth: 10,
        pixelArtHeight: 10,
        pixelArt,
      });

      // Same color should have same group
      const applePixels = exported.Artwork.PixelData.filter(p => p.ColorType === 5);
      expect(applePixels[0].Group).toBe(applePixels[1].Group);

      // Different colors should have different groups
      const orangePixel = exported.Artwork.PixelData.find(p => p.ColorType === 1);
      expect(orangePixel?.Group).not.toBe(applePixels[0].Group);
    });
  });

  describe('Preserved color data round-trip', () => {
    it('should use preserved colorData when available', () => {
      const colorData = new Map<string, { colorType: number; colorHex: string; group: number }>();
      colorData.set('0,0', { colorType: 5, colorHex: 'CUSTOM1', group: 99 });

      const pixelArt: PixelCell[] = [
        { row: 0, col: 0, fruitType: 'apple', filled: false },
      ];

      const exported = exportToReferenceFormat({
        levelIndex: 1,
        difficulty: 'easy',
        pixelArtWidth: 10,
        pixelArtHeight: 10,
        pixelArt,
        colorData,
      });

      expect(exported.Artwork.PixelData[0].ColorHex).toBe('CUSTOM1');
      expect(exported.Artwork.PixelData[0].Group).toBe(99);
    });
  });
});

// ============================================================================
// Round-trip Tests
// ============================================================================

describe('Round-trip Tests', () => {
  it('should preserve pixel positions', () => {
    const refLevel: ReferenceLevel = {
      LevelId: 'test',
      SongId: 'song',
      LevelIndex: 1,
      LevelVariant: 0,
      Difficulty: 2,
      GraphicId: 'graphic',
      Artwork: {
        Width: 5,
        Height: 5,
        PixelData: [
          { Position: { x: 2, y: 3 }, ColorType: 5, Group: 1, ColorHex: '90CA00' },
        ],
      },
      SelectableItems: [{ ColorType: 5, Layer: 0 }],
      Requirements: [{ ColorType: 5, Value: 1, Group: 1 }],
      UnlockStageData: [{ RequiredCompletedGroups: [1] }],
    };

    const imported = importFromReferenceFormat(refLevel);
    const exported = exportToReferenceFormat({
      levelId: imported.levelId,
      levelIndex: imported.levelIndex,
      difficulty: imported.difficulty,
      pixelArtWidth: imported.pixelArtWidth,
      pixelArtHeight: imported.pixelArtHeight,
      pixelArt: imported.pixelArt,
      colorData: imported.colorData,
    });

    expect(exported.Artwork.PixelData[0].Position).toEqual({ x: 2, y: 3 });
  });

  it('should preserve level metadata', () => {
    const refLevel: ReferenceLevel = {
      LevelId: 'round_trip_test',
      SongId: 'song_001',
      LevelIndex: 42,
      LevelVariant: 0,
      Difficulty: 4,
      GraphicId: 'graphic_test',
      Artwork: {
        Width: 10,
        Height: 10,
        PixelData: [],
      },
      SelectableItems: [],
      Requirements: [],
      UnlockStageData: [],
    };

    const imported = importFromReferenceFormat(refLevel);
    const exported = exportToReferenceFormat({
      levelId: imported.levelId,
      levelIndex: imported.levelIndex,
      difficulty: imported.difficulty,
      pixelArtWidth: imported.pixelArtWidth,
      pixelArtHeight: imported.pixelArtHeight,
      pixelArt: imported.pixelArt,
    });

    expect(exported.LevelId).toBe('round_trip_test');
    expect(exported.LevelIndex).toBe(42);
    expect(exported.Difficulty).toBe(4);
  });
});
