import { GridCoord, SquareDirection, SquareAxis } from '@/lib/squareGrid';

// Re-export puzzle analysis types
export type {
  PuzzleAnalysis,
  DifficultyBreakdown,
} from '@/lib/puzzleAnalyzer';

export {
  analyzePuzzle,
  calculateDifficultyScore,
  quickSolve,
} from '@/lib/puzzleAnalyzer';

// ============================================================================
// Core Types
// ============================================================================

// Direction can be single or bidirectional
export type BlockDirection = SquareDirection | SquareAxis;

// Game mode
export type GameMode = 'classic' | 'push';

export interface SquareBlock {
  id: string;
  coord: GridCoord;
  direction: BlockDirection;  // Can be single direction or bidirectional axis
  color: string;              // Color for the block
  locked?: boolean;           // If true, block can only be tapped when all neighbors are cleared
  iceCount?: number;          // Number of clears needed to unfreeze (e.g., 10). Mutually exclusive with locked.
  mirror?: boolean;           // If true, block moves in OPPOSITE direction of arrow. Can combine with locked/iced.
  // Reference-format extras
  mechanic?: number;          // Raw mechanic code from import/export (e.g., 3 = locked)
  mechanicExtras?: string;    // Raw mechanic extras (e.g., "60" for timed unlock)
  unlockAfterMoves?: number;  // Parsed timed-unlock threshold (moves)
}

export interface SquareBlockLevel {
  id: string;
  name: string;
  rows: number;               // Grid rows (3-10)
  cols: number;               // Grid columns (3-10)
  blocks: SquareBlock[];      // Initial block configuration
  holes?: GridCoord[];        // Hole positions - blocks fall in and disappear
  difficulty: 'tutorial' | 'easy' | 'medium' | 'hard';
  gameMode?: GameMode;        // 'classic' (default) or 'push'
  parMoves?: number;          // Target moves for optimal solution
  hint?: string;              // Optional hint for the level
}

export interface AnimationData {
  blockId: string;
  phase: 'idle' | 'rolling' | 'bouncing' | 'pushing' | 'exiting';
  exitOffset?: { x: number; y: number };
  bounceOffset?: { x: number; y: number };
  bouncePhase?: 'out' | 'back';  // For JS-controlled bounce animation
  pushOffset?: { x: number; y: number };
}

// Maximum mistakes allowed before game over
export const MAX_MISTAKES = 3;

export interface SquareBlockState {
  level: SquareBlockLevel;
  blocks: Map<string, SquareBlock>;   // Current positions (keyed by "row,col")
  holes: Set<string>;                  // Hole positions (keyed by "row,col")
  moveCount: number;                   // Successful moves made (blocks cleared)
  mistakes: number;                    // Mistakes made (tapping blocked blocks)
  isComplete: boolean;                 // All blocks cleared
  isWon: boolean;                      // Level completed successfully
  isLost: boolean;                     // Made too many mistakes
  history: Map<string, SquareBlock>[]; // For undo functionality
  animatingBlock: string | null;       // Block ID currently animating
  animationPhase: 'idle' | 'rolling' | 'bouncing' | 'pushing' | 'exiting';
  animationData: AnimationData | null;
  lastMistakeBlockId: string | null;   // Block that was just mistakenly tapped (for shake animation)
}

// ============================================================================
// Color Palette for Blocks
// ============================================================================

export const BLOCK_COLORS = {
  cyan: '#06b6d4',
  purple: '#a855f7',
  amber: '#f59e0b',
  emerald: '#10b981',
  rose: '#f43f5e',
  blue: '#3b82f6',
} as const;

export type BlockColor = keyof typeof BLOCK_COLORS;

// ============================================================================
// Utility Functions
// ============================================================================

export function generateBlockId(): string {
  return `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function createBlock(
  coord: GridCoord,
  direction: SquareDirection,
  color: string
): SquareBlock {
  return {
    id: generateBlockId(),
    coord,
    direction,
    color,
  };
}

// ============================================================================
// Level Collection Types (for educational features)
// ============================================================================

export type FlowZone = 'flow' | 'boredom' | 'frustration';
export type DifficultyTier = 'easy' | 'medium' | 'hard' | 'superHard';

export interface LevelMetrics {
  cellCount: number;
  holeCount: number;
  lockedCount: number;
  icedCount: number;              // Number of iced blocks
  mirrorCount: number;            // Number of mirror blocks
  gridSize: number;
  density: number;
  initialClearability: number;
  solutionCount: number;
  avgBranchingFactor: number;
  forcedMoveRatio: number;
  solutionDepth: number;
  difficultyScore: number;       // 0-100 score
  difficulty: DifficultyTier;    // Tier from score
  flowZone: FlowZone;
  sawtoothPosition: number;
}

// Difficulty target ranges for generation
export const DIFFICULTY_RANGES: Record<DifficultyTier, { min: number; max: number }> = {
  easy: { min: 0, max: 19 },
  medium: { min: 20, max: 39 },
  hard: { min: 40, max: 59 },
  superHard: { min: 60, max: 100 },
};

export interface DesignedLevel {
  id: string;
  name: string;
  levelNumber: number;
  rows: number;
  cols: number;
  blocks: SquareBlock[];
  holes?: GridCoord[];
  gameMode: GameMode;
  metrics: LevelMetrics;
  createdAt: number;
}

// Sawtooth cycle expected difficulty for each position (1-10)
export const SAWTOOTH_EXPECTED: Record<number, DifficultyTier> = {
  1: 'easy',
  2: 'easy',
  3: 'medium',
  4: 'medium',
  5: 'hard',
  6: 'medium',
  7: 'medium',
  8: 'hard',
  9: 'hard',
  10: 'superHard',
};

export function getExpectedDifficulty(levelNumber: number): DifficultyTier {
  const position = ((levelNumber - 1) % 10) + 1;
  return SAWTOOTH_EXPECTED[position];
}

export function getSawtoothPosition(levelNumber: number): number {
  return ((levelNumber - 1) % 10) + 1;
}

export function calculateFlowZone(
  actualDifficulty: DifficultyTier,
  levelNumber: number
): FlowZone {
  const expected = getExpectedDifficulty(levelNumber);

  // Exact match = flow
  if (actualDifficulty === expected) return 'flow';

  const difficultyRank: Record<DifficultyTier, number> = {
    easy: 1,
    medium: 2,
    hard: 3,
    superHard: 4,
  };

  const actualRank = difficultyRank[actualDifficulty];
  const expectedRank = difficultyRank[expected];

  // Harder than expected = frustration (too hard)
  if (actualRank > expectedRank) return 'frustration';
  // Easier than expected = boredom (too easy)
  return 'boredom';
}

export function getDifficultyFromClearability(clearability: number): DifficultyTier {
  if (clearability >= 0.5) return 'easy';
  if (clearability >= 0.2) return 'medium';
  if (clearability >= 0.05) return 'hard';
  return 'superHard';
}

// ============================================================================
// Time & Attempt Estimation
// ============================================================================

const SECONDS_PER_MOVE: Record<DifficultyTier, [number, number]> = {
  easy: [3, 4],
  medium: [4, 5],
  hard: [5, 7],
  superHard: [6, 8],
};

const ATTEMPT_RANGES: Record<DifficultyTier, [number, number]> = {
  easy: [1, 3],
  medium: [4, 8],
  hard: [9, 20],
  superHard: [20, 35],
};

const WIN_RATES: Record<DifficultyTier, [number, number]> = {
  easy: [70, 90],
  medium: [40, 60],
  hard: [25, 40],
  superHard: [20, 30],
};

export interface LevelEstimation {
  minTimePerAttempt: number;
  maxTimePerAttempt: number;
  avgTimePerAttempt: number;
  minTotalTime: number;
  maxTotalTime: number;
  avgTotalTime: number;
  minAttempts: number;
  maxAttempts: number;
  avgAttempts: number;
  targetWinRate: [number, number];
  timePerAttemptDisplay: string;
  totalTimeDisplay: string;
  attemptsDisplay: string;
}

export function estimateLevel(
  difficulty: DifficultyTier,
  cellCount: number
): LevelEstimation {
  const [minSecPerMove, maxSecPerMove] = SECONDS_PER_MOVE[difficulty];
  const [minAttempts, maxAttempts] = ATTEMPT_RANGES[difficulty];
  const targetWinRate = WIN_RATES[difficulty];

  const complexityMod = cellCount > 30 ? 1.2 : cellCount > 20 ? 1.1 : 1.0;

  // Use cellCount as the number of moves needed (one move per block)
  const minTimePerAttempt = Math.round(cellCount * minSecPerMove * complexityMod);
  const maxTimePerAttempt = Math.round(cellCount * maxSecPerMove * complexityMod);
  const avgTimePerAttempt = Math.round((minTimePerAttempt + maxTimePerAttempt) / 2);

  const avgAttempts = Math.round(Math.sqrt(minAttempts * maxAttempts));

  const retryMultiplier = 0.6;
  const minTotalTime = Math.round(minTimePerAttempt * (1 + (minAttempts - 1) * retryMultiplier));
  const maxTotalTime = Math.round(maxTimePerAttempt * (1 + (maxAttempts - 1) * retryMultiplier));
  const avgTotalTime = Math.round(avgTimePerAttempt * (1 + (avgAttempts - 1) * retryMultiplier));

  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  };

  return {
    minTimePerAttempt,
    maxTimePerAttempt,
    avgTimePerAttempt,
    minTotalTime,
    maxTotalTime,
    avgTotalTime,
    minAttempts,
    maxAttempts,
    avgAttempts,
    targetWinRate,
    timePerAttemptDisplay: `${formatTime(minTimePerAttempt)} - ${formatTime(maxTimePerAttempt)}`,
    totalTimeDisplay: `${formatTime(minTotalTime)} - ${formatTime(maxTotalTime)}`,
    attemptsDisplay: minAttempts === maxAttempts ? `${minAttempts}` : `${minAttempts}-${maxAttempts}`,
  };
}

// ============================================================================
// Difficulty Calculation
// ============================================================================

export function calculateDifficulty(
  clearability: number,
  cellCount: number
): DifficultyTier {
  const tiers: DifficultyTier[] = ['easy', 'medium', 'hard', 'superHard'];

  // Base tier from clearability
  let baseTierIndex: number;
  if (clearability >= 0.5) baseTierIndex = 0;      // easy
  else if (clearability >= 0.2) baseTierIndex = 1; // medium
  else if (clearability >= 0.05) baseTierIndex = 2; // hard
  else baseTierIndex = 3;                          // superHard

  // Size modifier - larger puzzles are harder (more chances for mistakes)
  const sizeAdjustment = cellCount >= 40 ? 1 : cellCount >= 25 ? 0.5 : 0;

  const finalTierIndex = Math.min(3, Math.round(baseTierIndex + sizeAdjustment));
  return tiers[finalTierIndex];
}
