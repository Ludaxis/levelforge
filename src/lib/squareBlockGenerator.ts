import {
  DesignedLevel,
  LevelMetrics,
  SquareBlock,
  calculateFlowZone,
  getSawtoothPosition,
} from '@/types/squareBlock';
import {
  GridCoord,
  SquareDirection,
  SQUARE_DIRECTIONS,
  gridAdd,
  gridKey,
  isInBounds,
  getOppositeDirection,
} from '@/lib/squareGrid';
import {
  DifficultyBreakdown,
  PuzzleAnalysis,
  analyzePuzzle,
  calculateDifficultyScore,
  quickSolve,
} from '@/lib/puzzleAnalyzer';
import { sanitizeSquareBlocksForDesigner } from '@/lib/squareBlockExport';

export interface GenerationMechanics {
  gate: boolean;
  ice: boolean;
  mirror: boolean;
  gatePercent?: number;
  icePercent?: number;
  mirrorPercent?: number;
}

type MechanicKind = 'gate' | 'ice' | 'mirror';

export interface MechanicTargetCounts {
  gate: number;
  ice: number;
  mirror: number;
  normal: number;
}

export interface TargetedSquareBlockGenerationOptions {
  sourceRows: number;
  sourceCols: number;
  sourceBlocks: SquareBlock[];
  targetRows: number;
  targetCols: number;
  targetScore: number;
  mechanics: GenerationMechanics;
  tolerance?: number;
  maxAttempts?: number;
  rng?: () => number;
}

export interface GeneratedSquareBlockLevel {
  rows: number;
  cols: number;
  blocks: SquareBlock[];
  analysis: PuzzleAnalysis;
  difficultyBreakdown: DifficultyBreakdown;
  scoreDelta: number;
  attempts: number;
  hitTarget: boolean;
  mechanicCounts: {
    gate: number;
    ice: number;
    mirror: number;
  };
}

export interface BulkSquareBlockGenerationOptions extends Omit<TargetedSquareBlockGenerationOptions, 'targetScore'> {
  startLevelNumber: number;
  count: number;
  getTargetScore: (levelNumber: number) => number;
}

export interface BulkSquareBlockGenerationResult {
  levelNumber: number;
  targetScore: number;
  generation: GeneratedSquareBlockLevel;
}

const DIRECTIONS: SquareDirection[] = ['N', 'E', 'S', 'W'];
const MECHANIC_KINDS: MechanicKind[] = ['gate', 'ice', 'mirror'];
const DEFAULT_TOLERANCE = 3;
const DEFAULT_MAX_ATTEMPTS = 220;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function randomInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

function getMechanicPercent(mechanics: GenerationMechanics, kind: MechanicKind): number {
  if (!mechanics[kind]) return 0;

  const raw = mechanics[`${kind}Percent`];
  return Number.isFinite(raw) ? clamp(Number(raw), 0, 100) : 0;
}

function hasExplicitMechanicPercent(mechanics: GenerationMechanics): boolean {
  return MECHANIC_KINDS.some((kind) => Number.isFinite(mechanics[`${kind}Percent`]));
}

export function calculateMechanicTargetCounts(
  blockCount: number,
  mechanics: GenerationMechanics,
): MechanicTargetCounts {
  const totalBlocks = Math.max(0, Math.round(blockCount));
  const rawPercents = MECHANIC_KINDS.map((kind) => ({
    kind,
    percent: getMechanicPercent(mechanics, kind),
  }));
  const rawTotalPercent = rawPercents.reduce((sum, entry) => sum + entry.percent, 0);
  const scale = rawTotalPercent > 100 ? 100 / rawTotalPercent : 1;

  const targets = rawPercents.map((entry) => {
    const rawCount = totalBlocks * entry.percent * scale / 100;
    return {
      ...entry,
      rawCount,
      count: Math.round(rawCount),
    };
  });

  let allocated = targets.reduce((sum, entry) => sum + entry.count, 0);
  const roundedUpByMost = [...targets].sort((a, b) => (b.count - b.rawCount) - (a.count - a.rawCount));
  for (const target of roundedUpByMost) {
    if (allocated <= totalBlocks) break;
    if (target.count <= 0) continue;
    target.count -= 1;
    allocated -= 1;
  }

  const counts = targets.reduce(
    (acc, entry) => ({ ...acc, [entry.kind]: entry.count }),
    { gate: 0, ice: 0, mirror: 0 } as Record<MechanicKind, number>,
  );
  const mechanicTotal = counts.gate + counts.ice + counts.mirror;

  return {
    gate: counts.gate,
    ice: counts.ice,
    mirror: counts.mirror,
    normal: Math.max(0, totalBlocks - mechanicTotal),
  };
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function createGeneratedId(prefix: string, index: number, rng: () => number): string {
  return `${prefix}-${Date.now()}-${index}-${Math.floor(rng() * 1_000_000)}`;
}

function mapSourceCoordToTarget(
  coord: GridCoord,
  sourceRows: number,
  sourceCols: number,
  targetRows: number,
  targetCols: number,
): GridCoord {
  return {
    row: clamp(Math.floor(((coord.row + 0.5) / sourceRows) * targetRows), 0, targetRows - 1),
    col: clamp(Math.floor(((coord.col + 0.5) / sourceCols) * targetCols), 0, targetCols - 1),
  };
}

function chooseDominantColor(colors: Map<string, number>, rng: () => number): string {
  const ranked = Array.from(colors.entries()).sort((a, b) => b[1] - a[1]);
  const topCount = ranked[0]?.[1] ?? 0;
  const tied = ranked.filter(([, count]) => count === topCount);
  return tied[Math.floor(rng() * tied.length)]?.[0] ?? '#06b6d4';
}

export function resizeSquareBlockArtwork(
  sourceBlocks: SquareBlock[],
  sourceRows: number,
  sourceCols: number,
  targetRows: number,
  targetCols: number,
  rng: () => number = Math.random,
): SquareBlock[] {
  if (sourceRows <= 0 || sourceCols <= 0 || targetRows <= 0 || targetCols <= 0) {
    return [];
  }

  const buckets = new Map<string, { coord: GridCoord; colors: Map<string, number> }>();

  for (const block of sourceBlocks) {
    const coord = mapSourceCoordToTarget(block.coord, sourceRows, sourceCols, targetRows, targetCols);
    const key = gridKey(coord);
    const bucket = buckets.get(key) ?? { coord, colors: new Map<string, number>() };
    const color = (block.color || '#06b6d4').toLowerCase();
    bucket.colors.set(color, (bucket.colors.get(color) ?? 0) + 1);
    buckets.set(key, bucket);
  }

  return Array.from(buckets.values())
    .sort((a, b) => a.coord.row - b.coord.row || a.coord.col - b.coord.col)
    .map((bucket, index) => ({
      id: createGeneratedId('art', index, rng),
      coord: bucket.coord,
      direction: 'E',
      color: chooseDominantColor(bucket.colors, rng),
    }));
}

function countInitialBlockers(
  coord: GridCoord,
  direction: SquareDirection,
  fullBlocks: Map<string, SquareBlock>,
  rows: number,
  cols: number,
): number {
  const dirVec = SQUARE_DIRECTIONS[direction];
  let current = gridAdd(coord, dirVec);
  let blockers = 0;

  while (isInBounds(current, rows, cols)) {
    if (fullBlocks.has(gridKey(current))) blockers++;
    current = gridAdd(current, dirVec);
  }

  return blockers;
}

function distanceToEdgeInDirection(
  coord: GridCoord,
  direction: SquareDirection,
  rows: number,
  cols: number,
): number {
  switch (direction) {
    case 'N':
      return coord.row;
    case 'S':
      return rows - 1 - coord.row;
    case 'W':
      return coord.col;
    case 'E':
      return cols - 1 - coord.col;
  }
}

function directionIsClear(
  coord: GridCoord,
  direction: SquareDirection,
  remaining: Map<string, SquareBlock>,
  rows: number,
  cols: number,
): boolean {
  const dirVec = SQUARE_DIRECTIONS[direction];
  let current = gridAdd(coord, dirVec);

  while (isInBounds(current, rows, cols)) {
    if (remaining.has(gridKey(current))) return false;
    current = gridAdd(current, dirVec);
  }

  return true;
}

function getDistanceToNearestEdge(coord: GridCoord, rows: number, cols: number): number {
  return Math.min(coord.row, rows - 1 - coord.row, coord.col, cols - 1 - coord.col);
}

function createCandidateOrder(
  blocks: SquareBlock[],
  rows: number,
  cols: number,
  targetScore: number,
  rng: () => number,
): SquareBlock[] | null {
  const remaining = new Map<string, SquareBlock>();
  blocks.forEach((block) => remaining.set(gridKey(block.coord), block));

  const order: SquareBlock[] = [];

  while (remaining.size > 0) {
    const candidates = Array.from(remaining.values())
      .filter((block) => DIRECTIONS.some((direction) => directionIsClear(block.coord, direction, remaining, rows, cols)))
      .map((block) => ({
        block,
        distance: getDistanceToNearestEdge(block.coord, rows, cols),
        random: rng(),
      }));

    if (candidates.length === 0) return null;

    candidates.sort((a, b) => {
      if (targetScore < 30) return a.distance - b.distance || a.random - b.random;
      if (targetScore > 65) return b.distance - a.distance || a.random - b.random;
      return a.random - b.random;
    });

    const poolSize = targetScore < 30 || targetScore > 65
      ? Math.min(Math.max(1, Math.ceil(candidates.length * 0.35)), candidates.length)
      : candidates.length;
    const chosen = candidates[Math.floor(rng() * poolSize)].block;
    order.push(chosen);
    remaining.delete(gridKey(chosen.coord));
  }

  return order;
}

function chooseDirection(
  block: SquareBlock,
  available: SquareDirection[],
  fullBlocks: Map<string, SquareBlock>,
  rows: number,
  cols: number,
  targetScore: number,
  rng: () => number,
): SquareDirection {
  const scored = available.map((direction) => ({
    direction,
    blockers: countInitialBlockers(block.coord, direction, fullBlocks, rows, cols),
    edgeDistance: distanceToEdgeInDirection(block.coord, direction, rows, cols),
    random: rng(),
  }));

  scored.sort((a, b) => {
    if (targetScore < 30) return a.blockers - b.blockers || a.edgeDistance - b.edgeDistance || a.random - b.random;
    if (targetScore > 55) return b.blockers - a.blockers || b.edgeDistance - a.edgeDistance || a.random - b.random;
    return Math.abs(a.blockers - 1) - Math.abs(b.blockers - 1) || a.random - b.random;
  });

  const poolSize = targetScore < 35 || targetScore > 60 ? Math.min(2, scored.length) : scored.length;
  return scored[Math.floor(rng() * poolSize)].direction;
}

function isGateSafe(block: SquareBlock, orderIndex: Map<string, number>, index: number): boolean {
  let hasNeighbor = false;
  for (const dir of DIRECTIONS) {
    const neighborKey = gridKey(gridAdd(block.coord, SQUARE_DIRECTIONS[dir]));
    const neighborIndex = orderIndex.get(neighborKey);
    if (neighborIndex === undefined) continue;
    hasNeighbor = true;
    if (neighborIndex > index) return false;
  }
  return hasNeighbor;
}

function maybeApplyMechanics(
  blocks: SquareBlock[],
  order: SquareBlock[],
  actualDirections: Map<string, SquareDirection>,
  mechanics: GenerationMechanics,
  targetScore: number,
  rng: () => number,
): SquareBlock[] {
  const orderIndex = new Map<string, number>();
  order.forEach((block, index) => orderIndex.set(gridKey(block.coord), index));

  if (hasExplicitMechanicPercent(mechanics)) {
    return applyMechanicTargets(blocks, orderIndex, actualDirections, mechanics, rng);
  }

  const intensity = clamp(targetScore / 100, 0, 1);
  const gateChance = mechanics.gate ? 0.02 + intensity * 0.18 : 0;
  const iceChance = mechanics.ice ? 0.02 + intensity * 0.16 : 0;
  const mirrorChance = mechanics.mirror ? 0.03 + intensity * 0.16 : 0;

  const result: SquareBlock[] = blocks.map((block): SquareBlock => {
    const key = gridKey(block.coord);
    const index = orderIndex.get(key) ?? 0;
    const actualDirection = actualDirections.get(key) ?? 'E';
    const gateSafe = isGateSafe(block, orderIndex, index);
    const useGate = gateSafe && rng() < gateChance;
    const useIce = !useGate && index > 0 && rng() < iceChance;
    const useMirror = rng() < mirrorChance;
    const displayedDirection = useMirror ? getOppositeDirection(actualDirection) : actualDirection;

    return {
      ...block,
      direction: displayedDirection,
      locked: useGate || undefined,
      iceCount: useIce ? randomInt(rng, Math.max(1, Math.floor(index * 0.25)), Math.max(1, index)) : undefined,
      mirror: useMirror || undefined,
    };
  });

  const addRequiredMechanic = (
    predicate: (block: SquareBlock) => boolean,
    apply: (block: SquareBlock) => SquareBlock,
    candidates: SquareBlock[],
  ) => {
    const currentHasMechanic = result.some(predicate);
    if (currentHasMechanic || candidates.length === 0) return;

    const candidate = candidates[Math.floor(rng() * candidates.length)];
    const key = gridKey(candidate.coord);
    const idx = result.findIndex((block) => gridKey(block.coord) === key);
    if (idx >= 0) result[idx] = apply(result[idx]);
  };

  if (mechanics.gate) {
    const candidates = result.filter((block) => isGateSafe(block, orderIndex, orderIndex.get(gridKey(block.coord)) ?? 0) && !block.iceCount);
    addRequiredMechanic(
      (block) => block.locked === true,
      (block) => ({ ...block, locked: true, iceCount: undefined }),
      candidates,
    );
  }

  if (mechanics.ice) {
    const candidates = result.filter((block) => {
      const index = orderIndex.get(gridKey(block.coord)) ?? 0;
      return index > 0 && !block.locked;
    });
    addRequiredMechanic(
      (block) => block.iceCount !== undefined && block.iceCount > 0,
      (block) => {
        const index = orderIndex.get(gridKey(block.coord)) ?? 1;
        return { ...block, iceCount: randomInt(rng, 1, Math.max(1, index)), locked: undefined };
      },
      candidates,
    );
  }

  if (mechanics.mirror) {
    addRequiredMechanic(
      (block) => block.mirror === true,
      (block) => {
        const actualDirection = actualDirections.get(gridKey(block.coord)) ?? block.direction as SquareDirection;
        return { ...block, direction: getOppositeDirection(actualDirection), mirror: true };
      },
      result,
    );
  }

  return result;
}

function applyMechanicTargets(
  blocks: SquareBlock[],
  orderIndex: Map<string, number>,
  actualDirections: Map<string, SquareDirection>,
  mechanics: GenerationMechanics,
  rng: () => number,
): SquareBlock[] {
  const targets = calculateMechanicTargetCounts(blocks.length, mechanics);
  const used = new Set<string>();
  const result = blocks.map((block): SquareBlock => {
    const actualDirection = actualDirections.get(gridKey(block.coord)) ?? 'E';
    return {
      ...block,
      direction: actualDirection,
      locked: undefined,
      iceCount: undefined,
      mirror: undefined,
    };
  });

  const getUnusedCandidates = (predicate: (block: SquareBlock) => boolean) =>
    result.filter((block) => !used.has(gridKey(block.coord)) && predicate(block));

  const choose = (candidates: SquareBlock[], count: number) => shuffle(candidates, rng).slice(0, Math.max(0, count));

  for (const block of choose(
    getUnusedCandidates((candidate) => {
      const index = orderIndex.get(gridKey(candidate.coord)) ?? 0;
      return isGateSafe(candidate, orderIndex, index);
    }),
    targets.gate,
  )) {
    const key = gridKey(block.coord);
    const index = result.findIndex((candidate) => gridKey(candidate.coord) === key);
    if (index < 0) continue;
    used.add(key);
    result[index] = {
      ...result[index],
      locked: true,
      iceCount: undefined,
      mirror: undefined,
    };
  }

  for (const block of choose(
    getUnusedCandidates((candidate) => (orderIndex.get(gridKey(candidate.coord)) ?? 0) > 0),
    targets.ice,
  )) {
    const key = gridKey(block.coord);
    const index = result.findIndex((candidate) => gridKey(candidate.coord) === key);
    if (index < 0) continue;
    const orderPosition = Math.max(1, orderIndex.get(key) ?? 1);
    used.add(key);
    result[index] = {
      ...result[index],
      locked: undefined,
      iceCount: randomInt(rng, Math.max(1, Math.floor(orderPosition * 0.25)), orderPosition),
      mirror: undefined,
    };
  }

  for (const block of choose(getUnusedCandidates(() => true), targets.mirror)) {
    const key = gridKey(block.coord);
    const index = result.findIndex((candidate) => gridKey(candidate.coord) === key);
    if (index < 0) continue;
    const actualDirection = actualDirections.get(key) ?? result[index].direction as SquareDirection;
    used.add(key);
    result[index] = {
      ...result[index],
      direction: getOppositeDirection(actualDirection),
      locked: undefined,
      iceCount: undefined,
      mirror: true,
    };
  }

  return result;
}

function buildCandidate(
  artworkBlocks: SquareBlock[],
  rows: number,
  cols: number,
  targetScore: number,
  mechanics: GenerationMechanics,
  rng: () => number,
): SquareBlock[] | null {
  const order = createCandidateOrder(artworkBlocks, rows, cols, targetScore, rng);
  if (!order) return null;
  const remaining = new Map<string, SquareBlock>();
  const fullBlocks = new Map<string, SquareBlock>();
  artworkBlocks.forEach((block) => {
    remaining.set(gridKey(block.coord), block);
    fullBlocks.set(gridKey(block.coord), block);
  });

  const actualDirections = new Map<string, SquareDirection>();
  const assigned = new Map<string, SquareBlock>();

  for (const block of order) {
    const key = gridKey(block.coord);
    const available = shuffle(DIRECTIONS, rng).filter((direction) =>
      directionIsClear(block.coord, direction, remaining, rows, cols)
    );

    if (available.length === 0) return null;

    const actualDirection = chooseDirection(block, available, fullBlocks, rows, cols, targetScore, rng);
    actualDirections.set(key, actualDirection);
    assigned.set(key, { ...block, direction: actualDirection });
    remaining.delete(key);
  }

  const orderedBlocks = artworkBlocks.map((block) => assigned.get(gridKey(block.coord)) ?? block);
  return maybeApplyMechanics(orderedBlocks, order, actualDirections, mechanics, targetScore, rng);
}

function countMechanics(blocks: SquareBlock[]): GeneratedSquareBlockLevel['mechanicCounts'] {
  return {
    gate: blocks.filter((block) => block.locked).length,
    ice: blocks.filter((block) => block.iceCount !== undefined && block.iceCount > 0).length,
    mirror: blocks.filter((block) => block.mirror === true).length,
  };
}

function analyzeCandidate(
  blocks: SquareBlock[],
  rows: number,
  cols: number,
): { analysis: PuzzleAnalysis; breakdown: DifficultyBreakdown } | null {
  const blockMap = new Map<string, SquareBlock>();
  blocks.forEach((block) => blockMap.set(gridKey(block.coord), block));

  const quick = quickSolve(blockMap, new Set(), rows, cols);
  if (!quick.solvable) return null;

  const analysis = analyzePuzzle(blockMap, new Set(), rows, cols);
  if (!analysis.solvable) return null;

  return {
    analysis,
    breakdown: calculateDifficultyScore(analysis),
  };
}

export function generateTargetedSquareBlockLevel(
  options: TargetedSquareBlockGenerationOptions,
): GeneratedSquareBlockLevel | null {
  const rng = options.rng ?? Math.random;
  const tolerance = options.tolerance ?? DEFAULT_TOLERANCE;
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const targetRows = clamp(Math.round(options.targetRows), 3, 50);
  const targetCols = clamp(Math.round(options.targetCols), 3, 50);
  const targetScore = clamp(Math.round(options.targetScore), 0, 100);

  const artworkBlocks = resizeSquareBlockArtwork(
    sanitizeSquareBlocksForDesigner(options.sourceBlocks),
    options.sourceRows,
    options.sourceCols,
    targetRows,
    targetCols,
    rng,
  );

  if (artworkBlocks.length === 0) return null;

  let best: GeneratedSquareBlockLevel | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const candidate = buildCandidate(
      artworkBlocks,
      targetRows,
      targetCols,
      targetScore,
      options.mechanics,
      rng,
    );
    if (!candidate) continue;

    const analyzed = analyzeCandidate(candidate, targetRows, targetCols);
    if (!analyzed) continue;

    const scoreDelta = Math.abs(analyzed.breakdown.score - targetScore);
    const generated: GeneratedSquareBlockLevel = {
      rows: targetRows,
      cols: targetCols,
      blocks: sanitizeSquareBlocksForDesigner(candidate),
      analysis: analyzed.analysis,
      difficultyBreakdown: analyzed.breakdown,
      scoreDelta,
      attempts: attempt,
      hitTarget: scoreDelta <= tolerance,
      mechanicCounts: countMechanics(candidate),
    };

    if (!best || generated.scoreDelta < best.scoreDelta) {
      best = generated;
    }

    if (generated.hitTarget) {
      return generated;
    }
  }

  return best;
}

export function generateBulkSquareBlockLevels(
  options: BulkSquareBlockGenerationOptions,
): BulkSquareBlockGenerationResult[] {
  const results: BulkSquareBlockGenerationResult[] = [];
  const count = clamp(Math.round(options.count), 1, 500);

  for (let i = 0; i < count; i++) {
    const levelNumber = options.startLevelNumber + i;
    const targetScore = options.getTargetScore(levelNumber);
    const generation = generateTargetedSquareBlockLevel({
      ...options,
      targetScore,
    });

    if (generation) {
      results.push({ levelNumber, targetScore, generation });
    }
  }

  return results;
}

export function createDesignedSquareBlockLevelFromGeneration(
  generation: GeneratedSquareBlockLevel,
  levelNumber: number,
  name = `Level ${levelNumber}`,
): DesignedLevel {
  const blocks = sanitizeSquareBlocksForDesigner(generation.blocks);
  const metrics: LevelMetrics = {
    cellCount: blocks.length,
    holeCount: 0,
    lockedCount: generation.mechanicCounts.gate,
    icedCount: generation.mechanicCounts.ice,
    mirrorCount: generation.mechanicCounts.mirror,
    gridSize: generation.rows * generation.cols,
    density: generation.analysis.density,
    initialClearability: generation.analysis.initialClearability,
    solutionCount: generation.analysis.solutionCount,
    avgBranchingFactor: generation.analysis.avgBranchingFactor,
    forcedMoveRatio: generation.analysis.forcedMoveRatio,
    solutionDepth: generation.analysis.solutionDepth,
    difficultyScore: generation.difficultyBreakdown.score,
    difficulty: generation.difficultyBreakdown.tier,
    flowZone: calculateFlowZone(generation.difficultyBreakdown.tier, levelNumber),
    sawtoothPosition: getSawtoothPosition(levelNumber),
  };

  return {
    id: `level-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name,
    levelNumber,
    rows: generation.rows,
    cols: generation.cols,
    blocks,
    gameMode: 'classic',
    metrics,
    createdAt: Date.now(),
  };
}
