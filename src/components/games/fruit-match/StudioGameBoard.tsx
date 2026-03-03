'use client';

import {
  useEffect,
  useCallback,
  useMemo,
  useState,
  useRef,
} from 'react';
import gsap from 'gsap';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { PixelArtCanvas } from './PixelArtCanvas';
import { FRUIT_EMOJI, FruitType, PixelCell, FRUIT_COLORS } from '@/types/fruitMatch';
import { COLOR_TYPE_TO_HEX, COLOR_TYPE_TO_FRUIT } from '@/lib/juicyBlastExport';
import {
  useStudioGame,
  StudioGameConfig,
  StudioTile,
  StudioLauncherState,
} from '@/lib/useStudioGame';
import { ArrowLeft, RotateCcw, Trophy, XCircle, Lock } from 'lucide-react';

// ============================================================================
// Helper: resolve actual hex color for a colorType
// ============================================================================

function resolveHex(
  colorType: number,
  colorTypeToHex: Record<number, string> | undefined,
): string {
  const hex = colorTypeToHex?.[colorType] ?? COLOR_TYPE_TO_HEX[colorType] ?? '888888';
  return `#${hex}`;
}

// ============================================================================
// Helper: pick emoji based on ACTUAL hex color, not hardcoded colorType mapping
// ============================================================================

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}

// Map from fruit emoji -> reference RGB used for matching
const EMOJI_COLOR_REFS: { emoji: string; r: number; g: number; b: number }[] = [
  { emoji: '\u{1FAD0}', r: 76, g: 158, b: 242 },   // Blue -> blueberry
  { emoji: '\u{1F34A}', r: 249, g: 157, b: 0 },     // Orange -> orange
  { emoji: '\u{1F353}', r: 223, g: 70, b: 36 },     // Red -> strawberry
  { emoji: '\u{1F409}', r: 222, g: 76, b: 126 },    // Pink -> dragon
  { emoji: '\u{1F34C}', r: 243, g: 222, b: 0 },     // Yellow -> banana
  { emoji: '\u{1F34F}', r: 144, g: 202, b: 0 },     // Green -> apple
  { emoji: '\u{1F347}', r: 142, g: 104, b: 224 },   // Violet -> grape
  { emoji: '\u{1F350}', r: 240, g: 235, b: 230 },   // White/Cream -> pear
  { emoji: '\u{1FAD2}', r: 76, g: 67, b: 67 },      // Dark/Black -> olive
];

function resolveEmoji(
  colorType: number,
  colorTypeToHex: Record<number, string> | undefined,
): string {
  const hex = colorTypeToHex?.[colorType];
  if (!hex) {
    return FRUIT_EMOJI[COLOR_TYPE_TO_FRUIT[colorType] as FruitType] ?? '\u2B1C';
  }

  const { r, g, b } = hexToRgb(hex);

  let bestEmoji = '\u2B1C';
  let bestDist = Infinity;
  for (const ref of EMOJI_COLOR_REFS) {
    const dr = r - ref.r;
    const dg = g - ref.g;
    const db = b - ref.b;
    const dist = dr * dr + dg * dg + db * db;
    if (dist < bestDist) {
      bestDist = dist;
      bestEmoji = ref.emoji;
    }
  }
  return bestEmoji;
}

// ============================================================================
// Props
// ============================================================================

interface StudioGameBoardProps {
  config: StudioGameConfig;
  onBack: () => void;
}

// ============================================================================
// LauncherCard — supports dimmed (locked) state
// ============================================================================

function LauncherCard({
  launcher,
  colorTypeToHex,
  dimmed = false,
}: {
  launcher: StudioLauncherState;
  colorTypeToHex?: Record<number, string>;
  dimmed?: boolean;
}) {
  const color = resolveHex(launcher.colorType, colorTypeToHex);
  const emoji = resolveEmoji(launcher.colorType, colorTypeToHex);
  const collected = launcher.collected.length;

  return (
    <div
      className="relative flex flex-col items-center gap-1.5 p-2.5 rounded-lg border min-w-[72px]"
      style={{
        backgroundColor: `${color}22`,
        borderColor: dimmed ? 'rgba(128,128,128,0.4)' : `${color}88`,
        opacity: dimmed ? 0.45 : 1,
      }}
    >
      {dimmed && (
        <div className="absolute inset-0 flex items-center justify-center z-10 rounded-lg bg-black/20">
          <Lock className="h-4 w-4 text-muted-foreground" />
        </div>
      )}
      <span className="text-xl">{emoji}</span>

      {/* 3 collection dots */}
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-3 h-3 rounded-full border"
            style={{
              backgroundColor: i < collected ? color : 'transparent',
              borderColor: `${color}80`,
            }}
          />
        ))}
      </div>

      {/* Pixel capacity badge */}
      <Badge
        variant="secondary"
        className="text-[9px] px-1.5 py-0"
      >
        {launcher.pixelCount}px
      </Badge>

      {/* Group badge */}
      <span className="text-[9px] text-muted-foreground">G{launcher.group}</span>
    </div>
  );
}

// ============================================================================
// LauncherCarousel — animated with GSAP
// ============================================================================

const CARD_WIDTH = 80; // min-w-[72px] + gap
const CARD_GAP = 8;
const STRIDE = CARD_WIDTH + CARD_GAP;

function LauncherCarousel({
  activeLaunchers,
  launcherQueue,
  colorTypeToHex,
  onAnimationStart,
  onAnimationEnd,
  configKey,
}: {
  activeLaunchers: StudioLauncherState[];
  launcherQueue: StudioLauncherState[];
  colorTypeToHex?: Record<number, string>;
  onAnimationStart: () => void;
  onAnimationEnd: () => void;
  configKey: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const prevLaunchersRef = useRef<StudioLauncherState[]>(activeLaunchers);
  const prevActiveHeadRef = useRef<string | null>(
    activeLaunchers[0]?.id ?? null,
  );
  const [exitingLauncher, setExitingLauncher] = useState<StudioLauncherState | null>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const prevConfigKeyRef = useRef(configKey);

  // Reset refs on game reset (configKey change)
  useEffect(() => {
    if (configKey !== prevConfigKeyRef.current) {
      prevConfigKeyRef.current = configKey;
      prevLaunchersRef.current = activeLaunchers;
      prevActiveHeadRef.current = activeLaunchers[0]?.id ?? null;
      setExitingLauncher(null);
      if (timelineRef.current) {
        timelineRef.current.kill();
        timelineRef.current = null;
      }
    }
  }, [configKey, activeLaunchers]);

  // Detect launcher fire and animate
  useEffect(() => {
    const prevHead = prevActiveHeadRef.current;
    const currHead = activeLaunchers[0]?.id ?? null;

    // No change in head launcher — just update ref
    if (prevHead === currHead || prevHead === null) {
      prevLaunchersRef.current = activeLaunchers;
      prevActiveHeadRef.current = currHead;
      return;
    }

    // Head changed — a launcher was fired
    const firedLauncher = prevLaunchersRef.current.find(
      (l) => l.id === prevHead,
    );
    if (!firedLauncher) {
      prevLaunchersRef.current = activeLaunchers;
      prevActiveHeadRef.current = currHead;
      return;
    }

    setExitingLauncher(firedLauncher);
    onAnimationStart();

    // Wait for next frame so exiting DOM node is mounted
    requestAnimationFrame(() => {
      const container = containerRef.current;
      if (!container) {
        setExitingLauncher(null);
        prevLaunchersRef.current = activeLaunchers;
        prevActiveHeadRef.current = currHead;
        onAnimationEnd();
        return;
      }

      const exitEl = container.querySelector('[data-launcher-exit]');
      const slotEls = container.querySelectorAll('[data-launcher-slot]');

      const tl = gsap.timeline({
        onComplete: () => {
          setExitingLauncher(null);
          prevLaunchersRef.current = activeLaunchers;
          prevActiveHeadRef.current = currHead;
          timelineRef.current = null;
          onAnimationEnd();
        },
      });
      timelineRef.current = tl;

      // Exit animation: slide left + fade
      if (exitEl) {
        gsap.set(exitEl, { x: 0, opacity: 1 });
        tl.to(exitEl, {
          x: -STRIDE,
          opacity: 0,
          duration: 0.28,
          ease: 'power2.in',
        });
      }

      // Shift remaining slots left (slots 0-1 active, 2-3 locked)
      slotEls.forEach((el, i) => {
        const isNewEntry = i >= 3; // last locked slot slides in fresh
        gsap.set(el, { x: STRIDE, opacity: isNewEntry ? 0 : 1 });
        tl.to(
          el,
          {
            x: 0,
            opacity: 1,
            duration: isNewEntry ? 0.28 : 0.32,
            ease: 'power2.out',
          },
          i * 0.04,
        );
      });
    });

    // Cleanup
    return () => {
      if (timelineRef.current) {
        timelineRef.current.kill();
        timelineRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLaunchers]);

  // Build display items: 2 active + 2 locked from queue
  const lockedFromQueue = launcherQueue.slice(0, 2);
  const totalRemaining = launcherQueue.length;
  // Badge shows remaining AFTER the 2 visible locked cards
  const badgeCount = totalRemaining > 2 ? totalRemaining - 2 : 0;

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        className="relative flex items-center justify-center gap-2 overflow-hidden"
        style={{ minHeight: 110 }}
      >
        {/* Exiting launcher (fired) */}
        {exitingLauncher && (
          <div
            data-launcher-exit
            className="absolute left-0"
            style={{ top: '50%', transform: 'translateY(-50%)' }}
          >
            <LauncherCard
              launcher={exitingLauncher}
              colorTypeToHex={colorTypeToHex}
            />
          </div>
        )}

        {/* Active launchers (slots 0, 1) */}
        {activeLaunchers.map((launcher, i) => (
          <div key={launcher.id} data-launcher-slot={i}>
            <LauncherCard
              launcher={launcher}
              colorTypeToHex={colorTypeToHex}
            />
          </div>
        ))}

        {/* Locked launchers from queue */}
        {lockedFromQueue.map((launcher, i) => (
          <div key={launcher.id} data-launcher-slot={activeLaunchers.length + i}>
            <LauncherCard
              launcher={launcher}
              colorTypeToHex={colorTypeToHex}
              dimmed
            />
          </div>
        ))}

        {/* Badge for remaining queue */}
        {badgeCount > 0 && (
          <Badge
            variant="outline"
            className="text-xs px-2 py-1 text-muted-foreground"
          >
            +{badgeCount}
          </Badge>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// PixelFillOverlay — GSAP animated overlay canvas
// ============================================================================

function PixelFillOverlay({
  pixelArt,
  width,
  height,
  onAnimationStart,
  onAnimationEnd,
  configKey,
}: {
  pixelArt: PixelCell[];
  width: number;
  height: number;
  onAnimationStart: () => void;
  onAnimationEnd: () => void;
  configKey: string;
}) {
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const prevPixelArtRef = useRef<PixelCell[]>(pixelArt);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const prevConfigKeyRef = useRef(configKey);

  // Canvas dimensions must match PixelArtCanvas exactly
  const maxCanvasSize = 600;
  const cellSize = Math.max(
    1,
    Math.floor(maxCanvasSize / Math.max(width, height)),
  );
  const gap = cellSize > 4 ? 1 : 0;
  const padding = 4;
  const canvasWidth = width * cellSize + (width - 1) * gap + padding * 2;
  const canvasHeight = height * cellSize + (height - 1) * gap + padding * 2;

  // Reset on game reset
  useEffect(() => {
    if (configKey !== prevConfigKeyRef.current) {
      prevConfigKeyRef.current = configKey;
      prevPixelArtRef.current = pixelArt;
      if (timelineRef.current) {
        timelineRef.current.kill();
        timelineRef.current = null;
      }
      const canvas = overlayRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx?.clearRect(0, 0, canvasWidth, canvasHeight);
      }
    }
  }, [configKey, pixelArt, canvasWidth, canvasHeight]);

  // Detect newly filled pixels and animate
  useEffect(() => {
    const prev = prevPixelArtRef.current;
    const curr = pixelArt;

    // Find newly filled cells
    const newlyFilled: PixelCell[] = [];
    for (let i = 0; i < curr.length; i++) {
      if (curr[i].filled && (!prev[i] || !prev[i].filled)) {
        newlyFilled.push(curr[i]);
      }
    }

    prevPixelArtRef.current = curr;

    if (newlyFilled.length === 0) return;

    const canvas = overlayRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    onAnimationStart();

    // Kill any previous animation
    if (timelineRef.current) {
      timelineRef.current.kill();
    }

    // Build particles: each newly filled cell gets a radial glow
    interface Particle {
      cx: number;
      cy: number;
      color: string;
      progress: { v: number };   // 0 -> 1
      fadeProgress: { v: number }; // 0 -> 1
    }

    const particles: Particle[] = newlyFilled.map((cell) => {
      const cx = padding + cell.col * (cellSize + gap) + cellSize / 2;
      const cy = padding + cell.row * (cellSize + gap) + cellSize / 2;
      const color = cell.colorHex
        ? `#${cell.colorHex}`
        : FRUIT_COLORS[cell.fruitType];
      return { cx, cy, color, progress: { v: 0 }, fadeProgress: { v: 0 } };
    });

    const peakRadius = Math.max(cellSize * 1.5, 6);

    const tl = gsap.timeline({
      onUpdate: () => {
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);
        for (const p of particles) {
          const r = p.progress.v * peakRadius;
          if (r <= 0) continue;
          const alpha = 1 - p.fadeProgress.v;
          if (alpha <= 0) continue;

          const grad = ctx.createRadialGradient(
            p.cx,
            p.cy,
            0,
            p.cx,
            p.cy,
            r,
          );
          // Parse color to RGB for alpha control
          const rgb = hexToRgb(p.color);
          grad.addColorStop(
            0,
            `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha * 0.9})`,
          );
          grad.addColorStop(
            0.5,
            `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha * 0.5})`,
          );
          grad.addColorStop(
            1,
            `rgba(${rgb.r},${rgb.g},${rgb.b},0)`,
          );

          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(p.cx, p.cy, r, 0, Math.PI * 2);
          ctx.fill();
        }
      },
      onComplete: () => {
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);
        timelineRef.current = null;
        onAnimationEnd();
      },
    });
    timelineRef.current = tl;

    particles.forEach((p, i) => {
      // Expand
      tl.to(
        p.progress,
        { v: 1, duration: 0.25, ease: 'power2.out' },
        i * 0.04,
      );
      // Fade (starts slightly after expand begins)
      tl.to(
        p.fadeProgress,
        { v: 1, duration: 0.2, ease: 'power1.in' },
        i * 0.04 + 0.1,
      );
    });

    return () => {
      if (timelineRef.current) {
        timelineRef.current.kill();
        timelineRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pixelArt]);

  return (
    <canvas
      ref={overlayRef}
      width={canvasWidth}
      height={canvasHeight}
      className="absolute inset-0 rounded"
      style={{
        imageRendering: 'pixelated',
        maxWidth: '100%',
        height: 'auto',
        pointerEvents: 'none',
      }}
    />
  );
}

// ============================================================================
// Waiting Stand
// ============================================================================

function StudioWaitingStand({
  tiles,
  slots,
  colorTypeToHex,
}: {
  tiles: StudioTile[];
  slots: number;
  colorTypeToHex?: Record<number, string>;
}) {
  return (
    <div className="flex flex-wrap gap-1.5 p-2.5 bg-muted/20 rounded-lg border border-muted min-h-[44px] justify-center">
      {tiles.map((tile) => {
        const color = resolveHex(tile.colorType, colorTypeToHex);
        return (
          <div
            key={tile.id}
            className="w-9 h-9 rounded-md border flex items-center justify-center transition-all duration-200"
            style={{
              backgroundColor: `${color}44`,
              borderColor: `${color}88`,
            }}
          >
            <span className="text-lg">{resolveEmoji(tile.colorType, colorTypeToHex)}</span>
          </div>
        );
      })}

      {/* Empty slots */}
      {Array.from({ length: Math.max(0, slots - tiles.length) }).map((_, i) => (
        <div
          key={`empty-${i}`}
          className="w-9 h-9 rounded-md border border-dashed border-muted-foreground/20 bg-black/10"
        />
      ))}
    </div>
  );
}

// ============================================================================
// SinkSlot
// ============================================================================

function SinkSlot({
  tileA,
  tileB,
  onClick,
  disabled,
  colorTypeToHex,
}: {
  tileA: StudioTile | null;
  tileB: StudioTile | null;
  onClick: () => void;
  disabled: boolean;
  colorTypeToHex?: Record<number, string>;
}) {
  if (!tileA && !tileB) {
    return (
      <div className="flex flex-col items-center">
        <div className="w-10 h-10 rounded-md border border-dashed border-muted-foreground/10 bg-black/5" />
      </div>
    );
  }

  const colorA = tileA ? resolveHex(tileA.colorType, colorTypeToHex) : '';
  const colorB = tileB ? resolveHex(tileB.colorType, colorTypeToHex) : '';

  return (
    <div className="flex flex-col items-center gap-0">
      {/* Layer A -- clickable top tile */}
      {tileA ? (
        <button
          onClick={onClick}
          disabled={disabled}
          className={`
            relative w-10 h-10 rounded-md border-2 flex items-center justify-center
            transition-all duration-150 select-none z-10
            ${disabled
              ? 'opacity-60 cursor-not-allowed'
              : 'hover:scale-110 hover:brightness-110 active:scale-95 cursor-pointer'
            }
          `}
          style={{
            backgroundColor: colorA,
            borderColor: 'white',
            boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
          }}
        >
          <span className="text-lg">{resolveEmoji(tileA.colorType, colorTypeToHex)}</span>
        </button>
      ) : (
        <div className="w-10 h-10 rounded-md border border-dashed border-muted-foreground/10 bg-black/5 z-10" />
      )}

      {/* Layer B -- dimmed behind */}
      {tileB ? (
        <div
          className="w-10 h-7 rounded-b-md border flex items-end justify-center -mt-2 z-0"
          style={{
            backgroundColor: `${colorB}55`,
            borderColor: `${colorB}33`,
            opacity: 0.5,
          }}
        >
          <span className="text-xs opacity-70 mb-0.5">{resolveEmoji(tileB.colorType, colorTypeToHex)}</span>
        </div>
      ) : tileA ? (
        <div className="w-10 h-3 -mt-1" />
      ) : null}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function StudioGameBoard({ config, onBack }: StudioGameBoardProps) {
  const { state, reset, pickTile, progress, configKey } = useStudioGame(config);
  const colorTypeToHex = config.colorTypeToHex;

  // Animation callbacks (no blocking — user can keep picking during animations)
  const onAnimationStart = useCallback(() => {}, []);
  const onAnimationEnd = useCallback(() => {}, []);

  useEffect(() => {
    reset();
  }, [reset]);

  const handlePickTile = useCallback(
    (slotIndex: number) => {
      pickTile(slotIndex);
    },
    [pickTile],
  );

  if (!state) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground">
        Initializing game...
      </div>
    );
  }

  const gameOver = state.isWon || state.isLost;

  return (
    <div className="space-y-3">
      {/* Header with back button */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Editor
        </Button>
        <Button variant="outline" size="sm" onClick={reset}>
          <RotateCcw className="h-4 w-4 mr-1" />
          Reset
        </Button>
      </div>

      {/* Pixel Art Canvas with overlay */}
      <Card>
        <CardContent className="pt-4 flex justify-center">
          <div className="relative inline-block">
            <PixelArtCanvas
              pixelArt={state.pixelArt}
              width={config.pixelArtWidth}
              height={config.pixelArtHeight}
            />
            <PixelFillOverlay
              pixelArt={state.pixelArt}
              width={config.pixelArtWidth}
              height={config.pixelArtHeight}
              onAnimationStart={onAnimationStart}
              onAnimationEnd={onAnimationEnd}
              configKey={configKey}
            />
          </div>
        </CardContent>
      </Card>

      {/* Progress + Stats */}
      <Card>
        <CardContent className="pt-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {progress.filled}/{progress.total} pixels
            </span>
            <div className="flex gap-3 text-xs text-muted-foreground">
              <span>Moves: {state.moveCount}</span>
              <span>Fired: {state.matchCount}</span>
            </div>
          </div>
          <Progress value={progress.percent} className="h-2" />
        </CardContent>
      </Card>

      {/* Launchers — animated carousel */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            Launchers
            <Badge variant="outline" className="ml-2 text-[10px]">
              {state.activeLaunchers.length} active
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <LauncherCarousel
            activeLaunchers={state.activeLaunchers}
            launcherQueue={state.launcherQueue}
            colorTypeToHex={colorTypeToHex}
            onAnimationStart={onAnimationStart}
            onAnimationEnd={onAnimationEnd}
            configKey={configKey}
          />
        </CardContent>
      </Card>

      {/* Waiting Stand */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            Waiting Stand
            <Badge variant="outline" className="ml-2 text-[10px]">
              {state.waitingStand.length}/{state.waitingStandSlots}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <StudioWaitingStand
            tiles={state.waitingStand}
            slots={state.waitingStandSlots}
            colorTypeToHex={colorTypeToHex}
          />
        </CardContent>
      </Card>

      {/* Sink -- Layer A (clickable grid) with Layer B dimmed underneath */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Sink</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2 justify-center">
            {state.layerA.map((tileA, idx) => (
              <SinkSlot
                key={idx}
                tileA={tileA}
                tileB={state.layerB[idx]}
                onClick={() => handlePickTile(idx)}
                disabled={gameOver || !tileA}
                colorTypeToHex={colorTypeToHex}
              />
            ))}
          </div>

          {/* Layer C -- visible queue for level designer */}
          {state.layerC.length > 0 && (
            <div className="pt-2 border-t border-muted space-y-1.5">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Queue ({state.layerC.length} tiles)
              </div>
              <div className="flex flex-wrap gap-1 max-h-[80px] overflow-y-auto">
                {state.layerC.map((tile) => {
                  const color = resolveHex(tile.colorType, colorTypeToHex);
                  return (
                    <div
                      key={tile.id}
                      className="w-6 h-6 rounded border flex items-center justify-center"
                      style={{
                        backgroundColor: `${color}40`,
                        borderColor: `${color}60`,
                      }}
                    >
                      <span className="text-[10px]">{resolveEmoji(tile.colorType, colorTypeToHex)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Win / Lose overlay */}
      {gameOver && (
        <Card className={state.isWon ? 'border-green-500 bg-green-500/10' : 'border-red-500 bg-red-500/10'}>
          <CardContent className="pt-6 pb-6 flex flex-col items-center gap-3">
            {state.isWon ? (
              <>
                <Trophy className="h-10 w-10 text-green-400" />
                <div className="text-lg font-bold text-green-400">You Win!</div>
                <div className="text-sm text-muted-foreground">
                  Completed in {state.moveCount} moves with {state.matchCount} launcher fires
                </div>
              </>
            ) : (
              <>
                <XCircle className="h-10 w-10 text-red-400" />
                <div className="text-lg font-bold text-red-400">Game Over</div>
                <div className="text-sm text-muted-foreground">
                  Waiting stand is full with no matching launchers
                </div>
              </>
            )}
            <div className="flex gap-2 mt-2">
              <Button variant="outline" size="sm" onClick={reset}>
                <RotateCcw className="h-4 w-4 mr-1" />
                Play Again
              </Button>
              <Button variant="ghost" size="sm" onClick={onBack}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back to Editor
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
