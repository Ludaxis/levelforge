'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  SquareBlockLevel,
  SquareBlockState,
  SquareBlock,
  AnimationData,
  GameMode,
  BlockDirection,
  MAX_MISTAKES,
} from '@/types/squareBlock';
import {
  GridCoord,
  SquareDirection,
  SQUARE_DIRECTIONS,
  gridKey,
  gridAdd,
  isInBounds,
  gridToPixel,
  isBidirectional,
  getAxisDirections,
  getOppositeDirection,
} from '@/lib/squareGrid';

// ============================================================================
// Deadlock Info Types
// ============================================================================

export interface StuckReason {
  type: 'blocked_by' | 'mutual_block' | 'both_directions_blocked';
  blockedBy?: string;  // Key of the blocking block (e.g., "2,3")
  message: string;     // Human-readable explanation
}

export interface DeadlockInfo {
  stuckBlocks: Map<string, StuckReason>;  // Map of block key -> reason
  blockerBlocks: Set<string>;              // Blocks causing others to be stuck
  hasDeadlock: boolean;
}

const MAX_CANVAS_SIZE = 500;
const MIN_CELL_SIZE = 10;
const MAX_CELL_SIZE = 50;

function calculateCellSize(rows: number, cols: number): number {
  const maxDimension = Math.max(rows, cols);
  const calculatedSize = Math.floor(MAX_CANVAS_SIZE / maxDimension);
  return Math.max(MIN_CELL_SIZE, Math.min(MAX_CELL_SIZE, calculatedSize));
}

// ============================================================================
// Hook
// ============================================================================

export function useSquareBlockGame(initialLevel: SquareBlockLevel) {
  const [state, setState] = useState<SquareBlockState>(() => initializeState(initialLevel));

  const gameMode = state.level.gameMode || 'classic';

  // Calculate dynamic cell size based on grid dimensions
  const cellSize = useMemo(
    () => calculateCellSize(state.level.rows, state.level.cols),
    [state.level.rows, state.level.cols]
  );

  // Get path info for a single direction
  const getDirectionPath = useCallback(
    (
      startCoord: GridCoord,
      direction: SquareDirection
    ): {
      path: GridCoord[];
      blocked: boolean;
      blockerCoord: GridCoord | null;
      lastFreeCoord: GridCoord;
      holeCoord: GridCoord | null;
    } => {
      const path: GridCoord[] = [];
      const dirVec = SQUARE_DIRECTIONS[direction];
      let current = gridAdd(startCoord, dirVec);
      let blocked = false;
      let blockerCoord: GridCoord | null = null;
      let lastFreeCoord = startCoord;
      let holeCoord: GridCoord | null = null;

      while (isInBounds(current, state.level.rows, state.level.cols)) {
        const key = gridKey(current);

        // Check if there's a hole - block falls in!
        if (state.holes.has(key)) {
          path.push(current);
          holeCoord = current;
          break;
        }

        // Check if blocked by another block
        if (state.blocks.has(key)) {
          blocked = true;
          blockerCoord = current;
          break;
        }

        path.push(current);
        lastFreeCoord = current;
        current = gridAdd(current, dirVec);
      }

      return { path, blocked, blockerCoord, lastFreeCoord, holeCoord };
    },
    [state.blocks, state.holes, state.level.rows, state.level.cols]
  );

  // Get the best path for a block (handles bidirectional arrows)
  const getBlockPath = useCallback(
    (
      block: SquareBlock
    ): {
      path: GridCoord[];
      blocked: boolean;
      blockerCoord: GridCoord | null;
      lastFreeCoord: GridCoord;
      chosenDirection: SquareDirection;
      holeCoord: GridCoord | null;
    } => {
      // For mirror blocks, reverse the direction (block moves opposite to arrow)
      const isMirror = block.mirror === true;

      if (isBidirectional(block.direction)) {
        const [dir1, dir2] = getAxisDirections(block.direction);
        // For mirror blocks, reverse both directions (effectively the same for bidirectional)
        const actualDir1 = isMirror ? getOppositeDirection(dir1) : dir1;
        const actualDir2 = isMirror ? getOppositeDirection(dir2) : dir2;

        const path1 = getDirectionPath(block.coord, actualDir1);
        const path2 = getDirectionPath(block.coord, actualDir2);

        const canExit1 = !path1.blocked || path1.holeCoord !== null;
        const canExit2 = !path2.blocked || path2.holeCoord !== null;

        if (canExit1 && !canExit2) {
          return { ...path1, chosenDirection: actualDir1 };
        } else if (!canExit1 && canExit2) {
          return { ...path2, chosenDirection: actualDir2 };
        } else if (canExit1 && canExit2) {
          return path1.path.length <= path2.path.length
            ? { ...path1, chosenDirection: actualDir1 }
            : { ...path2, chosenDirection: actualDir2 };
        } else {
          return path1.path.length >= path2.path.length
            ? { ...path1, chosenDirection: actualDir1 }
            : { ...path2, chosenDirection: actualDir2 };
        }
      } else {
        // For mirror blocks, use opposite direction
        const actualDirection = isMirror
          ? getOppositeDirection(block.direction as SquareDirection)
          : block.direction as SquareDirection;
        const pathInfo = getDirectionPath(block.coord, actualDirection);
        return { ...pathInfo, chosenDirection: actualDirection };
      }
    },
    [getDirectionPath]
  );

  // Check if a locked block has any orthogonal neighbors (4 directions)
  const hasNeighbors = useCallback(
    (coord: GridCoord): boolean => {
      const directions: SquareDirection[] = ['N', 'E', 'S', 'W'];
      for (const dir of directions) {
        const neighborCoord = gridAdd(coord, SQUARE_DIRECTIONS[dir]);
        const neighborKey = gridKey(neighborCoord);
        if (state.blocks.has(neighborKey)) {
          return true;
        }
      }
      return false;
    },
    [state.blocks]
  );

  // Check if a locked/iced block is currently unlocked
  const isBlockUnlocked = useCallback(
    (block: SquareBlock): boolean => {
      // Ice mechanic: unlocked when moveCount >= iceCount
      if (block.iceCount !== undefined && block.iceCount > 0) {
        const remainingIce = block.iceCount - state.moveCount;
        if (remainingIce > 0) return false;  // Still frozen
      }

      // Not a gate block - always unlocked (after ice check)
      if (!block.locked) return true;

      // Gate block - check type
      if (block.unlockAfterMoves !== undefined && block.unlockAfterMoves > 0) {
        // Timed gate: unlocked once moveCount meets threshold
        return state.moveCount >= block.unlockAfterMoves;
      } else {
        // Neighbor-based gate: unlocked when no neighbors remain
        return !hasNeighbors(block.coord);
      }
    },
    [hasNeighbors, state.moveCount]
  );

  // Get remaining ice count for a block (null if not iced)
  const getRemainingIce = useCallback(
    (block: SquareBlock): number | null => {
      if (block.iceCount === undefined) return null;
      return Math.max(0, block.iceCount - state.moveCount);
    },
    [state.moveCount]
  );

  // Check if a block is a mirror block
  const isBlockMirror = useCallback(
    (block: SquareBlock): boolean => {
      return block.mirror === true;
    },
    []
  );

  // Check if a block can be cleared
  const canClearBlock = useCallback(
    (block: SquareBlock): boolean => {
      // If block is locked and still has neighbors, it cannot be cleared
      if (!isBlockUnlocked(block)) {
        return false;
      }
      const { blocked, holeCoord } = getBlockPath(block);
      return !blocked || holeCoord !== null;
    },
    [getBlockPath, isBlockUnlocked]
  );

  // Clear mistake highlight after animation
  const clearMistakeHighlight = useCallback(() => {
    setState((prev) => ({
      ...prev,
      lastMistakeBlockId: null,
    }));
  }, []);

  // Handle tapping a block
  const tapBlock = useCallback(
    async (coord: GridCoord) => {
      const key = gridKey(coord);
      const block = state.blocks.get(key);

      if (!block || state.isComplete || state.isLost || state.animatingBlock) {
        return;
      }

      // Check if block is currently locked - this is a mistake!
      if (!isBlockUnlocked(block)) {
        const newMistakes = state.mistakes + 1;
        const isLost = newMistakes >= MAX_MISTAKES;

        setState((prev) => ({
          ...prev,
          mistakes: newMistakes,
          isLost,
          lastMistakeBlockId: block.id,
          animatingBlock: block.id,
          animationPhase: 'bouncing',
          animationData: {
            blockId: block.id,
            phase: 'bouncing',
            bounceOffset: { x: 0, y: 0 },
            bouncePhase: 'out',
          },
        }));

        setTimeout(() => {
          setState((prev) => ({
            ...prev,
            animatingBlock: null,
            animationPhase: 'idle',
            animationData: null,
          }));
        }, 500);

        setTimeout(() => {
          clearMistakeHighlight();
        }, 600);

        return;
      }

      const { blocked, path, blockerCoord, lastFreeCoord, chosenDirection, holeCoord } = getBlockPath(block);

      // If there's a hole in the path, block falls in!
      if (holeCoord) {
        const startPixel = gridToPixel(block.coord, cellSize);
        const holePixel = gridToPixel(holeCoord, cellSize);
        const fallOffset = {
          x: holePixel.x - startPixel.x,
          y: holePixel.y - startPixel.y,
        };

        setState((prev) => ({
          ...prev,
          animatingBlock: block.id,
          animationPhase: 'rolling',
          animationData: {
            blockId: block.id,
            phase: 'rolling',
            exitOffset: fallOffset,
          },
        }));

        setTimeout(() => {
          setState((prev) => {
            const newBlocks = new Map(prev.blocks);
            newBlocks.delete(key);

            const newMoveCount = prev.moveCount + 1;
            const newHistory = [...prev.history, new Map(prev.blocks)];
            const isComplete = newBlocks.size === 0;

            return {
              ...prev,
              blocks: newBlocks,
              moveCount: newMoveCount,
              history: newHistory,
              isComplete,
              isWon: isComplete,
              animatingBlock: null,
              animationPhase: 'idle',
              animationData: null,
            };
          });
        }, 400);

        return;
      }

      if (blocked) {
        if (gameMode === 'push' && path.length > 0) {
          // Push mode: move to position before blocker (no fade, just slide)
          const startPixel = gridToPixel(block.coord, cellSize);
          const destPixel = gridToPixel(lastFreeCoord, cellSize);
          const moveOffset = {
            x: destPixel.x - startPixel.x,
            y: destPixel.y - startPixel.y,
          };

          setState((prev) => ({
            ...prev,
            animatingBlock: block.id,
            animationPhase: 'pushing',
            animationData: {
              blockId: block.id,
              phase: 'pushing',
              pushOffset: moveOffset,
            },
          }));

          setTimeout(() => {
            setState((prev) => {
              const newBlocks = new Map(prev.blocks);
              newBlocks.delete(key);
              const newKey = gridKey(lastFreeCoord);
              newBlocks.set(newKey, { ...block, coord: lastFreeCoord });

              const newMoveCount = prev.moveCount + 1;
              const newHistory = [...prev.history, new Map(prev.blocks)];

              return {
                ...prev,
                blocks: newBlocks,
                moveCount: newMoveCount,
                history: newHistory,
                animatingBlock: null,
                animationPhase: 'idle',
                animationData: null,
              };
            });
          }, 400);
        } else {
          // Classic mode (or push with no space): MISTAKE - block is blocked
          // Shake animation and increment mistake counter
          const newMistakes = state.mistakes + 1;
          const isLost = newMistakes >= MAX_MISTAKES;

          // Set mistake state and trigger shake animation
          setState((prev) => ({
            ...prev,
            mistakes: newMistakes,
            isLost,
            lastMistakeBlockId: block.id,
            animatingBlock: block.id,
            animationPhase: 'bouncing', // Using bouncing phase for shake
            animationData: {
              blockId: block.id,
              phase: 'bouncing',
              bounceOffset: { x: 0, y: 0 },
              bouncePhase: 'out',
            },
          }));

          // Clear animation state after shake
          setTimeout(() => {
            setState((prev) => ({
              ...prev,
              animatingBlock: null,
              animationPhase: 'idle',
              animationData: null,
            }));
          }, 500);

          // Clear mistake highlight after a delay
          setTimeout(() => {
            clearMistakeHighlight();
          }, 600);
        }

        return;
      }

      // Block can exit - calculate exit position
      const startPixel = gridToPixel(block.coord, cellSize);
      const dirVec = SQUARE_DIRECTIONS[chosenDirection];

      let exitCoord = block.coord;
      while (isInBounds(exitCoord, state.level.rows, state.level.cols)) {
        exitCoord = gridAdd(exitCoord, dirVec);
      }
      exitCoord = gridAdd(exitCoord, dirVec);
      exitCoord = gridAdd(exitCoord, dirVec);

      const exitPixel = gridToPixel(exitCoord, cellSize);
      const exitOffset = {
        x: exitPixel.x - startPixel.x,
        y: exitPixel.y - startPixel.y,
      };

      setState((prev) => ({
        ...prev,
        animatingBlock: block.id,
        animationPhase: 'rolling',
        animationData: {
          blockId: block.id,
          phase: 'rolling',
          exitOffset,
        },
      }));

      setTimeout(() => {
        setState((prev) => {
          const newBlocks = new Map(prev.blocks);
          newBlocks.delete(key);

          const newMoveCount = prev.moveCount + 1;
          const newHistory = [...prev.history, new Map(prev.blocks)];
          const isComplete = newBlocks.size === 0;

          return {
            ...prev,
            blocks: newBlocks,
            moveCount: newMoveCount,
            history: newHistory,
            isComplete,
            isWon: isComplete,
            animatingBlock: null,
            animationPhase: 'idle',
            animationData: null,
          };
        });
      }, 600);
    },
    [state.blocks, state.holes, state.isComplete, state.isLost, state.animatingBlock, state.mistakes, getBlockPath, clearMistakeHighlight, gameMode, state.level.rows, state.level.cols]
  );

  // Undo last move
  const undo = useCallback(() => {
    if (state.history.length === 0 || state.animatingBlock) return;

    setState((prev) => {
      const newHistory = [...prev.history];
      const previousBlocks = newHistory.pop();

      if (!previousBlocks) return prev;

      return {
        ...prev,
        blocks: previousBlocks,
        moveCount: Math.max(0, prev.moveCount - 1),
        history: newHistory,
        isComplete: false,
        isWon: false,
        isLost: false,
      };
    });
  }, [state.history, state.animatingBlock]);

  // Reset to initial state
  const reset = useCallback(() => {
    setState(initializeState(state.level));
  }, [state.level]);

  // Load a new level
  const loadLevel = useCallback((level: SquareBlockLevel) => {
    setState(initializeState(level));
  }, []);

  // Get blocks that can currently be cleared
  const clearableBlocks = useMemo(() => {
    const clearable: string[] = [];
    state.blocks.forEach((block, key) => {
      if (canClearBlock(block)) {
        clearable.push(key);
      }
    });
    return clearable;
  }, [state.blocks, canClearBlock]);

  // Check if level is solvable
  const isSolvable = clearableBlocks.length > 0 || state.isComplete;

  // Compute deadlock info for enhanced deadlock visualization
  const deadlockInfo = useMemo((): DeadlockInfo => {
    const emptyResult: DeadlockInfo = {
      stuckBlocks: new Map(),
      blockerBlocks: new Set(),
      hasDeadlock: false,
    };

    // Only analyze deadlock when there are no clearable blocks and game is not complete
    if (clearableBlocks.length > 0 || state.isComplete || state.isLost) {
      return emptyResult;
    }

    const stuckBlocks = new Map<string, StuckReason>();
    const blockerBlocks = new Set<string>();

    for (const [key, block] of state.blocks) {
      // Skip if block can be cleared
      if (canClearBlock(block)) continue;

      // Ice blocks still frozen are "waiting" not stuck
      if (block.iceCount !== undefined && block.iceCount > 0) {
        const remainingIce = block.iceCount - state.moveCount;
        if (remainingIce > 0) continue;
      }

      // Gate blocks with neighbors are "waiting"
      if (block.locked && !isBlockUnlocked(block)) {
        if (hasNeighbors(block.coord)) continue;
      }

      // Block is stuck - determine why using getBlockPath
      const pathInfo = getBlockPath(block);

      if (pathInfo.blocked && pathInfo.blockerCoord) {
        // Blocked by another block
        const blockerKey = gridKey(pathInfo.blockerCoord);
        stuckBlocks.set(key, {
          type: 'blocked_by',
          blockedBy: blockerKey,
          message: `Blocked by block at ${blockerKey}`,
        });
        blockerBlocks.add(blockerKey);
      } else if (pathInfo.blocked && !pathInfo.holeCoord) {
        // For bidirectional blocks, both directions are blocked
        stuckBlocks.set(key, {
          type: 'both_directions_blocked',
          message: 'Both exit directions blocked',
        });
      } else {
        // Fallback - shouldn't happen if canClearBlock is accurate
        stuckBlocks.set(key, {
          type: 'both_directions_blocked',
          message: 'Cannot exit',
        });
      }
    }

    // Detect mutual blocks (A blocks B, B blocks A)
    for (const [key, reason] of stuckBlocks) {
      if (reason.blockedBy && stuckBlocks.has(reason.blockedBy)) {
        const otherReason = stuckBlocks.get(reason.blockedBy);
        if (otherReason?.blockedBy === key) {
          // Mutual block detected - update both to mutual_block type
          reason.type = 'mutual_block';
          reason.message = `Mutual deadlock with ${reason.blockedBy}`;
        }
      }
    }

    return {
      stuckBlocks,
      blockerBlocks,
      hasDeadlock: stuckBlocks.size > 0,
    };
  }, [state.blocks, state.moveCount, state.isComplete, state.isLost, clearableBlocks, canClearBlock, hasNeighbors, isBlockUnlocked, getBlockPath]);

  // For backward compatibility, provide stuckBlocks as a Set (derived from deadlockInfo)
  const stuckBlocks = useMemo(() => {
    return new Set(deadlockInfo.stuckBlocks.keys());
  }, [deadlockInfo]);

  return {
    state,
    tapBlock,
    undo,
    reset,
    loadLevel,
    canClearBlock,
    clearableBlocks,
    isSolvable,
    stuckBlocks,
    deadlockInfo,
    getBlockPath,
    isBlockUnlocked,
    getRemainingIce,
    isBlockMirror,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

function initializeState(level: SquareBlockLevel): SquareBlockState {
  const blocks = new Map<string, SquareBlock>();
  const holes = new Set<string>();

  for (const block of level.blocks) {
    const key = gridKey(block.coord);
    blocks.set(key, { ...block });
  }

  if (level.holes) {
    for (const hole of level.holes) {
      holes.add(gridKey(hole));
    }
  }

  return {
    level,
    blocks,
    holes,
    moveCount: 0,
    mistakes: 0,
    isComplete: false,
    isWon: false,
    isLost: false,
    history: [],
    animatingBlock: null,
    animationPhase: 'idle',
    animationData: null,
    lastMistakeBlockId: null,
  };
}

export type UseSquareBlockGameReturn = ReturnType<typeof useSquareBlockGame>;
