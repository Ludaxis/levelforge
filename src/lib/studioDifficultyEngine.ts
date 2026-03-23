/**
 * Studio Difficulty Engine
 *
 * Production-grade difficulty system for Juicy Blast Studio mode.
 * Supports deterministic tile arrangement (seed-based), difficulty targeting,
 * Monte Carlo simulation, and progression curve generation.
 */

import { DifficultyTier } from '@/types/fruitMatch';
import {
  StudioGameConfig,
  StudioGameState,
  StudioTile,
  StudioLauncherState,
  calculateStudioDifficulty,
  pickTileLogic,
  findMatchingLauncher,
  mulberry32,
  initializeStateSeeded,
} from '@/lib/useStudioGame';
import { SAWTOOTH_CYCLE } from '@/lib/constants';

// ============================================================================
// Section 2: Types
// ============================================================================

/** All parameters controlling a level's difficulty. */
export interface DifficultyRecipe {
  blockingOffset: number;      // 0-10
  /** @deprecated Legacy mirror retained for older callers/tests. */
  mismatchDepth?: number;
  maxSelectableItems: number;  // 1-20
  activeLauncherCount: number; // 1-3
  seed: number;
}

/** Result of a Monte Carlo simulation run. */
export interface StudioSimulationResult {
  winRate: number;             // 0-1
  avgMoves: number;
  minMoves: number;            // fewest moves in any winning run
  maxMoves: number;            // most moves in any winning run
  peakStandUsage: number;
  nearLossRate: number;        // fraction of wins where stand was >= slots-1
  confidenceInterval: [number, number]; // Wilson 95% CI
  runs: number;
}

/** Target difficulty for a specific level in the progression. */
export interface ProgressionTarget {
  levelNumber: number;
  targetScore: number;         // 0-100
  tier: DifficultyTier;
  winRateRange: [number, number];
  sawtoothPosition: number;    // 1-10
}

/** Result of the difficulty targeting algorithm. */
export interface TargetingResult {
  recipe: DifficultyRecipe;
  achievedScore: number;
  tier: DifficultyTier;
  simulation?: StudioSimulationResult;
}

// ============================================================================
// Section 4: Monte Carlo Simulator
// ============================================================================

/** Player strategy for simulation. */
type PlayerStrategy = 'greedy' | 'semi-random' | 'random';

/**
 * Pick a tile index using one of three strategies.
 * - greedy: always pick best match
 * - semi-random: 60% chance to pick best match, 40% random
 * - random: pick any available tile
 */
function pickTileByStrategy(
  state: StudioGameState,
  strategy: PlayerStrategy,
  rng: () => number,
): number | null {
  const available: { idx: number; score: number }[] = [];

  for (let i = 0; i < state.layerA.length; i++) {
    const tile = state.layerA[i];
    if (!tile) continue;

    const launcher = state.activeLaunchers.find(
      (l) => l.colorType === tile.colorType && l.collected.length < 3 &&
        (l.collected.length === 0 || l.collected[0].variant === tile.variant),
    );

    let score: number;
    if (launcher) {
      score = launcher.collected.length === 2 ? 200 : 100;
    } else if (state.waitingStand.length < state.waitingStandSlots) {
      score = 0;
    } else {
      score = -1000;
    }

    available.push({ idx: i, score });
  }

  if (available.length === 0) return null;

  if (strategy === 'random') {
    return available[Math.floor(rng() * available.length)].idx;
  }

  // Sort by score descending
  available.sort((a, b) => b.score - a.score);

  if (strategy === 'greedy') {
    return available[0].idx;
  }

  // semi-random: 60% best, 40% random
  if (rng() < 0.6) {
    return available[0].idx;
  }
  // Filter out moves that would overflow the stand
  const safe = available.filter((a) => a.score > -1000);
  if (safe.length === 0) return available[0].idx; // forced best
  return safe[Math.floor(rng() * safe.length)].idx;
}

/**
 * Run a single simulated game and return result.
 */
function runSingleSimulation(
  config: StudioGameConfig,
  recipe: DifficultyRecipe,
  rng: () => number,
): { won: boolean; moves: number; peakStand: number; nearLoss: boolean } {
  const simConfig: StudioGameConfig = {
    ...config,
    maxSelectableItems: recipe.maxSelectableItems,
    activeLauncherCount: recipe.activeLauncherCount,
    blockingOffset: recipe.blockingOffset,
    mismatchDepth: recipe.mismatchDepth,
    seed: Math.floor(rng() * 2147483647),
  };

  let state = initializeStateSeeded(simConfig);

  // Pick strategy: 40% greedy, 40% semi-random, 20% random
  const roll = rng();
  const strategy: PlayerStrategy = roll < 0.4 ? 'greedy' : roll < 0.8 ? 'semi-random' : 'random';

  let peakStand = 0;
  const maxMoves = state.layerA.length * 3 + (state.layerC?.length || 0) + 100;

  for (let move = 0; move < maxMoves; move++) {
    if (state.isWon || state.isLost) break;

    const idx = pickTileByStrategy(state, strategy, rng);
    if (idx === null) break;

    state = pickTileLogic(state, idx);
    peakStand = Math.max(peakStand, state.waitingStand.length);
  }

  const nearLoss = state.isWon && peakStand >= state.waitingStandSlots - 1;

  return {
    won: state.isWon,
    moves: state.moveCount,
    peakStand,
    nearLoss,
  };
}

/**
 * Wilson score 95% confidence interval for a proportion.
 */
function wilsonCI(wins: number, total: number): [number, number] {
  if (total === 0) return [0, 1];
  const z = 1.96;
  const p = wins / total;
  const denominator = 1 + z * z / total;
  const center = p + z * z / (2 * total);
  const spread = z * Math.sqrt((p * (1 - p) + z * z / (4 * total)) / total);
  return [
    Math.max(0, (center - spread) / denominator),
    Math.min(1, (center + spread) / denominator),
  ];
}

/**
 * Monte Carlo simulation of a studio game.
 * Runs multiple simulated playthroughs with blended player strategies.
 */
export function simulateStudioGame(
  config: StudioGameConfig,
  recipe: DifficultyRecipe,
  runs: number = 200,
): StudioSimulationResult {
  const rng = mulberry32(recipe.seed ^ 0xCAFEBABE); // Different stream from tile gen

  let wins = 0;
  let totalWinMoves = 0;
  let minWinMoves = Infinity;
  let maxWinMoves = 0;
  let maxPeakStand = 0;
  let nearLosses = 0;

  for (let i = 0; i < runs; i++) {
    const result = runSingleSimulation(config, recipe, rng);
    if (result.won) {
      wins++;
      if (result.nearLoss) nearLosses++;
      totalWinMoves += result.moves;
      minWinMoves = Math.min(minWinMoves, result.moves);
      maxWinMoves = Math.max(maxWinMoves, result.moves);
    }
    maxPeakStand = Math.max(maxPeakStand, result.peakStand);
  }

  const winRate = wins / runs;
  const avgMoves = wins > 0 ? totalWinMoves / wins : 0;
  const nearLossRate = wins > 0 ? nearLosses / wins : 0;
  const ci = wilsonCI(wins, runs);

  return {
    winRate,
    avgMoves,
    minMoves: wins > 0 ? minWinMoves : 0,
    maxMoves: maxWinMoves,
    peakStandUsage: maxPeakStand,
    nearLossRate,
    confidenceInterval: ci,
    runs,
  };
}

// ============================================================================
// Section 5: Difficulty Targeting
// ============================================================================

/** Tier boundaries and win rate targets. */
const TIER_CONFIG: Record<DifficultyTier, { min: number; max: number; winRate: [number, number] }> = {
  trivial:   { min: 0,  max: 20, winRate: [0.85, 1.0] },
  easy:      { min: 20, max: 35, winRate: [0.65, 0.85] },
  medium:    { min: 35, max: 50, winRate: [0.40, 0.65] },
  hard:      { min: 50, max: 65, winRate: [0.25, 0.45] },
  expert:    { min: 65, max: 80, winRate: [0.15, 0.30] },
  nightmare: { min: 80, max: 100, winRate: [0.05, 0.20] },
};

/** Recipe presets for each tier (starting point for targeting). */
const TIER_PRESETS: Record<DifficultyTier, Omit<DifficultyRecipe, 'seed'>> = {
  trivial:   { blockingOffset: 0,  maxSelectableItems: 10, activeLauncherCount: 3 },
  easy:      { blockingOffset: 1,  maxSelectableItems: 9,  activeLauncherCount: 2 },
  medium:    { blockingOffset: 3,  maxSelectableItems: 8,  activeLauncherCount: 2 },
  hard:      { blockingOffset: 5,  maxSelectableItems: 7,  activeLauncherCount: 2 },
  expert:    { blockingOffset: 7,  maxSelectableItems: 6,  activeLauncherCount: 2 },
  nightmare: { blockingOffset: 10, maxSelectableItems: 6,  activeLauncherCount: 1 },
};

/** Get tier for a score. */
export function scoreToTier(score: number): DifficultyTier {
  if (score < 20) return 'trivial';
  if (score < 35) return 'easy';
  if (score < 50) return 'medium';
  if (score < 65) return 'hard';
  if (score < 80) return 'expert';
  return 'nightmare';
}

/** Build an initial recipe from a target score by interpolating between tier presets. */
function initialRecipeFromTarget(targetScore: number, seed: number): DifficultyRecipe {
  const tier = scoreToTier(targetScore);
  const preset = TIER_PRESETS[tier];

  // Get the tiers on either side for interpolation
  const tierCfg = TIER_CONFIG[tier];
  const t = tierCfg.max > tierCfg.min
    ? (targetScore - tierCfg.min) / (tierCfg.max - tierCfg.min)
    : 0.5;

  // Interpolate within tier range
  const tiers: DifficultyTier[] = ['trivial', 'easy', 'medium', 'hard', 'expert', 'nightmare'];
  const tierIdx = tiers.indexOf(tier);
  const nextTier = tierIdx < tiers.length - 1 ? tiers[tierIdx + 1] : tier;
  const nextPreset = TIER_PRESETS[nextTier];

  const lerp = (a: number, b: number, f: number) => a + (b - a) * f;

  return {
    blockingOffset: Math.round(lerp(preset.blockingOffset, nextPreset.blockingOffset, t)),
    mismatchDepth: Math.round(lerp(preset.blockingOffset, nextPreset.blockingOffset, t)) / 10,
    maxSelectableItems: Math.round(lerp(preset.maxSelectableItems, nextPreset.maxSelectableItems, t)),
    activeLauncherCount: Math.round(lerp(preset.activeLauncherCount, nextPreset.activeLauncherCount, t)),
    seed,
  };
}

/** Compute the difficulty score for a given recipe against a config. */
function computeRecipeScore(config: StudioGameConfig, recipe: DifficultyRecipe): number {
  const uniqueColors = new Set(config.selectableItems.map((s) => s.colorType)).size;
  const uniqueVariants = new Set(config.selectableItems.map((s) => `${s.colorType}:${s.variant}`)).size;
  return calculateStudioDifficulty({
    totalPixels: config.pixelArt.length,
    uniqueColors,
    groupCount: new Set(config.launchers.map((l) => l.group)).size,
    launcherCount: config.launchers.length,
    maxSelectableItems: recipe.maxSelectableItems,
    totalTiles: config.selectableItems.length,
    blockingOffset: recipe.blockingOffset,
    mismatchDepth: recipe.mismatchDepth,
    uniqueVariants,
  }).score;
}

/**
 * Target a specific difficulty score.
 * Iteratively adjusts recipe levers to converge on the target.
 */
export function targetDifficulty(
  config: StudioGameConfig,
  targetScore: number,
  options?: {
    seed?: number;
    validate?: boolean;
    simulationRuns?: number;
  },
): TargetingResult {
  const seed = options?.seed ?? Math.floor(Math.random() * 2147483647);
  const validate = options?.validate ?? false;
  const simulationRuns = options?.simulationRuns ?? 100;

  // Start from initial recipe
  let recipe = initialRecipeFromTarget(targetScore, seed);
  let currentScore = computeRecipeScore(config, recipe);

  // Iterative refinement (up to 20 iterations)
  for (let iter = 0; iter < 20; iter++) {
    const diff = targetScore - currentScore;
    if (Math.abs(diff) <= 2) break; // Close enough

    // Adjust the highest-impact lever in the right direction
    if (diff > 0) {
      // Need to increase difficulty
      if (recipe.blockingOffset < 10) {
        const blockingOffset = Math.min(10, recipe.blockingOffset + 1);
        recipe = { ...recipe, blockingOffset, mismatchDepth: blockingOffset / 10 };
      } else if (recipe.maxSelectableItems > 1) {
        recipe = { ...recipe, maxSelectableItems: recipe.maxSelectableItems - 1 };
      } else if (recipe.activeLauncherCount > 1) {
        recipe = { ...recipe, activeLauncherCount: recipe.activeLauncherCount - 1 };
      }
    } else {
      // Need to decrease difficulty
      if (recipe.blockingOffset > 0) {
        const blockingOffset = Math.max(0, recipe.blockingOffset - 1);
        recipe = { ...recipe, blockingOffset, mismatchDepth: blockingOffset / 10 };
      } else if (recipe.maxSelectableItems < 20) {
        recipe = { ...recipe, maxSelectableItems: recipe.maxSelectableItems + 1 };
      } else if (recipe.activeLauncherCount < 3) {
        recipe = { ...recipe, activeLauncherCount: recipe.activeLauncherCount + 1 };
      }
    }

    const newScore = computeRecipeScore(config, recipe);
    // If we overshot, stop
    if (Math.abs(newScore - targetScore) > Math.abs(currentScore - targetScore)) {
      break;
    }
    currentScore = newScore;
  }

  const tier = scoreToTier(currentScore);

  // Optional Monte Carlo validation
  let simulation: StudioSimulationResult | undefined;
  if (validate) {
    simulation = simulateStudioGame(config, recipe, simulationRuns);

    // Win rate nudging: if simulation shows win rate outside target range, adjust
    const tierCfg = TIER_CONFIG[tier];
    if (simulation.winRate > tierCfg.winRate[1] && currentScore < targetScore) {
      // Too easy — push difficulty up slightly
      if (recipe.blockingOffset < 10) {
        const blockingOffset = Math.min(10, recipe.blockingOffset + 1);
        recipe = { ...recipe, blockingOffset, mismatchDepth: blockingOffset / 10 };
      }
    } else if (simulation.winRate < tierCfg.winRate[0] && currentScore > targetScore) {
      // Too hard — ease off
      if (recipe.blockingOffset > 0) {
        const blockingOffset = Math.max(0, recipe.blockingOffset - 1);
        recipe = { ...recipe, blockingOffset, mismatchDepth: blockingOffset / 10 };
      }
    }

    // Recompute final score after nudge
    currentScore = computeRecipeScore(config, recipe);
  }

  return {
    recipe,
    achievedScore: currentScore,
    tier: scoreToTier(currentScore),
    simulation,
  };
}

// ============================================================================
// Section 6: Progression Curve
// ============================================================================

/** Envelope ceiling per level range. Returns max score. */
function envelopeCeiling(levelNumber: number): number {
  if (levelNumber <= 20) return 35;       // onboarding: max easy
  if (levelNumber <= 50) return 50;       // early: max medium
  if (levelNumber <= 100) return 65;      // mid: max hard
  return 100;                              // 101+: uncapped
}

/** Envelope floor per level range. Returns min score. */
function envelopeFloor(levelNumber: number): number {
  if (levelNumber <= 20) return 0;
  if (levelNumber <= 50) return 10;
  if (levelNumber <= 100) return 20;
  return 30;
}

/**
 * Get the progression target for a given level number.
 * Combines envelope ceiling with sawtooth cycle from constants.ts.
 */
export function getProgressionTarget(levelNumber: number): ProgressionTarget {
  // Sawtooth position: cycle of 10
  const cyclePos = ((levelNumber - 1) % 10); // 0-9
  const sawtoothEntry = SAWTOOTH_CYCLE[cyclePos];
  const sawtoothPosition = sawtoothEntry.position; // 1-10

  // Map sawtooth difficulty (2-9 scale) to score (0-100)
  // Sawtooth difficulty range is roughly 2-9
  const rawScore = ((sawtoothEntry.difficulty - 1) / 9) * 100;

  // Apply envelope constraints
  const ceiling = envelopeCeiling(levelNumber);
  const floor = envelopeFloor(levelNumber);
  const targetScore = Math.round(Math.min(ceiling, Math.max(floor, rawScore)));

  const tier = scoreToTier(targetScore);

  // Win rate ranges per tier
  const tierCfg = TIER_CONFIG[tier];

  return {
    levelNumber,
    targetScore,
    tier,
    winRateRange: tierCfg.winRate,
    sawtoothPosition,
  };
}

// ============================================================================
// Section 7: Batch Generation
// ============================================================================

/** Result of batch level generation. */
export interface LevelPackEntry {
  levelNumber: number;
  target: ProgressionTarget;
  result: TargetingResult;
}

/**
 * Generate recipes for a range of levels following the progression curve.
 * Each level gets a unique seed derived from its level number.
 */
export function generateLevelPack(
  config: StudioGameConfig,
  startLevel: number,
  count: number,
  options?: { baseSeed?: number; validate?: boolean },
): LevelPackEntry[] {
  const baseSeed = options?.baseSeed ?? 12345;
  const validate = options?.validate ?? false;
  const pack: LevelPackEntry[] = [];

  for (let i = 0; i < count; i++) {
    const levelNumber = startLevel + i;
    const target = getProgressionTarget(levelNumber);
    // Unique seed per level: combine base seed with level number
    const levelSeed = (baseSeed * 31 + levelNumber * 7919) | 0;

    const result = targetDifficulty(config, target.targetScore, {
      seed: levelSeed,
      validate,
      simulationRuns: validate ? 100 : undefined,
    });

    pack.push({ levelNumber, target, result });
  }

  return pack;
}
