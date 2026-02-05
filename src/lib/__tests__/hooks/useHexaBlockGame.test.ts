import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useHexaBlockGame } from '../../useHexaBlockGame';
import {
  HexaBlockLevel,
  HexStack,
  StackDirection,
  GameMode,
  Carousel,
  generateStackId,
  generateCarouselId,
} from '@/types/hexaBlock';
import { AxialCoord, hexKey, HexDirection } from '@/lib/hexGrid';

// ============================================================================
// Test Helpers
// ============================================================================

function createTestStack(
  q: number,
  r: number,
  direction: StackDirection,
  options?: { height?: number; color?: string }
): HexStack {
  return {
    id: generateStackId(),
    coord: { q, r },
    direction,
    height: options?.height ?? 1,
    color: options?.color ?? '#06b6d4',
  };
}

function createTestLevel(
  stacks: HexStack[],
  options?: {
    gridRadius?: number;
    holes?: AxialCoord[];
    pauses?: AxialCoord[];
    carousels?: Carousel[];
    gameMode?: GameMode;
    parMoves?: number;
  }
): HexaBlockLevel {
  return {
    id: 'test-level',
    name: 'Test Level',
    gridRadius: options?.gridRadius ?? 2,
    stacks,
    holes: options?.holes,
    pauses: options?.pauses,
    carousels: options?.carousels,
    difficulty: 'easy',
    gameMode: options?.gameMode,
    parMoves: options?.parMoves,
  };
}

function createTestCarousel(
  q: number,
  r: number,
  arms: HexDirection[]
): Carousel {
  return {
    id: generateCarouselId(),
    coord: { q, r },
    arms,
  };
}

// ============================================================================
// Initialization Tests
// ============================================================================

describe('useHexaBlockGame - Initialization', () => {
  it('should initialize state from level', () => {
    const stacks = [createTestStack(0, 0, 'E')];
    const level = createTestLevel(stacks);

    const { result } = renderHook(() => useHexaBlockGame(level));

    expect(result.current.state.level).toBe(level);
    expect(result.current.state.moveCount).toBe(0);
    expect(result.current.state.isComplete).toBe(false);
    expect(result.current.state.isWon).toBe(false);
    expect(result.current.state.isLost).toBe(false);
    expect(result.current.state.history).toHaveLength(0);
  });

  it('should convert stacks array to Map', () => {
    const stacks = [
      createTestStack(0, 0, 'E'),
      createTestStack(1, 0, 'W'),
      createTestStack(-1, 1, 'NE'),
    ];
    const level = createTestLevel(stacks);

    const { result } = renderHook(() => useHexaBlockGame(level));

    expect(result.current.state.stacks.size).toBe(3);
    expect(result.current.state.stacks.has('0,0')).toBe(true);
    expect(result.current.state.stacks.has('1,0')).toBe(true);
    expect(result.current.state.stacks.has('-1,1')).toBe(true);
  });

  it('should initialize holes set when provided', () => {
    const stacks = [createTestStack(0, 0, 'E')];
    const holes: AxialCoord[] = [{ q: 1, r: 0 }, { q: 0, r: 1 }];
    const level = createTestLevel(stacks, { gridRadius: 2, holes });

    const { result } = renderHook(() => useHexaBlockGame(level));

    expect(result.current.state.holes.size).toBe(2);
    expect(result.current.state.holes.has('1,0')).toBe(true);
    expect(result.current.state.holes.has('0,1')).toBe(true);
  });

  it('should initialize pauses set when provided', () => {
    const stacks = [createTestStack(0, 0, 'E')];
    const pauses: AxialCoord[] = [{ q: 1, r: -1 }];
    const level = createTestLevel(stacks, { gridRadius: 2, pauses });

    const { result } = renderHook(() => useHexaBlockGame(level));

    expect(result.current.state.pauses.size).toBe(1);
    expect(result.current.state.pauses.has('1,-1')).toBe(true);
  });

  it('should initialize carousels when provided', () => {
    const stacks = [createTestStack(1, 0, 'E')];
    const carousels = [createTestCarousel(0, 0, ['E', 'W'])];
    const level = createTestLevel(stacks, { gridRadius: 2, carousels });

    const { result } = renderHook(() => useHexaBlockGame(level));

    expect(result.current.state.carousels.size).toBe(1);
    expect(result.current.state.carousels.has('0,0')).toBe(true);
  });

  it('should start with no animating stack', () => {
    const level = createTestLevel([createTestStack(0, 0, 'E')]);
    const { result } = renderHook(() => useHexaBlockGame(level));

    expect(result.current.state.animatingStack).toBeNull();
    expect(result.current.state.animationPhase).toBe('idle');
    expect(result.current.state.animationData).toBeNull();
  });

  it('should set move limit from parMoves', () => {
    const stacks = [createTestStack(0, 0, 'E')];
    const level = createTestLevel(stacks, { parMoves: 10 });

    const { result } = renderHook(() => useHexaBlockGame(level));

    expect(result.current.state.moveLimit).toBe(10);
  });
});

// ============================================================================
// getStackPath Tests
// ============================================================================

describe('useHexaBlockGame - getStackPath', () => {
  it('should return path to edge for unblocked stack', () => {
    const stacks = [createTestStack(0, 0, 'E')];
    const level = createTestLevel(stacks, { gridRadius: 2 });

    const { result } = renderHook(() => useHexaBlockGame(level));
    const stack = result.current.state.stacks.get('0,0')!;
    const pathInfo = result.current.getStackPath(stack);

    expect(pathInfo.blocked).toBe(false);
    expect(pathInfo.blockerCoord).toBeNull();
    expect(pathInfo.chosenDirection).toBe('E');
  });

  it('should return blocked path when another stack is in the way', () => {
    const stacks = [
      createTestStack(-1, 0, 'E'), // Points E, blocked by stack at (1, 0)
      createTestStack(1, 0, 'E'),  // Blocker
    ];
    const level = createTestLevel(stacks, { gridRadius: 2 });

    const { result } = renderHook(() => useHexaBlockGame(level));
    const stack = result.current.state.stacks.get('-1,0')!;
    const pathInfo = result.current.getStackPath(stack);

    expect(pathInfo.blocked).toBe(true);
    expect(pathInfo.blockerCoord).toEqual({ q: 1, r: 0 });
  });

  it('should detect hole in path', () => {
    const stacks = [createTestStack(-1, 0, 'E')];
    const holes: AxialCoord[] = [{ q: 1, r: 0 }];
    const level = createTestLevel(stacks, { gridRadius: 2, holes });

    const { result } = renderHook(() => useHexaBlockGame(level));
    const stack = result.current.state.stacks.get('-1,0')!;
    const pathInfo = result.current.getStackPath(stack);

    expect(pathInfo.holeCoord).toEqual({ q: 1, r: 0 });
    expect(pathInfo.blocked).toBe(false);
  });

  it('should detect pause in path', () => {
    const stacks = [createTestStack(-1, 0, 'E')];
    const pauses: AxialCoord[] = [{ q: 0, r: 0 }];
    const level = createTestLevel(stacks, { gridRadius: 2, pauses });

    const { result } = renderHook(() => useHexaBlockGame(level));
    const stack = result.current.state.stacks.get('-1,0')!;
    const pathInfo = result.current.getStackPath(stack);

    expect(pathInfo.pauseCoord).toEqual({ q: 0, r: 0 });
  });

  describe('Bidirectional stacks', () => {
    it('should choose direction that can exit', () => {
      // E_W bidirectional, W blocked, E clear
      const stacks = [
        createTestStack(0, 0, 'E_W'),
        createTestStack(-1, 0, 'NE'), // Blocks W direction
      ];
      const level = createTestLevel(stacks, { gridRadius: 2 });

      const { result } = renderHook(() => useHexaBlockGame(level));
      const stack = result.current.state.stacks.get('0,0')!;
      const pathInfo = result.current.getStackPath(stack);

      expect(pathInfo.chosenDirection).toBe('E');
      expect(pathInfo.blocked).toBe(false);
    });

    it('should handle both directions blocked', () => {
      const stacks = [
        createTestStack(0, 0, 'E_W'),
        createTestStack(-1, 0, 'NE'), // Blocks W
        createTestStack(1, 0, 'NW'),  // Blocks E
      ];
      const level = createTestLevel(stacks, { gridRadius: 2 });

      const { result } = renderHook(() => useHexaBlockGame(level));
      const stack = result.current.state.stacks.get('0,0')!;
      const pathInfo = result.current.getStackPath(stack);

      expect(pathInfo.blocked).toBe(true);
    });
  });
});

// ============================================================================
// canClearStack Tests
// ============================================================================

describe('useHexaBlockGame - canClearStack', () => {
  it('should return true for stack with clear path to edge', () => {
    const stacks = [createTestStack(0, 0, 'E')];
    const level = createTestLevel(stacks, { gridRadius: 2 });

    const { result } = renderHook(() => useHexaBlockGame(level));
    const stack = result.current.state.stacks.get('0,0')!;

    expect(result.current.canClearStack(stack)).toBe(true);
  });

  it('should return false for blocked stack', () => {
    const stacks = [
      createTestStack(-1, 0, 'E'),
      createTestStack(1, 0, 'E'),
    ];
    const level = createTestLevel(stacks, { gridRadius: 2 });

    const { result } = renderHook(() => useHexaBlockGame(level));
    const stack = result.current.state.stacks.get('-1,0')!;

    expect(result.current.canClearStack(stack)).toBe(false);
  });

  it('should return true when path leads to hole', () => {
    const stacks = [createTestStack(-1, 0, 'E')];
    const holes: AxialCoord[] = [{ q: 1, r: 0 }];
    const level = createTestLevel(stacks, { gridRadius: 2, holes });

    const { result } = renderHook(() => useHexaBlockGame(level));
    const stack = result.current.state.stacks.get('-1,0')!;

    expect(result.current.canClearStack(stack)).toBe(true);
  });
});

// ============================================================================
// tapStack Tests
// ============================================================================

describe('useHexaBlockGame - tapStack', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should clear a stack with free path', async () => {
    const stacks = [createTestStack(0, 0, 'E')];
    const level = createTestLevel(stacks, { gridRadius: 2 });

    const { result } = renderHook(() => useHexaBlockGame(level));

    expect(result.current.state.stacks.size).toBe(1);

    await act(async () => {
      result.current.tapStack({ q: 0, r: 0 });
      vi.advanceTimersByTime(700);
    });

    expect(result.current.state.stacks.size).toBe(0);
    expect(result.current.state.moveCount).toBe(1);
  });

  it('should add previous state to history', async () => {
    const stacks = [createTestStack(0, 0, 'E')];
    const level = createTestLevel(stacks, { gridRadius: 2 });

    const { result } = renderHook(() => useHexaBlockGame(level));

    await act(async () => {
      result.current.tapStack({ q: 0, r: 0 });
      vi.advanceTimersByTime(700);
    });

    expect(result.current.state.history).toHaveLength(1);
    expect(result.current.state.history[0].size).toBe(1);
  });

  it('should mark game complete when last stack cleared', async () => {
    const stacks = [createTestStack(0, 0, 'E')];
    const level = createTestLevel(stacks, { gridRadius: 2 });

    const { result } = renderHook(() => useHexaBlockGame(level));

    await act(async () => {
      result.current.tapStack({ q: 0, r: 0 });
      vi.advanceTimersByTime(700);
    });

    expect(result.current.state.isComplete).toBe(true);
    expect(result.current.state.isWon).toBe(true);
  });

  it('should clear stack into hole', async () => {
    const stacks = [createTestStack(-1, 0, 'E')];
    const holes: AxialCoord[] = [{ q: 1, r: 0 }];
    const level = createTestLevel(stacks, { gridRadius: 2, holes });

    const { result } = renderHook(() => useHexaBlockGame(level));

    await act(async () => {
      result.current.tapStack({ q: -1, r: 0 });
      vi.advanceTimersByTime(500);
    });

    expect(result.current.state.stacks.size).toBe(0);
    expect(result.current.state.moveCount).toBe(1);
  });

  it('should stop stack at pause cell', async () => {
    const stacks = [createTestStack(-1, 0, 'E')];
    const pauses: AxialCoord[] = [{ q: 0, r: 0 }];
    const level = createTestLevel(stacks, { gridRadius: 2, pauses });

    const { result } = renderHook(() => useHexaBlockGame(level));

    await act(async () => {
      result.current.tapStack({ q: -1, r: 0 });
      vi.advanceTimersByTime(500);
    });

    // Stack should have moved to pause position
    expect(result.current.state.stacks.has('0,0')).toBe(true);
    expect(result.current.state.stacks.has('-1,0')).toBe(false);
    expect(result.current.state.pausedStacks.size).toBe(1);
  });

  it('should do nothing when tapping empty cell', async () => {
    const stacks = [createTestStack(0, 0, 'E')];
    const level = createTestLevel(stacks, { gridRadius: 2 });

    const { result } = renderHook(() => useHexaBlockGame(level));

    await act(async () => {
      result.current.tapStack({ q: 1, r: 0 }); // No stack here
      vi.advanceTimersByTime(700);
    });

    expect(result.current.state.stacks.size).toBe(1);
    expect(result.current.state.moveCount).toBe(0);
  });

  it('should not allow taps when game is complete', async () => {
    const stacks = [createTestStack(0, 0, 'E')];
    const level = createTestLevel(stacks, { gridRadius: 2 });

    const { result } = renderHook(() => useHexaBlockGame(level));

    // Complete the game
    await act(async () => {
      result.current.tapStack({ q: 0, r: 0 });
      vi.advanceTimersByTime(700);
    });

    expect(result.current.state.isComplete).toBe(true);

    // Try to tap again
    const moveCount = result.current.state.moveCount;
    await act(async () => {
      result.current.tapStack({ q: 0, r: 0 });
      vi.advanceTimersByTime(700);
    });

    expect(result.current.state.moveCount).toBe(moveCount);
  });

  describe('Push mode', () => {
    it('should move stack to last free position when blocked', async () => {
      const stacks = [
        createTestStack(-1, 0, 'E'),
        createTestStack(1, 0, 'E'),
      ];
      const level = createTestLevel(stacks, { gridRadius: 2, gameMode: 'push' });

      const { result } = renderHook(() => useHexaBlockGame(level));

      await act(async () => {
        result.current.tapStack({ q: -1, r: 0 });
        vi.advanceTimersByTime(500);
      });

      // Stack should have moved to (0, 0)
      expect(result.current.state.stacks.has('0,0')).toBe(true);
      expect(result.current.state.stacks.has('-1,0')).toBe(false);
      expect(result.current.state.moveCount).toBe(1);
    });
  });

  describe('Classic mode', () => {
    it('should bounce back when blocked', async () => {
      const stacks = [
        createTestStack(-1, 0, 'E'),
        createTestStack(0, 0, 'E'), // Immediately adjacent blocker
      ];
      const level = createTestLevel(stacks, { gridRadius: 2, gameMode: 'classic' });

      const { result } = renderHook(() => useHexaBlockGame(level));

      await act(async () => {
        result.current.tapStack({ q: -1, r: 0 });
        vi.advanceTimersByTime(600);
      });

      // Stack should still be in original position
      expect(result.current.state.stacks.has('-1,0')).toBe(true);
      // But move count still incremented
      expect(result.current.state.moveCount).toBe(1);
    });
  });

  describe('Move limit', () => {
    it('should set isLost when move limit exceeded', async () => {
      const stacks = [
        createTestStack(-1, 0, 'E'),
        createTestStack(0, 0, 'E'),
      ];
      const level = createTestLevel(stacks, { gridRadius: 2, parMoves: 1, gameMode: 'classic' });

      const { result } = renderHook(() => useHexaBlockGame(level));

      // First move (blocked bounce)
      await act(async () => {
        result.current.tapStack({ q: -1, r: 0 });
        vi.advanceTimersByTime(600);
      });

      expect(result.current.state.moveCount).toBe(1);
      expect(result.current.state.isLost).toBe(true);
    });
  });
});

// ============================================================================
// tapCarousel Tests
// ============================================================================

describe('useHexaBlockGame - tapCarousel', () => {
  it('should rotate stacks clockwise on carousel arms', () => {
    // Carousel at center with E and W arms
    const stacks = [createTestStack(1, 0, 'NE')]; // Stack on E arm
    const carousels = [createTestCarousel(0, 0, ['E', 'W'])];
    const level = createTestLevel(stacks, { gridRadius: 2, carousels });

    const { result } = renderHook(() => useHexaBlockGame(level));

    act(() => {
      result.current.tapCarousel({ q: 0, r: 0 });
    });

    // Stack should have moved from E arm (1,0) to W arm (-1,0)
    expect(result.current.state.stacks.has('-1,0')).toBe(true);
    expect(result.current.state.stacks.has('1,0')).toBe(false);
    expect(result.current.state.moveCount).toBe(1);
  });

  it('should do nothing when no stacks on carousel arms', () => {
    const stacks = [createTestStack(0, 1, 'E')]; // Not on carousel arm
    const carousels = [createTestCarousel(0, 0, ['E', 'W'])];
    const level = createTestLevel(stacks, { gridRadius: 2, carousels });

    const { result } = renderHook(() => useHexaBlockGame(level));

    act(() => {
      result.current.tapCarousel({ q: 0, r: 0 });
    });

    // Nothing should change
    expect(result.current.state.stacks.has('0,1')).toBe(true);
    expect(result.current.state.moveCount).toBe(0);
  });

  it('should do nothing when tapping non-carousel cell', () => {
    const stacks = [createTestStack(0, 0, 'E')];
    const level = createTestLevel(stacks, { gridRadius: 2 });

    const { result } = renderHook(() => useHexaBlockGame(level));

    act(() => {
      result.current.tapCarousel({ q: 1, r: 0 }); // No carousel here
    });

    expect(result.current.state.moveCount).toBe(0);
  });
});

// ============================================================================
// Undo Tests
// ============================================================================

describe('useHexaBlockGame - undo', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should restore previous stack state', async () => {
    const stacks = [
      createTestStack(0, 0, 'E'),
      createTestStack(0, 1, 'SE'),
    ];
    const level = createTestLevel(stacks, { gridRadius: 2 });

    const { result } = renderHook(() => useHexaBlockGame(level));

    // Clear first stack
    await act(async () => {
      result.current.tapStack({ q: 0, r: 0 });
      vi.advanceTimersByTime(700);
    });

    expect(result.current.state.stacks.size).toBe(1);
    expect(result.current.state.moveCount).toBe(1);

    // Undo
    act(() => {
      result.current.undo();
    });

    expect(result.current.state.stacks.size).toBe(2);
    expect(result.current.state.moveCount).toBe(0);
    expect(result.current.state.history).toHaveLength(0);
  });

  it('should do nothing when no history', () => {
    const stacks = [createTestStack(0, 0, 'E')];
    const level = createTestLevel(stacks, { gridRadius: 2 });

    const { result } = renderHook(() => useHexaBlockGame(level));

    act(() => {
      result.current.undo();
    });

    expect(result.current.state.stacks.size).toBe(1);
    expect(result.current.state.moveCount).toBe(0);
  });

  it('should reset win/lose state on undo', async () => {
    const stacks = [createTestStack(0, 0, 'E')];
    const level = createTestLevel(stacks, { gridRadius: 2 });

    const { result } = renderHook(() => useHexaBlockGame(level));

    // Win the game
    await act(async () => {
      result.current.tapStack({ q: 0, r: 0 });
      vi.advanceTimersByTime(700);
    });

    expect(result.current.state.isWon).toBe(true);

    // Undo
    act(() => {
      result.current.undo();
    });

    expect(result.current.state.isWon).toBe(false);
    expect(result.current.state.isComplete).toBe(false);
    expect(result.current.state.isLost).toBe(false);
  });
});

// ============================================================================
// Reset Tests
// ============================================================================

describe('useHexaBlockGame - reset', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should restore initial state', async () => {
    const stacks = [
      createTestStack(0, 0, 'E'),
      createTestStack(0, 1, 'SE'),
    ];
    const level = createTestLevel(stacks, { gridRadius: 2 });

    const { result } = renderHook(() => useHexaBlockGame(level));

    // Make some moves
    await act(async () => {
      result.current.tapStack({ q: 0, r: 0 });
      vi.advanceTimersByTime(700);
    });

    expect(result.current.state.stacks.size).toBe(1);

    // Reset
    act(() => {
      result.current.reset();
    });

    expect(result.current.state.stacks.size).toBe(2);
    expect(result.current.state.moveCount).toBe(0);
    expect(result.current.state.history).toHaveLength(0);
    expect(result.current.state.isComplete).toBe(false);
    expect(result.current.state.isWon).toBe(false);
    expect(result.current.state.isLost).toBe(false);
  });
});

// ============================================================================
// loadLevel Tests
// ============================================================================

describe('useHexaBlockGame - loadLevel', () => {
  it('should load a new level', () => {
    const level1 = createTestLevel([createTestStack(0, 0, 'E')], { gridRadius: 2 });
    const level2 = createTestLevel([
      createTestStack(0, 0, 'NE'),
      createTestStack(1, 0, 'SW'),
    ], { gridRadius: 3 });

    const { result } = renderHook(() => useHexaBlockGame(level1));

    expect(result.current.state.stacks.size).toBe(1);
    expect(result.current.state.level.gridRadius).toBe(2);

    act(() => {
      result.current.loadLevel(level2);
    });

    expect(result.current.state.stacks.size).toBe(2);
    expect(result.current.state.level.gridRadius).toBe(3);
    expect(result.current.state.moveCount).toBe(0);
  });
});

// ============================================================================
// clearableStacks Tests
// ============================================================================

describe('useHexaBlockGame - clearableStacks', () => {
  it('should return keys of all clearable stacks', () => {
    const stacks = [
      createTestStack(0, -1, 'NE'), // Can clear (NE exits grid)
      createTestStack(0, 1, 'SE'),  // Can clear (SE exits grid)
      createTestStack(-1, 0, 'E'),
      createTestStack(1, 0, 'W'),   // These two block each other
    ];
    const level = createTestLevel(stacks, { gridRadius: 2 });

    const { result } = renderHook(() => useHexaBlockGame(level));

    expect(result.current.clearableStacks).toContain('0,-1');
    expect(result.current.clearableStacks).toContain('0,1');
    expect(result.current.clearableStacks).not.toContain('-1,0');
    expect(result.current.clearableStacks).not.toContain('1,0');
  });

  it('should return empty array when no stacks can be cleared', () => {
    const stacks = [
      createTestStack(-1, 0, 'E'),
      createTestStack(1, 0, 'W'),
    ];
    const level = createTestLevel(stacks, { gridRadius: 2 });

    const { result } = renderHook(() => useHexaBlockGame(level));

    expect(result.current.clearableStacks).toHaveLength(0);
  });
});

// ============================================================================
// isSolvable Tests
// ============================================================================

describe('useHexaBlockGame - isSolvable', () => {
  it('should return true when clearable stacks exist', () => {
    const stacks = [createTestStack(0, 0, 'E')];
    const level = createTestLevel(stacks, { gridRadius: 2 });

    const { result } = renderHook(() => useHexaBlockGame(level));

    expect(result.current.isSolvable).toBe(true);
  });

  it('should return false when in deadlock', () => {
    const stacks = [
      createTestStack(-1, 0, 'E'),
      createTestStack(1, 0, 'W'),
    ];
    const level = createTestLevel(stacks, { gridRadius: 2 });

    const { result } = renderHook(() => useHexaBlockGame(level));

    expect(result.current.isSolvable).toBe(false);
  });

  it('should return true when game is already complete', async () => {
    vi.useFakeTimers();

    const stacks = [createTestStack(0, 0, 'E')];
    const level = createTestLevel(stacks, { gridRadius: 2 });

    const { result } = renderHook(() => useHexaBlockGame(level));

    await act(async () => {
      result.current.tapStack({ q: 0, r: 0 });
      vi.advanceTimersByTime(700);
    });

    expect(result.current.state.isComplete).toBe(true);
    expect(result.current.isSolvable).toBe(true);

    vi.useRealTimers();
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('useHexaBlockGame - Edge Cases', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should handle empty level', () => {
    const level = createTestLevel([], { gridRadius: 2 });
    const { result } = renderHook(() => useHexaBlockGame(level));

    expect(result.current.state.stacks.size).toBe(0);
    expect(result.current.state.isComplete).toBe(false);
  });

  it('should handle stack at grid boundary pointing out', async () => {
    // Stack at edge pointing outward
    const stacks = [createTestStack(2, 0, 'E')];
    const level = createTestLevel(stacks, { gridRadius: 2 });

    const { result } = renderHook(() => useHexaBlockGame(level));

    expect(result.current.canClearStack(result.current.state.stacks.get('2,0')!)).toBe(true);

    await act(async () => {
      result.current.tapStack({ q: 2, r: 0 });
      vi.advanceTimersByTime(700);
    });

    expect(result.current.state.stacks.size).toBe(0);
  });

  it('should handle multiple undo operations', async () => {
    const stacks = [
      createTestStack(0, 0, 'E'),
      createTestStack(0, 1, 'SE'),
    ];
    const level = createTestLevel(stacks, { gridRadius: 2 });

    const { result } = renderHook(() => useHexaBlockGame(level));

    // Clear first stack
    await act(async () => {
      result.current.tapStack({ q: 0, r: 0 });
      vi.advanceTimersByTime(700);
    });

    // Clear second stack
    await act(async () => {
      result.current.tapStack({ q: 0, r: 1 });
      vi.advanceTimersByTime(700);
    });

    expect(result.current.state.stacks.size).toBe(0);
    expect(result.current.state.history).toHaveLength(2);

    // Undo twice
    act(() => {
      result.current.undo();
    });
    expect(result.current.state.stacks.size).toBe(1);

    act(() => {
      result.current.undo();
    });
    expect(result.current.state.stacks.size).toBe(2);
    expect(result.current.state.history).toHaveLength(0);
  });
});
