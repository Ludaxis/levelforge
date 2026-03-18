import { describe, it, expect } from 'vitest';
import {
  DifficultyRecipe,
  simulateStudioGame,
  targetDifficulty,
  getProgressionTarget,
  generateLevelPack,
  scoreToTier,
} from '@/lib/studioDifficultyEngine';
import {
  StudioGameConfig,
  StudioTile,
  mulberry32,
  seededShuffle,
  initializeStateSeeded,
  buildDeterministicSequence,
  getDeterministicMaxSwap,
  buildSolvableSequenceSeeded,
  buildChallengingSequenceSeeded,
} from '@/lib/useStudioGame';
import { COLOR_TYPE_TO_FRUIT } from '@/lib/juicyBlastExport';
import { PixelCell, DifficultyTier } from '@/types/fruitMatch';

// ============================================================================
// Test Helpers
// ============================================================================

/** Build a minimal StudioGameConfig for testing. */
function makeTestConfig(overrides?: Partial<StudioGameConfig>): StudioGameConfig {
  // Simple 4x4 artwork with 2 colors (colorType 0 and 1)
  const pixelArt: PixelCell[] = [];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const colorType = (r + c) % 2 === 0 ? 0 : 1;
      pixelArt.push({
        row: r,
        col: c,
        fruitType: COLOR_TYPE_TO_FRUIT[colorType],
        filled: false,
        groupId: 1,
      });
    }
  }

  // 2 launchers (one per color), 3 tiles each = 6 selectable items
  const launchers = [
    { colorType: 0, pixelCount: 8, group: 1, order: 0 },
    { colorType: 1, pixelCount: 8, group: 1, order: 1 },
  ];

  const selectableItems = [
    { colorType: 0, variant: 0, order: 0 },
    { colorType: 0, variant: 0, order: 1 },
    { colorType: 0, variant: 0, order: 2 },
    { colorType: 1, variant: 0, order: 3 },
    { colorType: 1, variant: 0, order: 4 },
    { colorType: 1, variant: 0, order: 5 },
  ];

  return {
    pixelArt,
    pixelArtWidth: 4,
    pixelArtHeight: 4,
    maxSelectableItems: 6,
    waitingStandSlots: 5,
    selectableItems,
    launchers,
    activeLauncherCount: 2,
    blockingOffset: 0,
    mismatchDepth: 0,
    ...overrides,
  };
}

/** Build a slightly larger config with 3 colors for more interesting tests. */
function makeMediumTestConfig(): StudioGameConfig {
  const pixelArt: PixelCell[] = [];
  const colors = [0, 1, 2];
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 6; c++) {
      const colorType = colors[(r * 6 + c) % 3];
      pixelArt.push({
        row: r,
        col: c,
        fruitType: COLOR_TYPE_TO_FRUIT[colorType],
        filled: false,
        groupId: 1,
      });
    }
  }

  const launchers = [
    { colorType: 0, pixelCount: 12, group: 1, order: 0 },
    { colorType: 1, pixelCount: 12, group: 1, order: 1 },
    { colorType: 2, pixelCount: 12, group: 1, order: 2 },
  ];

  const selectableItems: { colorType: number; variant: number; order: number }[] = [];
  let order = 0;
  for (const l of launchers) {
    for (let i = 0; i < 3; i++) {
      selectableItems.push({ colorType: l.colorType, variant: 0, order: order++ });
    }
  }

  return {
    pixelArt,
    pixelArtWidth: 6,
    pixelArtHeight: 6,
    maxSelectableItems: 8,
    waitingStandSlots: 5,
    selectableItems,
    launchers,
    activeLauncherCount: 2,
    blockingOffset: 0,
    mismatchDepth: 0,
  };
}

// ============================================================================
// Section 1: Seeded PRNG determinism
// ============================================================================

describe('Seeded PRNG', () => {
  it('mulberry32 produces deterministic sequences', () => {
    const rng1 = mulberry32(42);
    const rng2 = mulberry32(42);

    const seq1 = Array.from({ length: 100 }, () => rng1());
    const seq2 = Array.from({ length: 100 }, () => rng2());

    expect(seq1).toEqual(seq2);
  });

  it('different seeds produce different sequences', () => {
    const rng1 = mulberry32(42);
    const rng2 = mulberry32(99);

    const seq1 = Array.from({ length: 20 }, () => rng1());
    const seq2 = Array.from({ length: 20 }, () => rng2());

    expect(seq1).not.toEqual(seq2);
  });

  it('values are in [0, 1) range', () => {
    const rng = mulberry32(12345);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('seededShuffle is deterministic', () => {
    const arr1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const arr2 = [...arr1];

    seededShuffle(arr1, mulberry32(42));
    seededShuffle(arr2, mulberry32(42));

    expect(arr1).toEqual(arr2);
  });

  it('seededShuffle actually shuffles', () => {
    const original = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const shuffled = [...original];
    seededShuffle(shuffled, mulberry32(42));

    // Very unlikely to remain in order
    expect(shuffled).not.toEqual(original);
    // But should contain same elements
    expect(shuffled.sort((a, b) => a - b)).toEqual(original);
  });
});

// ============================================================================
// Section 2: Seeded tile builders
// ============================================================================

describe('Seeded tile builders', () => {
  it('buildSolvableSequenceSeeded is deterministic', () => {
    const tiles: StudioTile[] = [
      { id: 't1', colorType: 0, variant: 0, fruitType: 'blueberry' },
      { id: 't2', colorType: 0, variant: 0, fruitType: 'blueberry' },
      { id: 't3', colorType: 0, variant: 0, fruitType: 'blueberry' },
      { id: 't4', colorType: 1, variant: 0, fruitType: 'orange' },
      { id: 't5', colorType: 1, variant: 0, fruitType: 'orange' },
      { id: 't6', colorType: 1, variant: 0, fruitType: 'orange' },
    ];
    const launchers = [
      { colorType: 0, order: 0 },
      { colorType: 1, order: 1 },
    ];

    const seq1 = buildSolvableSequenceSeeded([...tiles], launchers, 2, mulberry32(42));
    const seq2 = buildSolvableSequenceSeeded([...tiles], launchers, 2, mulberry32(42));

    expect(seq1.map((t) => t.id)).toEqual(seq2.map((t) => t.id));
  });

  it('buildChallengingSequenceSeeded is deterministic', () => {
    const tiles: StudioTile[] = [
      { id: 't1', colorType: 0, variant: 0, fruitType: 'blueberry' },
      { id: 't2', colorType: 0, variant: 0, fruitType: 'blueberry' },
      { id: 't3', colorType: 0, variant: 0, fruitType: 'blueberry' },
      { id: 't4', colorType: 1, variant: 0, fruitType: 'orange' },
      { id: 't5', colorType: 1, variant: 0, fruitType: 'orange' },
      { id: 't6', colorType: 1, variant: 0, fruitType: 'orange' },
    ];
    const launchers = [
      { colorType: 0, order: 0 },
      { colorType: 1, order: 1 },
    ];

    const seq1 = buildChallengingSequenceSeeded([...tiles], launchers, 2, 0.5, mulberry32(42));
    const seq2 = buildChallengingSequenceSeeded([...tiles], launchers, 2, 0.5, mulberry32(42));

    expect(seq1.map((t) => t.id)).toEqual(seq2.map((t) => t.id));
  });
});

// ============================================================================
// Section 3: Full determinism — same seed + recipe = same arrangement
// ============================================================================

describe('Full determinism', () => {
  it('initializeStateSeeded produces identical state with same seed', () => {
    const config = makeTestConfig({ seed: 42, blockingOffset: 3 });

    const state1 = initializeStateSeeded(config);
    const state2 = initializeStateSeeded(config);

    // Same layer A tile colorTypes in same positions
    const layerA1 = state1.layerA.map((t) => t?.colorType ?? null);
    const layerA2 = state2.layerA.map((t) => t?.colorType ?? null);
    expect(layerA1).toEqual(layerA2);

    // Same layer B
    const layerB1 = state1.layerB.map((t) => t?.colorType ?? null);
    const layerB2 = state2.layerB.map((t) => t?.colorType ?? null);
    expect(layerB1).toEqual(layerB2);

    // Same layer C
    expect(state1.layerC.map((t) => t.colorType)).toEqual(state2.layerC.map((t) => t.colorType));
  });

  it('different seeds produce different arrangements', () => {
    const config1 = makeTestConfig({ seed: 42 });
    const config2 = makeTestConfig({ seed: 999 });

    const state1 = initializeStateSeeded(config1);
    const state2 = initializeStateSeeded(config2);

    // Layer A tile IDs should differ (different RNG streams)
    const ids1 = state1.layerA.map((t) => t?.id);
    const ids2 = state2.layerA.map((t) => t?.id);
    expect(ids1).not.toEqual(ids2);
  });

  it('initialized state has valid structure', () => {
    const config = makeTestConfig({ seed: 42 });
    const state = initializeStateSeeded(config);

    expect(state.layerA.length).toBe(config.maxSelectableItems);
    expect(state.layerB.length).toBe(config.maxSelectableItems);
    expect(state.waitingStand).toEqual([]);
    expect(state.isWon).toBe(false);
    expect(state.isLost).toBe(false);
    expect(state.moveCount).toBe(0);
    expect(state.activeLaunchers.length).toBe(config.activeLauncherCount);
  });
});

// ============================================================================
// Section 4: Difficulty targeting accuracy
// ============================================================================

describe('Difficulty targeting', () => {
  it('targets a score within 5 points for achievable targets', () => {
    const config = makeMediumTestConfig();

    // Test targets within the config's achievable range (small configs cap ~65)
    for (const target of [20, 35, 50]) {
      const result = targetDifficulty(config, target, { seed: 42 });
      expect(Math.abs(result.achievedScore - target)).toBeLessThanOrEqual(5);
    }
  });

  it('targets beyond config capacity still maximize difficulty', () => {
    const config = makeMediumTestConfig();

    // Targeting 80 with a small config — can't reach it, but should push as high as possible
    const result = targetDifficulty(config, 80, { seed: 42 });
    // Should be at least hard tier (50+) even if it can't reach 80
    expect(result.achievedScore).toBeGreaterThanOrEqual(50);
    // Recipe should have maxed out levers
    expect(result.recipe.blockingOffset).toBeGreaterThanOrEqual(5);
  });

  it('achieves correct tier for each target', () => {
    const config = makeMediumTestConfig();

    const cases: [number, DifficultyTier][] = [
      [10, 'trivial'],
      [25, 'easy'],
      [42, 'medium'],
      [57, 'hard'],
    ];

    for (const [target, expectedTier] of cases) {
      const result = targetDifficulty(config, target, { seed: 42 });
      expect(result.tier).toBe(expectedTier);
    }
  });

  it('recipe levers are within valid ranges', () => {
    const config = makeMediumTestConfig();

    for (const target of [10, 30, 50, 70, 90]) {
      const result = targetDifficulty(config, target, { seed: 42 });
      const r = result.recipe;
      expect(r.blockingOffset).toBeGreaterThanOrEqual(0);
      expect(r.blockingOffset).toBeLessThanOrEqual(10);
      expect(r.maxSelectableItems).toBeGreaterThanOrEqual(1);
      expect(r.maxSelectableItems).toBeLessThanOrEqual(20);
      expect(r.activeLauncherCount).toBeGreaterThanOrEqual(1);
      expect(r.activeLauncherCount).toBeLessThanOrEqual(3);
    }
  });

  it('scoreToTier maps correctly', () => {
    expect(scoreToTier(0)).toBe('trivial');
    expect(scoreToTier(19)).toBe('trivial');
    expect(scoreToTier(20)).toBe('easy');
    expect(scoreToTier(34)).toBe('easy');
    expect(scoreToTier(35)).toBe('medium');
    expect(scoreToTier(49)).toBe('medium');
    expect(scoreToTier(50)).toBe('hard');
    expect(scoreToTier(64)).toBe('hard');
    expect(scoreToTier(65)).toBe('expert');
    expect(scoreToTier(79)).toBe('expert');
    expect(scoreToTier(80)).toBe('nightmare');
    expect(scoreToTier(100)).toBe('nightmare');
  });
});

// ============================================================================
// Section 5: Monte Carlo simulation validity
// ============================================================================

describe('Monte Carlo simulation', () => {
  it('easy recipe has higher win rate than hard recipe', () => {
    const config = makeMediumTestConfig();

    const easyRecipe: DifficultyRecipe = {
      blockingOffset: 0,
      mismatchDepth: 0,
      maxSelectableItems: 10,
      activeLauncherCount: 2,
      seed: 42,
    };

    const hardRecipe: DifficultyRecipe = {
      blockingOffset: 8,
      mismatchDepth: 0.8,
      maxSelectableItems: 6,
      activeLauncherCount: 1,
      seed: 42,
    };

    const easyResult = simulateStudioGame(config, easyRecipe, 50);
    const hardResult = simulateStudioGame(config, hardRecipe, 50);

    expect(easyResult.winRate).toBeGreaterThanOrEqual(hardResult.winRate);
  });

  it('returns valid statistics', () => {
    const config = makeTestConfig();
    const recipe: DifficultyRecipe = {
      blockingOffset: 0,
      mismatchDepth: 0,
      maxSelectableItems: 6,
      activeLauncherCount: 2,
      seed: 42,
    };

    const result = simulateStudioGame(config, recipe, 30);

    expect(result.winRate).toBeGreaterThanOrEqual(0);
    expect(result.winRate).toBeLessThanOrEqual(1);
    expect(result.avgMoves).toBeGreaterThan(0);
    expect(result.peakStandUsage).toBeGreaterThanOrEqual(0);
    expect(result.nearLossRate).toBeGreaterThanOrEqual(0);
    expect(result.nearLossRate).toBeLessThanOrEqual(1);
    expect(result.confidenceInterval[0]).toBeLessThanOrEqual(result.winRate);
    expect(result.confidenceInterval[1]).toBeGreaterThanOrEqual(result.winRate);
    expect(result.runs).toBe(30);
  });

  it('simulation is deterministic with same seed', () => {
    const config = makeTestConfig();
    const recipe: DifficultyRecipe = {
      blockingOffset: 2,
      mismatchDepth: 0.2,
      maxSelectableItems: 8,
      activeLauncherCount: 2,
      seed: 42,
    };

    const result1 = simulateStudioGame(config, recipe, 20);
    const result2 = simulateStudioGame(config, recipe, 20);

    expect(result1.winRate).toBe(result2.winRate);
    expect(result1.avgMoves).toBe(result2.avgMoves);
  });
});

// ============================================================================
// Section 6: Progression curve shape
// ============================================================================

describe('Progression curve', () => {
  it('sawtooth repeats every 10 levels', () => {
    const target1 = getProgressionTarget(1);
    const target11 = getProgressionTarget(11);
    const target21 = getProgressionTarget(21);

    expect(target1.sawtoothPosition).toBe(target11.sawtoothPosition);
    expect(target11.sawtoothPosition).toBe(target21.sawtoothPosition);
  });

  it('envelope limits are respected', () => {
    // Onboarding levels (1-20) should not exceed easy
    for (let level = 1; level <= 20; level++) {
      const target = getProgressionTarget(level);
      expect(target.targetScore).toBeLessThanOrEqual(35);
    }

    // Early levels (21-50) should not exceed medium
    for (let level = 21; level <= 50; level++) {
      const target = getProgressionTarget(level);
      expect(target.targetScore).toBeLessThanOrEqual(50);
    }

    // Mid levels (51-100) should not exceed hard
    for (let level = 51; level <= 100; level++) {
      const target = getProgressionTarget(level);
      expect(target.targetScore).toBeLessThanOrEqual(65);
    }
  });

  it('progression targets have valid tiers', () => {
    for (let level = 1; level <= 120; level++) {
      const target = getProgressionTarget(level);
      expect(['trivial', 'easy', 'medium', 'hard', 'expert', 'nightmare']).toContain(target.tier);
      expect(target.targetScore).toBeGreaterThanOrEqual(0);
      expect(target.targetScore).toBeLessThanOrEqual(100);
      expect(target.sawtoothPosition).toBeGreaterThanOrEqual(1);
      expect(target.sawtoothPosition).toBeLessThanOrEqual(10);
    }
  });

  it('sawtooth has valleys and peaks within each cycle', () => {
    // Within a 10-level cycle, the max should be higher than the min
    for (let cycle = 0; cycle < 3; cycle++) {
      const scores = Array.from({ length: 10 }, (_, i) =>
        getProgressionTarget(cycle * 10 + i + 1).targetScore,
      );
      const min = Math.min(...scores);
      const max = Math.max(...scores);
      expect(max).toBeGreaterThan(min);
    }
  });
});

// ============================================================================
// Section 7: Batch generation
// ============================================================================

describe('Batch generation', () => {
  it('generateLevelPack produces correct count', () => {
    const config = makeMediumTestConfig();
    const pack = generateLevelPack(config, 1, 10);
    expect(pack.length).toBe(10);
  });

  it('level numbers are sequential', () => {
    const config = makeMediumTestConfig();
    const pack = generateLevelPack(config, 5, 5);
    expect(pack.map((p) => p.levelNumber)).toEqual([5, 6, 7, 8, 9]);
  });

  it('each level has unique seed', () => {
    const config = makeMediumTestConfig();
    const pack = generateLevelPack(config, 1, 10);
    const seeds = pack.map((p) => p.result.recipe.seed);
    const uniqueSeeds = new Set(seeds);
    expect(uniqueSeeds.size).toBe(10);
  });

  it('recipes follow progression targets', () => {
    const config = makeMediumTestConfig();
    const pack = generateLevelPack(config, 1, 10);

    for (const entry of pack) {
      // Achieved score should be within 5 points of target
      expect(Math.abs(entry.result.achievedScore - entry.target.targetScore)).toBeLessThanOrEqual(5);
    }
  });
});

// ============================================================================
// Section 8: buildDeterministicSequence
// ============================================================================

describe('buildDeterministicSequence', () => {
  function makeTiles(colorCounts: Record<number, number>): StudioTile[] {
    const tiles: StudioTile[] = [];
    let idx = 0;
    for (const [ct, count] of Object.entries(colorCounts)) {
      for (let i = 0; i < count; i++) {
        const colorType = Number(ct);
        tiles.push({
          id: `t${idx++}`,
          colorType,
          variant: 0,
          fruitType: COLOR_TYPE_TO_FRUIT[colorType] || 'apple',
        });
      }
    }
    return tiles;
  }

  const launchers2 = [
    { colorType: 0, order: 0 },
    { colorType: 1, order: 1 },
  ];

  const launchers4 = [
    { colorType: 0, order: 0 },
    { colorType: 1, order: 1 },
    { colorType: 2, order: 2 },
    { colorType: 3, order: 3 },
  ];

  it('same inputs = same output (deterministic, no RNG)', () => {
    const tiles = makeTiles({ 0: 3, 1: 3 });

    const seq1 = buildDeterministicSequence([...tiles], launchers2, 2, 5);
    const seq2 = buildDeterministicSequence([...tiles], launchers2, 2, 5);

    expect(seq1.map((t) => t.id)).toEqual(seq2.map((t) => t.id));
  });

  it('blocking=0 keeps the active group inside the Layer A + B window', () => {
    const tiles = makeTiles({ 0: 3, 1: 3, 2: 3, 3: 3 });

    const seq = buildDeterministicSequence(tiles, launchers4, 2, 0, 3);

    const first6Colors = seq.slice(0, 6).map((t) => t.colorType);
    for (const ct of first6Colors) {
      expect([0, 1]).toContain(ct);
    }
  });

  it('higher blocking pushes the active completion later and adds blockers up front', () => {
    const tiles = makeTiles({ 0: 3, 1: 3, 2: 3, 3: 3 });

    const easy = buildDeterministicSequence([...tiles], launchers4, 2, 0, 3);
    const hard = buildDeterministicSequence([...tiles], launchers4, 2, 4, 3);

    const easyLastActiveIndex = Math.max(...easy.map((tile, index) => ([0, 1].includes(tile.colorType) ? index : -1)));
    const hardLastActiveIndex = Math.max(...hard.map((tile, index) => ([0, 1].includes(tile.colorType) ? index : -1)));

    expect(hardLastActiveIndex).toBeGreaterThan(easyLastActiveIndex);
    expect(hard.slice(0, 6).some((tile) => [2, 3].includes(tile.colorType))).toBe(true);
  });

  it('exposes the full blocking offset range for targeting and UI', () => {
    const tiles = makeTiles({ 0: 3, 1: 3 });
    const maxSwap = getDeterministicMaxSwap(tiles, launchers2, 2);
    expect(maxSwap).toBe(10);
  });

  it('blocking=0 preserves canonical Item Pool order', () => {
    const tiles = makeTiles({ 0: 3, 1: 3 });

    // blocking=0 → returns canonical order unchanged: [0,0,0,1,1,1]
    const seq = buildDeterministicSequence(tiles, launchers2, 2, 0);

    expect(seq[0].colorType).toBe(0);
    expect(seq[1].colorType).toBe(0);
    expect(seq[2].colorType).toBe(0);
    expect(seq[3].colorType).toBe(1);
    expect(seq[4].colorType).toBe(1);
    expect(seq[5].colorType).toBe(1);
  });

  it('handles uneven tile counts per color', () => {
    const tiles = makeTiles({ 0: 3, 1: 1 });

    const seq = buildDeterministicSequence(tiles, launchers2, 2, 0);

    expect(seq.length).toBe(4);
    // All tiles are present
    expect(seq.filter((t) => t.colorType === 0).length).toBe(3);
    expect(seq.filter((t) => t.colorType === 1).length).toBe(1);
  });

  it('leftover non-launcher tiles are preserved and can fill blocker gaps', () => {
    const tiles = makeTiles({ 0: 3, 1: 3, 5: 2 }); // colorType 5 has no launcher
    const launchers = [
      { colorType: 0, order: 0 },
      { colorType: 1, order: 1 },
    ];

    const seq = buildDeterministicSequence(tiles, launchers, 2, 0);

    expect(seq.length).toBe(8);
    expect(seq.filter((tile) => tile.colorType === 5)).toHaveLength(2);
  });

  it('preserves original order within each color group (no shuffle)', () => {
    const tiles: StudioTile[] = [
      { id: 'a0', colorType: 0, variant: 0, fruitType: 'blueberry' },
      { id: 'a1', colorType: 0, variant: 1, fruitType: 'blueberry' },
      { id: 'a2', colorType: 0, variant: 2, fruitType: 'blueberry' },
      { id: 'b0', colorType: 1, variant: 0, fruitType: 'orange' },
      { id: 'b1', colorType: 1, variant: 1, fruitType: 'orange' },
      { id: 'b2', colorType: 1, variant: 2, fruitType: 'orange' },
    ];

    const seq = buildDeterministicSequence(tiles, launchers2, 2, 0);

    // Color 0 tiles should maintain their relative order: a0, a1, a2
    const color0Tiles = seq.filter((t) => t.colorType === 0);
    expect(color0Tiles.map((t) => t.id)).toEqual(['a0', 'a1', 'a2']);

    // Color 1 tiles should maintain their relative order: b0, b1, b2
    const color1Tiles = seq.filter((t) => t.colorType === 1);
    expect(color1Tiles.map((t) => t.id)).toEqual(['b0', 'b1', 'b2']);
  });
});

// ============================================================================
// Section 9: State shape — activeLauncherCount field
// ============================================================================

describe('State shape', () => {
  it('initializeStateSeeded includes activeLauncherCount in state', () => {
    const config = makeTestConfig({ seed: 42, activeLauncherCount: 3 });
    const state = initializeStateSeeded(config);

    expect(state.activeLauncherCount).toBe(3);
  });

  it('activeLauncherCount defaults to 2', () => {
    const config = makeTestConfig({ seed: 42 });
    const state = initializeStateSeeded(config);

    expect(state.activeLauncherCount).toBe(2);
  });
});

// ============================================================================
// Section 10: Solvability at various depths
// ============================================================================

describe('Solvability with deterministic builder', () => {
  it('blocking=0 is always solvable', () => {
    const config = makeTestConfig({ seed: 42, blockingOffset: 0 });
    const state = initializeStateSeeded(config);

    // Should have valid layer arrangement
    expect(state.layerA.some((t) => t !== null)).toBe(true);
    expect(state.isLost).toBe(false);
    expect(state.isWon).toBe(false);
  });

  it('high blocking degrades gracefully if unsolvable', () => {
    const config = makeTestConfig({ seed: 42, blockingOffset: 10 });
    const state = initializeStateSeeded(config);

    // Should still produce valid state even if depth had to degrade
    expect(state.layerA.some((t) => t !== null)).toBe(true);
    expect(state.isLost).toBe(false);
  });

  it('identical config + blocking always produces identical state', () => {
    const config = makeTestConfig({ seed: 42, blockingOffset: 5 });

    const state1 = initializeStateSeeded(config);
    const state2 = initializeStateSeeded(config);

    const colors1 = state1.layerA.map((t) => t?.colorType ?? null);
    const colors2 = state2.layerA.map((t) => t?.colorType ?? null);
    expect(colors1).toEqual(colors2);

    const bColors1 = state1.layerB.map((t) => t?.colorType ?? null);
    const bColors2 = state2.layerB.map((t) => t?.colorType ?? null);
    expect(bColors1).toEqual(bColors2);
  });
});
