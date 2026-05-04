import { DifficultyTier } from '@/types/fruitMatch';
import {
  StudioGameConfig,
  StudioGameState,
  StudioTile,
  calculateStudioDifficulty,
  findMatchingLauncher,
  initializeStateSeeded,
  mulberry32,
  pickTileLogic,
  resolveBlockingOffset,
} from '@/lib/studioGameLogic';
import {
  AnalyzeOptions,
  analyzeMoves,
  configToSolverInput,
  solveDFS,
  solveGreedy,
} from '@/lib/solvabilityChecker';

export type BotProfileId = 'novice' | 'average' | 'expert' | 'greedy' | 'stress';

export type UserPlaythroughAction =
  | 'launcher'
  | 'queue'
  | 'autoFill'
  | 'complete'
  | 'fail';

export interface UserPlaythroughStep {
  move: number;
  pickedPosition: number;
  colorType: number;
  variant: number;
  action: UserPlaythroughAction;
  waitingStandSize: number;
  completedLaunchers: number;
}

export interface UserPlaythroughReport {
  profile: BotProfileId;
  seed: number;
  won: boolean;
  moves: number;
  peakStandUsage: number;
  nearLoss: boolean;
  failureReason?: string;
  steps: UserPlaythroughStep[];
}

export interface JuicyDifficultyReport {
  verdict: 'solvable' | 'risky' | 'stuck';
  legacyScore: number | null;
  solverScore: number;
  tier: DifficultyTier;
  parMoves: number | null;
  winRates: Record<BotProfileId, number>;
  avgMoves: number;
  peakStandUsage: number;
  nearLossRate: number;
  queueMoveRate: number;
  directMoveRate: number;
  solutionPath?: number[];
}

const BOT_PROFILES: BotProfileId[] = ['novice', 'average', 'expert', 'greedy', 'stress'];

const PROFILE_SEED_SALT: Record<BotProfileId, number> = {
  novice: 0x11f00d,
  average: 0x22f00d,
  expert: 0x33f00d,
  greedy: 0x44f00d,
  stress: 0x55f00d,
};

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function scoreToTier(score: number): DifficultyTier {
  if (score < 20) return 'trivial';
  if (score < 35) return 'easy';
  if (score < 50) return 'medium';
  if (score < 65) return 'hard';
  if (score < 80) return 'expert';
  return 'nightmare';
}

function configSeed(config: StudioGameConfig, seed?: number): number {
  return seed ?? config.seed ?? 42;
}

export function materializeStudioConfig(config: StudioGameConfig, seed?: number): StudioGameConfig {
  const deterministicConfig = {
    ...config,
    seed: configSeed(config, seed),
  };
  const state = initializeStateSeeded(deterministicConfig);
  const selectableItems: StudioGameConfig['selectableItems'] = [];
  let order = 0;

  for (const tile of state.layerA) {
    if (!tile) continue;
    selectableItems.push({
      colorType: tile.colorType,
      variant: tile.variant,
      layer: 'A',
      order: order++,
    });
  }
  for (const tile of state.layerB) {
    if (!tile) continue;
    selectableItems.push({
      colorType: tile.colorType,
      variant: tile.variant,
      layer: 'B',
      order: order++,
    });
  }
  for (const tile of state.layerC) {
    selectableItems.push({
      colorType: tile.colorType,
      variant: tile.variant,
      layer: 'C',
      order: order++,
    });
  }

  return {
    ...deterministicConfig,
    selectableItems,
  };
}

function calculateLegacyScore(config: StudioGameConfig): number | null {
  if (config.pixelArt.length === 0 || config.launchers.length === 0) return null;
  const uniqueColors = new Set([
    ...config.pixelArt.map((p) => p.colorType).filter((v): v is number => typeof v === 'number'),
    ...config.selectableItems.map((i) => i.colorType),
  ]).size;
  const uniqueVariants = new Set(config.selectableItems.map((i) => `${i.colorType}:${i.variant}`)).size;
  return calculateStudioDifficulty({
    totalPixels: config.pixelArt.length,
    uniqueColors,
    groupCount: new Set(config.pixelArt.map((p) => p.groupId ?? 1)).size,
    launcherCount: config.launchers.length,
    maxSelectableItems: config.maxSelectableItems,
    totalTiles: config.selectableItems.length,
    blockingOffset: resolveBlockingOffset(config),
    uniqueVariants,
    colorVariantDensity: 0,
  }).score;
}

function candidateMatchesActive(tile: StudioTile, state: StudioGameState): boolean {
  return findMatchingLauncher(tile.colorType, state.activeLaunchers, tile.variant) !== null;
}

function candidateScore(state: StudioGameState, slotIndex: number): number {
  const tile = state.layerA[slotIndex];
  if (!tile) return -Infinity;

  const matchingLauncher = findMatchingLauncher(tile.colorType, state.activeLaunchers, tile.variant);
  let score = 0;

  if (matchingLauncher) {
    score += 100 + matchingLauncher.collected.length * 35;
    if (matchingLauncher.collected.length >= 2) score += 120;
  } else {
    score += state.waitingStand.length < state.waitingStandSlots ? 8 : -1000;
    if (state.waitingStand.length >= state.waitingStandSlots - 1) score -= 120;
  }

  const behind = state.layerB[slotIndex];
  if (behind && candidateMatchesActive(behind, state)) {
    score += 45;
  }

  const standSameVariant = state.waitingStand.filter(
    (queued) => queued.colorType === tile.colorType && queued.variant === tile.variant,
  ).length;
  score += standSameVariant * 10;

  return score;
}

function chooseFromTop(
  candidates: { idx: number; score: number }[],
  rng: () => number,
  topSize: number,
): number {
  const pool = candidates.slice(0, Math.max(1, Math.min(topSize, candidates.length)));
  return pool[Math.floor(rng() * pool.length)].idx;
}

function chooseBotPick(
  state: StudioGameState,
  profile: BotProfileId,
  rng: () => number,
): number | null {
  const candidates: { idx: number; score: number }[] = [];
  for (let i = 0; i < state.layerA.length; i++) {
    if (!state.layerA[i]) continue;
    candidates.push({ idx: i, score: candidateScore(state, i) });
  }
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => b.score - a.score || a.idx - b.idx);

  if (profile === 'greedy' || profile === 'expert') return candidates[0].idx;

  if (profile === 'average') {
    if (rng() < 0.7) return candidates[0].idx;
    return chooseFromTop(candidates, rng, 3);
  }

  if (profile === 'novice') {
    if (rng() < 0.45) return chooseFromTop(candidates, rng, 2);
    const safe = candidates.filter((c) => c.score > -1000);
    const pool = safe.length > 0 ? safe : candidates;
    return pool[Math.floor(rng() * pool.length)].idx;
  }

  const pressureCandidates = [...candidates].sort((a, b) => a.score - b.score || a.idx - b.idx);
  const nonOverflowing = pressureCandidates.filter((c) => c.score > -1000);
  return (nonOverflowing[0] ?? pressureCandidates[0]).idx;
}

function classifyStep(
  previous: StudioGameState,
  next: StudioGameState,
  slotIndex: number,
): UserPlaythroughAction {
  if (next.isLost && !next.isWon) return 'fail';
  if (next.matchCount > previous.matchCount) return 'complete';

  const tile = previous.layerA[slotIndex];
  if (!tile) return 'fail';
  const matchingLauncher = findMatchingLauncher(tile.colorType, previous.activeLaunchers, tile.variant);
  return matchingLauncher ? 'launcher' : 'queue';
}

function failureReason(state: StudioGameState, moveLimit?: number): string {
  if (moveLimit && state.moveCount >= moveLimit && !state.isWon) return 'move_limit';
  if (state.waitingStand.length >= state.waitingStandSlots) return 'stand_overflow';
  if (!state.layerA.some(Boolean) && !state.isWon) return 'no_tiles';
  return 'no_safe_move';
}

export function simulateUserPlaythrough(
  config: StudioGameConfig,
  profile: BotProfileId,
  seed: number,
): UserPlaythroughReport {
  const simConfig = {
    ...config,
    seed: configSeed(config, seed),
  };
  let state = initializeStateSeeded(simConfig);
  const rng = mulberry32(seed ^ PROFILE_SEED_SALT[profile]);
  const steps: UserPlaythroughStep[] = [];
  let peakStandUsage = state.waitingStand.length;
  let failure: string | undefined;
  const maxMoves = config.selectableItems.length + config.launchers.length * 3 + 50;

  for (let guard = 0; guard < maxMoves; guard++) {
    if (state.isWon || state.isLost) break;
    if (config.moveLimit && state.moveCount >= config.moveLimit) {
      failure = 'move_limit';
      break;
    }

    const pick = chooseBotPick(state, profile, rng);
    if (pick === null) {
      failure = 'no_tiles';
      break;
    }

    const tile = state.layerA[pick];
    if (!tile) {
      failure = 'no_tiles';
      break;
    }

    const previous = state;
    const next = pickTileLogic(state, pick);
    const limitedOut = !!config.moveLimit && next.moveCount >= config.moveLimit && !next.isWon;
    const action = limitedOut ? 'fail' : classifyStep(previous, next, pick);

    peakStandUsage = Math.max(peakStandUsage, next.waitingStand.length);
    steps.push({
      move: next.moveCount,
      pickedPosition: pick,
      colorType: tile.colorType,
      variant: tile.variant,
      action,
      waitingStandSize: next.waitingStand.length,
      completedLaunchers: next.matchCount,
    });

    state = limitedOut ? { ...next, isLost: true } : next;
    if (state.isLost && !state.isWon) {
      failure = failureReason(state, config.moveLimit);
      break;
    }
  }

  if (!state.isWon && !failure) {
    failure = failureReason(state, config.moveLimit);
  }

  return {
    profile,
    seed,
    won: state.isWon,
    moves: state.moveCount,
    peakStandUsage,
    nearLoss: state.isWon && peakStandUsage >= state.waitingStandSlots - 1,
    failureReason: state.isWon ? undefined : failure,
    steps,
  };
}

export function computeSolverBackedPar(config: StudioGameConfig): number | null {
  const materialized = materializeStudioConfig(config);
  const greedy = solveGreedy(materialized);
  if (greedy.solved) return greedy.moves;

  const dfs = solveDFS(materialized, 100000);
  return dfs.solvable ? dfs.minMoves : null;
}

export function analyzeJuicyLevel(
  config: StudioGameConfig,
  options: AnalyzeOptions = {},
): JuicyDifficultyReport {
  const runs = Math.max(1, options.monteCarloRuns ?? 30);
  const baseSeed = configSeed(config);
  const legacyScore = calculateLegacyScore(config);
  const materialized = materializeStudioConfig(config, baseSeed);
  const greedy = solveGreedy(materialized);
  const dfs = greedy.solved ? undefined : solveDFS(materialized, options.dfsStateLimit ?? 100000);
  const parMoves = greedy.solved ? greedy.moves : dfs?.solvable ? dfs.minMoves : null;
  const solutionPath = greedy.solved ? greedy.moveSequence : dfs?.solutionPath;

  const wins: Record<BotProfileId, number> = {
    novice: 0,
    average: 0,
    expert: 0,
    greedy: 0,
    stress: 0,
  };
  let totalWinMoves = 0;
  let winningRuns = 0;
  let peakStandUsage = 0;
  let nearLosses = 0;
  let queueMoves = 0;
  let directMoves = 0;
  let totalMoves = 0;

  for (const profile of BOT_PROFILES) {
    for (let i = 0; i < runs; i++) {
      const runSeed = (baseSeed + PROFILE_SEED_SALT[profile] + i * 2654435761) | 0;
      const report = simulateUserPlaythrough(config, profile, runSeed);
      if (report.won) {
        wins[profile]++;
        winningRuns++;
        totalWinMoves += report.moves;
        if (report.nearLoss) nearLosses++;
      }
      peakStandUsage = Math.max(peakStandUsage, report.peakStandUsage);
      for (const step of report.steps) {
        if (step.action === 'queue') queueMoves++;
        if (step.action === 'launcher' || step.action === 'complete') directMoves++;
      }
      totalMoves += report.steps.length;
    }
  }

  const winRates = BOT_PROFILES.reduce((acc, profile) => {
    acc[profile] = wins[profile] / runs;
    return acc;
  }, {} as Record<BotProfileId, number>);

  const playerWinRate =
    winRates.novice * 0.2 +
    winRates.average * 0.5 +
    winRates.expert * 0.3;
  const pressure = clamp(peakStandUsage / Math.max(1, config.waitingStandSlots), 0, 1);
  const nearLossRate = winningRuns > 0 ? nearLosses / winningRuns : 0;
  const queueMoveRate = totalMoves > 0 ? queueMoves / totalMoves : 0;
  const directMoveRate = totalMoves > 0 ? directMoves / totalMoves : 0;
  const parPressure = parMoves !== null
    ? clamp(parMoves / Math.max(1, config.selectableItems.length), 0, 1)
    : 1;

  const solverScore = parMoves === null && playerWinRate === 0
    ? 100
    : Math.round(clamp(
        (1 - playerWinRate) * 55 +
        pressure * 15 +
        nearLossRate * 10 +
        queueMoveRate * 10 +
        parPressure * 10,
        0,
        100,
      ));

  let verdict: JuicyDifficultyReport['verdict'];
  if (parMoves === null && playerWinRate === 0) {
    verdict = 'stuck';
  } else if (parMoves === null || playerWinRate < 0.25 || nearLossRate > 0.6) {
    verdict = 'risky';
  } else {
    verdict = 'solvable';
  }

  let moveAnalysis = solutionPath
    ? analyzeMoves(solutionPath, configToSolverInput(materialized))
    : undefined;
  if (moveAnalysis && moveAnalysis.totalMoves > 0 && totalMoves === 0) {
    queueMoves = moveAnalysis.queueMoves;
    directMoves = moveAnalysis.directMoves;
    totalMoves = moveAnalysis.totalMoves;
    moveAnalysis = undefined;
  }

  return {
    verdict,
    legacyScore,
    solverScore,
    tier: scoreToTier(solverScore),
    parMoves,
    winRates,
    avgMoves: winningRuns > 0 ? totalWinMoves / winningRuns : 0,
    peakStandUsage,
    nearLossRate,
    queueMoveRate,
    directMoveRate,
    solutionPath,
  };
}
