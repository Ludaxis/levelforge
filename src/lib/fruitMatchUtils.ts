import {
  FruitType,
  PixelCell,
  SinkTile,
  Launcher,
  LauncherCapacity,
  LAUNCHER_CAPACITIES,
  FruitMatchLevel,
  FruitMatchLevelMetrics,
  LauncherOrderConfig,
  ALL_FRUITS,
  FRUIT_EMOJI,
  FRUIT_COLORS,
  generateTileId,
  generateLauncherId,
  pixelKey,
  calculateFruitMatchDifficulty,
} from '@/types/fruitMatch';

// ============================================================================
// Fruit Type Migration (for backward compatibility with old type names)
// ============================================================================

/**
 * Migration map for old fruit type names to new ones
 * Old types were: cherry, grape, lemon, kiwi, white, black
 * New types are mapped to ColorType enum (0-8)
 */
const FRUIT_TYPE_MIGRATION: Record<string, FruitType> = {
  // New types (unchanged)
  blueberry: 'blueberry',
  orange: 'orange',
  strawberry: 'strawberry',
  dragonfruit: 'dragonfruit',
  banana: 'banana',
  apple: 'apple',
  plum: 'plum',
  pear: 'pear',
  blackberry: 'blackberry',
  // Old types -> new types
  cherry: 'strawberry',   // Red
  grape: 'plum',          // Purple/Violet
  lemon: 'banana',        // Yellow
  kiwi: 'apple',          // Green
  white: 'pear',          // White/Cream
  black: 'blackberry',    // Black/Dark
};

/**
 * Migrate old fruit type names to new ones
 * Returns the migrated fruit type, or 'apple' as fallback
 */
export function migrateFruitType(fruitType: string): FruitType {
  return FRUIT_TYPE_MIGRATION[fruitType] || 'apple';
}

// ============================================================================
// Pixel Art Helpers
// ============================================================================

/**
 * Create a blank pixel art grid
 */
export function createBlankPixelArt(width: number, height: number): PixelCell[] {
  const cells: PixelCell[] = [];
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      cells.push({
        row,
        col,
        fruitType: 'apple', // default
        filled: false,
      });
    }
  }
  return cells;
}

/**
 * Get unfilled pixels from pixel art
 */
export function getUnfilledPixels(pixelArt: PixelCell[]): PixelCell[] {
  return pixelArt.filter(cell => !cell.filled);
}

/**
 * Get the fruit distribution needed to complete the pixel art
 */
export function getRequiredFruitCounts(pixelArt: PixelCell[]): Record<FruitType, number> {
  const counts: Record<FruitType, number> = {
    blueberry: 0, orange: 0, strawberry: 0, dragonfruit: 0, banana: 0, apple: 0, plum: 0, pear: 0, blackberry: 0
  };
  for (const cell of pixelArt) {
    if (!cell.filled) {
      counts[cell.fruitType]++;
    }
  }
  return counts;
}

/**
 * Find the next unfilled pixel for a given fruit type
 */
export function findNextUnfilledPixel(
  pixelArt: PixelCell[],
  fruitType: FruitType
): PixelCell | null {
  return pixelArt.find(cell => !cell.filled && cell.fruitType === fruitType) || null;
}

/**
 * Mark a pixel as filled
 */
export function fillPixel(
  pixelArt: PixelCell[],
  row: number,
  col: number
): PixelCell[] {
  return pixelArt.map(cell =>
    cell.row === row && cell.col === col
      ? { ...cell, filled: true }
      : cell
  );
}

/**
 * Fill multiple pixels of a given fruit type (up to capacity)
 * Returns the updated pixel art and the cells that were filled
 */
export function fillMultiplePixels(
  pixelArt: PixelCell[],
  fruitType: FruitType,
  capacity: number
): { updatedPixelArt: PixelCell[]; filledCells: PixelCell[] } {
  const filledCells: PixelCell[] = [];
  let fillCount = 0;

  const updatedPixelArt = pixelArt.map(cell => {
    if (!cell.filled && cell.fruitType === fruitType && fillCount < capacity) {
      fillCount++;
      filledCells.push({ ...cell, filled: true });
      return { ...cell, filled: true };
    }
    return cell;
  });

  return { updatedPixelArt, filledCells };
}

// ============================================================================
// Sink Helpers
// ============================================================================

/**
 * Get the top (pickable) tile from a sink column
 */
export function getTopTile(stack: SinkTile[]): SinkTile | null {
  if (stack.length === 0) return null;
  return stack.reduce((top, tile) =>
    tile.stackIndex < top.stackIndex ? tile : top
  );
}

/**
 * Remove a tile from a stack and update indices
 */
export function removeTileFromStack(
  stack: SinkTile[],
  tileId: string
): SinkTile[] {
  const tile = stack.find(t => t.id === tileId);
  if (!tile) return stack;

  // Remove the tile and shift stack indices
  return stack
    .filter(t => t.id !== tileId)
    .map(t => ({
      ...t,
      stackIndex: t.stackIndex > tile.stackIndex ? t.stackIndex - 1 : t.stackIndex
    }));
}

/**
 * Calculate how many matches (launchers) are needed for each fruit
 * based on launcher capacities
 */
export function calculateMatchesNeeded(fruitCounts: Record<FruitType, number>): Record<FruitType, number> {
  const matchesNeeded: Record<FruitType, number> = {
    blueberry: 0, orange: 0, strawberry: 0, dragonfruit: 0, banana: 0, apple: 0, plum: 0, pear: 0, blackberry: 0
  };

  // Sort capacities from largest to smallest for breakdown
  const sortedCapacities = [...LAUNCHER_CAPACITIES].sort((a, b) => b - a);

  for (const fruit of ALL_FRUITS) {
    let remaining = fruitCounts[fruit] || 0;
    let matches = 0;

    for (const capacity of sortedCapacities) {
      while (remaining >= capacity) {
        matches++;
        remaining -= capacity;
      }
    }

    // Handle remaining pixels (less than smallest capacity)
    if (remaining > 0) {
      matches++;
    }

    matchesNeeded[fruit] = matches;
  }

  return matchesNeeded;
}

/**
 * Generate guaranteed solvable sink stacks
 * Creates exactly 3 tiles per launcher needed
 */
export function generateSinkStacks(
  sinkWidth: number,
  fruitCounts: Record<FruitType, number>,
  minStackHeight: number = 2,
  maxStackHeight: number = 5
): SinkTile[][] {
  // Calculate matches needed based on launcher capacities
  const matchesNeeded = calculateMatchesNeeded(fruitCounts);

  // Create all tiles needed (exactly 3 tiles per launcher)
  const allTiles: { fruitType: FruitType }[] = [];
  for (const fruit of ALL_FRUITS) {
    const numLaunchers = matchesNeeded[fruit];
    const tilesNeeded = numLaunchers * 3;
    for (let i = 0; i < tilesNeeded; i++) {
      allTiles.push({ fruitType: fruit });
    }
  }

  // Shuffle tiles using Fisher-Yates for true randomness
  for (let i = allTiles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allTiles[i], allTiles[j]] = [allTiles[j], allTiles[i]];
  }

  // Calculate target heights for even distribution
  const totalTiles = allTiles.length;
  const baseHeight = Math.floor(totalTiles / sinkWidth);
  const extraTiles = totalTiles % sinkWidth;

  // Assign target heights with min/max constraints
  const targetHeights: number[] = [];
  for (let i = 0; i < sinkWidth; i++) {
    let height = baseHeight + (i < extraTiles ? 1 : 0);
    height = Math.max(minStackHeight, Math.min(maxStackHeight, height));
    targetHeights.push(height);
  }

  // Shuffle target heights for variety
  for (let i = targetHeights.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [targetHeights[i], targetHeights[j]] = [targetHeights[j], targetHeights[i]];
  }

  // Distribute tiles to stacks
  const stacks: SinkTile[][] = Array.from({ length: sinkWidth }, () => []);
  let tileIndex = 0;

  // First pass: fill to target heights
  for (let col = 0; col < sinkWidth && tileIndex < allTiles.length; col++) {
    const targetHeight = targetHeights[col];
    for (let h = 0; h < targetHeight && tileIndex < allTiles.length; h++) {
      stacks[col].push({
        id: generateTileId(),
        fruitType: allTiles[tileIndex].fruitType,
        stackIndex: h,
        position: col,
      });
      tileIndex++;
    }
  }

  // Second pass: distribute any remaining tiles evenly
  while (tileIndex < allTiles.length) {
    // Find column with minimum tiles
    let minCol = 0;
    let minHeight = stacks[0].length;
    for (let col = 1; col < sinkWidth; col++) {
      if (stacks[col].length < minHeight) {
        minHeight = stacks[col].length;
        minCol = col;
      }
    }

    stacks[minCol].push({
      id: generateTileId(),
      fruitType: allTiles[tileIndex].fruitType,
      stackIndex: stacks[minCol].length,
      position: minCol,
    });
    tileIndex++;
  }

  return stacks;
}

/**
 * Count total tiles in sink
 */
export function countSinkTiles(sinkStacks: SinkTile[][]): number {
  return sinkStacks.reduce((total, stack) => total + stack.length, 0);
}

// ============================================================================
// Launcher Helpers
// ============================================================================

// Launcher config for queue
export interface LauncherConfig {
  fruitType: FruitType;
  capacity: LauncherCapacity;
}

/**
 * Break down a pixel count into launcher capacities
 * Prioritizes larger capacities first for efficiency
 */
export function breakdownIntoCapacities(pixelCount: number): LauncherCapacity[] {
  const capacities: LauncherCapacity[] = [];
  let remaining = pixelCount;

  // Sort capacities from largest to smallest
  const sortedCapacities = [...LAUNCHER_CAPACITIES].sort((a, b) => b - a);

  for (const capacity of sortedCapacities) {
    while (remaining >= capacity) {
      capacities.push(capacity);
      remaining -= capacity;
    }
  }

  // If there's remaining pixels less than 20, add a 20-capacity launcher
  if (remaining > 0) {
    capacities.push(20);
  }

  return capacities;
}

/**
 * Generate launcher queue based on unfilled pixels
 * Returns launcher configs with fruit type and capacity
 * If launcherOrderConfig is provided with mode='manual', uses explicit order
 * Otherwise shuffles the queue randomly
 */
export function generateLauncherQueue(
  pixelArt: PixelCell[],
  launcherOrderConfig?: LauncherOrderConfig
): LauncherConfig[] {
  // If we have explicit launchers in the config, use them
  if (launcherOrderConfig && launcherOrderConfig.launchers.length > 0) {
    // Sort by orderIndex and map to LauncherConfig
    const sorted = [...launcherOrderConfig.launchers].sort((a, b) => a.orderIndex - b.orderIndex);
    const configs = sorted.map(l => ({
      fruitType: l.fruitType,
      capacity: l.capacity,
    }));

    // If auto mode, shuffle the launchers (but still use the defined capacities)
    if (launcherOrderConfig.mode === 'auto') {
      for (let i = configs.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [configs[i], configs[j]] = [configs[j], configs[i]];
      }
    }

    return configs;
  }

  // Fallback: No config provided, generate from pixel counts
  const fruitCounts = getRequiredFruitCounts(pixelArt);

  // Create launcher configs for each fruit type
  const configs: LauncherConfig[] = [];

  for (const fruit of ALL_FRUITS) {
    const count = fruitCounts[fruit];
    if (count > 0) {
      const capacities = breakdownIntoCapacities(count);
      for (const capacity of capacities) {
        configs.push({ fruitType: fruit, capacity });
      }
    }
  }

  // Shuffle the configs to randomize launcher order
  for (let i = configs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [configs[i], configs[j]] = [configs[j], configs[i]];
  }

  return configs;
}

/**
 * Create initial 4 launchers from queue
 */
export function createInitialLaunchers(queue: LauncherConfig[]): {
  launchers: Launcher[];
  remainingQueue: LauncherConfig[];
} {
  const launchers: Launcher[] = [];
  for (let i = 0; i < 4 && i < queue.length; i++) {
    launchers.push({
      id: generateLauncherId(),
      requiredFruit: queue[i].fruitType,
      capacity: queue[i].capacity,
      position: i,
    });
  }
  return {
    launchers,
    remainingQueue: queue.slice(4),
  };
}

/**
 * Remove a specific launcher and shift remaining launchers left
 * @param launchers Current launchers
 * @param launcherIdToRemove ID of the launcher that fired
 * @param queue Queue of upcoming launchers
 */
export function shiftLaunchers(
  launchers: Launcher[],
  queue: LauncherConfig[],
  launcherIdToRemove?: string
): { launchers: Launcher[]; remainingQueue: LauncherConfig[] } {
  // Find the launcher to remove
  const removedLauncher = launcherIdToRemove
    ? launchers.find(l => l.id === launcherIdToRemove)
    : launchers.find(l => l.position === 0);

  if (!removedLauncher) {
    // No launcher to remove, return as-is
    return { launchers, remainingQueue: queue };
  }

  const removedPosition = removedLauncher.position;

  // Remove the specific launcher and shift others that were to its right
  const shifted = launchers
    .filter(l => l.id !== removedLauncher.id)
    .map(l => ({
      ...l,
      position: l.position > removedPosition ? l.position - 1 : l.position,
    }));

  // Add new launcher from queue if available
  if (queue.length > 0) {
    // New launcher always goes to the rightmost position
    const maxPosition = shifted.length > 0 ? Math.max(...shifted.map(l => l.position)) + 1 : 0;
    shifted.push({
      id: generateLauncherId(),
      requiredFruit: queue[0].fruitType,
      capacity: queue[0].capacity,
      position: maxPosition,
    });
    return { launchers: shifted, remainingQueue: queue.slice(1) };
  }

  return { launchers: shifted, remainingQueue: queue };
}

// ============================================================================
// Waiting Stand Helpers
// ============================================================================

/**
 * Check if waiting stand has 3 matching tiles for a given fruit type
 */
export function hasMatchingTriplet(
  waitingStand: SinkTile[],
  fruitType: FruitType
): boolean {
  const matching = waitingStand.filter(t => t.fruitType === fruitType);
  return matching.length >= 3;
}

/**
 * Check if any launcher can be matched with waiting stand tiles
 */
export function canMatchAnyLauncher(
  waitingStand: SinkTile[],
  launchers: Launcher[]
): { canMatch: boolean; matchingLauncher: Launcher | null; matchingFruit: FruitType | null } {
  for (const launcher of launchers) {
    if (hasMatchingTriplet(waitingStand, launcher.requiredFruit)) {
      return {
        canMatch: true,
        matchingLauncher: launcher,
        matchingFruit: launcher.requiredFruit,
      };
    }
  }
  return { canMatch: false, matchingLauncher: null, matchingFruit: null };
}

/**
 * Remove 3 matching tiles from waiting stand
 */
export function removeMatchingTriplet(
  waitingStand: SinkTile[],
  fruitType: FruitType
): SinkTile[] {
  let count = 0;
  return waitingStand.filter(tile => {
    if (tile.fruitType === fruitType && count < 3) {
      count++;
      return false;
    }
    return true;
  });
}

/**
 * Check if game is lost (waiting stand full + no valid match)
 */
export function checkGameOver(
  waitingStand: SinkTile[],
  waitingStandSlots: number,
  launchers: Launcher[]
): boolean {
  // Not full yet
  if (waitingStand.length < waitingStandSlots) return false;

  // Check if any match is possible
  const { canMatch } = canMatchAnyLauncher(waitingStand, launchers);
  return !canMatch;
}

// ============================================================================
// Level Metrics
// ============================================================================

export function calculateLevelMetrics(
  pixelArt: PixelCell[],
  sinkStacks: SinkTile[][],
  waitingStandSlots: number
): FruitMatchLevelMetrics {
  // Count fruit distribution in pixel art
  const fruitDistribution: Record<FruitType, number> = {
    blueberry: 0, orange: 0, strawberry: 0, dragonfruit: 0, banana: 0, apple: 0, plum: 0, pear: 0, blackberry: 0
  };
  for (const cell of pixelArt) {
    fruitDistribution[cell.fruitType]++;
  }

  const totalPixels = pixelArt.length;
  const uniqueFruitTypes = Object.values(fruitDistribution).filter(c => c > 0).length;
  const totalTilesInSink = countSinkTiles(sinkStacks);
  const estimatedMatches = totalPixels;

  const { score, tier } = calculateFruitMatchDifficulty(
    totalPixels,
    waitingStandSlots,
    uniqueFruitTypes
  );

  return {
    totalPixels,
    uniqueFruitTypes,
    fruitDistribution,
    totalTilesInSink,
    waitingStandSlots,
    estimatedMatches,
    difficultyScore: score,
    difficulty: tier,
  };
}

// ============================================================================
// Level Generation
// ============================================================================

/**
 * Create a simple test level with a small pixel art
 */
export function createSimpleTestLevel(): FruitMatchLevel {
  // 4x4 pixel art with simple pattern
  const pixelArt: PixelCell[] = [
    { row: 0, col: 0, fruitType: 'apple', filled: false },
    { row: 0, col: 1, fruitType: 'orange', filled: false },
    { row: 0, col: 2, fruitType: 'orange', filled: false },
    { row: 0, col: 3, fruitType: 'apple', filled: false },
    { row: 1, col: 0, fruitType: 'orange', filled: false },
    { row: 1, col: 1, fruitType: 'banana', filled: false },
    { row: 1, col: 2, fruitType: 'banana', filled: false },
    { row: 1, col: 3, fruitType: 'orange', filled: false },
    { row: 2, col: 0, fruitType: 'orange', filled: false },
    { row: 2, col: 1, fruitType: 'banana', filled: false },
    { row: 2, col: 2, fruitType: 'banana', filled: false },
    { row: 2, col: 3, fruitType: 'orange', filled: false },
    { row: 3, col: 0, fruitType: 'apple', filled: false },
    { row: 3, col: 1, fruitType: 'orange', filled: false },
    { row: 3, col: 2, fruitType: 'orange', filled: false },
    { row: 3, col: 3, fruitType: 'apple', filled: false },
  ];

  // Count fruits needed
  const fruitCounts = getRequiredFruitCounts(
    pixelArt.map(c => ({ ...c, filled: false }))
  );

  // Generate sink stacks
  const sinkStacks = generateSinkStacks(6, fruitCounts, 2, 4);

  return {
    id: 'test-level-1',
    name: 'Test Level',
    pixelArt,
    pixelArtWidth: 4,
    pixelArtHeight: 4,
    sinkWidth: 6,
    sinkStacks,
    waitingStandSlots: 7,
    difficulty: 'easy',
  };
}

// ============================================================================
// Emoji to Pixel Art Conversion
// ============================================================================

/**
 * Convert a simple emoji pattern to pixel art
 * @param pattern 2D array of emoji strings
 */
export function emojiPatternToPixelArt(pattern: string[][]): PixelCell[] {
  const emojiToFruit: Record<string, FruitType> = {
    // Fruit emojis
    '🫐': 'blueberry',    // Blue
    '🍊': 'orange',       // Orange
    '🍓': 'strawberry',   // Red
    '🩷': 'dragonfruit',  // Pink (pink heart)
    '🍌': 'banana',       // Yellow
    '🍏': 'apple',        // Green
    '🍇': 'plum',         // Purple (grape emoji)
    '🍐': 'pear',         // Cream/White
    '🖤': 'blackberry',   // Black (black heart)
    // Color squares for direct color mapping
    '🟦': 'blueberry',    // Blue
    '🟧': 'orange',       // Orange
    '🟥': 'strawberry',   // Red
    '🟨': 'banana',       // Yellow
    '🟩': 'apple',        // Green
    '🟪': 'plum',         // Purple
    '⬜': 'pear',         // White/Cream
    '⬛': 'blackberry',   // Black
  };

  const cells: PixelCell[] = [];
  for (let row = 0; row < pattern.length; row++) {
    for (let col = 0; col < pattern[row].length; col++) {
      const emoji = pattern[row][col];
      // Skip empty cells - only spaces and empty strings are skipped
      // All other emojis (including ⬜ and ⬛) are valid colors
      if (emoji && emoji.trim() !== '') {
        const fruitType = emojiToFruit[emoji] || 'apple';
        cells.push({
          row,
          col,
          fruitType,
          filled: false,
        });
      }
    }
  }
  return cells;
}

// ============================================================================
// Export helpers
// ============================================================================

export {
  FRUIT_EMOJI,
  FRUIT_COLORS,
  ALL_FRUITS,
  pixelKey,
};
