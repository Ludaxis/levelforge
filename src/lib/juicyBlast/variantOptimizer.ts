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
  seed: number;
  report: JuicyDifficultyReport;
  accepted: boolean;
  reason?: string;
}

export interface GenerateValidatedVariantsOptions {
  runsPerProfile?: number;
  allowRisky?: boolean;
  baseSeed?: number;
}

export interface ValidatedVariantSet {
  variants: ValidatedVariant[];
  canExport: boolean;
  baseReport: JuicyDifficultyReport;
}

const VARIANT_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(v)));
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
  return {
    ...config,
    maxSelectableItems: values.maxSelectableItems,
    blockingOffset: values.blockingOffset,
    mismatchDepth: values.blockingOffset / 10,
    activeLauncherCount: values.activeLauncherCount,
    waitingStandSlots: values.waitingStandSlots,
    moveLimit: values.moveLimit,
    seed: values.seed,
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

function targetScore(baseScore: number, variantNumber: number): number {
  return clamp(baseScore + (variantNumber - 5) * 9, 0, 100);
}

function variantAccepted(report: JuicyDifficultyReport, allowRisky: boolean): boolean {
  if (report.verdict === 'solvable') return true;
  return allowRisky && report.verdict === 'risky';
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
  const normalizedBaseConfig = {
    ...baseConfig,
    seed: baseSeed,
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
        const candidateConfig = applyValues(normalizedBaseConfig, values);
        const materialized = materializeStudioConfig(candidateConfig, seed);
        const report = analyzeJuicyLevel(candidateConfig, { monteCarloRuns: runsPerProfile });
        const accepted = variantAccepted(report, allowRisky);
        candidates.push({
          variantNumber,
          targetScore: target,
          config: materialized,
          values: toRecord(values),
          seed,
          report,
          accepted,
          reason: accepted ? undefined : `Solver verdict is ${report.verdict}.`,
        });
      }
    }

    variants.push(chooseCandidate(candidates, target, allowRisky));
  }

  return {
    variants,
    canExport: variants.every((variant) => variant.accepted),
    baseReport,
  };
}
