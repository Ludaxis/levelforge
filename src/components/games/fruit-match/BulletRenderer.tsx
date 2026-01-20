'use client';

import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ViewportPosition, PixelCell } from '@/types/fruitMatch';

interface BulletRendererProps {
  sourcePosition: ViewportPosition;
  targetPosition: ViewportPosition;
  cell: PixelCell;
  color: string;
  delay: number; // ms delay before firing
  flightTime: number; // ms for bullet flight
  onComplete: (cell: PixelCell) => void;
}

export function BulletRenderer({
  sourcePosition,
  targetPosition,
  cell,
  color,
  delay,
  flightTime,
  onComplete,
}: BulletRendererProps) {
  const bulletRef = useRef<HTMLDivElement>(null);
  const trailRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<'waiting' | 'firing' | 'impact' | 'done'>('waiting');
  const [impactPosition, setImpactPosition] = useState<ViewportPosition | null>(null);
  const hasCompletedRef = useRef(false);

  // Calculate angle for trail rotation
  const angle = Math.atan2(
    targetPosition.y - sourcePosition.y,
    targetPosition.x - sourcePosition.x
  );
  const angleDeg = (angle * 180 / Math.PI) + 90;

  // Start firing after delay
  useEffect(() => {
    const timer = setTimeout(() => {
      setPhase('firing');
    }, delay);

    return () => clearTimeout(timer);
  }, [delay]);

  // Animate bullet when firing starts
  useEffect(() => {
    if (phase !== 'firing') return;
    if (!bulletRef.current || !trailRef.current) return;

    const bullet = bulletRef.current;
    const trail = trailRef.current;
    const flightDuration = flightTime / 1000; // Convert to seconds for GSAP

    // Create master timeline
    const tl = gsap.timeline({
      onComplete: () => {
        if (!hasCompletedRef.current) {
          hasCompletedRef.current = true;
          setImpactPosition(targetPosition);
          setPhase('impact');
          onComplete(cell);

          // Cleanup after impact animation
          setTimeout(() => {
            setPhase('done');
          }, 400);
        }
      },
    });

    // Scale up bullet (appear)
    tl.fromTo(
      bullet,
      { scale: 0, opacity: 1 },
      { scale: 1, duration: 0.05, ease: 'power2.out' },
      0
    );

    // Fly bullet to target (account for centering offset)
    tl.to(
      bullet,
      {
        left: targetPosition.x - 7,  // Centered position
        top: targetPosition.y - 7,
        duration: flightDuration,
        ease: 'power1.in',
      },
      0.05
    );

    // Move trail with bullet
    tl.to(
      trail,
      {
        left: targetPosition.x - 2,  // Trail is 4px wide, center it
        top: targetPosition.y,
        opacity: 0,
        duration: flightDuration,
        ease: 'power1.in',
      },
      0.05
    );

    // Scale down bullet on impact
    tl.to(
      bullet,
      {
        scale: 0,
        duration: 0.05,
        ease: 'power2.in',
      },
      `-=0.02`
    );

    return () => {
      tl.kill();
    };
  }, [phase, targetPosition, flightTime, cell, onComplete]);

  // Don't render if done
  if (phase === 'done') return null;

  return (
    <>
      {/* Muzzle flash - only during firing start */}
      {phase === 'firing' && (
        <div
          style={{
            position: 'absolute',
            left: sourcePosition.x,
            top: sourcePosition.y,
            width: 24,
            height: 24,
            borderRadius: '50%',
            background: `radial-gradient(circle, white 0%, ${color} 50%, transparent 100%)`,
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
            animation: 'muzzle-flash 0.15s ease-out forwards',
          }}
        />
      )}

      {/* Bullet - use offset to center instead of transform (GSAP overrides transform) */}
      {(phase === 'firing' || phase === 'waiting') && (
        <div
          ref={bulletRef}
          style={{
            position: 'absolute',
            left: sourcePosition.x - 7, // Center: subtract half of width (14/2)
            top: sourcePosition.y - 7,  // Center: subtract half of height (14/2)
            width: 14,
            height: 14,
            borderRadius: '50%',
            background: `radial-gradient(circle at 30% 30%, white, ${color})`,
            boxShadow: `0 0 10px ${color}, 0 0 20px ${color}, 0 0 30px ${color}80`,
            transform: 'scale(0)',
            pointerEvents: 'none',
            opacity: phase === 'waiting' ? 0 : 1,
          }}
        />
      )}

      {/* Trail */}
      {phase === 'firing' && (
        <div
          ref={trailRef}
          style={{
            position: 'absolute',
            left: sourcePosition.x - 2, // Center: subtract half of width (4/2)
            top: sourcePosition.y,
            width: 4,
            height: 24,
            background: `linear-gradient(to bottom, ${color}, transparent)`,
            transform: `rotate(${angleDeg}deg)`,
            transformOrigin: 'top center',
            pointerEvents: 'none',
            opacity: 0.8,
          }}
        />
      )}

      {/* Impact effect */}
      {phase === 'impact' && impactPosition && (
        <>
          {/* Explosion ring */}
          <div
            style={{
              position: 'absolute',
              left: impactPosition.x,
              top: impactPosition.y,
              width: 20,
              height: 20,
              borderRadius: '50%',
              border: `3px solid ${color}`,
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'none',
              animation: 'impact-ring 0.3s ease-out forwards',
            }}
          />

          {/* Particles */}
          {[0, 1, 2, 3, 4, 5].map((i) => {
            const particleAngle = (i / 6) * Math.PI * 2;
            const distance = 20;
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: impactPosition.x,
                  top: impactPosition.y,
                  width: 5,
                  height: 5,
                  borderRadius: '50%',
                  background: color,
                  transform: 'translate(-50%, -50%)',
                  pointerEvents: 'none',
                  animation: `particle-fly-${i} 0.25s ease-out forwards`,
                  // Use CSS custom properties for particle direction
                  ['--particle-x' as string]: `${Math.cos(particleAngle) * distance}px`,
                  ['--particle-y' as string]: `${Math.sin(particleAngle) * distance}px`,
                }}
              />
            );
          })}
        </>
      )}

      {/* CSS Animations */}
      <style jsx global>{`
        @keyframes muzzle-flash {
          0% {
            transform: translate(-50%, -50%) scale(0);
            opacity: 1;
          }
          100% {
            transform: translate(-50%, -50%) scale(1.5);
            opacity: 0;
          }
        }

        @keyframes impact-ring {
          0% {
            transform: translate(-50%, -50%) scale(0.5);
            opacity: 1;
          }
          100% {
            transform: translate(-50%, -50%) scale(2);
            opacity: 0;
          }
        }

        @keyframes particle-fly-0 {
          0% { transform: translate(-50%, -50%); opacity: 1; }
          100% { transform: translate(calc(-50% + 20px), calc(-50% + 0px)); opacity: 0; }
        }
        @keyframes particle-fly-1 {
          0% { transform: translate(-50%, -50%); opacity: 1; }
          100% { transform: translate(calc(-50% + 10px), calc(-50% + 17.3px)); opacity: 0; }
        }
        @keyframes particle-fly-2 {
          0% { transform: translate(-50%, -50%); opacity: 1; }
          100% { transform: translate(calc(-50% + -10px), calc(-50% + 17.3px)); opacity: 0; }
        }
        @keyframes particle-fly-3 {
          0% { transform: translate(-50%, -50%); opacity: 1; }
          100% { transform: translate(calc(-50% + -20px), calc(-50% + 0px)); opacity: 0; }
        }
        @keyframes particle-fly-4 {
          0% { transform: translate(-50%, -50%); opacity: 1; }
          100% { transform: translate(calc(-50% + -10px), calc(-50% + -17.3px)); opacity: 0; }
        }
        @keyframes particle-fly-5 {
          0% { transform: translate(-50%, -50%); opacity: 1; }
          100% { transform: translate(calc(-50% + 10px), calc(-50% + -17.3px)); opacity: 0; }
        }
      `}</style>
    </>
  );
}
