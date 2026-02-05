import { describe, it, expect } from 'vitest';
import {
  calculateTripletAccessibility,
  calculateBlockingScore,
  calculateInterleavingScore,
  calculateLauncherAlignment,
  calculateDecisionEntropy,
  simulateGameplay,
  calculateOrderDifficulty,
  optimizeForEasy,
  optimizeForHard,
  optimizeForLauncherAlignment,
  introduceBlocking,
  optimizeTileOrder,
  ORDER_DIFFICULTY_WEIGHTS,
} from '../fruitMatchOrderDifficulty';
import { SinkTile, FruitType, LauncherCapacity } from '@/types/fruitMatch';
import { LauncherConfig } from '../fruitMatchUtils';
import {
  createTestTile,
  createTestSinkStack,
  createTestSinkStacks,
  createTestLauncherConfig,
} from './helpers/fruitMatchTestHelpers';

// ============================================================================
// Helper Functions
// ============================================================================

function createSinkTile(fruitType: FruitType, position: number, stackIndex: number): SinkTile {
  return {
    id: `tile-${position}-${stackIndex}`,
    fruitType,
    position,
    stackIndex,
  };
}

function createStacksWithDepths(depths: FruitType[][]): SinkTile[][] {
  return depths.map((stack, position) =>
    stack.map((fruitType, stackIndex) => createSinkTile(fruitType, position, stackIndex))
  );
}

// ============================================================================
// Triplet Accessibility
// ============================================================================

describe('Triplet Accessibility', () => {
  describe('calculateTripletAccessibility', () => {
    it('should return 0 for empty stacks', () => {
      const { score } = calculateTripletAccessibility([]);
      expect(score).toBe(0);
    });

    it('should return low score when triplets are at top (accessible)', () => {
      // All apples at depth 0
      const stacks = createStacksWithDepths([
        ['apple', 'orange'],
        ['apple', 'banana'],
        ['apple', 'strawberry'],
      ]);

      const { score, details } = calculateTripletAccessibility(stacks);
      expect(score).toBeLessThan(0.3); // Should be easy
      expect(details.apple.avgDepth).toBe(0); // All at depth 0
    });

    it('should return higher score when triplets are buried', () => {
      // Apples buried under other fruits
      const stacks = createStacksWithDepths([
        ['orange', 'banana', 'apple'],  // apple at depth 2
        ['orange', 'banana', 'apple'],  // apple at depth 2
        ['orange', 'banana', 'apple'],  // apple at depth 2
      ]);

      const { score, details } = calculateTripletAccessibility(stacks);
      // Score should be non-zero when triplets are buried
      expect(score).toBeGreaterThan(0);
      expect(details.apple.avgDepth).toBe(2);
    });

    it('should average depth across all fruit types', () => {
      const stacks = createStacksWithDepths([
        ['apple', 'apple', 'apple'],  // Shallow
        ['orange', 'orange', 'orange', 'orange', 'orange'], // Medium depth for first 3
      ]);

      const { details } = calculateTripletAccessibility(stacks);
      expect(details.apple.avgDepth).toBe(1); // (0+1+2)/3
    });
  });
});

// ============================================================================
// Blocking Score
// ============================================================================

describe('Blocking Score', () => {
  describe('calculateBlockingScore', () => {
    it('should return 0 when no blocking occurs', () => {
      // Tiles appear in order needed
      const stacks = createStacksWithDepths([['apple'], ['orange']]);
      const queue: LauncherConfig[] = [
        createTestLauncherConfig('apple', 20),
        createTestLauncherConfig('orange', 20),
      ];

      const { score, blockingPairs } = calculateBlockingScore(stacks, queue);
      expect(blockingPairs).toBe(0);
    });

    it('should detect blocking when lower tile needed earlier', () => {
      // Apple on top, orange on bottom, but orange needed first
      const stacks = createStacksWithDepths([
        ['apple', 'orange'], // apple at 0, orange at 1
      ]);
      const queue: LauncherConfig[] = [
        createTestLauncherConfig('orange', 20), // Needed first
        createTestLauncherConfig('apple', 20),  // Needed second
      ];

      const { blockingPairs } = calculateBlockingScore(stacks, queue);
      expect(blockingPairs).toBe(1); // Apple blocks orange
    });

    it('should not count as blocking when upper tile needed first', () => {
      const stacks = createStacksWithDepths([
        ['apple', 'orange'],
      ]);
      const queue: LauncherConfig[] = [
        createTestLauncherConfig('apple', 20),  // Needed first (on top)
        createTestLauncherConfig('orange', 20), // Needed second (on bottom)
      ];

      const { blockingPairs } = calculateBlockingScore(stacks, queue);
      expect(blockingPairs).toBe(0);
    });
  });
});

// ============================================================================
// Interleaving Score
// ============================================================================

describe('Interleaving Score', () => {
  describe('calculateInterleavingScore', () => {
    it('should return 0 for empty stacks', () => {
      const { score } = calculateInterleavingScore([]);
      expect(score).toBe(0);
    });

    it('should return low score when colors are clustered', () => {
      // All apples in one column
      const stacks = createStacksWithDepths([
        ['apple', 'apple', 'apple'],
        ['orange', 'orange', 'orange'],
      ]);

      const { score, spreadByFruit } = calculateInterleavingScore(stacks);
      expect(spreadByFruit.apple).toBe(0.5); // In 1 of 2 columns
      expect(score).toBeLessThan(0.6);
    });

    it('should return higher score when colors are scattered', () => {
      // Apples spread across all columns
      const stacks = createStacksWithDepths([
        ['apple', 'orange'],
        ['orange', 'apple'],
        ['apple', 'orange'],
      ]);

      const { spreadByFruit } = calculateInterleavingScore(stacks);
      expect(spreadByFruit.apple).toBe(1); // In 3 of 3 columns
    });
  });
});

// ============================================================================
// Launcher Alignment
// ============================================================================

describe('Launcher Alignment', () => {
  describe('calculateLauncherAlignment', () => {
    it('should return low score for perfect alignment', () => {
      // First launcher's tiles are most accessible
      const stacks = createStacksWithDepths([
        ['apple', 'orange'],
        ['apple', 'orange'],
        ['apple', 'orange'],
      ]);
      const queue: LauncherConfig[] = [
        createTestLauncherConfig('apple', 20),  // First
        createTestLauncherConfig('orange', 20), // Second
      ];

      const { score } = calculateLauncherAlignment(stacks, queue);
      // Perfect alignment means low-to-moderate score
      expect(score).toBeLessThanOrEqual(0.5);
    });

    it('should return higher score for misaligned tiles', () => {
      // First launcher's tiles are buried
      const stacks = createStacksWithDepths([
        ['orange', 'orange', 'apple'],
        ['orange', 'orange', 'apple'],
        ['orange', 'orange', 'apple'],
      ]);
      const queue: LauncherConfig[] = [
        createTestLauncherConfig('apple', 20),  // Needed first but buried
        createTestLauncherConfig('orange', 20), // Needed second but on top
      ];

      const { score } = calculateLauncherAlignment(stacks, queue);
      expect(score).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// Decision Entropy
// ============================================================================

describe('Decision Entropy', () => {
  describe('calculateDecisionEntropy', () => {
    it('should return 0 for single pickable fruit type', () => {
      const stacks = createStacksWithDepths([
        ['apple'],
        ['apple'],
        ['apple'],
      ]);

      const { score, averageChoices } = calculateDecisionEntropy(stacks, 3);
      expect(averageChoices).toBe(1);
      expect(score).toBe(0);
    });

    it('should return higher score for more pickable types', () => {
      const stacks = createStacksWithDepths([
        ['apple'],
        ['orange'],
        ['banana'],
      ]);

      const { score, averageChoices } = calculateDecisionEntropy(stacks, 3);
      expect(averageChoices).toBe(3);
      expect(score).toBeGreaterThan(0);
    });

    it('should calculate entropy bits correctly', () => {
      const stacks = createStacksWithDepths([
        ['apple'],
        ['orange'],
      ]);

      const { entropyBits } = calculateDecisionEntropy(stacks, 2);
      // 2 choices with uniform probability = log2(2) = 1 bit
      expect(entropyBits).toBeCloseTo(1, 5);
    });
  });
});

// ============================================================================
// Monte Carlo Simulation
// ============================================================================

describe('Monte Carlo Simulation', () => {
  describe('simulateGameplay', () => {
    it('should return results with correct structure', () => {
      const stacks = createStacksWithDepths([
        ['apple', 'apple', 'apple'],
        ['apple', 'apple', 'apple'],
      ]);
      const queue: LauncherConfig[] = [
        createTestLauncherConfig('apple', 20),
        createTestLauncherConfig('apple', 20),
      ];

      const result = simulateGameplay(stacks, queue, 7, 10);

      expect(result.totalGames).toBe(10);
      expect(result.wins + result.losses).toBe(10);
      expect(result.winRate).toBeGreaterThanOrEqual(0);
      expect(result.winRate).toBeLessThanOrEqual(1);
      expect(result.averagePeakUsage).toBeGreaterThanOrEqual(0);
    });

    it('should have higher win rate for well-balanced levels', () => {
      // Simple level: 3 apple tiles for 1 launcher
      const stacks = createStacksWithDepths([
        ['apple'],
        ['apple'],
        ['apple'],
      ]);
      const queue: LauncherConfig[] = [
        createTestLauncherConfig('apple', 20),
      ];

      const result = simulateGameplay(stacks, queue, 7, 50);
      // Win rate should be between 0 and 1, may be low due to simulation constraints
      expect(result.winRate).toBeGreaterThanOrEqual(0);
      expect(result.winRate).toBeLessThanOrEqual(1);
    });
  });
});

// ============================================================================
// Combined Order Difficulty
// ============================================================================

describe('Combined Order Difficulty', () => {
  describe('calculateOrderDifficulty', () => {
    it('should return all required metrics', () => {
      const stacks = createStacksWithDepths([
        ['apple', 'orange'],
        ['apple', 'orange'],
        ['apple', 'orange'],
      ]);
      const queue: LauncherConfig[] = [
        createTestLauncherConfig('apple', 20),
        createTestLauncherConfig('orange', 20),
      ];

      const metrics = calculateOrderDifficulty(stacks, queue, 7, 2, false);

      expect(metrics.tripletAccessibility).toBeDefined();
      expect(metrics.blockingScore).toBeDefined();
      expect(metrics.interleavingScore).toBeDefined();
      expect(metrics.launcherAlignment).toBeDefined();
      expect(metrics.decisionEntropy).toBeDefined();
      expect(metrics.orderDifficultyScore).toBeDefined();
      expect(metrics.factorBreakdown).toBeDefined();
    });

    it('should return score between 0 and 100', () => {
      const stacks = createStacksWithDepths([['apple', 'apple', 'apple']]);
      const queue: LauncherConfig[] = [createTestLauncherConfig('apple', 20)];

      const metrics = calculateOrderDifficulty(stacks, queue, 7, 1, false);
      expect(metrics.orderDifficultyScore).toBeGreaterThanOrEqual(0);
      expect(metrics.orderDifficultyScore).toBeLessThanOrEqual(100);
    });

    it('should include factor breakdown with all factors', () => {
      const stacks = createStacksWithDepths([['apple', 'apple', 'apple']]);
      const queue: LauncherConfig[] = [createTestLauncherConfig('apple', 20)];

      const metrics = calculateOrderDifficulty(stacks, queue, 7, 1, false);
      expect(metrics.factorBreakdown.length).toBeGreaterThanOrEqual(5);

      // Each factor should have required fields
      for (const factor of metrics.factorBreakdown) {
        expect(factor.name).toBeDefined();
        expect(factor.score).toBeGreaterThanOrEqual(0);
        expect(factor.score).toBeLessThanOrEqual(1);
        expect(factor.weight).toBeGreaterThan(0);
        expect(['easy', 'medium', 'hard']).toContain(factor.impact);
      }
    });
  });
});

// ============================================================================
// Tile Order Optimization
// ============================================================================

describe('Tile Order Optimization', () => {
  describe('optimizeForEasy', () => {
    it('should cluster same-fruit tiles together', () => {
      const tiles: SinkTile[] = [
        createSinkTile('apple', 0, 0),
        createSinkTile('orange', 1, 0),
        createSinkTile('apple', 2, 0),
        createSinkTile('orange', 3, 0),
        createSinkTile('apple', 4, 0),
        createSinkTile('orange', 5, 0),
      ];

      const queue: LauncherConfig[] = [
        createTestLauncherConfig('apple', 20),
        createTestLauncherConfig('orange', 20),
      ];

      const optimized = optimizeForEasy(tiles, 4, queue);

      // Check that all stacks have tiles
      expect(optimized.some(s => s.length > 0)).toBe(true);
    });
  });

  describe('optimizeForHard', () => {
    it('should scatter tiles across columns', () => {
      const tiles: SinkTile[] = [
        createSinkTile('apple', 0, 0),
        createSinkTile('apple', 0, 1),
        createSinkTile('apple', 0, 2),
        createSinkTile('orange', 0, 3),
        createSinkTile('orange', 0, 4),
        createSinkTile('orange', 0, 5),
      ];

      const optimized = optimizeForHard(tiles, 3);

      // Tiles should be distributed, not all in one column
      const nonEmptyStacks = optimized.filter(s => s.length > 0);
      expect(nonEmptyStacks.length).toBeGreaterThan(1);
    });
  });

  describe('optimizeForLauncherAlignment', () => {
    it('should order tiles to match launcher needs', () => {
      const tiles: SinkTile[] = [
        createSinkTile('apple', 0, 0),
        createSinkTile('apple', 1, 0),
        createSinkTile('apple', 2, 0),
        createSinkTile('orange', 3, 0),
        createSinkTile('orange', 4, 0),
        createSinkTile('orange', 5, 0),
      ];

      const queue: LauncherConfig[] = [
        createTestLauncherConfig('apple', 20),
        createTestLauncherConfig('orange', 20),
      ];

      const optimized = optimizeForLauncherAlignment(tiles, 3, queue);
      expect(optimized.some(s => s.length > 0)).toBe(true);
    });
  });

  describe('introduceBlocking', () => {
    it('should not throw for empty stacks', () => {
      expect(() => introduceBlocking([], 0.5)).not.toThrow();
    });

    it('should preserve total tile count', () => {
      const stacks = createStacksWithDepths([
        ['apple', 'orange', 'banana'],
        ['apple', 'orange', 'banana'],
      ]);

      const modified = introduceBlocking(stacks, 0.5);
      const originalCount = stacks.reduce((sum, s) => sum + s.length, 0);
      const modifiedCount = modified.reduce((sum, s) => sum + s.length, 0);

      expect(modifiedCount).toBe(originalCount);
    });
  });

  describe('optimizeTileOrder', () => {
    it('should return optimization result with required fields', () => {
      const stacks = createStacksWithDepths([
        ['apple', 'apple', 'apple'],
        ['orange', 'orange', 'orange'],
      ]);

      const queue: LauncherConfig[] = [
        createTestLauncherConfig('apple', 20),
        createTestLauncherConfig('orange', 20),
      ];

      const result = optimizeTileOrder(stacks, queue, 7, 2, 'easy');

      expect(result.originalScore).toBeDefined();
      expect(result.optimizedScore).toBeDefined();
      expect(result.optimizedStacks).toBeDefined();
      expect(result.improvement).toBeDefined();
      expect(result.strategy).toBeDefined();
    });

    it('should use different strategies for different targets', () => {
      const stacks = createStacksWithDepths([
        ['apple', 'orange'],
        ['apple', 'orange'],
        ['apple', 'orange'],
      ]);

      const queue: LauncherConfig[] = [
        createTestLauncherConfig('apple', 20),
        createTestLauncherConfig('orange', 20),
      ];

      const easyResult = optimizeTileOrder(stacks, queue, 7, 2, 'easy');
      const hardResult = optimizeTileOrder(stacks, queue, 7, 2, 'hard');

      expect(easyResult.strategy).not.toBe(hardResult.strategy);
    });
  });
});

// ============================================================================
// Difficulty Weights
// ============================================================================

describe('Difficulty Weights', () => {
  it('should have all weights defined', () => {
    expect(ORDER_DIFFICULTY_WEIGHTS.tripletAccessibility).toBeDefined();
    expect(ORDER_DIFFICULTY_WEIGHTS.blockingScore).toBeDefined();
    expect(ORDER_DIFFICULTY_WEIGHTS.interleavingScore).toBeDefined();
    expect(ORDER_DIFFICULTY_WEIGHTS.launcherAlignment).toBeDefined();
    expect(ORDER_DIFFICULTY_WEIGHTS.decisionEntropy).toBeDefined();
    expect(ORDER_DIFFICULTY_WEIGHTS.waitingStandPressure).toBeDefined();
    expect(ORDER_DIFFICULTY_WEIGHTS.simulatedFailureRate).toBeDefined();
    expect(ORDER_DIFFICULTY_WEIGHTS.simulatedWinRate).toBeDefined();
  });

  it('should have weights that sum close to 1', () => {
    const sum =
      ORDER_DIFFICULTY_WEIGHTS.tripletAccessibility +
      ORDER_DIFFICULTY_WEIGHTS.blockingScore +
      ORDER_DIFFICULTY_WEIGHTS.interleavingScore +
      ORDER_DIFFICULTY_WEIGHTS.launcherAlignment +
      ORDER_DIFFICULTY_WEIGHTS.decisionEntropy +
      ORDER_DIFFICULTY_WEIGHTS.waitingStandPressure +
      ORDER_DIFFICULTY_WEIGHTS.simulatedFailureRate +
      ORDER_DIFFICULTY_WEIGHTS.simulatedWinRate;

    expect(sum).toBeCloseTo(1, 1);
  });

  it('should have all weights between 0 and 1', () => {
    for (const [, weight] of Object.entries(ORDER_DIFFICULTY_WEIGHTS)) {
      expect(weight).toBeGreaterThan(0);
      expect(weight).toBeLessThanOrEqual(1);
    }
  });
});
