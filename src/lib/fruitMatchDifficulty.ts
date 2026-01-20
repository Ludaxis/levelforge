/**
 * Fruit Match Difficulty Calculator & Solvability Checker
 *
 * Based on research from:
 * - Kristensen & Burelli (2024): "Difficulty Modelling in Mobile Puzzle Games"
 * - MDPI Electronics: "Efficient Difficulty Level Balancing in Match-3 Puzzle Games"
 *
 * Key difficulty factors for tile-matching games:
 * 1. Number of tile types (colors/fruits)
 * 2. Grid size / total pixels to fill
 * 3. Buffer space (waiting stand slots)
 * 4. Visibility (sink stack depth)
 * 5. Decision complexity (sink width / columns)
 * 6. Distribution evenness
 * 7. Move efficiency requirements
 */

import {
  FruitType,
  PixelCell,
  SinkTile,
  Launcher,
  FruitMatchLevel,
  ALL_FRUITS,
  LAUNCHER_CAPACITIES,
  LauncherCapacity,
  DifficultyTier,
} from '@/types/fruitMatch';

// ============================================================================
// Difficulty Metrics Interface
// ============================================================================

export interface DifficultyMetrics {
  // Basic metrics
  totalPixels: number;
  uniqueFruitTypes: number;
  fruitDistribution: Record<FruitType, number>;

  // Launcher metrics
  totalLaunchers: number;
  launchersPerFruit: Record<FruitType, number>;
  averageLauncherCapacity: number;

  // Sink metrics
  totalTilesInSink: number;
  sinkColumns: number;
  averageStackDepth: number;
  maxStackDepth: number;

  // Buffer metrics
  waitingStandSlots: number;
  bufferRatio: number; // slots / unique fruits

  // Complexity metrics
  decisionComplexity: number; // How many choices per move
  visibilityScore: number; // How much of sink is visible
  distributionEvenness: number; // 0-1, how evenly distributed fruits are

  // Calculated difficulty
  difficultyScore: number; // 0-100
  difficultyTier: DifficultyTier;

  // Solvability
  isSolvable: boolean;
  solvabilityIssues: string[];
}

// ============================================================================
// Difficulty Weights (tunable parameters)
// ============================================================================

const DIFFICULTY_WEIGHTS = {
  // Grid complexity (larger = harder)
  pixelCount: 0.15,

  // Color complexity (more types = harder)
  fruitTypes: 0.20,

  // Buffer pressure (fewer slots = harder)
  bufferPressure: 0.25,

  // Visibility (less visible = harder)
  visibility: 0.15,

  // Distribution (uneven = harder)
  distribution: 0.10,

  // Decision load (more columns = harder)
  decisionLoad: 0.15,
};

// ============================================================================
// Difficulty Calculation Functions
// ============================================================================

/**
 * Calculate the distribution evenness (0-1, where 1 is perfectly even)
 */
function calculateDistributionEvenness(distribution: Record<FruitType, number>): number {
  const counts = Object.values(distribution).filter(c => c > 0);
  if (counts.length <= 1) return 1;

  const total = counts.reduce((a, b) => a + b, 0);
  const expected = total / counts.length;

  // Calculate coefficient of variation
  const variance = counts.reduce((sum, c) => sum + Math.pow(c - expected, 2), 0) / counts.length;
  const stdDev = Math.sqrt(variance);
  const cv = stdDev / expected;

  // Convert to 0-1 scale (0 = very uneven, 1 = perfectly even)
  return Math.max(0, 1 - cv);
}

/**
 * Calculate visibility score based on stack depth
 * (how much of the sink tiles are visible to the player)
 */
function calculateVisibilityScore(sinkStacks: SinkTile[][]): number {
  const VISIBLE_ROWS = 3; // Top 3 tiles are visible per stack

  let totalTiles = 0;
  let visibleTiles = 0;

  for (const stack of sinkStacks) {
    totalTiles += stack.length;
    visibleTiles += Math.min(stack.length, VISIBLE_ROWS);
  }

  if (totalTiles === 0) return 1;
  return visibleTiles / totalTiles;
}

/**
 * Calculate decision complexity
 * (how many meaningful choices the player has per move)
 */
function calculateDecisionComplexity(
  sinkStacks: SinkTile[][],
  uniqueFruits: number
): number {
  // More columns = more choices
  const columnFactor = sinkStacks.length / 10; // Normalized to ~10 columns

  // More fruit types = more to track
  const fruitFactor = uniqueFruits / 6; // Normalized to 6 fruit types

  // Non-empty columns add complexity
  const activeColumns = sinkStacks.filter(s => s.length > 0).length;
  const activityFactor = activeColumns / Math.max(sinkStacks.length, 1);

  return (columnFactor * 0.4 + fruitFactor * 0.4 + activityFactor * 0.2);
}

/**
 * Calculate how many launchers are needed for each fruit type
 */
function calculateLaunchersPerFruit(pixelArt: PixelCell[]): Record<FruitType, number> {
  const fruitCounts: Record<FruitType, number> = {
    apple: 0, orange: 0, lemon: 0, grape: 0, cherry: 0, kiwi: 0
  };

  for (const cell of pixelArt) {
    fruitCounts[cell.fruitType]++;
  }

  const launchersNeeded: Record<FruitType, number> = {
    apple: 0, orange: 0, lemon: 0, grape: 0, cherry: 0, kiwi: 0
  };

  const sortedCapacities = [...LAUNCHER_CAPACITIES].sort((a, b) => b - a);

  for (const fruit of ALL_FRUITS) {
    let remaining = fruitCounts[fruit];
    let launchers = 0;

    for (const capacity of sortedCapacities) {
      while (remaining >= capacity) {
        launchers++;
        remaining -= capacity;
      }
    }

    if (remaining > 0) launchers++;
    launchersNeeded[fruit] = launchers;
  }

  return launchersNeeded;
}

/**
 * Main difficulty calculation function
 */
export function calculateDifficultyMetrics(level: FruitMatchLevel): DifficultyMetrics {
  const { pixelArt, sinkStacks, waitingStandSlots } = level;

  // Basic metrics
  const totalPixels = pixelArt.length;

  const fruitDistribution: Record<FruitType, number> = {
    apple: 0, orange: 0, lemon: 0, grape: 0, cherry: 0, kiwi: 0
  };
  for (const cell of pixelArt) {
    fruitDistribution[cell.fruitType]++;
  }

  const uniqueFruitTypes = Object.values(fruitDistribution).filter(c => c > 0).length;

  // Launcher metrics
  const launchersPerFruit = calculateLaunchersPerFruit(pixelArt);
  const totalLaunchers = Object.values(launchersPerFruit).reduce((a, b) => a + b, 0);
  const averageLauncherCapacity = totalPixels / Math.max(totalLaunchers, 1);

  // Sink metrics
  const totalTilesInSink = sinkStacks.reduce((sum, stack) => sum + stack.length, 0);
  const sinkColumns = sinkStacks.length;
  const stackDepths = sinkStacks.map(s => s.length);
  const maxStackDepth = Math.max(...stackDepths, 0);
  const averageStackDepth = stackDepths.length > 0
    ? stackDepths.reduce((a, b) => a + b, 0) / stackDepths.length
    : 0;

  // Buffer metrics
  const bufferRatio = waitingStandSlots / Math.max(uniqueFruitTypes, 1);

  // Complexity metrics
  const visibilityScore = calculateVisibilityScore(sinkStacks);
  const distributionEvenness = calculateDistributionEvenness(fruitDistribution);
  const decisionComplexity = calculateDecisionComplexity(sinkStacks, uniqueFruitTypes);

  // Solvability check
  const { isSolvable, issues } = checkSolvability(level);

  // Calculate difficulty score (0-100)
  const difficultyScore = calculateDifficultyScore({
    totalPixels,
    uniqueFruitTypes,
    waitingStandSlots,
    bufferRatio,
    visibilityScore,
    distributionEvenness,
    decisionComplexity,
    averageStackDepth,
  });

  const difficultyTier = scoreToDifficultyTier(difficultyScore);

  return {
    totalPixels,
    uniqueFruitTypes,
    fruitDistribution,
    totalLaunchers,
    launchersPerFruit,
    averageLauncherCapacity,
    totalTilesInSink,
    sinkColumns,
    averageStackDepth,
    maxStackDepth,
    waitingStandSlots,
    bufferRatio,
    decisionComplexity,
    visibilityScore,
    distributionEvenness,
    difficultyScore,
    difficultyTier,
    isSolvable,
    solvabilityIssues: issues,
  };
}

/**
 * Calculate the final difficulty score (0-100)
 */
function calculateDifficultyScore(params: {
  totalPixels: number;
  uniqueFruitTypes: number;
  waitingStandSlots: number;
  bufferRatio: number;
  visibilityScore: number;
  distributionEvenness: number;
  decisionComplexity: number;
  averageStackDepth: number;
}): number {
  const {
    totalPixels,
    uniqueFruitTypes,
    waitingStandSlots,
    bufferRatio,
    visibilityScore,
    distributionEvenness,
    decisionComplexity,
    averageStackDepth,
  } = params;

  // Pixel count factor (0-1): More pixels = harder
  // 400 pixels (20x20) = 0, 10000 pixels (100x100) = 1
  const pixelFactor = Math.min(1, Math.max(0, (totalPixels - 400) / 9600));

  // Fruit types factor (0-1): More types = harder
  // 2 types = 0, 6 types = 1
  const fruitFactor = Math.min(1, Math.max(0, (uniqueFruitTypes - 2) / 4));

  // Buffer pressure factor (0-1): Less buffer = harder
  // Ratio 2+ = easy (0), ratio 1 = hard (1)
  const bufferFactor = Math.min(1, Math.max(0, 1 - (bufferRatio - 1)));

  // Visibility factor (0-1): Less visible = harder
  const visibilityFactor = 1 - visibilityScore;

  // Distribution factor (0-1): Uneven = harder
  const distributionFactor = 1 - distributionEvenness;

  // Decision load factor (0-1): More complexity = harder
  const decisionFactor = Math.min(1, decisionComplexity);

  // Weighted sum
  const weightedScore =
    pixelFactor * DIFFICULTY_WEIGHTS.pixelCount +
    fruitFactor * DIFFICULTY_WEIGHTS.fruitTypes +
    bufferFactor * DIFFICULTY_WEIGHTS.bufferPressure +
    visibilityFactor * DIFFICULTY_WEIGHTS.visibility +
    distributionFactor * DIFFICULTY_WEIGHTS.distribution +
    decisionFactor * DIFFICULTY_WEIGHTS.decisionLoad;

  // Scale to 0-100
  return Math.round(weightedScore * 100);
}

/**
 * Convert score to difficulty tier
 */
function scoreToDifficultyTier(score: number): DifficultyTier {
  if (score < 20) return 'trivial';
  if (score < 35) return 'easy';
  if (score < 50) return 'medium';
  if (score < 65) return 'hard';
  if (score < 80) return 'expert';
  return 'nightmare';
}

// ============================================================================
// Solvability Checking
// ============================================================================

/**
 * Check if a level is solvable
 */
export function checkSolvability(level: FruitMatchLevel): {
  isSolvable: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  const { pixelArt, sinkStacks, waitingStandSlots } = level;

  // Count required tiles per fruit
  const requiredTiles: Record<FruitType, number> = {
    apple: 0, orange: 0, lemon: 0, grape: 0, cherry: 0, kiwi: 0
  };

  // Calculate launchers needed per fruit
  const launchersPerFruit = calculateLaunchersPerFruit(pixelArt);

  // Each launcher needs exactly 3 tiles
  for (const fruit of ALL_FRUITS) {
    requiredTiles[fruit] = launchersPerFruit[fruit] * 3;
  }

  // Count actual tiles in sink per fruit
  const actualTiles: Record<FruitType, number> = {
    apple: 0, orange: 0, lemon: 0, grape: 0, cherry: 0, kiwi: 0
  };

  for (const stack of sinkStacks) {
    for (const tile of stack) {
      actualTiles[tile.fruitType]++;
    }
  }

  // Check 1: Do we have the right number of tiles?
  for (const fruit of ALL_FRUITS) {
    if (actualTiles[fruit] < requiredTiles[fruit]) {
      issues.push(`Not enough ${fruit} tiles: have ${actualTiles[fruit]}, need ${requiredTiles[fruit]}`);
    } else if (actualTiles[fruit] > requiredTiles[fruit]) {
      issues.push(`Too many ${fruit} tiles: have ${actualTiles[fruit]}, need ${requiredTiles[fruit]}`);
    }
  }

  // Check 2: Is waiting stand large enough?
  // Worst case: all 4 launchers need the same fruit that's not available
  // Player might need to hold tiles from other fruits
  const uniqueFruits = Object.values(requiredTiles).filter(c => c > 0).length;
  const minSafeSlots = Math.max(uniqueFruits - 1, 3) * 2; // At least 2 per non-matching fruit

  if (waitingStandSlots < minSafeSlots) {
    issues.push(`Waiting stand may be too small: ${waitingStandSlots} slots, recommend at least ${minSafeSlots}`);
  }

  // Check 3: Are tiles in multiples of 3?
  for (const fruit of ALL_FRUITS) {
    if (actualTiles[fruit] > 0 && actualTiles[fruit] % 3 !== 0) {
      issues.push(`${fruit} tiles not in multiple of 3: ${actualTiles[fruit]} tiles`);
    }
  }

  // A level is solvable if we have exactly the right tiles
  const hasTileIssues = ALL_FRUITS.some(
    fruit => actualTiles[fruit] !== requiredTiles[fruit]
  );

  return {
    isSolvable: !hasTileIssues,
    issues,
  };
}

// ============================================================================
// Guaranteed Solvable Level Generation
// ============================================================================

/**
 * Generate sink stacks that are guaranteed to be solvable
 */
export function generateSolvableSinkStacks(
  pixelArt: PixelCell[],
  sinkWidth: number,
  minStackHeight: number = 2,
  maxStackHeight: number = 5
): SinkTile[][] {
  // Calculate exact tiles needed per fruit
  const launchersPerFruit = calculateLaunchersPerFruit(pixelArt);

  // Create tiles: exactly 3 per launcher
  const allTiles: { fruitType: FruitType }[] = [];

  for (const fruit of ALL_FRUITS) {
    const numLaunchers = launchersPerFruit[fruit];
    const tilesNeeded = numLaunchers * 3;

    for (let i = 0; i < tilesNeeded; i++) {
      allTiles.push({ fruitType: fruit });
    }
  }

  // Shuffle tiles using Fisher-Yates
  for (let i = allTiles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allTiles[i], allTiles[j]] = [allTiles[j], allTiles[i]];
  }

  // Distribute to stacks
  const stacks: SinkTile[][] = Array.from({ length: sinkWidth }, () => []);

  // Calculate target heights for even distribution
  const totalTiles = allTiles.length;
  const baseHeight = Math.floor(totalTiles / sinkWidth);
  const extraTiles = totalTiles % sinkWidth;

  // Assign target heights
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

  // Distribute tiles
  let tileIndex = 0;

  // First pass: fill to target heights
  for (let col = 0; col < sinkWidth && tileIndex < allTiles.length; col++) {
    const targetHeight = targetHeights[col];
    for (let h = 0; h < targetHeight && tileIndex < allTiles.length; h++) {
      stacks[col].push({
        id: `tile-${Date.now()}-${tileIndex}-${Math.random().toString(36).substr(2, 9)}`,
        fruitType: allTiles[tileIndex].fruitType,
        stackIndex: h,
        position: col,
      });
      tileIndex++;
    }
  }

  // Second pass: distribute any remaining tiles
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
      id: `tile-${Date.now()}-${tileIndex}-${Math.random().toString(36).substr(2, 9)}`,
      fruitType: allTiles[tileIndex].fruitType,
      stackIndex: stacks[minCol].length,
      position: minCol,
    });
    tileIndex++;
  }

  return stacks;
}

/**
 * Get recommended settings for a target difficulty
 */
export function getRecommendedSettings(targetDifficulty: DifficultyTier): {
  gridSize: { min: number; max: number; recommended: number };
  fruitTypes: { min: number; max: number; recommended: number };
  waitingStandSlots: { min: number; max: number; recommended: number };
  sinkWidth: { min: number; max: number; recommended: number };
} {
  const settings = {
    trivial: {
      gridSize: { min: 20, max: 25, recommended: 20 },
      fruitTypes: { min: 2, max: 3, recommended: 2 },
      waitingStandSlots: { min: 9, max: 12, recommended: 10 },
      sinkWidth: { min: 4, max: 6, recommended: 5 },
    },
    easy: {
      gridSize: { min: 25, max: 35, recommended: 30 },
      fruitTypes: { min: 3, max: 4, recommended: 3 },
      waitingStandSlots: { min: 8, max: 10, recommended: 9 },
      sinkWidth: { min: 5, max: 7, recommended: 6 },
    },
    medium: {
      gridSize: { min: 35, max: 50, recommended: 40 },
      fruitTypes: { min: 4, max: 5, recommended: 4 },
      waitingStandSlots: { min: 7, max: 9, recommended: 8 },
      sinkWidth: { min: 6, max: 8, recommended: 7 },
    },
    hard: {
      gridSize: { min: 50, max: 70, recommended: 60 },
      fruitTypes: { min: 4, max: 5, recommended: 5 },
      waitingStandSlots: { min: 6, max: 8, recommended: 7 },
      sinkWidth: { min: 7, max: 10, recommended: 8 },
    },
    expert: {
      gridSize: { min: 70, max: 90, recommended: 80 },
      fruitTypes: { min: 5, max: 6, recommended: 5 },
      waitingStandSlots: { min: 5, max: 7, recommended: 6 },
      sinkWidth: { min: 8, max: 12, recommended: 10 },
    },
    nightmare: {
      gridSize: { min: 90, max: 100, recommended: 100 },
      fruitTypes: { min: 5, max: 6, recommended: 6 },
      waitingStandSlots: { min: 5, max: 6, recommended: 5 },
      sinkWidth: { min: 10, max: 15, recommended: 12 },
    },
  };

  return settings[targetDifficulty];
}

/**
 * Estimate completion time based on difficulty metrics
 */
export function estimateCompletionTime(metrics: DifficultyMetrics): {
  minMinutes: number;
  maxMinutes: number;
  averageMinutes: number;
} {
  // Base time: 1 second per tile to pick
  const baseTileTime = metrics.totalTilesInSink * 1; // seconds

  // Shooting time: ~0.5 seconds per pixel
  const shootingTime = metrics.totalPixels * 0.5; // seconds

  // Thinking time based on difficulty
  const thinkingMultiplier = 1 + (metrics.difficultyScore / 100);

  const baseTime = (baseTileTime + shootingTime) * thinkingMultiplier;

  // Convert to minutes with variance
  const averageMinutes = baseTime / 60;
  const minMinutes = averageMinutes * 0.5;
  const maxMinutes = averageMinutes * 2;

  return {
    minMinutes: Math.round(minMinutes * 10) / 10,
    maxMinutes: Math.round(maxMinutes * 10) / 10,
    averageMinutes: Math.round(averageMinutes * 10) / 10,
  };
}
