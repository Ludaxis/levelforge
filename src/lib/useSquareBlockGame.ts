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
} from '@/lib/squareGrid';

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
      if (isBidirectional(block.direction)) {
        const [dir1, dir2] = getAxisDirections(block.direction);
        const path1 = getDirectionPath(block.coord, dir1);
        const path2 = getDirectionPath(block.coord, dir2);

        const canExit1 = !path1.blocked || path1.holeCoord !== null;
        const canExit2 = !path2.blocked || path2.holeCoord !== null;

        if (canExit1 && !canExit2) {
          return { ...path1, chosenDirection: dir1 };
        } else if (!canExit1 && canExit2) {
          return { ...path2, chosenDirection: dir2 };
        } else if (canExit1 && canExit2) {
          return path1.path.length <= path2.path.length
            ? { ...path1, chosenDirection: dir1 }
            : { ...path2, chosenDirection: dir2 };
        } else {
          return path1.path.length >= path2.path.length
            ? { ...path1, chosenDirection: dir1 }
            : { ...path2, chosenDirection: dir2 };
        }
      } else {
        const pathInfo = getDirectionPath(block.coord, block.direction as SquareDirection);
        return { ...pathInfo, chosenDirection: block.direction as SquareDirection };
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

  // Check if a locked block is currently unlocked (no neighbors)
  const isBlockUnlocked = useCallback(
    (block: SquareBlock): boolean => {
      if (!block.locked) return true;  // Not locked, always unlocked
      return !hasNeighbors(block.coord);  // Locked but no neighbors = unlocked
    },
    [hasNeighbors]
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

      // Check if block is locked and still has neighbors - this is a mistake!
      if (block.locked && hasNeighbors(block.coord)) {
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

  return {
    state,
    tapBlock,
    undo,
    reset,
    loadLevel,
    canClearBlock,
    clearableBlocks,
    isSolvable,
    getBlockPath,
    isBlockUnlocked,
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
