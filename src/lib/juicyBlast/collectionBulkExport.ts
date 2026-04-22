import JSZip from 'jszip';
import { DesignedFruitMatchLevel } from '@/types/fruitMatch';
import {
  COLOR_TYPE_TO_HEX,
  FRUIT_TO_COLOR_TYPE,
  exportStudioLevel,
} from '@/lib/juicyBlastExport';
import { calculateColorVariantDensity } from '@/lib/fruitMatchUtils';
import { calculateStudioDifficulty, computeParMoves } from '@/lib/studioGameLogic';
import {
  resolveVariants,
  type VariantRule,
  type VariantAdjustment,
  type VariantError,
  type BaseLevelValues,
} from './variantResolve';

/**
 * Recompute layer assignment (A/B/C) from item order given a variant's
 * maxSelectableItems. Layer A fills positions [0, MSI), Layer B fills
 * [MSI, 2*MSI), Layer C is everything else.
 */
function layersForMSI(
  items: DesignedFruitMatchLevel['studioSelectableItems'],
  msi: number
): DesignedFruitMatchLevel['studioSelectableItems'] {
  if (!items) return items;
  const sorted = [...items].sort((a, b) => a.order - b.order);
  return sorted.map((item, idx) => ({
    ...item,
    layer: (idx < msi ? 'A' : idx < 2 * msi ? 'B' : 'C') as 'A' | 'B' | 'C',
  }));
}

export interface CollectionBulkOptions {
  /** If true, files are placed in `Level{N}/` folders inside the zip. */
  nested: boolean;
}

export interface LevelBulkReport {
  levelNumber: number;
  levelName: string;
  baseVariantNumber: number;
  variantCount: number;
  adjustments: VariantAdjustment[];
  errors: VariantError[];
  /** True when variants were produced despite auto-clamps. */
  produced: boolean;
}

export interface CollectionBulkResult {
  zipBlob: Blob;
  totalFiles: number;
  totalLevels: number;
  totalAdjustments: number;
  totalErrors: number;
  levelsWithErrors: number;
  reports: LevelBulkReport[];
}

/**
 * Infer the base-variant number from a level's `name`, e.g.
 * `Level23_5` → 5, `Level42_1` → 1. Defaults to 5 when absent — the
 * standard base in Juicy Blast's 9-variant curve.
 */
function parseBaseVariant(name: string): number {
  const match = /_(\d+)\s*$/.exec(name);
  if (!match) return 5;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 0 ? n : 5;
}

function levelToBaseValues(level: DesignedFruitMatchLevel): BaseLevelValues {
  const launcherCount = level.studioLaunchers?.length ?? 0;
  return {
    maxSelectableItems: level.studioMaxSelectableItems ?? 10,
    blockingOffset: level.studioBlockingOffset ?? 0,
    activeLauncherCount: level.studioActiveLauncherCount ?? 2,
    waitingStandSlots: level.studioWaitingStandSlots ?? 5,
    moveLimit: level.studioMoveLimit,
    maxActiveLaunchers: Math.max(1, Math.min(3, launcherCount || 1)),
  };
}

function buildVariantExportData(
  level: DesignedFruitMatchLevel,
  variantNumber: number,
  values: Record<string, number | undefined>
): object | null {
  if (!level.studioSelectableItems || !level.studioLaunchers) return null;

  const paletteSet = new Set<string>();
  for (const cell of level.pixelArt) {
    const ct = FRUIT_TO_COLOR_TYPE[cell.fruitType];
    paletteSet.add(COLOR_TYPE_TO_HEX[ct] || '888888');
  }

  const levelId = `Level${level.levelNumber}_${variantNumber}`;
  const msi = values.maxSelectableItems ?? level.studioMaxSelectableItems ?? 10;
  const bo = values.blockingOffset ?? level.studioBlockingOffset ?? 0;

  // Re-layer items so Layer A/B/C match the variant's MSI. Items keep their
  // `order`; only the `layer` field is recomputed.
  const relayered = layersForMSI(level.studioSelectableItems, msi) ?? [];

  // Recompute DifficultyScore from the variant's levers — the base score is
  // stale once MSI/BO move.
  const uniqueColors = new Set(relayered.map((s) => s.colorType)).size;
  const uniqueVariants = new Set(
    relayered.map((s) => `${s.colorType}:${s.variant}`)
  ).size;
  const colorVariantDensity = calculateColorVariantDensity(
    level.pixelArt,
    relayered
  );
  const variantDifficulty = calculateStudioDifficulty({
    totalPixels: level.pixelArt.length,
    uniqueColors,
    groupCount: new Set(level.pixelArt.map((c) => c.groupId ?? 1)).size,
    launcherCount: level.studioLaunchers.length,
    maxSelectableItems: msi,
    totalTiles: relayered.length,
    blockingOffset: bo,
    uniqueVariants,
    colorVariantDensity,
  });

  // Par moves — greedy solver with a deterministic fallback when the level
  // is flagged unsolvable, so every export always carries a par number.
  const solvedPar = computeParMoves({
    pixelArt: level.pixelArt,
    pixelArtWidth: level.pixelArtWidth,
    pixelArtHeight: level.pixelArtHeight,
    maxSelectableItems: msi,
    waitingStandSlots:
      values.waitingStandSlots ?? level.studioWaitingStandSlots ?? 5,
    selectableItems: relayered.map((s) => ({
      colorType: s.colorType,
      variant: s.variant,
      order: s.order,
      layer: s.layer,
    })),
    launchers: level.studioLaunchers.map((l) => ({
      colorType: l.colorType,
      pixelCount: l.pixelCount,
      group: l.group,
      order: l.order,
    })),
    activeLauncherCount:
      values.activeLauncherCount ?? level.studioActiveLauncherCount ?? 2,
    blockingOffset: bo,
    seed: level.studioSeed,
    moveLimit: values.moveLimit ?? level.studioMoveLimit,
  });
  const parMoves = solvedPar ?? relayered.length + bo;

  return exportStudioLevel({
    palette: Array.from(paletteSet),
    levelId,
    levelIndex: level.levelNumber,
    difficulty: variantDifficulty.tier,
    graphicId: `graphic_${level.pixelArtWidth}x${level.pixelArtHeight}`,
    width: level.pixelArtWidth,
    height: level.pixelArtHeight,
    pixels: level.pixelArt.map((cell) => {
      const ct = FRUIT_TO_COLOR_TYPE[cell.fruitType];
      return {
        row: cell.row,
        col: cell.col,
        colorType: ct,
        colorGroup: ct,
        colorHex: COLOR_TYPE_TO_HEX[ct] || '888888',
        group: cell.groupId ?? 1,
      };
    }),
    selectableItems: relayered.map((si) => ({
      colorType: si.colorType,
      variant: si.variant,
      layer: si.layer,
      order: si.order,
    })),
    requirements: level.studioLaunchers.map((l) => ({
      colorType: l.colorType,
      value: l.pixelCount,
      group: l.group,
    })),
    launchers: level.studioLaunchers.map((l) => ({
      colorType: l.colorType,
      pixelCount: l.pixelCount,
      group: l.group,
      order: l.order,
      isLocked: l.isLocked,
    })),
    unlockStageData: [],
    maxSelectableItems: msi,
    blockingOffset: bo,
    mismatchDepth: bo / 10,
    waitingStandSlots:
      values.waitingStandSlots ?? level.studioWaitingStandSlots ?? 5,
    activeLauncherCount:
      values.activeLauncherCount ?? level.studioActiveLauncherCount ?? 2,
    seed: level.studioSeed,
    moveLimit: values.moveLimit ?? level.studioMoveLimit,
    parMoves,
    difficultyScore: variantDifficulty.score,
    colorVariantDensity,
    variantComplexity:
      variantDifficulty.breakdown.find((c) => c.id === 'variantComplexity')
        ?.score ??
      (() => {
        const avg = uniqueColors > 0 ? uniqueVariants / uniqueColors : 1;
        return Math.max(0, Math.min(1, (avg - 1) / 2));
      })(),
  });
}

export async function generateCollectionBulkZip(
  levels: DesignedFruitMatchLevel[],
  rules: VariantRule[],
  options: CollectionBulkOptions
): Promise<CollectionBulkResult> {
  const zip = new JSZip();
  const reports: LevelBulkReport[] = [];

  let totalFiles = 0;
  let totalAdjustments = 0;
  let totalErrors = 0;
  let levelsWithErrors = 0;

  for (const level of levels) {
    const base = levelToBaseValues(level);
    const baseVariantNumber = parseBaseVariant(level.name);
    const { variants, adjustments, errors } = resolveVariants(rules, base);

    const report: LevelBulkReport = {
      levelNumber: level.levelNumber,
      levelName: level.name,
      baseVariantNumber,
      variantCount: 0,
      adjustments,
      errors,
      produced: false,
    };

    if (errors.length > 0) {
      levelsWithErrors += 1;
      totalErrors += errors.length;
      reports.push(report);
      continue;
    }

    if (!level.studioSelectableItems || !level.studioLaunchers) {
      report.errors.push({
        variantNumber: baseVariantNumber,
        element: 'maxSelectableItems',
        reason: `Level has no studio data (selectable items / launchers). Re-open in the designer and save before bulk generating.`,
      });
      totalErrors += 1;
      levelsWithErrors += 1;
      reports.push(report);
      continue;
    }

    for (const v of variants) {
      const exportData = buildVariantExportData(level, v.variantNumber, {
        ...base,
        ...v.values,
      });
      if (!exportData) continue;
      const json = JSON.stringify(exportData, null, 4);
      const fileName = `Level${level.levelNumber}_${v.variantNumber}.json`;
      const path = options.nested
        ? `Level${level.levelNumber}/${fileName}`
        : fileName;
      zip.file(path, json);
      totalFiles += 1;
    }

    report.variantCount = variants.length;
    report.produced = variants.length > 0;
    totalAdjustments += adjustments.length;
    reports.push(report);
  }

  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  return {
    zipBlob,
    totalFiles,
    totalLevels: levels.length,
    totalAdjustments,
    totalErrors,
    levelsWithErrors,
    reports,
  };
}
