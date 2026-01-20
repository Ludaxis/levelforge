'use client';

import { useRef, useCallback, useState, useEffect, useMemo } from 'react';
import {
  FruitMatchState,
  FRUIT_COLORS,
  ShootingConfig,
  ViewportPosition,
  TargetWithPosition,
  PixelCell,
} from '@/types/fruitMatch';
import { UseFruitMatchGameReturn } from '@/lib/useFruitMatchGame';
import { PixelArtCanvas, PixelArtCanvasRef } from './PixelArtCanvas';
import { LauncherBar } from './LauncherBar';
import { WaitingStand } from './WaitingStand';
import { TileSink } from './TileSink';
import { ShootingAnimationPortal } from './ShootingAnimationPortal';

interface FruitMatchBoardProps {
  game: UseFruitMatchGameReturn;
}

export function FruitMatchBoard({ game }: FruitMatchBoardProps) {
  const { state, animationState, pickTile, progress, fillSinglePixel, onShootingComplete } = game;
  const {
    pixelArt,
    level,
    launchers,
    launcherProgress,
    waitingStand,
    sinkStacks,
    animatingTile,
    animationPhase,
    lastMatchedFruit,
    lastMatchedLauncherId,
    launcherQueue,
    isComplete,
    isLost,
  } = state;

  // Refs for animation positioning
  const boardRef = useRef<HTMLDivElement>(null);
  const pixelArtCanvasRef = useRef<PixelArtCanvasRef>(null);
  const launcherRefsMap = useRef<Map<string, HTMLDivElement>>(new Map());

  // Allow picking during idle or shooting phases (not during pick animation)
  const canPick = (animationPhase === 'idle' || animationPhase === 'shooting') && !isComplete && !isLost;

  // Calculate cell size for pixel art (smaller canvas)
  const maxCanvasSize = 300;
  const cellSize = Math.max(1, Math.floor(maxCanvasSize / Math.max(level.pixelArtWidth, level.pixelArtHeight)));
  const gap = cellSize > 4 ? 1 : 0;
  const padding = 2;

  // Register launcher ref
  const handleLauncherRef = useCallback((launcherId: string, el: HTMLDivElement | null) => {
    if (el) {
      launcherRefsMap.current.set(launcherId, el);
    } else {
      launcherRefsMap.current.delete(launcherId);
    }
  }, []);

  // Handle pixel hit from animation
  const handlePixelHit = useCallback((cell: PixelCell) => {
    fillSinglePixel(cell);
  }, [fillSinglePixel]);

  // ============================================================================
  // Position Resolver Functions (Relative to Board container)
  // ============================================================================

  // Get launcher muzzle position RELATIVE TO BOARD
  const getLauncherMuzzlePosition = useCallback((launcherId: string): ViewportPosition | null => {
    const launcher = launcherRefsMap.current.get(launcherId);
    const board = boardRef.current;
    if (!launcher || !board) {
      console.warn('[FruitMatchBoard] Launcher or board ref not found:', launcherId);
      return null;
    }
    const launcherRect = launcher.getBoundingClientRect();
    const boardRect = board.getBoundingClientRect();
    // Return center of launcher RELATIVE to board
    return {
      x: launcherRect.left - boardRect.left + launcherRect.width / 2,
      y: launcherRect.top - boardRect.top + launcherRect.height * 0.35,
    };
  }, []);

  // Get pixel position RELATIVE TO BOARD
  const getPixelViewportPosition = useCallback((row: number, col: number): ViewportPosition | null => {
    const canvas = pixelArtCanvasRef.current?.canvas;
    const board = boardRef.current;
    if (!canvas || !board) {
      console.warn('[FruitMatchBoard] Canvas or board ref not found');
      return null;
    }

    const canvasRect = canvas.getBoundingClientRect();
    const boardRect = board.getBoundingClientRect();

    // Canvas internal dimensions (must match PixelArtCanvas calculation)
    const canvasInternalWidth = level.pixelArtWidth * cellSize + (level.pixelArtWidth - 1) * gap + padding * 2;
    const canvasInternalHeight = level.pixelArtHeight * cellSize + (level.pixelArtHeight - 1) * gap + padding * 2;

    // CSS scaling factor (canvas might be scaled by maxWidth: 100%)
    const scaleX = canvasRect.width / canvasInternalWidth;
    const scaleY = canvasRect.height / canvasInternalHeight;

    // Cell center position in canvas internal coordinates
    const cellCenterX = padding + col * (cellSize + gap) + cellSize / 2;
    const cellCenterY = padding + row * (cellSize + gap) + cellSize / 2;

    // Convert to position RELATIVE TO BOARD
    const relativeX = canvasRect.left - boardRect.left + cellCenterX * scaleX;
    const relativeY = canvasRect.top - boardRect.top + cellCenterY * scaleY;

    return { x: relativeX, y: relativeY };
  }, [level.pixelArtWidth, level.pixelArtHeight, cellSize, gap, padding]);

  // Create shooting config for a specific active shooting
  const createShootingConfigForLauncher = useCallback((activeShooting: { launcherId: string; targetCells: PixelCell[] }): ShootingConfig | null => {
    const { launcherId, targetCells } = activeShooting;

    if (targetCells.length === 0) {
      return null;
    }

    // Get launcher to find fruit type
    const launcher = launchers.find(l => l.id === launcherId);
    if (!launcher) {
      console.error('[FruitMatchBoard] Launcher not found:', launcherId);
      return null;
    }

    // Get source position
    const sourcePosition = getLauncherMuzzlePosition(launcherId);
    if (!sourcePosition) {
      console.error('[FruitMatchBoard] Could not get launcher position');
      return null;
    }

    // Pre-compute all target positions
    const targets: TargetWithPosition[] = [];
    for (const cell of targetCells) {
      const position = getPixelViewportPosition(cell.row, cell.col);
      if (!position) {
        console.error('[FruitMatchBoard] Could not get pixel position for:', cell.row, cell.col);
        return null;
      }
      targets.push({ cell, position });
    }

    const config: ShootingConfig = {
      id: `shooting-${launcherId}-${Date.now()}`,
      launcherId,
      sourcePosition,
      targets,
      fruitType: launcher.requiredFruit,
      color: FRUIT_COLORS[launcher.requiredFruit],
      bulletDelay: 80, // ms between bullets
      bulletFlightTime: 150, // ms per bullet flight
    };

    console.log('[FruitMatchBoard] Created shooting config:', {
      id: config.id,
      launcherId: config.launcherId,
      source: config.sourcePosition,
      targetCount: config.targets.length,
      fruitType: config.fruitType,
    });

    return config;
  }, [launchers, getLauncherMuzzlePosition, getPixelViewportPosition]);

  // State to hold all active shooting configs (supports parallel shooting)
  const [shootingConfigs, setShootingConfigs] = useState<ShootingConfig[]>([]);

  // Track which launchers already have configs created
  const configuredLaunchersRef = useRef<Set<string>>(new Set());

  // Compute shooting configs when animation state changes
  useEffect(() => {
    // If game is over, clear all configs
    if (isComplete || isLost) {
      if (shootingConfigs.length > 0) {
        setShootingConfigs([]);
        configuredLaunchersRef.current.clear();
      }
      return;
    }

    const { activeShootings } = animationState;

    // Find new shootings that need configs
    const newShootings = activeShootings.filter(s => !configuredLaunchersRef.current.has(s.launcherId));

    if (newShootings.length > 0) {
      // Small delay to ensure refs are mounted
      const timer = setTimeout(() => {
        const newConfigs: ShootingConfig[] = [];
        for (const shooting of newShootings) {
          const config = createShootingConfigForLauncher(shooting);
          if (config) {
            newConfigs.push(config);
            configuredLaunchersRef.current.add(shooting.launcherId);
          }
        }
        if (newConfigs.length > 0) {
          setShootingConfigs(prev => [...prev, ...newConfigs]);
        }
      }, 50);
      return () => clearTimeout(timer);
    }

    // Remove configs for completed shootings
    const activeLauncherIds = new Set(activeShootings.map(s => s.launcherId));
    const configsToRemove = shootingConfigs.filter(c => !activeLauncherIds.has(c.launcherId));
    if (configsToRemove.length > 0) {
      for (const config of configsToRemove) {
        configuredLaunchersRef.current.delete(config.launcherId);
      }
      setShootingConfigs(prev => prev.filter(c => activeLauncherIds.has(c.launcherId)));
    }
  }, [animationState.activeShootings, shootingConfigs, createShootingConfigForLauncher, isComplete, isLost]);

  // Debug log
  console.log('[FruitMatchBoard] Animation state:', {
    isShootingActive: animationState.isShootingActive,
    activeShootingsCount: animationState.activeShootings.length,
    shootingConfigsCount: shootingConfigs.length,
  });

  return (
    <div ref={boardRef} className="flex flex-col items-center gap-3 p-2 relative">
      {/* Shooting Animation - positioned relative to this board container */}
      <ShootingAnimationPortal
        configs={shootingConfigs}
        onPixelHit={handlePixelHit}
        onComplete={onShootingComplete}
      />

      {/* Pixel Art Target */}
      <PixelArtCanvas
        ref={pixelArtCanvasRef}
        pixelArt={pixelArt}
        width={level.pixelArtWidth}
        height={level.pixelArtHeight}
        cellSize={cellSize}
      />

      {/* Launchers */}
      <LauncherBar
        launchers={launchers}
        launcherProgress={launcherProgress}
        matchingFruit={lastMatchedFruit}
        matchingLauncherId={lastMatchedLauncherId}
        animationPhase={animationPhase}
        launcherQueueLength={launcherQueue.length}
        onLauncherRef={handleLauncherRef}
      />

      {/* Waiting Stand */}
      <WaitingStand
        tiles={waitingStand}
        slots={level.waitingStandSlots}
        launchers={launchers}
        matchingFruit={lastMatchedFruit}
        isAnimating={animationPhase === 'matching'}
      />

      {/* Tile Sink */}
      <TileSink
        sinkStacks={sinkStacks}
        onPickTile={pickTile}
        canPick={canPick}
        animatingTileId={animatingTile}
      />

      {/* Win/Lose overlays */}
      {isComplete && (
        <div className="absolute inset-0 bg-green-500/20 flex items-center justify-center backdrop-blur-sm rounded-lg">
          <div className="bg-background p-6 rounded-xl shadow-xl text-center">
            <h2 className="text-2xl font-bold text-green-500 mb-2">Level Complete!</h2>
            <p className="text-muted-foreground">Moves: {state.moveCount} | Matches: {state.matchCount}</p>
          </div>
        </div>
      )}

      {isLost && (
        <div className="absolute inset-0 bg-red-500/20 flex items-center justify-center backdrop-blur-sm rounded-lg">
          <div className="bg-background p-6 rounded-xl shadow-xl text-center">
            <h2 className="text-2xl font-bold text-red-500 mb-2">Game Over!</h2>
            <p className="text-muted-foreground">No valid moves remaining</p>
          </div>
        </div>
      )}
    </div>
  );
}
