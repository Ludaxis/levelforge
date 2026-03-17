import { FlowZone } from './shared';

// ============================================================================
// Difficulty Tiers (extended for Fruit Match)
// ============================================================================

// Extended difficulty tier for more granular difficulty in Fruit Match
export type DifficultyTier = 'trivial' | 'easy' | 'medium' | 'hard' | 'expert' | 'nightmare';

// ============================================================================
// Fruit Types and Colors
// ============================================================================

// Fruit types mapped to ColorType enum:
// Blue=0, Orange=1, Red=2, Pink=3, Yellow=4, Green=5, Violet=6, White=7, Black=8
export type FruitType = 'blueberry' | 'orange' | 'strawberry' | 'dragonfruit' | 'banana' | 'apple' | 'plum' | 'pear' | 'blackberry';

export const FRUIT_EMOJI: Record<FruitType, string> = {
  blueberry: '🫐',     // Blue (ColorType 0)
  orange: '🍊',        // Orange (ColorType 1)
  strawberry: '🍓',    // Red (ColorType 2)
  dragonfruit: '🐉',   // Pink (ColorType 3) - dragon
  banana: '🍌',        // Yellow (ColorType 4)
  apple: '🍏',         // Green (ColorType 5)
  plum: '🍇',          // Purple/Violet (ColorType 6) - grape
  pear: '🍐',          // Cream/White (ColorType 7) - pear
  blackberry: '🫒',    // Dark/Black (ColorType 8) - olive
};

export const FRUIT_COLORS: Record<FruitType, string> = {
  blueberry: '#4C9EF2',    // Blue (ColorType 0)
  orange: '#F99D00',       // Orange (ColorType 1)
  strawberry: '#DF4624',   // Red (ColorType 2)
  dragonfruit: '#DE4C7E',  // Pink (ColorType 3)
  banana: '#F3DE00',       // Yellow (ColorType 4)
  apple: '#90CA00',        // Green (ColorType 5)
  plum: '#8E68E0',         // Purple/Violet (ColorType 6)
  pear: '#FFFBF7',         // Cream/White (ColorType 7)
  blackberry: '#4C4343',   // Dark/Black (ColorType 8)
};

// Ordered by ColorType enum value (0-8)
export const ALL_FRUITS: FruitType[] = ['blueberry', 'orange', 'strawberry', 'dragonfruit', 'banana', 'apple', 'plum', 'pear', 'blackberry'];

// 3 variant names per color type (for Studio item pool)
export const VARIANT_NAMES: Record<FruitType, [string, string, string]> = {
  blueberry: ['Blueberry', 'Fig', 'Grape'],
  orange: ['Orange', 'Persimmon', 'Mango'],
  strawberry: ['Strawberry', 'Cherry', 'Tomato'],
  dragonfruit: ['Dragon Fruit', 'Peach', 'Bell Fruit'],
  banana: ['Banana', 'Lemon', 'Carambola'],
  apple: ['Apple', 'Avocado', 'Gooseberry'],
  plum: ['Plum', 'Passion Fruit', 'Mangosteen'],
  pear: ['Pear', 'White Strawberry', 'Snowberry'],
  blackberry: ['Blackberry', 'Olive', 'Blackcurrant'],
};

// ============================================================================
// Pixel Art Types
// ============================================================================

export interface PixelCell {
  row: number;
  col: number;
  fruitType: FruitType;
  filled: boolean;
  groupId?: number; // Optional group assignment for manual launcher ordering
  colorHex?: string; // Original artwork hex color (without #), used for accurate rendering
  colorType?: number; // Original artwork ColorType (may exceed 0-8 range)
}

// ============================================================================
// Sink (Stacked Tiles) Types
// ============================================================================

export interface SinkTile {
  id: string;
  fruitType: FruitType;
  stackIndex: number;  // 0 = top (visible/pickable)
  position: number;    // column in sink (0 to sinkWidth-1)
}

// ============================================================================
// Launcher Types
// ============================================================================

// Launcher capacities - how many pixels each launcher can fill
export type LauncherCapacity = 20 | 40 | 60 | 80 | 100;
export const LAUNCHER_CAPACITIES: LauncherCapacity[] = [20, 40, 60, 80, 100];

export interface Launcher {
  id: string;
  requiredFruit: FruitType;
  capacity: LauncherCapacity;  // How many pixels this launcher fills when shot
  position: number;  // 0-3 (left to right), 0 is the one to shoot next
  groupId?: number;  // Optional group ID for targeting specific pixel groups
}

// ============================================================================
// Launcher Order Configuration Types
// ============================================================================

// Pixel group for organizing colors into unlock stages
export interface PixelGroup {
  id: number;
  name: string;
  colorTypes: FruitType[];
  order: number; // Display/processing order
}

// Unlock stage - defines which groups reveal first
export interface UnlockStage {
  id: number;
  name: string;
  groupIds: number[]; // Groups included in this stage
}

// Launcher with explicit ordering
export interface ExplicitLauncherConfig {
  id: string;
  fruitType: FruitType;
  capacity: LauncherCapacity;
  groupId: number;
  orderIndex: number;
}

// Complete launcher order configuration
export interface LauncherOrderConfig {
  mode: 'auto' | 'manual';
  groups: PixelGroup[];
  launchers: ExplicitLauncherConfig[];
  unlockStages: UnlockStage[];
}

// ============================================================================
// Level Configuration Types
// ============================================================================

export interface FruitMatchLevel {
  id: string;
  name: string;
  pixelArt: PixelCell[];           // Target pattern (cells to fill)
  pixelArtWidth: number;           // Grid width of pixel art
  pixelArtHeight: number;          // Grid height of pixel art
  sinkWidth: number;               // Number of columns in sink
  sinkStacks: SinkTile[][];        // Initial stacked tiles per column
  waitingStandSlots: number;       // Number of slots (5-9)
  difficulty: DifficultyTier;
  launcherOrderConfig?: LauncherOrderConfig; // Optional manual launcher ordering
}

// ============================================================================
// Game State Types
// ============================================================================

export type AnimationPhase =
  | 'idle'
  | 'picking'      // Tile moving from sink to waiting stand
  | 'matching'     // 3 tiles glowing/combining
  | 'shooting'     // Launcher shooting to pixel art
  | 'conveyor';    // Launchers shifting

// ============================================================================
// Shooting Animation Types (Portal-based with fixed positioning)
// ============================================================================

// Viewport position (fixed coordinates relative to viewport)
export interface ViewportPosition {
  x: number;
  y: number;
}

// Target with pre-computed viewport position
export interface TargetWithPosition {
  cell: PixelCell;
  position: ViewportPosition;
}

// Complete shooting config - immutable once created
export interface ShootingConfig {
  id: string;
  launcherId: string;  // Which launcher is shooting (for parallel tracking)
  sourcePosition: ViewportPosition;
  targets: TargetWithPosition[];
  fruitType: FruitType;
  color: string;
  bulletDelay: number;
  bulletFlightTime: number;
}

// Launcher config for queue (imported from fruitMatchUtils, defined here for state)
export interface LauncherConfig {
  fruitType: FruitType;
  capacity: LauncherCapacity;
  groupId?: number;  // Optional group ID for targeting specific pixel groups
}

// Track tiles collected for each launcher
export interface LauncherProgress {
  launcherId: string;
  collectedTiles: SinkTile[];  // Tiles collected (0-2, auto-shoots at 3)
}

export interface FruitMatchState {
  level: FruitMatchLevel;
  pixelArt: PixelCell[];           // Current fill state
  sinkStacks: SinkTile[][];        // Remaining tiles in sink
  waitingStand: SinkTile[];        // Only for tiles that don't match any launcher
  launchers: Launcher[];           // 4 active launchers (visible)
  launcherProgress: LauncherProgress[];  // Tiles collected per launcher
  launcherQueue: LauncherConfig[]; // Upcoming launcher configs (queue of remaining)
  moveCount: number;               // Tiles picked
  matchCount: number;              // Successful matches made
  isComplete: boolean;             // All pixels filled
  isWon: boolean;                  // Level completed successfully
  isLost: boolean;                 // Waiting stand full + no valid match
  animatingTile: string | null;    // Tile ID currently animating
  animationPhase: AnimationPhase;
  lastMatchedFruit: FruitType | null;
  lastMatchedCapacity: LauncherCapacity | null;  // Capacity of last matched launcher
  lastMatchedLauncherId: string | null;  // ID of launcher that matched
}

// ============================================================================
// Level Design Types
// ============================================================================

export interface FruitMatchLevelMetrics {
  totalPixels: number;           // Number of pixels to fill
  uniqueFruitTypes: number;      // Number of unique fruit types in pixel art
  fruitDistribution: Record<FruitType, number>;  // Count per fruit
  totalTilesInSink: number;      // Total tiles available
  waitingStandSlots: number;     // Slots available
  estimatedMatches: number;      // totalPixels (one match = one pixel)
  difficultyScore: number;       // 0-100
  difficulty: DifficultyTier;
}

export interface DesignedFruitMatchLevel {
  id: string;
  name: string;
  levelNumber: number;
  pixelArt: PixelCell[];
  pixelArtWidth: number;
  pixelArtHeight: number;
  sinkWidth: number;
  sinkStacks: SinkTile[][];
  waitingStandSlots: number;
  metrics: FruitMatchLevelMetrics;
  createdAt: number;
  launcherOrderConfig?: LauncherOrderConfig; // Optional manual launcher ordering
}

// ============================================================================
// Utility Functions
// ============================================================================

export function generateTileId(): string {
  return `tile-${crypto.randomUUID()}`;
}

export function generateLauncherId(): string {
  return `launcher-${crypto.randomUUID()}`;
}

export function pixelKey(row: number, col: number): string {
  return `${row},${col}`;
}

// ============================================================================
// Difficulty Calculation
// ============================================================================

export function calculateFruitMatchDifficulty(
  totalPixels: number,
  uniqueFruits: number
): { score: number; tier: DifficultyTier } {
  // Factors:
  // 1. More pixels = harder (more matches needed)
  // 2. More fruit types = harder (more variety to manage)

  // Base score from pixel count (0-55 points)
  const pixelScore = Math.min(55, totalPixels / 1.5);

  // Variety score (0-45 points)
  const varietyScore = Math.min(45, uniqueFruits * 7.5);

  const score = Math.min(100, Math.round(pixelScore + varietyScore));

  let tier: DifficultyTier;
  if (score < 20) tier = 'trivial';
  else if (score < 35) tier = 'easy';
  else if (score < 50) tier = 'medium';
  else if (score < 65) tier = 'hard';
  else if (score < 80) tier = 'expert';
  else tier = 'nightmare';

  return { score, tier };
}

// ============================================================================
// Re-export shared types
// ============================================================================

export type { FlowZone };
