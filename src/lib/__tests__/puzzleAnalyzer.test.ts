import { describe, it, expect } from 'vitest';
import {
  analyzePuzzle,
  calculateDifficultyScore,
  quickSolve,
  PuzzleAnalysis,
  DifficultyBreakdown,
} from '../puzzleAnalyzer';
import { SquareBlock } from '@/types/squareBlock';
import { GridCoord, gridKey } from '../squareGrid';

// ============================================================================
// Helper Functions
// ============================================================================

function createBlock(
  row: number,
  col: number,
  direction: 'N' | 'E' | 'S' | 'W' | 'N_S' | 'E_W',
  locked?: boolean
): SquareBlock {
  return {
    id: `block-${row}-${col}`,
    coord: { row, col },
    direction,
    color: '#06b6d4',
    locked,
  };
}

function createBlockMap(blocks: SquareBlock[]): Map<string, SquareBlock> {
  const map = new Map<string, SquareBlock>();
  for (const block of blocks) {
    map.set(gridKey(block.coord), block);
  }
  return map;
}

function createHoleSet(holes: GridCoord[]): Set<string> {
  return new Set(holes.map(gridKey));
}

/**
 * Creates a full PuzzleAnalysis object with all required fields.
 * Any fields not provided will get sensible defaults.
 */
function createFullAnalysis(overrides: Partial<PuzzleAnalysis> & { solvable: boolean; blockCount: number }): PuzzleAnalysis {
  const blockCount = overrides.blockCount;
  return {
    solvable: overrides.solvable,
    blockCount,
    holeCount: overrides.holeCount ?? 0,
    lockedCount: overrides.lockedCount ?? 0,
    icedCount: overrides.icedCount ?? 0,
    totalIceCount: overrides.totalIceCount ?? 0,
    mirrorCount: overrides.mirrorCount ?? 0,
    gridSize: overrides.gridSize ?? 100,
    density: overrides.density ?? blockCount / 100,
    solutionCount: overrides.solutionCount ?? 1,
    minMoves: overrides.minMoves ?? blockCount,
    avgBranchingFactor: overrides.avgBranchingFactor ?? 1,
    minBranchingFactor: overrides.minBranchingFactor ?? 1,
    forcedMoveCount: overrides.forcedMoveCount ?? blockCount,
    forcedMoveRatio: overrides.forcedMoveRatio ?? 1,
    solutionDepth: overrides.solutionDepth ?? blockCount,
    maxChainLength: overrides.maxChainLength ?? blockCount,
    initialClearable: overrides.initialClearable ?? blockCount,
    initialClearability: overrides.initialClearability ?? 1,
    hasCriticalPath: overrides.hasCriticalPath ?? false,
    bottleneckCount: overrides.bottleneckCount ?? 0,
    totalBlockers: overrides.totalBlockers ?? 0,
    avgBlockers: overrides.avgBlockers ?? 0,
    uniqueDirections: overrides.uniqueDirections ?? 1,
    directionVariety: overrides.directionVariety ?? 1 / 6,
    bidirectionalRatio: overrides.bidirectionalRatio ?? 0,
  };
}

// ============================================================================
// Difficulty Score Formula Tests
//
// The current formula (from puzzleAnalyzer.ts):
//   avgBlockersScore = avgBlockers * 4.5           (uncapped, primary factor)
//   clearabilityScore = (1 - clearability) * 20    (0-20 range)
//   blockCountScore = min(blockCount / 40, 10)     (0-10 range)
//   lockedBonus = min(lockedCount, 5)              (0-5 range)
//   icedBonus = min(icedCount, 5)                  (0-5 range)
//   avgIceBonus = min(avgIceCount * 0.5, 5)        (0-5 range)
//   mirrorBonus = min(mirrorCount, 5)              (0-5 range)
//   sizeBonus = blockCount > 400 ? min((blockCount-400)/20, 20) : 0
//   score = min(sum, 100)
//
// Components stored: avgBlockers, clearability, blockCount, lockedCount,
//   icedCount, avgIceCount, mirrorCount, sizeBonus
//
// Tiers: 0-24 easy, 25-49 medium, 50-74 hard, 75+ superHard
// ============================================================================

describe('Difficulty Score Formula', () => {
  describe('avgBlockers Component (avgBlockers * 4.5)', () => {
    it('should give 0 score for 0 avg blockers', () => {
      const analysis = createFullAnalysis({
        solvable: true,
        blockCount: 10,
        avgBlockers: 0,
        totalBlockers: 0,
        initialClearability: 1,
        initialClearable: 10,
        gridSize: 25,
      });
      const result = calculateDifficultyScore(analysis);
      expect(result.components.avgBlockers).toBe(0);
    });

    it('should store avgBlockers value directly in components', () => {
      const analysis = createFullAnalysis({
        solvable: true,
        blockCount: 10,
        avgBlockers: 1,
        totalBlockers: 10,
        initialClearability: 1,
        initialClearable: 10,
        gridSize: 25,
      });
      const result = calculateDifficultyScore(analysis);
      // components.avgBlockers stores the raw value, score contribution = avgBlockers * 4.5
      expect(result.components.avgBlockers).toBe(1);
    });

    it('should store avgBlockers = 2 in components for 2 avg blockers', () => {
      const analysis = createFullAnalysis({
        solvable: true,
        blockCount: 10,
        avgBlockers: 2,
        totalBlockers: 20,
        initialClearability: 1,
        initialClearable: 10,
        gridSize: 25,
      });
      const result = calculateDifficultyScore(analysis);
      expect(result.components.avgBlockers).toBe(2);
    });

    it('should store avgBlockers = 5 in components for 5 avg blockers', () => {
      const analysis = createFullAnalysis({
        solvable: true,
        blockCount: 10,
        avgBlockers: 5,
        totalBlockers: 50,
        initialClearability: 1,
        initialClearable: 10,
        gridSize: 25,
      });
      const result = calculateDifficultyScore(analysis);
      expect(result.components.avgBlockers).toBe(5);
    });

    it('should not cap avgBlockers in components (uncapped in formula)', () => {
      const analysis = createFullAnalysis({
        solvable: true,
        blockCount: 10,
        avgBlockers: 10,
        totalBlockers: 100,
        initialClearability: 1,
        initialClearable: 10,
        gridSize: 25,
      });
      const result = calculateDifficultyScore(analysis);
      expect(result.components.avgBlockers).toBe(10);
    });
  });

  describe('Locked Component (min(lockedCount, 5))', () => {
    it('should give 0 for 0 locked blocks', () => {
      const analysis = createFullAnalysis({
        solvable: true,
        blockCount: 100,
        lockedCount: 0,
        initialClearability: 1,
        initialClearable: 100,
      });
      const result = calculateDifficultyScore(analysis);
      expect(result.components.lockedCount).toBe(0);
    });

    it('should store lockedCount = 3 for 3 locked blocks', () => {
      const analysis = createFullAnalysis({
        solvable: true,
        blockCount: 100,
        lockedCount: 3,
        initialClearability: 1,
        initialClearable: 100,
      });
      const result = calculateDifficultyScore(analysis);
      expect(result.components.lockedCount).toBe(3);
    });

    it('should store lockedCount = 5 for 5 locked blocks', () => {
      const analysis = createFullAnalysis({
        solvable: true,
        blockCount: 100,
        lockedCount: 5,
        initialClearability: 1,
        initialClearable: 100,
      });
      const result = calculateDifficultyScore(analysis);
      expect(result.components.lockedCount).toBe(5);
    });

    it('should store lockedCount = 50 for 50 locked blocks (raw value, capped in scoring)', () => {
      const analysis = createFullAnalysis({
        solvable: true,
        blockCount: 100,
        lockedCount: 50,
        initialClearability: 1,
        initialClearable: 100,
      });
      const result = calculateDifficultyScore(analysis);
      // components.lockedCount stores the raw analysis value
      expect(result.components.lockedCount).toBe(50);
    });
  });

  describe('Clearability Component ((1 - clearability) * 20)', () => {
    it('should store clearability = 1 for 100% clearable', () => {
      const analysis = createFullAnalysis({
        solvable: true,
        blockCount: 10,
        initialClearable: 10,
        initialClearability: 1,
        gridSize: 25,
      });
      const result = calculateDifficultyScore(analysis);
      // components.clearability stores the raw initialClearability value
      expect(result.components.clearability).toBe(1);
    });

    it('should store clearability = 0.5 for 50% clearable', () => {
      const analysis = createFullAnalysis({
        solvable: true,
        blockCount: 10,
        initialClearable: 5,
        initialClearability: 0.5,
        gridSize: 25,
      });
      const result = calculateDifficultyScore(analysis);
      expect(result.components.clearability).toBe(0.5);
    });

    it('should store clearability = 0 for 0% clearable', () => {
      const analysis = createFullAnalysis({
        solvable: true,
        blockCount: 10,
        initialClearable: 0,
        initialClearability: 0,
        gridSize: 25,
      });
      const result = calculateDifficultyScore(analysis);
      expect(result.components.clearability).toBe(0);
    });
  });

  describe('Size Bonus Component (large puzzle bonus, 400+ blocks)', () => {
    it('should give 0 sizeBonus for small puzzles (< 400 blocks)', () => {
      const analysis = createFullAnalysis({
        solvable: true,
        blockCount: 5,
        initialClearability: 1,
        initialClearable: 5,
      });
      const result = calculateDifficultyScore(analysis);
      expect(result.components.sizeBonus).toBe(0);
    });

    it('should give 0 sizeBonus for 50 blocks', () => {
      const analysis = createFullAnalysis({
        solvable: true,
        blockCount: 50,
        initialClearability: 1,
        initialClearable: 50,
      });
      const result = calculateDifficultyScore(analysis);
      expect(result.components.sizeBonus).toBe(0);
    });

    it('should give 0 sizeBonus for 400 blocks (boundary)', () => {
      const analysis = createFullAnalysis({
        solvable: true,
        blockCount: 400,
        initialClearability: 1,
        initialClearable: 400,
      });
      const result = calculateDifficultyScore(analysis);
      expect(result.components.sizeBonus).toBe(0);
    });

    it('should give 10 sizeBonus for 600 blocks', () => {
      const analysis = createFullAnalysis({
        solvable: true,
        blockCount: 600,
        initialClearability: 1,
        initialClearable: 600,
      });
      const result = calculateDifficultyScore(analysis);
      // (600 - 400) / 20 = 10
      expect(result.components.sizeBonus).toBe(10);
    });

    it('should cap sizeBonus at 20 for very large puzzles (800+ blocks)', () => {
      const analysis = createFullAnalysis({
        solvable: true,
        blockCount: 1000,
        initialClearability: 1,
        initialClearable: 1000,
      });
      const result = calculateDifficultyScore(analysis);
      // min((1000-400)/20, 20) = min(30, 20) = 20
      expect(result.components.sizeBonus).toBe(20);
    });

    it('should not go below 0', () => {
      const analysis = createFullAnalysis({
        solvable: true,
        blockCount: 5,
        initialClearability: 1,
        initialClearable: 5,
      });
      const result = calculateDifficultyScore(analysis);
      expect(result.score).toBeGreaterThanOrEqual(0);
    });
  });
});

// ============================================================================
// Difficulty Tier Tests
// Tiers: 0-24 easy, 25-49 medium, 50-74 hard, 75+ superHard
// ============================================================================

describe('Difficulty Tiers', () => {
  it('should return "easy" tier for score < 25', () => {
    // 0 blockers (0pts) + 0 locked (0pts) + 100% clearable (0pts) + blockCount 10/40=0.25pts
    const analysis = createFullAnalysis({
      solvable: true,
      blockCount: 10,
      avgBlockers: 0,
      totalBlockers: 0,
      lockedCount: 0,
      initialClearability: 1,
      initialClearable: 10,
      gridSize: 25,
    });
    const result = calculateDifficultyScore(analysis);
    expect(result.tier).toBe('easy');
    expect(result.score).toBeLessThan(25);
  });

  it('should return "medium" tier for score 25-49', () => {
    // avgBlockers=4 -> 4*4.5=18, clearability 0.5 -> (1-0.5)*20=10, blockCount 100/40=2.5(cap 10)
    // Total ~28.5 if no locked => but let's just target the range
    // avgBlockers=3 -> 13.5, clearability 0.5 -> 10, blockCount 100 -> 2.5 => 26
    const analysis = createFullAnalysis({
      solvable: true,
      blockCount: 100,
      avgBlockers: 3,
      totalBlockers: 300,
      lockedCount: 0,
      initialClearability: 0.5,
      initialClearable: 50,
    });
    const result = calculateDifficultyScore(analysis);
    expect(result.tier).toBe('medium');
    expect(result.score).toBeGreaterThanOrEqual(25);
    expect(result.score).toBeLessThan(50);
  });

  it('should return "hard" tier for score 50-74', () => {
    // avgBlockers=8 -> 36, clearability 0.2 -> 16, blockCount 100 -> 2.5 => 54.5
    const analysis = createFullAnalysis({
      solvable: true,
      blockCount: 100,
      avgBlockers: 8,
      totalBlockers: 800,
      lockedCount: 0,
      initialClearability: 0.2,
      initialClearable: 20,
    });
    const result = calculateDifficultyScore(analysis);
    expect(result.tier).toBe('hard');
    expect(result.score).toBeGreaterThanOrEqual(50);
    expect(result.score).toBeLessThan(75);
  });

  it('should return "superHard" tier for score 75+', () => {
    // avgBlockers=12 -> 54, clearability 0 -> 20, blockCount 100 -> 2.5, locked 5 -> 5 => 81.5
    const analysis = createFullAnalysis({
      solvable: true,
      blockCount: 100,
      avgBlockers: 12,
      totalBlockers: 1200,
      lockedCount: 5,
      initialClearability: 0,
      initialClearable: 0,
    });
    const result = calculateDifficultyScore(analysis);
    expect(result.tier).toBe('superHard');
    expect(result.score).toBeGreaterThanOrEqual(75);
  });

  it('should achieve max score of 100', () => {
    // Need raw score >= 100.
    // avgBlockers=15 -> 67.5, clearability 0 -> 20, blockCount 100 -> 2.5, locked 5 -> 5,
    // iced 5 -> 5, avgIce high -> 5, mirror 5 -> 5 => 110 raw, capped to 100
    const analysis = createFullAnalysis({
      solvable: true,
      blockCount: 100,
      avgBlockers: 15,
      totalBlockers: 1500,
      lockedCount: 10,
      icedCount: 10,
      totalIceCount: 100,
      mirrorCount: 10,
      initialClearability: 0,
      initialClearable: 0,
    });
    const result = calculateDifficultyScore(analysis);
    expect(result.score).toBe(100);
    expect(result.tier).toBe('superHard');
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('Edge Cases', () => {
  it('should return score 0 and tier "easy" for unsolvable puzzles', () => {
    const analysis = createFullAnalysis({
      solvable: false,
      blockCount: 10,
      lockedCount: 5,
      solutionCount: 0,
      minMoves: 0,
      avgBranchingFactor: 0,
      minBranchingFactor: 0,
      forcedMoveCount: 0,
      forcedMoveRatio: 0,
      solutionDepth: 0,
      maxChainLength: 0,
      initialClearable: 0,
      initialClearability: 0,
      totalBlockers: 20,
      avgBlockers: 2,
    });
    const result = calculateDifficultyScore(analysis);
    expect(result.score).toBe(0);
    expect(result.tier).toBe('easy');
  });

  it('should return score 0 and tier "easy" for empty puzzles', () => {
    const analysis = createFullAnalysis({
      solvable: false,
      blockCount: 0,
      solutionCount: 0,
      minMoves: 0,
      avgBranchingFactor: 0,
      minBranchingFactor: 0,
      forcedMoveCount: 0,
      forcedMoveRatio: 0,
      solutionDepth: 0,
      maxChainLength: 0,
      initialClearable: 0,
      initialClearability: 0,
    });
    const result = calculateDifficultyScore(analysis);
    expect(result.score).toBe(0);
    expect(result.tier).toBe('easy');
  });
});

// ============================================================================
// Quick Solve Tests
// ============================================================================

describe('quickSolve', () => {
  it('should return solvable: true for single block pointing to edge', () => {
    const blocks = createBlockMap([
      createBlock(0, 0, 'N'), // Points up, at top edge - can exit
    ]);
    const holes = createHoleSet([]);
    const result = quickSolve(blocks, holes, 3, 3);
    expect(result.solvable).toBe(true);
    expect(result.moves).toBe(1);
  });

  it('should return solvable: false for single block pointing inward blocked', () => {
    const blocks = createBlockMap([
      createBlock(0, 0, 'S'), // Points down at top-left corner
      createBlock(1, 0, 'N'), // Points up, blocked by the block pointing down
    ]);
    const holes = createHoleSet([]);
    // Block at (0,0) points S, blocked by (1,0)
    // Block at (1,0) points N, blocked by (0,0)
    // Neither can clear
    const result = quickSolve(blocks, holes, 3, 3);
    expect(result.solvable).toBe(false);
  });

  it('should return solvable: true for blocks that can clear in sequence', () => {
    // Block at edge can clear first, then inner block can clear
    const blocks = createBlockMap([
      createBlock(0, 0, 'N'), // Can exit immediately
      createBlock(1, 0, 'N'), // Blocked by (0,0), but will clear after
    ]);
    const holes = createHoleSet([]);
    const result = quickSolve(blocks, holes, 3, 3);
    expect(result.solvable).toBe(true);
    expect(result.moves).toBe(2);
  });

  it('should handle holes correctly', () => {
    // Block points to hole
    const blocks = createBlockMap([
      createBlock(0, 0, 'E'), // Points right
    ]);
    const holes = createHoleSet([{ row: 0, col: 1 }]); // Hole to the right
    const result = quickSolve(blocks, holes, 3, 3);
    expect(result.solvable).toBe(true);
  });

  it('should handle locked blocks', () => {
    // Locked block with no neighbors should be clearable
    const blocks = createBlockMap([
      createBlock(0, 0, 'N', true), // Locked but no neighbors
    ]);
    const holes = createHoleSet([]);
    const result = quickSolve(blocks, holes, 3, 3);
    expect(result.solvable).toBe(true);
  });

  it('should handle locked blocks with neighbors', () => {
    // Locked block with neighbor cannot clear until neighbor clears
    const blocks = createBlockMap([
      createBlock(0, 0, 'N', true), // Locked with neighbor
      createBlock(0, 1, 'E'),       // Neighbor, can clear
    ]);
    const holes = createHoleSet([]);
    const result = quickSolve(blocks, holes, 3, 3);
    expect(result.solvable).toBe(true);
    expect(result.moves).toBe(2);
  });
});

// ============================================================================
// Analyze Puzzle Tests
// ============================================================================

describe('analyzePuzzle', () => {
  it('should correctly analyze an empty puzzle', () => {
    const blocks = createBlockMap([]);
    const holes = createHoleSet([]);
    const result = analyzePuzzle(blocks, holes, 3, 3);
    expect(result.solvable).toBe(false);
    expect(result.blockCount).toBe(0);
  });

  it('should correctly analyze a simple solvable puzzle', () => {
    const blocks = createBlockMap([
      createBlock(0, 0, 'N'),
      createBlock(0, 1, 'N'),
      createBlock(0, 2, 'N'),
    ]);
    const holes = createHoleSet([]);
    const result = analyzePuzzle(blocks, holes, 3, 3);
    expect(result.solvable).toBe(true);
    expect(result.blockCount).toBe(3);
    expect(result.initialClearable).toBe(3);
    expect(result.initialClearability).toBe(1);
  });

  it('should correctly count locked blocks', () => {
    const blocks = createBlockMap([
      createBlock(0, 0, 'N', true),
      createBlock(0, 1, 'N', false),
      createBlock(0, 2, 'N', true),
    ]);
    const holes = createHoleSet([]);
    const result = analyzePuzzle(blocks, holes, 3, 3);
    expect(result.lockedCount).toBe(2);
  });

  it('should calculate average blockers correctly', () => {
    // Two blocks in a column, bottom one blocked by top
    const blocks = createBlockMap([
      createBlock(0, 1, 'N'), // At top, 0 blockers
      createBlock(1, 1, 'N'), // Below, 1 blocker (the one above)
    ]);
    const holes = createHoleSet([]);
    const result = analyzePuzzle(blocks, holes, 3, 3);
    // Block at (0,1) has 0 blockers, block at (1,1) has 1 blocker
    // Total = 1, avg = 0.5
    expect(result.totalBlockers).toBe(1);
    expect(result.avgBlockers).toBe(0.5);
  });

  it('should calculate density correctly', () => {
    const blocks = createBlockMap([
      createBlock(0, 0, 'N'),
      createBlock(0, 1, 'N'),
      createBlock(0, 2, 'N'),
    ]);
    const holes = createHoleSet([]);
    const result = analyzePuzzle(blocks, holes, 3, 3);
    expect(result.gridSize).toBe(9);
    expect(result.density).toBeCloseTo(3 / 9);
  });
});

// ============================================================================
// Integration Tests - Real Puzzle Scenarios
// ============================================================================

describe('Real Puzzle Scenarios', () => {
  it('should rate a simple edge-pointing grid as easy', () => {
    // 3x3 grid with all blocks pointing outward - very easy
    const blocks = createBlockMap([
      createBlock(0, 0, 'N'), createBlock(0, 1, 'N'), createBlock(0, 2, 'N'),
      createBlock(1, 0, 'W'), createBlock(1, 1, 'N'), createBlock(1, 2, 'E'),
      createBlock(2, 0, 'S'), createBlock(2, 1, 'S'), createBlock(2, 2, 'S'),
    ]);
    const holes = createHoleSet([]);
    const analysis = analyzePuzzle(blocks, holes, 3, 3);
    const difficulty = calculateDifficultyScore(analysis);

    expect(analysis.solvable).toBe(true);
    expect(analysis.initialClearability).toBeGreaterThan(0.5); // Most should be clearable
    expect(difficulty.tier).toBe('easy');
  });

  it('should rate a puzzle with many inward-pointing blocks as harder', () => {
    // 3x3 grid with blocks pointing toward center - harder
    const blocks = createBlockMap([
      createBlock(0, 0, 'S'), createBlock(0, 1, 'S'), createBlock(0, 2, 'S'),
      createBlock(1, 0, 'E'), createBlock(1, 1, 'S'), createBlock(1, 2, 'W'),
      createBlock(2, 0, 'N'), createBlock(2, 1, 'N'), createBlock(2, 2, 'N'),
    ]);
    const holes = createHoleSet([]);
    const analysis = analyzePuzzle(blocks, holes, 3, 3);
    const difficulty = calculateDifficultyScore(analysis);

    // This should have more blockers and lower clearability
    expect(analysis.avgBlockers).toBeGreaterThan(0);
  });

  it('should rate a puzzle with locked blocks as harder', () => {
    // Locked blocks add difficulty via the lockedCount component (capped at 5)
    // Use corner blocks (no neighbors) so they're still clearable when locked
    const blocksWithoutLocks = createBlockMap([
      createBlock(0, 0, 'N'), // Corner - can clear
      createBlock(0, 2, 'E'), // Corner - can clear
      createBlock(2, 0, 'W'), // Corner - can clear
      createBlock(2, 2, 'S'), // Corner - can clear
    ]);
    const blocksWithLocks = createBlockMap([
      createBlock(0, 0, 'N', true), // Corner locked - no neighbors, can clear
      createBlock(0, 2, 'E', true), // Corner locked - no neighbors, can clear
      createBlock(2, 0, 'W', true), // Corner locked - no neighbors, can clear
      createBlock(2, 2, 'S', true), // Corner locked - no neighbors, can clear
    ]);
    const holes = createHoleSet([]);

    const analysisWithout = analyzePuzzle(blocksWithoutLocks, holes, 3, 3);
    const analysisWith = analyzePuzzle(blocksWithLocks, holes, 3, 3);

    // Both should be solvable
    expect(analysisWithout.solvable).toBe(true);
    expect(analysisWith.solvable).toBe(true);

    // With 4 locked blocks
    expect(analysisWith.lockedCount).toBe(4);

    const difficultyWithout = calculateDifficultyScore(analysisWithout);
    const difficultyWith = calculateDifficultyScore(analysisWith);

    // lockedCount component: 4 locked vs 0 locked -> higher score
    expect(difficultyWith.components.lockedCount).toBeGreaterThan(difficultyWithout.components.lockedCount);
    expect(difficultyWith.components.lockedCount).toBe(4); // Raw locked count stored in components
  });

  it('should scale properly for different grid sizes', () => {
    // Same pattern on 3x3 vs 5x5 should have similar difficulty scores
    const create3x3 = () => createBlockMap([
      createBlock(0, 0, 'N'), createBlock(0, 1, 'N'), createBlock(0, 2, 'N'),
    ]);

    const create5x5 = () => createBlockMap([
      createBlock(0, 0, 'N'), createBlock(0, 1, 'N'), createBlock(0, 2, 'N'),
      createBlock(0, 3, 'N'), createBlock(0, 4, 'N'),
    ]);

    const analysis3x3 = analyzePuzzle(create3x3(), createHoleSet([]), 3, 3);
    const analysis5x5 = analyzePuzzle(create5x5(), createHoleSet([]), 5, 5);

    const difficulty3x3 = calculateDifficultyScore(analysis3x3);
    const difficulty5x5 = calculateDifficultyScore(analysis5x5);

    // Both should be easy since all blocks point to edge
    expect(difficulty3x3.tier).toBe('easy');
    expect(difficulty5x5.tier).toBe('easy');
  });
});

// ============================================================================
// Score Calculation Verification
// ============================================================================

describe('Score Calculation Verification', () => {
  it('should correctly sum all components', () => {
    const analysis = createFullAnalysis({
      solvable: true,
      blockCount: 100,
      lockedCount: 0,
      icedCount: 0,
      totalIceCount: 0,
      mirrorCount: 0,
      initialClearable: 50, // 50% clearable
      initialClearability: 0.5,
      totalBlockers: 250, // 2.5 avg
      avgBlockers: 2.5,
    });

    const result = calculateDifficultyScore(analysis);

    // Expected with current formula:
    // avgBlockersScore = 2.5 * 4.5 = 11.25
    // clearabilityScore = (1 - 0.5) * 20 = 10
    // blockCountScore = min(100/40, 10) = min(2.5, 10) = 2.5
    // lockedBonus = min(0, 5) = 0
    // icedBonus = min(0, 5) = 0
    // avgIceBonus = min(0, 5) = 0
    // mirrorBonus = min(0, 5) = 0
    // sizeBonus = 0 (100 < 400)
    // rawScore = 11.25 + 10 + 2.5 = 23.75
    // score = round(23.75) = 24

    expect(result.components.avgBlockers).toBe(2.5);
    expect(result.components.clearability).toBe(0.5);
    expect(result.components.blockCount).toBe(100);
    expect(result.components.lockedCount).toBe(0);
    expect(result.components.sizeBonus).toBe(0);
    expect(result.rawScore).toBeCloseTo(23.75);
    expect(result.score).toBe(24);
    expect(result.tier).toBe('easy'); // 24 < 25 = easy
  });
});
