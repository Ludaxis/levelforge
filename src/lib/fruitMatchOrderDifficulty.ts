/**
 * Fruit Match Order-Based Difficulty Calculator
 *
 * This module calculates difficulty based on TILE ORDER in the sink,
 * which research shows can cause up to 5x variation in win rates.
 *
 * Key Research References:
 * - Kristensen & Burelli (2024): "Difficulty Modelling in Mobile Puzzle Games"
 * - AAAI (2023): "Entropy as a Measure of Puzzle Difficulty"
 * - MDPI Electronics: "Efficient Difficulty Level Balancing in Match-3 Puzzle Games"
 *
 * ============================================================================
 * DIFFICULTY FACTORS EXPLAINED
 * ============================================================================
 *
 * 1. TRIPLET ACCESSIBILITY (Weight: 15%)
 *    ---------------------------------
 *    Measures how easily players can collect 3 matching tiles.
 *
 *    Formula: Average depth to collect first 3 tiles of each fruit type
 *
 *    EASY (score 0-0.3):
 *    - Matching tiles are near the top of stacks
 *    - Player can quickly form triplets
 *    Example: 🍎🍎🍎 all at depth 0-1
 *
 *    HARD (score 0.7-1.0):
 *    - Matching tiles are buried deep in stacks
 *    - Player must remove many other tiles first
 *    Example: 🍎 at depth 0, 🍎 at depth 3, 🍎 at depth 5
 *
 * 2. BLOCKING SCORE (Weight: 12%)
 *    ----------------------------
 *    Measures how often tiles block tiles needed sooner.
 *
 *    A "block" occurs when tile A sits on top of tile B,
 *    but B is needed before A (based on launcher order).
 *
 *    Formula: Sum of (neededLater - neededEarlier) for all blocking pairs
 *
 *    EASY (score 0-0.3):
 *    - Tiles appear roughly when their launchers are active
 *    - Minimal waiting stand usage needed
 *
 *    HARD (score 0.7-1.0):
 *    - Many tiles block tiles needed sooner
 *    - Waiting stand fills up frequently
 *
 * 3. INTERLEAVING SCORE (Weight: 10%)
 *    --------------------------------
 *    Measures how scattered same-fruit tiles are across columns.
 *
 *    Formula: Average column spread for each fruit type
 *
 *    EASY (score 0-0.3):
 *    - Same-fruit tiles clustered in 1-2 columns
 *    - Player knows where to look
 *
 *    HARD (score 0.7-1.0):
 *    - Same-fruit tiles spread across many columns
 *    - Player must scan entire board
 *
 * 4. LAUNCHER-ORDER ALIGNMENT (Weight: 13%)
 *    --------------------------------------
 *    Measures how well tile availability matches launcher order.
 *
 *    Perfect alignment: When launcher #N becomes active,
 *    its required tiles are immediately accessible.
 *
 *    Formula: Correlation between launcher position and tile accessibility
 *
 *    EASY (score 0-0.3):
 *    - Tiles for early launchers are accessible early
 *    - Natural progression through the level
 *
 *    HARD (score 0.7-1.0):
 *    - Tiles for early launchers are buried
 *    - Must dig through many irrelevant tiles
 *
 * 5. DECISION ENTROPY (Weight: 8%)
 *    -----------------------------
 *    Measures how many meaningful choices the player faces.
 *    Based on AAAI research on puzzle entropy.
 *
 *    Formula: -Σ(p * log2(p)) where p = probability of each choice being optimal
 *
 *    EASY (low entropy):
 *    - Few pickable tiles at any time
 *    - Obvious best move
 *
 *    HARD (high entropy):
 *    - Many pickable tiles
 *    - Unclear which is optimal
 *
 * 6. WAITING STAND PRESSURE (Weight: 10%)
 *    ------------------------------------
 *    Monte Carlo simulation of buffer usage.
 *    Simulates many random playthroughs to estimate:
 *    - Average peak waiting stand usage
 *    - Failure rate (waiting stand overflow)
 *
 *    EASY (score 0-0.3):
 *    - Rarely uses more than 50% of waiting stand
 *    - Very low failure rate
 *
 *    HARD (score 0.7-1.0):
 *    - Frequently near capacity
 *    - Significant failure rate with random play
 *
 * ============================================================================
 * COMBINED SCORE CALCULATION
 * ============================================================================
 *
 * Final Order Difficulty Score = Weighted sum of all factors (0-100)
 *
 * This score represents ONLY the difficulty contribution from tile order.
 * It should be combined with static factors (pixel count, fruit types, etc.)
 * for the complete difficulty assessment.
 */

import {
  FruitType,
  PixelCell,
  SinkTile,
  LauncherCapacity,
  ALL_FRUITS,
  LAUNCHER_CAPACITIES,
  DifficultyTier,
} from '@/types/fruitMatch';

import { LauncherConfig } from '@/lib/fruitMatchUtils';

// ============================================================================
// Types
// ============================================================================

export interface OrderDifficultyMetrics {
  // Individual factor scores (0-1 scale, higher = harder)
  tripletAccessibility: number;
  blockingScore: number;
  interleavingScore: number;
  launcherAlignment: number;
  decisionEntropy: number;
  waitingStandPressure: number;

  // Simulation results
  simulatedFailureRate: number;
  simulatedAveragePeakUsage: number;
  simulatedWinRate: number;

  // Combined score
  orderDifficultyScore: number; // 0-100

  // Detailed breakdown for UI
  factorBreakdown: DifficultyFactorBreakdown[];
}

export interface DifficultyFactorBreakdown {
  name: string;
  description: string;
  score: number; // 0-1
  weight: number;
  contribution: number; // score * weight
  explanation: string;
  impact: 'easy' | 'medium' | 'hard';
}

export interface OrderOptimizationResult {
  originalScore: number;
  optimizedScore: number;
  optimizedStacks: SinkTile[][];
  improvement: number;
  strategy: string;
}

// ============================================================================
// Difficulty Weights
// ============================================================================

export const ORDER_DIFFICULTY_WEIGHTS = {
  tripletAccessibility: 0.15,
  blockingScore: 0.12,
  interleavingScore: 0.10,
  launcherAlignment: 0.13,
  decisionEntropy: 0.08,
  waitingStandPressure: 0.10,
  // Simulation-based (derived from waitingStandPressure simulation)
  simulatedFailureRate: 0.12,
  simulatedWinRate: 0.20,
};

// ============================================================================
// Factor 1: Triplet Accessibility
// ============================================================================

/**
 * Calculate how easily triplets can be collected.
 * Returns 0-1 where 0 = very accessible (easy), 1 = deeply buried (hard)
 */
export function calculateTripletAccessibility(sinkStacks: SinkTile[][]): {
  score: number;
  details: Record<FruitType, { depths: number[]; avgDepth: number }>;
} {
  // Group tiles by fruit type with their depths
  const fruitDepths: Record<FruitType, number[]> = {} as Record<FruitType, number[]>;

  for (const fruit of ALL_FRUITS) {
    fruitDepths[fruit] = [];
  }

  for (const stack of sinkStacks) {
    for (const tile of stack) {
      fruitDepths[tile.fruitType].push(tile.stackIndex);
    }
  }

  // Calculate average depth to get first 3 tiles of each type
  const details: Record<FruitType, { depths: number[]; avgDepth: number }> = {} as any;
  let totalWeightedDepth = 0;
  let fruitCount = 0;

  for (const fruit of ALL_FRUITS) {
    const depths = fruitDepths[fruit].sort((a, b) => a - b);
    details[fruit] = { depths, avgDepth: 0 };

    if (depths.length >= 3) {
      // Sum of depths for first 3 tiles (shallowest)
      const tripletDepth = depths[0] + depths[1] + depths[2];
      details[fruit].avgDepth = tripletDepth / 3;
      totalWeightedDepth += tripletDepth;
      fruitCount++;
    }
  }

  if (fruitCount === 0) {
    return { score: 0, details };
  }

  // Average triplet depth across all fruits
  // Normalize: 0 depth = 0 score, 6+ average depth = 1 score
  const avgTripletDepth = totalWeightedDepth / (fruitCount * 3);
  const score = Math.min(1, avgTripletDepth / 6);

  return { score, details };
}

// ============================================================================
// Factor 2: Blocking Score
// ============================================================================

/**
 * Calculate how much tiles block other tiles that are needed sooner.
 * Returns 0-1 where 0 = no blocking (easy), 1 = severe blocking (hard)
 */
export function calculateBlockingScore(
  sinkStacks: SinkTile[][],
  launcherQueue: LauncherConfig[]
): {
  score: number;
  blockingPairs: number;
  totalPairs: number;
} {
  // Create a map of when each fruit is first needed (launcher queue position)
  const fruitNeededAt: Record<FruitType, number> = {} as Record<FruitType, number>;

  launcherQueue.forEach((launcher, index) => {
    if (fruitNeededAt[launcher.fruitType] === undefined) {
      fruitNeededAt[launcher.fruitType] = index;
    }
  });

  let blockingScore = 0;
  let blockingPairs = 0;
  let totalPairs = 0;

  for (const stack of sinkStacks) {
    for (let i = 0; i < stack.length - 1; i++) {
      for (let j = i + 1; j < stack.length; j++) {
        const upperTile = stack[i]; // Closer to top
        const lowerTile = stack[j]; // Deeper

        const upperNeeded = fruitNeededAt[upperTile.fruitType] ?? Infinity;
        const lowerNeeded = fruitNeededAt[lowerTile.fruitType] ?? Infinity;

        totalPairs++;

        // If lower tile needed BEFORE upper tile = blocking!
        if (lowerNeeded < upperNeeded) {
          // Weight by how much earlier it's needed
          const blockSeverity = upperNeeded - lowerNeeded;
          blockingScore += Math.min(blockSeverity, 10) / 10; // Cap at 10 positions
          blockingPairs++;
        }
      }
    }
  }

  // Normalize by total pairs
  const normalizedScore = totalPairs > 0 ? blockingScore / totalPairs : 0;

  return {
    score: Math.min(1, normalizedScore * 2), // Scale up for sensitivity
    blockingPairs,
    totalPairs,
  };
}

// ============================================================================
// Factor 3: Interleaving Score
// ============================================================================

/**
 * Calculate how scattered same-fruit tiles are across columns.
 * Returns 0-1 where 0 = clustered (easy), 1 = scattered (hard)
 */
export function calculateInterleavingScore(sinkStacks: SinkTile[][]): {
  score: number;
  spreadByFruit: Record<FruitType, number>;
} {
  const columnsPerFruit: Record<FruitType, Set<number>> = {} as any;

  for (const fruit of ALL_FRUITS) {
    columnsPerFruit[fruit] = new Set();
  }

  sinkStacks.forEach((stack, colIndex) => {
    for (const tile of stack) {
      columnsPerFruit[tile.fruitType].add(colIndex);
    }
  });

  const spreadByFruit: Record<FruitType, number> = {} as any;
  let totalSpread = 0;
  let fruitCount = 0;

  for (const fruit of ALL_FRUITS) {
    const columns = columnsPerFruit[fruit];
    if (columns.size > 0) {
      // Spread = number of columns used / total columns
      const spread = columns.size / sinkStacks.length;
      spreadByFruit[fruit] = spread;
      totalSpread += spread;
      fruitCount++;
    } else {
      spreadByFruit[fruit] = 0;
    }
  }

  const avgSpread = fruitCount > 0 ? totalSpread / fruitCount : 0;

  return {
    score: avgSpread,
    spreadByFruit,
  };
}

// ============================================================================
// Factor 4: Launcher-Order Alignment
// ============================================================================

/**
 * Calculate how well tile accessibility matches launcher order.
 * Returns 0-1 where 0 = perfect alignment (easy), 1 = misaligned (hard)
 */
export function calculateLauncherAlignment(
  sinkStacks: SinkTile[][],
  launcherQueue: LauncherConfig[]
): {
  score: number;
  alignmentByLauncher: { launcherIndex: number; fruitType: FruitType; alignmentScore: number }[];
} {
  // For each launcher, calculate how accessible its tiles are
  // relative to when the launcher appears in the queue

  const alignmentByLauncher: { launcherIndex: number; fruitType: FruitType; alignmentScore: number }[] = [];

  // Flatten all tiles with their accessibility (lower depth = more accessible)
  const allTiles: { tile: SinkTile; depth: number; column: number }[] = [];

  sinkStacks.forEach((stack, col) => {
    stack.forEach((tile) => {
      allTiles.push({ tile, depth: tile.stackIndex, column: col });
    });
  });

  // Sort by accessibility (depth)
  allTiles.sort((a, b) => a.depth - b.depth);

  // For each launcher, find when its tiles become accessible
  let totalMisalignment = 0;
  const tilesUsed = new Set<string>();

  for (let launcherIdx = 0; launcherIdx < launcherQueue.length; launcherIdx++) {
    const launcher = launcherQueue[launcherIdx];

    // Find first 3 available tiles of this fruit
    let tilesFound = 0;
    let totalAccessibilityRank = 0;

    for (let rank = 0; rank < allTiles.length && tilesFound < 3; rank++) {
      const { tile } = allTiles[rank];
      const tileKey = `${tile.id}`;

      if (tile.fruitType === launcher.fruitType && !tilesUsed.has(tileKey)) {
        tilesUsed.add(tileKey);
        totalAccessibilityRank += rank;
        tilesFound++;
      }
    }

    if (tilesFound === 3) {
      const avgRank = totalAccessibilityRank / 3;
      // Ideal: avgRank should be close to launcherIdx * 3
      const idealRank = launcherIdx * 3;
      const misalignment = Math.abs(avgRank - idealRank) / allTiles.length;

      alignmentByLauncher.push({
        launcherIndex: launcherIdx,
        fruitType: launcher.fruitType,
        alignmentScore: misalignment,
      });

      totalMisalignment += misalignment;
    }
  }

  const avgMisalignment = alignmentByLauncher.length > 0
    ? totalMisalignment / alignmentByLauncher.length
    : 0;

  return {
    score: Math.min(1, avgMisalignment * 3), // Scale for sensitivity
    alignmentByLauncher,
  };
}

// ============================================================================
// Factor 5: Decision Entropy
// ============================================================================

/**
 * Calculate the decision complexity (entropy) at each step.
 * Returns 0-1 where 0 = obvious choices (easy), 1 = many equal choices (hard)
 */
export function calculateDecisionEntropy(
  sinkStacks: SinkTile[][],
  uniqueFruits: number
): {
  score: number;
  averageChoices: number;
  entropyBits: number;
} {
  // At any moment, choices = pickable tiles (top of each non-empty stack)
  const pickableTiles = sinkStacks
    .filter(stack => stack.length > 0)
    .map(stack => stack[0]); // Top tile of each stack

  // Count unique fruit types among pickable tiles
  const pickableFruits = new Set(pickableTiles.map(t => t.fruitType));
  const numChoices = pickableFruits.size;

  // Calculate Shannon entropy
  // H = -Σ(p * log2(p)) where p = 1/numChoices for uniform distribution
  let entropyBits = 0;
  if (numChoices > 1) {
    const p = 1 / numChoices;
    entropyBits = -numChoices * p * Math.log2(p);
  }

  // Normalize: max entropy would be log2(uniqueFruits)
  const maxEntropy = Math.log2(Math.max(uniqueFruits, 2));
  const normalizedEntropy = maxEntropy > 0 ? entropyBits / maxEntropy : 0;

  return {
    score: normalizedEntropy,
    averageChoices: numChoices,
    entropyBits,
  };
}

// ============================================================================
// Factor 6: Monte Carlo Simulation for Waiting Stand Pressure
// ============================================================================

export interface SimulationResult {
  wins: number;
  losses: number;
  totalGames: number;
  winRate: number;
  averagePeakUsage: number;
  averageMoves: number;
  peakUsageDistribution: number[]; // Histogram of peak usage
}

/**
 * Simulate gameplay to estimate waiting stand pressure and win rate.
 * Uses random play to establish baseline difficulty.
 */
export function simulateGameplay(
  sinkStacks: SinkTile[][],
  launcherQueue: LauncherConfig[],
  waitingStandSlots: number,
  simulations: number = 100
): SimulationResult {
  let wins = 0;
  let losses = 0;
  let totalPeakUsage = 0;
  let totalMoves = 0;
  const peakUsageDistribution: number[] = new Array(waitingStandSlots + 1).fill(0);

  for (let sim = 0; sim < simulations; sim++) {
    const result = runSingleSimulation(sinkStacks, launcherQueue, waitingStandSlots);

    if (result.won) {
      wins++;
    } else {
      losses++;
    }

    totalPeakUsage += result.peakUsage;
    totalMoves += result.moves;
    peakUsageDistribution[Math.min(result.peakUsage, waitingStandSlots)]++;
  }

  return {
    wins,
    losses,
    totalGames: simulations,
    winRate: wins / simulations,
    averagePeakUsage: totalPeakUsage / simulations,
    averageMoves: totalMoves / simulations,
    peakUsageDistribution,
  };
}

interface SingleSimulationResult {
  won: boolean;
  peakUsage: number;
  moves: number;
}

function runSingleSimulation(
  sinkStacks: SinkTile[][],
  launcherQueue: LauncherConfig[],
  waitingStandSlots: number
): SingleSimulationResult {
  // Deep clone stacks
  const stacks = sinkStacks.map(s => s.map(t => ({ ...t })));
  const queue = [...launcherQueue];

  // Initialize launchers (first 4)
  let activeLaunchers = queue.splice(0, Math.min(4, queue.length));

  // Game state
  const waitingStand: FruitType[] = [];
  const launcherProgress: Map<number, number> = new Map(); // launcherIndex -> collected count

  let peakUsage = 0;
  let moves = 0;
  let launchersCompleted = 0;
  const totalLaunchers = launcherQueue.length + activeLaunchers.length;

  // Game loop
  while (stacks.some(s => s.length > 0)) {
    moves++;

    // Get all pickable tiles (top of each non-empty stack)
    const pickable: { tile: SinkTile; stackIndex: number }[] = [];
    stacks.forEach((stack, idx) => {
      if (stack.length > 0) {
        pickable.push({ tile: stack[0], stackIndex: idx });
      }
    });

    if (pickable.length === 0) break;

    // Random selection (simulating unskilled play)
    const choice = pickable[Math.floor(Math.random() * pickable.length)];
    stacks[choice.stackIndex].shift();

    // Find matching launcher
    let matchedLauncherIndex = -1;
    for (let i = 0; i < activeLaunchers.length; i++) {
      if (activeLaunchers[i].fruitType === choice.tile.fruitType) {
        const current = launcherProgress.get(i) || 0;
        if (current < 3) {
          matchedLauncherIndex = i;
          break;
        }
      }
    }

    if (matchedLauncherIndex >= 0) {
      // Add to launcher progress
      const newCount = (launcherProgress.get(matchedLauncherIndex) || 0) + 1;
      launcherProgress.set(matchedLauncherIndex, newCount);

      // Check if launcher fires
      if (newCount >= 3) {
        launchersCompleted++;
        launcherProgress.delete(matchedLauncherIndex);

        // Remove launcher and add from queue
        activeLaunchers.splice(matchedLauncherIndex, 1);
        if (queue.length > 0) {
          activeLaunchers.push(queue.shift()!);
        }

        // Reindex progress map
        const newProgress = new Map<number, number>();
        launcherProgress.forEach((count, idx) => {
          if (idx > matchedLauncherIndex) {
            newProgress.set(idx - 1, count);
          } else {
            newProgress.set(idx, count);
          }
        });
        launcherProgress.clear();
        newProgress.forEach((v, k) => launcherProgress.set(k, v));

        // Check waiting stand for matches
        for (let i = 0; i < activeLaunchers.length; i++) {
          const launcher = activeLaunchers[i];
          const currentCount = launcherProgress.get(i) || 0;
          const canTake = 3 - currentCount;

          let taken = 0;
          const newWaitingStand: FruitType[] = [];
          for (const fruit of waitingStand) {
            if (fruit === launcher.fruitType && taken < canTake) {
              taken++;
            } else {
              newWaitingStand.push(fruit);
            }
          }

          if (taken > 0) {
            waitingStand.length = 0;
            waitingStand.push(...newWaitingStand);
            const newTotal = currentCount + taken;
            launcherProgress.set(i, newTotal);

            // Check if this launcher now fires
            if (newTotal >= 3) {
              // Recursively handle... simplified: just complete it
              launchersCompleted++;
              launcherProgress.delete(i);
              activeLaunchers.splice(i, 1);
              if (queue.length > 0) {
                activeLaunchers.push(queue.shift()!);
              }
            }
          }
        }
      }
    } else {
      // Add to waiting stand
      waitingStand.push(choice.tile.fruitType);
      peakUsage = Math.max(peakUsage, waitingStand.length);

      // Check for game over
      if (waitingStand.length > waitingStandSlots) {
        return { won: false, peakUsage, moves };
      }
    }

    // Safety: prevent infinite loops
    if (moves > 10000) break;
  }

  // Win if all launchers completed
  const won = launchersCompleted >= totalLaunchers;

  return { won, peakUsage, moves };
}

// ============================================================================
// Combined Order Difficulty Score
// ============================================================================

/**
 * Calculate the complete order-based difficulty metrics.
 */
export function calculateOrderDifficulty(
  sinkStacks: SinkTile[][],
  launcherQueue: LauncherConfig[],
  waitingStandSlots: number,
  uniqueFruits: number,
  runSimulation: boolean = true
): OrderDifficultyMetrics {
  // Calculate individual factors
  const tripletResult = calculateTripletAccessibility(sinkStacks);
  const blockingResult = calculateBlockingScore(sinkStacks, launcherQueue);
  const interleavingResult = calculateInterleavingScore(sinkStacks);
  const alignmentResult = calculateLauncherAlignment(sinkStacks, launcherQueue);
  const entropyResult = calculateDecisionEntropy(sinkStacks, uniqueFruits);

  // Run simulation (can be expensive, so optional)
  let simulationResult: SimulationResult = {
    wins: 0,
    losses: 0,
    totalGames: 0,
    winRate: 0.5,
    averagePeakUsage: waitingStandSlots / 2,
    averageMoves: 0,
    peakUsageDistribution: [],
  };

  if (runSimulation && sinkStacks.some(s => s.length > 0)) {
    simulationResult = simulateGameplay(sinkStacks, launcherQueue, waitingStandSlots, 50);
  }

  // Waiting stand pressure from simulation
  const waitingStandPressure = simulationResult.averagePeakUsage / waitingStandSlots;
  const simulatedFailureRate = 1 - simulationResult.winRate;

  // Build factor breakdown with explanations
  const factorBreakdown: DifficultyFactorBreakdown[] = [
    {
      name: 'Triplet Accessibility',
      description: 'How deep are matching tiles buried in stacks',
      score: tripletResult.score,
      weight: ORDER_DIFFICULTY_WEIGHTS.tripletAccessibility,
      contribution: tripletResult.score * ORDER_DIFFICULTY_WEIGHTS.tripletAccessibility,
      explanation: tripletResult.score < 0.3
        ? 'Matching tiles are near the surface - easy to collect triplets'
        : tripletResult.score < 0.6
        ? 'Some digging required to find matching tiles'
        : 'Matching tiles deeply buried - significant effort to form triplets',
      impact: tripletResult.score < 0.3 ? 'easy' : tripletResult.score < 0.6 ? 'medium' : 'hard',
    },
    {
      name: 'Blocking Pattern',
      description: 'How often tiles block tiles needed sooner',
      score: blockingResult.score,
      weight: ORDER_DIFFICULTY_WEIGHTS.blockingScore,
      contribution: blockingResult.score * ORDER_DIFFICULTY_WEIGHTS.blockingScore,
      explanation: `${blockingResult.blockingPairs} of ${blockingResult.totalPairs} tile pairs create blocking situations`,
      impact: blockingResult.score < 0.3 ? 'easy' : blockingResult.score < 0.6 ? 'medium' : 'hard',
    },
    {
      name: 'Color Scattering',
      description: 'How spread out same-color tiles are across columns',
      score: interleavingResult.score,
      weight: ORDER_DIFFICULTY_WEIGHTS.interleavingScore,
      contribution: interleavingResult.score * ORDER_DIFFICULTY_WEIGHTS.interleavingScore,
      explanation: interleavingResult.score < 0.3
        ? 'Colors clustered together - easy to find matches'
        : interleavingResult.score < 0.6
        ? 'Colors moderately spread across columns'
        : 'Colors highly scattered - must scan entire board',
      impact: interleavingResult.score < 0.3 ? 'easy' : interleavingResult.score < 0.6 ? 'medium' : 'hard',
    },
    {
      name: 'Launcher Alignment',
      description: 'How well tile order matches launcher queue',
      score: alignmentResult.score,
      weight: ORDER_DIFFICULTY_WEIGHTS.launcherAlignment,
      contribution: alignmentResult.score * ORDER_DIFFICULTY_WEIGHTS.launcherAlignment,
      explanation: alignmentResult.score < 0.3
        ? 'Tiles appear when their launchers are active - smooth flow'
        : alignmentResult.score < 0.6
        ? 'Some mismatch between tile and launcher order'
        : 'Tiles poorly aligned with launcher order - waiting stand stress',
      impact: alignmentResult.score < 0.3 ? 'easy' : alignmentResult.score < 0.6 ? 'medium' : 'hard',
    },
    {
      name: 'Decision Complexity',
      description: 'How many meaningful choices at each move',
      score: entropyResult.score,
      weight: ORDER_DIFFICULTY_WEIGHTS.decisionEntropy,
      contribution: entropyResult.score * ORDER_DIFFICULTY_WEIGHTS.decisionEntropy,
      explanation: `~${entropyResult.averageChoices.toFixed(1)} different colors to choose from (${entropyResult.entropyBits.toFixed(2)} bits of entropy)`,
      impact: entropyResult.score < 0.3 ? 'easy' : entropyResult.score < 0.6 ? 'medium' : 'hard',
    },
    {
      name: 'Buffer Pressure',
      description: 'How much waiting stand gets used',
      score: waitingStandPressure,
      weight: ORDER_DIFFICULTY_WEIGHTS.waitingStandPressure,
      contribution: waitingStandPressure * ORDER_DIFFICULTY_WEIGHTS.waitingStandPressure,
      explanation: `Average peak usage: ${simulationResult.averagePeakUsage.toFixed(1)} of ${waitingStandSlots} slots`,
      impact: waitingStandPressure < 0.3 ? 'easy' : waitingStandPressure < 0.6 ? 'medium' : 'hard',
    },
    {
      name: 'Simulated Win Rate',
      description: 'Win probability with random play',
      score: simulatedFailureRate,
      weight: ORDER_DIFFICULTY_WEIGHTS.simulatedWinRate,
      contribution: simulatedFailureRate * ORDER_DIFFICULTY_WEIGHTS.simulatedWinRate,
      explanation: `${(simulationResult.winRate * 100).toFixed(0)}% win rate in ${simulationResult.totalGames} simulations`,
      impact: simulationResult.winRate > 0.7 ? 'easy' : simulationResult.winRate > 0.4 ? 'medium' : 'hard',
    },
  ];

  // Calculate combined score
  const orderDifficultyScore = Math.round(
    factorBreakdown.reduce((sum, f) => sum + f.contribution, 0) * 100
  );

  return {
    tripletAccessibility: tripletResult.score,
    blockingScore: blockingResult.score,
    interleavingScore: interleavingResult.score,
    launcherAlignment: alignmentResult.score,
    decisionEntropy: entropyResult.score,
    waitingStandPressure,
    simulatedFailureRate,
    simulatedAveragePeakUsage: simulationResult.averagePeakUsage,
    simulatedWinRate: simulationResult.winRate,
    orderDifficultyScore,
    factorBreakdown,
  };
}

// ============================================================================
// Tile Order Optimization Strategies
// ============================================================================

/**
 * Strategy 1: Cluster triplets together (make easier)
 */
export function optimizeForEasy(
  tiles: SinkTile[],
  sinkWidth: number,
  launcherQueue: LauncherConfig[]
): SinkTile[][] {
  // Group tiles by fruit type
  const byFruit = new Map<FruitType, SinkTile[]>();

  for (const tile of tiles) {
    if (!byFruit.has(tile.fruitType)) {
      byFruit.set(tile.fruitType, []);
    }
    byFruit.get(tile.fruitType)!.push({ ...tile });
  }

  // Create stacks by placing same-fruit tiles in adjacent columns
  const stacks: SinkTile[][] = Array.from({ length: sinkWidth }, () => []);
  let currentCol = 0;

  // Follow launcher order for optimal alignment
  const processedFruits = new Set<FruitType>();

  for (const launcher of launcherQueue) {
    if (processedFruits.has(launcher.fruitType)) continue;
    processedFruits.add(launcher.fruitType);

    const fruitTiles = byFruit.get(launcher.fruitType) || [];

    // Place all tiles of this fruit in 1-2 adjacent columns
    for (const tile of fruitTiles) {
      // Find column with least tiles
      let minCol = currentCol % sinkWidth;
      let minHeight = stacks[minCol].length;

      for (let c = 0; c < Math.min(2, sinkWidth); c++) {
        const col = (currentCol + c) % sinkWidth;
        if (stacks[col].length < minHeight) {
          minCol = col;
          minHeight = stacks[col].length;
        }
      }

      stacks[minCol].push({
        ...tile,
        stackIndex: stacks[minCol].length,
        position: minCol,
      });
    }

    currentCol = (currentCol + 2) % sinkWidth;
  }

  return stacks;
}

/**
 * Strategy 2: Scatter tiles maximally (make harder)
 */
export function optimizeForHard(
  tiles: SinkTile[],
  sinkWidth: number
): SinkTile[][] {
  // Interleave tiles maximally
  const byFruit = new Map<FruitType, SinkTile[]>();

  for (const tile of tiles) {
    if (!byFruit.has(tile.fruitType)) {
      byFruit.set(tile.fruitType, []);
    }
    byFruit.get(tile.fruitType)!.push({ ...tile });
  }

  const stacks: SinkTile[][] = Array.from({ length: sinkWidth }, () => []);
  const fruitQueues = Array.from(byFruit.values());

  let col = 0;
  let fruitIdx = 0;

  // Round-robin through fruit types, placing one tile at a time
  let iterations = 0;
  const maxIterations = tiles.length * 2;

  while (fruitQueues.some(q => q.length > 0) && iterations < maxIterations) {
    iterations++;

    // Find next non-empty queue (different from last placed)
    let attempts = 0;
    while (fruitQueues[fruitIdx].length === 0 && attempts < fruitQueues.length) {
      fruitIdx = (fruitIdx + 1) % fruitQueues.length;
      attempts++;
    }

    if (fruitQueues[fruitIdx].length > 0) {
      const tile = fruitQueues[fruitIdx].shift()!;
      stacks[col].push({
        ...tile,
        stackIndex: stacks[col].length,
        position: col,
      });
      col = (col + 1) % sinkWidth;
    }

    fruitIdx = (fruitIdx + 1) % fruitQueues.length;
  }

  return stacks;
}

/**
 * Strategy 3: Align with launcher order (optimal flow)
 */
export function optimizeForLauncherAlignment(
  tiles: SinkTile[],
  sinkWidth: number,
  launcherQueue: LauncherConfig[]
): SinkTile[][] {
  // Create tile availability order matching launcher needs
  const orderedTiles: SinkTile[] = [];
  const tilesByFruit = new Map<FruitType, SinkTile[]>();

  for (const tile of tiles) {
    if (!tilesByFruit.has(tile.fruitType)) {
      tilesByFruit.set(tile.fruitType, []);
    }
    tilesByFruit.get(tile.fruitType)!.push({ ...tile });
  }

  // Add tiles in launcher order (3 tiles per launcher)
  for (const launcher of launcherQueue) {
    const fruitTiles = tilesByFruit.get(launcher.fruitType) || [];
    for (let i = 0; i < 3 && fruitTiles.length > 0; i++) {
      orderedTiles.push(fruitTiles.shift()!);
    }
  }

  // Distribute to stacks maintaining order (top-to-bottom, left-to-right)
  const stacks: SinkTile[][] = Array.from({ length: sinkWidth }, () => []);

  // Calculate max height needed
  const maxHeight = Math.ceil(orderedTiles.length / sinkWidth);

  let tileIdx = 0;

  // Fill from bottom to top (so first tiles are accessible first)
  for (let depth = maxHeight - 1; depth >= 0; depth--) {
    for (let col = 0; col < sinkWidth && tileIdx < orderedTiles.length; col++) {
      const tile = orderedTiles[tileIdx];
      stacks[col].unshift({
        ...tile,
        stackIndex: 0, // Will be recalculated
        position: col,
      });
      tileIdx++;
    }
  }

  // Recalculate stack indices
  for (const stack of stacks) {
    stack.forEach((tile, idx) => {
      tile.stackIndex = idx;
    });
  }

  return stacks;
}

/**
 * Strategy 4: Introduce controlled blocking (fine-tune difficulty)
 */
export function introduceBlocking(
  stacks: SinkTile[][],
  blockingIntensity: number // 0-1
): SinkTile[][] {
  const result = stacks.map(s => s.map(t => ({ ...t })));
  const totalTiles = result.reduce((sum, s) => sum + s.length, 0);
  const swapsNeeded = Math.floor(blockingIntensity * totalTiles * 0.3);

  for (let i = 0; i < swapsNeeded; i++) {
    // Find a stack with depth >= 2
    const eligibleStacks = result.filter(s => s.length >= 2);
    if (eligibleStacks.length === 0) break;

    const stack = eligibleStacks[Math.floor(Math.random() * eligibleStacks.length)];

    // Swap adjacent tiles to potentially create blocking
    const swapIdx = Math.floor(Math.random() * (stack.length - 1));
    [stack[swapIdx], stack[swapIdx + 1]] = [stack[swapIdx + 1], stack[swapIdx]];

    // Update stack indices
    stack.forEach((tile, idx) => {
      tile.stackIndex = idx;
    });
  }

  return result;
}

/**
 * Optimize tile order to achieve target difficulty
 */
export function optimizeTileOrder(
  sinkStacks: SinkTile[][],
  launcherQueue: LauncherConfig[],
  waitingStandSlots: number,
  uniqueFruits: number,
  targetDifficulty: 'easy' | 'medium' | 'hard'
): OrderOptimizationResult {
  // Flatten current tiles
  const allTiles = sinkStacks.flat();
  const sinkWidth = sinkStacks.length;

  // Calculate original score
  const originalMetrics = calculateOrderDifficulty(
    sinkStacks,
    launcherQueue,
    waitingStandSlots,
    uniqueFruits,
    false
  );

  let optimizedStacks: SinkTile[][];
  let strategy: string;

  switch (targetDifficulty) {
    case 'easy':
      optimizedStacks = optimizeForEasy(allTiles, sinkWidth, launcherQueue);
      strategy = 'Clustered matching tiles and aligned with launcher order';
      break;
    case 'hard':
      optimizedStacks = optimizeForHard(allTiles, sinkWidth);
      optimizedStacks = introduceBlocking(optimizedStacks, 0.5);
      strategy = 'Scattered tiles and introduced blocking patterns';
      break;
    case 'medium':
    default:
      optimizedStacks = optimizeForLauncherAlignment(allTiles, sinkWidth, launcherQueue);
      optimizedStacks = introduceBlocking(optimizedStacks, 0.2);
      strategy = 'Aligned with launcher order with mild blocking';
      break;
  }

  // Calculate new score
  const optimizedMetrics = calculateOrderDifficulty(
    optimizedStacks,
    launcherQueue,
    waitingStandSlots,
    uniqueFruits,
    false
  );

  return {
    originalScore: originalMetrics.orderDifficultyScore,
    optimizedScore: optimizedMetrics.orderDifficultyScore,
    optimizedStacks,
    improvement: originalMetrics.orderDifficultyScore - optimizedMetrics.orderDifficultyScore,
    strategy,
  };
}
