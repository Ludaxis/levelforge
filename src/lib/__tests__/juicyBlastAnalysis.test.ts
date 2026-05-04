import { describe, expect, it } from 'vitest';
import { PixelCell } from '@/types/fruitMatch';
import { StudioGameConfig } from '@/lib/studioGameLogic';
import {
  analyzeJuicyLevel,
  computeSolverBackedPar,
  simulateUserPlaythrough,
} from '@/lib/juicyBlast/analysis';
import { generateValidatedVariants } from '@/lib/juicyBlast/variantOptimizer';
import { COLOR_TYPE_TO_FRUIT } from '@/lib/juicyBlastExport';

function pixelArt(colors: number[]): PixelCell[] {
  return colors.map((colorType, idx) => ({
    row: Math.floor(idx / 4),
    col: idx % 4,
    fruitType: COLOR_TYPE_TO_FRUIT[colorType],
    filled: false,
    colorType,
    groupId: colorType + 1,
  }));
}

function makeConfig(overrides: Partial<StudioGameConfig> = {}): StudioGameConfig {
  const launchers = [
    { colorType: 0, pixelCount: 3, group: 1, order: 0 },
    { colorType: 1, pixelCount: 3, group: 2, order: 1 },
    { colorType: 2, pixelCount: 3, group: 3, order: 2 },
    { colorType: 3, pixelCount: 3, group: 4, order: 3 },
  ];
  const selectableItems = launchers.flatMap((launcher, launcherIndex) =>
    Array.from({ length: 3 }, (_, itemIndex) => {
      const order = launcherIndex * 3 + itemIndex;
      return {
        colorType: launcher.colorType,
        variant: 0,
        order,
        layer: order < 8 ? 'A' as const : order < 16 ? 'B' as const : 'C' as const,
      };
    }),
  );

  return {
    pixelArt: pixelArt([0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3]),
    pixelArtWidth: 4,
    pixelArtHeight: 3,
    maxSelectableItems: 8,
    waitingStandSlots: 5,
    selectableItems,
    launchers,
    activeLauncherCount: 2,
    blockingOffset: 1,
    seed: 42,
    ...overrides,
  };
}

function makeVariantTrapConfig(): StudioGameConfig {
  return makeConfig({
    pixelArt: pixelArt([0, 0, 0]),
    pixelArtWidth: 3,
    pixelArtHeight: 1,
    maxSelectableItems: 3,
    waitingStandSlots: 5,
    launchers: [{ colorType: 0, pixelCount: 3, group: 1, order: 0 }],
    activeLauncherCount: 1,
    blockingOffset: 0,
    selectableItems: [
      { colorType: 0, variant: 0, order: 0, layer: 'A' },
      { colorType: 0, variant: 0, order: 1, layer: 'A' },
      { colorType: 0, variant: 1, order: 2, layer: 'A' },
    ],
  });
}

function makeRiskyRuntimeConfig(): StudioGameConfig {
  return makeConfig({ moveLimit: 2 });
}

describe('Juicy Blast solver-backed analysis', () => {
  it('replays deterministically for the same profile and seed', () => {
    const config = makeConfig();
    const first = simulateUserPlaythrough(config, 'average', 1234);
    const second = simulateUserPlaythrough(config, 'average', 1234);

    expect(first).toEqual(second);
  });

  it('computes variant-aware par instead of matching color only', () => {
    expect(computeSolverBackedPar(makeVariantTrapConfig())).toBeNull();
  });

  it('reports solvable levels with a par value', () => {
    const report = analyzeJuicyLevel(makeConfig(), { monteCarloRuns: 4 });

    expect(report.verdict).toBe('solvable');
    expect(report.parMoves).toBeGreaterThan(0);
    expect(report.solverScore).toBeGreaterThanOrEqual(0);
  });

  it('reports solver-completable but move-limited levels as risky', () => {
    const report = analyzeJuicyLevel(makeRiskyRuntimeConfig(), { monteCarloRuns: 4 });

    expect(report.verdict).toBe('risky');
    expect(report.parMoves).toBeGreaterThan(2);
    expect(report.winRates.greedy).toBe(0);
  });

  it('reports variant-locked traps as stuck', () => {
    const report = analyzeJuicyLevel(makeVariantTrapConfig(), { monteCarloRuns: 4 });

    expect(report.verdict).toBe('stuck');
    expect(report.parMoves).toBeNull();
  });
});

describe('validated variant optimizer', () => {
  it('generates a 1-9 ladder with v5 preserving base levers', () => {
    const base = makeConfig();
    const result = generateValidatedVariants(base, { runsPerProfile: 3 });
    const variant5 = result.variants.find((variant) => variant.variantNumber === 5);

    expect(result.variants).toHaveLength(9);
    expect(variant5?.values.maxSelectableItems).toBe(base.maxSelectableItems);
    expect(variant5?.values.blockingOffset).toBe(base.blockingOffset);
    expect(variant5?.values.activeLauncherCount).toBe(base.activeLauncherCount);
    expect(variant5?.values.waitingStandSlots).toBe(base.waitingStandSlots);
  });

  it('keeps generated variants out of stuck export state', () => {
    const result = generateValidatedVariants(makeConfig(), { runsPerProfile: 3 });

    expect(result.variants.every((variant) => variant.report.verdict !== 'stuck')).toBe(true);
    expect(result.canExport).toBe(true);
  });

  it('trends easier below v5 and harder above v5 by solver score or win rate', () => {
    const result = generateValidatedVariants(makeConfig(), { runsPerProfile: 3 });
    const variant1 = result.variants.find((variant) => variant.variantNumber === 1)!;
    const variant5 = result.variants.find((variant) => variant.variantNumber === 5)!;
    const variant9 = result.variants.find((variant) => variant.variantNumber === 9)!;

    expect(
      variant1.report.solverScore <= variant5.report.solverScore ||
        variant1.report.winRates.average >= variant5.report.winRates.average,
    ).toBe(true);
    expect(
      variant9.report.solverScore >= variant5.report.solverScore ||
        variant9.report.winRates.average <= variant5.report.winRates.average,
    ).toBe(true);
  });
});
