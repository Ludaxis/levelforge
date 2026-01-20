'use client';

import { useMemo, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { PixelCell, FruitType, FRUIT_COLORS } from '@/types/fruitMatch';

interface PixelArtCanvasProps {
  pixelArt: PixelCell[];
  width: number;
  height: number;
  cellSize?: number;
  showLabels?: boolean;
  lastFilledCell?: { row: number; col: number } | null;
  animatingFruit?: FruitType | null;
}

export interface PixelArtCanvasRef {
  canvas: HTMLCanvasElement | null;
}

export const PixelArtCanvas = forwardRef<PixelArtCanvasRef, PixelArtCanvasProps>(function PixelArtCanvas({
  pixelArt,
  width,
  height,
  cellSize: propCellSize,
  showLabels = false,
  lastFilledCell,
  animatingFruit,
}, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Expose canvas ref to parent - use getter to always return current value
  useImperativeHandle(ref, () => ({
    get canvas() {
      return canvasRef.current;
    },
  }), []);

  // Calculate cell size to fit within max canvas size
  const maxCanvasSize = 600;
  const cellSize = propCellSize ?? Math.max(1, Math.floor(maxCanvasSize / Math.max(width, height)));
  const gap = cellSize > 4 ? 1 : 0; // Only show gap if cells are large enough
  const padding = 4;

  const canvasWidth = width * cellSize + (width - 1) * gap + padding * 2;
  const canvasHeight = height * cellSize + (height - 1) * gap + padding * 2;

  // Create a lookup for quick access
  const cellMap = useMemo(() => {
    const map = new Map<string, PixelCell>();
    for (const cell of pixelArt) {
      map.set(`${cell.row},${cell.col}`, cell);
    }
    return map;
  }, [pixelArt]);

  // Count filled and unfilled
  const { filled, total } = useMemo(() => {
    return {
      filled: pixelArt.filter(c => c.filled).length,
      total: pixelArt.length,
    };
  }, [pixelArt]);

  // Draw on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas with dark background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Draw each cell
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const x = padding + col * (cellSize + gap);
        const y = padding + row * (cellSize + gap);
        const cell = cellMap.get(`${row},${col}`);

        if (!cell) {
          // Empty cell (not part of pixel art) - very subtle
          ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
          ctx.fillRect(x, y, cellSize, cellSize);
        } else {
          const color = FRUIT_COLORS[cell.fruitType];
          const isFilled = cell.filled;

          if (isFilled) {
            // Filled cell - solid color with glow effect
            ctx.fillStyle = color;
            ctx.fillRect(x, y, cellSize, cellSize);
            // White border for filled
            if (cellSize > 2) {
              ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
              ctx.lineWidth = 1;
              ctx.strokeRect(x + 0.5, y + 0.5, cellSize - 1, cellSize - 1);
            }
          } else {
            // Unfilled cell - faded with color hint (target to fill)
            ctx.fillStyle = color + '20'; // ~12% opacity - slightly more visible
            ctx.fillRect(x, y, cellSize, cellSize);
            // Colored border for unfilled - dashed style feel
            if (cellSize > 2) {
              ctx.strokeStyle = color + '50'; // ~31% opacity
              ctx.lineWidth = 1;
              ctx.strokeRect(x + 0.5, y + 0.5, cellSize - 1, cellSize - 1);
            }
          }
        }
      }
    }

    // Draw highlight for last filled cell (pulsing effect)
    if (lastFilledCell) {
      const x = padding + lastFilledCell.col * (cellSize + gap);
      const y = padding + lastFilledCell.row * (cellSize + gap);
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 2;
      ctx.strokeRect(x - 2, y - 2, cellSize + 4, cellSize + 4);
    }
  }, [pixelArt, cellMap, width, height, cellSize, gap, canvasWidth, canvasHeight, padding, lastFilledCell]);

  return (
    <canvas
      ref={canvasRef}
      width={canvasWidth}
      height={canvasHeight}
      className="border border-muted rounded"
      style={{
        imageRendering: 'pixelated',
        maxWidth: '100%',
        height: 'auto',
      }}
    />
  );
});
