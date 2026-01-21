'use client';

import { useState, useCallback, useMemo, useRef } from 'react';
import {
  FruitType,
  FruitMatchLevel,
  FruitMatchState,
  SinkTile,
  Launcher,
  PixelCell,
  AnimationPhase,
  LauncherCapacity,
  LauncherProgress,
} from '@/types/fruitMatch';
import {
  getTopTile,
  removeTileFromStack,
  generateLauncherQueue,
  createInitialLaunchers,
  shiftLaunchers,
  hasMatchingTriplet,
  canMatchAnyLauncher,
  removeMatchingTriplet,
  checkGameOver,
  fillMultiplePixels,
  getUnfilledPixels,
} from '@/lib/fruitMatchUtils';

// ============================================================================
// Animation Timing Constants
// ============================================================================

const PICK_ANIMATION_DURATION = 200;
const MATCH_ANIMATION_DURATION = 300;

// ============================================================================
// Initialize State Helper
// ============================================================================

// Single active shooting
export interface ActiveShooting {
  launcherId: string;
  targetCells: PixelCell[];
}

// Extended state for animation - supports multiple simultaneous shootings
export interface FruitMatchAnimationState {
  activeShootings: ActiveShooting[]; // Multiple launchers can shoot at once
  // Legacy fields for backwards compatibility
  isShootingActive: boolean; // true if any shooting is active
}

function initializeState(level: FruitMatchLevel): FruitMatchState {
  // Generate launcher queue from pixel art (with optional manual ordering)
  const queue = generateLauncherQueue(level.pixelArt, level.launcherOrderConfig);
  const { launchers, remainingQueue } = createInitialLaunchers(queue);

  // Initialize progress tracking for each launcher
  const launcherProgress: LauncherProgress[] = launchers.map(l => ({
    launcherId: l.id,
    collectedTiles: [],
  }));

  // Deep copy sink stacks
  const sinkStacks = level.sinkStacks.map(stack =>
    stack.map(tile => ({ ...tile }))
  );

  return {
    level,
    pixelArt: level.pixelArt.map(cell => ({ ...cell, filled: false })),
    sinkStacks,
    waitingStand: [],
    launchers,
    launcherProgress,
    launcherQueue: remainingQueue,
    moveCount: 0,
    matchCount: 0,
    isComplete: false,
    isWon: false,
    isLost: false,
    animatingTile: null,
    animationPhase: 'idle',
    lastMatchedFruit: null,
    lastMatchedCapacity: null,
    lastMatchedLauncherId: null,
  };
}

// ============================================================================
// Game Hook
// ============================================================================

export function useFruitMatchGame(initialLevel: FruitMatchLevel) {
  const [state, setState] = useState<FruitMatchState>(() => initializeState(initialLevel));

  // Animation state (separate from game state for performance)
  const [animationState, setAnimationState] = useState<FruitMatchAnimationState>({
    activeShootings: [],
    isShootingActive: false,
  });

  // Map of resolve functions per launcher (for parallel shooting)
  const shootingResolveMapRef = useRef<Map<string, () => void>>(new Map());

  // Track which launchers are currently executing (for parallel shooting)
  const executingLaunchersRef = useRef<Set<string>>(new Set());

  // Check if a tile is pickable (top of its stack)
  const canPickTile = useCallback((position: number, stackIndex: number): boolean => {
    const stack = state.sinkStacks[position];
    if (!stack || stack.length === 0) return false;

    const topTile = getTopTile(stack);
    return topTile?.stackIndex === stackIndex;
  }, [state.sinkStacks]);

  // Get all pickable tiles
  const pickableTiles = useMemo(() => {
    const tiles: { position: number; tile: SinkTile }[] = [];
    state.sinkStacks.forEach((stack, position) => {
      const top = getTopTile(stack);
      if (top) {
        tiles.push({ position, tile: top });
      }
    });
    return tiles;
  }, [state.sinkStacks]);

  // Check if waiting stand can accept more tiles
  const canAddToWaitingStand = useMemo(() => {
    return state.waitingStand.length < state.level.waitingStandSlots;
  }, [state.waitingStand.length, state.level.waitingStandSlots]);

  // Find launcher that needs this fruit type
  // Excludes launchers that are already full (3 tiles) or currently shooting
  const findMatchingLauncher = useCallback((
    fruitType: FruitType,
    launchers: Launcher[],
    launcherProgress: LauncherProgress[],
    shootingLauncherIds: string[]
  ) => {
    return launchers.find(l => {
      // Must need this fruit type
      if (l.requiredFruit !== fruitType) return false;
      // Skip if this launcher is currently shooting
      if (shootingLauncherIds.includes(l.id)) return false;
      // Skip if launcher already has 3 tiles (full)
      const progress = launcherProgress.find(p => p.launcherId === l.id);
      if (progress && progress.collectedTiles.length >= 3) return false;
      return true;
    }) || null;
  }, []);

  // Pick a tile from the sink
  const pickTile = useCallback(async (position: number) => {
    // Block during game over or during pick animation (not shooting - allow picking while shooting)
    if (state.isComplete || state.isLost || state.animationPhase === 'picking') {
      return;
    }

    const stack = state.sinkStacks[position];
    if (!stack || stack.length === 0) return;

    const topTile = getTopTile(stack);
    if (!topTile) return;

    // Get list of currently shooting launcher IDs
    const shootingLauncherIds = animationState.activeShootings.map(s => s.launcherId);

    // Check if any launcher needs this fruit (excluding full/shooting launchers)
    const matchingLauncher = findMatchingLauncher(
      topTile.fruitType,
      state.launchers,
      state.launcherProgress,
      shootingLauncherIds
    );

    if (!matchingLauncher) {
      // No launcher needs this fruit - goes to waiting stand
      if (state.waitingStand.length >= state.level.waitingStandSlots) {
        // Waiting stand is full, can't pick
        setState(prev => ({ ...prev, isLost: true }));
        return;
      }
    }

    // Start pick animation (skip if already shooting)
    const isShooting = state.animationPhase === 'shooting';
    if (!isShooting) {
      setState(prev => ({
        ...prev,
        animatingTile: topTile.id,
        animationPhase: 'picking',
      }));
      // Wait for animation
      await new Promise(resolve => setTimeout(resolve, PICK_ANIMATION_DURATION));
    } else {
      // Quick pick during shooting - minimal delay
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    // Check if this tile will trigger a match (3 tiles on launcher)
    // Re-check with current state since it may have changed during animation
    const launcher = findMatchingLauncher(
      topTile.fruitType,
      state.launchers,
      state.launcherProgress,
      shootingLauncherIds
    );
    let willTriggerMatch = false;
    let matchLauncherId: string | null = null;

    if (launcher) {
      const currentProgress = state.launcherProgress.find(p => p.launcherId === launcher.id);
      const currentCount = currentProgress?.collectedTiles.length || 0;
      if (currentCount >= 2) {
        // This will be the 3rd tile - will trigger match
        willTriggerMatch = true;
        matchLauncherId = launcher.id;
      }
    }

    // Update state - preserve shooting phase if currently shooting
    setState(prev => {
      const newSinkStacks = prev.sinkStacks.map((s, idx) =>
        idx === position ? removeTileFromStack(s, topTile.id) : s
      );

      // Find launcher again with latest state (excluding shooting launchers)
      const launcherForTile = findMatchingLauncher(
        topTile.fruitType,
        prev.launchers,
        prev.launcherProgress,
        shootingLauncherIds
      );

      // Keep shooting phase if we're currently shooting, otherwise go to idle
      const nextPhase = prev.animationPhase === 'shooting' ? 'shooting' : 'idle';

      if (launcherForTile) {
        // Add tile to launcher's progress
        const newProgress = prev.launcherProgress.map(p => {
          if (p.launcherId === launcherForTile.id) {
            return {
              ...p,
              collectedTiles: [...p.collectedTiles, topTile],
            };
          }
          return p;
        });

        return {
          ...prev,
          sinkStacks: newSinkStacks,
          launcherProgress: newProgress,
          moveCount: prev.moveCount + 1,
          animatingTile: null,
          animationPhase: nextPhase,
        };
      } else {
        // No matching launcher - add to waiting stand
        return {
          ...prev,
          sinkStacks: newSinkStacks,
          waitingStand: [...prev.waitingStand, topTile],
          moveCount: prev.moveCount + 1,
          animatingTile: null,
          animationPhase: nextPhase,
        };
      }
    });

    // If this tile triggers a match, execute it immediately
    if (willTriggerMatch && matchLauncherId) {
      // Small delay to let React process the state update
      await new Promise(resolve => setTimeout(resolve, 10));
      executeMatch(matchLauncherId);
    }
  }, [state.sinkStacks, state.waitingStand, state.launchers, state.launcherProgress, state.isComplete, state.isLost, state.animationPhase, state.level.waitingStandSlots, animationState.activeShootings, findMatchingLauncher]);

  // Fill a single pixel (called by animation component)
  const fillSinglePixel = useCallback((cell: PixelCell) => {
    setState(prev => ({
      ...prev,
      pixelArt: prev.pixelArt.map(c =>
        c.row === cell.row && c.col === cell.col
          ? { ...c, filled: true }
          : c
      ),
    }));
  }, []);

  // Called when shooting animation completes for a specific launcher
  const onShootingComplete = useCallback((launcherId: string) => {
    setAnimationState(prev => {
      const newActiveShootings = prev.activeShootings.filter(s => s.launcherId !== launcherId);
      return {
        ...prev,
        activeShootings: newActiveShootings,
        isShootingActive: newActiveShootings.length > 0,
      };
    });

    // Resolve this launcher's promise so its game flow continues
    const resolve = shootingResolveMapRef.current.get(launcherId);
    if (resolve) {
      resolve();
      shootingResolveMapRef.current.delete(launcherId);
    }
  }, []);

  // Helper to get current state synchronously
  const stateRef = useRef(state);
  stateRef.current = state;

  // Execute a match for a specific launcher (supports parallel execution)
  const executeMatch = useCallback(async (launcherId: string) => {
    // Check if this specific launcher is already executing
    if (executingLaunchersRef.current.has(launcherId)) {
      return;
    }

    // Mark this launcher as executing
    executingLaunchersRef.current.add(launcherId);

    const currentState = stateRef.current;

    // Stop immediately if game is over
    if (currentState.isComplete || currentState.isLost) {
      executingLaunchersRef.current.delete(launcherId);
      setAnimationState({
        activeShootings: [],
        isShootingActive: false,
      });
      return;
    }

    const launcher = currentState.launchers.find(l => l.id === launcherId);
    if (!launcher) {
      executingLaunchersRef.current.delete(launcherId);
      return;
    }

    const matchingFruit = launcher.requiredFruit;
    const matchingCapacity = launcher.capacity;
    const matchingLauncherId = launcher.id;

    // Get unfilled cells of this fruit type, sorted by position (row then col)
    // Also exclude cells targeted by other active shootings
    const otherTargetedCells = new Set<string>();
    // Get current active shootings from state ref pattern
    const currentActiveShootings = stateRef.current.pixelArt; // we need to track targeted cells differently

    const unfilled = currentState.pixelArt
      .filter(c => !c.filled && c.fruitType === matchingFruit)
      .sort((a, b) => {
        if (a.row !== b.row) return a.row - b.row;
        return a.col - b.col;
      });
    const targetCells = unfilled.slice(0, matchingCapacity);

    if (targetCells.length === 0) {
      executingLaunchersRef.current.delete(launcherId);
      return;
    }

    // Immediately start shooting - no "READY" delay
    setState(prev => {
      const newProgress = prev.launcherProgress.map(p => {
        if (p.launcherId === matchingLauncherId) {
          return { ...p, collectedTiles: p.collectedTiles.slice(3) };
        }
        return p;
      });

      return {
        ...prev,
        launcherProgress: newProgress,
        animationPhase: 'shooting' as AnimationPhase,
        lastMatchedFruit: matchingFruit,
        lastMatchedCapacity: matchingCapacity,
        lastMatchedLauncherId: matchingLauncherId,
      };
    });

    // Add to active shootings (parallel support)
    setAnimationState(prev => ({
      activeShootings: [...prev.activeShootings, { launcherId: matchingLauncherId, targetCells }],
      isShootingActive: true,
    }));

    // Wait for shooting animation to complete
    // Animation timing: 50ms setup + (bulletDelay: 80ms * count) + flightTime: 150ms + impact: 200ms + buffer
    const expectedAnimationTime = 50 + (targetCells.length * 80) + 150 + 200 + 500;

    await new Promise<void>(resolve => {
      shootingResolveMapRef.current.set(matchingLauncherId, resolve);
      // Fallback timeout - generous to let animation complete, but prevents permanent hang
      setTimeout(() => {
        if (shootingResolveMapRef.current.get(matchingLauncherId) === resolve) {
          console.warn('[useFruitMatchGame] Animation timeout for launcher:', matchingLauncherId);
          // Animation didn't complete in expected time - fill remaining pixels
          setState(prev => ({
            ...prev,
            pixelArt: prev.pixelArt.map(c => {
              const isTarget = targetCells.some(t => t.row === c.row && t.col === c.col);
              return isTarget ? { ...c, filled: true } : c;
            }),
          }));
          // Remove this shooting from active
          setAnimationState(prev => {
            const newActiveShootings = prev.activeShootings.filter(s => s.launcherId !== matchingLauncherId);
            return {
              activeShootings: newActiveShootings,
              isShootingActive: newActiveShootings.length > 0,
            };
          });
          resolve();
          shootingResolveMapRef.current.delete(matchingLauncherId);
        }
      }, expectedAnimationTime);
    });

    // Check if game ended during animation
    if (stateRef.current.isComplete || stateRef.current.isLost) {
      executingLaunchersRef.current.delete(launcherId);
      return;
    }

    // Shift launchers (start conveyor animation)
    setState(prev => {
      const { launchers: newLaunchers, remainingQueue } = shiftLaunchers(
        prev.launchers,
        prev.launcherQueue,
        matchingLauncherId
      );

      let newProgress = prev.launcherProgress.filter(p => p.launcherId !== matchingLauncherId);

      const newLauncher = newLaunchers.find(l =>
        !prev.launchers.some(ol => ol.id === l.id)
      );
      if (newLauncher) {
        newProgress.push({
          launcherId: newLauncher.id,
          collectedTiles: [],
        });
      }

      const unfilledAfter = getUnfilledPixels(prev.pixelArt);
      const isWon = unfilledAfter.length === 0;

      // Only go to conveyor phase if no other shootings active
      const hasOtherShootings = executingLaunchersRef.current.size > 1;
      const nextPhase = hasOtherShootings ? 'shooting' : 'conveyor';

      return {
        ...prev,
        launchers: newLaunchers,
        launcherProgress: newProgress,
        launcherQueue: remainingQueue,
        matchCount: prev.matchCount + 1,
        isComplete: isWon,
        isWon,
        animationPhase: nextPhase as AnimationPhase,
      };
    });

    // Wait for conveyor animation (shorter if other shootings happening)
    const hasOtherShootings = executingLaunchersRef.current.size > 1;
    await new Promise(resolve => setTimeout(resolve, hasOtherShootings ? 100 : 400));

    // Move tiles from waiting stand to matching launchers
    let triggeredLauncherIds: string[] = [];

    setState(prev => {
      let newWaitingStand = [...prev.waitingStand];
      let newProgress = [...prev.launcherProgress];

      // For each launcher, check if waiting stand has matching tiles
      for (const launcher of prev.launchers) {
        // Skip if this launcher is currently executing
        if (executingLaunchersRef.current.has(launcher.id)) continue;

        const progressEntry = newProgress.find(p => p.launcherId === launcher.id);
        if (!progressEntry) continue;

        // Find matching tiles in waiting stand
        const matchingTiles = newWaitingStand.filter(t => t.fruitType === launcher.requiredFruit);

        // Move tiles to launcher (up to 3 total)
        const currentCount = progressEntry.collectedTiles.length;
        const canTake = 3 - currentCount;
        const tilesToMove = matchingTiles.slice(0, canTake);

        if (tilesToMove.length > 0) {
          // Remove from waiting stand
          const tileIdsToMove = new Set(tilesToMove.map(t => t.id));
          newWaitingStand = newWaitingStand.filter(t => !tileIdsToMove.has(t.id));

          // Add to launcher progress
          newProgress = newProgress.map(p => {
            if (p.launcherId === launcher.id) {
              const updatedTiles = [...p.collectedTiles, ...tilesToMove];
              // Check if this launcher now has 3 tiles
              if (updatedTiles.length >= 3) {
                triggeredLauncherIds.push(launcher.id);
              }
              return { ...p, collectedTiles: updatedTiles };
            }
            return p;
          });
        }
      }

      // Only go to idle if no other shootings active
      const stillShooting = executingLaunchersRef.current.size > 1;
      const nextPhase = stillShooting ? 'shooting' : 'idle';

      return {
        ...prev,
        waitingStand: newWaitingStand,
        launcherProgress: newProgress,
        animationPhase: nextPhase as AnimationPhase,
        lastMatchedFruit: stillShooting ? prev.lastMatchedFruit : null,
        lastMatchedCapacity: stillShooting ? prev.lastMatchedCapacity : null,
        lastMatchedLauncherId: stillShooting ? prev.lastMatchedLauncherId : null,
      };
    });

    // Small delay for state to update
    await new Promise(resolve => setTimeout(resolve, 50));

    // Mark this launcher's execution as complete
    executingLaunchersRef.current.delete(launcherId);

    // Don't continue if game ended
    if (stateRef.current.isComplete || stateRef.current.isLost) {
      return;
    }

    // Trigger any launchers that now have 3 tiles (in parallel!)
    for (const triggeredId of triggeredLauncherIds) {
      executeMatch(triggeredId);
    }

    // Also check for any other ready launchers
    const readyLaunchers = stateRef.current.launcherProgress.filter(p =>
      p.collectedTiles.length >= 3 && !executingLaunchersRef.current.has(p.launcherId)
    );
    for (const ready of readyLaunchers) {
      executeMatch(ready.launcherId);
    }
  }, []);

  // Reset the game
  const reset = useCallback(() => {
    setState(initializeState(state.level));
  }, [state.level]);

  // Load a new level
  const loadLevel = useCallback((level: FruitMatchLevel) => {
    setState(initializeState(level));
  }, []);

  // Get progress info
  const progress = useMemo(() => {
    const totalPixels = state.pixelArt.length;
    const filledPixels = state.pixelArt.filter(c => c.filled).length;
    const remainingPixels = totalPixels - filledPixels;
    const percentComplete = totalPixels > 0 ? Math.round((filledPixels / totalPixels) * 100) : 0;

    return {
      totalPixels,
      filledPixels,
      remainingPixels,
      percentComplete,
    };
  }, [state.pixelArt]);

  // Get remaining tiles in sink
  const remainingSinkTiles = useMemo(() => {
    return state.sinkStacks.reduce((total, stack) => total + stack.length, 0);
  }, [state.sinkStacks]);

  return {
    state,
    animationState,
    pickTile,
    reset,
    loadLevel,
    canPickTile,
    pickableTiles,
    canAddToWaitingStand,
    progress,
    remainingSinkTiles,
    fillSinglePixel,
    onShootingComplete,
  };
}

export type UseFruitMatchGameReturn = ReturnType<typeof useFruitMatchGame>;
