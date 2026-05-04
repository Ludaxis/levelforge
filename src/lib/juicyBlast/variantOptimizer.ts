import { StudioGameConfig, resolveBlockingOffset } from '@/lib/studioGameLogic';
import {
  JuicyDifficultyReport,
  analyzeJuicyLevel,
  materializeStudioConfig,
} from '@/lib/juicyBlast/analysis';
import { DifficultyElementKey } from '@/lib/juicyBlast/difficultyElements';

export interface ValidatedVariantValues {
  maxSelectableItems: number;
  blockingOffset: number;
  activeLauncherCount: number;
  waitingStandSlots: number;
  moveLimit?: number;
  seed: number;
}

export interface ValidatedVariant {
  variantNumber: number;
  targetScore: number;
  config: StudioGameConfig;
  values: Record<DifficultyElementKey, number | undefined>;
  contentChanges: VariantContentChanges;
  seed: number;
  report: JuicyDifficultyReport;
  accepted: boolean;
  reason?: string;
}

export interface GenerateValidatedVariantsOptions {
  runsPerProfile?: number;
  allowRisky?: boolean;
  baseSeed?: number;
  contentMode?: 'leversOnly' | 'contentAware';
  enforceSeparation?: boolean;
  minimumV5ToV9ScoreGap?: number;
  minimumV1ToV5ScoreGap?: number;
  minimumExtremeWinRateGap?: number;
  minimumAdjacentScoreGap?: number;
  minimumAdjacentWinRateGap?: number;
}

export interface ValidatedVariantSet {
  variants: ValidatedVariant[];
  canExport: boolean;
  baseReport: JuicyDifficultyReport;
  separation: VariantSeparationSummary;
}

export interface VariantContentChanges {
  totalItems: number;
  extraItems: number;
  ambiguityItems: number;
  newColorItems: number;
}

export interface VariantSeparationIssue {
  variantNumber: number;
  comparedTo: number;
  severity: 'blocking' | 'warning';
  reason: string;
  solverDelta: number;
  averageWinRateDelta: number;
}

export interface VariantSeparationSummary {
  passed: boolean;
  v1ToV5ScoreDelta: number;
  v5ToV9ScoreDelta: number;
  v1ToV5AverageWinRateDelta: number;
  v5ToV9AverageWinRateDelta: number;
  smallestAdjacentScoreDelta: number;
  smallestAdjacentAverageWinRateDelta: number;
  issues: VariantSeparationIssue[];
}

const VARIANT_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(v)));
}

function relayerSelectableItems(
  items: StudioGameConfig['selectableItems'],
  maxSelectableItems: number,
): StudioGameConfig['selectableItems'] {
  return [...items]
    .sort((a, b) => a.order - b.order)
    .map((item, index) => ({
      ...item,
      order: index,
      layer:
        index < maxSelectableItems
          ? 'A'
          : index < maxSelectableItems * 2
            ? 'B'
            : 'C',
    }));
}

function emptyContentChanges(config: StudioGameConfig): VariantContentChanges {
  return {
    totalItems: config.selectableItems.length,
    extraItems: 0,
    ambiguityItems: 0,
    newColorItems: 0,
  };
}

function baseValues(config: StudioGameConfig, seed: number): ValidatedVariantValues {
  return {
    maxSelectableItems: config.maxSelectableItems,
    blockingOffset: resolveBlockingOffset(config),
    activeLauncherCount: config.activeLauncherCount ?? 2,
    waitingStandSlots: config.waitingStandSlots,
    moveLimit: config.moveLimit,
    seed,
  };
}

function applyValues(config: StudioGameConfig, values: ValidatedVariantValues): StudioGameConfig {
  const selectableItems = relayerSelectableItems(config.selectableItems, values.maxSelectableItems);
  return {
    ...config,
    maxSelectableItems: values.maxSelectableItems,
    blockingOffset: values.blockingOffset,
    mismatchDepth: values.blockingOffset / 10,
    activeLauncherCount: values.activeLauncherCount,
    waitingStandSlots: values.waitingStandSlots,
    moveLimit: values.moveLimit,
    seed: values.seed,
    selectableItems,
  };
}

function toRecord(values: ValidatedVariantValues): Record<DifficultyElementKey, number | undefined> {
  return {
    maxSelectableItems: values.maxSelectableItems,
    blockingOffset: values.blockingOffset,
    activeLauncherCount: values.activeLauncherCount,
    waitingStandSlots: values.waitingStandSlots,
    moveLimit: values.moveLimit,
  };
}

function buildCandidateValues(
  base: ValidatedVariantValues,
  config: StudioGameConfig,
  variantNumber: number,
  strength: number,
  seed: number,
  basePar: number | null,
): ValidatedVariantValues {
  const direction = Math.sign(variantNumber - 5);
  if (direction === 0) return { ...base, seed };

  const launcherMax = Math.max(1, config.launchers.length);
  const totalItems = config.selectableItems.length;

  if (direction < 0) {
    return {
      maxSelectableItems: clamp(base.maxSelectableItems + strength, 1, 20),
      blockingOffset: clamp(base.blockingOffset - strength, 0, 10),
      activeLauncherCount: clamp(base.activeLauncherCount + Math.floor(strength / 2), 1, launcherMax),
      waitingStandSlots: clamp(base.waitingStandSlots + Math.floor(strength / 3), 1, 8),
      moveLimit: base.moveLimit === undefined ? undefined : base.moveLimit + strength * 2,
      seed,
    };
  }

  const hardMoveLimitBase = base.moveLimit ?? (basePar !== null ? Math.ceil(basePar * 1.35) : undefined);
  return {
    maxSelectableItems: clamp(base.maxSelectableItems - strength, 1, 20),
    blockingOffset: clamp(base.blockingOffset + strength, 0, 10),
    activeLauncherCount: clamp(base.activeLauncherCount - Math.floor(strength / 2), 1, launcherMax),
    waitingStandSlots: clamp(base.waitingStandSlots - Math.floor(strength / 3), 1, 8),
    moveLimit: hardMoveLimitBase === undefined
      ? undefined
      : clamp(hardMoveLimitBase - strength, Math.max(1, basePar ?? 1), Math.max(totalItems + 20, hardMoveLimitBase)),
    seed,
  };
}

function candidateSeeds(baseSeed: number, variantNumber: number): number[] {
  return [
    baseSeed + variantNumber * 101,
    baseSeed + variantNumber * 101 + 17,
    baseSeed + variantNumber * 101 + 37,
  ].map((seed) => seed | 0);
}

function chooseUnusedColorType(usedColorTypes: Set<number>, offset: number): number {
  const allColorTypes = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  const unused = allColorTypes.filter((colorType) => !usedColorTypes.has(colorType));
  if (unused.length > 0) return unused[offset % unused.length];
  return allColorTypes[offset % allColorTypes.length];
}

function addContentPressure(
  config: StudioGameConfig,
  variantNumber: number,
  strength: number,
  seed: number,
): { config: StudioGameConfig; changes: VariantContentChanges } {
  const direction = Math.sign(variantNumber - 5);
  if (direction <= 0 || strength <= 0) {
    return { config, changes: emptyContentChanges(config) };
  }

  const distance = Math.abs(variantNumber - 5);
  const baseItems = [...config.selectableItems].sort((a, b) => a.order - b.order);
  const usedColorTypes = new Set([
    ...config.selectableItems.map((item) => item.colorType),
    ...config.launchers.map((launcher) => launcher.colorType),
  ]);
  const launcherColorTypes = [...new Set(
    [...config.launchers]
      .sort((a, b) => a.order - b.order)
      .map((launcher) => launcher.colorType),
  )];
  const insertionWindow = Math.max(
    1,
    Math.min(baseItems.length, config.maxSelectableItems * 2 + resolveBlockingOffset(config)),
  );
  const extraItems = clamp(distance + strength, 1, Math.min(14, Math.max(4, baseItems.length)));
  const ambiguityItems = Math.ceil(extraItems * 0.6);
  const newColorItems = extraItems - ambiguityItems;
  const extras: StudioGameConfig['selectableItems'] = [];

  for (let i = 0; i < ambiguityItems; i++) {
    const colorType = launcherColorTypes.length > 0
      ? launcherColorTypes[(seed + i + variantNumber) % launcherColorTypes.length]
      : chooseUnusedColorType(usedColorTypes, i);
    extras.push({
      colorType,
      variant: 1 + ((seed + i + strength) % 2),
      order: 0,
    });
  }

  for (let i = 0; i < newColorItems; i++) {
    const colorType = chooseUnusedColorType(usedColorTypes, seed + i + variantNumber);
    usedColorTypes.add(colorType);
    extras.push({
      colorType,
      variant: (seed + i) % 2,
      order: 0,
    });
  }

  let mixed = [...baseItems];
  for (let i = 0; i < extras.length; i++) {
    const insertAt = Math.min(
      mixed.length,
      clamp(
        Math.floor(((seed >>> 0) + i * 7 + strength * 3) % insertionWindow),
        0,
        insertionWindow,
      ),
    );
    mixed = [
      ...mixed.slice(0, insertAt),
      extras[i],
      ...mixed.slice(insertAt),
    ];
  }

  const selectableItems = relayerSelectableItems(mixed, config.maxSelectableItems);

  return {
    config: {
      ...config,
      selectableItems,
    },
    changes: {
      totalItems: selectableItems.length,
      extraItems,
      ambiguityItems,
      newColorItems,
    },
  };
}

function targetScore(baseScore: number, variantNumber: number): number {
  return clamp(baseScore + (variantNumber - 5) * 9, 0, 100);
}

function variantAccepted(report: JuicyDifficultyReport, allowRisky: boolean): boolean {
  if (report.verdict === 'solvable') return true;
  return allowRisky && report.verdict === 'risky';
}

function averageWinRate(report: JuicyDifficultyReport): number {
  return report.winRates.average;
}

function harderDelta(a: ValidatedVariant, b: ValidatedVariant): {
  solverDelta: number;
  averageWinRateDelta: number;
} {
  return {
    solverDelta: b.report.solverScore - a.report.solverScore,
    averageWinRateDelta: averageWinRate(a.report) - averageWinRate(b.report),
  };
}

export function computeVariantSeparation(
  variants: ValidatedVariant[],
  options: GenerateValidatedVariantsOptions = {},
): VariantSeparationSummary {
  const minimumV5ToV9ScoreGap = options.minimumV5ToV9ScoreGap ?? 12;
  const minimumV1ToV5ScoreGap = options.minimumV1ToV5ScoreGap ?? 8;
  const minimumExtremeWinRateGap = options.minimumExtremeWinRateGap ?? 0.18;
  const minimumAdjacentScoreGap = options.minimumAdjacentScoreGap ?? 1;
  const minimumAdjacentWinRateGap = options.minimumAdjacentWinRateGap ?? 0.03;
  const sorted = [...variants].sort((a, b) => a.variantNumber - b.variantNumber);
  const byNumber = new Map(sorted.map((variant) => [variant.variantNumber, variant]));
  const issues: VariantSeparationIssue[] = [];
  const v1 = byNumber.get(1);
  const v5 = byNumber.get(5);
  const v9 = byNumber.get(9);
  let v1ToV5ScoreDelta = 0;
  let v5ToV9ScoreDelta = 0;
  let v1ToV5AverageWinRateDelta = 0;
  let v5ToV9AverageWinRateDelta = 0;
  let smallestAdjacentScoreDelta = Number.POSITIVE_INFINITY;
  let smallestAdjacentAverageWinRateDelta = Number.POSITIVE_INFINITY;

  if (v1 && v5) {
    const delta = harderDelta(v1, v5);
    v1ToV5ScoreDelta = delta.solverDelta;
    v1ToV5AverageWinRateDelta = delta.averageWinRateDelta;
    if (
      delta.solverDelta < minimumV1ToV5ScoreGap &&
      delta.averageWinRateDelta < minimumExtremeWinRateGap
    ) {
      issues.push({
        variantNumber: 1,
        comparedTo: 5,
        severity: 'blocking',
        reason: `v1 is too close to base v5. Add more easier/harder separation before export.`,
        solverDelta: delta.solverDelta,
        averageWinRateDelta: delta.averageWinRateDelta,
      });
    }
  }

  if (v5 && v9) {
    const delta = harderDelta(v5, v9);
    v5ToV9ScoreDelta = delta.solverDelta;
    v5ToV9AverageWinRateDelta = delta.averageWinRateDelta;
    if (
      delta.solverDelta < minimumV5ToV9ScoreGap &&
      delta.averageWinRateDelta < minimumExtremeWinRateGap
    ) {
      issues.push({
        variantNumber: 9,
        comparedTo: 5,
        severity: 'blocking',
        reason: `v9 is too close to base v5. A bored-player DDA push would not feel meaningfully harder.`,
        solverDelta: delta.solverDelta,
        averageWinRateDelta: delta.averageWinRateDelta,
      });
    }
  }

  for (let i = 1; i < sorted.length; i++) {
    const previous = sorted[i - 1];
    const current = sorted[i];
    const delta = harderDelta(previous, current);
    smallestAdjacentScoreDelta = Math.min(smallestAdjacentScoreDelta, delta.solverDelta);
    smallestAdjacentAverageWinRateDelta = Math.min(
      smallestAdjacentAverageWinRateDelta,
      delta.averageWinRateDelta,
    );
    if (
      delta.solverDelta < minimumAdjacentScoreGap &&
      delta.averageWinRateDelta < minimumAdjacentWinRateGap
    ) {
      issues.push({
        variantNumber: current.variantNumber,
        comparedTo: previous.variantNumber,
        severity: 'warning',
        reason: `Adjacent variants are nearly flat for bot players.`,
        solverDelta: delta.solverDelta,
        averageWinRateDelta: delta.averageWinRateDelta,
      });
    }
  }

  if (!Number.isFinite(smallestAdjacentScoreDelta)) smallestAdjacentScoreDelta = 0;
  if (!Number.isFinite(smallestAdjacentAverageWinRateDelta)) {
    smallestAdjacentAverageWinRateDelta = 0;
  }

  return {
    passed: !issues.some((issue) => issue.severity === 'blocking'),
    v1ToV5ScoreDelta,
    v5ToV9ScoreDelta,
    v1ToV5AverageWinRateDelta,
    v5ToV9AverageWinRateDelta,
    smallestAdjacentScoreDelta,
    smallestAdjacentAverageWinRateDelta,
    issues,
  };
}

function chooseCandidate(
  candidates: ValidatedVariant[],
  target: number,
  allowRisky: boolean,
): ValidatedVariant {
  const ranked = [...candidates].sort((a, b) => {
    const aAccepted = variantAccepted(a.report, allowRisky) ? 0 : 1;
    const bAccepted = variantAccepted(b.report, allowRisky) ? 0 : 1;
    if (aAccepted !== bAccepted) return aAccepted - bAccepted;
    return Math.abs(a.report.solverScore - target) - Math.abs(b.report.solverScore - target);
  });
  return ranked[0];
}

export function generateValidatedVariants(
  baseConfig: StudioGameConfig,
  options: GenerateValidatedVariantsOptions = {},
): ValidatedVariantSet {
  const runsPerProfile = options.runsPerProfile ?? 12;
  const allowRisky = options.allowRisky ?? true;
  const baseSeed = options.baseSeed ?? baseConfig.seed ?? 42;
  const contentMode = options.contentMode ?? 'leversOnly';
  const enforceSeparation = options.enforceSeparation ?? contentMode === 'contentAware';
  const normalizedBaseConfig = {
    ...baseConfig,
    seed: baseSeed,
    selectableItems: relayerSelectableItems(baseConfig.selectableItems, baseConfig.maxSelectableItems),
  };
  const baseReport = analyzeJuicyLevel(normalizedBaseConfig, { monteCarloRuns: runsPerProfile });
  const base = baseValues(normalizedBaseConfig, baseSeed);
  const variants: ValidatedVariant[] = [];

  for (const variantNumber of VARIANT_NUMBERS) {
    const target = targetScore(baseReport.solverScore, variantNumber);

    if (variantNumber === 5) {
      const materialized = materializeStudioConfig(normalizedBaseConfig, baseSeed);
      variants.push({
        variantNumber,
        targetScore: target,
        config: materialized,
        values: toRecord(base),
        contentChanges: emptyContentChanges(materialized),
        seed: baseSeed,
        report: baseReport,
        accepted: variantAccepted(baseReport, allowRisky),
        reason: baseReport.verdict === 'stuck' ? 'Base level is stuck.' : undefined,
      });
      continue;
    }

    const distance = Math.abs(variantNumber - 5);
    const candidates: ValidatedVariant[] = [];
    const strengths = Array.from(
      { length: distance + 2 },
      (_, idx) => idx,
    );

    for (const strength of strengths) {
      for (const seed of candidateSeeds(baseSeed, variantNumber)) {
        const values = buildCandidateValues(base, normalizedBaseConfig, variantNumber, strength, seed, baseReport.parMoves);
        const leverConfig = applyValues(normalizedBaseConfig, values);
        const { config: candidateConfig, changes } = contentMode === 'contentAware'
          ? addContentPressure(leverConfig, variantNumber, Math.max(1, strength), seed)
          : { config: leverConfig, changes: emptyContentChanges(leverConfig) };
        const materialized = materializeStudioConfig(candidateConfig, seed);
        const report = analyzeJuicyLevel(materialized, { monteCarloRuns: runsPerProfile });
        const accepted = variantAccepted(report, allowRisky);
        candidates.push({
          variantNumber,
          targetScore: target,
          config: materialized,
          values: toRecord(values),
          contentChanges: changes,
          seed,
          report,
          accepted,
          reason: accepted ? undefined : `Solver verdict is ${report.verdict}.`,
        });
      }
    }

    variants.push(chooseCandidate(candidates, target, allowRisky));
  }

  const separation = computeVariantSeparation(variants, options);

  return {
    variants,
    canExport:
      variants.every((variant) => variant.accepted) &&
      (!enforceSeparation || separation.passed),
    baseReport,
    separation,
  };
}
