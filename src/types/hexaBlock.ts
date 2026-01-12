import { AxialCoord, HexDirection } from '@/lib/hexGrid';

// ============================================================================
// Core Types
// ============================================================================

// Bidirectional axis (two opposite directions)
export type HexAxis = 'NE_SW' | 'E_W' | 'SE_NW';

// Direction can be single or bidirectional
export type StackDirection = HexDirection | HexAxis;

// Game mode
export type GameMode = 'classic' | 'push';

// Carousel - rotates tiles on its arms clockwise
export interface Carousel {
  id: string;
  coord: AxialCoord;           // Center position of the carousel
  arms: HexDirection[];        // 2-6 directions where tiles can be rotated (clockwise order)
}

// Clockwise order of hex directions for rotation
export const CLOCKWISE_DIRECTIONS: HexDirection[] = ['NE', 'E', 'SE', 'SW', 'W', 'NW'];

// Get next direction in clockwise order
export function getNextClockwiseDirection(dir: HexDirection): HexDirection {
  const idx = CLOCKWISE_DIRECTIONS.indexOf(dir);
  return CLOCKWISE_DIRECTIONS[(idx + 1) % 6];
}

// Sort arms in clockwise order starting from first arm
export function sortArmsClockwise(arms: HexDirection[]): HexDirection[] {
  if (arms.length < 2) return arms;

  // Find indices in clockwise order
  const indices = arms.map(arm => CLOCKWISE_DIRECTIONS.indexOf(arm));

  // Sort by clockwise index
  const sorted = [...arms].sort((a, b) => {
    return CLOCKWISE_DIRECTIONS.indexOf(a) - CLOCKWISE_DIRECTIONS.indexOf(b);
  });

  return sorted;
}

// Generate unique carousel ID
export function generateCarouselId(): string {
  return `carousel-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export interface HexStack {
  id: string;
  coord: AxialCoord;
  direction: StackDirection;  // Can be single direction or bidirectional axis
  height: number;             // Visual stack height (1-3)
  color: string;              // Color for the stack
}

// Helper to check if direction is bidirectional
export function isBidirectional(dir: StackDirection): dir is HexAxis {
  return dir === 'NE_SW' || dir === 'E_W' || dir === 'SE_NW';
}

// Get the two directions from a bidirectional axis
export function getAxisDirections(axis: HexAxis): [HexDirection, HexDirection] {
  switch (axis) {
    case 'NE_SW': return ['NE', 'SW'];
    case 'E_W': return ['E', 'W'];
    case 'SE_NW': return ['SE', 'NW'];
  }
}

export interface HexaBlockLevel {
  id: string;
  name: string;
  gridRadius: number;              // Hexagonal grid radius (2-4)
  stacks: HexStack[];              // Initial stack configuration
  holes?: AxialCoord[];            // Hole positions - stacks fall in and disappear
  pauses?: AxialCoord[];           // Pause positions - stacks stop here and need another tap
  carousels?: Carousel[];          // Carousel positions - rotate adjacent tiles clockwise
  difficulty: 'tutorial' | 'easy' | 'medium' | 'hard';
  gameMode?: GameMode;             // 'classic' (default) or 'push'
  parMoves?: number;               // Target moves for optimal solution
  hint?: string;                   // Optional hint for the level
}

export interface AnimationData {
  stackId: string;
  phase: 'idle' | 'rolling' | 'bouncing' | 'exiting';
  // For rolling animation: the exit offset in pixels from original position
  exitOffset?: { x: number; y: number };
  // For bouncing animation: the blocker offset in pixels
  bounceOffset?: { x: number; y: number };
}

export interface HexaBlockState {
  level: HexaBlockLevel;
  stacks: Map<string, HexStack>;   // Current positions (keyed by "q,r")
  holes: Set<string>;              // Hole positions (keyed by "q,r")
  pauses: Set<string>;             // Pause cell positions (keyed by "q,r")
  carousels: Map<string, Carousel>; // Carousel positions (keyed by "q,r")
  pausedStacks: Set<string>;       // Stack IDs that are currently paused (need tap to continue)
  moveCount: number;               // Moves made
  moveLimit: number;               // Maximum moves allowed (0 = unlimited)
  isComplete: boolean;             // All stacks cleared
  isWon: boolean;                  // Level completed successfully
  isLost: boolean;                 // Ran out of moves before clearing
  history: Map<string, HexStack>[];// For undo functionality
  pausedStacksHistory: Set<string>[]; // History of paused stacks for undo
  animatingStack: string | null;   // Stack ID currently animating
  animationPhase: 'idle' | 'rolling' | 'bouncing' | 'exiting';
  animationData: AnimationData | null; // Extended animation data
}

// ============================================================================
// Color Palette for Stacks
// ============================================================================

export const STACK_COLORS = {
  cyan: '#06b6d4',
  purple: '#a855f7',
  amber: '#f59e0b',
  emerald: '#10b981',
  rose: '#f43f5e',
  blue: '#3b82f6',
} as const;

export type StackColor = keyof typeof STACK_COLORS;

// ============================================================================
// Utility Functions
// ============================================================================

export function generateStackId(): string {
  return `stack-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function createStack(
  coord: AxialCoord,
  direction: HexDirection,
  color: string,
  height: number = 1
): HexStack {
  return {
    id: generateStackId(),
    coord,
    direction,
    color,
    height,
  };
}

// ============================================================================
// Level Collection Types (for educational features)
// ============================================================================

export type FlowZone = 'flow' | 'boredom' | 'frustration';
export type DifficultyTier = 'easy' | 'medium' | 'hard' | 'superHard';

export interface LevelMetrics {
  cellCount: number;           // Number of hex cells
  holeCount: number;           // Number of holes
  pauseCount: number;          // Number of pause cells
  carouselCount: number;       // Number of carousels
  optimalMoves: number;        // Minimum moves to solve (cellCount + pause encounters)
  moveLimit: number;           // Total moves allowed (optimal + extra)
  moveBuffer: number;          // Extra moves beyond optimal (moveLimit - optimalMoves)
  moveBufferPercent: number;   // Buffer as percentage of optimal
  initialClearability: number; // 0-1 ratio of cells clearable at start
  difficulty: DifficultyTier;
  flowZone: FlowZone;
  sawtoothPosition: number;    // Position in 10-level cycle (1-10)
}

export interface DesignedLevel {
  id: string;
  name: string;
  levelNumber: number;         // 1-100 position in collection
  gridRadius: number;
  stacks: HexStack[];
  holes?: AxialCoord[];
  pauses?: AxialCoord[];       // Pause cell positions
  carousels?: Carousel[];      // Carousel rotators
  gameMode: GameMode;
  metrics: LevelMetrics;
  createdAt: number;           // Timestamp
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

// Get expected difficulty for a level number
export function getExpectedDifficulty(levelNumber: number): DifficultyTier {
  const position = ((levelNumber - 1) % 10) + 1;
  return SAWTOOTH_EXPECTED[position];
}

// Get sawtooth position (1-10) from level number
export function getSawtoothPosition(levelNumber: number): number {
  return ((levelNumber - 1) % 10) + 1;
}

// Calculate flow zone based on actual vs expected difficulty
export function calculateFlowZone(
  actualDifficulty: DifficultyTier,
  levelNumber: number
): FlowZone {
  const expected = getExpectedDifficulty(levelNumber);
  const difficultyRank: Record<DifficultyTier, number> = {
    easy: 1,
    medium: 2,
    hard: 3,
    superHard: 4,
  };

  const actualRank = difficultyRank[actualDifficulty];
  const expectedRank = difficultyRank[expected];
  const diff = actualRank - expectedRank;

  if (diff > 1) return 'frustration';  // Much harder than expected
  if (diff < -1) return 'boredom';     // Much easier than expected
  return 'flow';                        // Matches expectation (+/- 1)
}

// Get difficulty tier from clearability ratio only (legacy)
export function getDifficultyFromClearability(clearability: number): DifficultyTier {
  if (clearability >= 0.5) return 'easy';
  if (clearability >= 0.2) return 'medium';
  if (clearability >= 0.05) return 'hard';
  return 'superHard';
}

// ============================================================================
// Time & Attempt Estimation (based on industry benchmarks)
// ============================================================================

// Estimated seconds per move based on difficulty
// Easy: quick decisions (3-4s), Hard: careful analysis (5-8s)
const SECONDS_PER_MOVE: Record<DifficultyTier, [number, number]> = {
  easy: [3, 4],
  medium: [4, 5],
  hard: [5, 7],
  superHard: [6, 8],
};

// Attempt ranges from DIFFICULTY_TIERS in constants.ts
const ATTEMPT_RANGES: Record<DifficultyTier, [number, number]> = {
  easy: [1, 3],
  medium: [4, 8],
  hard: [9, 20],
  superHard: [20, 35],
};

// Win rate targets from framework
const WIN_RATES: Record<DifficultyTier, [number, number]> = {
  easy: [70, 90],
  medium: [40, 60],
  hard: [25, 40],
  superHard: [20, 30],
};

export interface LevelEstimation {
  // Time estimates (in seconds)
  minTimePerAttempt: number;
  maxTimePerAttempt: number;
  avgTimePerAttempt: number;
  // Including retries
  minTotalTime: number;
  maxTotalTime: number;
  avgTotalTime: number;
  // Attempt estimates
  minAttempts: number;
  maxAttempts: number;
  avgAttempts: number;
  // Win rate targets
  targetWinRate: [number, number];
  // Formatted strings for display
  timePerAttemptDisplay: string;
  totalTimeDisplay: string;
  attemptsDisplay: string;
}

// Calculate time and attempt estimates for a level
export function estimateLevel(
  moveLimit: number,
  difficulty: DifficultyTier,
  cellCount: number
): LevelEstimation {
  const [minSecPerMove, maxSecPerMove] = SECONDS_PER_MOVE[difficulty];
  const [minAttempts, maxAttempts] = ATTEMPT_RANGES[difficulty];
  const targetWinRate = WIN_RATES[difficulty];

  // Complexity modifier: larger levels take slightly longer per move
  const complexityMod = cellCount > 30 ? 1.2 : cellCount > 20 ? 1.1 : 1.0;

  // Time per single attempt
  const minTimePerAttempt = Math.round(moveLimit * minSecPerMove * complexityMod);
  const maxTimePerAttempt = Math.round(moveLimit * maxSecPerMove * complexityMod);
  const avgTimePerAttempt = Math.round((minTimePerAttempt + maxTimePerAttempt) / 2);

  // Average attempts (geometric mean for log-normal distribution typical of game attempts)
  const avgAttempts = Math.round(Math.sqrt(minAttempts * maxAttempts));

  // Total time including retries (assume partial attempts are ~60% of full)
  const retryMultiplier = 0.6;
  const minTotalTime = Math.round(minTimePerAttempt * (1 + (minAttempts - 1) * retryMultiplier));
  const maxTotalTime = Math.round(maxTimePerAttempt * (1 + (maxAttempts - 1) * retryMultiplier));
  const avgTotalTime = Math.round(avgTimePerAttempt * (1 + (avgAttempts - 1) * retryMultiplier));

  // Format display strings
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

// Get difficulty tier considering both clearability AND move buffer
// Move buffer has MAJOR impact - it's the primary difficulty lever
export function calculateDifficulty(
  clearability: number,
  cellCount: number,
  moveBufferPercent: number
): DifficultyTier {
  // Start with base difficulty from clearability (minor factor)
  const tiers: DifficultyTier[] = ['easy', 'medium', 'hard', 'superHard'];
  let baseTierIndex: number;

  if (clearability >= 0.5) baseTierIndex = 0; // easy
  else if (clearability >= 0.2) baseTierIndex = 1; // medium
  else if (clearability >= 0.05) baseTierIndex = 2; // hard
  else baseTierIndex = 3; // superHard

  // Calculate buffer impact (MAJOR factor - dominates difficulty)
  // Move buffer is the primary way players feel difficulty
  // Even an easy puzzle becomes hard with tight move limits
  let bufferAdjustment = 0;

  // Size modifier: larger levels need more buffer to feel the same difficulty
  const sizeModifier = cellCount >= 30 ? 1 : cellCount >= 15 ? 0.5 : 0;

  if (moveBufferPercent >= 100) {
    // Very generous buffer (double the optimal) = much easier
    bufferAdjustment = -2;
  } else if (moveBufferPercent >= 60) {
    // Generous buffer = easier
    bufferAdjustment = -1;
  } else if (moveBufferPercent >= 40) {
    // Comfortable buffer = no change
    bufferAdjustment = 0;
  } else if (moveBufferPercent >= 25) {
    // Moderate buffer = slightly harder
    bufferAdjustment = 1;
  } else if (moveBufferPercent >= 15) {
    // Tight buffer = harder
    bufferAdjustment = 2;
  } else if (moveBufferPercent >= 5) {
    // Very tight buffer = very hard
    bufferAdjustment = 2 + Math.round(sizeModifier);
  } else {
    // Near-zero buffer (0-5%) = extremely hard, especially for larger levels
    bufferAdjustment = 3 + Math.round(sizeModifier);
  }

  // Apply adjustment and clamp to valid range
  const finalTierIndex = Math.max(0, Math.min(3, baseTierIndex + bufferAdjustment));
  return tiers[finalTierIndex];
}
