'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  HexaBlockLevel,
  HexaBlockState,
  HexStack,
  AnimationData,
  GameMode,
  StackDirection,
  Carousel,
  isBidirectional,
  getAxisDirections,
  sortArmsClockwise,
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

  // Get path info for a single direction (includes hole and pause detection)
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
      pauseCoord: AxialCoord | null; // The pause cell the stack will stop at
    } => {
      const path: AxialCoord[] = [];
      const dirVec = HEX_DIRECTIONS[direction];
      let current = hexAdd(startCoord, dirVec);
      let blocked = false;
      let blockerCoord: AxialCoord | null = null;
      let lastFreeCoord = startCoord;
      let holeCoord: AxialCoord | null = null;
      let pauseCoord: AxialCoord | null = null;

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

        // Check if there's a pause cell - stack stops here
        if (state.pauses.has(key)) {
          pauseCoord = current;
          break;
        }

        current = hexAdd(current, dirVec);
      }

      return { path, blocked, blockerCoord, lastFreeCoord, holeCoord, pauseCoord };
    },
    [state.stacks, state.holes, state.pauses, state.level.gridRadius]
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
      pauseCoord: AxialCoord | null;
    } => {
      if (isBidirectional(stack.direction)) {
        // Check both directions, prefer the one that can exit (or fall in hole)
        const [dir1, dir2] = getAxisDirections(stack.direction);
        const path1 = getDirectionPath(stack.coord, dir1);
        const path2 = getDirectionPath(stack.coord, dir2);

        // Prefer path with hole or unblocked exit (pause doesn't count as exit)
        const canExit1 = !path1.blocked && path1.pauseCoord === null || path1.holeCoord !== null;
        const canExit2 = !path2.blocked && path2.pauseCoord === null || path2.holeCoord !== null;

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
          // Both blocked or paused - prefer longer path (more movement in push mode)
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

      const { blocked, path, blockerCoord, lastFreeCoord, chosenDirection, holeCoord, pauseCoord } = getStackPath(stack);

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

            // Remove from paused if it was paused
            const newPausedStacks = new Set(prev.pausedStacks);
            newPausedStacks.delete(stack.id);

            const newMoveCount = prev.moveCount + 1;
            const newHistory = [...prev.history, new Map(prev.stacks)];
            const newPausedHistory = [...prev.pausedStacksHistory, new Set(prev.pausedStacks)];
            const isComplete = newStacks.size === 0;
            const isLost = !isComplete && checkLoseCondition(newMoveCount, newStacks.size, prev.moveLimit);

            return {
              ...prev,
              stacks: newStacks,
              pausedStacks: newPausedStacks,
              moveCount: newMoveCount,
              history: newHistory,
              pausedStacksHistory: newPausedHistory,
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

      // If there's a pause cell in the path, stack stops there
      if (pauseCoord) {
        const startPixel = axialToPixel(stack.coord, HEX_SIZE);
        const pausePixel = axialToPixel(pauseCoord, HEX_SIZE);
        const moveOffset = {
          x: pausePixel.x - startPixel.x,
          y: pausePixel.y - startPixel.y,
        };

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

        setTimeout(() => {
          setState((prev) => {
            const newStacks = new Map(prev.stacks);
            newStacks.delete(key);
            const newKey = hexKey(pauseCoord);
            newStacks.set(newKey, { ...stack, coord: pauseCoord });

            // Mark this stack as paused
            const newPausedStacks = new Set(prev.pausedStacks);
            newPausedStacks.add(stack.id);

            const newMoveCount = prev.moveCount + 1;
            const newHistory = [...prev.history, new Map(prev.stacks)];
            const newPausedHistory = [...prev.pausedStacksHistory, new Set(prev.pausedStacks)];
            const isLost = checkLoseCondition(newMoveCount, newStacks.size, prev.moveLimit);

            return {
              ...prev,
              stacks: newStacks,
              pausedStacks: newPausedStacks,
              moveCount: newMoveCount,
              history: newHistory,
              pausedStacksHistory: newPausedHistory,
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

              // Remove from paused if it was paused
              const newPausedStacks = new Set(prev.pausedStacks);
              newPausedStacks.delete(stack.id);

              const newMoveCount = prev.moveCount + 1;
              const newHistory = [...prev.history, new Map(prev.stacks)];
              const newPausedHistory = [...prev.pausedStacksHistory, new Set(prev.pausedStacks)];
              const isLost = checkLoseCondition(newMoveCount, newStacks.size, prev.moveLimit);

              return {
                ...prev,
                stacks: newStacks,
                pausedStacks: newPausedStacks,
                moveCount: newMoveCount,
                history: newHistory,
                pausedStacksHistory: newPausedHistory,
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
              const newPausedHistory = [...prev.pausedStacksHistory, new Set(prev.pausedStacks)];
              const isLost = checkLoseCondition(newMoveCount, prev.stacks.size, prev.moveLimit);

              return {
                ...prev,
                moveCount: newMoveCount,
                history: newHistory,
                pausedStacksHistory: newPausedHistory,
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

          // Remove from paused if it was paused
          const newPausedStacks = new Set(prev.pausedStacks);
          newPausedStacks.delete(stack.id);

          const newMoveCount = prev.moveCount + 1;
          const newHistory = [...prev.history, new Map(prev.stacks)];
          const newPausedHistory = [...prev.pausedStacksHistory, new Set(prev.pausedStacks)];
          const isComplete = newStacks.size === 0;
          const isLost = !isComplete && checkLoseCondition(newMoveCount, newStacks.size, prev.moveLimit);

          return {
            ...prev,
            stacks: newStacks,
            pausedStacks: newPausedStacks,
            moveCount: newMoveCount,
            history: newHistory,
            pausedStacksHistory: newPausedHistory,
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
    [state.stacks, state.holes, state.pauses, state.isComplete, state.isLost, state.animatingStack, getStackPath, gameMode, state.level.gridRadius]
  );

  // Handle tapping a carousel to rotate tiles on its arms clockwise
  const tapCarousel = useCallback(
    (coord: AxialCoord) => {
      const key = hexKey(coord);
      const carousel = state.carousels.get(key);

      if (!carousel || state.isComplete || state.isLost || state.animatingStack) {
        return;
      }

      // Get the arms in clockwise order
      const arms = carousel.arms;
      if (arms.length < 2) return; // Need at least 2 arms to rotate

      // Find stacks at each arm position
      const armCoords = arms.map(dir => hexAdd(carousel.coord, HEX_DIRECTIONS[dir]));
      const stacksOnArms: (HexStack | null)[] = armCoords.map(armCoord => {
        const armKey = hexKey(armCoord);
        return state.stacks.get(armKey) || null;
      });

      // Check if there are any stacks to rotate
      const hasStacks = stacksOnArms.some(s => s !== null);
      if (!hasStacks) return; // No stacks to rotate

      // Rotate stacks clockwise: each stack moves to the next arm position
      setState((prev) => {
        const newStacks = new Map(prev.stacks);

        // First, remove all stacks from arm positions
        for (const armCoord of armCoords) {
          const armKey = hexKey(armCoord);
          newStacks.delete(armKey);
        }

        // Then, place stacks in their new positions (rotated clockwise)
        for (let i = 0; i < stacksOnArms.length; i++) {
          const stack = stacksOnArms[i];
          if (stack) {
            // Move to next arm position (clockwise)
            const nextIndex = (i + 1) % arms.length;
            const newCoord = armCoords[nextIndex];
            const newKey = hexKey(newCoord);
            newStacks.set(newKey, { ...stack, coord: newCoord });
          }
        }

        const newMoveCount = prev.moveCount + 1;
        const newHistory = [...prev.history, new Map(prev.stacks)];
        const newPausedHistory = [...prev.pausedStacksHistory, new Set(prev.pausedStacks)];
        const isComplete = newStacks.size === 0;
        const isLost = !isComplete && checkLoseCondition(newMoveCount, newStacks.size, prev.moveLimit);

        return {
          ...prev,
          stacks: newStacks,
          moveCount: newMoveCount,
          history: newHistory,
          pausedStacksHistory: newPausedHistory,
          isComplete,
          isWon: isComplete,
          isLost,
        };
      });
    },
    [state.carousels, state.stacks, state.isComplete, state.isLost, state.animatingStack]
  );

  // Undo last move
  const undo = useCallback(() => {
    if (state.history.length === 0 || state.animatingStack) return;

    setState((prev) => {
      const newHistory = [...prev.history];
      const previousStacks = newHistory.pop();
      const newPausedHistory = [...prev.pausedStacksHistory];
      const previousPausedStacks = newPausedHistory.pop();

      if (!previousStacks) return prev;

      return {
        ...prev,
        stacks: previousStacks,
        pausedStacks: previousPausedStacks || new Set(),
        moveCount: Math.max(0, prev.moveCount - 1),
        history: newHistory,
        pausedStacksHistory: newPausedHistory,
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
    tapCarousel,
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
  const pauses = new Set<string>();
  const carousels = new Map<string, Carousel>();

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

  // Initialize pause cells
  if (level.pauses) {
    for (const pause of level.pauses) {
      pauses.add(hexKey(pause));
    }
  }

  // Initialize carousels
  if (level.carousels) {
    for (const carousel of level.carousels) {
      const key = hexKey(carousel.coord);
      carousels.set(key, { ...carousel, arms: sortArmsClockwise(carousel.arms) });
    }
  }

  return {
    level,
    stacks,
    holes,
    pauses,
    carousels,
    pausedStacks: new Set<string>(),
    moveCount: 0,
    moveLimit: level.parMoves || 0, // 0 means unlimited
    isComplete: false,
    isWon: false,
    isLost: false,
    history: [],
    pausedStacksHistory: [],
    animatingStack: null,
    animationPhase: 'idle',
    animationData: null,
  };
}

// ============================================================================
// Types Export
// ============================================================================

export type UseHexaBlockGameReturn = ReturnType<typeof useHexaBlockGame>;
