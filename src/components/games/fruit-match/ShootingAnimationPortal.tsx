'use client';

import { useEffect, useRef, useCallback } from 'react';
import { ShootingConfig, PixelCell } from '@/types/fruitMatch';
import { BulletRenderer } from './BulletRenderer';

interface ShootingAnimationPortalProps {
  configs: ShootingConfig[]; // Multiple configs for parallel shooting
  onPixelHit: (cell: PixelCell) => void;
  onComplete: (launcherId: string) => void; // Takes launcherId to know which shooting completed
}

export function ShootingAnimationPortal({
  configs,
  onPixelHit,
  onComplete,
}: ShootingAnimationPortalProps) {
  // Track completed bullets per config
  const completionTrackingRef = useRef<Map<string, { completed: number; total: number; hasCalledComplete: boolean }>>(new Map());

  // Initialize/update tracking for each config
  useEffect(() => {
    const currentConfigIds = new Set(configs.map(c => c.id));

    // Add tracking for new configs
    for (const config of configs) {
      if (!completionTrackingRef.current.has(config.id)) {
        completionTrackingRef.current.set(config.id, {
          completed: 0,
          total: config.targets.length,
          hasCalledComplete: false,
        });
        console.log('[ShootingAnimation] New config:', config.id, 'targets:', config.targets.length);
      }
    }

    // Clean up tracking for removed configs
    for (const [id] of completionTrackingRef.current) {
      if (!currentConfigIds.has(id)) {
        completionTrackingRef.current.delete(id);
      }
    }
  }, [configs]);

  // Handle bullet completion for a specific config
  const handleBulletComplete = useCallback((configId: string, launcherId: string, cell: PixelCell, index: number) => {
    console.log('[ShootingAnimation] Bullet hit:', configId, index, 'cell:', cell.row, cell.col);

    // Fill the pixel
    onPixelHit(cell);

    // Track completion for this config
    const tracking = completionTrackingRef.current.get(configId);
    if (!tracking) return;

    tracking.completed++;

    // Check if all bullets for this config are done
    if (tracking.completed >= tracking.total && !tracking.hasCalledComplete) {
      tracking.hasCalledComplete = true;
      console.log('[ShootingAnimation] All bullets complete for:', launcherId);
      // Small delay after last impact effect
      setTimeout(() => {
        onComplete(launcherId);
      }, 200);
    }
  }, [onPixelHit, onComplete]);

  if (configs.length === 0) {
    return null;
  }

  // Render directly inside the board (no portal) - positions are relative to board
  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        pointerEvents: 'none',
        zIndex: 50,
        overflow: 'visible',
      }}
    >
      {/* Render bullets for ALL active configs (parallel shooting) */}
      {configs.map(config => (
        config.targets.map((target, index) => (
          <BulletRenderer
            key={`${config.id}-${index}`}
            sourcePosition={config.sourcePosition}
            targetPosition={target.position}
            cell={target.cell}
            color={config.color}
            delay={index * config.bulletDelay}
            flightTime={config.bulletFlightTime}
            onComplete={(cell) => handleBulletComplete(config.id, config.launcherId, cell, index)}
          />
        ))
      ))}
    </div>
  );
}
