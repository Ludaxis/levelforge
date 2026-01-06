'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  HexaBlockLevel,
  HexaBlockState,
  HexStack,
  AnimationData,
  GameMode,
  StackDirection,
  isBidirectional,
  getAxisDirections,
} from '@/types/hexaBlock';
import {
  AxialCoord,
  HexDirection,
  HEX_DIRECTIONS,
  hexKey,
  hexAdd,
  hexEquals,
  isInHexagonalBounds,
  axialToPixel,
} from '@/lib/hexGrid';

// Hex size must match the board component
const HEX_SIZE = 40;

// ============================================================================
// Hook
// ============================================================================

export function useHexaBlockGame(initialLevel: HexaBlockLevel) {
  const [state, setState] = useState<HexaBlockState>(() => initializeState(initialLevel));

  const gameMode = state.level.gameMode || 'classic';

  // Get path info for a single direction (now includes hole detection)
  const getDirectionPath = useCallback(
    (
      startCoord: AxialCoord,
      direction: HexDirection
    ): {
      path: AxialCoord[];
      blocked: boolean;
      blockerCoord: AxialCoord | null;
      lastFreeCoord: AxialCoord;
      holeCoord: AxialCoord | null; // The hole the stack will fall into
    } => {
      const path: AxialCoord[] = [];
      const dirVec = HEX_DIRECTIONS[direction];
      let current = hexAdd(startCoord, dirVec);
      let blocked = false;
      let blockerCoord: AxialCoord | null = null;
      let lastFreeCoord = startCoord;
      let holeCoord: AxialCoord | null = null;

      while (isInHexagonalBounds(current, state.level.gridRadius)) {
        const key = hexKey(current);

        // Check if there's a hole - stack falls in!
        if (state.holes.has(key)) {
          path.push(current);
          holeCoord = current;
          break;
        }

        // Check if blocked by another stack
        if (state.stacks.has(key)) {
          blocked = true;
          blockerCoord = current;
          break;
        }

        path.push(current);
        lastFreeCoord = current;
        current = hexAdd(current, dirVec);
      }

      return { path, blocked, blockerCoord, lastFreeCoord, holeCoord };
    },
    [state.stacks, state.holes, state.level.gridRadius]
  );

  // Get the best path for a stack (handles bidirectional arrows)
  const getStackPath = useCallback(
    (
      stack: HexStack
    ): {
      path: AxialCoord[];
      blocked: boolean;
      blockerCoord: AxialCoord | null;
      lastFreeCoord: AxialCoord;
      chosenDirection: HexDirection;
      holeCoord: AxialCoord | null;
    } => {
      if (isBidirectional(stack.direction)) {
        // Check both directions, prefer the one that can exit (or fall in hole)
        const [dir1, dir2] = getAxisDirections(stack.direction);
        const path1 = getDirectionPath(stack.coord, dir1);
        const path2 = getDirectionPath(stack.coord, dir2);

        // Prefer path with hole or unblocked exit
        const canExit1 = !path1.blocked || path1.holeCoord !== null;
        const canExit2 = !path2.blocked || path2.holeCoord !== null;

        if (canExit1 && !canExit2) {
          return { ...path1, chosenDirection: dir1 };
        } else if (!canExit1 && canExit2) {
          return { ...path2, chosenDirection: dir2 };
        } else if (canExit1 && canExit2) {
          // Both can exit - prefer shorter path (closer hole/exit)
          return path1.path.length <= path2.path.length
            ? { ...path1, chosenDirection: dir1 }
            : { ...path2, chosenDirection: dir2 };
        } else {
          // Both blocked - prefer longer path (more movement in push mode)
          return path1.path.length >= path2.path.length
            ? { ...path1, chosenDirection: dir1 }
            : { ...path2, chosenDirection: dir2 };
        }
      } else {
        // Single direction
        const pathInfo = getDirectionPath(stack.coord, stack.direction as HexDirection);
        return { ...pathInfo, chosenDirection: stack.direction as HexDirection };
      }
    },
    [getDirectionPath]
  );

  // Check if a stack can be cleared (has clear path to edge or hole)
  const canClearStack = useCallback(
    (stack: HexStack): boolean => {
      const { blocked, holeCoord } = getStackPath(stack);
      return !blocked || holeCoord !== null;
    },
    [getStackPath]
  );

  // Check if stack can move at all (for push mode)
  const canMoveStack = useCallback(
    (stack: HexStack): boolean => {
      const { path } = getStackPath(stack);
      return path.length > 0;
    },
    [getStackPath]
  );

  // Helper to check if out of moves
  const checkLoseCondition = (newMoveCount: number, stacksRemaining: number, limit: number): boolean => {
    if (limit === 0) return false; // Unlimited moves
    return newMoveCount >= limit && stacksRemaining > 0;
  };

  // Handle tapping a stack
  const tapStack = useCallback(
    async (coord: AxialCoord) => {
      const key = hexKey(coord);
      const stack = state.stacks.get(key);

      if (!stack || state.isComplete || state.isLost || state.animatingStack) {
        return;
      }

      const { blocked, path, blockerCoord, lastFreeCoord, chosenDirection, holeCoord } = getStackPath(stack);

      // If there's a hole in the path, stack falls in!
      if (holeCoord) {
        const startPixel = axialToPixel(stack.coord, HEX_SIZE);
        const holePixel = axialToPixel(holeCoord, HEX_SIZE);
        const fallOffset = {
          x: holePixel.x - startPixel.x,
          y: holePixel.y - startPixel.y,
        };

        setState((prev) => ({
          ...prev,
          animatingStack: stack.id,
          animationPhase: 'rolling',
          animationData: {
            stackId: stack.id,
            phase: 'rolling',
            exitOffset: fallOffset,
          },
        }));

        setTimeout(() => {
          setState((prev) => {
            const newStacks = new Map(prev.stacks);
            newStacks.delete(key);

            const newMoveCount = prev.moveCount + 1;
            const newHistory = [...prev.history, new Map(prev.stacks)];
            const isComplete = newStacks.size === 0;
            const isLost = !isComplete && checkLoseCondition(newMoveCount, newStacks.size, prev.moveLimit);

            return {
              ...prev,
              stacks: newStacks,
              moveCount: newMoveCount,
              history: newHistory,
              isComplete,
              isWon: isComplete,
              isLost,
              animatingStack: null,
              animationPhase: 'idle',
              animationData: null,
            };
          });
        }, 400);

        return;
      }

      if (blocked) {
        if (gameMode === 'push' && path.length > 0) {
          // Push mode: move to position before blocker
          const startPixel = axialToPixel(stack.coord, HEX_SIZE);
          const destPixel = axialToPixel(lastFreeCoord, HEX_SIZE);
          const moveOffset = {
            x: destPixel.x - startPixel.x,
            y: destPixel.y - startPixel.y,
          };

          // Animate movement
          setState((prev) => ({
            ...prev,
            animatingStack: stack.id,
            animationPhase: 'rolling',
            animationData: {
              stackId: stack.id,
              phase: 'rolling',
              exitOffset: moveOffset,
            },
          }));

          // After animation, move the stack to new position
          setTimeout(() => {
            setState((prev) => {
              const newStacks = new Map(prev.stacks);
              newStacks.delete(key);
              const newKey = hexKey(lastFreeCoord);
              newStacks.set(newKey, { ...stack, coord: lastFreeCoord });

              const newMoveCount = prev.moveCount + 1;
              const newHistory = [...prev.history, new Map(prev.stacks)];
              const isLost = checkLoseCondition(newMoveCount, newStacks.size, prev.moveLimit);

              return {
                ...prev,
                stacks: newStacks,
                moveCount: newMoveCount,
                history: newHistory,
                isLost,
                animatingStack: null,
                animationPhase: 'idle',
                animationData: null,
              };
            });
          }, 400);
        } else {
          // Classic mode: bounce back - still counts as a move!
          const startPixel = axialToPixel(stack.coord, HEX_SIZE);
          const blockerPixel = blockerCoord ? axialToPixel(blockerCoord, HEX_SIZE) : startPixel;
          const bounceOffset = {
            x: (blockerPixel.x - startPixel.x) * 0.6,
            y: (blockerPixel.y - startPixel.y) * 0.6,
          };

          setState((prev) => ({
            ...prev,
            animatingStack: stack.id,
            animationPhase: 'bouncing',
            animationData: {
              stackId: stack.id,
              phase: 'bouncing',
              bounceOffset,
            },
          }));

          setTimeout(() => {
            setState((prev) => {
              const newMoveCount = prev.moveCount + 1;
              const newHistory = [...prev.history, new Map(prev.stacks)];
              const isLost = checkLoseCondition(newMoveCount, prev.stacks.size, prev.moveLimit);

              return {
                ...prev,
                moveCount: newMoveCount,
                history: newHistory,
                isLost,
                animatingStack: null,
                animationPhase: 'idle',
                animationData: null,
              };
            });
          }, 500);
        }

        return;
      }

      // Stack can exit - calculate exit position
      const startPixel = axialToPixel(stack.coord, HEX_SIZE);
      const dirVec = HEX_DIRECTIONS[chosenDirection];

      let exitCoord = stack.coord;
      while (isInHexagonalBounds(exitCoord, state.level.gridRadius)) {
        exitCoord = hexAdd(exitCoord, dirVec);
      }
      exitCoord = hexAdd(exitCoord, dirVec);
      exitCoord = hexAdd(exitCoord, dirVec);

      const exitPixel = axialToPixel(exitCoord, HEX_SIZE);
      const exitOffset = {
        x: exitPixel.x - startPixel.x,
        y: exitPixel.y - startPixel.y,
      };

      setState((prev) => ({
        ...prev,
        animatingStack: stack.id,
        animationPhase: 'rolling',
        animationData: {
          stackId: stack.id,
          phase: 'rolling',
          exitOffset,
        },
      }));

      setTimeout(() => {
        setState((prev) => {
          const newStacks = new Map(prev.stacks);
          newStacks.delete(key);

          const newMoveCount = prev.moveCount + 1;
          const newHistory = [...prev.history, new Map(prev.stacks)];
          const isComplete = newStacks.size === 0;
          const isLost = !isComplete && checkLoseCondition(newMoveCount, newStacks.size, prev.moveLimit);

          return {
            ...prev,
            stacks: newStacks,
            moveCount: newMoveCount,
            history: newHistory,
            isComplete,
            isWon: isComplete,
            isLost,
            animatingStack: null,
            animationPhase: 'idle',
            animationData: null,
          };
        });
      }, 600);
    },
    [state.stacks, state.holes, state.isComplete, state.isLost, state.animatingStack, getStackPath, gameMode, state.level.gridRadius]
  );

  // Undo last move
  const undo = useCallback(() => {
    if (state.history.length === 0 || state.animatingStack) return;

    setState((prev) => {
      const newHistory = [...prev.history];
      const previousStacks = newHistory.pop();

      if (!previousStacks) return prev;

      return {
        ...prev,
        stacks: previousStacks,
        moveCount: Math.max(0, prev.moveCount - 1),
        history: newHistory,
        isComplete: false,
        isWon: false,
        isLost: false, // Undo clears lose state
      };
    });
  }, [state.history, state.animatingStack]);

  // Reset to initial state
  const reset = useCallback(() => {
    setState(initializeState(state.level));
  }, [state.level]);

  // Load a new level
  const loadLevel = useCallback((level: HexaBlockLevel) => {
    setState(initializeState(level));
  }, []);

  // Get stacks that can currently be cleared
  const clearableStacks = useMemo(() => {
    const clearable: string[] = [];
    state.stacks.forEach((stack, key) => {
      if (canClearStack(stack)) {
        clearable.push(key);
      }
    });
    return clearable;
  }, [state.stacks, canClearStack]);

  // Check if level is solvable (at least one stack can be cleared)
  const isSolvable = clearableStacks.length > 0 || state.isComplete;

  return {
    state,
    tapStack,
    undo,
    reset,
    loadLevel,
    canClearStack,
    clearableStacks,
    isSolvable,
    getStackPath,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

function initializeState(level: HexaBlockLevel): HexaBlockState {
  const stacks = new Map<string, HexStack>();
  const holes = new Set<string>();

  for (const stack of level.stacks) {
    const key = hexKey(stack.coord);
    stacks.set(key, { ...stack });
  }

  // Initialize holes
  if (level.holes) {
    for (const hole of level.holes) {
      holes.add(hexKey(hole));
    }
  }

  return {
    level,
    stacks,
    holes,
    moveCount: 0,
    moveLimit: level.parMoves || 0, // 0 means unlimited
    isComplete: false,
    isWon: false,
    isLost: false,
    history: [],
    animatingStack: null,
    animationPhase: 'idle',
    animationData: null,
  };
}

// ============================================================================
// Types Export
// ============================================================================

export type UseHexaBlockGameReturn = ReturnType<typeof useHexaBlockGame>;
