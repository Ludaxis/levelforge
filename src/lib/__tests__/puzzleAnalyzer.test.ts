import { describe, it, expect } from 'vitest';
import {
  analyzePuzzle,
  calculateDifficultyScore,
  quickSolve,
  DEFAULT_WEIGHTS,
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

// ============================================================================
// Difficulty Score Formula Tests
// ============================================================================

describe('Difficulty Score Formula', () => {
  describe('Blockers Component (0-50 pts)', () => {
    it('should give 0 pts for 0 avg blockers', () => {
      const analysis: PuzzleAnalysis = {
        solvable: true,
        blockCount: 10,
        holeCount: 0,
        lockedCount: 0,
        gridSize: 25,
        density: 0.4,
        solutionCount: 1,
        minMoves: 10,
        avgBranchingFactor: 1,
        minBranchingFactor: 1,
        forcedMoveCount: 10,
        forcedMoveRatio: 1,
        solutionDepth: 10,
        maxChainLength: 10,
        initialClearable: 10,
        initialClearability: 1,
        hasCriticalPath: false,
        bottleneckCount: 0,
        totalBlockers: 0,
        avgBlockers: 0,
      };
      const result = calculateDifficultyScore(analysis);
      expect(result.components.blockers).toBe(0);
    });

    it('should give 10 pts for 1 avg blocker', () => {
      const analysis: PuzzleAnalysis = {
        solvable: true,
        blockCount: 10,
        holeCount: 0,
        lockedCount: 0,
        gridSize: 25,
        density: 0.4,
        solutionCount: 1,
        minMoves: 10,
        avgBranchingFactor: 1,
        minBranchingFactor: 1,
        forcedMoveCount: 10,
        forcedMoveRatio: 1,
        solutionDepth: 10,
        maxChainLength: 10,
        initialClearable: 10,
        initialClearability: 1,
        hasCriticalPath: false,
        bottleneckCount: 0,
        totalBlockers: 10,
        avgBlockers: 1,
      };
      const result = calculateDifficultyScore(analysis);
      expect(result.components.blockers).toBe(10);
    });

    it('should give 20 pts for 2 avg blockers', () => {
      const analysis: PuzzleAnalysis = {
        solvable: true,
        blockCount: 10,
        holeCount: 0,
        lockedCount: 0,
        gridSize: 25,
        density: 0.4,
        solutionCount: 1,
        minMoves: 10,
        avgBranchingFactor: 1,
        minBranchingFactor: 1,
        forcedMoveCount: 10,
        forcedMoveRatio: 1,
        solutionDepth: 10,
        maxChainLength: 10,
        initialClearable: 10,
        initialClearability: 1,
        hasCriticalPath: false,
        bottleneckCount: 0,
        totalBlockers: 20,
        avgBlockers: 2,
      };
      const result = calculateDifficultyScore(analysis);
      expect(result.components.blockers).toBe(20);
    });

    it('should give 30 pts for 3 avg blockers', () => {
      const analysis: PuzzleAnalysis = {
        solvable: true,
        blockCount: 10,
        holeCount: 0,
        lockedCount: 0,
        gridSize: 25,
        density: 0.4,
        solutionCount: 1,
        minMoves: 10,
        avgBranchingFactor: 1,
        minBranchingFactor: 1,
        forcedMoveCount: 10,
        forcedMoveRatio: 1,
        solutionDepth: 10,
        maxChainLength: 10,
        initialClearable: 10,
        initialClearability: 1,
        hasCriticalPath: false,
        bottleneckCount: 0,
        totalBlockers: 30,
        avgBlockers: 3,
      };
      const result = calculateDifficultyScore(analysis);
      expect(result.components.blockers).toBe(30);
    });

    it('should give 40 pts for 4 avg blockers', () => {
      const analysis: PuzzleAnalysis = {
        solvable: true,
        blockCount: 10,
        holeCount: 0,
        lockedCount: 0,
        gridSize: 25,
        density: 0.4,
        solutionCount: 1,
        minMoves: 10,
        avgBranchingFactor: 1,
        minBranchingFactor: 1,
        forcedMoveCount: 10,
        forcedMoveRatio: 1,
        solutionDepth: 10,
        maxChainLength: 10,
        initialClearable: 10,
        initialClearability: 1,
        hasCriticalPath: false,
        bottleneckCount: 0,
        totalBlockers: 40,
        avgBlockers: 4,
      };
      const result = calculateDifficultyScore(analysis);
      expect(result.components.blockers).toBe(40);
    });

    it('should give 50 pts for 5+ avg blockers (capped)', () => {
      const analysis: PuzzleAnalysis = {
        solvable: true,
        blockCount: 10,
        holeCount: 0,
        lockedCount: 0,
        gridSize: 25,
        density: 0.4,
        solutionCount: 1,
        minMoves: 10,
        avgBranchingFactor: 1,
        minBranchingFactor: 1,
        forcedMoveCount: 10,
        forcedMoveRatio: 1,
        solutionDepth: 10,
        maxChainLength: 10,
        initialClearable: 10,
        initialClearability: 1,
        hasCriticalPath: false,
        bottleneckCount: 0,
        totalBlockers: 50,
        avgBlockers: 5,
      };
      const result = calculateDifficultyScore(analysis);
      expect(result.components.blockers).toBe(50);
    });

    it('should cap at 50 pts for 10 avg blockers', () => {
      const analysis: PuzzleAnalysis = {
        solvable: true,
        blockCount: 10,
        holeCount: 0,
        lockedCount: 0,
        gridSize: 25,
        density: 0.4,
        solutionCount: 1,
        minMoves: 10,
        avgBranchingFactor: 1,
        minBranchingFactor: 1,
        forcedMoveCount: 10,
        forcedMoveRatio: 1,
        solutionDepth: 10,
        maxChainLength: 10,
        initialClearable: 10,
        initialClearability: 1,
        hasCriticalPath: false,
        bottleneckCount: 0,
        totalBlockers: 100,
        avgBlockers: 10,
      };
      const result = calculateDifficultyScore(analysis);
      expect(result.components.blockers).toBe(50);
    });
  });

  describe('Locked Component (0-25 pts)', () => {
    it('should give 0 pts for 0% locked', () => {
      const analysis: PuzzleAnalysis = {
        solvable: true,
        blockCount: 100,
        holeCount: 0,
        lockedCount: 0,
        gridSize: 100,
        density: 1,
        solutionCount: 1,
        minMoves: 100,
        avgBranchingFactor: 1,
        minBranchingFactor: 1,
        forcedMoveCount: 100,
        forcedMoveRatio: 1,
        solutionDepth: 100,
        maxChainLength: 100,
        initialClearable: 100,
        initialClearability: 1,
        hasCriticalPath: false,
        bottleneckCount: 0,
        totalBlockers: 0,
        avgBlockers: 0,
      };
      const result = calculateDifficultyScore(analysis);
      expect(result.components.lockedPercent).toBe(0);
    });

    it('should give ~8.3 pts for 10% locked (threshold 30%)', () => {
      const analysis: PuzzleAnalysis = {
        solvable: true,
        blockCount: 100,
        holeCount: 0,
        lockedCount: 10,
        gridSize: 100,
        density: 1,
        solutionCount: 1,
        minMoves: 100,
        avgBranchingFactor: 1,
        minBranchingFactor: 1,
        forcedMoveCount: 100,
        forcedMoveRatio: 1,
        solutionDepth: 100,
        maxChainLength: 100,
        initialClearable: 100,
        initialClearability: 1,
        hasCriticalPath: false,
        bottleneckCount: 0,
        totalBlockers: 0,
        avgBlockers: 0,
      };
      const result = calculateDifficultyScore(analysis);
      // 10%/30% * 25 = 8.33
      expect(result.components.lockedPercent).toBeCloseTo(8.33, 1);
    });

    it('should give 25 pts for 30%+ locked (capped)', () => {
      const analysis: PuzzleAnalysis = {
        solvable: true,
        blockCount: 100,
        holeCount: 0,
        lockedCount: 30,
        gridSize: 100,
        density: 1,
        solutionCount: 1,
        minMoves: 100,
        avgBranchingFactor: 1,
        minBranchingFactor: 1,
        forcedMoveCount: 100,
        forcedMoveRatio: 1,
        solutionDepth: 100,
        maxChainLength: 100,
        initialClearable: 100,
        initialClearability: 1,
        hasCriticalPath: false,
        bottleneckCount: 0,
        totalBlockers: 0,
        avgBlockers: 0,
      };
      const result = calculateDifficultyScore(analysis);
      expect(result.components.lockedPercent).toBe(25);
    });

    it('should cap at 25 pts for 50% locked', () => {
      const analysis: PuzzleAnalysis = {
        solvable: true,
        blockCount: 100,
        holeCount: 0,
        lockedCount: 50,
        gridSize: 100,
        density: 1,
        solutionCount: 1,
        minMoves: 100,
        avgBranchingFactor: 1,
        minBranchingFactor: 1,
        forcedMoveCount: 100,
        forcedMoveRatio: 1,
        solutionDepth: 100,
        maxChainLength: 100,
        initialClearable: 100,
        initialClearability: 1,
        hasCriticalPath: false,
        bottleneckCount: 0,
        totalBlockers: 0,
        avgBlockers: 0,
      };
      const result = calculateDifficultyScore(analysis);
      expect(result.components.lockedPercent).toBe(25);
    });
  });

  describe('Clearability Component (0-25 pts)', () => {
    it('should give 0 pts for 100% clearable', () => {
      const analysis: PuzzleAnalysis = {
        solvable: true,
        blockCount: 10,
        holeCount: 0,
        lockedCount: 0,
        gridSize: 25,
        density: 0.4,
        solutionCount: 1,
        minMoves: 10,
        avgBranchingFactor: 1,
        minBranchingFactor: 1,
        forcedMoveCount: 10,
        forcedMoveRatio: 1,
        solutionDepth: 10,
        maxChainLength: 10,
        initialClearable: 10,
        initialClearability: 1,
        hasCriticalPath: false,
        bottleneckCount: 0,
        totalBlockers: 0,
        avgBlockers: 0,
      };
      const result = calculateDifficultyScore(analysis);
      expect(result.components.clearability).toBe(0);
    });

    it('should give 12.5 pts for 50% clearable', () => {
      const analysis: PuzzleAnalysis = {
        solvable: true,
        blockCount: 10,
        holeCount: 0,
        lockedCount: 0,
        gridSize: 25,
        density: 0.4,
        solutionCount: 1,
        minMoves: 10,
        avgBranchingFactor: 1,
        minBranchingFactor: 1,
        forcedMoveCount: 10,
        forcedMoveRatio: 1,
        solutionDepth: 10,
        maxChainLength: 10,
        initialClearable: 5,
        initialClearability: 0.5,
        hasCriticalPath: false,
        bottleneckCount: 0,
        totalBlockers: 0,
        avgBlockers: 0,
      };
      const result = calculateDifficultyScore(analysis);
      expect(result.components.clearability).toBe(12.5);
    });

    it('should give 25 pts for 0% clearable', () => {
      const analysis: PuzzleAnalysis = {
        solvable: true,
        blockCount: 10,
        holeCount: 0,
        lockedCount: 0,
        gridSize: 25,
        density: 0.4,
        solutionCount: 1,
        minMoves: 10,
        avgBranchingFactor: 1,
        minBranchingFactor: 1,
        forcedMoveCount: 10,
        forcedMoveRatio: 1,
        solutionDepth: 10,
        maxChainLength: 10,
        initialClearable: 0,
        initialClearability: 0,
        hasCriticalPath: false,
        bottleneckCount: 0,
        totalBlockers: 0,
        avgBlockers: 0,
      };
      const result = calculateDifficultyScore(analysis);
      expect(result.components.clearability).toBe(25);
    });
  });

  describe('Size Bonus Component (reduces difficulty for small puzzles)', () => {
    function createAnalysisWithBlockCount(blockCount: number): PuzzleAnalysis {
      return {
        solvable: true,
        blockCount,
        holeCount: 0,
        lockedCount: 0,
        gridSize: 100,
        density: blockCount / 100,
        solutionCount: 1,
        minMoves: blockCount,
        avgBranchingFactor: 1,
        minBranchingFactor: 1,
        forcedMoveCount: blockCount,
        forcedMoveRatio: 1,
        solutionDepth: blockCount,
        maxChainLength: blockCount,
        initialClearable: blockCount,
        initialClearability: 1,
        hasCriticalPath: false,
        bottleneckCount: 0,
        totalBlockers: 0,
        avgBlockers: 0,
      };
    }

    it('should give -25 pts bonus for < 10 blocks', () => {
      const analysis = createAnalysisWithBlockCount(5);
      const result = calculateDifficultyScore(analysis);
      expect(result.components.sizeBonus).toBe(-25);
    });

    it('should give -20 pts bonus for 10-19 blocks', () => {
      const analysis = createAnalysisWithBlockCount(15);
      const result = calculateDifficultyScore(analysis);
      expect(result.components.sizeBonus).toBe(-20);
    });

    it('should give -15 pts bonus for 20-29 blocks', () => {
      const analysis = createAnalysisWithBlockCount(25);
      const result = calculateDifficultyScore(analysis);
      expect(result.components.sizeBonus).toBe(-15);
    });

    it('should give -10 pts bonus for 30-49 blocks', () => {
      const analysis = createAnalysisWithBlockCount(35);
      const result = calculateDifficultyScore(analysis);
      expect(result.components.sizeBonus).toBe(-10);
    });

    it('should give 0 pts bonus for 50+ blocks', () => {
      const analysis = createAnalysisWithBlockCount(55);
      const result = calculateDifficultyScore(analysis);
      expect(result.components.sizeBonus).toBe(0);
    });

    it('should reduce final score by size bonus', () => {
      // Create puzzle with some difficulty but small size
      const analysis: PuzzleAnalysis = {
        solvable: true,
        blockCount: 5, // Small = -25 bonus
        holeCount: 0,
        lockedCount: 2, // 40% locked = 25 pts (capped at 30%)
        gridSize: 25,
        density: 0.2,
        solutionCount: 1,
        minMoves: 5,
        avgBranchingFactor: 1,
        minBranchingFactor: 1,
        forcedMoveCount: 5,
        forcedMoveRatio: 1,
        solutionDepth: 5,
        maxChainLength: 5,
        initialClearable: 0, // 0% clearable = 25 pts
        initialClearability: 0,
        hasCriticalPath: false,
        bottleneckCount: 0,
        totalBlockers: 15, // 3 avg = 30 pts
        avgBlockers: 3,
      };
      const result = calculateDifficultyScore(analysis);
      // Raw: 30 + 25 + 25 = 80
      // With size bonus: 80 - 25 = 55
      expect(result.score).toBe(55);
    });

    it('should not go below 0', () => {
      const analysis = createAnalysisWithBlockCount(5); // -20 bonus, 0 raw score
      const result = calculateDifficultyScore(analysis);
      expect(result.score).toBeGreaterThanOrEqual(0);
    });
  });
});

// ============================================================================
// Difficulty Tier Tests
// ============================================================================

describe('Difficulty Tiers', () => {
  function createAnalysisWithScore(avgBlockers: number, lockedPct: number, clearability: number): PuzzleAnalysis {
    const blockCount = 100;
    return {
      solvable: true,
      blockCount,
      holeCount: 0,
      lockedCount: Math.round(blockCount * lockedPct),
      gridSize: 100,
      density: 1,
      solutionCount: 1,
      minMoves: blockCount,
      avgBranchingFactor: 1,
      minBranchingFactor: 1,
      forcedMoveCount: blockCount,
      forcedMoveRatio: 1,
      solutionDepth: blockCount,
      maxChainLength: blockCount,
      initialClearable: Math.round(blockCount * clearability),
      initialClearability: clearability,
      hasCriticalPath: false,
      bottleneckCount: 0,
      totalBlockers: Math.round(avgBlockers * blockCount),
      avgBlockers,
    };
  }

  it('should return "easy" tier for score 0-19', () => {
    // 0 blockers (0pts) + 0% locked (0pts) + 100% clearable (0pts) = 0
    const analysis = createAnalysisWithScore(0, 0, 1);
    const result = calculateDifficultyScore(analysis);
    expect(result.tier).toBe('easy');
    expect(result.score).toBeLessThan(20);
  });

  it('should return "medium" tier for score 20-39', () => {
    // 1 blocker (10pts) + 15% locked (12.5pts) + 100% clearable (0pts) = 22.5
    const analysis = createAnalysisWithScore(1, 0.15, 1);
    const result = calculateDifficultyScore(analysis);
    expect(result.tier).toBe('medium');
    expect(result.score).toBeGreaterThanOrEqual(20);
    expect(result.score).toBeLessThan(40);
  });

  it('should return "hard" tier for score 40-59', () => {
    // 3 blockers (30pts) + 15% locked (12.5pts) + 70% clearable (7.5pts) = 50
    const analysis = createAnalysisWithScore(3, 0.15, 0.7);
    const result = calculateDifficultyScore(analysis);
    expect(result.tier).toBe('hard');
    expect(result.score).toBeGreaterThanOrEqual(40);
    expect(result.score).toBeLessThan(60);
  });

  it('should return "superHard" tier for score 60+', () => {
    // 4 blockers (40pts) + 30% locked (25pts) + 100% clearable (0pts) = 65
    const analysis = createAnalysisWithScore(4, 0.3, 1);
    const result = calculateDifficultyScore(analysis);
    expect(result.tier).toBe('superHard');
    expect(result.score).toBeGreaterThanOrEqual(60);
  });

  it('should achieve max score of 100', () => {
    // 5+ blockers (50pts) + 30%+ locked (25pts) + 0% clearable (25pts) = 100
    const analysis = createAnalysisWithScore(5, 0.3, 0);
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
    const analysis: PuzzleAnalysis = {
      solvable: false,
      blockCount: 10,
      holeCount: 0,
      lockedCount: 5,
      gridSize: 25,
      density: 0.4,
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
      hasCriticalPath: false,
      bottleneckCount: 0,
      totalBlockers: 20,
      avgBlockers: 2,
    };
    const result = calculateDifficultyScore(analysis);
    expect(result.score).toBe(0);
    expect(result.tier).toBe('easy');
  });

  it('should return score 0 and tier "easy" for empty puzzles', () => {
    const analysis: PuzzleAnalysis = {
      solvable: false,
      blockCount: 0,
      holeCount: 0,
      lockedCount: 0,
      gridSize: 25,
      density: 0,
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
      hasCriticalPath: false,
      bottleneckCount: 0,
      totalBlockers: 0,
      avgBlockers: 0,
    };
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
    // Locked blocks add difficulty via the lockedPercent component
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

    // With 4/4 = 100% locked, should get max locked points
    expect(analysisWith.lockedCount).toBe(4);

    const difficultyWithout = calculateDifficultyScore(analysisWithout);
    const difficultyWith = calculateDifficultyScore(analysisWith);

    expect(difficultyWith.components.lockedPercent).toBeGreaterThan(difficultyWithout.components.lockedPercent);
    expect(difficultyWith.components.lockedPercent).toBe(25); // 100% locked = max 25 pts
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
    const analysis: PuzzleAnalysis = {
      solvable: true,
      blockCount: 100,
      holeCount: 0,
      lockedCount: 15, // 15% locked
      gridSize: 100,
      density: 1,
      solutionCount: 1,
      minMoves: 100,
      avgBranchingFactor: 1,
      minBranchingFactor: 1,
      forcedMoveCount: 100,
      forcedMoveRatio: 1,
      solutionDepth: 100,
      maxChainLength: 100,
      initialClearable: 50, // 50% clearable
      initialClearability: 0.5,
      hasCriticalPath: false,
      bottleneckCount: 0,
      totalBlockers: 250, // 2.5 avg
      avgBlockers: 2.5,
    };

    const result = calculateDifficultyScore(analysis);

    // Expected (100 blocks = no size bonus):
    // blockers = min(2.5/5, 1) * 50 = 0.5 * 50 = 25
    // locked = min(0.15/0.30, 1) * 25 = 0.5 * 25 = 12.5
    // clearability = (1 - 0.5) * 25 = 0.5 * 25 = 12.5
    // sizeBonus = 0 (100 blocks >= 50)
    // total = 25 + 12.5 + 12.5 = 50

    expect(result.components.blockers).toBe(25);
    expect(result.components.lockedPercent).toBe(12.5);
    expect(result.components.clearability).toBe(12.5);
    expect(result.components.sizeBonus).toBe(0);
    expect(result.score).toBe(50);
    expect(result.tier).toBe('hard'); // 50 is in hard range (40-59)
  });
});
