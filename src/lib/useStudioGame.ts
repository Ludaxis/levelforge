import { useState, useCallback, useMemo } from 'react';
import { PixelCell, FruitType, FRUIT_COLORS, FRUIT_EMOJI, DifficultyTier } from '@/types/fruitMatch';
import { COLOR_TYPE_TO_FRUIT, FRUIT_TO_COLOR_TYPE } from '@/lib/juicyBlastExport';

// ============================================================================
// Studio Difficulty Types & Calculator
// ============================================================================

export interface StudioDifficultyParams {
  totalPixels: number;
  uniqueColors: number;
  groupCount: number;
  launcherCount: number;
  waitingStandSlots: number;
  maxSelectableItems: number;
  totalTiles: number;
  mismatchDepth: number; // 0-1: how buried matching tiles are
}

export interface StudioDifficultyResult {
  score: number;       // 0-100
  tier: DifficultyTier;
  components: {
    tileBurial: number;       // 0-1  (mismatchDepth direct)
    standPressure: number;    // 0-1
    colorComplexity: number;  // 0-1
    sequenceLength: number;   // 0-1
    layerDepth: number;       // 0-1
    gridConstraint: number;   // 0-1
  };
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export function calculateStudioDifficulty(params: StudioDifficultyParams): StudioDifficultyResult {
  const {
    uniqueColors,
    launcherCount,
    waitingStandSlots,
    maxSelectableItems,
    totalTiles,
    mismatchDepth,
  } = params;

  // Tile burial (0.35): direct slider — most impactful lever
  const tileBurial = clamp01(mismatchDepth);

  // Stand pressure (0.15): how tight the stand is vs active colors
  // Uses softer curve: +2 buffer so moderate color counts don't saturate
  const standPressure = clamp01((uniqueColors - waitingStandSlots + 2) / 6);

  // Color complexity (0.10): more colors = harder
  const colorComplexity = clamp01((uniqueColors - 2) / 5);

  // Sequence length (0.10): more launchers = longer game
  const sequenceLength = clamp01((launcherCount - 4) / 12);

  // Layer depth (0.10): hidden tile ratio
  const layerDepth = totalTiles > 0
    ? clamp01((totalTiles - maxSelectableItems) / totalTiles)
    : 0;

  // Grid constraint (0.20): smaller grid = harder (range 6-10)
  const gridConstraint = clamp01(1 - (maxSelectableItems - 6) / 4);

  const raw =
    tileBurial * 0.35 +
    standPressure * 0.15 +
    colorComplexity * 0.10 +
    sequenceLength * 0.10 +
    layerDepth * 0.10 +
    gridConstraint * 0.20;

  const score = Math.round(raw * 100);

  let tier: DifficultyTier;
  if (score < 20) tier = 'trivial';
  else if (score < 35) tier = 'easy';
  else if (score < 50) tier = 'medium';
  else if (score < 65) tier = 'hard';
  else if (score < 80) tier = 'expert';
  else tier = 'nightmare';

  return {
    score,
    tier,
    components: {
      tileBurial,
      standPressure,
      colorComplexity,
      sequenceLength,
      layerDepth,
      gridConstraint,
    },
  };
}

// ============================================================================
// Types
// ============================================================================

export interface StudioTile {
  id: string;
  colorType: number;
  variant: number;
  fruitType: FruitType;
}

export interface StudioLauncherState {
  id: string;
  colorType: number;
  fruitType: FruitType;
  pixelCount: number;
  group: number;
  collected: StudioTile[]; // 0→3, fires at 3
}

export interface StudioGameConfig {
  pixelArt: PixelCell[];
  pixelArtWidth: number;
  pixelArtHeight: number;
  maxSelectableItems: number;
  waitingStandSlots: number;
  selectableItems: { colorType: number; variant: number; order: number }[];
  launchers: { colorType: number; pixelCount: number; group: number; order: number }[];
  activeLauncherCount?: number; // default 2
  /** 0-1: how much to bury matching tiles. 0=solvable, 1=max burial */
  mismatchDepth?: number;
  /** Actual hex colors per colorType from the artwork (e.g. { 0: '4C9EF2', 7: 'FFFBF7' }) */
  colorTypeToHex?: Record<number, string>;
  /** Optional seed for deterministic tile arrangement */
  seed?: number;
}

export interface StudioGameState {
  /** Layer A — visible, clickable tile grid */
  layerA: (StudioTile | null)[];
  /** Layer B — dimmed behind A, shows what will replace A when picked */
  layerB: (StudioTile | null)[];
  /** Layer C — FIFO queue feeding empty B slots */
  layerC: StudioTile[];
  waitingStand: StudioTile[];
  activeLaunchers: StudioLauncherState[];
  launcherQueue: StudioLauncherState[];
  pixelArt: PixelCell[];
  moveCount: number;
  matchCount: number;
  isWon: boolean;
  isLost: boolean;
  waitingStandSlots: number;
}

// ============================================================================
// ID generators
// ============================================================================

let _tileIdCounter = 0;
function tileId(): string {
  return `st-${++_tileIdCounter}-${Math.random().toString(36).slice(2, 7)}`;
}

let _launcherIdCounter = 0;
function launcherId(): string {
  return `sl-${++_launcherIdCounter}-${Math.random().toString(36).slice(2, 7)}`;
}

// ============================================================================
// Shuffle helper
// ============================================================================

function shuffleArray<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// ============================================================================
// Solvable tile arrangement
// ============================================================================

/**
 * Build a tile sequence guaranteed to be solvable.
 *
 * Groups tiles into batches matching launcher activation order:
 * - Batch 1: tiles for the first `activeLauncherCount` launchers
 * - Batch 2: tiles for the next set of launchers
 * - etc.
 *
 * Within each batch, tiles are interleaved round-robin (1 per launcher
 * per round) and shuffled per round for variety. This ensures every tile
 * appears while its matching launcher is active.
 */
function buildSolvableSequence(
  allTiles: StudioTile[],
  launcherConfigs: { colorType: number; order: number }[],
  activeLauncherCount: number,
): StudioTile[] {
  // Group tiles by colorType
  const tilesByColor = new Map<number, StudioTile[]>();
  for (const tile of allTiles) {
    if (!tilesByColor.has(tile.colorType)) {
      tilesByColor.set(tile.colorType, []);
    }
    tilesByColor.get(tile.colorType)!.push(tile);
  }

  // Shuffle within each color group for variant diversity
  for (const arr of tilesByColor.values()) {
    shuffleArray(arr);
  }

  const sorted = [...launcherConfigs].sort((a, b) => a.order - b.order);
  const sequence: StudioTile[] = [];

  // Process launchers in batches of activeLauncherCount
  for (let i = 0; i < sorted.length; i += activeLauncherCount) {
    const batch = sorted.slice(i, i + activeLauncherCount);

    // Take up to 3 tiles per launcher from their color pool
    const perLauncher: StudioTile[][] = batch.map((cfg) => {
      const pool = tilesByColor.get(cfg.colorType) || [];
      return pool.splice(0, 3);
    });

    // Interleave round-robin: 1 tile per launcher per round, shuffle each round
    const maxRound = Math.max(...perLauncher.map((t) => t.length), 0);
    for (let round = 0; round < maxRound; round++) {
      const roundTiles: StudioTile[] = [];
      for (const tiles of perLauncher) {
        if (round < tiles.length) {
          roundTiles.push(tiles[round]);
        }
      }
      shuffleArray(roundTiles);
      sequence.push(...roundTiles);
    }
  }

  // Leftover tiles that don't match any launcher
  for (const arr of tilesByColor.values()) {
    sequence.push(...arr);
  }

  return sequence;
}

// ============================================================================
// Challenging tile arrangement (burial)
// ============================================================================

/**
 * Build a tile sequence where matching tiles for early launchers are buried.
 *
 * mismatchDepth controls how many launcher batches are reversed:
 *   0   → identical to solvable order (batch 1 first)
 *   0.5 → half the batches swapped (moderate challenge)
 *   1.0 → fully reversed (batch N first, batch 1 last = max burial)
 *
 * At high depth the game becomes legitimately hard because the player
 * must pick non-matching tiles (filling the waiting stand) to uncover
 * the tiles they actually need.
 */
function buildChallengingSequence(
  allTiles: StudioTile[],
  launcherConfigs: { colorType: number; order: number }[],
  activeLauncherCount: number,
  mismatchDepth: number,
): StudioTile[] {
  // Group tiles by colorType
  const tilesByColor = new Map<number, StudioTile[]>();
  for (const tile of allTiles) {
    if (!tilesByColor.has(tile.colorType)) {
      tilesByColor.set(tile.colorType, []);
    }
    tilesByColor.get(tile.colorType)!.push(tile);
  }
  for (const arr of tilesByColor.values()) {
    shuffleArray(arr);
  }

  const sorted = [...launcherConfigs].sort((a, b) => a.order - b.order);

  // Build batches of tiles (one batch per group of active launchers)
  const batches: StudioTile[][] = [];
  for (let i = 0; i < sorted.length; i += activeLauncherCount) {
    const batch = sorted.slice(i, i + activeLauncherCount);
    const batchTiles: StudioTile[] = [];
    for (const cfg of batch) {
      const pool = tilesByColor.get(cfg.colorType) || [];
      batchTiles.push(...pool.splice(0, 3));
    }
    shuffleArray(batchTiles);
    batches.push(batchTiles);
  }

  // Reverse batches proportionally to mismatchDepth
  // At 1.0: fully reversed. At 0.5: swap outer half of pairs.
  const n = batches.length;
  const swapCount = Math.round(mismatchDepth * Math.floor(n / 2));
  for (let i = 0; i < swapCount; i++) {
    const j = n - 1 - i;
    if (i < j) {
      [batches[i], batches[j]] = [batches[j], batches[i]];
    }
  }

  const sequence = batches.flat();

  // Leftover tiles
  for (const arr of tilesByColor.values()) {
    sequence.push(...arr);
  }

  return sequence;
}

// ============================================================================
// Solvability verification (greedy simulation)
// ============================================================================

/**
 * Simulate greedy play to verify solvability.
 *
 * Heuristic pick order:
 * 1. Pick tile that completes a launcher (collected=2) → highest priority
 * 2. Pick tile matching any active launcher → medium priority
 * 3. Pick any tile (goes to stand) → only if stand has room
 *
 * Returns true if the greedy solver can fire all launchers.
 */
function verifySolvability(
  layerA: (StudioTile | null)[],
  layerB: (StudioTile | null)[],
  layerC: StudioTile[],
  launcherConfigs: { colorType: number; order: number }[],
  activeLauncherCount: number,
  waitingStandSlots: number,
): boolean {
  // Deep clone simulation state
  const simA = layerA.map((t) => (t ? { ...t } : null));
  const simB = layerB.map((t) => (t ? { ...t } : null));
  const simC = layerC.map((t) => ({ ...t }));

  const sorted = [...launcherConfigs].sort((a, b) => a.order - b.order);

  interface SimLauncher {
    colorType: number;
    collected: number;
  }

  const active: SimLauncher[] = sorted
    .slice(0, activeLauncherCount)
    .map((l) => ({ colorType: l.colorType, collected: 0 }));
  const queue: SimLauncher[] = sorted
    .slice(activeLauncherCount)
    .map((l) => ({ colorType: l.colorType, collected: 0 }));

  const stand: number[] = []; // colorTypes in stand
  let fired = 0;
  const totalLaunchers = sorted.length;
  const maxIter = layerA.length * 4 + layerC.length + 200;

  for (let iter = 0; iter < maxIter; iter++) {
    if (fired >= totalLaunchers) return true;

    // Collect available tiles from A
    const available: { idx: number; tile: StudioTile }[] = [];
    for (let i = 0; i < simA.length; i++) {
      if (simA[i]) available.push({ idx: i, tile: simA[i]! });
    }
    if (available.length === 0) break;

    // Score each pick option
    let bestIdx = -1;
    let bestScore = -Infinity;

    for (const { idx, tile } of available) {
      const launcher = active.find(
        (l) => l.colorType === tile.colorType && l.collected < 3,
      );
      let score: number;
      if (launcher) {
        // Prefer completing a launcher (causes fire + cascade)
        score = launcher.collected === 2 ? 200 : 100;
      } else if (stand.length < waitingStandSlots) {
        score = 0; // Goes to stand, but room available
      } else {
        score = -1000; // Would overflow stand
      }
      if (score > bestScore) {
        bestScore = score;
        bestIdx = idx;
      }
    }

    if (bestIdx === -1) break;

    // If all options overflow, try to find any matching tile
    if (bestScore <= -1000) {
      const match = available.find(({ tile }) =>
        active.some(
          (l) => l.colorType === tile.colorType && l.collected < 3,
        ),
      );
      if (match) {
        bestIdx = match.idx;
      } else {
        return false; // All picks overflow and none match — unsolvable
      }
    }

    // Execute pick
    const tile = simA[bestIdx]!;
    simA[bestIdx] = null;

    // Promote B → A, C → B
    if (simB[bestIdx]) {
      simA[bestIdx] = simB[bestIdx];
      simB[bestIdx] = null;
      if (simC.length > 0) {
        simB[bestIdx] = simC.shift()!;
      }
    }

    // Route tile to launcher or stand
    const matchLauncher = active.find(
      (l) => l.colorType === tile.colorType && l.collected < 3,
    );

    if (matchLauncher) {
      matchLauncher.collected++;

      if (matchLauncher.collected >= 3) {
        fired++;
        active.splice(active.indexOf(matchLauncher), 1);
        if (queue.length > 0) active.push(queue.shift()!);

        // Cascade: auto-match from stand to active launchers
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

          // Fire any launchers that reached 3
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

// ============================================================================
// Find maximum solvable tile burial depth
// ============================================================================

/**
 * Binary-search for the highest mismatchDepth (0–1, step 0.05) that still
 * produces a solvable tile arrangement.  Returns the depth value (e.g. 0.65).
 * Used by the Harder button so we never exceed a solvable configuration.
 */
export function findMaxSolvableDepth(config: StudioGameConfig): number {
  const {
    maxSelectableItems,
    waitingStandSlots,
    selectableItems,
    launchers,
    activeLauncherCount = 2,
  } = config;

  const allTiles: StudioTile[] = selectableItems.map((item) => ({
    id: tileId(),
    colorType: item.colorType,
    variant: item.variant,
    fruitType: COLOR_TYPE_TO_FRUIT[item.colorType] || 'apple',
  }));

  const sortedLauncherConfigs = [...launchers].sort((a, b) => a.order - b.order);

  const distributeToLayers = (sequence: StudioTile[]) => {
    const a: (StudioTile | null)[] = new Array(maxSelectableItems).fill(null);
    const b: (StudioTile | null)[] = new Array(maxSelectableItems).fill(null);
    const c: StudioTile[] = [];
    sequence.forEach((tile, idx) => {
      if (idx < maxSelectableItems) a[idx] = tile;
      else if (idx < 2 * maxSelectableItems) b[idx - maxSelectableItems] = tile;
      else c.push(tile);
    });
    return { a, b, c };
  };

  const RETRIES = 5;

  const isSolvableAt = (depth: number): boolean => {
    for (let attempt = 0; attempt < RETRIES; attempt++) {
      const seq = buildChallengingSequence(allTiles, sortedLauncherConfigs, activeLauncherCount, depth);
      const layers = distributeToLayers(seq);
      if (verifySolvability(layers.a, layers.b, layers.c, sortedLauncherConfigs, activeLauncherCount, waitingStandSlots)) {
        return true;
      }
    }
    return false;
  };

  // Search from high to low in 0.05 steps
  for (let depth = 1.0; depth > 0; depth -= 0.05) {
    const d = +depth.toFixed(2);
    if (isSolvableAt(d)) return d;
  }
  return 0;
}

// ============================================================================
// Seeded PRNG & deterministic helpers
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

let _seededTileCounter = 0;
function seededTileId(rng: () => number): string {
  return `st-${++_seededTileCounter}-${Math.floor(rng() * 1e9).toString(36)}`;
}

let _seededLauncherCounter = 0;
function seededLauncherId(rng: () => number): string {
  return `sl-${++_seededLauncherCounter}-${Math.floor(rng() * 1e9).toString(36)}`;
}

/** Build a solvable tile sequence using seeded RNG. */
export function buildSolvableSequenceSeeded(
  allTiles: StudioTile[],
  launcherConfigs: { colorType: number; order: number }[],
  activeLauncherCount: number,
  rng: () => number,
): StudioTile[] {
  const tilesByColor = new Map<number, StudioTile[]>();
  for (const tile of allTiles) {
    if (!tilesByColor.has(tile.colorType)) tilesByColor.set(tile.colorType, []);
    tilesByColor.get(tile.colorType)!.push(tile);
  }
  for (const arr of tilesByColor.values()) seededShuffle(arr, rng);

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
        if (round < tiles.length) roundTiles.push(tiles[round]);
      }
      seededShuffle(roundTiles, rng);
      sequence.push(...roundTiles);
    }
  }
  for (const arr of tilesByColor.values()) sequence.push(...arr);
  return sequence;
}

/** Build a challenging tile sequence with burial, using seeded RNG. */
export function buildChallengingSequenceSeeded(
  allTiles: StudioTile[],
  launcherConfigs: { colorType: number; order: number }[],
  activeLauncherCount: number,
  mismatchDepth: number,
  rng: () => number,
): StudioTile[] {
  const tilesByColor = new Map<number, StudioTile[]>();
  for (const tile of allTiles) {
    if (!tilesByColor.has(tile.colorType)) tilesByColor.set(tile.colorType, []);
    tilesByColor.get(tile.colorType)!.push(tile);
  }
  for (const arr of tilesByColor.values()) seededShuffle(arr, rng);

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
    if (i < j) [batches[i], batches[j]] = [batches[j], batches[i]];
  }

  const sequence = batches.flat();
  for (const arr of tilesByColor.values()) sequence.push(...arr);
  return sequence;
}

/** Distribute a tile sequence into three layers. */
function distributeToLayersSeeded(
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

/** Greedy solvability check for seeded arrangements. */
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
  const active: SimLauncher[] = sorted.slice(0, activeLauncherCount).map((l) => ({ colorType: l.colorType, collected: 0 }));
  const queue: SimLauncher[] = sorted.slice(activeLauncherCount).map((l) => ({ colorType: l.colorType, collected: 0 }));
  const stand: number[] = [];
  let fired = 0;
  const totalLaunchers = sorted.length;
  const maxIter = layerA.length * 4 + layerC.length + 200;
  for (let iter = 0; iter < maxIter; iter++) {
    if (fired >= totalLaunchers) return true;
    const available: { idx: number; tile: StudioTile }[] = [];
    for (let i = 0; i < simA.length; i++) { if (simA[i]) available.push({ idx: i, tile: simA[i]! }); }
    if (available.length === 0) break;
    let bestIdx = -1, bestScore = -Infinity;
    for (const { idx, tile } of available) {
      const launcher = active.find((l) => l.colorType === tile.colorType && l.collected < 3);
      const score = launcher ? (launcher.collected === 2 ? 200 : 100) : (stand.length < waitingStandSlots ? 0 : -1000);
      if (score > bestScore) { bestScore = score; bestIdx = idx; }
    }
    if (bestIdx === -1) break;
    if (bestScore <= -1000) {
      const match = available.find(({ tile }) => active.some((l) => l.colorType === tile.colorType && l.collected < 3));
      if (match) bestIdx = match.idx; else return false;
    }
    const tile = simA[bestIdx]!;
    simA[bestIdx] = null;
    if (simB[bestIdx]) { simA[bestIdx] = simB[bestIdx]; simB[bestIdx] = null; if (simC.length > 0) simB[bestIdx] = simC.shift()!; }
    const matchLauncher = active.find((l) => l.colorType === tile.colorType && l.collected < 3);
    if (matchLauncher) {
      matchLauncher.collected++;
      if (matchLauncher.collected >= 3) {
        fired++; active.splice(active.indexOf(matchLauncher), 1);
        if (queue.length > 0) active.push(queue.shift()!);
        let changed = true;
        while (changed) {
          changed = false;
          for (const l of active) {
            if (l.collected >= 3) continue;
            const indices: number[] = [];
            for (let i = 0; i < stand.length && indices.length < 3 - l.collected; i++) { if (stand[i] === l.colorType) indices.push(i); }
            if (indices.length > 0) { l.collected += indices.length; for (let j = indices.length - 1; j >= 0; j--) stand.splice(indices[j], 1); changed = true; }
          }
          const nowFiring = active.filter((l) => l.collected >= 3);
          for (const l of nowFiring) { fired++; active.splice(active.indexOf(l), 1); if (queue.length > 0) active.push(queue.shift()!); changed = true; }
        }
      }
    } else {
      if (stand.length >= waitingStandSlots) return false;
      stand.push(tile.colorType);
    }
  }
  return fired >= totalLaunchers;
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
      const sequence = buildChallengingSequenceSeeded(allTiles, sortedLauncherConfigs, activeLauncherCount, mismatchDepth, rng);
      const layers = distributeToLayersSeeded(sequence, maxSelectableItems);
      if (verifySolvabilitySeeded(layers.a, layers.b, layers.c, sortedLauncherConfigs, activeLauncherCount, waitingStandSlots)) {
        layerA = layers.a; layerB = layers.b; layerC = layers.c; found = true;
      }
    }
    if (!found) {
      for (let depth = mismatchDepth - 0.05; depth > 0 && !found; depth -= 0.05) {
        for (let attempt = 0; attempt < RETRIES_PER_DEPTH && !found; attempt++) {
          const sequence = buildChallengingSequenceSeeded(allTiles, sortedLauncherConfigs, activeLauncherCount, Math.max(0, +depth.toFixed(2)), rng);
          const layers = distributeToLayersSeeded(sequence, maxSelectableItems);
          if (verifySolvabilitySeeded(layers.a, layers.b, layers.c, sortedLauncherConfigs, activeLauncherCount, waitingStandSlots)) {
            layerA = layers.a; layerB = layers.b; layerC = layers.c; found = true;
          }
        }
      }
    }
  }

  if (layerA.every((t) => t === null)) {
    const MAX_RETRIES = 20;
    let solvable = false;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const sequence = buildSolvableSequenceSeeded(allTiles, sortedLauncherConfigs, activeLauncherCount, rng);
      const layers = distributeToLayersSeeded(sequence, maxSelectableItems);
      solvable = verifySolvabilitySeeded(layers.a, layers.b, layers.c, sortedLauncherConfigs, activeLauncherCount, waitingStandSlots);
      if (solvable) { layerA = layers.a; layerB = layers.b; layerC = layers.c; break; }
    }
    if (!solvable) {
      const tilesByColor = new Map<number, StudioTile[]>();
      for (const tile of allTiles) { if (!tilesByColor.has(tile.colorType)) tilesByColor.set(tile.colorType, []); tilesByColor.get(tile.colorType)!.push(tile); }
      const strictSequence: StudioTile[] = [];
      for (let i = 0; i < sortedLauncherConfigs.length; i += activeLauncherCount) {
        const batch = sortedLauncherConfigs.slice(i, i + activeLauncherCount);
        for (const cfg of batch) { const pool = tilesByColor.get(cfg.colorType) || []; strictSequence.push(...pool.splice(0, 3)); }
      }
      for (const arr of tilesByColor.values()) strictSequence.push(...arr);
      const layers = distributeToLayersSeeded(strictSequence, maxSelectableItems);
      layerA = layers.a; layerB = layers.b; layerC = layers.c;
    }
  }

  const allLaunchers: StudioLauncherState[] = sortedLauncherConfigs.map((l) => ({
    id: seededLauncherId(rng),
    colorType: l.colorType,
    fruitType: COLOR_TYPE_TO_FRUIT[l.colorType] || 'apple',
    pixelCount: l.pixelCount,
    group: l.group,
    collected: [],
  }));

  const freshPixelArt = pixelArt.map((cell) => ({ ...cell, filled: false }));

  return {
    layerA,
    layerB,
    layerC,
    waitingStand: [],
    activeLaunchers: allLaunchers.slice(0, activeLauncherCount),
    launcherQueue: allLaunchers.slice(activeLauncherCount),
    pixelArt: freshPixelArt,
    moveCount: 0,
    matchCount: 0,
    isWon: false,
    isLost: false,
    waitingStandSlots,
  };
}

// ============================================================================
// Initializer
// ============================================================================

export function initializeState(config: StudioGameConfig): StudioGameState {
  // If seed is present, use deterministic initialization
  if (config.seed !== undefined) {
    return initializeStateSeeded(config);
  }

  const {
    pixelArt,
    maxSelectableItems,
    waitingStandSlots,
    selectableItems,
    launchers,
    activeLauncherCount = 2,
    mismatchDepth = 0,
  } = config;

  // Create all tiles (stable set, rearranged by solvable algorithm)
  const allTiles: StudioTile[] = selectableItems.map((item) => ({
    id: tileId(),
    colorType: item.colorType,
    variant: item.variant,
    fruitType: COLOR_TYPE_TO_FRUIT[item.colorType] || 'apple',
  }));

  // Sort launcher configs by activation order
  const sortedLauncherConfigs = [...launchers].sort(
    (a, b) => a.order - b.order,
  );

  // ------------------------------------------------------------------
  // Build tile sequence — solvable vs challenging based on mismatchDepth
  // ------------------------------------------------------------------

  let layerA: (StudioTile | null)[] = new Array(maxSelectableItems).fill(null);
  let layerB: (StudioTile | null)[] = new Array(maxSelectableItems).fill(null);
  let layerC: StudioTile[] = [];

  const distributeToLayers = (sequence: StudioTile[]) => {
    const a: (StudioTile | null)[] = new Array(maxSelectableItems).fill(null);
    const b: (StudioTile | null)[] = new Array(maxSelectableItems).fill(null);
    const c: StudioTile[] = [];
    sequence.forEach((tile, idx) => {
      if (idx < maxSelectableItems) {
        a[idx] = tile;
      } else if (idx < 2 * maxSelectableItems) {
        b[idx - maxSelectableItems] = tile;
      } else {
        c.push(tile);
      }
    });
    return { a, b, c };
  };

  if (mismatchDepth > 0) {
    // Challenging mode: bury matching tiles based on mismatchDepth.
    // Try requested depth first, then reduce until solvable.
    const RETRIES_PER_DEPTH = 5;
    let found = false;

    // Try the requested depth with multiple shuffles
    for (let attempt = 0; attempt < RETRIES_PER_DEPTH && !found; attempt++) {
      const sequence = buildChallengingSequence(
        allTiles,
        sortedLauncherConfigs,
        activeLauncherCount,
        mismatchDepth,
      );
      const layers = distributeToLayers(sequence);
      if (verifySolvability(layers.a, layers.b, layers.c, sortedLauncherConfigs, activeLauncherCount, waitingStandSlots)) {
        layerA = layers.a;
        layerB = layers.b;
        layerC = layers.c;
        found = true;
      }
    }

    // If not solvable at requested depth, step down in 0.05 increments
    if (!found) {
      for (let depth = mismatchDepth - 0.05; depth > 0 && !found; depth -= 0.05) {
        for (let attempt = 0; attempt < RETRIES_PER_DEPTH && !found; attempt++) {
          const sequence = buildChallengingSequence(
            allTiles,
            sortedLauncherConfigs,
            activeLauncherCount,
            Math.max(0, +depth.toFixed(2)),
          );
          const layers = distributeToLayers(sequence);
          if (verifySolvability(layers.a, layers.b, layers.c, sortedLauncherConfigs, activeLauncherCount, waitingStandSlots)) {
            layerA = layers.a;
            layerB = layers.b;
            layerC = layers.c;
            found = true;
          }
        }
      }
    }

    // If still not found, fall through to solvable mode below
    if (found) {
      // Skip the solvable block
    }
  }

  // Solvable mode (depth=0 OR challenging fallback)
  if (layerA.every((t) => t === null)) {
    // Solvable mode: current behaviour with retry + fallback
    const MAX_RETRIES = 20;
    let solvable = false;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const sequence = buildSolvableSequence(
        allTiles,
        sortedLauncherConfigs,
        activeLauncherCount,
      );
      const layers = distributeToLayers(sequence);

      solvable = verifySolvability(
        layers.a,
        layers.b,
        layers.c,
        sortedLauncherConfigs,
        activeLauncherCount,
        waitingStandSlots,
      );

      if (solvable) {
        layerA = layers.a;
        layerB = layers.b;
        layerC = layers.c;
        break;
      }
    }

    // Fallback: strict batch order (no within-round shuffle)
    if (!solvable) {
      const tilesByColor = new Map<number, StudioTile[]>();
      for (const tile of allTiles) {
        if (!tilesByColor.has(tile.colorType)) {
          tilesByColor.set(tile.colorType, []);
        }
        tilesByColor.get(tile.colorType)!.push(tile);
      }

      const strictSequence: StudioTile[] = [];
      for (
        let i = 0;
        i < sortedLauncherConfigs.length;
        i += activeLauncherCount
      ) {
        const batch = sortedLauncherConfigs.slice(i, i + activeLauncherCount);
        for (const cfg of batch) {
          const pool = tilesByColor.get(cfg.colorType) || [];
          strictSequence.push(...pool.splice(0, 3));
        }
      }
      for (const arr of tilesByColor.values()) {
        strictSequence.push(...arr);
      }

      const layers = distributeToLayers(strictSequence);
      layerA = layers.a;
      layerB = layers.b;
      layerC = layers.c;
    }
  }

  // Create launcher state objects
  const allLaunchers: StudioLauncherState[] = sortedLauncherConfigs.map(
    (l) => ({
      id: launcherId(),
      colorType: l.colorType,
      fruitType: COLOR_TYPE_TO_FRUIT[l.colorType] || 'apple',
      pixelCount: l.pixelCount,
      group: l.group,
      collected: [],
    }),
  );

  const activeLaunchers = allLaunchers.slice(0, activeLauncherCount);
  const launcherQueue = allLaunchers.slice(activeLauncherCount);

  // Reset pixel art filled=false
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
// Pixel filling on fire
// ============================================================================

function cellColorType(cell: PixelCell): number {
  // Use the original colorType when available (supports types beyond 0-8),
  // fall back to deriving from fruitType for backward compatibility.
  return cell.colorType ?? FRUIT_TO_COLOR_TYPE[cell.fruitType];
}

export function fireLauncher(
  launcher: StudioLauncherState,
  pixelArt: PixelCell[],
): PixelCell[] {
  let remaining = launcher.pixelCount;
  if (remaining <= 0) return pixelArt;

  const result = [...pixelArt];

  // Pass 1: prefer pixels matching both colorType AND groupId
  for (let i = 0; i < result.length && remaining > 0; i++) {
    const cell = result[i];
    if (
      !cell.filled &&
      cellColorType(cell) === launcher.colorType &&
      cell.groupId === launcher.group
    ) {
      result[i] = { ...cell, filled: true };
      remaining--;
    }
  }

  // Pass 2: fill any matching colorType pixels (different group)
  for (let i = 0; i < result.length && remaining > 0; i++) {
    const cell = result[i];
    if (
      !cell.filled &&
      cellColorType(cell) === launcher.colorType
    ) {
      result[i] = { ...cell, filled: true };
      remaining--;
    }
  }

  return result;
}

// ============================================================================
// Find matching launcher for a tile
// ============================================================================

export function findMatchingLauncher(
  colorType: number,
  activeLaunchers: StudioLauncherState[],
): StudioLauncherState | null {
  return activeLaunchers.find(
    (l) => l.colorType === colorType && l.collected.length < 3,
  ) || null;
}

// ============================================================================
// After fire: shift launchers, auto-fill from waiting stand, cascade
// ============================================================================

export function postFireCascade(
  activeLaunchers: StudioLauncherState[],
  launcherQueue: StudioLauncherState[],
  waitingStand: StudioTile[],
  pixelArt: PixelCell[],
  firedLauncherId: string,
  activeLauncherCount: number,
): {
  activeLaunchers: StudioLauncherState[];
  launcherQueue: StudioLauncherState[];
  waitingStand: StudioTile[];
  pixelArt: PixelCell[];
  extraMatches: number;
} {
  let active = activeLaunchers.filter((l) => l.id !== firedLauncherId);
  let queue = [...launcherQueue];
  let stand = [...waitingStand];
  let art = pixelArt;
  let extraMatches = 0;

  // Pull from queue to fill active slots
  while (active.length < activeLauncherCount && queue.length > 0) {
    active.push({ ...queue.shift()!, collected: [] });
  }

  // Auto-fill from waiting stand → cascade
  let changed = true;
  while (changed) {
    changed = false;

    for (const launcher of active) {
      if (launcher.collected.length >= 3) continue;

      const canTake = 3 - launcher.collected.length;
      const matchingIndices: number[] = [];

      for (let i = 0; i < stand.length && matchingIndices.length < canTake; i++) {
        if (stand[i].colorType === launcher.colorType) {
          matchingIndices.push(i);
        }
      }

      if (matchingIndices.length > 0) {
        const tilesToMove = matchingIndices.map((i) => stand[i]);
        const idsToRemove = new Set(tilesToMove.map((t) => t.id));
        stand = stand.filter((t) => !idsToRemove.has(t.id));
        launcher.collected = [...launcher.collected, ...tilesToMove];
        changed = true;
      }
    }

    const toFire = active.filter((l) => l.collected.length >= 3);
    for (const launcher of toFire) {
      art = fireLauncher(launcher, art);
      extraMatches++;
    }

    if (toFire.length > 0) {
      const firedIds = new Set(toFire.map((l) => l.id));
      active = active.filter((l) => !firedIds.has(l.id));

      while (active.length < activeLauncherCount && queue.length > 0) {
        active.push({ ...queue.shift()!, collected: [] });
      }
      changed = true;
    }
  }

  return { activeLaunchers: active, launcherQueue: queue, waitingStand: stand, pixelArt: art, extraMatches };
}

// ============================================================================
// Core game logic — pickTile
// ============================================================================

export function pickTileLogic(state: StudioGameState, slotIndex: number): StudioGameState {
  if (state.isWon || state.isLost) return state;

  const tile = state.layerA[slotIndex];
  if (!tile) return state;

  // Clone layers
  const newLayerA = [...state.layerA];
  const newLayerB = [...state.layerB];
  const newLayerC = [...state.layerC];

  // 1. Remove tile from A[slot]
  newLayerA[slotIndex] = null;

  // 2. B→A, C→B promotion
  if (newLayerB[slotIndex]) {
    newLayerA[slotIndex] = newLayerB[slotIndex];
    newLayerB[slotIndex] = null;

    if (newLayerC.length > 0) {
      newLayerB[slotIndex] = newLayerC.shift()!;
    }
  }

  // 3. Check if any active launcher needs this tile
  const matchingLauncher = findMatchingLauncher(tile.colorType, state.activeLaunchers);

  let newWaitingStand = [...state.waitingStand];
  let activeLaunchers = state.activeLaunchers.map((l) => ({
    ...l,
    collected: [...l.collected],
  }));
  let launcherQueue = [...state.launcherQueue];
  let newPixelArt = [...state.pixelArt];
  let matchCount = 0;

  const activeLauncherCount = Math.min(
    2,
    state.activeLaunchers.length + state.launcherQueue.length,
  );

  if (matchingLauncher) {
    // Tile goes directly to the matching launcher
    const launcher = activeLaunchers.find((l) => l.id === matchingLauncher.id)!;
    launcher.collected.push(tile);

    // If launcher now has 3 → fire, shift, cascade
    if (launcher.collected.length >= 3) {
      newPixelArt = fireLauncher(launcher, newPixelArt);
      matchCount++;

      const cascade = postFireCascade(
        activeLaunchers,
        launcherQueue,
        newWaitingStand,
        newPixelArt,
        launcher.id,
        activeLauncherCount,
      );

      activeLaunchers = cascade.activeLaunchers;
      launcherQueue = cascade.launcherQueue;
      newWaitingStand = cascade.waitingStand;
      newPixelArt = cascade.pixelArt;
      matchCount += cascade.extraMatches;
    }
  } else {
    // No matching launcher → tile goes to waiting stand
    if (newWaitingStand.length >= state.waitingStandSlots) {
      return {
        ...state,
        layerA: newLayerA,
        layerB: newLayerB,
        layerC: newLayerC,
        moveCount: state.moveCount + 1,
        isLost: true,
      };
    }
    newWaitingStand.push(tile);
  }

  // Win check
  const isWon = newPixelArt.every((cell) => cell.filled);

  // Lose check: stand full + no active launcher matches any stand tile
  let isLost = false;
  if (!isWon && newWaitingStand.length >= state.waitingStandSlots) {
    const standColorTypes = new Set(newWaitingStand.map((t) => t.colorType));
    const hasMatch = activeLaunchers.some(
      (l) => l.collected.length < 3 && standColorTypes.has(l.colorType),
    );
    if (!hasMatch) {
      isLost = true;
    }
  }

  // Check if no tiles remain and pixels aren't all filled
  if (!isWon && !isLost) {
    const hasAnyTilesLeft =
      newLayerA.some((t) => t !== null) ||
      newLayerB.some((t) => t !== null) ||
      newLayerC.length > 0;

    if (
      !hasAnyTilesLeft &&
      newWaitingStand.length === 0 &&
      activeLaunchers.every((l) => l.collected.length === 0)
    ) {
      const allFilled = newPixelArt.every((cell) => cell.filled);
      if (!allFilled) isLost = true;
    }
  }

  return {
    ...state,
    layerA: newLayerA,
    layerB: newLayerB,
    layerC: newLayerC,
    waitingStand: newWaitingStand,
    activeLaunchers,
    launcherQueue,
    pixelArt: newPixelArt,
    moveCount: state.moveCount + 1,
    matchCount: state.matchCount + matchCount,
    isWon,
    isLost,
  };
}

// ============================================================================
// Hook
// ============================================================================

export function useStudioGame(config: StudioGameConfig | null) {
  const [state, setState] = useState<StudioGameState | null>(null);

  const reset = useCallback(() => {
    if (!config) return;
    setState(initializeState(config));
  }, [config]);

  const configKey = useMemo(() => {
    if (!config) return '';
    return `${config.pixelArt.length}-${config.selectableItems.length}-${config.maxSelectableItems}-${config.launchers.length}`;
  }, [config]);

  const pickTile = useCallback(
    (slotIndex: number) => {
      setState((prev) => {
        if (!prev) return prev;
        return pickTileLogic(prev, slotIndex);
      });
    },
    [],
  );

  const progress = useMemo(() => {
    if (!state) return { filled: 0, total: 0, percent: 0 };
    const filled = state.pixelArt.filter((c) => c.filled).length;
    const total = state.pixelArt.length;
    return { filled, total, percent: total > 0 ? Math.round((filled / total) * 100) : 0 };
  }, [state]);

  return { state, reset, pickTile, progress, configKey };
}
