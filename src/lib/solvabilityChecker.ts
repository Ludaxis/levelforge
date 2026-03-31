/**
 * Solvability Checker Engine
 *
 * Port of the reference level_tool solver.
 * Uses a lightweight self-contained simulation that operates directly on
 * L0/L1/L2 layers with B-aware scoring, drain-pipe greedy, and strategic
 * DFS branching on placement choice (slot vs queue).
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
// Lightweight solver types (matches reference level_tool)
// ============================================================================

interface SolverItem {
  ColorType: number;
  Variant: number;
  idx: number;
}

interface SolverPos {
  vis: SolverItem | null;
  beh: SolverItem | null;
}

interface SolverSlot {
  ri: number;
  ct: number;
  items: SolverItem[];
  vl: number | null; // variant lock
}

interface SolverState {
  pos: SolverPos[];
  l2i: number;
  nri: number; // next requirement index
  slots: (SolverSlot | null)[];
  wq: SolverItem[];
  cr: number; // completed requirements
  picks: number[];
}

// ============================================================================
// Config → solver input extraction
// ============================================================================

interface SolverInput {
  L0: SolverItem[];
  L1: SolverItem[];
  L2: SolverItem[];
  reqs: { ColorType: number; order: number }[];
  maxWait: number;
  slotCount: number;
}

function configToSolverInput(config: StudioGameConfig): SolverInput {
  // Split items into layers by designer layer (authoritative)
  const allItems = [...config.selectableItems].sort((a, b) => a.order - b.order);

  const hasDesignerLayers = allItems.length > 0 && allItems.every((it) => it.layer != null);

  let L0: SolverItem[];
  let L1: SolverItem[];
  let L2: SolverItem[];

  if (hasDesignerLayers) {
    L0 = allItems.filter((it) => it.layer === 'A').map((it, i) => ({ ColorType: it.colorType, Variant: it.variant, idx: i }));
    L1 = allItems.filter((it) => it.layer === 'B').map((it, i) => ({ ColorType: it.colorType, Variant: it.variant, idx: 100 + i }));
    L2 = allItems.filter((it) => it.layer === 'C').map((it, i) => ({ ColorType: it.colorType, Variant: it.variant, idx: 200 + i }));
  } else {
    // Fallback: positional assignment
    const N = config.maxSelectableItems;
    L0 = allItems.slice(0, N).map((it, i) => ({ ColorType: it.colorType, Variant: it.variant, idx: i }));
    L1 = allItems.slice(N, 2 * N).map((it, i) => ({ ColorType: it.colorType, Variant: it.variant, idx: 100 + i }));
    L2 = allItems.slice(2 * N).map((it, i) => ({ ColorType: it.colorType, Variant: it.variant, idx: 200 + i }));
  }

  // Requirements = launchers sorted by order
  const reqs = [...config.launchers]
    .sort((a, b) => a.order - b.order)
    .map((l, i) => ({ ColorType: l.colorType, order: i }));

  return {
    L0, L1, L2, reqs,
    maxWait: config.waitingStandSlots,
    slotCount: config.activeLauncherCount ?? 2,
  };
}

// ============================================================================
// Lightweight solver core (matches reference level_tool)
// ============================================================================

function makeState(input: SolverInput): SolverState {
  const pos: SolverPos[] = input.L0.map((it, i) => ({
    vis: { ...it },
    beh: i < input.L1.length ? { ...input.L1[i] } : null,
  }));
  return { pos, l2i: 0, nri: 0, slots: new Array(input.slotCount).fill(null), wq: [], cr: 0, picks: [] };
}

function cloneState(s: SolverState): SolverState {
  return {
    pos: s.pos.map((p) => ({
      vis: p.vis ? { ...p.vis } : null,
      beh: p.beh ? { ...p.beh } : null,
    })),
    l2i: s.l2i,
    nri: s.nri,
    slots: s.slots.map((sl) =>
      sl ? { ri: sl.ri, ct: sl.ct, items: sl.items.map((x) => ({ ...x })), vl: sl.vl } : null,
    ),
    wq: s.wq.map((w) => ({ ...w })),
    cr: s.cr,
    picks: [...s.picks],
  };
}

function loadSlot(s: SolverState, si: number, reqs: SolverInput['reqs'], maxWait: number): void {
  if (s.nri >= reqs.length) {
    s.slots[si] = null;
    return;
  }
  const ri = s.nri++;
  s.slots[si] = { ri, ct: reqs[ri].ColorType, items: [], vl: null };

  // Auto-fill from waiting queue (cascade)
  let changed = true;
  while (changed && s.slots[si] && s.slots[si]!.items.length < 3) {
    changed = false;
    for (let wi = 0; wi < s.wq.length; wi++) {
      const w = s.wq[wi];
      const slot = s.slots[si]!;
      if (w.ColorType !== slot.ct) continue;
      if (slot.vl !== null && w.Variant !== slot.vl) continue;
      s.wq.splice(wi, 1);
      if (slot.items.length === 0) slot.vl = w.Variant;
      slot.items.push(w);
      changed = true;
      break;
    }
  }
  // If slot completed from cascade, load next
  if (s.slots[si] && s.slots[si]!.items.length >= 3) {
    s.cr++;
    loadSlot(s, si, reqs, maxWait);
  }
}

function pickSurface(s: SolverState, pi: number, L2: SolverItem[]): SolverItem {
  const p = { ...s.pos[pi].vis! };
  if (s.pos[pi].beh) {
    s.pos[pi].vis = { ...s.pos[pi].beh! };
    s.pos[pi].beh = s.l2i < L2.length ? { ...L2[s.l2i++] } : null;
  } else {
    s.pos[pi].vis = null;
  }
  return p;
}

function placeItem(
  s: SolverState,
  p: SolverItem,
  tgt: number,
  reqs: SolverInput['reqs'],
  maxWait: number,
): boolean {
  if (tgt >= 0) {
    const sl = s.slots[tgt]!;
    if (sl.items.length === 0) sl.vl = p.Variant;
    sl.items.push(p);
    if (sl.items.length >= 3) {
      s.cr++;
      loadSlot(s, tgt, reqs, maxWait);
    }
  } else {
    s.wq.push(p);
    if (s.wq.length >= maxWait) return false;
  }
  return true;
}

/** Find matching slots for an item. Returns slot indices sorted by fullest first. */
function findMatchSlots(s: SolverState, item: SolverItem): number[] {
  const ms: number[] = [];
  for (let si = 0; si < s.slots.length; si++) {
    const sl = s.slots[si];
    if (!sl || item.ColorType !== sl.ct) continue;
    if (sl.vl !== null && item.Variant !== sl.vl) continue;
    ms.push(si);
  }
  ms.sort((a, b) => (s.slots[b]?.items.length ?? 0) - (s.slots[a]?.items.length ?? 0));
  return ms;
}

/** Check if a behind-tile matches any active slot. */
function behindMatchesSlot(s: SolverState, beh: SolverItem | null): boolean {
  if (!beh) return false;
  return s.slots.some((sl) => {
    if (!sl) return false;
    if (beh.ColorType !== sl.ct) return false;
    if (sl.vl !== null && beh.Variant !== sl.vl) return false;
    return true;
  });
}

// ============================================================================
// Greedy solver — drain-pipe strategy (matches reference level_tool)
// ============================================================================

export function solveGreedy(config: StudioGameConfig): SolverResult {
  const input = configToSolverInput(config);
  const { L0, L1, L2, reqs, maxWait, slotCount } = input;
  const totalReqs = reqs.length;

  // Try each position as a "drain pipe" — pick repeatedly to cycle L2
  for (let drainPos = 0; drainPos < L0.length; drainPos++) {
    const init = makeState(input);
    for (let si = 0; si < slotCount; si++) loadSlot(init, si, reqs, maxWait);
    if (!init.pos[drainPos]?.vis) continue;

    const s = cloneState(init);
    const maxIter = totalReqs * 3 + 30;
    let lastPick = -1;
    let peakStand = 0;

    for (let iter = 0; iter < maxIter && s.cr < totalReqs; iter++) {
      const avail: number[] = [];
      for (let i = 0; i < s.pos.length; i++) if (s.pos[i].vis) avail.push(i);
      if (avail.length === 0) break;

      // Score each pick: 3=slot match, 2=behind matches, 1.5=drain, 1=queue room
      const scored = avail.map((pi) => {
        const v = s.pos[pi].vis!;
        const beh = s.pos[pi].beh;
        let score = 0;
        // Direct slot match
        for (let si = 0; si < s.slots.length; si++) {
          const sl = s.slots[si];
          if (!sl) continue;
          if (v.ColorType === sl.ct && (sl.vl === null || v.Variant === sl.vl)) score = 3;
        }
        // Behind matches slot
        if (score < 3 && beh) {
          if (behindMatchesSlot(s, beh)) score = Math.max(score, 2);
        }
        // Non-matching but queue has room
        if (score < 2 && s.wq.length < maxWait) {
          score = Math.max(score, 1);
          if (pi === drainPos || pi === lastPick) score = Math.max(score, 1.5);
        }
        return { pi, score };
      }).filter((x) => x.score > 0);

      scored.sort((a, b) => b.score - a.score);
      if (scored.length === 0) break;

      const pi = scored[0].pi;
      const ns = cloneState(s);
      const p = pickSurface(ns, pi, L2);

      const ms = findMatchSlots(ns, p);
      if (ms.length > 0) {
        placeItem(ns, p, ms[0], reqs, maxWait);
      } else {
        ns.wq.push(p);
        if (ns.wq.length >= maxWait) break;
      }
      ns.picks.push(pi);
      lastPick = pi;
      peakStand = Math.max(peakStand, ns.wq.length);

      // Copy back
      s.pos = ns.pos; s.l2i = ns.l2i; s.nri = ns.nri;
      s.slots = ns.slots; s.wq = ns.wq; s.cr = ns.cr; s.picks = ns.picks;
    }

    if (s.cr >= totalReqs) {
      return {
        solved: true,
        moves: s.picks.length,
        peakStandUsage: peakStand,
        moveSequence: s.picks,
      };
    }
  }

  return { solved: false, moves: 0, peakStandUsage: 0, moveSequence: [], deadEndReason: 'no_tiles' };
}

// ============================================================================
// DFS solver — strategic queue branching (matches reference level_tool)
// ============================================================================

export function solveDFS(
  config: StudioGameConfig,
  stateLimit: number = 10000,
): DFSResult {
  const input = configToSolverInput(config);
  const { L0, L1, L2, reqs, maxWait, slotCount } = input;
  const totalReqs = reqs.length;

  let solutions = 0;
  let deadEnds = 0;
  let explored = 0;
  let minMoves = Infinity;
  let maxMoves = 0;
  let timedOut = false;
  let foundSolution = false;

  function dfs(state: SolverState): void {
    if (explored++ > stateLimit || foundSolution) return;
    if (state.cr >= totalReqs) {
      solutions++;
      foundSolution = true;
      minMoves = Math.min(minMoves, state.picks.length);
      maxMoves = Math.max(maxMoves, state.picks.length);
      return;
    }

    const avail: number[] = [];
    for (let i = 0; i < state.pos.length; i++) if (state.pos[i].vis) avail.push(i);
    if (avail.length === 0) { deadEnds++; return; }

    // Dedup: items with same CT+V and same behind CT+V are interchangeable
    const seen = new Set<string>();
    const deduped: number[] = [];
    for (const pi of avail) {
      const v = state.pos[pi].vis!;
      const b = state.pos[pi].beh;
      const k = `${v.ColorType}_${v.Variant}_${b ? `${b.ColorType}_${b.Variant}` : 'x'}`;
      if (!seen.has(k)) { seen.add(k); deduped.push(pi); }
    }

    // Sort: 3=direct match, 2=behind matches, 1=other (B-aware ordering)
    deduped.sort((a, b) => {
      let sA = 0; let sB = 0;
      for (let si = 0; si < state.slots.length; si++) {
        const sl = state.slots[si];
        if (!sl) continue;
        const ia = state.pos[a].vis!;
        const ib = state.pos[b].vis!;
        if (ia.ColorType === sl.ct && (sl.vl === null || ia.Variant === sl.vl)) sA = 3;
        if (ib.ColorType === sl.ct && (sl.vl === null || ib.Variant === sl.vl)) sB = 3;
      }
      if (sA < 3 && behindMatchesSlot(state, state.pos[a].beh)) sA = Math.max(sA, 2);
      if (sB < 3 && behindMatchesSlot(state, state.pos[b].beh)) sB = Math.max(sB, 2);
      return sB - sA;
    });

    for (const pi of deduped) {
      if (foundSolution || explored > stateLimit) return;
      const item = state.pos[pi].vis!;

      const matchSlots = findMatchSlots(state, item);

      // Build placement targets: slot(s) + strategic queue
      const targets: number[] = [];
      if (matchSlots.length > 0) targets.push(...matchSlots);

      // Allow queue pick if: queue not full AND (no match OR behind is useful)
      if (state.wq.length < maxWait - 1) {
        if (matchSlots.length === 0) {
          targets.push(-1);
        } else {
          // Even matching items: try queue if behind item matches a slot
          if (behindMatchesSlot(state, state.pos[pi].beh)) targets.push(-1);
        }
      } else if (matchSlots.length === 0 && state.wq.length < maxWait) {
        targets.push(-1); // last queue slot, only for non-matching
      }

      if (targets.length === 0) continue;

      for (const tgt of targets) {
        if (foundSolution || explored > stateLimit) return;
        const ns = cloneState(state);
        const p = pickSurface(ns, pi, L2);
        if (placeItem(ns, p, tgt, reqs, maxWait)) {
          ns.picks.push(pi);
          dfs(ns);
        } else {
          deadEnds++;
        }
      }
    }
  }

  // Try starting from each position (like reference tool)
  for (let fp = 0; fp < L0.length; fp++) {
    if (foundSolution) break;
    const init = makeState(input);
    for (let si = 0; si < slotCount; si++) loadSlot(init, si, reqs, maxWait);
    if (!init.pos[fp]?.vis) continue;

    const item = init.pos[fp].vis!;
    const matchSlots = findMatchSlots(init, item);
    const targets = matchSlots.length > 0 ? matchSlots : [-1];

    for (const tgt of targets) {
      if (foundSolution) break;
      const ns = cloneState(init);
      const p = pickSurface(ns, fp, L2);
      if (placeItem(ns, p, tgt, reqs, maxWait)) {
        ns.picks.push(fp);
        dfs(ns);
      }
    }
  }

  if (explored > stateLimit) timedOut = true;

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
// Monte Carlo solver (multi-seed, blended strategies)
// ============================================================================

type Strategy = 'greedy' | 'semi-random' | 'random' | 'strategic';

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
      // B-aware: bonus if behind tile matches a launcher
      score = 0;
      const bTile = state.layerB[i];
      if (bTile) {
        const bMatches = state.activeLaunchers.some((l) => {
          if (l.colorType !== bTile.colorType || l.collected.length >= 3) return false;
          if (l.collected.length > 0) return l.collected[0].variant === bTile.variant;
          return true;
        });
        if (bMatches) score = 50;
      }
    } else {
      score = -1000;
    }

    available.push({ idx: i, score });
  }

  return available;
}

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

  if (strategy === 'greedy' || strategy === 'strategic') {
    // Among top-scored, pick randomly for variety
    const best = available[0].score;
    const tied = available.filter((a) => a.score === best);
    return tied[Math.floor(rng() * tied.length)].idx;
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
  const strategy: Strategy = roll < 0.3 ? 'greedy' : roll < 0.55 ? 'semi-random' : roll < 0.75 ? 'random' : 'strategic';

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
    dfsStateLimit = 500000,
  } = options;

  const greedy = solveGreedy(config);

  const monteCarlo = runMonteCarlo
    ? solveMonteCarlo(config, monteCarloRuns)
    : { runs: 0, wins: 0, winRate: greedy.solved ? 1 : 0, avgMoves: 0, peakStandUsage: 0, confidenceInterval: [0, 0] as [number, number] };

  // Run DFS if explicitly requested, OR as a fallback when greedy+MC find no wins.
  const needsFallbackDFS = !runDFS && !greedy.solved && monteCarlo.winRate === 0;
  const dfs = (runDFS || needsFallbackDFS)
    ? solveDFS(config, dfsStateLimit)
    : undefined;

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
