/**
 * Studio Difficulty Engine
 *
 * Production-grade difficulty system for Juicy Blast Studio mode.
 * Supports deterministic tile arrangement (seed-based), difficulty targeting,
 * Monte Carlo simulation, and progression curve generation.
 */

import { PixelCell, DifficultyTier } from '@/types/fruitMatch';
import { COLOR_TYPE_TO_FRUIT } from '@/lib/juicyBlastExport';
import {
  StudioGameConfig,
  StudioGameState,
  StudioTile,
  StudioLauncherState,
  calculateStudioDifficulty,
  pickTileLogic,
  fireLauncher,
  findMatchingLauncher,
  postFireCascade,
} from '@/lib/useStudioGame';
import { SAWTOOTH_CYCLE } from '@/lib/constants';

// ============================================================================
// Section 1: Seeded PRNG
// ============================================================================

/**
 * Mulberry32 — fast 32-bit seeded PRNG.
 * Returns a function that produces deterministic numbers in [0, 1).
 */
export function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fisher-Yates shuffle using a seeded RNG. Mutates array in place.
 */
export function seededShuffle<T>(arr: T[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// ============================================================================
// Section 2: Types
// ============================================================================

/** All parameters controlling a level's difficulty. */
export interface DifficultyRecipe {
  mismatchDepth: number;       // 0-1
  maxSelectableItems: number;  // 6-10
  waitingStandSlots: number;   // 3-7
  activeLauncherCount: number; // 1-3
  seed: number;
}

/** Result of a Monte Carlo simulation run. */
export interface StudioSimulationResult {
  winRate: number;             // 0-1
  avgMoves: number;
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
// Section 3: Seeded tile arrangement builders
// ============================================================================

let _seededTileCounter = 0;
function seededTileId(rng: () => number): string {
  return `st-${++_seededTileCounter}-${Math.floor(rng() * 1e9).toString(36)}`;
}

let _seededLauncherCounter = 0;
function seededLauncherId(rng: () => number): string {
  return `sl-${++_seededLauncherCounter}-${Math.floor(rng() * 1e9).toString(36)}`;
}

/**
 * Build a solvable tile sequence using seeded RNG.
 * Mirrors buildSolvableSequence from useStudioGame.ts but deterministic.
 */
export function buildSolvableSequenceSeeded(
  allTiles: StudioTile[],
  launcherConfigs: { colorType: number; order: number }[],
  activeLauncherCount: number,
  rng: () => number,
): StudioTile[] {
  const tilesByColor = new Map<number, StudioTile[]>();
  for (const tile of allTiles) {
    if (!tilesByColor.has(tile.colorType)) {
      tilesByColor.set(tile.colorType, []);
    }
    tilesByColor.get(tile.colorType)!.push(tile);
  }

  for (const arr of tilesByColor.values()) {
    seededShuffle(arr, rng);
  }

  const sorted = [...launcherConfigs].sort((a, b) => a.order - b.order);
  const sequence: StudioTile[] = [];

  for (let i = 0; i < sorted.length; i += activeLauncherCount) {
    const batch = sorted.slice(i, i + activeLauncherCount);
    const perLauncher: StudioTile[][] = batch.map((cfg) => {
      const pool = tilesByColor.get(cfg.colorType) || [];
      return pool.splice(0, 3);
    });

    const maxRound = Math.max(...perLauncher.map((t) => t.length), 0);
    for (let round = 0; round < maxRound; round++) {
      const roundTiles: StudioTile[] = [];
      for (const tiles of perLauncher) {
        if (round < tiles.length) {
          roundTiles.push(tiles[round]);
        }
      }
      seededShuffle(roundTiles, rng);
      sequence.push(...roundTiles);
    }
  }

  for (const arr of tilesByColor.values()) {
    sequence.push(...arr);
  }

  return sequence;
}

/**
 * Build a challenging tile sequence with burial, using seeded RNG.
 * Mirrors buildChallengingSequence from useStudioGame.ts but deterministic.
 */
export function buildChallengingSequenceSeeded(
  allTiles: StudioTile[],
  launcherConfigs: { colorType: number; order: number }[],
  activeLauncherCount: number,
  mismatchDepth: number,
  rng: () => number,
): StudioTile[] {
  const tilesByColor = new Map<number, StudioTile[]>();
  for (const tile of allTiles) {
    if (!tilesByColor.has(tile.colorType)) {
      tilesByColor.set(tile.colorType, []);
    }
    tilesByColor.get(tile.colorType)!.push(tile);
  }
  for (const arr of tilesByColor.values()) {
    seededShuffle(arr, rng);
  }

  const sorted = [...launcherConfigs].sort((a, b) => a.order - b.order);
  const batches: StudioTile[][] = [];

  for (let i = 0; i < sorted.length; i += activeLauncherCount) {
    const batch = sorted.slice(i, i + activeLauncherCount);
    const batchTiles: StudioTile[] = [];
    for (const cfg of batch) {
      const pool = tilesByColor.get(cfg.colorType) || [];
      batchTiles.push(...pool.splice(0, 3));
    }
    seededShuffle(batchTiles, rng);
    batches.push(batchTiles);
  }

  const n = batches.length;
  const swapCount = Math.round(mismatchDepth * Math.floor(n / 2));
  for (let i = 0; i < swapCount; i++) {
    const j = n - 1 - i;
    if (i < j) {
      [batches[i], batches[j]] = [batches[j], batches[i]];
    }
  }

  const sequence = batches.flat();
  for (const arr of tilesByColor.values()) {
    sequence.push(...arr);
  }

  return sequence;
}

/**
 * Greedy solvability check (seeded version for simulation).
 * Returns true if a greedy solver can fire all launchers.
 */
function verifySolvabilitySeeded(
  layerA: (StudioTile | null)[],
  layerB: (StudioTile | null)[],
  layerC: StudioTile[],
  launcherConfigs: { colorType: number; order: number }[],
  activeLauncherCount: number,
  waitingStandSlots: number,
): boolean {
  const simA = layerA.map((t) => (t ? { ...t } : null));
  const simB = layerB.map((t) => (t ? { ...t } : null));
  const simC = layerC.map((t) => ({ ...t }));

  const sorted = [...launcherConfigs].sort((a, b) => a.order - b.order);

  interface SimLauncher { colorType: number; collected: number }

  const active: SimLauncher[] = sorted
    .slice(0, activeLauncherCount)
    .map((l) => ({ colorType: l.colorType, collected: 0 }));
  const queue: SimLauncher[] = sorted
    .slice(activeLauncherCount)
    .map((l) => ({ colorType: l.colorType, collected: 0 }));

  const stand: number[] = [];
  let fired = 0;
  const totalLaunchers = sorted.length;
  const maxIter = layerA.length * 4 + layerC.length + 200;

  for (let iter = 0; iter < maxIter; iter++) {
    if (fired >= totalLaunchers) return true;

    const available: { idx: number; tile: StudioTile }[] = [];
    for (let i = 0; i < simA.length; i++) {
      if (simA[i]) available.push({ idx: i, tile: simA[i]! });
    }
    if (available.length === 0) break;

    let bestIdx = -1;
    let bestScore = -Infinity;

    for (const { idx, tile } of available) {
      const launcher = active.find(
        (l) => l.colorType === tile.colorType && l.collected < 3,
      );
      let score: number;
      if (launcher) {
        score = launcher.collected === 2 ? 200 : 100;
      } else if (stand.length < waitingStandSlots) {
        score = 0;
      } else {
        score = -1000;
      }
      if (score > bestScore) {
        bestScore = score;
        bestIdx = idx;
      }
    }

    if (bestIdx === -1) break;

    if (bestScore <= -1000) {
      const match = available.find(({ tile }) =>
        active.some((l) => l.colorType === tile.colorType && l.collected < 3),
      );
      if (match) {
        bestIdx = match.idx;
      } else {
        return false;
      }
    }

    const tile = simA[bestIdx]!;
    simA[bestIdx] = null;

    if (simB[bestIdx]) {
      simA[bestIdx] = simB[bestIdx];
      simB[bestIdx] = null;
      if (simC.length > 0) {
        simB[bestIdx] = simC.shift()!;
      }
    }

    const matchLauncher = active.find(
      (l) => l.colorType === tile.colorType && l.collected < 3,
    );

    if (matchLauncher) {
      matchLauncher.collected++;
      if (matchLauncher.collected >= 3) {
        fired++;
        active.splice(active.indexOf(matchLauncher), 1);
        if (queue.length > 0) active.push(queue.shift()!);

        let changed = true;
        while (changed) {
          changed = false;
          for (const l of active) {
            if (l.collected >= 3) continue;
            const need = 3 - l.collected;
            const indices: number[] = [];
            for (let i = 0; i < stand.length && indices.length < need; i++) {
              if (stand[i] === l.colorType) indices.push(i);
            }
            if (indices.length > 0) {
              l.collected += indices.length;
              for (let j = indices.length - 1; j >= 0; j--) {
                stand.splice(indices[j], 1);
              }
              changed = true;
            }
          }
          const nowFiring = active.filter((l) => l.collected >= 3);
          for (const l of nowFiring) {
            fired++;
            active.splice(active.indexOf(l), 1);
            if (queue.length > 0) active.push(queue.shift()!);
            changed = true;
          }
        }
      }
    } else {
      if (stand.length >= waitingStandSlots) return false;
      stand.push(tile.colorType);
    }
  }

  return fired >= totalLaunchers;
}

/** Distribute a tile sequence into three layers. */
function distributeToLayers(
  sequence: StudioTile[],
  maxSelectableItems: number,
): { a: (StudioTile | null)[]; b: (StudioTile | null)[]; c: StudioTile[] } {
  const a: (StudioTile | null)[] = new Array(maxSelectableItems).fill(null);
  const b: (StudioTile | null)[] = new Array(maxSelectableItems).fill(null);
  const c: StudioTile[] = [];
  sequence.forEach((tile, idx) => {
    if (idx < maxSelectableItems) a[idx] = tile;
    else if (idx < 2 * maxSelectableItems) b[idx - maxSelectableItems] = tile;
    else c.push(tile);
  });
  return { a, b, c };
}

/**
 * Deterministic version of initializeState.
 * Uses the seed from config to produce identical tile arrangements.
 */
export function initializeStateSeeded(config: StudioGameConfig): StudioGameState {
  const {
    pixelArt,
    maxSelectableItems,
    waitingStandSlots,
    selectableItems,
    launchers,
    activeLauncherCount = 2,
    mismatchDepth = 0,
    seed = 42,
  } = config;

  const rng = mulberry32(seed);

  // Create all tiles with deterministic IDs
  const allTiles: StudioTile[] = selectableItems.map((item) => ({
    id: seededTileId(rng),
    colorType: item.colorType,
    variant: item.variant,
    fruitType: COLOR_TYPE_TO_FRUIT[item.colorType] || 'apple',
  }));

  const sortedLauncherConfigs = [...launchers].sort((a, b) => a.order - b.order);

  let layerA: (StudioTile | null)[] = new Array(maxSelectableItems).fill(null);
  let layerB: (StudioTile | null)[] = new Array(maxSelectableItems).fill(null);
  let layerC: StudioTile[] = [];

  if (mismatchDepth > 0) {
    const RETRIES_PER_DEPTH = 5;
    let found = false;

    for (let attempt = 0; attempt < RETRIES_PER_DEPTH && !found; attempt++) {
      const sequence = buildChallengingSequenceSeeded(
        allTiles, sortedLauncherConfigs, activeLauncherCount, mismatchDepth, rng,
      );
      const layers = distributeToLayers(sequence, maxSelectableItems);
      if (verifySolvabilitySeeded(layers.a, layers.b, layers.c, sortedLauncherConfigs, activeLauncherCount, waitingStandSlots)) {
        layerA = layers.a;
        layerB = layers.b;
        layerC = layers.c;
        found = true;
      }
    }

    if (!found) {
      for (let depth = mismatchDepth - 0.05; depth > 0 && !found; depth -= 0.05) {
        for (let attempt = 0; attempt < RETRIES_PER_DEPTH && !found; attempt++) {
          const sequence = buildChallengingSequenceSeeded(
            allTiles, sortedLauncherConfigs, activeLauncherCount,
            Math.max(0, +depth.toFixed(2)), rng,
          );
          const layers = distributeToLayers(sequence, maxSelectableItems);
          if (verifySolvabilitySeeded(layers.a, layers.b, layers.c, sortedLauncherConfigs, activeLauncherCount, waitingStandSlots)) {
            layerA = layers.a;
            layerB = layers.b;
            layerC = layers.c;
            found = true;
          }
        }
      }
    }
  }

  // Solvable fallback
  if (layerA.every((t) => t === null)) {
    const MAX_RETRIES = 20;
    let solvable = false;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const sequence = buildSolvableSequenceSeeded(
        allTiles, sortedLauncherConfigs, activeLauncherCount, rng,
      );
      const layers = distributeToLayers(sequence, maxSelectableItems);

      solvable = verifySolvabilitySeeded(
        layers.a, layers.b, layers.c, sortedLauncherConfigs, activeLauncherCount, waitingStandSlots,
      );

      if (solvable) {
        layerA = layers.a;
        layerB = layers.b;
        layerC = layers.c;
        break;
      }
    }

    // Strict fallback
    if (!solvable) {
      const tilesByColor = new Map<number, StudioTile[]>();
      for (const tile of allTiles) {
        if (!tilesByColor.has(tile.colorType)) {
          tilesByColor.set(tile.colorType, []);
        }
        tilesByColor.get(tile.colorType)!.push(tile);
      }

      const strictSequence: StudioTile[] = [];
      for (let i = 0; i < sortedLauncherConfigs.length; i += activeLauncherCount) {
        const batch = sortedLauncherConfigs.slice(i, i + activeLauncherCount);
        for (const cfg of batch) {
          const pool = tilesByColor.get(cfg.colorType) || [];
          strictSequence.push(...pool.splice(0, 3));
        }
      }
      for (const arr of tilesByColor.values()) {
        strictSequence.push(...arr);
      }

      const layers = distributeToLayers(strictSequence, maxSelectableItems);
      layerA = layers.a;
      layerB = layers.b;
      layerC = layers.c;
    }
  }

  // Create launcher state objects with deterministic IDs
  const allLaunchers: StudioLauncherState[] = sortedLauncherConfigs.map((l) => ({
    id: seededLauncherId(rng),
    colorType: l.colorType,
    fruitType: COLOR_TYPE_TO_FRUIT[l.colorType] || 'apple',
    pixelCount: l.pixelCount,
    group: l.group,
    collected: [],
  }));

  const activeLaunchers = allLaunchers.slice(0, activeLauncherCount);
  const launcherQueue = allLaunchers.slice(activeLauncherCount);

  const freshPixelArt = pixelArt.map((cell) => ({ ...cell, filled: false }));

  return {
    layerA,
    layerB,
    layerC,
    waitingStand: [],
    activeLaunchers,
    launcherQueue,
    pixelArt: freshPixelArt,
    moveCount: 0,
    matchCount: 0,
    isWon: false,
    isLost: false,
    waitingStandSlots,
  };
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
      (l) => l.colorType === tile.colorType && l.collected.length < 3,
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
    waitingStandSlots: recipe.waitingStandSlots,
    activeLauncherCount: recipe.activeLauncherCount,
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
  let totalMoves = 0;
  let maxPeakStand = 0;
  let nearLosses = 0;

  for (let i = 0; i < runs; i++) {
    const result = runSingleSimulation(config, recipe, rng);
    if (result.won) {
      wins++;
      if (result.nearLoss) nearLosses++;
    }
    totalMoves += result.moves;
    maxPeakStand = Math.max(maxPeakStand, result.peakStand);
  }

  const winRate = wins / runs;
  const avgMoves = totalMoves / runs;
  const nearLossRate = wins > 0 ? nearLosses / wins : 0;
  const ci = wilsonCI(wins, runs);

  return {
    winRate,
    avgMoves,
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
  trivial:   { mismatchDepth: 0,    maxSelectableItems: 10, waitingStandSlots: 7, activeLauncherCount: 3 },
  easy:      { mismatchDepth: 0.15, maxSelectableItems: 9,  waitingStandSlots: 6, activeLauncherCount: 2 },
  medium:    { mismatchDepth: 0.35, maxSelectableItems: 8,  waitingStandSlots: 5, activeLauncherCount: 2 },
  hard:      { mismatchDepth: 0.6,  maxSelectableItems: 7,  waitingStandSlots: 5, activeLauncherCount: 2 },
  expert:    { mismatchDepth: 0.8,  maxSelectableItems: 6,  waitingStandSlots: 4, activeLauncherCount: 2 },
  nightmare: { mismatchDepth: 1.0,  maxSelectableItems: 6,  waitingStandSlots: 3, activeLauncherCount: 1 },
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
    mismatchDepth: Math.round(lerp(preset.mismatchDepth, nextPreset.mismatchDepth, t) * 20) / 20, // snap to 0.05
    maxSelectableItems: Math.round(lerp(preset.maxSelectableItems, nextPreset.maxSelectableItems, t)),
    waitingStandSlots: Math.round(lerp(preset.waitingStandSlots, nextPreset.waitingStandSlots, t)),
    activeLauncherCount: Math.round(lerp(preset.activeLauncherCount, nextPreset.activeLauncherCount, t)),
    seed,
  };
}

/** Compute the difficulty score for a given recipe against a config. */
function computeRecipeScore(config: StudioGameConfig, recipe: DifficultyRecipe): number {
  const uniqueColors = new Set(config.selectableItems.map((s) => s.colorType)).size;
  return calculateStudioDifficulty({
    totalPixels: config.pixelArt.length,
    uniqueColors,
    groupCount: new Set(config.launchers.map((l) => l.group)).size,
    launcherCount: config.launchers.length,
    waitingStandSlots: recipe.waitingStandSlots,
    maxSelectableItems: recipe.maxSelectableItems,
    totalTiles: config.selectableItems.length,
    mismatchDepth: recipe.mismatchDepth,
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
      if (recipe.mismatchDepth < 1) {
        recipe = { ...recipe, mismatchDepth: Math.min(1, +(recipe.mismatchDepth + 0.05).toFixed(2)) };
      } else if (recipe.waitingStandSlots > 3) {
        recipe = { ...recipe, waitingStandSlots: recipe.waitingStandSlots - 1 };
      } else if (recipe.maxSelectableItems > 6) {
        recipe = { ...recipe, maxSelectableItems: recipe.maxSelectableItems - 1 };
      } else if (recipe.activeLauncherCount > 1) {
        recipe = { ...recipe, activeLauncherCount: recipe.activeLauncherCount - 1 };
      }
    } else {
      // Need to decrease difficulty
      if (recipe.mismatchDepth > 0) {
        recipe = { ...recipe, mismatchDepth: Math.max(0, +(recipe.mismatchDepth - 0.05).toFixed(2)) };
      } else if (recipe.waitingStandSlots < 7) {
        recipe = { ...recipe, waitingStandSlots: recipe.waitingStandSlots + 1 };
      } else if (recipe.maxSelectableItems < 10) {
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
      if (recipe.mismatchDepth < 1) {
        recipe = { ...recipe, mismatchDepth: Math.min(1, +(recipe.mismatchDepth + 0.05).toFixed(2)) };
      }
    } else if (simulation.winRate < tierCfg.winRate[0] && currentScore > targetScore) {
      // Too hard — ease off
      if (recipe.mismatchDepth > 0) {
        recipe = { ...recipe, mismatchDepth: Math.max(0, +(recipe.mismatchDepth - 0.05).toFixed(2)) };
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
