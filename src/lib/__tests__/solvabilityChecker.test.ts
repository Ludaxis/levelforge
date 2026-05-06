import { describe, expect, it } from 'vitest';
import {
  analyzeSingleLevel,
  findOptimalFirstMoves,
  solveDFS,
  studioExportToGameConfig,
} from '@/lib/solvabilityChecker';
import { StudioExportLevel } from '@/lib/juicyBlastExport';

function makeTwoColorLevel(): StudioExportLevel {
  return {
    LevelId: 'OptimalStarts',
    MaxSelectableItems: 2,
    BlockingOffset: 0,
    WaitingStandSlots: 5,
    ActiveLauncherCount: 2,
    Artwork: {
      Width: 1,
      Height: 1,
      PixelData: [],
    },
    Requirements: [
      { ColorType: 0, Value: 1, Group: 1 },
      { ColorType: 2, Value: 1, Group: 2 },
    ],
    SelectableItems: [
      { ColorType: 0, Variant: 0, Layer: 0, Order: 0 },
      { ColorType: 2, Variant: 0, Layer: 0, Order: 1 },
      { ColorType: 0, Variant: 0, Layer: 1, Order: 2 },
      { ColorType: 2, Variant: 0, Layer: 1, Order: 3 },
      { ColorType: 0, Variant: 0, Layer: 2, Order: 4 },
      { ColorType: 2, Variant: 0, Layer: 2, Order: 5 },
    ],
    Launchers: [
      { ColorType: 0, Value: 1, Group: 1, Order: 0, IsLocked: false },
      { ColorType: 2, Value: 1, Group: 2, Order: 1, IsLocked: false },
    ],
  };
}

describe('solvability checker path reporting', () => {
  it('counts multiple optimal DFS paths instead of stopping at the first one', () => {
    const config = studioExportToGameConfig(makeTwoColorLevel());
    const result = solveDFS(config, 10000);

    expect(result.solvable).toBe(true);
    expect(result.solutionCount).toBeGreaterThan(1);
    expect(result.optimalSolutionCount).toBeGreaterThan(1);
    expect(result.solutionCountCapped).toBe(false);
  });

  it('reports all equally best first moves for active launchers', () => {
    const level = makeTwoColorLevel();
    const config = studioExportToGameConfig(level);

    expect(findOptimalFirstMoves(config)).toEqual([0, 1]);

    const report = analyzeSingleLevel(level, { runMonteCarlo: false, runDFS: false });
    expect(report.optimalFirstMoves).toEqual([0, 1]);
  });
});
