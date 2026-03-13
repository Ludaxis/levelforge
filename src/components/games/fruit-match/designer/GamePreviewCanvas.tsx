'use client';

import { useEffect, useRef } from 'react';
import { StudioPixelCell } from './types';

export function GamePreviewCanvas({
  pixels,
  width,
  height,
}: {
  pixels: Map<string, StudioPixelCell>;
  width: number;
  height: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewSize = 200;
  const cellSize = Math.max(1, Math.floor(previewSize / Math.max(width, height)));
  const canvasWidth = width * cellSize;
  const canvasHeight = height * cellSize;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    pixels.forEach((cell) => {
      ctx.fillStyle = `#${cell.colorHex}`;
      ctx.fillRect(cell.col * cellSize, cell.row * cellSize, cellSize - 0.5, cellSize - 0.5);
    });
  }, [pixels, width, height, cellSize, canvasWidth, canvasHeight]);

  return (
    <canvas
      ref={canvasRef}
      width={canvasWidth}
      height={canvasHeight}
      className="select-none"
      style={{ imageRendering: 'pixelated' }}
    />
  );
}
