import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  migrateFruitType,
  createBlankPixelArt,
  getUnfilledPixels,
  getRequiredFruitCounts,
  findNextUnfilledPixel,
  fillPixel,
  fillMultiplePixels,
  getTopTile,
  removeTileFromStack,
  calculateMatchesNeeded,
  breakdownIntoCapacities,
  generateLauncherQueue,
  createInitialLaunchers,
  shiftLaunchers,
  hasMatchingTriplet,
  canMatchAnyLauncher,
  removeMatchingTriplet,
  checkGameOver,
  calculateLevelMetrics,
  emojiPatternToPixelArt,
} from '../fruitMatchUtils';
import {
  FruitType,
  PixelCell,
  SinkTile,
  Launcher,
  LauncherCapacity,
  ALL_FRUITS,
  generateTileId,
  generateLauncherId,
} from '@/types/fruitMatch';
import {
  createTestPixel,
  createTestPixelArt,
  createTestTile,
  createTestSinkStack,
  createTestLauncher,
  createTestLauncherConfig,
} from './helpers/fruitMatchTestHelpers';

// ============================================================================
// Fruit Type Migration
// ============================================================================

describe('Fruit Type Migration', () => {
  describe('migrateFruitType', () => {
    it('should pass through current fruit types unchanged', () => {
      expect(migrateFruitType('blueberry')).toBe('blueberry');
      expect(migrateFruitType('orange')).toBe('orange');
      expect(migrateFruitType('strawberry')).toBe('strawberry');
      expect(migrateFruitType('apple')).toBe('apple');
      expect(migrateFruitType('plum')).toBe('plum');
      expect(migrateFruitType('pear')).toBe('pear');
      expect(migrateFruitType('blackberry')).toBe('blackberry');
    });

    it('should migrate old fruit types to new ones', () => {
      expect(migrateFruitType('cherry')).toBe('strawberry');
      expect(migrateFruitType('grape')).toBe('plum');
      expect(migrateFruitType('lemon')).toBe('banana');
      expect(migrateFruitType('kiwi')).toBe('apple');
      expect(migrateFruitType('white')).toBe('pear');
      expect(migrateFruitType('black')).toBe('blackberry');
    });

    it('should return apple as fallback for unknown types', () => {
      expect(migrateFruitType('unknown')).toBe('apple');
      expect(migrateFruitType('')).toBe('apple');
    });
  });
});

// ============================================================================
// Pixel Art Helpers
// ============================================================================

describe('Pixel Art Helpers', () => {
  describe('createBlankPixelArt', () => {
    it('should create correct number of cells', () => {
      const cells = createBlankPixelArt(4, 3);
      expect(cells).toHaveLength(12);
    });

    it('should set default fruit type to apple', () => {
      const cells = createBlankPixelArt(2, 2);
      for (const cell of cells) {
        expect(cell.fruitType).toBe('apple');
      }
    });

    it('should set filled to false', () => {
      const cells = createBlankPixelArt(2, 2);
      for (const cell of cells) {
        expect(cell.filled).toBe(false);
      }
    });

    it('should create cells in row-major order', () => {
      // createBlankPixelArt(width=2, height=3) creates a 3-row, 2-column grid
      // Index order: (0,0), (0,1), (1,0), (1,1), (2,0), (2,1)
      const cells = createBlankPixelArt(2, 3);
      expect(cells[0]).toEqual({ row: 0, col: 0, fruitType: 'apple', filled: false });
      expect(cells[5]).toEqual({ row: 2, col: 1, fruitType: 'apple', filled: false });
    });
  });

  describe('getUnfilledPixels', () => {
    it('should return only unfilled pixels', () => {
      const pixelArt = [
        createTestPixel(0, 0, 'apple', { filled: false }),
        createTestPixel(0, 1, 'orange', { filled: true }),
        createTestPixel(1, 0, 'banana', { filled: false }),
      ];
      const unfilled = getUnfilledPixels(pixelArt);
      expect(unfilled).toHaveLength(2);
      expect(unfilled.every(p => !p.filled)).toBe(true);
    });

    it('should return empty array when all filled', () => {
      const pixelArt = [
        createTestPixel(0, 0, 'apple', { filled: true }),
        createTestPixel(0, 1, 'orange', { filled: true }),
      ];
      expect(getUnfilledPixels(pixelArt)).toHaveLength(0);
    });
  });

  describe('getRequiredFruitCounts', () => {
    it('should count unfilled pixels by fruit type', () => {
      const pixelArt = createTestPixelArt([
        ['apple', 'apple', 'orange'],
        ['orange', 'banana', 'apple'],
      ]);
      const counts = getRequiredFruitCounts(pixelArt);
      expect(counts.apple).toBe(3);
      expect(counts.orange).toBe(2);
      expect(counts.banana).toBe(1);
    });

    it('should not count filled pixels', () => {
      const pixelArt = [
        createTestPixel(0, 0, 'apple', { filled: false }),
        createTestPixel(0, 1, 'apple', { filled: true }),
      ];
      const counts = getRequiredFruitCounts(pixelArt);
      expect(counts.apple).toBe(1);
    });

    it('should initialize all fruit types to 0', () => {
      const counts = getRequiredFruitCounts([]);
      for (const fruit of ALL_FRUITS) {
        expect(counts[fruit]).toBe(0);
      }
    });
  });

  describe('findNextUnfilledPixel', () => {
    it('should find first unfilled pixel of given type', () => {
      const pixelArt = createTestPixelArt([
        ['orange', 'apple'],
        ['apple', 'orange'],
      ]);
      const pixel = findNextUnfilledPixel(pixelArt, 'apple');
      expect(pixel).not.toBeNull();
      expect(pixel!.row).toBe(0);
      expect(pixel!.col).toBe(1);
    });

    it('should return null if no unfilled pixel of type exists', () => {
      const pixelArt = [createTestPixel(0, 0, 'apple', { filled: true })];
      const pixel = findNextUnfilledPixel(pixelArt, 'apple');
      expect(pixel).toBeNull();
    });
  });

  describe('fillPixel', () => {
    it('should mark specified pixel as filled', () => {
      const pixelArt = createTestPixelArt([['apple', 'orange']]);
      const updated = fillPixel(pixelArt, 0, 0);
      expect(updated[0].filled).toBe(true);
      expect(updated[1].filled).toBe(false);
    });

    it('should not mutate original array', () => {
      const pixelArt = createTestPixelArt([['apple']]);
      fillPixel(pixelArt, 0, 0);
      expect(pixelArt[0].filled).toBe(false);
    });
  });

  describe('fillMultiplePixels', () => {
    it('should fill up to capacity pixels of given type', () => {
      const pixelArt = createTestPixelArt([
        ['apple', 'apple', 'apple', 'apple', 'apple'],
      ]);
      const { updatedPixelArt, filledCells } = fillMultiplePixels(pixelArt, 'apple', 3);

      expect(filledCells).toHaveLength(3);
      expect(updatedPixelArt.filter(p => p.filled)).toHaveLength(3);
    });

    it('should fill only available pixels if less than capacity', () => {
      const pixelArt = createTestPixelArt([['apple', 'apple']]);
      const { filledCells } = fillMultiplePixels(pixelArt, 'apple', 5);
      expect(filledCells).toHaveLength(2);
    });

    it('should not fill pixels of different type', () => {
      const pixelArt = createTestPixelArt([['apple', 'orange', 'apple']]);
      const { updatedPixelArt } = fillMultiplePixels(pixelArt, 'apple', 3);
      const orangePixel = updatedPixelArt.find(p => p.fruitType === 'orange');
      expect(orangePixel!.filled).toBe(false);
    });
  });
});

// ============================================================================
// Sink Helpers
// ============================================================================

describe('Sink Helpers', () => {
  describe('getTopTile', () => {
    it('should return tile with lowest stack index', () => {
      const stack = [
        createTestTile('apple', 0, 2),
        createTestTile('orange', 0, 0),
        createTestTile('banana', 0, 1),
      ];
      const top = getTopTile(stack);
      expect(top!.fruitType).toBe('orange');
      expect(top!.stackIndex).toBe(0);
    });

    it('should return null for empty stack', () => {
      expect(getTopTile([])).toBeNull();
    });
  });

  describe('removeTileFromStack', () => {
    it('should remove tile by ID', () => {
      const stack = [
        { id: 'tile-1', fruitType: 'apple' as FruitType, stackIndex: 0, position: 0 },
        { id: 'tile-2', fruitType: 'orange' as FruitType, stackIndex: 1, position: 0 },
      ];
      const updated = removeTileFromStack(stack, 'tile-1');
      expect(updated).toHaveLength(1);
      expect(updated[0].id).toBe('tile-2');
    });

    it('should update stack indices after removal', () => {
      const stack = [
        { id: 'tile-1', fruitType: 'apple' as FruitType, stackIndex: 0, position: 0 },
        { id: 'tile-2', fruitType: 'orange' as FruitType, stackIndex: 1, position: 0 },
        { id: 'tile-3', fruitType: 'banana' as FruitType, stackIndex: 2, position: 0 },
      ];
      const updated = removeTileFromStack(stack, 'tile-1');
      expect(updated[0].stackIndex).toBe(0); // Was 1, now 0
      expect(updated[1].stackIndex).toBe(1); // Was 2, now 1
    });

    it('should return unchanged stack if tile not found', () => {
      const stack = [createTestTile('apple', 0, 0)];
      const updated = removeTileFromStack(stack, 'non-existent');
      expect(updated).toEqual(stack);
    });
  });

  describe('calculateMatchesNeeded', () => {
    it('should calculate matches based on pixel counts', () => {
      const fruitCounts = {
        apple: 60, // Needs 1 launcher of capacity 60
        orange: 100, // Needs 1 launcher of capacity 100
        strawberry: 0,
        dragonfruit: 0,
        banana: 0,
        blueberry: 0,
        plum: 0,
        pear: 0,
        blackberry: 0,
      };
      const matches = calculateMatchesNeeded(fruitCounts);
      expect(matches.apple).toBe(1);
      expect(matches.orange).toBe(1);
    });

    it('should break down large counts into multiple matches', () => {
      const fruitCounts = {
        apple: 150, // Needs 100 + 40 + 20 = 3 launchers
        orange: 0,
        strawberry: 0,
        dragonfruit: 0,
        banana: 0,
        blueberry: 0,
        plum: 0,
        pear: 0,
        blackberry: 0,
      };
      const matches = calculateMatchesNeeded(fruitCounts);
      expect(matches.apple).toBeGreaterThanOrEqual(2);
    });
  });
});

// ============================================================================
// Launcher Helpers
// ============================================================================

describe('Launcher Helpers', () => {
  describe('breakdownIntoCapacities', () => {
    it('should use largest capacities first', () => {
      const capacities = breakdownIntoCapacities(100);
      expect(capacities).toEqual([100]);
    });

    it('should break down into multiple capacities', () => {
      const capacities = breakdownIntoCapacities(140);
      expect(capacities).toEqual([100, 40]);
    });

    it('should add minimum capacity for remainder', () => {
      const capacities = breakdownIntoCapacities(15);
      expect(capacities).toEqual([20]); // 15 < 20, so use 20
    });

    it('should handle exact capacity boundaries', () => {
      const capacities = breakdownIntoCapacities(60);
      expect(capacities).toEqual([60]);
    });
  });

  describe('generateLauncherQueue', () => {
    it('should generate configs for all fruit types needed', () => {
      const pixelArt = createTestPixelArt([
        ['apple', 'apple'],
        ['orange', 'orange'],
      ]);
      const queue = generateLauncherQueue(pixelArt);

      const appleConfigs = queue.filter(c => c.fruitType === 'apple');
      const orangeConfigs = queue.filter(c => c.fruitType === 'orange');

      expect(appleConfigs.length).toBeGreaterThan(0);
      expect(orangeConfigs.length).toBeGreaterThan(0);
    });

    it('should use manual order when config provided', () => {
      const pixelArt = createTestPixelArt([['apple']]);
      const launcherOrderConfig = {
        mode: 'manual' as const,
        groups: [],
        launchers: [
          { id: 'l1', fruitType: 'orange' as FruitType, capacity: 20 as LauncherCapacity, groupId: 1, orderIndex: 0 },
          { id: 'l2', fruitType: 'apple' as FruitType, capacity: 40 as LauncherCapacity, groupId: 1, orderIndex: 1 },
        ],
        unlockStages: [],
      };
      const queue = generateLauncherQueue(pixelArt, launcherOrderConfig);

      expect(queue[0].fruitType).toBe('orange');
      expect(queue[1].fruitType).toBe('apple');
    });
  });

  describe('createInitialLaunchers', () => {
    it('should create up to 4 launchers from queue', () => {
      const queue = [
        createTestLauncherConfig('apple', 20),
        createTestLauncherConfig('orange', 40),
        createTestLauncherConfig('banana', 60),
        createTestLauncherConfig('strawberry', 80),
        createTestLauncherConfig('plum', 100),
      ];
      const { launchers, remainingQueue } = createInitialLaunchers(queue);

      expect(launchers).toHaveLength(4);
      expect(remainingQueue).toHaveLength(1);
    });

    it('should assign positions 0-3', () => {
      const queue = [
        createTestLauncherConfig('apple', 20),
        createTestLauncherConfig('orange', 40),
      ];
      const { launchers } = createInitialLaunchers(queue);

      expect(launchers[0].position).toBe(0);
      expect(launchers[1].position).toBe(1);
    });
  });

  describe('shiftLaunchers', () => {
    it('should remove specified launcher and shift others', () => {
      const launchers = [
        createTestLauncher('apple', 20, 0),
        createTestLauncher('orange', 40, 1),
      ];
      const launcherToRemove = launchers[0].id;
      const queue = [createTestLauncherConfig('banana', 60)];

      const { launchers: updated } = shiftLaunchers(launchers, queue, launcherToRemove);

      expect(updated.find(l => l.id === launcherToRemove)).toBeUndefined();
    });

    it('should add new launcher from queue', () => {
      const launchers = [createTestLauncher('apple', 20, 0)];
      const queue = [createTestLauncherConfig('banana', 60)];

      const { launchers: updated, remainingQueue } = shiftLaunchers(launchers, queue, launchers[0].id);

      expect(updated.some(l => l.requiredFruit === 'banana')).toBe(true);
      expect(remainingQueue).toHaveLength(0);
    });
  });
});

// ============================================================================
// Waiting Stand Helpers
// ============================================================================

describe('Waiting Stand Helpers', () => {
  describe('hasMatchingTriplet', () => {
    it('should return true when 3+ matching tiles exist', () => {
      const waitingStand = [
        createTestTile('apple', 0, 0),
        createTestTile('apple', 0, 1),
        createTestTile('apple', 0, 2),
      ];
      expect(hasMatchingTriplet(waitingStand, 'apple')).toBe(true);
    });

    it('should return false when less than 3 matching', () => {
      const waitingStand = [
        createTestTile('apple', 0, 0),
        createTestTile('apple', 0, 1),
        createTestTile('orange', 0, 2),
      ];
      expect(hasMatchingTriplet(waitingStand, 'apple')).toBe(false);
    });
  });

  describe('canMatchAnyLauncher', () => {
    it('should return matching launcher when triplet exists', () => {
      const waitingStand = [
        createTestTile('apple', 0, 0),
        createTestTile('apple', 0, 1),
        createTestTile('apple', 0, 2),
      ];
      const launchers = [createTestLauncher('apple', 20, 0)];

      const result = canMatchAnyLauncher(waitingStand, launchers);
      expect(result.canMatch).toBe(true);
      expect(result.matchingFruit).toBe('apple');
    });

    it('should return false when no matching triplet', () => {
      const waitingStand = [
        createTestTile('apple', 0, 0),
        createTestTile('orange', 0, 1),
      ];
      const launchers = [createTestLauncher('apple', 20, 0)];

      const result = canMatchAnyLauncher(waitingStand, launchers);
      expect(result.canMatch).toBe(false);
    });
  });

  describe('removeMatchingTriplet', () => {
    it('should remove exactly 3 tiles of given type', () => {
      const waitingStand = [
        createTestTile('apple', 0, 0),
        createTestTile('apple', 0, 1),
        createTestTile('apple', 0, 2),
        createTestTile('apple', 0, 3),
      ];
      const updated = removeMatchingTriplet(waitingStand, 'apple');
      expect(updated).toHaveLength(1);
    });

    it('should not remove tiles of different type', () => {
      const waitingStand = [
        createTestTile('apple', 0, 0),
        createTestTile('apple', 0, 1),
        createTestTile('apple', 0, 2),
        createTestTile('orange', 0, 3),
      ];
      const updated = removeMatchingTriplet(waitingStand, 'apple');
      expect(updated.some(t => t.fruitType === 'orange')).toBe(true);
    });
  });

  describe('checkGameOver', () => {
    it('should return false when waiting stand not full', () => {
      const waitingStand = [createTestTile('apple', 0, 0)];
      const launchers = [createTestLauncher('apple', 20, 0)];

      expect(checkGameOver(waitingStand, 7, launchers)).toBe(false);
    });

    it('should return true when full and no match possible', () => {
      const waitingStand = Array.from({ length: 7 }, (_, i) =>
        createTestTile('orange', 0, i)
      );
      const launchers = [createTestLauncher('apple', 20, 0)];

      expect(checkGameOver(waitingStand, 7, launchers)).toBe(true);
    });

    it('should return false when full but match possible', () => {
      const waitingStand = [
        createTestTile('apple', 0, 0),
        createTestTile('apple', 0, 1),
        createTestTile('apple', 0, 2),
        createTestTile('orange', 0, 3),
        createTestTile('orange', 0, 4),
        createTestTile('orange', 0, 5),
        createTestTile('banana', 0, 6),
      ];
      const launchers = [createTestLauncher('apple', 20, 0)];

      expect(checkGameOver(waitingStand, 7, launchers)).toBe(false);
    });
  });
});

// ============================================================================
// Level Metrics
// ============================================================================

describe('Level Metrics', () => {
  describe('calculateLevelMetrics', () => {
    it('should calculate total pixels', () => {
      const pixelArt = createTestPixelArt([['apple', 'orange']]);
      const sinkStacks = [createTestSinkStack(0, ['apple', 'apple', 'apple'])];
      const metrics = calculateLevelMetrics(pixelArt, sinkStacks, 7);

      expect(metrics.totalPixels).toBe(2);
    });

    it('should count unique fruit types', () => {
      const pixelArt = createTestPixelArt([['apple', 'orange', 'banana']]);
      const sinkStacks: SinkTile[][] = [];
      const metrics = calculateLevelMetrics(pixelArt, sinkStacks, 7);

      expect(metrics.uniqueFruitTypes).toBe(3);
    });

    it('should calculate fruit distribution', () => {
      const pixelArt = createTestPixelArt([['apple', 'apple', 'orange']]);
      const sinkStacks: SinkTile[][] = [];
      const metrics = calculateLevelMetrics(pixelArt, sinkStacks, 7);

      expect(metrics.fruitDistribution.apple).toBe(2);
      expect(metrics.fruitDistribution.orange).toBe(1);
    });
  });
});

// ============================================================================
// Emoji Conversion
// ============================================================================

describe('Emoji Conversion', () => {
  describe('emojiPatternToPixelArt', () => {
    it('should convert fruit emojis', () => {
      const pattern = [['🫐', '🍊'], ['🍓', '🍏']];
      const cells = emojiPatternToPixelArt(pattern);

      expect(cells).toHaveLength(4);
      expect(cells.find(c => c.row === 0 && c.col === 0)?.fruitType).toBe('blueberry');
      expect(cells.find(c => c.row === 0 && c.col === 1)?.fruitType).toBe('orange');
    });

    it('should convert color square emojis', () => {
      const pattern = [['🟥', '🟩']];
      const cells = emojiPatternToPixelArt(pattern);

      expect(cells.find(c => c.col === 0)?.fruitType).toBe('strawberry');
      expect(cells.find(c => c.col === 1)?.fruitType).toBe('apple');
    });

    it('should skip empty cells', () => {
      const pattern = [['🍎', '', ' ']];
      const cells = emojiPatternToPixelArt(pattern);

      expect(cells).toHaveLength(1);
    });

    it('should default unknown emojis to apple', () => {
      const pattern = [['?']];
      const cells = emojiPatternToPixelArt(pattern);

      expect(cells[0].fruitType).toBe('apple');
    });
  });
});
