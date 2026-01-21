import { FlowZone } from './squareBlock';

// ============================================================================
// Difficulty Tiers (extended for Fruit Match)
// ============================================================================

// Extended difficulty tier for more granular difficulty in Fruit Match
export type DifficultyTier = 'trivial' | 'easy' | 'medium' | 'hard' | 'expert' | 'nightmare';

// ============================================================================
// Fruit Types and Colors
// ============================================================================

export type FruitType = 'apple' | 'orange' | 'lemon' | 'grape' | 'cherry' | 'kiwi' | 'white' | 'black';

export const FRUIT_EMOJI: Record<FruitType, string> = {
  apple: '🍎',
  orange: '🍊',
  lemon: '🍋',
  grape: '🍇',
  cherry: '🍒',
  kiwi: '🥝',
  white: '⬜',
  black: '⬛',
};

export const FRUIT_COLORS: Record<FruitType, string> = {
  apple: '#DD4422',    // Red (reference format)
  orange: '#FA9E00',   // Orange (reference format)
  lemon: '#EAB308',    // Yellow
  grape: '#8B5CF6',    // Purple/Violet
  cherry: '#DF4C7C',   // Pink (reference format)
  kiwi: '#22C55E',     // Green
  white: '#FFFAFA',    // White (reference format)
  black: '#4C4141',    // Dark/Black (reference format)
};

export const ALL_FRUITS: FruitType[] = ['apple', 'orange', 'lemon', 'grape', 'cherry', 'kiwi', 'white', 'black'];

// ============================================================================
// Pixel Art Types
// ============================================================================

export interface PixelCell {
  row: number;
  col: number;
  fruitType: FruitType;
  filled: boolean;
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
}

// ============================================================================
// Utility Functions
// ============================================================================

export function generateTileId(): string {
  return `tile-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function generateLauncherId(): string {
  return `launcher-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function pixelKey(row: number, col: number): string {
  return `${row},${col}`;
}

// ============================================================================
// Difficulty Calculation
// ============================================================================

export function calculateFruitMatchDifficulty(
  totalPixels: number,
  waitingStandSlots: number,
  uniqueFruits: number
): { score: number; tier: DifficultyTier } {
  // Factors:
  // 1. More pixels = harder (more matches needed)
  // 2. Fewer waiting slots = harder (less room for error)
  // 3. More fruit types = harder (more variety to manage)

  // Base score from pixel count (0-40 points)
  const pixelScore = Math.min(40, totalPixels / 2);

  // Slot penalty (0-30 points) - fewer slots = harder
  const slotScore = Math.max(0, (9 - waitingStandSlots) * 6);

  // Variety score (0-30 points)
  const varietyScore = Math.min(30, uniqueFruits * 5);

  const score = Math.min(100, Math.round(pixelScore + slotScore + varietyScore));

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
