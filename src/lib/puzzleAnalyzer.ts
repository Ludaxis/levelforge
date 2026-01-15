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

/**
 * Greedy solve that also collects metrics (branching factors, forced moves)
 */
function greedySolveWithMetrics(
  blocks: Map<string, SquareBlock>,
  holes: Set<string>,
  rows: number,
  cols: number
): { solvable: boolean; branchingFactors: number[]; forcedMoveCount: number } {
  const remaining = new Map(blocks);
  const branchingFactors: number[] = [];
  let forcedMoveCount = 0;

  while (remaining.size > 0) {
    const clearable = getClearableBlocks(remaining, holes, rows, cols);
    if (clearable.length === 0) {
      return { solvable: false, branchingFactors, forcedMoveCount };
    }
    branchingFactors.push(clearable.length);
    if (clearable.length === 1) forcedMoveCount++;
    // Clear first available (greedy)
    remaining.delete(gridKey(clearable[0].coord));
  }

  return { solvable: true, branchingFactors, forcedMoveCount };
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

  // For sampling mode, use greedy solve for solvability + sampling for metrics
  if (useSampling) {
    // First, use greedy approach to check solvability (more reliable than random sampling)
    const greedy = greedySolveWithMetrics(blocks, holes, rows, cols);

    if (greedy.solvable) {
      solutionCount = 1; // At least one solution exists
      branchingFactors.push(...greedy.branchingFactors);
      forcedMoveCount = greedy.forcedMoveCount;
    } else {
      // Try a few random samples in case greedy path hits a dead end
      const sampleCount = 50;
      for (let sample = 0; sample < sampleCount && solutionCount === 0; sample++) {
        const remaining = new Map(blocks);
        let pathValid = true;
        const sampleBranching: number[] = [];
        let sampleForced = 0;

        while (remaining.size > 0 && pathValid) {
          const clearable = getClearableBlocks(remaining, holes, rows, cols);

          if (clearable.length === 0) {
            pathValid = false;
            bottleneckCount++;
          } else {
            sampleBranching.push(clearable.length);
            if (clearable.length === 1) sampleForced++;

            // Random selection
            const chosen = clearable[Math.floor(Math.random() * clearable.length)];
            remaining.delete(gridKey(chosen.coord));
          }
        }

        if (pathValid) {
          solutionCount = 1;
          branchingFactors.push(...sampleBranching);
          forcedMoveCount = sampleForced;
        }
      }
    }
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

export interface DifficultyBreakdown {
  score: number;           // Normalized 0-100
  rawScore: number;        // Raw sum before capping
  tier: 'easy' | 'medium' | 'hard' | 'superHard';
  components: {
    avgBlockers: number;      // Average blockers per block (primary factor)
    clearability: number;     // Initial clearability percentage
    blockCount: number;       // Number of blocks
    lockedCount: number;      // Number of locked blocks
    sizeBonus: number;        // Extra points for large puzzles (400+ blocks)
  };
}

/**
 * Calculate difficulty score (0-100) from puzzle analysis
 *
 * Based on analysis of real Unity game levels:
 * - Level 1 (Easy): 34 blocks, 1.4 avg blockers, 41% clearability → ~19
 * - Level 5 (Medium): 229 blocks, 4.7 avg blockers, 12% clearability → ~44
 * - Level 35 (Hard): 644 blocks, 8.6 avg blockers, 6.5% clearability → ~73
 *
 * Formula:
 *   avgBlockersScore = avgBlockers × 4.5           (primary factor, ~0-45 range)
 *   clearabilityScore = (1 - clearability) × 20    (0-20 range)
 *   blockCountScore = min(blockCount / 40, 10)     (0-10 range, capped)
 *   lockedBonus = min(lockedCount, 5)              (0-5 range)
 *   sizeBonus = (blockCount > 400) ? min((blockCount-400)/20, 20) : 0  (0-20 for large puzzles)
 *
 *   difficulty = min(sum of above, 100)
 *
 * Size bonus makes very large puzzles (400+ blocks) appropriately harder:
 *   - 400 blocks: +0
 *   - 600 blocks: +10
 *   - 800 blocks: +20 (capped)
 *
 * Tiers: 0-24 Easy, 25-49 Medium, 50-74 Hard, 75+ Super Hard
 */
export function calculateDifficultyScore(
  analysis: PuzzleAnalysis
): DifficultyBreakdown {
  if (!analysis.solvable || analysis.blockCount === 0) {
    return {
      score: 0,
      rawScore: 0,
      tier: 'easy',
      components: {
        avgBlockers: 0,
        clearability: 0,
        blockCount: 0,
        lockedCount: 0,
        sizeBonus: 0,
      },
    };
  }

  const { blockCount, lockedCount, initialClearability } = analysis;
  const avgBlockers = analysis.avgBlockers;

  // Primary factor: average blockers per block (most important)
  // Scales roughly 1.4 (easy) → 4.7 (medium) → 8.6 (hard)
  const avgBlockersScore = avgBlockers * 4.5;

  // Clearability penalty: lower clearability = harder
  // 0% clearable = 20 points, 100% clearable = 0 points
  const clearabilityScore = (1 - initialClearability) * 20;

  // Block count contribution (capped to prevent dominating)
  const blockCountScore = Math.min(blockCount / 40, 10);

  // Locked blocks bonus (capped)
  const lockedBonus = Math.min(lockedCount, 5);

  // Size bonus for large puzzles (400+ blocks)
  // Very large puzzles are inherently harder due to more decisions & mistakes
  const sizeBonus = blockCount > 400 ? Math.min((blockCount - 400) / 20, 20) : 0;

  const components = {
    avgBlockers,
    clearability: initialClearability,
    blockCount,
    lockedCount,
    sizeBonus,
  };

  // Raw score = sum of all components
  const rawScore = avgBlockersScore + clearabilityScore + blockCountScore + lockedBonus + sizeBonus;

  // Cap at 100
  const score = Math.round(Math.max(0, Math.min(100, rawScore)));

  // Determine tier based on score
  let tier: 'easy' | 'medium' | 'hard' | 'superHard';
  if (score < 25) tier = 'easy';
  else if (score < 50) tier = 'medium';
  else if (score < 75) tier = 'hard';
  else tier = 'superHard';

  return { score, rawScore, tier, components };
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
