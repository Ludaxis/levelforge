// Puzzle Analyzer for Square Block Away
// Provides deep analysis of puzzle structure for accurate difficulty calculation

import {
  GridCoord,
  SquareDirection,
  SquareAxis,
  SQUARE_DIRECTIONS,
  gridKey,
  gridAdd,
  isInBounds,
  isBidirectional,
  getAxisDirections,
  getMinBlocksAhead,
} from './squareGrid';
import { SquareBlock, BlockDirection } from '@/types/squareBlock';

// ============================================================================
// Types
// ============================================================================

export interface PuzzleAnalysis {
  // Basic
  solvable: boolean;
  blockCount: number;
  holeCount: number;
  lockedCount: number;
  gridSize: number;           // rows * cols
  density: number;            // blockCount / gridSize

  // Solution Analysis
  solutionCount: number;      // Total unique solution paths (capped)
  minMoves: number;           // Shortest solution (= blockCount for this game)

  // Branching & Choices
  avgBranchingFactor: number; // Average choices per step (higher = easier)
  minBranchingFactor: number; // Minimum choices at any step (1 = forced move)
  forcedMoveCount: number;    // Steps with only 1 choice (higher = harder)
  forcedMoveRatio: number;    // forcedMoves / totalMoves

  // Depth & Waves
  solutionDepth: number;      // "Waves" - levels of dependency
  maxChainLength: number;     // Longest dependency chain

  // Initial State
  initialClearable: number;   // Blocks clearable on first move
  initialClearability: number;// initialClearable / blockCount

  // Bottlenecks
  hasCriticalPath: boolean;   // True if wrong early choice = unsolvable
  bottleneckCount: number;    // Decision points where wrong choice leads to deadlock

  // Blockers
  totalBlockers: number;      // Sum of all blocks ahead for each block
  avgBlockers: number;        // Average blocks ahead per block

  // Direction Variety
  uniqueDirections: number;   // Count of unique directions used (1-6)
  directionVariety: number;   // uniqueDirections / 6 (normalized 0-1)
  bidirectionalRatio: number; // % of blocks that are bidirectional (N_S or E_W)
}

interface AnalysisState {
  blocks: Map<string, SquareBlock>;
  path: string[];
}

// ============================================================================
// Constants
// ============================================================================

const MAX_SOLUTIONS = 1000;       // Cap solution count for performance
const MAX_STATES = 50000;         // Cap total states explored
const SAMPLING_THRESHOLD = 25;    // Use sampling for puzzles with more blocks

// ============================================================================
// Core Analysis Functions
// ============================================================================

/**
 * Check if a direction is clear (block can exit or fall into hole)
 */
function isDirectionClear(
  startCoord: GridCoord,
  direction: SquareDirection,
  blocks: Map<string, SquareBlock>,
  holes: Set<string>,
  rows: number,
  cols: number
): boolean {
  const dirVec = SQUARE_DIRECTIONS[direction];
  let current = gridAdd(startCoord, dirVec);

  while (isInBounds(current, rows, cols)) {
    const key = gridKey(current);
    if (holes.has(key)) return true;  // Can fall into hole
    if (blocks.has(key)) return false; // Blocked
    current = gridAdd(current, dirVec);
  }
  return true; // Reaches edge
}

/**
 * Check if a block can be cleared (considering locked status and neighbors)
 */
function canClearBlock(
  block: SquareBlock,
  blocks: Map<string, SquareBlock>,
  holes: Set<string>,
  rows: number,
  cols: number
): boolean {
  // Check if locked block still has neighbors
  if (block.locked) {
    const directions: SquareDirection[] = ['N', 'E', 'S', 'W'];
    for (const dir of directions) {
      const neighborCoord = gridAdd(block.coord, SQUARE_DIRECTIONS[dir]);
      const neighborKey = gridKey(neighborCoord);
      if (blocks.has(neighborKey)) {
        return false; // Still has neighbors, can't clear
      }
    }
  }

  // Check direction clearance
  if (isBidirectional(block.direction)) {
    const [dir1, dir2] = getAxisDirections(block.direction as SquareAxis);
    return isDirectionClear(block.coord, dir1, blocks, holes, rows, cols) ||
           isDirectionClear(block.coord, dir2, blocks, holes, rows, cols);
  }
  return isDirectionClear(block.coord, block.direction as SquareDirection, blocks, holes, rows, cols);
}

/**
 * Get all clearable blocks in current state
 */
function getClearableBlocks(
  blocks: Map<string, SquareBlock>,
  holes: Set<string>,
  rows: number,
  cols: number
): SquareBlock[] {
  const clearable: SquareBlock[] = [];
  for (const block of blocks.values()) {
    if (canClearBlock(block, blocks, holes, rows, cols)) {
      clearable.push(block);
    }
  }
  return clearable;
}

/**
 * Create a hash of the current state for deduplication
 */
function hashState(blocks: Map<string, SquareBlock>): string {
  const keys = Array.from(blocks.keys()).sort();
  return keys.join('|');
}

/**
 * Calculate solution depth (waves) - how many "layers" of clearing are needed
 */
function calculateSolutionDepth(
  initialBlocks: Map<string, SquareBlock>,
  holes: Set<string>,
  rows: number,
  cols: number
): number {
  let depth = 0;
  const remaining = new Map(initialBlocks);

  while (remaining.size > 0) {
    const clearable = getClearableBlocks(remaining, holes, rows, cols);
    if (clearable.length === 0) break; // Unsolvable

    // Remove all clearable blocks in this wave
    for (const block of clearable) {
      remaining.delete(gridKey(block.coord));
    }
    depth++;
  }

  return depth;
}

// ============================================================================
// Main Analysis Function
// ============================================================================

/**
 * Analyze a puzzle deeply to determine difficulty metrics
 */
export function analyzePuzzle(
  blocks: Map<string, SquareBlock>,
  holes: Set<string>,
  rows: number,
  cols: number
): PuzzleAnalysis {
  const blockCount = blocks.size;
  const holeCount = holes.size;
  const gridSize = rows * cols;
  const lockedCount = Array.from(blocks.values()).filter(b => b.locked).length;

  // Empty puzzle
  if (blockCount === 0) {
    return {
      solvable: false,
      blockCount: 0,
      holeCount,
      lockedCount: 0,
      gridSize,
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
      uniqueDirections: 0,
      directionVariety: 0,
      bidirectionalRatio: 0,
    };
  }

  // Calculate blockers (blocks ahead for each block)
  let totalBlockers = 0;
  for (const block of blocks.values()) {
    const blockersAhead = getMinBlocksAhead(
      block.coord,
      block.direction,
      blocks,
      holes,
      rows,
      cols
    );
    totalBlockers += blockersAhead;
  }
  const avgBlockers = totalBlockers / blockCount;

  // Initial clearability
  const initialClearableBlocks = getClearableBlocks(blocks, holes, rows, cols);
  const initialClearable = initialClearableBlocks.length;
  const initialClearability = initialClearable / blockCount;

  // Solution depth
  const solutionDepth = calculateSolutionDepth(blocks, holes, rows, cols);

  // Use sampling for large puzzles
  const useSampling = blockCount > SAMPLING_THRESHOLD;

  // BFS exploration
  const queue: AnalysisState[] = [{ blocks: new Map(blocks), path: [] }];
  const visited = new Set<string>();
  let solutionCount = 0;
  let bottleneckCount = 0;
  const branchingFactors: number[] = [];
  let forcedMoveCount = 0;
  let statesExplored = 0;

  // For sampling mode, we'll do random path sampling instead
  if (useSampling) {
    // Sample 100 random complete paths
    const sampleCount = 100;
    let successfulPaths = 0;

    for (let sample = 0; sample < sampleCount; sample++) {
      const remaining = new Map(blocks);
      let pathValid = true;

      while (remaining.size > 0 && pathValid) {
        const clearable = getClearableBlocks(remaining, holes, rows, cols);

        if (clearable.length === 0) {
          pathValid = false;
          bottleneckCount++;
        } else {
          branchingFactors.push(clearable.length);
          if (clearable.length === 1) forcedMoveCount++;

          // Random selection
          const chosen = clearable[Math.floor(Math.random() * clearable.length)];
          remaining.delete(gridKey(chosen.coord));
        }
      }

      if (pathValid) successfulPaths++;
    }

    // Estimate solution count from sample success rate
    solutionCount = successfulPaths > 0 ? Math.max(1, Math.round(successfulPaths * 10)) : 0;
  } else {
    // Full BFS for smaller puzzles
    while (queue.length > 0 && solutionCount < MAX_SOLUTIONS && statesExplored < MAX_STATES) {
      const current = queue.shift()!;
      const stateHash = hashState(current.blocks);

      if (visited.has(stateHash)) continue;
      visited.add(stateHash);
      statesExplored++;

      // Check if solved
      if (current.blocks.size === 0) {
        solutionCount++;
        continue;
      }

      const clearable = getClearableBlocks(current.blocks, holes, rows, cols);

      // Deadlock
      if (clearable.length === 0) {
        if (current.path.length > 0) bottleneckCount++;
        continue;
      }

      branchingFactors.push(clearable.length);
      if (clearable.length === 1) forcedMoveCount++;

      // Explore all options
      for (const block of clearable) {
        const newBlocks = new Map(current.blocks);
        newBlocks.delete(gridKey(block.coord));
        queue.push({
          blocks: newBlocks,
          path: [...current.path, block.id],
        });
      }
    }
  }

  // Calculate metrics
  const avgBranchingFactor = branchingFactors.length > 0
    ? branchingFactors.reduce((a, b) => a + b, 0) / branchingFactors.length
    : 0;
  const minBranchingFactor = branchingFactors.length > 0
    ? Math.min(...branchingFactors)
    : 0;
  const forcedMoveRatio = blockCount > 0 ? forcedMoveCount / branchingFactors.length : 0;

  // Calculate direction variety
  const directionSet = new Set<string>();
  let bidirectionalCount = 0;
  for (const block of blocks.values()) {
    directionSet.add(block.direction);
    if (block.direction === 'N_S' || block.direction === 'E_W') {
      bidirectionalCount++;
    }
  }
  const uniqueDirections = directionSet.size;
  const directionVariety = uniqueDirections / 6; // 6 possible directions
  const bidirectionalRatio = blockCount > 0 ? bidirectionalCount / blockCount : 0;

  return {
    solvable: solutionCount > 0,
    blockCount,
    holeCount,
    lockedCount,
    gridSize,
    density: blockCount / gridSize,
    solutionCount,
    minMoves: blockCount, // Always equal to block count in this game
    avgBranchingFactor,
    minBranchingFactor,
    forcedMoveCount,
    forcedMoveRatio,
    solutionDepth,
    maxChainLength: solutionDepth, // In this game, depth = max chain
    initialClearable,
    initialClearability,
    hasCriticalPath: bottleneckCount > 0,
    bottleneckCount,
    totalBlockers,
    avgBlockers,
    uniqueDirections,
    directionVariety,
    bidirectionalRatio,
  };
}

// ============================================================================
// Difficulty Scoring
// ============================================================================

export interface DifficultyWeights {
  blockers: number;
  lockedPercent: number;
  clearability: number;
  directionVariety: number;
}

export const DEFAULT_WEIGHTS: DifficultyWeights = {
  blockers: 30,           // Average blockers per block (more = harder)
  lockedPercent: 30,      // Percentage of locked blocks (more = harder)
  clearability: 15,       // Initial clearability inverted (less clearable = harder)
  directionVariety: 15,   // More unique directions = harder to reason about
};

export interface DifficultyBreakdown {
  score: number;
  tier: 'easy' | 'medium' | 'hard' | 'superHard';
  components: {
    blockers: number;
    lockedPercent: number;
    clearability: number;
    directionVariety: number; // More directions = harder
    densityBonus: number;     // Bonus for packed grids
    sizeBonus: number;        // Reduction for smaller puzzles
  };
}

/**
 * Calculate difficulty score (0-100) from puzzle analysis
 * Based on: avg blockers, locked %, initial clearability
 * Uses ratios so it scales properly with grid size
 */
export function calculateDifficultyScore(
  analysis: PuzzleAnalysis,
  weights: DifficultyWeights = DEFAULT_WEIGHTS
): DifficultyBreakdown {
  if (!analysis.solvable || analysis.blockCount === 0) {
    return {
      score: 0,
      tier: 'easy',
      components: {
        blockers: 0,
        lockedPercent: 0,
        clearability: 0,
        directionVariety: 0,
        densityBonus: 0,
        sizeBonus: 0,
      },
    };
  }

  const lockedRatio = analysis.lockedCount / analysis.blockCount;

  // Size-aware scaling: larger puzzles naturally have higher avgBlockers and lower clearability
  // We use logarithmic scaling to normalize across grid sizes
  const gridScale = Math.log10(Math.max(10, analysis.blockCount)) / Math.log10(10); // 1.0 at 10 blocks, ~2.4 at 229 blocks

  // Size bonus: smaller puzzles get a difficulty reduction
  // 1-9 blocks: -20 pts, 10-29: -10 pts, 30-49: -5 pts, 50+: 0 pts
  const sizeBonus = analysis.blockCount < 10 ? 20 :
                    analysis.blockCount < 30 ? 10 :
                    analysis.blockCount < 50 ? 5 : 0;

  // Density bonus: higher density = harder (blocks have fewer escape routes)
  // Max 10 pts at 100% density
  const densityBonus = analysis.density * 10;

  // Adjust blocker threshold based on grid size
  // Small grids: avg 2 blockers = max, Large grids: avg 8 blockers = max
  const blockerThreshold = 2 + (gridScale * 3); // ~2 for small, ~9.2 for 229 blocks

  const components = {
    // Blockers: scale to grid size, capped at 1.0x weight
    blockers: weights.blockers * Math.min(1.0, analysis.avgBlockers / blockerThreshold),

    // Locked %: 30%+ locked = max pts, 0% = 0pts
    // Locked blocks are the strongest difficulty indicator
    lockedPercent: weights.lockedPercent * Math.min(1.0, lockedRatio / 0.30),

    // Clearability: use square root to soften the curve
    // 0% clearable = max pts, 100% = 0pts
    // sqrt makes low clearability (common in large grids) less punishing
    clearability: weights.clearability * Math.sqrt(1 - analysis.initialClearability),

    // Direction variety: more unique directions = harder to reason about
    // 1 direction = 0pts, 6 directions = max pts
    // Also penalize puzzles with many bidirectional blocks (they're easier - more choices)
    directionVariety: weights.directionVariety * analysis.directionVariety * (1 - analysis.bidirectionalRatio * 0.5),

    // Density bonus (more packed = harder)
    densityBonus,

    // Size bonus (negative = reduces difficulty)
    sizeBonus: -sizeBonus,
  };

  const rawScore =
    components.blockers +
    components.lockedPercent +
    components.clearability +
    components.directionVariety +
    components.densityBonus;

  // Apply size bonus (subtract from raw score, min 0, max 100)
  const score = Math.round(Math.max(0, Math.min(100, rawScore - sizeBonus)));

  // Determine tier (adjusted thresholds for better distribution)
  let tier: 'easy' | 'medium' | 'hard' | 'superHard';
  if (score < 20) tier = 'easy';
  else if (score < 40) tier = 'medium';
  else if (score < 60) tier = 'hard';
  else tier = 'superHard';

  return { score, tier, components };
}

/**
 * Quick solvability check without full analysis (for generation)
 */
export function quickSolve(
  blocks: Map<string, SquareBlock>,
  holes: Set<string>,
  rows: number,
  cols: number
): { solvable: boolean; moves: number } {
  const remaining = new Map(blocks);
  let moves = 0;

  while (remaining.size > 0) {
    const clearable = getClearableBlocks(remaining, holes, rows, cols);
    if (clearable.length === 0) {
      return { solvable: false, moves };
    }
    // Clear first available
    remaining.delete(gridKey(clearable[0].coord));
    moves++;
  }

  return { solvable: true, moves };
}
