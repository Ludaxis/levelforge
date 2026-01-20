'use client';

import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { Launcher, FruitType, FRUIT_EMOJI, FRUIT_COLORS, LauncherProgress } from '@/types/fruitMatch';

interface LauncherBarProps {
  launchers: Launcher[];
  launcherProgress: LauncherProgress[];
  matchingFruit: FruitType | null;
  matchingLauncherId: string | null;
  animationPhase: 'idle' | 'matching' | 'shooting' | 'conveyor' | string;
  launcherQueueLength: number;
  onLauncherRef?: (launcherId: string, element: HTMLDivElement | null) => void;
}

const LAUNCHER_WIDTH = 56;
const LAUNCHER_GAP = 4;

export function LauncherBar({
  launchers,
  launcherProgress,
  matchingFruit,
  matchingLauncherId,
  animationPhase,
  launcherQueueLength,
  onLauncherRef,
}: LauncherBarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const launcherRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [prevLaunchers, setPrevLaunchers] = useState<Launcher[]>(launchers);
  const isAnimatingRef = useRef(false);

  // Get collected tile count for a launcher
  const getCollectedCount = (launcherId: string) => {
    const progress = launcherProgress.find(p => p.launcherId === launcherId);
    return progress?.collectedTiles.length || 0;
  };

  // Handle conveyor animation when launchers change
  useEffect(() => {
    if (animationPhase !== 'conveyor' || isAnimatingRef.current) return;

    const removedLauncher = prevLaunchers.find(
      pl => !launchers.some(l => l.id === pl.id)
    );
    const newLauncher = launchers.find(
      l => !prevLaunchers.some(pl => pl.id === l.id)
    );

    if (!removedLauncher && !newLauncher) {
      setPrevLaunchers(launchers);
      return;
    }

    isAnimatingRef.current = true;

    // Get references to launcher elements
    const elements = Array.from(launcherRefs.current.entries())
      .filter(([id]) => launchers.some(l => l.id === id))
      .map(([id, el]) => ({ id, el, launcher: launchers.find(l => l.id === id)! }));

    // Create timeline for smooth conveyor animation
    const tl = gsap.timeline({
      onComplete: () => {
        isAnimatingRef.current = false;
        setPrevLaunchers(launchers);
      },
    });

    // Animate existing launchers sliding left
    elements.forEach(({ el, launcher }) => {
      const targetX = launcher.position * (LAUNCHER_WIDTH + LAUNCHER_GAP);
      tl.to(el, {
        x: 0, // Reset to natural position (CSS handles actual position)
        duration: 0.3,
        ease: 'power2.out',
      }, 0);
    });

    // If there's a new launcher, animate it sliding in from right
    if (newLauncher) {
      const newEl = launcherRefs.current.get(newLauncher.id);
      if (newEl) {
        gsap.set(newEl, { x: LAUNCHER_WIDTH + LAUNCHER_GAP, opacity: 0 });
        tl.to(newEl, {
          x: 0,
          opacity: 1,
          duration: 0.3,
          ease: 'power2.out',
        }, 0.1);
      }
    }

    return () => {
      tl.kill();
    };
  }, [launchers, prevLaunchers, animationPhase]);

  // Register launcher ref
  const setLauncherRef = (launcherId: string, el: HTMLDivElement | null) => {
    if (el) {
      launcherRefs.current.set(launcherId, el);
    } else {
      launcherRefs.current.delete(launcherId);
    }
    onLauncherRef?.(launcherId, el);
  };

  return (
    <div className="flex flex-col items-center">
      {/* Launcher slots - Compact */}
      <div
        ref={containerRef}
        className="relative flex items-center gap-1 p-2 bg-muted/30 rounded-lg border border-muted overflow-hidden"
      >
        {/* Conveyor belt decoration */}
        <div className="absolute inset-x-0 bottom-0 h-2 bg-gradient-to-r from-gray-800 via-gray-700 to-gray-800 rounded-b-lg">
          <div className="absolute inset-0 flex">
            {Array.from({ length: 20 }).map((_, i) => (
              <div
                key={i}
                className="h-full w-1.5 bg-gray-600 mr-3"
                style={{
                  animation: animationPhase === 'conveyor' ? 'conveyor-move 0.5s linear' : 'none',
                }}
              />
            ))}
          </div>
        </div>

        {/* Launchers */}
        <div className="flex gap-1 relative z-10">
          {[0, 1, 2, 3].map((position) => {
            const launcher = launchers.find(l => l.position === position);

            if (!launcher) {
              return (
                <div
                  key={`empty-${position}`}
                  className="w-14 h-16 rounded bg-black/20 border border-dashed border-muted flex items-center justify-center"
                >
                  <span className="text-muted-foreground/30 text-lg">?</span>
                </div>
              );
            }

            const isMatching = launcher.id === matchingLauncherId;
            const isShooting = isMatching && animationPhase === 'shooting';
            const isFirstLauncher = position === 0;
            const color = FRUIT_COLORS[launcher.requiredFruit];
            const collectedCount = getCollectedCount(launcher.id);

            return (
              <div
                key={launcher.id}
                ref={(el) => setLauncherRef(launcher.id, el)}
                className={`
                  relative w-14 h-16 rounded border-2 flex flex-col items-center justify-center gap-0.5
                  transition-colors duration-200
                  ${isFirstLauncher ? 'border-white ring-1 ring-white/30' : 'border-muted'}
                `}
                style={{
                  backgroundColor: `${color}20`,
                  borderColor: isMatching ? color : undefined,
                }}
              >
                {/* Fruit emoji */}
                <span className={`text-lg ${isShooting ? 'animate-bounce' : ''}`}>
                  {FRUIT_EMOJI[launcher.requiredFruit]}
                </span>

                {/* Collected tiles indicator */}
                <div className="flex gap-0.5">
                  {[0, 1, 2].map((idx) => (
                    <div
                      key={idx}
                      className={`w-3 h-3 rounded-sm border transition-all duration-200 ${
                        idx < collectedCount
                          ? 'border-transparent'
                          : 'border-muted bg-black/20'
                      }`}
                      style={{
                        backgroundColor: idx < collectedCount ? color : undefined,
                        boxShadow: idx < collectedCount ? `0 0 4px ${color}` : undefined,
                      }}
                    />
                  ))}
                </div>

                {/* Shooting animation overlay */}
                {isShooting && (
                  <div className="absolute inset-0 rounded overflow-hidden pointer-events-none">
                    <div
                      className="absolute inset-0 animate-ping"
                      style={{ backgroundColor: `${color}40` }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Incoming launcher indicator */}
        {launcherQueueLength > 0 && (
          <div className="absolute -right-1 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-muted border border-dashed border-muted-foreground/50 flex items-center justify-center z-20">
            <span className="text-xs text-muted-foreground">+</span>
          </div>
        )}
      </div>

      <style jsx global>{`
        @keyframes conveyor-move {
          from { transform: translateX(0); }
          to { transform: translateX(-24px); }
        }
      `}</style>
    </div>
  );
}
