import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSquareBlockGame } from '../../useSquareBlockGame';
import { SquareBlockLevel, SquareBlock, MAX_MISTAKES } from '@/types/squareBlock';
import { GridCoord, gridKey } from '@/lib/squareGrid';
import {
  createTestBlock,
  createTestLevel,
  createBlockGrid,
  createClearableLevel,
  createDeadlockLevel,
} from '../helpers/squareBlockTestHelpers';

// ============================================================================
// Test Setup
// ============================================================================

// Helper to create simple test levels
function createSimpleLevel(blocks: SquareBlock[], options?: {
  rows?: number;
  cols?: number;
  holes?: GridCoord[];
  gameMode?: 'classic' | 'push';
}): SquareBlockLevel {
  return createTestLevel(blocks, options);
}

// ============================================================================
// Initialization Tests
// ============================================================================

describe('useSquareBlockGame - Initialization', () => {
  it('should initialize state from level', () => {
    const blocks = [createTestBlock(1, 1, 'E')];
    const level = createSimpleLevel(blocks, { rows: 3, cols: 3 });

    const { result } = renderHook(() => useSquareBlockGame(level));

    expect(result.current.state.level).toBe(level);
    expect(result.current.state.moveCount).toBe(0);
    expect(result.current.state.mistakes).toBe(0);
    expect(result.current.state.isComplete).toBe(false);
    expect(result.current.state.isWon).toBe(false);
    expect(result.current.state.isLost).toBe(false);
    expect(result.current.state.history).toHaveLength(0);
  });

  it('should convert blocks array to Map', () => {
    const blocks = [
      createTestBlock(0, 0, 'N'),
      createTestBlock(1, 1, 'E'),
      createTestBlock(2, 2, 'S'),
    ];
    const level = createSimpleLevel(blocks, { rows: 3, cols: 3 });

    const { result } = renderHook(() => useSquareBlockGame(level));

    expect(result.current.state.blocks.size).toBe(3);
    expect(result.current.state.blocks.has('0,0')).toBe(true);
    expect(result.current.state.blocks.has('1,1')).toBe(true);
    expect(result.current.state.blocks.has('2,2')).toBe(true);
  });

  it('should initialize holes set when provided', () => {
    const blocks = [createTestBlock(0, 0, 'E')];
    const holes: GridCoord[] = [{ row: 0, col: 2 }, { row: 1, col: 1 }];
    const level = createSimpleLevel(blocks, { rows: 3, cols: 3, holes });

    const { result } = renderHook(() => useSquareBlockGame(level));

    expect(result.current.state.holes.size).toBe(2);
    expect(result.current.state.holes.has('0,2')).toBe(true);
    expect(result.current.state.holes.has('1,1')).toBe(true);
  });

  it('should initialize with empty holes set when not provided', () => {
    const blocks = [createTestBlock(0, 0, 'E')];
    const level = createSimpleLevel(blocks, { rows: 3, cols: 3 });

    const { result } = renderHook(() => useSquareBlockGame(level));

    expect(result.current.state.holes.size).toBe(0);
  });

  it('should start with no animating block', () => {
    const level = createClearableLevel();
    const { result } = renderHook(() => useSquareBlockGame(level));

    expect(result.current.state.animatingBlock).toBeNull();
    expect(result.current.state.animationPhase).toBe('idle');
    expect(result.current.state.animationData).toBeNull();
  });
});

// ============================================================================
// getBlockPath Tests
// ============================================================================

describe('useSquareBlockGame - getBlockPath', () => {
  it('should return path to edge for unblocked block', () => {
    const blocks = [createTestBlock(1, 1, 'E')]; // Points East
    const level = createSimpleLevel(blocks, { rows: 3, cols: 3 });

    const { result } = renderHook(() => useSquareBlockGame(level));
    const block = result.current.state.blocks.get('1,1')!;
    const pathInfo = result.current.getBlockPath(block);

    expect(pathInfo.blocked).toBe(false);
    expect(pathInfo.blockerCoord).toBeNull();
    expect(pathInfo.chosenDirection).toBe('E');
  });

  it('should return blocked path when another block is in the way', () => {
    const blocks = [
      createTestBlock(1, 0, 'E'), // Points East, blocked by next block
      createTestBlock(1, 2, 'E'), // Blocker
    ];
    const level = createSimpleLevel(blocks, { rows: 3, cols: 3 });

    const { result } = renderHook(() => useSquareBlockGame(level));
    const block = result.current.state.blocks.get('1,0')!;
    const pathInfo = result.current.getBlockPath(block);

    expect(pathInfo.blocked).toBe(true);
    expect(pathInfo.blockerCoord).toEqual({ row: 1, col: 2 });
  });

  it('should detect hole in path', () => {
    const blocks = [createTestBlock(1, 0, 'E')];
    const holes: GridCoord[] = [{ row: 1, col: 2 }];
    const level = createSimpleLevel(blocks, { rows: 3, cols: 3, holes });

    const { result } = renderHook(() => useSquareBlockGame(level));
    const block = result.current.state.blocks.get('1,0')!;
    const pathInfo = result.current.getBlockPath(block);

    expect(pathInfo.holeCoord).toEqual({ row: 1, col: 2 });
    expect(pathInfo.blocked).toBe(false); // Hole doesn't block, it catches
  });

  describe('Bidirectional blocks', () => {
    it('should choose N_S direction with shorter unblocked path', () => {
      // Block at row 1 with N_S direction
      // N direction: 1 cell to edge (row 0)
      // S direction: 1 cell to edge (row 2)
      // Both equal, should pick first (N)
      const blocks = [createTestBlock(1, 1, 'N_S')];
      const level = createSimpleLevel(blocks, { rows: 3, cols: 3 });

      const { result } = renderHook(() => useSquareBlockGame(level));
      const block = result.current.state.blocks.get('1,1')!;
      const pathInfo = result.current.getBlockPath(block);

      expect(['N', 'S']).toContain(pathInfo.chosenDirection);
      expect(pathInfo.blocked).toBe(false);
    });

    it('should choose E_W direction that can exit when other is blocked', () => {
      // Block at col 1 with E_W, W blocked by another block
      const blocks = [
        createTestBlock(1, 1, 'E_W'),
        createTestBlock(1, 0, 'N'), // Blocks W direction
      ];
      const level = createSimpleLevel(blocks, { rows: 3, cols: 3 });

      const { result } = renderHook(() => useSquareBlockGame(level));
      const block = result.current.state.blocks.get('1,1')!;
      const pathInfo = result.current.getBlockPath(block);

      expect(pathInfo.chosenDirection).toBe('E');
      expect(pathInfo.blocked).toBe(false);
    });

    it('should handle both directions blocked', () => {
      const blocks = [
        createTestBlock(1, 1, 'N_S'),
        createTestBlock(0, 1, 'E'), // Blocks N
        createTestBlock(2, 1, 'E'), // Blocks S
      ];
      const level = createSimpleLevel(blocks, { rows: 3, cols: 3 });

      const { result } = renderHook(() => useSquareBlockGame(level));
      const block = result.current.state.blocks.get('1,1')!;
      const pathInfo = result.current.getBlockPath(block);

      expect(pathInfo.blocked).toBe(true);
    });
  });

  describe('Mirror blocks', () => {
    it('should move opposite to arrow direction', () => {
      // Mirror block pointing N should move S
      const blocks = [createTestBlock(1, 1, 'N', { mirror: true })];
      const level = createSimpleLevel(blocks, { rows: 3, cols: 3 });

      const { result } = renderHook(() => useSquareBlockGame(level));
      const block = result.current.state.blocks.get('1,1')!;
      const pathInfo = result.current.getBlockPath(block);

      expect(pathInfo.chosenDirection).toBe('S');
    });

    it('should reverse E to W for mirror blocks', () => {
      const blocks = [createTestBlock(1, 1, 'E', { mirror: true })];
      const level = createSimpleLevel(blocks, { rows: 3, cols: 3 });

      const { result } = renderHook(() => useSquareBlockGame(level));
      const block = result.current.state.blocks.get('1,1')!;
      const pathInfo = result.current.getBlockPath(block);

      expect(pathInfo.chosenDirection).toBe('W');
    });
  });
});

// ============================================================================
// canClearBlock Tests
// ============================================================================

describe('useSquareBlockGame - canClearBlock', () => {
  it('should return true for block with clear path to edge', () => {
    const blocks = [createTestBlock(1, 1, 'E')];
    const level = createSimpleLevel(blocks, { rows: 3, cols: 3 });

    const { result } = renderHook(() => useSquareBlockGame(level));
    const block = result.current.state.blocks.get('1,1')!;

    expect(result.current.canClearBlock(block)).toBe(true);
  });

  it('should return false for blocked block', () => {
    const blocks = [
      createTestBlock(1, 0, 'E'),
      createTestBlock(1, 2, 'E'), // Blocks first block
    ];
    const level = createSimpleLevel(blocks, { rows: 3, cols: 3 });

    const { result } = renderHook(() => useSquareBlockGame(level));
    const block = result.current.state.blocks.get('1,0')!;

    expect(result.current.canClearBlock(block)).toBe(false);
  });

  it('should return true when path leads to hole', () => {
    const blocks = [createTestBlock(1, 0, 'E')];
    const holes: GridCoord[] = [{ row: 1, col: 2 }];
    const level = createSimpleLevel(blocks, { rows: 3, cols: 3, holes });

    const { result } = renderHook(() => useSquareBlockGame(level));
    const block = result.current.state.blocks.get('1,0')!;

    expect(result.current.canClearBlock(block)).toBe(true);
  });

  it('should return false for locked block with neighbors', () => {
    const blocks = [
      createTestBlock(1, 1, 'E', { locked: true }),
      createTestBlock(1, 0, 'N'), // Neighbor to the west
    ];
    const level = createSimpleLevel(blocks, { rows: 3, cols: 3 });

    const { result } = renderHook(() => useSquareBlockGame(level));
    const block = result.current.state.blocks.get('1,1')!;

    expect(result.current.canClearBlock(block)).toBe(false);
  });

  it('should return true for locked block without neighbors', () => {
    const blocks = [
      createTestBlock(1, 1, 'E', { locked: true }),
      // No adjacent blocks
    ];
    const level = createSimpleLevel(blocks, { rows: 3, cols: 3 });

    const { result } = renderHook(() => useSquareBlockGame(level));
    const block = result.current.state.blocks.get('1,1')!;

    expect(result.current.canClearBlock(block)).toBe(true);
  });
});

// ============================================================================
// isBlockUnlocked Tests
// ============================================================================

describe('useSquareBlockGame - isBlockUnlocked', () => {
  it('should return true for normal block (not locked)', () => {
    const blocks = [createTestBlock(1, 1, 'E')];
    const level = createSimpleLevel(blocks, { rows: 3, cols: 3 });

    const { result } = renderHook(() => useSquareBlockGame(level));
    const block = result.current.state.blocks.get('1,1')!;

    expect(result.current.isBlockUnlocked(block)).toBe(true);
  });

  it('should return false for locked block with neighbors', () => {
    const blocks = [
      createTestBlock(1, 1, 'E', { locked: true }),
      createTestBlock(1, 2, 'N'), // East neighbor
    ];
    const level = createSimpleLevel(blocks, { rows: 3, cols: 3 });

    const { result } = renderHook(() => useSquareBlockGame(level));
    const block = result.current.state.blocks.get('1,1')!;

    expect(result.current.isBlockUnlocked(block)).toBe(false);
  });

  it('should return true for locked block without neighbors', () => {
    const blocks = [createTestBlock(1, 1, 'E', { locked: true })];
    const level = createSimpleLevel(blocks, { rows: 3, cols: 3 });

    const { result } = renderHook(() => useSquareBlockGame(level));
    const block = result.current.state.blocks.get('1,1')!;

    expect(result.current.isBlockUnlocked(block)).toBe(true);
  });

  describe('Timed gates', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should return false before unlock threshold', () => {
      const blocks = [createTestBlock(1, 1, 'E', { locked: true, unlockAfterMoves: 3 })];
      const level = createSimpleLevel(blocks, { rows: 3, cols: 3 });

      const { result } = renderHook(() => useSquareBlockGame(level));
      const block = result.current.state.blocks.get('1,1')!;

      // moveCount is 0, threshold is 3
      expect(result.current.isBlockUnlocked(block)).toBe(false);
    });

    it('should return true at unlock threshold', async () => {
      // Create a level where we can make moves to reach the threshold
      // Use 4 rows to ensure blocks can exit without blocking the timed gate
      const blocks = [
        createTestBlock(0, 0, 'N'), // Can clear (exits top)
        createTestBlock(0, 1, 'N'), // Can clear (exits top)
        createTestBlock(0, 2, 'N'), // Can clear (exits top)
        createTestBlock(2, 1, 'E', { locked: true, unlockAfterMoves: 3 }),
      ];
      const level = createSimpleLevel(blocks, { rows: 4, cols: 4 });

      const { result } = renderHook(() => useSquareBlockGame(level));

      // Initially locked
      let timedBlock = result.current.state.blocks.get('2,1')!;
      expect(result.current.isBlockUnlocked(timedBlock)).toBe(false);

      // Clear 3 blocks with proper timing
      await act(async () => {
        result.current.tapBlock({ row: 0, col: 0 });
        vi.advanceTimersByTime(700);
      });
      expect(result.current.state.moveCount).toBe(1);

      await act(async () => {
        result.current.tapBlock({ row: 0, col: 1 });
        vi.advanceTimersByTime(700);
      });
      expect(result.current.state.moveCount).toBe(2);

      await act(async () => {
        result.current.tapBlock({ row: 0, col: 2 });
        vi.advanceTimersByTime(700);
      });
      expect(result.current.state.moveCount).toBe(3);

      // Now should be unlocked
      timedBlock = result.current.state.blocks.get('2,1')!;
      expect(result.current.isBlockUnlocked(timedBlock)).toBe(true);
    });
  });

  describe('Ice mechanic', () => {
    it('should return false for iced block before threshold', () => {
      const blocks = [createTestBlock(1, 1, 'E', { iceCount: 2 })];
      const level = createSimpleLevel(blocks, { rows: 3, cols: 3 });

      const { result } = renderHook(() => useSquareBlockGame(level));
      const block = result.current.state.blocks.get('1,1')!;

      expect(result.current.isBlockUnlocked(block)).toBe(false);
    });
  });
});

// ============================================================================
// getRemainingIce Tests
// ============================================================================

describe('useSquareBlockGame - getRemainingIce', () => {
  it('should return null for non-iced block', () => {
    const blocks = [createTestBlock(1, 1, 'E')];
    const level = createSimpleLevel(blocks, { rows: 3, cols: 3 });

    const { result } = renderHook(() => useSquareBlockGame(level));
    const block = result.current.state.blocks.get('1,1')!;

    expect(result.current.getRemainingIce(block)).toBeNull();
  });

  it('should return initial ice count at start', () => {
    const blocks = [createTestBlock(1, 1, 'E', { iceCount: 5 })];
    const level = createSimpleLevel(blocks, { rows: 3, cols: 3 });

    const { result } = renderHook(() => useSquareBlockGame(level));
    const block = result.current.state.blocks.get('1,1')!;

    expect(result.current.getRemainingIce(block)).toBe(5);
  });

  it('should return 0 when ice is depleted', async () => {
    vi.useFakeTimers();

    const blocks = [
      createTestBlock(0, 0, 'N'), // Exits top, doesn't hit iced block
      createTestBlock(0, 2, 'N'), // Exits top
      createTestBlock(2, 1, 'E', { iceCount: 2 }),
    ];
    const level = createSimpleLevel(blocks, { rows: 4, cols: 4 });

    const { result } = renderHook(() => useSquareBlockGame(level));

    // Clear 2 blocks
    await act(async () => {
      result.current.tapBlock({ row: 0, col: 0 });
      vi.advanceTimersByTime(700);
    });
    expect(result.current.state.moveCount).toBe(1);

    await act(async () => {
      result.current.tapBlock({ row: 0, col: 2 });
      vi.advanceTimersByTime(700);
    });
    expect(result.current.state.moveCount).toBe(2);

    const icedBlock = result.current.state.blocks.get('2,1')!;
    expect(result.current.getRemainingIce(icedBlock)).toBe(0);

    vi.useRealTimers();
  });
});

// ============================================================================
// tapBlock Tests
// ============================================================================

describe('useSquareBlockGame - tapBlock Success Cases', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should clear a block with free path', async () => {
    const blocks = [createTestBlock(1, 1, 'E')];
    const level = createSimpleLevel(blocks, { rows: 3, cols: 3 });

    const { result } = renderHook(() => useSquareBlockGame(level));

    expect(result.current.state.blocks.size).toBe(1);

    await act(async () => {
      result.current.tapBlock({ row: 1, col: 1 });
      vi.advanceTimersByTime(700);
    });

    expect(result.current.state.blocks.size).toBe(0);
    expect(result.current.state.moveCount).toBe(1);
  });

  it('should add previous state to history', async () => {
    const blocks = [createTestBlock(1, 1, 'E')];
    const level = createSimpleLevel(blocks, { rows: 3, cols: 3 });

    const { result } = renderHook(() => useSquareBlockGame(level));

    await act(async () => {
      result.current.tapBlock({ row: 1, col: 1 });
      vi.advanceTimersByTime(700);
    });

    expect(result.current.state.history).toHaveLength(1);
    expect(result.current.state.history[0].size).toBe(1); // Had 1 block before
  });

  it('should mark game complete when last block cleared', async () => {
    const blocks = [createTestBlock(1, 1, 'E')];
    const level = createSimpleLevel(blocks, { rows: 3, cols: 3 });

    const { result } = renderHook(() => useSquareBlockGame(level));

    await act(async () => {
      result.current.tapBlock({ row: 1, col: 1 });
      vi.advanceTimersByTime(700);
    });

    expect(result.current.state.isComplete).toBe(true);
    expect(result.current.state.isWon).toBe(true);
  });

  it('should not complete when blocks remain', async () => {
    const blocks = [
      createTestBlock(0, 1, 'N'),
      createTestBlock(2, 1, 'S'),
    ];
    const level = createSimpleLevel(blocks, { rows: 3, cols: 3 });

    const { result } = renderHook(() => useSquareBlockGame(level));

    await act(async () => {
      result.current.tapBlock({ row: 0, col: 1 });
      vi.advanceTimersByTime(700);
    });

    expect(result.current.state.blocks.size).toBe(1);
    expect(result.current.state.isComplete).toBe(false);
  });

  it('should clear block into hole', async () => {
    const blocks = [createTestBlock(1, 0, 'E')];
    const holes: GridCoord[] = [{ row: 1, col: 2 }];
    const level = createSimpleLevel(blocks, { rows: 3, cols: 3, holes });

    const { result } = renderHook(() => useSquareBlockGame(level));

    await act(async () => {
      result.current.tapBlock({ row: 1, col: 0 });
      vi.advanceTimersByTime(500);
    });

    expect(result.current.state.blocks.size).toBe(0);
    expect(result.current.state.moveCount).toBe(1);
  });
});

describe('useSquareBlockGame - tapBlock Failure Cases', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should do nothing when tapping empty cell', async () => {
    const blocks = [createTestBlock(0, 0, 'E')];
    const level = createSimpleLevel(blocks, { rows: 3, cols: 3 });

    const { result } = renderHook(() => useSquareBlockGame(level));

    await act(async () => {
      result.current.tapBlock({ row: 1, col: 1 }); // No block here
      vi.advanceTimersByTime(700);
    });

    expect(result.current.state.blocks.size).toBe(1);
    expect(result.current.state.moveCount).toBe(0);
    expect(result.current.state.mistakes).toBe(0);
  });

  it('should increment mistakes when tapping blocked block in classic mode', async () => {
    const blocks = [
      createTestBlock(1, 0, 'E'),
      createTestBlock(1, 2, 'E'), // Blocks first block
    ];
    const level = createSimpleLevel(blocks, { rows: 3, cols: 3, gameMode: 'classic' });

    const { result } = renderHook(() => useSquareBlockGame(level));

    await act(async () => {
      result.current.tapBlock({ row: 1, col: 0 });
      vi.advanceTimersByTime(700);
    });

    expect(result.current.state.mistakes).toBe(1);
    expect(result.current.state.blocks.size).toBe(2); // No block removed
  });

  it('should increment mistakes when tapping locked block', async () => {
    const blocks = [
      createTestBlock(1, 1, 'E', { locked: true }),
      createTestBlock(1, 2, 'N'), // Creates neighbor to the east
    ];
    const level = createSimpleLevel(blocks, { rows: 3, cols: 3 });

    const { result } = renderHook(() => useSquareBlockGame(level));

    await act(async () => {
      result.current.tapBlock({ row: 1, col: 1 });
      vi.advanceTimersByTime(700);
    });

    expect(result.current.state.mistakes).toBe(1);
    // Note: lastMistakeBlockId is cleared after 600ms timeout
    // We can't reliably check it after 700ms
  });

  it('should lose game after MAX_MISTAKES', async () => {
    const blocks = [
      createTestBlock(1, 1, 'E', { locked: true }),
      createTestBlock(1, 0, 'N'),
    ];
    const level = createSimpleLevel(blocks, { rows: 3, cols: 3 });

    const { result } = renderHook(() => useSquareBlockGame(level));

    // Make MAX_MISTAKES (3) mistakes
    for (let i = 0; i < MAX_MISTAKES; i++) {
      await act(async () => {
        result.current.tapBlock({ row: 1, col: 1 });
        vi.advanceTimersByTime(700);
      });
    }

    expect(result.current.state.mistakes).toBe(MAX_MISTAKES);
    expect(result.current.state.isLost).toBe(true);
  });

  it('should not allow taps when game is complete', async () => {
    const blocks = [createTestBlock(1, 1, 'E')];
    const level = createSimpleLevel(blocks, { rows: 3, cols: 3 });

    const { result } = renderHook(() => useSquareBlockGame(level));

    // Complete the game
    await act(async () => {
      result.current.tapBlock({ row: 1, col: 1 });
      vi.advanceTimersByTime(700);
    });

    expect(result.current.state.isComplete).toBe(true);

    // Try to tap again (should do nothing)
    const moveCount = result.current.state.moveCount;
    await act(async () => {
      result.current.tapBlock({ row: 0, col: 0 });
      vi.advanceTimersByTime(700);
    });

    expect(result.current.state.moveCount).toBe(moveCount);
  });

  it('should not allow taps when game is lost', async () => {
    const blocks = [
      createTestBlock(1, 1, 'E', { locked: true }),
      createTestBlock(1, 0, 'N'),
    ];
    const level = createSimpleLevel(blocks, { rows: 3, cols: 3 });

    const { result } = renderHook(() => useSquareBlockGame(level));

    // Lose the game
    for (let i = 0; i < MAX_MISTAKES; i++) {
      await act(async () => {
        result.current.tapBlock({ row: 1, col: 1 });
        vi.advanceTimersByTime(700);
      });
    }

    expect(result.current.state.isLost).toBe(true);

    // Try to tap again
    const mistakes = result.current.state.mistakes;
    await act(async () => {
      result.current.tapBlock({ row: 1, col: 1 });
      vi.advanceTimersByTime(700);
    });

    expect(result.current.state.mistakes).toBe(mistakes);
  });

  it('should not allow taps during animation', async () => {
    const blocks = [
      createTestBlock(0, 1, 'N'),
      createTestBlock(2, 1, 'S'),
    ];
    const level = createSimpleLevel(blocks, { rows: 3, cols: 3 });

    const { result } = renderHook(() => useSquareBlockGame(level));

    // Start first tap (begins animation)
    act(() => {
      result.current.tapBlock({ row: 0, col: 1 });
    });

    // Try to tap second block immediately (during animation)
    act(() => {
      result.current.tapBlock({ row: 2, col: 1 });
    });

    // Only first block should be affected
    expect(result.current.state.animatingBlock).toBe('block-0-1');
  });
});

// ============================================================================
// Push Mode Tests
// ============================================================================

describe('useSquareBlockGame - Push Mode', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should move block to last free position when blocked', async () => {
    const blocks = [
      createTestBlock(1, 0, 'E'),
      createTestBlock(1, 2, 'E'), // Blocks at col 2
    ];
    const level = createSimpleLevel(blocks, { rows: 3, cols: 3, gameMode: 'push' });

    const { result } = renderHook(() => useSquareBlockGame(level));

    await act(async () => {
      result.current.tapBlock({ row: 1, col: 0 });
      vi.advanceTimersByTime(500);
    });

    // Block should have moved to (1, 1)
    expect(result.current.state.blocks.has('1,0')).toBe(false);
    expect(result.current.state.blocks.has('1,1')).toBe(true);
    expect(result.current.state.moveCount).toBe(1);
    expect(result.current.state.mistakes).toBe(0); // No mistake in push mode
  });

  it('should increment mistake when no space to push', async () => {
    const blocks = [
      createTestBlock(1, 0, 'E'),
      createTestBlock(1, 1, 'E'), // Immediately adjacent, no space
    ];
    const level = createSimpleLevel(blocks, { rows: 3, cols: 3, gameMode: 'push' });

    const { result } = renderHook(() => useSquareBlockGame(level));

    await act(async () => {
      result.current.tapBlock({ row: 1, col: 0 });
      vi.advanceTimersByTime(700);
    });

    expect(result.current.state.mistakes).toBe(1);
    expect(result.current.state.blocks.has('1,0')).toBe(true); // Block didn't move
  });
});

// ============================================================================
// Undo Tests
// ============================================================================

describe('useSquareBlockGame - Undo', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should restore previous block state', async () => {
    const blocks = [
      createTestBlock(0, 1, 'N'),
      createTestBlock(2, 1, 'S'),
    ];
    const level = createSimpleLevel(blocks, { rows: 3, cols: 3 });

    const { result } = renderHook(() => useSquareBlockGame(level));

    // Clear first block
    await act(async () => {
      result.current.tapBlock({ row: 0, col: 1 });
      vi.advanceTimersByTime(700);
    });

    expect(result.current.state.blocks.size).toBe(1);
    expect(result.current.state.moveCount).toBe(1);

    // Undo
    act(() => {
      result.current.undo();
    });

    expect(result.current.state.blocks.size).toBe(2);
    expect(result.current.state.moveCount).toBe(0);
    expect(result.current.state.history).toHaveLength(0);
  });

  it('should do nothing when no history', () => {
    const blocks = [createTestBlock(1, 1, 'E')];
    const level = createSimpleLevel(blocks, { rows: 3, cols: 3 });

    const { result } = renderHook(() => useSquareBlockGame(level));

    // Try to undo with no history
    act(() => {
      result.current.undo();
    });

    expect(result.current.state.blocks.size).toBe(1);
    expect(result.current.state.moveCount).toBe(0);
  });

  it('should reset win/lose state on undo', async () => {
    const blocks = [createTestBlock(1, 1, 'E')];
    const level = createSimpleLevel(blocks, { rows: 3, cols: 3 });

    const { result } = renderHook(() => useSquareBlockGame(level));

    // Win the game
    await act(async () => {
      result.current.tapBlock({ row: 1, col: 1 });
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

  it('should not undo during animation', async () => {
    const blocks = [createTestBlock(1, 1, 'E')];
    const level = createSimpleLevel(blocks, { rows: 3, cols: 3 });

    const { result } = renderHook(() => useSquareBlockGame(level));

    // Start animation
    act(() => {
      result.current.tapBlock({ row: 1, col: 1 });
    });

    // Try to undo during animation
    act(() => {
      result.current.undo();
    });

    // Should still be animating, not undone
    expect(result.current.state.animatingBlock).not.toBeNull();
  });
});

// ============================================================================
// Reset Tests
// ============================================================================

describe('useSquareBlockGame - Reset', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should restore initial state', async () => {
    const blocks = [
      createTestBlock(0, 1, 'N'),
      createTestBlock(2, 1, 'S'),
    ];
    const level = createSimpleLevel(blocks, { rows: 3, cols: 3 });

    const { result } = renderHook(() => useSquareBlockGame(level));

    // Make some moves
    await act(async () => {
      result.current.tapBlock({ row: 0, col: 1 });
      vi.advanceTimersByTime(700);
    });

    expect(result.current.state.blocks.size).toBe(1);

    // Reset
    act(() => {
      result.current.reset();
    });

    expect(result.current.state.blocks.size).toBe(2);
    expect(result.current.state.moveCount).toBe(0);
    expect(result.current.state.mistakes).toBe(0);
    expect(result.current.state.history).toHaveLength(0);
    expect(result.current.state.isComplete).toBe(false);
    expect(result.current.state.isWon).toBe(false);
    expect(result.current.state.isLost).toBe(false);
  });
});

// ============================================================================
// loadLevel Tests
// ============================================================================

describe('useSquareBlockGame - loadLevel', () => {
  it('should load a new level', () => {
    const level1 = createSimpleLevel([createTestBlock(0, 0, 'E')], { rows: 2, cols: 2 });
    const level2 = createSimpleLevel([
      createTestBlock(0, 0, 'N'),
      createTestBlock(1, 1, 'S'),
    ], { rows: 3, cols: 3 });

    const { result } = renderHook(() => useSquareBlockGame(level1));

    expect(result.current.state.blocks.size).toBe(1);
    expect(result.current.state.level.rows).toBe(2);

    act(() => {
      result.current.loadLevel(level2);
    });

    expect(result.current.state.blocks.size).toBe(2);
    expect(result.current.state.level.rows).toBe(3);
    expect(result.current.state.moveCount).toBe(0);
  });
});

// ============================================================================
// clearableBlocks Tests
// ============================================================================

describe('useSquareBlockGame - clearableBlocks', () => {
  it('should return keys of all clearable blocks', () => {
    const blocks = [
      createTestBlock(0, 1, 'N'), // Can clear (exits top)
      createTestBlock(2, 1, 'S'), // Can clear (exits bottom)
      createTestBlock(1, 0, 'E'),
      createTestBlock(1, 2, 'W'), // These two block each other
    ];
    const level = createSimpleLevel(blocks, { rows: 3, cols: 3 });

    const { result } = renderHook(() => useSquareBlockGame(level));

    expect(result.current.clearableBlocks).toContain('0,1');
    expect(result.current.clearableBlocks).toContain('2,1');
    expect(result.current.clearableBlocks).not.toContain('1,0');
    expect(result.current.clearableBlocks).not.toContain('1,2');
  });

  it('should return empty array when no blocks can be cleared', () => {
    const level = createDeadlockLevel();
    const { result } = renderHook(() => useSquareBlockGame(level));

    expect(result.current.clearableBlocks).toHaveLength(0);
  });
});

// ============================================================================
// stuckBlocks Tests
// ============================================================================

describe('useSquareBlockGame - stuckBlocks', () => {
  it('should identify blocks stuck in deadlock', () => {
    const level = createDeadlockLevel();
    const { result } = renderHook(() => useSquareBlockGame(level));

    expect(result.current.stuckBlocks.size).toBe(2);
    expect(result.current.stuckBlocks.has('1,0')).toBe(true);
    expect(result.current.stuckBlocks.has('1,2')).toBe(true);
  });

  it('should be empty when clearable blocks exist', () => {
    const blocks = [
      createTestBlock(0, 1, 'N'),
      createTestBlock(1, 0, 'E'),
      createTestBlock(1, 2, 'W'),
    ];
    const level = createSimpleLevel(blocks, { rows: 3, cols: 3 });

    const { result } = renderHook(() => useSquareBlockGame(level));

    expect(result.current.stuckBlocks.size).toBe(0);
  });

  it('should be empty when game is complete', async () => {
    const { result } = renderHook(() => useSquareBlockGame(createClearableLevel()));

    // Complete the game
    await act(async () => {
      result.current.tapBlock({ row: 1, col: 1 });
    });

    await waitFor(() => {
      expect(result.current.state.isComplete).toBe(true);
    });

    expect(result.current.stuckBlocks.size).toBe(0);
  });

  it('should not include iced blocks as stuck', () => {
    const blocks = [
      createTestBlock(1, 0, 'E', { iceCount: 2 }), // Iced, not stuck
      createTestBlock(1, 2, 'W'), // Would be stuck if not for ice block
    ];
    const level = createSimpleLevel(blocks, { rows: 3, cols: 3 });

    const { result } = renderHook(() => useSquareBlockGame(level));

    // Iced block shouldn't be marked as stuck (it's waiting)
    expect(result.current.stuckBlocks.has('1,0')).toBe(false);
  });
});

// ============================================================================
// isSolvable Tests
// ============================================================================

describe('useSquareBlockGame - isSolvable', () => {
  it('should return true when clearable blocks exist', () => {
    const level = createClearableLevel();
    const { result } = renderHook(() => useSquareBlockGame(level));

    expect(result.current.isSolvable).toBe(true);
  });

  it('should return false when in deadlock', () => {
    const level = createDeadlockLevel();
    const { result } = renderHook(() => useSquareBlockGame(level));

    expect(result.current.isSolvable).toBe(false);
  });

  it('should return true when game is already complete', async () => {
    const { result } = renderHook(() => useSquareBlockGame(createClearableLevel()));

    await act(async () => {
      result.current.tapBlock({ row: 1, col: 1 });
    });

    await waitFor(() => {
      expect(result.current.state.isComplete).toBe(true);
    });

    expect(result.current.isSolvable).toBe(true);
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('useSquareBlockGame - Edge Cases', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should handle empty level', () => {
    const level = createSimpleLevel([], { rows: 3, cols: 3 });
    const { result } = renderHook(() => useSquareBlockGame(level));

    expect(result.current.state.blocks.size).toBe(0);
    expect(result.current.state.isComplete).toBe(false); // No blocks = not started
  });

  it('should handle block at grid boundary pointing out', async () => {
    const blocks = [createTestBlock(0, 0, 'N')]; // Corner, points up
    const level = createSimpleLevel(blocks, { rows: 3, cols: 3 });

    const { result } = renderHook(() => useSquareBlockGame(level));

    expect(result.current.canClearBlock(result.current.state.blocks.get('0,0')!)).toBe(true);

    await act(async () => {
      result.current.tapBlock({ row: 0, col: 0 });
      vi.advanceTimersByTime(700);
    });

    expect(result.current.state.blocks.size).toBe(0);
  });

  it('should handle multiple undo operations', async () => {
    const blocks = [
      createTestBlock(0, 1, 'N'),
      createTestBlock(2, 1, 'S'),
    ];
    const level = createSimpleLevel(blocks, { rows: 3, cols: 3 });

    const { result } = renderHook(() => useSquareBlockGame(level));

    // Clear first block
    await act(async () => {
      result.current.tapBlock({ row: 0, col: 1 });
      vi.advanceTimersByTime(700);
    });

    // Clear second block
    await act(async () => {
      result.current.tapBlock({ row: 2, col: 1 });
      vi.advanceTimersByTime(700);
    });

    expect(result.current.state.blocks.size).toBe(0);
    expect(result.current.state.history).toHaveLength(2);

    // Undo twice
    act(() => {
      result.current.undo();
    });
    expect(result.current.state.blocks.size).toBe(1);

    act(() => {
      result.current.undo();
    });
    expect(result.current.state.blocks.size).toBe(2);
    expect(result.current.state.history).toHaveLength(0);
  });

  it('should handle combined mirror + locked + ice block', () => {
    const blocks = [
      createTestBlock(1, 1, 'N', { mirror: true, locked: true, iceCount: 1 }),
      createTestBlock(0, 1, 'E'), // Neighbor
    ];
    const level = createSimpleLevel(blocks, { rows: 3, cols: 3 });

    const { result } = renderHook(() => useSquareBlockGame(level));
    const block = result.current.state.blocks.get('1,1')!;

    // Should be locked due to ice
    expect(result.current.isBlockUnlocked(block)).toBe(false);
    // Path should be reversed (mirror)
    const pathInfo = result.current.getBlockPath(block);
    expect(pathInfo.chosenDirection).toBe('S'); // Mirror reverses N to S
  });
});
