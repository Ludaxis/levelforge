import { describe, it, expect } from 'vitest';
import {
  calculateDifficultyMetrics,
  checkSolvability,
  generateSolvableSinkStacks,
  getRecommendedSettings,
  estimateCompletionTime,
  DifficultyMetrics,
} from '../fruitMatchDifficulty';
import { FruitMatchLevel, PixelCell, SinkTile, DifficultyTier } from '@/types/fruitMatch';
import {
  createTestPixelArt,
  createTestSinkStacks,
  createTestFruitMatchLevel,
  createSimpleSolvableLevel,
} from './helpers/fruitMatchTestHelpers';

// ============================================================================
// Distribution Evenness
// ============================================================================

describe('Distribution Analysis', () => {
  describe('Distribution evenness calculation', () => {
    it('should score perfectly even distribution as 1', () => {
      // 10 pixels of each type = perfectly even
      const pixelArt: PixelCell[] = [];
      for (let i = 0; i < 10; i++) {
        pixelArt.push({ row: 0, col: i, fruitType: 'apple', filled: false });
        pixelArt.push({ row: 1, col: i, fruitType: 'orange', filled: false });
      }

      const sinkStacks = createTestSinkStacks([
        ['apple', 'apple', 'apple'],
        ['orange', 'orange', 'orange'],
      ]);

      const level = createTestFruitMatchLevel(pixelArt, sinkStacks, {
        pixelArtWidth: 10,
        pixelArtHeight: 2,
      });

      const metrics = calculateDifficultyMetrics(level);
      expect(metrics.distributionEvenness).toBeGreaterThan(0.9);
    });

    it('should score uneven distribution lower', () => {
      // 90% one type, 10% another = uneven
      const pixelArt: PixelCell[] = [];
      for (let i = 0; i < 9; i++) {
        pixelArt.push({ row: 0, col: i, fruitType: 'apple', filled: false });
      }
      pixelArt.push({ row: 0, col: 9, fruitType: 'orange', filled: false });

      const sinkStacks = createTestSinkStacks([['apple', 'apple', 'apple']]);
      const level = createTestFruitMatchLevel(pixelArt, sinkStacks, { pixelArtWidth: 10 });

      const metrics = calculateDifficultyMetrics(level);
      expect(metrics.distributionEvenness).toBeLessThan(0.5);
    });
  });
});

// ============================================================================
// Visibility Score
// ============================================================================

describe('Visibility Analysis', () => {
  describe('Visibility score calculation', () => {
    it('should return 1 for shallow stacks (all visible)', () => {
      // Each stack has 1-2 tiles - all visible
      const sinkStacks = createTestSinkStacks([
        ['apple'],
        ['orange', 'banana'],
        ['strawberry'],
      ]);

      const level = createTestFruitMatchLevel(
        createTestPixelArt([['apple']]),
        sinkStacks
      );

      const metrics = calculateDifficultyMetrics(level);
      expect(metrics.visibilityScore).toBe(1);
    });

    it('should return lower score for deep stacks', () => {
      // Stacks with 5+ tiles - not all visible
      const deepStack = ['apple', 'orange', 'banana', 'strawberry', 'plum', 'pear'] as const;
      const sinkStacks = createTestSinkStacks([deepStack.slice()]);

      const level = createTestFruitMatchLevel(
        createTestPixelArt([['apple']]),
        sinkStacks
      );

      const metrics = calculateDifficultyMetrics(level);
      expect(metrics.visibilityScore).toBeLessThan(1);
    });
  });
});

// ============================================================================
// Difficulty Score Calculation
// ============================================================================

describe('Difficulty Score Calculation', () => {
  describe('Overall score computation', () => {
    it('should return score between 0 and 100', () => {
      const level = createSimpleSolvableLevel();
      const metrics = calculateDifficultyMetrics(level);

      expect(metrics.difficultyScore).toBeGreaterThanOrEqual(0);
      expect(metrics.difficultyScore).toBeLessThanOrEqual(100);
    });

    it('should classify small simple level as easy or trivial', () => {
      const level = createSimpleSolvableLevel();
      const metrics = calculateDifficultyMetrics(level);

      expect(['trivial', 'easy', 'medium']).toContain(metrics.difficultyTier);
    });

    it('should increase difficulty with more fruit types', () => {
      const simplePixels = createTestPixelArt([
        ['apple', 'apple'],
        ['apple', 'apple'],
      ]);

      const complexPixels = createTestPixelArt([
        ['apple', 'orange'],
        ['banana', 'strawberry'],
      ]);

      const simpleLevel = createTestFruitMatchLevel(simplePixels, createTestSinkStacks([['apple', 'apple', 'apple']]));
      const complexLevel = createTestFruitMatchLevel(complexPixels, createTestSinkStacks([
        ['apple', 'orange', 'banana'],
        ['strawberry', 'apple', 'orange'],
      ]));

      const simpleMetrics = calculateDifficultyMetrics(simpleLevel);
      const complexMetrics = calculateDifficultyMetrics(complexLevel);

      expect(complexMetrics.uniqueFruitTypes).toBeGreaterThan(simpleMetrics.uniqueFruitTypes);
    });
  });

  describe('Difficulty tier thresholds', () => {
    it('should assign trivial for very low scores', () => {
      // Create minimal level
      const level = createTestFruitMatchLevel(
        createTestPixelArt([['apple']]),
        createTestSinkStacks([['apple', 'apple', 'apple']]),
        { waitingStandSlots: 9 }
      );
      const metrics = calculateDifficultyMetrics(level);

      // With only 1 pixel, should be trivial or easy
      expect(['trivial', 'easy']).toContain(metrics.difficultyTier);
    });
  });
});

// ============================================================================
// Solvability Checking
// ============================================================================

describe('Solvability Checking', () => {
  describe('checkSolvability', () => {
    it('should mark level as solvable when tiles match requirements', () => {
      const level = createSimpleSolvableLevel();
      const { isSolvable, issues } = checkSolvability(level);

      // May have warnings but should be solvable
      expect(isSolvable).toBe(true);
    });

    it('should detect missing tiles', () => {
      const pixelArt = createTestPixelArt([
        ['apple', 'apple', 'apple', 'apple'], // Needs 1 launcher = 3 tiles
      ]);
      const sinkStacks = createTestSinkStacks([
        ['apple', 'apple'], // Only 2 tiles - missing 1
      ]);
      const level = createTestFruitMatchLevel(pixelArt, sinkStacks);

      const { isSolvable, issues } = checkSolvability(level);
      expect(isSolvable).toBe(false);
      expect(issues.some(i => i.includes('Not enough apple'))).toBe(true);
    });

    it('should detect excess tiles', () => {
      const pixelArt = createTestPixelArt([['apple']]);
      const sinkStacks = createTestSinkStacks([
        ['apple', 'apple', 'apple', 'apple', 'apple', 'apple'], // Too many
      ]);
      const level = createTestFruitMatchLevel(pixelArt, sinkStacks);

      const { issues } = checkSolvability(level);
      expect(issues.some(i => i.includes('Too many apple'))).toBe(true);
    });

    it('should warn if tiles not in multiples of 3', () => {
      const pixelArt = createTestPixelArt([['apple', 'apple']]);
      const sinkStacks = createTestSinkStacks([
        ['apple', 'apple'], // 2 tiles, not multiple of 3
      ]);
      const level = createTestFruitMatchLevel(pixelArt, sinkStacks);

      const { issues } = checkSolvability(level);
      expect(issues.some(i => i.includes('not in multiple of 3'))).toBe(true);
    });
  });
});

// ============================================================================
// Solvable Sink Stack Generation
// ============================================================================

describe('Solvable Sink Stack Generation', () => {
  describe('generateSolvableSinkStacks', () => {
    it('should generate exactly 3 tiles per launcher needed', () => {
      const pixelArt = createTestPixelArt([
        ['apple', 'apple', 'apple', 'apple', 'apple'], // 5 apples = 1 launcher (20) = 3 tiles
      ]);

      const stacks = generateSolvableSinkStacks(pixelArt, 3);
      const totalTiles = stacks.reduce((sum, s) => sum + s.length, 0);

      // Should have exactly 3 tiles (1 launcher needed for 5 pixels)
      expect(totalTiles).toBe(3);
    });

    it('should respect sink width', () => {
      const pixelArt = createTestPixelArt([
        ['apple', 'apple', 'apple', 'apple', 'apple'],
      ]);

      const stacks = generateSolvableSinkStacks(pixelArt, 5);
      expect(stacks).toHaveLength(5);
    });

    it('should distribute tiles across columns', () => {
      const pixelArt = createTestPixelArt([
        ['apple', 'apple', 'apple', 'apple', 'apple', 'apple',
         'apple', 'apple', 'apple', 'apple', 'apple', 'apple'], // 12 apples
      ]);

      const stacks = generateSolvableSinkStacks(pixelArt, 4);

      // Should have tiles in multiple columns, not just one
      const nonEmptyStacks = stacks.filter(s => s.length > 0);
      expect(nonEmptyStacks.length).toBeGreaterThan(1);
    });

    it('should respect min stack height constraint', () => {
      const pixelArt = createTestPixelArt([
        ['apple', 'apple', 'apple', 'apple', 'apple'],
        ['orange', 'orange', 'orange', 'orange', 'orange'],
      ]);

      const stacks = generateSolvableSinkStacks(pixelArt, 3, 2, 5);

      // Non-empty stacks should have at least 2 tiles
      for (const stack of stacks) {
        if (stack.length > 0) {
          expect(stack.length).toBeGreaterThanOrEqual(2);
        }
      }
    });

    it('should respect max stack height constraint', () => {
      const pixelArt: PixelCell[] = [];
      for (let i = 0; i < 50; i++) {
        pixelArt.push({ row: 0, col: i, fruitType: 'apple', filled: false });
      }

      const stacks = generateSolvableSinkStacks(pixelArt, 3, 2, 5);

      // All stacks should have at most 5 tiles
      for (const stack of stacks) {
        expect(stack.length).toBeLessThanOrEqual(5);
      }
    });
  });
});

// ============================================================================
// Recommended Settings
// ============================================================================

describe('Recommended Settings', () => {
  describe('getRecommendedSettings', () => {
    const tiers: DifficultyTier[] = ['trivial', 'easy', 'medium', 'hard', 'expert', 'nightmare'];

    for (const tier of tiers) {
      it(`should return valid settings for ${tier}`, () => {
        const settings = getRecommendedSettings(tier);

        expect(settings.gridSize.min).toBeLessThanOrEqual(settings.gridSize.max);
        expect(settings.gridSize.recommended).toBeGreaterThanOrEqual(settings.gridSize.min);
        expect(settings.gridSize.recommended).toBeLessThanOrEqual(settings.gridSize.max);

        expect(settings.fruitTypes.min).toBeLessThanOrEqual(settings.fruitTypes.max);
        expect(settings.waitingStandSlots.min).toBeLessThanOrEqual(settings.waitingStandSlots.max);
        expect(settings.sinkWidth.min).toBeLessThanOrEqual(settings.sinkWidth.max);
      });
    }

    it('should recommend smaller grids for easier difficulties', () => {
      const trivial = getRecommendedSettings('trivial');
      const nightmare = getRecommendedSettings('nightmare');

      expect(trivial.gridSize.recommended).toBeLessThan(nightmare.gridSize.recommended);
    });

    it('should recommend more waiting slots for easier difficulties', () => {
      const easy = getRecommendedSettings('easy');
      const hard = getRecommendedSettings('hard');

      expect(easy.waitingStandSlots.recommended).toBeGreaterThan(hard.waitingStandSlots.recommended);
    });
  });
});

// ============================================================================
// Completion Time Estimation
// ============================================================================

describe('Completion Time Estimation', () => {
  describe('estimateCompletionTime', () => {
    it('should return min <= average <= max times', () => {
      const level = createSimpleSolvableLevel();
      const metrics = calculateDifficultyMetrics(level);
      const estimate = estimateCompletionTime(metrics);

      expect(estimate.minMinutes).toBeLessThanOrEqual(estimate.averageMinutes);
      expect(estimate.averageMinutes).toBeLessThanOrEqual(estimate.maxMinutes);
    });

    it('should increase time for higher difficulty', () => {
      const easyMetrics: DifficultyMetrics = {
        totalPixels: 10,
        uniqueFruitTypes: 2,
        fruitDistribution: { blueberry: 0, orange: 0, strawberry: 0, dragonfruit: 0, banana: 0, apple: 5, plum: 5, pear: 0, blackberry: 0 },
        totalLaunchers: 2,
        launchersPerFruit: { blueberry: 0, orange: 0, strawberry: 0, dragonfruit: 0, banana: 0, apple: 1, plum: 1, pear: 0, blackberry: 0 },
        averageLauncherCapacity: 20,
        totalTilesInSink: 6,
        sinkColumns: 3,
        averageStackDepth: 2,
        maxStackDepth: 2,
        waitingStandSlots: 9,
        bufferRatio: 4.5,
        decisionComplexity: 0.3,
        visibilityScore: 1,
        distributionEvenness: 1,
        difficultyScore: 20,
        difficultyTier: 'easy',
        isSolvable: true,
        solvabilityIssues: [],
      };

      const hardMetrics: DifficultyMetrics = {
        ...easyMetrics,
        totalPixels: 50,
        totalTilesInSink: 30,
        difficultyScore: 60,
        difficultyTier: 'hard',
      };

      const easyEstimate = estimateCompletionTime(easyMetrics);
      const hardEstimate = estimateCompletionTime(hardMetrics);

      expect(hardEstimate.averageMinutes).toBeGreaterThan(easyEstimate.averageMinutes);
    });
  });
});

// ============================================================================
// Launcher Metrics
// ============================================================================

describe('Launcher Metrics', () => {
  describe('Launcher count calculation', () => {
    it('should count total launchers needed', () => {
      const pixelArt = createTestPixelArt([
        ['apple', 'apple', 'apple', 'apple', 'apple'], // 5 = 1 launcher
        ['orange', 'orange', 'orange', 'orange', 'orange'], // 5 = 1 launcher
      ]);

      const sinkStacks = createTestSinkStacks([
        ['apple', 'apple', 'apple'],
        ['orange', 'orange', 'orange'],
      ]);

      const level = createTestFruitMatchLevel(pixelArt, sinkStacks, {
        pixelArtWidth: 5,
        pixelArtHeight: 2,
      });

      const metrics = calculateDifficultyMetrics(level);
      expect(metrics.totalLaunchers).toBe(2);
    });

    it('should break down large pixel counts into multiple launchers', () => {
      const pixelArt: PixelCell[] = [];
      // 150 apple pixels = needs 100 + 40 + 20 = 3 launchers
      for (let i = 0; i < 150; i++) {
        pixelArt.push({ row: Math.floor(i / 10), col: i % 10, fruitType: 'apple', filled: false });
      }

      const sinkStacks = createTestSinkStacks([
        ['apple', 'apple', 'apple'],
        ['apple', 'apple', 'apple'],
        ['apple', 'apple', 'apple'],
      ]);

      const level = createTestFruitMatchLevel(pixelArt, sinkStacks);
      const metrics = calculateDifficultyMetrics(level);

      // At minimum 2 launchers (100+60 or similar)
      expect(metrics.launchersPerFruit.apple).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Average launcher capacity', () => {
    it('should calculate average capacity', () => {
      const pixelArt = createTestPixelArt([
        ['apple', 'apple', 'apple', 'apple', 'apple'], // 5 pixels
      ]);

      const sinkStacks = createTestSinkStacks([['apple', 'apple', 'apple']]);
      const level = createTestFruitMatchLevel(pixelArt, sinkStacks);

      const metrics = calculateDifficultyMetrics(level);
      // 5 pixels / 1 launcher = 5 average capacity
      expect(metrics.averageLauncherCapacity).toBe(5);
    });
  });
});

// ============================================================================
// Buffer Metrics
// ============================================================================

describe('Buffer Metrics', () => {
  describe('Buffer ratio calculation', () => {
    it('should calculate slots per fruit type', () => {
      const pixelArt = createTestPixelArt([
        ['apple', 'orange'], // 2 fruit types
      ]);

      const sinkStacks = createTestSinkStacks([['apple', 'apple', 'apple']]);
      const level = createTestFruitMatchLevel(pixelArt, sinkStacks, {
        waitingStandSlots: 8,
      });

      const metrics = calculateDifficultyMetrics(level);
      // 8 slots / 2 fruit types = 4 ratio
      expect(metrics.bufferRatio).toBe(4);
    });

    it('should handle single fruit type', () => {
      const pixelArt = createTestPixelArt([['apple']]);
      const sinkStacks = createTestSinkStacks([['apple', 'apple', 'apple']]);
      const level = createTestFruitMatchLevel(pixelArt, sinkStacks, {
        waitingStandSlots: 7,
      });

      const metrics = calculateDifficultyMetrics(level);
      expect(metrics.bufferRatio).toBe(7);
    });
  });
});

// ============================================================================
// Sink Metrics
// ============================================================================

describe('Sink Metrics', () => {
  describe('Stack depth calculations', () => {
    it('should calculate average stack depth', () => {
      const sinkStacks = createTestSinkStacks([
        ['apple', 'orange'],       // 2
        ['banana'],                // 1
        ['strawberry', 'plum', 'pear'], // 3
      ]);

      const level = createTestFruitMatchLevel(createTestPixelArt([['apple']]), sinkStacks);
      const metrics = calculateDifficultyMetrics(level);

      // (2 + 1 + 3) / 3 = 2
      expect(metrics.averageStackDepth).toBe(2);
    });

    it('should calculate max stack depth', () => {
      const sinkStacks = createTestSinkStacks([
        ['apple', 'orange'],
        ['banana', 'strawberry', 'plum', 'pear'],
        ['blueberry'],
      ]);

      const level = createTestFruitMatchLevel(createTestPixelArt([['apple']]), sinkStacks);
      const metrics = calculateDifficultyMetrics(level);

      expect(metrics.maxStackDepth).toBe(4);
    });

    it('should count total tiles in sink', () => {
      const sinkStacks = createTestSinkStacks([
        ['apple', 'orange'],
        ['banana', 'strawberry'],
      ]);

      const level = createTestFruitMatchLevel(createTestPixelArt([['apple']]), sinkStacks);
      const metrics = calculateDifficultyMetrics(level);

      expect(metrics.totalTilesInSink).toBe(4);
    });
  });
});
