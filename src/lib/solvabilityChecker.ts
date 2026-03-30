/**
 * Solvability Checker Engine
 *
 * Parses level JSONs and determines whether they are completable using
 * multiple strategies: greedy, Monte Carlo (multi-seed), and DFS with pruning.
 */

import {
  StudioGameConfig,
  StudioGameState,
  initializeStateSeeded,
  pickTileLogic,
  mulberry32,
} from './studioGameLogic';
import { StudioExportLevel, COLOR_TYPE_TO_FRUIT } from './juicyBlastExport';
import { PixelCell } from '@/types/fruitMatch';

// ============================================================================
// Types
// ============================================================================

export interface SolverResult {
  solved: boolean;
  moves: number;
  peakStandUsage: number;
  moveSequence: number[];
  deadEndReason?: 'stand_overflow' | 'no_tiles' | 'max_iterations';
}

export interface MonteCarloResult {
  runs: number;
  wins: number;
  winRate: number;
  avgMoves: number;
  peakStandUsage: number;
  confidenceInterval: [number, number];
}

export interface DFSResult {
  solvable: boolean;
  solutionCount: number;
  deadEndCount: number;
  exploredStates: number;
  minMoves: number;
  maxMoves: number;
  verdict: 'always' | 'sometimes' | 'never';
  timedOut: boolean;
}

export interface LevelReport {
  levelId: string;
  totalItems: number;
  totalLaunchers: number;
  uniqueColors: number;
  maxSelectableItems: number;
  blockingOffset: number;
  waitingStandSlots: number;
  activeLauncherCount: number;
  greedy: SolverResult;
  monteCarlo: MonteCarloResult;
  dfs?: DFSResult;
  verdict: 'solvable' | 'risky' | 'stuck';
}

export interface BatchReport {
  levels: LevelReport[];
  summary: {
    total: number;
    solvable: number;
    risky: number;
    stuck: number;
    avgWinRate: number;
  };
}

export interface AnalyzeOptions {
  runMonteCarlo?: boolean;
  monteCarloRuns?: number;
  runDFS?: boolean;
  dfsStateLimit?: number;
  onProgress?: (done: number, total: number) => void;
}

// ============================================================================
// StudioExportLevel → StudioGameConfig conversion
// ============================================================================

export function studioExportToGameConfig(level: StudioExportLevel): StudioGameConfig {
  const height = level.Artwork.Height;

  // Build group→colorType from launchers (reconcile pixel colorTypes)
  const launcherGroupCT = new Map<number, number>();
  for (const l of level.Launchers) {
    if (!launcherGroupCT.has(l.Group)) launcherGroupCT.set(l.Group, l.ColorType);
  }

  const pixelArt: PixelCell[] = level.Artwork.PixelData.map((pixel) => {
    const flippedRow = (height - 1) - pixel.Position.y;
    const effectiveCT = launcherGroupCT.get(pixel.Group) ?? pixel.ColorType;
    return {
      row: flippedRow,
      col: pixel.Position.x,
      fruitType: COLOR_TYPE_TO_FRUIT[effectiveCT] || 'apple',
      filled: false,
      groupId: pixel.Group,
      colorHex: pixel.ColorHex,
      colorType: effectiveCT,
    };
  });

  const layerNames: Record<number, 'A' | 'B' | 'C'> = { 0: 'A', 1: 'B', 2: 'C' };

  return {
    pixelArt,
    pixelArtWidth: level.Artwork.Width,
    pixelArtHeight: height,
    maxSelectableItems: level.MaxSelectableItems,
    waitingStandSlots: level.WaitingStandSlots ?? 5,
    selectableItems: (level.SelectableItems || []).map((item, idx) => ({
      colorType: item.ColorType,
      variant: item.Variant ?? 0,
      order: typeof item.Order === 'number' ? item.Order : idx,
      layer: layerNames[item.Layer] || ('A' as const),
    })),
    launchers: (level.Launchers || [])
      .sort((a, b) => a.Order - b.Order)
      .map((l) => ({
        colorType: l.ColorType,
        pixelCount: l.Value,
        group: l.Group,
        order: l.Order,
      })),
    activeLauncherCount: level.ActiveLauncherCount ?? 2,
    blockingOffset: level.BlockingOffset ?? 0,
  };
}

// ============================================================================
// Scoring helper (shared by greedy and semi-random)
// ============================================================================

function scoreAvailableTiles(state: StudioGameState): { idx: number; score: number }[] {
  const available: { idx: number; score: number }[] = [];

  for (let i = 0; i < state.layerA.length; i++) {
    const tile = state.layerA[i];
    if (!tile) continue;

    const launcher = state.activeLaunchers.find((l) => {
      if (l.colorType !== tile.colorType || l.collected.length >= 3) return false;
      if (l.collected.length > 0) return l.collected[0].variant === tile.variant;
      return true;
    });

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

  return available;
}

// ============================================================================
// Greedy solver
// ============================================================================

export function solveGreedy(config: StudioGameConfig, seed: number = 42): SolverResult {
  const effectiveConfig = { ...config, seed };
  let state: StudioGameState;
  try {
    state = initializeStateSeeded(effectiveConfig);
  } catch {
    return { solved: false, moves: 0, peakStandUsage: 0, moveSequence: [], deadEndReason: 'no_tiles' };
  }

  const moveSequence: number[] = [];
  let peakStand = 0;
  const maxIter = (state.layerA.length + state.layerC.length) * 3 + 200;

  for (let i = 0; i < maxIter && !state.isWon && !state.isLost; i++) {
    const available = scoreAvailableTiles(state);
    if (available.length === 0) break;

    available.sort((a, b) => b.score - a.score);

    // If all moves overflow, try to find any matching tile
    let bestIdx = available[0].idx;
    if (available[0].score <= -1000) {
      const match = available.find((a) => a.score > -1000);
      if (match) bestIdx = match.idx;
    }

    moveSequence.push(bestIdx);
    state = pickTileLogic(state, bestIdx);
    peakStand = Math.max(peakStand, state.waitingStand.length);
  }

  return {
    solved: state.isWon,
    moves: state.moveCount,
    peakStandUsage: peakStand,
    moveSequence,
    deadEndReason: state.isLost
      ? 'stand_overflow'
      : !state.isWon
        ? 'no_tiles'
        : undefined,
  };
}

// ============================================================================
// Monte Carlo solver (multi-seed, blended strategies)
// ============================================================================

type Strategy = 'greedy' | 'semi-random' | 'random';

function pickTileByStrategy(
  state: StudioGameState,
  strategy: Strategy,
  rng: () => number,
): number | null {
  const available = scoreAvailableTiles(state);
  if (available.length === 0) return null;

  if (strategy === 'random') {
    return available[Math.floor(rng() * available.length)].idx;
  }

  available.sort((a, b) => b.score - a.score);

  if (strategy === 'greedy') {
    return available[0].idx;
  }

  // semi-random: 60% best, 40% random safe
  if (rng() < 0.6) return available[0].idx;
  const safe = available.filter((a) => a.score > -1000);
  if (safe.length === 0) return available[0].idx;
  return safe[Math.floor(rng() * safe.length)].idx;
}

function runSingleMC(
  config: StudioGameConfig,
  seed: number,
  rng: () => number,
): { won: boolean; moves: number; peakStand: number } {
  const roll = rng();
  const strategy: Strategy = roll < 0.4 ? 'greedy' : roll < 0.8 ? 'semi-random' : 'random';

  let state: StudioGameState;
  try {
    state = initializeStateSeeded({ ...config, seed });
  } catch {
    return { won: false, moves: 0, peakStand: 0 };
  }

  let peakStand = 0;
  const maxMoves = (state.layerA.length + state.layerC.length) * 3 + 100;

  for (let m = 0; m < maxMoves && !state.isWon && !state.isLost; m++) {
    const idx = pickTileByStrategy(state, strategy, rng);
    if (idx === null) break;
    state = pickTileLogic(state, idx);
    peakStand = Math.max(peakStand, state.waitingStand.length);
  }

  return { won: state.isWon, moves: state.moveCount, peakStand };
}

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

export function solveMonteCarlo(
  config: StudioGameConfig,
  runs: number = 200,
): MonteCarloResult {
  const masterRng = mulberry32(0xCAFEBABE);
  let wins = 0;
  let totalWinMoves = 0;
  let maxPeakStand = 0;

  for (let i = 0; i < runs; i++) {
    const seed = Math.floor(masterRng() * 2147483647);
    const runRng = mulberry32(seed ^ (i * 31337));
    const result = runSingleMC(config, seed, runRng);
    if (result.won) {
      wins++;
      totalWinMoves += result.moves;
    }
    maxPeakStand = Math.max(maxPeakStand, result.peakStand);
  }

  return {
    runs,
    wins,
    winRate: wins / runs,
    avgMoves: wins > 0 ? totalWinMoves / wins : 0,
    peakStandUsage: maxPeakStand,
    confidenceInterval: wilsonCI(wins, runs),
  };
}

// ============================================================================
// DFS solver with pruning
// ============================================================================

export function solveDFS(
  config: StudioGameConfig,
  stateLimit: number = 10000,
  seed: number = 42,
): DFSResult {
  let state: StudioGameState;
  try {
    state = initializeStateSeeded({ ...config, seed });
  } catch {
    return {
      solvable: false, solutionCount: 0, deadEndCount: 1,
      exploredStates: 0, minMoves: 0, maxMoves: 0, verdict: 'never', timedOut: false,
    };
  }

  const visited = new Set<string>();
  let solutions = 0;
  let deadEnds = 0;
  let explored = 0;
  let minMoves = Infinity;
  let maxMoves = 0;
  let timedOut = false;

  function stateHash(s: StudioGameState): string {
    const standKey = s.waitingStand
      .map((t) => `${t.colorType}:${t.variant}`)
      .sort()
      .join(',');
    const layerKey = s.layerA.map((t) => t?.id ?? '_').join('');
    const launcherKey = s.activeLaunchers
      .map((l) => `${l.colorType}:${l.collected.length}`)
      .join(',');
    return `${standKey}|${layerKey}|${launcherKey}|${s.matchCount}`;
  }

  function dfs(s: StudioGameState, depth: number): void {
    if (explored >= stateLimit) { timedOut = true; return; }
    if (s.isWon) {
      solutions++;
      minMoves = Math.min(minMoves, depth);
      maxMoves = Math.max(maxMoves, depth);
      return;
    }
    if (s.isLost) { deadEnds++; return; }

    const hash = stateHash(s);
    if (visited.has(hash)) return;
    visited.add(hash);
    explored++;

    // Get unique moves — deduplicate by (colorType, variant) for symmetry
    const seen = new Set<string>();
    const moves: number[] = [];
    for (let i = 0; i < s.layerA.length; i++) {
      const tile = s.layerA[i];
      if (!tile) continue;
      const key = `${tile.colorType}:${tile.variant}`;
      if (seen.has(key)) continue;
      seen.add(key);
      moves.push(i);
    }

    if (moves.length === 0) { deadEnds++; return; }

    // Explore matching-launcher moves first (better pruning)
    moves.sort((a, b) => {
      const tA = s.layerA[a]!;
      const tB = s.layerA[b]!;
      const matchA = s.activeLaunchers.some(
        (l) => l.colorType === tA.colorType && l.collected.length < 3,
      ) ? 1 : 0;
      const matchB = s.activeLaunchers.some(
        (l) => l.colorType === tB.colorType && l.collected.length < 3,
      ) ? 1 : 0;
      return matchB - matchA;
    });

    for (const slotIdx of moves) {
      if (explored >= stateLimit) { timedOut = true; return; }
      dfs(pickTileLogic(s, slotIdx), depth + 1);
    }
  }

  dfs(state, 0);

  const solvable = solutions > 0;
  const verdict: DFSResult['verdict'] =
    solvable && deadEnds === 0 && !timedOut
      ? 'always'
      : solvable
        ? 'sometimes'
        : 'never';

  return {
    solvable,
    solutionCount: solutions,
    deadEndCount: deadEnds,
    exploredStates: explored,
    minMoves: solvable ? minMoves : 0,
    maxMoves,
    verdict,
    timedOut,
  };
}

// ============================================================================
// Analyze a single level
// ============================================================================

export function analyzeSingleLevel(
  level: StudioExportLevel,
  options: AnalyzeOptions = {},
): LevelReport {
  const config = studioExportToGameConfig(level);
  const {
    runMonteCarlo = true,
    monteCarloRuns = 200,
    runDFS = false,
    dfsStateLimit = 10000,
  } = options;

  const greedy = solveGreedy(config);

  const monteCarlo = runMonteCarlo
    ? solveMonteCarlo(config, monteCarloRuns)
    : { runs: 0, wins: 0, winRate: greedy.solved ? 1 : 0, avgMoves: 0, peakStandUsage: 0, confidenceInterval: [0, 0] as [number, number] };

  const dfs = runDFS ? solveDFS(config, dfsStateLimit) : undefined;

  // Determine verdict
  const bestWinRate = monteCarlo.winRate;
  let verdict: LevelReport['verdict'];
  if (bestWinRate >= 0.3 || greedy.solved || (dfs && dfs.solvable)) {
    verdict = 'solvable';
  } else if (bestWinRate > 0) {
    verdict = 'risky';
  } else {
    verdict = 'stuck';
  }

  const uniqueColors = new Set(config.selectableItems.map((i) => i.colorType)).size;

  return {
    levelId: level.LevelId || 'unknown',
    totalItems: config.selectableItems.length,
    totalLaunchers: config.launchers.length,
    uniqueColors,
    maxSelectableItems: config.maxSelectableItems,
    blockingOffset: config.blockingOffset ?? 0,
    waitingStandSlots: config.waitingStandSlots,
    activeLauncherCount: config.activeLauncherCount ?? 2,
    greedy,
    monteCarlo,
    dfs,
    verdict,
  };
}

// ============================================================================
// Batch analysis
// ============================================================================

export async function analyzeBatch(
  levels: StudioExportLevel[],
  options: AnalyzeOptions = {},
): Promise<BatchReport> {
  const results: LevelReport[] = [];
  const total = levels.length;

  for (let i = 0; i < total; i++) {
    results.push(analyzeSingleLevel(levels[i], options));
    options.onProgress?.(i + 1, total);
    // Yield to event loop every 5 levels to keep UI responsive
    if (i % 5 === 4) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  const solvable = results.filter((r) => r.verdict === 'solvable').length;
  const risky = results.filter((r) => r.verdict === 'risky').length;
  const stuck = results.filter((r) => r.verdict === 'stuck').length;
  const avgWinRate =
    results.length > 0
      ? results.reduce((s, r) => s + r.monteCarlo.winRate, 0) / results.length
      : 0;

  return {
    levels: results,
    summary: { total, solvable, risky, stuck, avgWinRate },
  };
}
