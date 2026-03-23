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
  /** Total unique (colorType, variant) pairs in the item pool.
   *  When omitted, variant complexity is assumed to be 0 (1 variant per color). */
  uniqueVariants?: number;
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
    uniqueVariants,
  } = params;
  const blockingOffset = resolveBlockingOffset(params);

  // ── 1. Blocking Pattern (0.40) ──────────────────────────────────────
  // How long does it take before the player can complete the active set?
  // 0 = no extra blockers beyond A+B, 10 = maximum burial into Layer C.
  const blockingFactor = blockingOffsetToDepth(blockingOffset);

  // ── 2. Color Variety (0.08) ───────────────────────────────────────
  // More distinct fruit colors = harder to spot matching triplets
  const colorVariety = clamp01((uniqueColors - 2) / 5);

  // ── 3. Surface Size (0.22) ──────────────────────────────────────────
  // How many items are visible on Layer A? Fewer = fewer choices per move
  const surfaceSize = clamp01(1 - (maxSelectableItems - 1) / 19);

  // ── 4. Hidden Ratio (0.13) ──────────────────────────────────────────
  // What fraction of items sit below the surface (Layer B + C)?
  // More hidden items = less information to plan with
  const hiddenRatio = totalTiles > 0
    ? clamp01((totalTiles - maxSelectableItems) / totalTiles)
    : 0;

  // ── 5. Launcher Sequence (0.09) ─────────────────────────────────────
  // Total launchers the player must complete
  const launcherSequence = clamp01((launcherCount - 4) / 12);

  // ── 6. Variant Complexity (0.08) ────────────────────────────────────
  // How many different variants per color are used?
  // 1 variant/color = 0 (match by color only), 3 variants/color = 1 (must
  // distinguish between e.g. Blueberry, Fig, and Grape within the blue color).
  const avgVariantsPerColor = (uniqueVariants != null && uniqueColors > 0)
    ? uniqueVariants / uniqueColors
    : 1;
  const variantComplexity = clamp01((avgVariantsPerColor - 1) / 2);

  const raw =
    blockingFactor * 0.40 +
    colorVariety * 0.08 +
    surfaceSize * 0.22 +
    hiddenRatio * 0.13 +
    launcherSequence * 0.09 +
    variantComplexity * 0.08;

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

  const usedVariants = uniqueVariants ?? uniqueColors;

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
      weight: 0.22,
      contribution: surfaceSize * 0.22,
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
      weight: 0.13,
      contribution: hiddenRatio * 0.13,
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
      weight: 0.08,
      contribution: colorVariety * 0.08,
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
      weight: 0.09,
      contribution: launcherSequence * 0.09,
      explanation: launcherCount <= 6
        ? `${launcherCount} blenders — short level, quick completion.`
        : launcherCount <= 12
        ? `${launcherCount} blenders — medium length. Requires sustained focus.`
        : `${launcherCount} blenders — long level. Player must maintain concentration over many rounds.`,
      impact: impactOf(launcherSequence),
    },
    {
      id: 'variantComplexity',
      name: 'Variant Complexity',
      description: 'How many visual variants per color are used. More variants means the player must distinguish between similar-looking fruits of the same color (e.g. Blueberry vs Fig vs Grape).',
      score: variantComplexity,
      weight: 0.08,
      contribution: variantComplexity * 0.08,
      explanation: avgVariantsPerColor <= 1
        ? `${usedVariants} variant${usedVariants === 1 ? '' : 's'} across ${uniqueColors} colors (1 per color) — matching by color alone is enough.`
        : avgVariantsPerColor <= 2
        ? `${usedVariants} variants across ${uniqueColors} colors (~${avgVariantsPerColor.toFixed(1)} per color) — player must sometimes distinguish between variants of the same color.`
        : `${usedVariants} variants across ${uniqueColors} colors (~${avgVariantsPerColor.toFixed(1)} per color) — maximum variant confusion. Every color has multiple look-alikes.`,
      impact: impactOf(variantComplexity),
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
  /** Designer-specified move limit (0 or undefined = unlimited) */
  moveLimit?: number;
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
  // Sort by order ONLY — the layer field is a derived output (from blocking),
  // not a canonical input. Using layer for sorting creates a circular dependency
  // where the sync effect changes layers → changes sort → changes blocking output.
  return [...selectableItems].sort((a, b) => a.order - b.order);
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
 * Blocking rules:
 *
 *   blocking=0: Ensure all 3 tiles per active color are accessible.
 *     3rd tile should be in Layer A, or in Layer B behind a SAME-color A item
 *     (picking the matching A reveals matching B — no wasted pick).
 *     If 3rd tile is deep in C, pull it up to an accessible position.
 *
 *   blocking=1: 3rd tile → Layer B, behind a NON-active A item (B5-B10 range).
 *     The player must pick a non-matching item (goes to backup) to reveal it.
 *     At most 2 matching per active color in Layer A.
 *
 *   blocking=2..7: 3rd tile → C(blocking-1). Neither launcher completable from A+B.
 */
export function buildDeterministicSequence(
  allTiles: StudioTile[],
  launcherConfigs: { colorType: number; order: number }[],
  activeLauncherCount: number,
  blockingValue: number,
  maxSelectableItems: number = 10,
): StudioTile[] {
  const blockingOffset = clampBlockingOffset(Math.round(blockingValue));

  const sequence = [...allTiles];
  if (sequence.length === 0) return sequence;

  const sorted = [...launcherConfigs].sort((a, b) => a.order - b.order);
  const N = maxSelectableItems;
  const activeGroup = sorted.slice(0, activeLauncherCount);
  const activeColorTypes = new Set(activeGroup.map((l) => l.colorType));

  let launcherSlot = 0; // incrementing offset so each launcher gets its own target

  for (const launcher of activeGroup) {
    const ct = launcher.colorType;

    // Find ALL positions of this color
    const positions: number[] = [];
    for (let i = 0; i < sequence.length; i++) {
      if (sequence[i].colorType === ct) positions.push(i);
    }
    if (positions.length < 3) { launcherSlot++; continue; }

    const thirdPos = positions[2];

    if (blockingOffset === 0) {
      // ── Blocking 0: make the 3rd tile accessible ──
      // Target: either in Layer A, or in B behind a same-color A item.
      // If already in A (pos < N), fine.
      if (thirdPos < N) continue;

      // Try to place in B behind a same-color A item
      let target = -1;
      for (let b = N; b < Math.min(2 * N, sequence.length); b++) {
        const aAbove = b - N;
        if (sequence[aAbove].colorType === ct && !activeColorTypes.has(sequence[b].colorType)) {
          // B position behind a matching A item, and current B tile is non-active (good swap)
          target = b;
          break;
        }
      }

      // Fallback: place in A by swapping with a non-active tile in A
      if (target === -1) {
        for (let a = N - 1; a >= 0; a--) {
          if (!activeColorTypes.has(sequence[a].colorType)) {
            target = a;
            break;
          }
        }
      }

      if (target !== -1 && target !== thirdPos) {
        [sequence[thirdPos], sequence[target]] = [sequence[target], sequence[thirdPos]];
      }

    } else if (blockingOffset === 1) {
      // ── Blocking 1: 3rd tile → B behind non-active A item ──
      // Search B positions (from end) where A item above is NOT active-color
      // Each launcher gets a different B slot
      let found = 0;
      let target = -1;
      for (let b = 2 * N - 1; b >= N; b--) {
        if (b >= sequence.length) continue;
        const aAbove = b - N;
        if (!activeColorTypes.has(sequence[aAbove].colorType) &&
            !activeColorTypes.has(sequence[b].colorType)) {
          if (found === launcherSlot) {
            target = b;
            break;
          }
          found++;
        }
      }

      if (target !== -1 && target !== thirdPos) {
        [sequence[thirdPos], sequence[target]] = [sequence[target], sequence[thirdPos]];
      }

    } else {
      // ── Blocking 2-7: 3rd tile → C(blocking-1 + launcherSlot) ──
      // Each launcher gets its own C position: L1→C(blocking-1), L2→C(blocking), etc.
      const cTarget = Math.min(2 * N + (blockingOffset - 2) + launcherSlot, sequence.length - 1);

      let target = -1;
      if (thirdPos === cTarget) {
        launcherSlot++;
        continue;
      } else if (!activeColorTypes.has(sequence[cTarget]?.colorType ?? -1)) {
        target = cTarget;
      } else {
        // Search backward for non-active tile near target
        for (let j = cTarget; j > Math.max(thirdPos, 2 * N - 1); j--) {
          if (!activeColorTypes.has(sequence[j].colorType)) {
            target = j;
            break;
          }
        }
      }

      if (target !== -1 && target !== thirdPos) {
        [sequence[thirdPos], sequence[target]] = [sequence[target], sequence[thirdPos]];
      }
    }

    launcherSlot++;
  }

  // ── Combined enforcement: cap active-color tiles in A+B ──────────────
  // Runs AFTER all per-launcher 3rd-tile positioning, so no single color
  // hogs all the available C swap slots.  Round-robin ensures fairness.
  //
  // Cap scales with blockingOffset:
  //   blocking 0-1: no enforcement (only the 3rd tile is repositioned above)
  //   blocking 2-4: max 2 in A+B (mild — at least one triplet reachable)
  //   blocking 5-7: max 1 in A+B (hard — player must dig into C)
  //   blocking 8-10: max 0 in A+B (nightmare — all active tiles buried in C)
  // The solvability fallback (caller steps offset down) prevents unsolvable states.
  if (blockingOffset >= 2) {
    const maxInAB = blockingOffset <= 4 ? 2 : blockingOffset <= 7 ? 1 : 0;
    const enfEnd = Math.min(2 * N, sequence.length);
    const pushSearchEnd = Math.min(2 * N + blockingOffset + activeLauncherCount, sequence.length);

    // Round-robin: each pass pushes at most 1 excess tile per active color,
    // so limited C swap slots are shared fairly across colors.
    let moved = true;
    while (moved) {
      moved = false;
      for (const ct of activeColorTypes) {
        // Count this color in A+B and find the first excess position
        let count = 0;
        let excessIdx = -1;
        for (let i = 0; i < enfEnd; i++) {
          if (sequence[i].colorType !== ct) continue;
          count++;
          if (count > maxInAB) { excessIdx = i; break; }
        }
        if (excessIdx === -1) continue; // within cap

        // Find a non-active tile beyond A+B to swap with
        let swapIdx = -1;
        for (let j = pushSearchEnd - 1; j > excessIdx; j--) {
          if (!activeColorTypes.has(sequence[j].colorType)) { swapIdx = j; break; }
        }
        if (swapIdx !== -1) {
          [sequence[excessIdx], sequence[swapIdx]] = [sequence[swapIdx], sequence[excessIdx]];
          moved = true;
        }
      }
    }
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
 * Fast preview — builds the arrangement without solvability verification.
 * Used by the designer UI for real-time slider feedback.
 */
export function buildPreviewState(config: StudioGameConfig): StudioGameState {
  const {
    pixelArt,
    maxSelectableItems,
    waitingStandSlots,
    selectableItems,
    launchers,
    activeLauncherCount = 2,
  } = config;
  const blockingOffset = resolveBlockingOffset(config);

  const sortedItems = sortSelectableItemsForSequence(selectableItems);
  const allTiles: StudioTile[] = sortedItems.map((item, idx) => ({
    id: `preview-${idx}`,
    colorType: item.colorType,
    variant: item.variant,
    fruitType: COLOR_TYPE_TO_FRUIT[item.colorType] || 'apple',
    designerLayer: item.layer,
  }));

  const sortedLauncherConfigs = [...launchers].sort((a, b) => a.order - b.order);

  const sequence = buildDeterministicSequence(
    allTiles, sortedLauncherConfigs, activeLauncherCount, blockingOffset, maxSelectableItems,
  );
  const { a: layerA, b: layerB, c: layerC } = distributeToLayersSeeded(sequence, maxSelectableItems);

  const allLaunchers: StudioLauncherState[] = sortedLauncherConfigs.map((l, i) => ({
    id: `preview-launcher-${i}`,
    colorType: l.colorType,
    fruitType: COLOR_TYPE_TO_FRUIT[l.colorType] || 'apple',
    pixelCount: l.pixelCount,
    group: l.group,
    collected: [],
  }));

  return {
    layerA, layerB, layerC,
    waitingStand: [],
    activeLaunchers: allLaunchers.slice(0, activeLauncherCount),
    launcherQueue: allLaunchers.slice(activeLauncherCount),
    pixelArt: pixelArt.map((cell) => ({ ...cell, filled: false })),
    moveCount: 0, matchCount: 0, isWon: false, isLost: false,
    waitingStandSlots, activeLauncherCount,
  };
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

/**
 * Find an active launcher that accepts this tile.
 * Variant-aware: once a launcher has collected 1+ tiles, it only accepts
 * tiles with the same variant. This makes Cherry ≠ Strawberry even though
 * both are Red (colorType=2).
 */
export function findMatchingLauncher(
  colorType: number,
  activeLaunchers: StudioLauncherState[],
  variant?: number,
): StudioLauncherState | null {
  return activeLaunchers.find((l) => {
    if (l.colorType !== colorType || l.collected.length >= 3) return false;
    // If variant matching is active and launcher already has tiles,
    // only accept the same variant
    if (variant !== undefined && l.collected.length > 0) {
      return l.collected[0].variant === variant;
    }
    return true;
  }) || null;
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

      // Variant-aware: if launcher has collected tiles, only match same variant
      const requiredVariant = launcher.collected.length > 0 ? launcher.collected[0].variant : undefined;
      for (let i = 0; i < stand.length && matchingIndices.length < canTake; i++) {
        if (stand[i].colorType === launcher.colorType) {
          if (requiredVariant === undefined || stand[i].variant === requiredVariant) {
            matchingIndices.push(i);
          }
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
  const matchingLauncher = findMatchingLauncher(tile.colorType, state.activeLaunchers, tile.variant);

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
