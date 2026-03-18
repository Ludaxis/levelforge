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
  maxSelectableItems: number;
  totalTiles: number;
  blockingOffset?: number; // 0-10: how many blocker items extend the unlock window
  /** @deprecated Legacy field preserved for compatibility with older saved levels/tests. */
  mismatchDepth?: number;
}

/** A single component of the difficulty score, with designer-facing explanation. */
export interface DifficultyComponent {
  id: string;              // programmatic key
  name: string;            // designer-friendly display name
  description: string;     // what this factor measures
  score: number;           // 0-1 normalized score
  weight: number;          // how much this contributes to total (sums to 1.0)
  contribution: number;    // score × weight
  explanation: string;     // dynamic sentence explaining the current value
  impact: 'easy' | 'medium' | 'hard';
}

export interface StudioDifficultyResult {
  score: number;       // 0-100
  tier: DifficultyTier;
  breakdown: DifficultyComponent[];
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export const MAX_BLOCKING_OFFSET = 10;

function clampBlockingOffset(v: number): number {
  return Math.max(0, Math.min(MAX_BLOCKING_OFFSET, Math.round(v)));
}

export function blockingOffsetToDepth(blockingOffset: number): number {
  return clamp01(clampBlockingOffset(blockingOffset) / MAX_BLOCKING_OFFSET);
}

export function resolveBlockingOffset(input: {
  blockingOffset?: number;
  mismatchDepth?: number;
}): number {
  if (typeof input.blockingOffset === 'number') {
    return clampBlockingOffset(input.blockingOffset);
  }
  if (typeof input.mismatchDepth === 'number') {
    return clampBlockingOffset(input.mismatchDepth * MAX_BLOCKING_OFFSET);
  }
  return 0;
}

export function calculateStudioDifficulty(params: StudioDifficultyParams): StudioDifficultyResult {
  const {
    uniqueColors,
    launcherCount,
    maxSelectableItems,
    totalTiles,
  } = params;
  const blockingOffset = resolveBlockingOffset(params);

  // ── 1. Blocking Pattern (0.40) ──────────────────────────────────────
  // How long does it take before the player can complete the active set?
  // 0 = no extra blockers beyond A+B, 10 = maximum burial into Layer C.
  const blockingFactor = blockingOffsetToDepth(blockingOffset);

  // ── 2. Color Variety (0.10) ─────────────────────────────────────────
  // More distinct fruit colors = harder to spot matching triplets
  const colorVariety = clamp01((uniqueColors - 2) / 5);

  // ── 3. Surface Size (0.25) ──────────────────────────────────────────
  // How many items are visible on Layer A? Fewer = fewer choices per move
  const surfaceSize = clamp01(1 - (maxSelectableItems - 1) / 19);

  // ── 4. Hidden Ratio (0.15) ──────────────────────────────────────────
  // What fraction of items sit below the surface (Layer B + C)?
  // More hidden items = less information to plan with
  const hiddenRatio = totalTiles > 0
    ? clamp01((totalTiles - maxSelectableItems) / totalTiles)
    : 0;

  // ── 5. Launcher Sequence (0.10) ─────────────────────────────────────
  // Total launchers the player must complete
  const launcherSequence = clamp01((launcherCount - 4) / 12);

  const raw =
    blockingFactor * 0.40 +
    colorVariety * 0.10 +
    surfaceSize * 0.25 +
    hiddenRatio * 0.15 +
    launcherSequence * 0.10;

  const score = Math.round(raw * 100);

  let tier: DifficultyTier;
  if (score < 20) tier = 'trivial';
  else if (score < 35) tier = 'easy';
  else if (score < 50) tier = 'medium';
  else if (score < 65) tier = 'hard';
  else if (score < 80) tier = 'expert';
  else tier = 'nightmare';

  // ── Build explanations ──────────────────────────────────────────────

  const hiddenItemCount = totalTiles - maxSelectableItems;
  const layerBCount = Math.min(maxSelectableItems, hiddenItemCount);
  const layerCCount = Math.max(0, hiddenItemCount - layerBCount);
  const unlockDistance = maxSelectableItems * 2 + blockingOffset;

  function impactOf(v: number): 'easy' | 'medium' | 'hard' {
    return v < 0.3 ? 'easy' : v < 0.6 ? 'medium' : 'hard';
  }

  const breakdown: DifficultyComponent[] = [
    {
      id: 'blocking',
      name: 'Blocking',
      description: 'How far the matching fruits for the active blenders are stretched through the unlock window. Higher = more non-matching fruits must be processed first.',
      score: blockingFactor,
      weight: 0.40,
      contribution: blockingFactor * 0.40,
      explanation: blockingOffset === 0
        ? `Unlock distance ${unlockDistance} items — matching fruits stay within Layer A + Layer B, so the active blenders can be completed without digging into Layer C.`
        : blockingOffset <= 3
        ? `Unlock distance ${unlockDistance} items — a few blocker fruits push the final matches slightly into Layer C.`
        : blockingOffset <= 6
        ? `Unlock distance ${unlockDistance} items — the active blenders are delayed by a substantial blocker span across later fruits.`
        : `Unlock distance ${unlockDistance} items — the final matches are buried behind a long blocker chain and typically appear at the tail of the unlock window.`,
      impact: impactOf(blockingFactor),
    },
    {
      id: 'surfaceSize',
      name: 'Surface Size',
      description: 'Number of fruits visible on top (Layer A) — how many choices the player has per move',
      score: surfaceSize,
      weight: 0.25,
      contribution: surfaceSize * 0.25,
      explanation: maxSelectableItems >= 10
        ? `${maxSelectableItems} fruits on surface — player has many options to choose from.`
        : maxSelectableItems >= 6
        ? `${maxSelectableItems} fruits on surface — moderate choices. Each pick matters more.`
        : `${maxSelectableItems} fruits on surface — very few options. Almost every pick is forced.`,
      impact: impactOf(surfaceSize),
    },
    {
      id: 'hiddenRatio',
      name: 'Hidden Items',
      description: 'Fruits below the surface: Layer B (dimmed, visible as hint) and Layer C (fully hidden)',
      score: hiddenRatio,
      weight: 0.15,
      contribution: hiddenRatio * 0.15,
      explanation: layerCCount === 0
        ? `${layerBCount} fruits in Layer B (visible as hints), 0 in Layer C. Player can see everything and plan ahead.`
        : layerCCount <= 5
        ? `${layerBCount} fruits in Layer B (hints) + ${layerCCount} in Layer C (hidden). Mostly plannable with some unknowns.`
        : `${layerBCount} fruits in Layer B (hints) + ${layerCCount} in Layer C (hidden). Many fruits are invisible — player can't fully plan ahead.`,
      impact: impactOf(hiddenRatio),
    },
    {
      id: 'colorVariety',
      name: 'Color Quantity',
      description: 'Number of distinct fruit colors in the level',
      score: colorVariety,
      weight: 0.10,
      contribution: colorVariety * 0.10,
      explanation: uniqueColors <= 3
        ? `${uniqueColors} colors — easy to spot matching triplets at a glance.`
        : uniqueColors <= 5
        ? `${uniqueColors} colors — moderate variety. Player needs to scan carefully for matches.`
        : `${uniqueColors} colors — high variety. Hard to find matching triplets among many different fruits.`,
      impact: impactOf(colorVariety),
    },
    {
      id: 'launcherSequence',
      name: 'Blender Count',
      description: 'Total blenders to complete — determines level length and sustained concentration',
      score: launcherSequence,
      weight: 0.10,
      contribution: launcherSequence * 0.10,
      explanation: launcherCount <= 6
        ? `${launcherCount} blenders — short level, quick completion.`
        : launcherCount <= 12
        ? `${launcherCount} blenders — medium length. Requires sustained focus.`
        : `${launcherCount} blenders — long level. Player must maintain concentration over many rounds.`,
      impact: impactOf(launcherSequence),
    },
  ];

  return { score, tier, breakdown };
}

// ============================================================================
// Types
// ============================================================================

export interface StudioTile {
  id: string;
  colorType: number;
  variant: number;
  fruitType: FruitType;
  /** Designer-specified layer assignment. When set, distributeToLayers respects it. */
  designerLayer?: 'A' | 'B' | 'C';
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
  selectableItems: { colorType: number; variant: number; order: number; layer?: 'A' | 'B' | 'C' }[];
  launchers: { colorType: number; pixelCount: number; group: number; order: number }[];
  activeLauncherCount?: number; // default 2
  /** 0-10: how many blocker items extend the unlock window beyond Layer A + Layer B. */
  blockingOffset?: number;
  /** @deprecated Legacy field preserved for compatibility with older saved levels/tests. */
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
  /** How many launchers are active simultaneously (from config) */
  activeLauncherCount: number;
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
// Par Moves — minimum moves for optimal (greedy) play
// ============================================================================

/**
 * Compute par moves for a level configuration.
 * Runs the greedy solvability checker and counts its moves.
 * Returns the minimum number of picks an optimal player needs.
 * Used by the DDA system as `move.skill_index = par_moves / actual_moves`.
 */
export function computeParMoves(config: StudioGameConfig): number | null {
  const state = initializeStateSeeded({ ...config, seed: config.seed ?? 42 });
  const sorted = [...config.launchers].sort((a, b) => a.order - b.order);
  const activeLauncherCount = config.activeLauncherCount ?? 2;

  const simA = state.layerA.map((t) => (t ? { ...t } : null));
  const simB = state.layerB.map((t) => (t ? { ...t } : null));
  const simC = state.layerC.map((t) => ({ ...t }));

  interface SimLauncher { colorType: number; collected: number }
  const active: SimLauncher[] = sorted.slice(0, activeLauncherCount).map((l) => ({ colorType: l.colorType, collected: 0 }));
  const queue: SimLauncher[] = sorted.slice(activeLauncherCount).map((l) => ({ colorType: l.colorType, collected: 0 }));
  const stand: number[] = [];
  let fired = 0;
  let moves = 0;
  const totalLaunchers = sorted.length;
  const maxIter = simA.length * 4 + simC.length + 200;

  for (let iter = 0; iter < maxIter; iter++) {
    if (fired >= totalLaunchers) return moves;
    const available: { idx: number; tile: StudioTile }[] = [];
    for (let i = 0; i < simA.length; i++) { if (simA[i]) available.push({ idx: i, tile: simA[i]! }); }
    if (available.length === 0) break;

    let bestIdx = -1, bestScore = -Infinity;
    for (const { idx, tile } of available) {
      const launcher = active.find((l) => l.colorType === tile.colorType && l.collected < 3);
      const score = launcher ? (launcher.collected === 2 ? 200 : 100) : (stand.length < (config.waitingStandSlots ?? 5) ? 0 : -1000);
      if (score > bestScore) { bestScore = score; bestIdx = idx; }
    }
    if (bestIdx === -1) break;
    if (bestScore <= -1000) {
      const match = available.find(({ tile }) => active.some((l) => l.colorType === tile.colorType && l.collected < 3));
      if (match) bestIdx = match.idx; else return null; // unsolvable
    }

    const tile = simA[bestIdx]!;
    simA[bestIdx] = null;
    moves++;

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
      stand.push(tile.colorType);
    }
  }

  return fired >= totalLaunchers ? moves : null;
}

// ============================================================================
// Find maximum solvable tile burial depth
// ============================================================================

const SOURCE_LAYER_ORDER: Record<'A' | 'B' | 'C', number> = {
  A: 0,
  B: 1,
  C: 2,
};

function sortSelectableItemsForSequence(
  selectableItems: StudioGameConfig['selectableItems'],
) {
  return [...selectableItems].sort((a, b) => {
    const layerA = SOURCE_LAYER_ORDER[a.layer || 'A'];
    const layerB = SOURCE_LAYER_ORDER[b.layer || 'A'];
    if (layerA !== layerB) return layerA - layerB;
    return a.order - b.order;
  });
}

/**
 * Find the highest blocking offset (0-10) that still produces a solvable
 * arrangement for the current level recipe.
 */
export function findMaxSolvableBlockingOffset(config: StudioGameConfig): number {
  const {
    maxSelectableItems,
    waitingStandSlots,
    selectableItems,
    launchers,
    activeLauncherCount = 2,
  } = config;

  const sortedItems = sortSelectableItemsForSequence(selectableItems);

  const allTiles: StudioTile[] = sortedItems.map((item) => ({
    id: tileId(),
    colorType: item.colorType,
    variant: item.variant,
    fruitType: COLOR_TYPE_TO_FRUIT[item.colorType] || 'apple',
    designerLayer: item.layer,
  }));

  const sortedLauncherConfigs = [...launchers].sort((a, b) => a.order - b.order);

  for (let offset = MAX_BLOCKING_OFFSET; offset >= 0; offset--) {
    const seq = buildDeterministicSequence(
      allTiles,
      sortedLauncherConfigs,
      activeLauncherCount,
      offset,
      maxSelectableItems,
    );
    const layers = distributeToLayersSeeded(seq, maxSelectableItems);
    if (verifySolvability(layers.a, layers.b, layers.c, sortedLauncherConfigs, activeLauncherCount, waitingStandSlots)) {
      return offset;
    }
  }

  return 0;
}

/** @deprecated Legacy helper preserved for older callers. */
export function findMaxSolvableDepth(config: StudioGameConfig): number {
  return blockingOffsetToDepth(findMaxSolvableBlockingOffset(config));
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

// ============================================================================
// Deterministic tile sequence builder (no RNG)
// ============================================================================

/**
 * Build a deterministic sequence from the canonical Item Pool order.
 *
 * Preserves authored order — Surface Size changes just move the A/B/C
 * cut point on the same sequence.
 *
 * Blocking rules (L1, L2 = active launchers):
 *
 *   blocking=0: canonical order unchanged.
 *
 *   blocking=1: Enforce at most 2 tiles of each active color in Layer A.
 *     Push excess to Layer B, behind non-active-color A items.
 *     Both launchers are blocked — neither can fire from A alone.
 *
 *   blocking=2..7: Enforce at most 2 tiles of each active color in A+B combined.
 *     Push ALL excess (3rd, 4th, 5th...) matching tiles into Layer C.
 *     First excess → C(blocking-1), subsequent → next C positions.
 *     Neither launcher can be completed from A+B alone.
 *     e.g. blocking=2: excess → C1,C2,...  blocking=6: excess → C5,C6,...
 *
 * "Excess" means ANY tile whose colorType matches an active launcher
 * beyond the first 2 in the enforcement window. This prevents the player
 * from completing a launcher using tiles from later launcher groups.
 */
export function buildDeterministicSequence(
  allTiles: StudioTile[],
  launcherConfigs: { colorType: number; order: number }[],
  activeLauncherCount: number,
  blockingValue: number,
  maxSelectableItems: number = 10,
): StudioTile[] {
  const blockingOffset =
    blockingValue > 1 ? clampBlockingOffset(blockingValue) : clampBlockingOffset(Math.round(blockingValue * MAX_BLOCKING_OFFSET));

  const sequence = [...allTiles];
  if (blockingOffset === 0 || sequence.length === 0) return sequence;

  const sorted = [...launcherConfigs].sort((a, b) => a.order - b.order);
  const N = maxSelectableItems;
  const activeGroup = sorted.slice(0, activeLauncherCount);
  const activeColorTypes = new Set(activeGroup.map((l) => l.colorType));

  // Enforcement window: where we allow at most 2 per active color
  const enforcementEnd = blockingOffset === 1
    ? Math.min(N, sequence.length)        // Blocking 1: Layer A only
    : Math.min(2 * N, sequence.length);   // Blocking 2+: A + B combined

  // Target zone: where excess tiles get pushed to
  const targetStart = blockingOffset === 1
    ? N                                   // Blocking 1: start of Layer B
    : 2 * N + (blockingOffset - 2);       // Blocking 2+: C(blocking-1)

  // Scan the enforcement window and collect ALL excess active-color tiles
  // (3rd, 4th, 5th... of each active color)
  const colorCounts = new Map<number, number>();
  const excessPositions: number[] = [];

  for (let i = 0; i < enforcementEnd; i++) {
    const ct = sequence[i].colorType;
    if (!activeColorTypes.has(ct)) continue;
    const count = (colorCounts.get(ct) || 0) + 1;
    colorCounts.set(ct, count);
    if (count > 2) {
      excessPositions.push(i);
    }
  }

  if (excessPositions.length === 0) return sequence;

  // Process excess tiles from last to first to preserve earlier positions
  for (let e = excessPositions.length - 1; e >= 0; e--) {
    const excessPos = excessPositions[e];
    const targetPos = Math.min(targetStart + e, sequence.length - 1);

    if (targetPos <= excessPos) continue; // already deep enough

    // Find swap target: non-active-color tile at or near targetPos
    // Search backward from target for a valid (non-active) tile
    let swapIdx = -1;
    for (let j = targetPos; j > excessPos; j--) {
      if (!activeColorTypes.has(sequence[j].colorType)) {
        // For Blocking 1: also check that the A item above this B position
        // is non-active, so the blocker is real (player must pick non-matching to reveal)
        if (blockingOffset === 1 && j >= N && j < 2 * N) {
          const aAbove = j - N;
          if (aAbove < sequence.length && activeColorTypes.has(sequence[aAbove].colorType)) {
            continue; // skip — A item above is active-color, not a real blocker
          }
        }
        swapIdx = j;
        break;
      }
    }

    if (swapIdx === -1) continue; // no valid swap — cap hardness

    [sequence[excessPos], sequence[swapIdx]] = [sequence[swapIdx], sequence[excessPos]];
  }

  return sequence;
}

/**
 * Legacy helper retained for compatibility with existing tests and callers.
 * The new system uses a fixed 0-10 blocking offset range instead of swap counts.
 */
export function getDeterministicMaxSwap(
  allTiles: StudioTile[],
  launcherConfigs: { colorType: number; order: number }[],
  activeLauncherCount: number,
): number {
  void allTiles;
  void launcherConfigs;
  void activeLauncherCount;
  return MAX_BLOCKING_OFFSET;
}

/** @deprecated Use buildDeterministicSequence instead — this uses seeded RNG. */
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

/** @deprecated Use buildDeterministicSequence instead — this uses seeded RNG. */
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

/** Distribute a tile sequence into three layers by sequence index.
 *  First maxSelectableItems → Layer A, next → Layer B, rest → Layer C.
 *  Designer layer assignments are handled separately in the initializers (depth=0 only).
 */
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

function buildDerivedLayers(
  selectableItems: StudioGameConfig['selectableItems'],
  launchers: StudioGameConfig['launchers'],
  activeLauncherCount: number,
  maxSelectableItems: number,
  waitingStandSlots: number,
  blockingOffset: number,
  makeTileId: () => string,
  verify: typeof verifySolvability | typeof verifySolvabilitySeeded,
): {
  layerA: (StudioTile | null)[];
  layerB: (StudioTile | null)[];
  layerC: StudioTile[];
  sortedLauncherConfigs: { colorType: number; pixelCount: number; group: number; order: number }[];
} {
  const sortedItems = sortSelectableItemsForSequence(selectableItems);
  const allTiles: StudioTile[] = sortedItems.map((item) => ({
    id: makeTileId(),
    colorType: item.colorType,
    variant: item.variant,
    fruitType: COLOR_TYPE_TO_FRUIT[item.colorType] || 'apple',
    designerLayer: item.layer,
  }));

  const sortedLauncherConfigs = [...launchers].sort((a, b) => a.order - b.order);
  let layerA: (StudioTile | null)[] = new Array(maxSelectableItems).fill(null);
  let layerB: (StudioTile | null)[] = new Array(maxSelectableItems).fill(null);
  let layerC: StudioTile[] = [];
  let found = false;

  for (let offset = clampBlockingOffset(blockingOffset); offset >= 0 && !found; offset--) {
    const sequence = buildDeterministicSequence(
      allTiles,
      sortedLauncherConfigs,
      activeLauncherCount,
      offset,
      maxSelectableItems,
    );
    const layers = distributeToLayersSeeded(sequence, maxSelectableItems);
    if (verify(layers.a, layers.b, layers.c, sortedLauncherConfigs, activeLauncherCount, waitingStandSlots)) {
      layerA = layers.a;
      layerB = layers.b;
      layerC = layers.c;
      found = true;
    }
  }

  if (!found) {
    const sequence = buildDeterministicSequence(
      allTiles,
      sortedLauncherConfigs,
      activeLauncherCount,
      0,
      maxSelectableItems,
    );
    const layers = distributeToLayersSeeded(sequence, maxSelectableItems);
    layerA = layers.a;
    layerB = layers.b;
    layerC = layers.c;
  }

  return { layerA, layerB, layerC, sortedLauncherConfigs };
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
    seed = 42,
  } = config;
  const blockingOffset = resolveBlockingOffset(config);

  const rng = mulberry32(seed);
  const { layerA, layerB, layerC, sortedLauncherConfigs } = buildDerivedLayers(
    selectableItems,
    launchers,
    activeLauncherCount,
    maxSelectableItems,
    waitingStandSlots,
    blockingOffset,
    () => seededTileId(rng),
    verifySolvabilitySeeded,
  );

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
    activeLauncherCount,
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
  } = config;
  const blockingOffset = resolveBlockingOffset(config);
  const { layerA, layerB, layerC, sortedLauncherConfigs } = buildDerivedLayers(
    selectableItems,
    launchers,
    activeLauncherCount,
    maxSelectableItems,
    waitingStandSlots,
    blockingOffset,
    tileId,
    verifySolvability,
  );

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
    activeLauncherCount,
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

  const activeLauncherCount = state.activeLauncherCount;

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

  // Win check: all launchers fulfilled (no active + no queued remaining)
  // This allows "fake" items (items with no matching launcher) without blocking completion.
  const allLaunchersFired =
    activeLaunchers.every((l) => l.collected.length >= 3) &&
    launcherQueue.length === 0;
  const allPixelsFilled = newPixelArt.every((cell) => cell.filled);
  const isWon = allLaunchersFired || allPixelsFilled;

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

  // Check if no tiles remain and launchers are still not all fulfilled
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
      if (!allPixelsFilled) isLost = true;
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
