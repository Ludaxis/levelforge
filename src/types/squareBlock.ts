import { GridCoord, SquareDirection, SquareAxis } from '@/lib/squareGrid';

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
  return `block-${crypto.randomUUID()}`;
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

export type { FlowZone, DifficultyTier } from './shared';
import type { FlowZone, DifficultyTier } from './shared';

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

export { SAWTOOTH_EXPECTED, getExpectedDifficulty, getSawtoothPosition } from './shared';
export { getDifficultyFromClearability } from './shared';
export { calculateFlowZone, estimateLevel, calculateDifficulty } from '@/lib/squareBlockMetrics';
export type { LevelEstimation } from '@/lib/squareBlockMetrics';
