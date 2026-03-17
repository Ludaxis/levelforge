import { AxialCoord, HexDirection } from '@/lib/hexGrid';

// ============================================================================
// Core Types
// ============================================================================

// Bidirectional axis (two opposite directions)
export type HexAxis = 'NE_SW' | 'E_W' | 'SE_NW';

// Rotation angles for bidirectional axes (for rendering, degrees)
export const AXIS_ANGLES: Record<HexAxis, number> = {
  E_W: 0,
  NE_SW: -60,
  SE_NW: 60,
};

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
  return `carousel-${crypto.randomUUID()}`;
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
  return `stack-${crypto.randomUUID()}`;
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

export type { FlowZone, DifficultyTier } from './shared';
import type { FlowZone, DifficultyTier } from './shared';

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

export { SAWTOOTH_EXPECTED, getExpectedDifficulty, getSawtoothPosition } from './shared';
export { getDifficultyFromClearability } from './shared';
export { calculateFlowZone, estimateLevel, calculateDifficulty } from '@/lib/hexBlockMetrics';
export type { LevelEstimation } from '@/lib/hexBlockMetrics';
