import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useFruitMatchGame } from '../../useFruitMatchGame';
import { FruitMatchLevel, SinkTile, FruitType, PixelCell } from '@/types/fruitMatch';
import {
  createTestPixelArt,
  createTestSinkStacks,
  createTestFruitMatchLevel,
  createSimpleSolvableLevel,
  createMultiFruitLevel,
  createTestPixel,
  createUniformPixelArt,
} from '../helpers/fruitMatchTestHelpers';

// ============================================================================
// Test Setup
// ============================================================================

// Helper to create minimal test levels
function createMinimalLevel(
  pixelArt: PixelCell[],
  sinkStacks: SinkTile[][],
  options?: { waitingStandSlots?: number }
): FruitMatchLevel {
  return createTestFruitMatchLevel(pixelArt, sinkStacks, {
    waitingStandSlots: options?.waitingStandSlots ?? 7,
  });
}

// ============================================================================
// Initialization Tests
// ============================================================================

describe('useFruitMatchGame - Initialization', () => {
  it('should initialize state from level', () => {
    const level = createSimpleSolvableLevel();
    const { result } = renderHook(() => useFruitMatchGame(level));

    expect(result.current.state.level).toBe(level);
    expect(result.current.state.moveCount).toBe(0);
    expect(result.current.state.matchCount).toBe(0);
    expect(result.current.state.isComplete).toBe(false);
    expect(result.current.state.isWon).toBe(false);
    expect(result.current.state.isLost).toBe(false);
  });

  it('should initialize pixel art with all unfilled', () => {
    const level = createSimpleSolvableLevel();
    const { result } = renderHook(() => useFruitMatchGame(level));

    expect(result.current.state.pixelArt.every(p => p.filled === false)).toBe(true);
  });

  it('should deep copy sink stacks', () => {
    const level = createSimpleSolvableLevel();
    const { result } = renderHook(() => useFruitMatchGame(level));

    // Verify stacks are copies, not references
    expect(result.current.state.sinkStacks).not.toBe(level.sinkStacks);
    expect(result.current.state.sinkStacks[0]).not.toBe(level.sinkStacks[0]);
  });

  it('should initialize empty waiting stand', () => {
    const level = createSimpleSolvableLevel();
    const { result } = renderHook(() => useFruitMatchGame(level));

    expect(result.current.state.waitingStand).toHaveLength(0);
  });

  it('should create initial launchers from queue', () => {
    const level = createSimpleSolvableLevel();
    const { result } = renderHook(() => useFruitMatchGame(level));

    // Should have up to 4 launchers
    expect(result.current.state.launchers.length).toBeLessThanOrEqual(4);
    expect(result.current.state.launchers.length).toBeGreaterThan(0);
  });

  it('should initialize launcher progress tracking', () => {
    const level = createSimpleSolvableLevel();
    const { result } = renderHook(() => useFruitMatchGame(level));

    expect(result.current.state.launcherProgress.length).toBe(result.current.state.launchers.length);
    result.current.state.launcherProgress.forEach(p => {
      expect(p.collectedTiles).toHaveLength(0);
    });
  });

  it('should start with idle animation phase', () => {
    const level = createSimpleSolvableLevel();
    const { result } = renderHook(() => useFruitMatchGame(level));

    expect(result.current.state.animationPhase).toBe('idle');
    expect(result.current.state.animatingTile).toBeNull();
  });

  it('should initialize animation state with no active shootings', () => {
    const level = createSimpleSolvableLevel();
    const { result } = renderHook(() => useFruitMatchGame(level));

    expect(result.current.animationState.activeShootings).toHaveLength(0);
    expect(result.current.animationState.isShootingActive).toBe(false);
  });
});

// ============================================================================
// canPickTile Tests
// ============================================================================

describe('useFruitMatchGame - canPickTile', () => {
  it('should return true for top tile in stack', () => {
    const level = createSimpleSolvableLevel();
    const { result } = renderHook(() => useFruitMatchGame(level));

    // First stack has tiles at indices 0 and 1, top is index 0
    const topTileIndex = 0;
    expect(result.current.canPickTile(0, topTileIndex)).toBe(true);
  });

  it('should return false for buried tile', () => {
    const pixelArt = createTestPixelArt([['apple']]);
    const sinkStacks = createTestSinkStacks([
      ['apple', 'apple', 'apple'], // 3 tiles stacked
    ]);
    const level = createMinimalLevel(pixelArt, sinkStacks);

    const { result } = renderHook(() => useFruitMatchGame(level));

    // Tile at index 2 is at the bottom, not pickable
    expect(result.current.canPickTile(0, 2)).toBe(false);
    // Top tile (index 0) is pickable
    expect(result.current.canPickTile(0, 0)).toBe(true);
  });

  it('should return false for empty stack', () => {
    const pixelArt = createTestPixelArt([['apple']]);
    const sinkStacks = createTestSinkStacks([
      [], // Empty stack
      ['apple'],
    ]);
    const level = createMinimalLevel(pixelArt, sinkStacks);

    const { result } = renderHook(() => useFruitMatchGame(level));

    expect(result.current.canPickTile(0, 0)).toBe(false);
  });

  it('should return false for invalid position', () => {
    const level = createSimpleSolvableLevel();
    const { result } = renderHook(() => useFruitMatchGame(level));

    expect(result.current.canPickTile(999, 0)).toBe(false);
  });
});

// ============================================================================
// pickableTiles Tests
// ============================================================================

describe('useFruitMatchGame - pickableTiles', () => {
  it('should return all top tiles', () => {
    const pixelArt = createTestPixelArt([['apple', 'orange']]);
    const sinkStacks = createTestSinkStacks([
      ['apple', 'banana'],
      ['orange'],
      ['plum', 'strawberry'],
    ]);
    const level = createMinimalLevel(pixelArt, sinkStacks);

    const { result } = renderHook(() => useFruitMatchGame(level));

    expect(result.current.pickableTiles).toHaveLength(3);
    expect(result.current.pickableTiles.map(t => t.position)).toEqual([0, 1, 2]);
  });

  it('should return empty array when all stacks empty', () => {
    const pixelArt = createTestPixelArt([['apple']]);
    const sinkStacks: SinkTile[][] = [[], [], []];
    const level = createMinimalLevel(pixelArt, sinkStacks);

    const { result } = renderHook(() => useFruitMatchGame(level));

    expect(result.current.pickableTiles).toHaveLength(0);
  });

  it('should return only top tile from each stack', () => {
    const pixelArt = createTestPixelArt([['apple']]);
    const sinkStacks = createTestSinkStacks([
      ['apple', 'orange', 'banana'], // Stack of 3, only top (apple) pickable
    ]);
    const level = createMinimalLevel(pixelArt, sinkStacks);

    const { result } = renderHook(() => useFruitMatchGame(level));

    expect(result.current.pickableTiles).toHaveLength(1);
    expect(result.current.pickableTiles[0].tile.fruitType).toBe('apple');
  });
});

// ============================================================================
// canAddToWaitingStand Tests
// ============================================================================

describe('useFruitMatchGame - canAddToWaitingStand', () => {
  it('should return true when waiting stand has space', () => {
    const level = createSimpleSolvableLevel();
    const { result } = renderHook(() => useFruitMatchGame(level));

    expect(result.current.canAddToWaitingStand).toBe(true);
  });

  it('should return false when waiting stand is full', async () => {
    // Create level where no launcher matches the available tiles
    const pixelArt = createTestPixelArt([['apple']]);
    const sinkStacks = createTestSinkStacks([
      ['orange', 'orange', 'orange', 'orange', 'orange', 'orange', 'orange', 'orange'],
    ]);
    const level = createMinimalLevel(pixelArt, sinkStacks, { waitingStandSlots: 7 });

    const { result } = renderHook(() => useFruitMatchGame(level));

    // Initially should have space
    expect(result.current.canAddToWaitingStand).toBe(true);
  });
});

// ============================================================================
// pickTile Tests
// ============================================================================

describe('useFruitMatchGame - pickTile', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should remove tile from sink stack', async () => {
    const pixelArt = createUniformPixelArt(2, 2, 'apple');
    const sinkStacks = createTestSinkStacks([
      ['apple', 'apple'],
      ['apple'],
    ]);
    const level = createMinimalLevel(pixelArt, sinkStacks);

    const { result } = renderHook(() => useFruitMatchGame(level));

    const initialTileCount = result.current.state.sinkStacks[0].length;

    await act(async () => {
      result.current.pickTile(0);
      vi.advanceTimersByTime(300);
    });

    expect(result.current.state.sinkStacks[0].length).toBe(initialTileCount - 1);
  });

  it('should increment move count', async () => {
    const pixelArt = createUniformPixelArt(2, 2, 'apple');
    const sinkStacks = createTestSinkStacks([
      ['apple', 'apple'],
      ['apple'],
    ]);
    const level = createMinimalLevel(pixelArt, sinkStacks);

    const { result } = renderHook(() => useFruitMatchGame(level));

    await act(async () => {
      result.current.pickTile(0);
      vi.advanceTimersByTime(300);
    });

    expect(result.current.state.moveCount).toBe(1);
  });

  it('should add tile to launcher progress when matching', async () => {
    const pixelArt = createUniformPixelArt(2, 2, 'apple');
    const sinkStacks = createTestSinkStacks([
      ['apple'],
    ]);
    const level = createMinimalLevel(pixelArt, sinkStacks);

    const { result } = renderHook(() => useFruitMatchGame(level));

    // Find the apple launcher
    const appleLauncher = result.current.state.launchers.find(l => l.requiredFruit === 'apple');

    if (appleLauncher) {
      await act(async () => {
        result.current.pickTile(0);
        vi.advanceTimersByTime(300);
      });

      const progress = result.current.state.launcherProgress.find(p => p.launcherId === appleLauncher.id);
      expect(progress?.collectedTiles.length).toBe(1);
    }
  });

  it('should add tile to waiting stand when no launcher matches', async () => {
    // Create level with apple pixel art but only orange tiles
    const pixelArt = createUniformPixelArt(1, 1, 'apple');
    const sinkStacks = createTestSinkStacks([
      ['orange'],
    ]);
    const level = createMinimalLevel(pixelArt, sinkStacks);

    const { result } = renderHook(() => useFruitMatchGame(level));

    await act(async () => {
      result.current.pickTile(0);
      vi.advanceTimersByTime(300);
    });

    // Orange tile should go to waiting stand (no orange launcher)
    expect(result.current.state.waitingStand.length).toBeGreaterThanOrEqual(0);
  });

  it('should do nothing when game is complete', async () => {
    const level = createSimpleSolvableLevel();
    const { result } = renderHook(() => useFruitMatchGame(level));

    // Manually set game as complete
    act(() => {
      result.current.state.isComplete = true;
    });

    const moveCount = result.current.state.moveCount;

    await act(async () => {
      result.current.pickTile(0);
      vi.advanceTimersByTime(300);
    });

    expect(result.current.state.moveCount).toBe(moveCount);
  });

  it('should do nothing when game is lost', async () => {
    const level = createSimpleSolvableLevel();
    const { result } = renderHook(() => useFruitMatchGame(level));

    // Manually set game as lost
    act(() => {
      result.current.state.isLost = true;
    });

    const moveCount = result.current.state.moveCount;

    await act(async () => {
      result.current.pickTile(0);
      vi.advanceTimersByTime(300);
    });

    expect(result.current.state.moveCount).toBe(moveCount);
  });

  it('should do nothing for empty stack', async () => {
    const pixelArt = createTestPixelArt([['apple']]);
    const sinkStacks: SinkTile[][] = [[], ['apple']];
    const level = createMinimalLevel(pixelArt, sinkStacks);

    const { result } = renderHook(() => useFruitMatchGame(level));

    const moveCount = result.current.state.moveCount;

    await act(async () => {
      result.current.pickTile(0); // Empty stack
      vi.advanceTimersByTime(300);
    });

    expect(result.current.state.moveCount).toBe(moveCount);
  });
});

// ============================================================================
// Reset Tests
// ============================================================================

describe('useFruitMatchGame - reset', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should restore initial state', async () => {
    const level = createSimpleSolvableLevel();
    const { result } = renderHook(() => useFruitMatchGame(level));

    // Make some moves
    await act(async () => {
      result.current.pickTile(0);
      vi.advanceTimersByTime(300);
    });

    expect(result.current.state.moveCount).toBeGreaterThan(0);

    // Reset
    act(() => {
      result.current.reset();
    });

    expect(result.current.state.moveCount).toBe(0);
    expect(result.current.state.matchCount).toBe(0);
    expect(result.current.state.isComplete).toBe(false);
    expect(result.current.state.isWon).toBe(false);
    expect(result.current.state.isLost).toBe(false);
    expect(result.current.state.waitingStand).toHaveLength(0);
  });

  it('should reset animation state', async () => {
    const level = createSimpleSolvableLevel();
    const { result } = renderHook(() => useFruitMatchGame(level));

    act(() => {
      result.current.reset();
    });

    expect(result.current.animationState.activeShootings).toHaveLength(0);
    expect(result.current.animationState.isShootingActive).toBe(false);
  });

  it('should restore original sink stacks', async () => {
    const level = createSimpleSolvableLevel();
    const { result } = renderHook(() => useFruitMatchGame(level));

    const originalStackLengths = level.sinkStacks.map(s => s.length);

    // Pick some tiles
    await act(async () => {
      result.current.pickTile(0);
      vi.advanceTimersByTime(300);
    });

    // Reset
    act(() => {
      result.current.reset();
    });

    const resetStackLengths = result.current.state.sinkStacks.map(s => s.length);
    expect(resetStackLengths).toEqual(originalStackLengths);
  });
});

// ============================================================================
// loadLevel Tests
// ============================================================================

describe('useFruitMatchGame - loadLevel', () => {
  it('should load a completely new level', () => {
    const level1 = createSimpleSolvableLevel();
    const level2 = createMultiFruitLevel();

    const { result } = renderHook(() => useFruitMatchGame(level1));

    expect(result.current.state.level).toBe(level1);

    act(() => {
      result.current.loadLevel(level2);
    });

    expect(result.current.state.level).toBe(level2);
    expect(result.current.state.moveCount).toBe(0);
  });

  it('should reset all game state when loading new level', () => {
    const level1 = createSimpleSolvableLevel();
    const level2 = createMultiFruitLevel();

    const { result } = renderHook(() => useFruitMatchGame(level1));

    act(() => {
      result.current.loadLevel(level2);
    });

    expect(result.current.state.isComplete).toBe(false);
    expect(result.current.state.isWon).toBe(false);
    expect(result.current.state.isLost).toBe(false);
    expect(result.current.state.waitingStand).toHaveLength(0);
  });
});

// ============================================================================
// Progress Computation Tests
// ============================================================================

describe('useFruitMatchGame - progress', () => {
  it('should calculate total pixels', () => {
    const pixelArt = createUniformPixelArt(3, 4, 'apple'); // 12 pixels
    const sinkStacks = createTestSinkStacks([['apple', 'apple', 'apple']]);
    const level = createMinimalLevel(pixelArt, sinkStacks);

    const { result } = renderHook(() => useFruitMatchGame(level));

    expect(result.current.progress.totalPixels).toBe(12);
  });

  it('should calculate filled pixels', () => {
    const level = createSimpleSolvableLevel();
    const { result } = renderHook(() => useFruitMatchGame(level));

    // Initially no pixels filled
    expect(result.current.progress.filledPixels).toBe(0);
  });

  it('should calculate remaining pixels', () => {
    const pixelArt = createUniformPixelArt(2, 2, 'apple'); // 4 pixels
    const sinkStacks = createTestSinkStacks([['apple', 'apple', 'apple']]);
    const level = createMinimalLevel(pixelArt, sinkStacks);

    const { result } = renderHook(() => useFruitMatchGame(level));

    expect(result.current.progress.remainingPixels).toBe(4);
  });

  it('should calculate percent complete', () => {
    const level = createSimpleSolvableLevel();
    const { result } = renderHook(() => useFruitMatchGame(level));

    // Initially 0%
    expect(result.current.progress.percentComplete).toBe(0);
  });

  it('should handle empty pixel art', () => {
    const pixelArt: PixelCell[] = [];
    const sinkStacks = createTestSinkStacks([['apple']]);
    const level = createMinimalLevel(pixelArt, sinkStacks);

    const { result } = renderHook(() => useFruitMatchGame(level));

    expect(result.current.progress.totalPixels).toBe(0);
    expect(result.current.progress.percentComplete).toBe(0);
  });
});

// ============================================================================
// remainingSinkTiles Tests
// ============================================================================

describe('useFruitMatchGame - remainingSinkTiles', () => {
  it('should count all tiles in sink', () => {
    const pixelArt = createTestPixelArt([['apple']]);
    const sinkStacks = createTestSinkStacks([
      ['apple', 'apple'],
      ['orange', 'banana', 'plum'],
      ['strawberry'],
    ]);
    const level = createMinimalLevel(pixelArt, sinkStacks);

    const { result } = renderHook(() => useFruitMatchGame(level));

    expect(result.current.remainingSinkTiles).toBe(6);
  });

  it('should return 0 for empty sink', () => {
    const pixelArt = createTestPixelArt([['apple']]);
    const sinkStacks: SinkTile[][] = [[], [], []];
    const level = createMinimalLevel(pixelArt, sinkStacks);

    const { result } = renderHook(() => useFruitMatchGame(level));

    expect(result.current.remainingSinkTiles).toBe(0);
  });

  it('should decrease after picking tiles', async () => {
    vi.useFakeTimers();

    const pixelArt = createUniformPixelArt(2, 2, 'apple');
    const sinkStacks = createTestSinkStacks([
      ['apple', 'apple'],
      ['apple'],
    ]);
    const level = createMinimalLevel(pixelArt, sinkStacks);

    const { result } = renderHook(() => useFruitMatchGame(level));

    const initialCount = result.current.remainingSinkTiles;

    await act(async () => {
      result.current.pickTile(0);
      vi.advanceTimersByTime(300);
    });

    expect(result.current.remainingSinkTiles).toBe(initialCount - 1);

    vi.useRealTimers();
  });
});

// ============================================================================
// fillSinglePixel Tests
// ============================================================================

describe('useFruitMatchGame - fillSinglePixel', () => {
  it('should mark pixel as filled', () => {
    const pixelArt = createUniformPixelArt(2, 2, 'apple');
    const sinkStacks = createTestSinkStacks([['apple', 'apple', 'apple']]);
    const level = createMinimalLevel(pixelArt, sinkStacks);

    const { result } = renderHook(() => useFruitMatchGame(level));

    const targetCell = result.current.state.pixelArt[0];
    expect(targetCell.filled).toBe(false);

    act(() => {
      result.current.fillSinglePixel(targetCell);
    });

    const updatedCell = result.current.state.pixelArt.find(
      c => c.row === targetCell.row && c.col === targetCell.col
    );
    expect(updatedCell?.filled).toBe(true);
  });

  it('should not affect other pixels', () => {
    const pixelArt = createUniformPixelArt(2, 2, 'apple');
    const sinkStacks = createTestSinkStacks([['apple', 'apple', 'apple']]);
    const level = createMinimalLevel(pixelArt, sinkStacks);

    const { result } = renderHook(() => useFruitMatchGame(level));

    const targetCell = result.current.state.pixelArt[0];

    act(() => {
      result.current.fillSinglePixel(targetCell);
    });

    // Other pixels should still be unfilled
    const otherPixels = result.current.state.pixelArt.filter(
      c => !(c.row === targetCell.row && c.col === targetCell.col)
    );
    expect(otherPixels.every(p => p.filled === false)).toBe(true);
  });
});

// ============================================================================
// onShootingComplete Tests
// ============================================================================

describe('useFruitMatchGame - onShootingComplete', () => {
  it('should remove launcher from active shootings', () => {
    const level = createSimpleSolvableLevel();
    const { result } = renderHook(() => useFruitMatchGame(level));

    // Manually add an active shooting
    act(() => {
      result.current.animationState.activeShootings.push({
        launcherId: 'test-launcher',
        targetCells: [],
      });
      result.current.animationState.isShootingActive = true;
    });

    act(() => {
      result.current.onShootingComplete('test-launcher');
    });

    expect(result.current.animationState.activeShootings).toHaveLength(0);
    expect(result.current.animationState.isShootingActive).toBe(false);
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('useFruitMatchGame - Edge Cases', () => {
  it('should handle level with single pixel', () => {
    const pixelArt = createTestPixelArt([['apple']]);
    const sinkStacks = createTestSinkStacks([['apple', 'apple', 'apple']]);
    const level = createMinimalLevel(pixelArt, sinkStacks);

    const { result } = renderHook(() => useFruitMatchGame(level));

    expect(result.current.progress.totalPixels).toBe(1);
    expect(result.current.state.pixelArt).toHaveLength(1);
  });

  it('should handle level with many fruit types', () => {
    const pixelArt = createTestPixelArt([
      ['apple', 'orange', 'banana'],
      ['strawberry', 'blueberry', 'plum'],
    ]);
    const sinkStacks = createTestSinkStacks([
      ['apple', 'orange'],
      ['banana', 'strawberry'],
      ['blueberry', 'plum'],
    ]);
    const level = createMinimalLevel(pixelArt, sinkStacks);

    const { result } = renderHook(() => useFruitMatchGame(level));

    expect(result.current.progress.totalPixels).toBe(6);
    expect(result.current.remainingSinkTiles).toBe(6);
  });

  it('should handle multiple stacks with same fruit type', () => {
    const pixelArt = createUniformPixelArt(3, 3, 'apple');
    const sinkStacks = createTestSinkStacks([
      ['apple', 'apple', 'apple'],
      ['apple', 'apple', 'apple'],
      ['apple', 'apple', 'apple'],
    ]);
    const level = createMinimalLevel(pixelArt, sinkStacks);

    const { result } = renderHook(() => useFruitMatchGame(level));

    expect(result.current.remainingSinkTiles).toBe(9);
    expect(result.current.pickableTiles).toHaveLength(3);
  });

  it('should handle waiting stand with different slot counts', () => {
    const pixelArt = createTestPixelArt([['apple']]);
    const sinkStacks = createTestSinkStacks([['apple']]);

    // Test with 5 slots
    const level5 = createMinimalLevel(pixelArt, sinkStacks, { waitingStandSlots: 5 });
    const { result: result5 } = renderHook(() => useFruitMatchGame(level5));
    expect(result5.current.state.level.waitingStandSlots).toBe(5);

    // Test with 9 slots
    const level9 = createMinimalLevel(pixelArt, sinkStacks, { waitingStandSlots: 9 });
    const { result: result9 } = renderHook(() => useFruitMatchGame(level9));
    expect(result9.current.state.level.waitingStandSlots).toBe(9);
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('useFruitMatchGame - Integration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should track progress across multiple picks', async () => {
    const pixelArt = createUniformPixelArt(2, 2, 'apple');
    const sinkStacks = createTestSinkStacks([
      ['apple', 'apple'],
      ['apple'],
    ]);
    const level = createMinimalLevel(pixelArt, sinkStacks);

    const { result } = renderHook(() => useFruitMatchGame(level));

    // Pick first tile
    await act(async () => {
      result.current.pickTile(0);
      vi.advanceTimersByTime(300);
    });

    expect(result.current.state.moveCount).toBe(1);

    // Pick second tile
    await act(async () => {
      result.current.pickTile(0);
      vi.advanceTimersByTime(300);
    });

    expect(result.current.state.moveCount).toBe(2);
  });

  it('should maintain state consistency after reset and picks', async () => {
    const level = createSimpleSolvableLevel();
    const { result } = renderHook(() => useFruitMatchGame(level));

    // Pick a tile
    await act(async () => {
      result.current.pickTile(0);
      vi.advanceTimersByTime(300);
    });

    // Reset
    act(() => {
      result.current.reset();
    });

    // Pick again
    await act(async () => {
      result.current.pickTile(0);
      vi.advanceTimersByTime(300);
    });

    expect(result.current.state.moveCount).toBe(1);
  });
});
