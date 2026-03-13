'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload, ZoomIn, ZoomOut, Maximize } from 'lucide-react';
import { StudioPixelCell, StudioGroup, getGroupColor } from './types';

export function ArtworkCanvas({
  pixels,
  width,
  height,
  zoom,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onWheel,
  onUploadClick,
  onCellPaint,
  onGroupPaint,
  paintColor,
  hasData,
  groupPaintMode,
  groups,
  selectedGroupId,
}: {
  pixels: Map<string, StudioPixelCell>;
  width: number;
  height: number;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onWheel: (e: React.WheelEvent) => void;
  onUploadClick: () => void;
  onCellPaint: (row: number, col: number) => void;
  onGroupPaint: (row: number, col: number) => void;
  paintColor: number | 'eraser';
  hasData: boolean;
  groupPaintMode: boolean;
  groups: StudioGroup[];
  selectedGroupId: number | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [isPainting, setIsPainting] = useState(false);
  const lastPaintedCell = useRef<{ row: number; col: number } | null>(null);

  const maxCanvasSize = 600;
  const cellSize = Math.max(1, Math.floor(maxCanvasSize / Math.max(width, height)));
  const canvasWidth = width * cellSize;
  const canvasHeight = height * cellSize;

  // Build group index map for overlay colors
  const groupIndexMap = useMemo(() => {
    const map = new Map<number, number>();
    groups.forEach((g, idx) => map.set(g.id, idx));
    return map;
  }, [groups]);

  // Draw main canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Grid
    ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        ctx.fillRect(c * cellSize, r * cellSize, cellSize - 0.5, cellSize - 0.5);
      }
    }

    // Pixels - use original ColorHex
    pixels.forEach((cell) => {
      ctx.fillStyle = `#${cell.colorHex}`;
      ctx.fillRect(cell.col * cellSize, cell.row * cellSize, cellSize - 0.5, cellSize - 0.5);
    });
  }, [pixels, width, height, cellSize, canvasWidth, canvasHeight]);

  // Draw group overlay when in group paint mode
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    if (!groupPaintMode) return;

    const hasSelection = selectedGroupId != null;

    if (hasSelection) {
      // Dim all non-selected pixels with 55% black overlay
      pixels.forEach((cell) => {
        const isSelected = cell.group === selectedGroupId;
        if (!isSelected) {
          ctx.fillStyle = 'rgba(0,0,0,0.55)';
          ctx.fillRect(cell.col * cellSize, cell.row * cellSize, cellSize - 0.5, cellSize - 0.5);
        }
      });
      // Highlight selected group pixels with yellow tint + white border
      pixels.forEach((cell) => {
        if (cell.group !== selectedGroupId) return;
        // Subtle yellow tint
        ctx.fillStyle = 'rgba(255,255,100,0.18)';
        ctx.fillRect(cell.col * cellSize, cell.row * cellSize, cellSize - 0.5, cellSize - 0.5);
        // High-contrast white border (visible on any color)
        if (cellSize >= 2) {
          ctx.strokeStyle = 'rgba(255,255,255,0.9)';
          ctx.lineWidth = Math.max(1, cellSize >= 6 ? 1.5 : 1);
          ctx.strokeRect(
            cell.col * cellSize + 0.5,
            cell.row * cellSize + 0.5,
            cellSize - 1.5,
            cellSize - 1.5,
          );
        }
      });
    } else {
      // No selection: show all groups with colored overlays
      pixels.forEach((cell) => {
        const gIdx = groupIndexMap.get(cell.group);
        if (gIdx === undefined) return;
        const color = getGroupColor(gIdx);
        ctx.fillStyle = `${color}35`;
        ctx.fillRect(cell.col * cellSize, cell.row * cellSize, cellSize - 0.5, cellSize - 0.5);
      });
    }
  }, [pixels, groupPaintMode, groupIndexMap, selectedGroupId, cellSize, canvasWidth, canvasHeight]);

  const getCellFromEvent = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;

      let clientX: number, clientY: number;
      if ('touches' in e) {
        if (e.touches.length === 0) return null;
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }
      const x = (clientX - rect.left) * scaleX;
      const y = (clientY - rect.top) * scaleY;
      const col = Math.floor(x / cellSize);
      const row = Math.floor(y / cellSize);
      if (row >= 0 && row < height && col >= 0 && col < width) return { row, col };
      return null;
    },
    [cellSize, width, height],
  );

  const doPaint = useCallback(
    (row: number, col: number) => {
      if (lastPaintedCell.current?.row === row && lastPaintedCell.current?.col === col) return;
      lastPaintedCell.current = { row, col };
      if (groupPaintMode) {
        onGroupPaint(row, col);
      } else {
        onCellPaint(row, col);
      }
    },
    [onCellPaint, onGroupPaint, groupPaintMode],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      setIsPainting(true);
      lastPaintedCell.current = null;
      const cell = getCellFromEvent(e);
      if (cell) doPaint(cell.row, cell.col);
    },
    [getCellFromEvent, doPaint],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isPainting) return;
      const cell = getCellFromEvent(e);
      if (cell) doPaint(cell.row, cell.col);
    },
    [isPainting, getCellFromEvent, doPaint],
  );

  const stopPaint = useCallback(() => {
    setIsPainting(false);
    lastPaintedCell.current = null;
  }, []);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      setIsPainting(true);
      lastPaintedCell.current = null;
      const cell = getCellFromEvent(e);
      if (cell) doPaint(cell.row, cell.col);
    },
    [getCellFromEvent, doPaint],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent<HTMLCanvasElement>) => {
      if (!isPainting) return;
      e.preventDefault();
      const cell = getCellFromEvent(e);
      if (cell) doPaint(cell.row, cell.col);
    },
    [isPainting, getCellFromEvent, doPaint],
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          <span>{groupPaintMode ? 'Group Assignment Mode' : 'Artwork Canvas'}</span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={onZoomOut} title="Zoom Out" className="h-7 w-7 p-0">
              <ZoomOut className="h-3.5 w-3.5" />
            </Button>
            <span className="text-xs text-muted-foreground w-12 text-center">{Math.round(zoom * 100)}%</span>
            <Button variant="outline" size="sm" onClick={onZoomIn} title="Zoom In" className="h-7 w-7 p-0">
              <ZoomIn className="h-3.5 w-3.5" />
            </Button>
            <Button variant="outline" size="sm" onClick={onZoomReset} title="Fit" className="h-7 w-7 p-0">
              <Maximize className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <button
            onClick={onUploadClick}
            className="w-full h-40 border-2 border-dashed border-muted rounded-lg flex flex-col items-center justify-center gap-2 hover:border-primary/50 transition-colors"
          >
            <Upload className="h-8 w-8 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Click to upload Pixel Art JSON</span>
            <span className="text-xs text-muted-foreground">Supports full pixel art format &amp; reference format</span>
          </button>
        ) : (
          <div
            className="overflow-auto border border-muted rounded-lg bg-black/50 p-2 flex justify-center"
            style={{ maxHeight: '500px' }}
            onWheel={onWheel}
          >
            <div className="relative" style={{ width: canvasWidth * zoom, height: canvasHeight * zoom }}>
              <canvas
                ref={canvasRef}
                width={canvasWidth}
                height={canvasHeight}
                className="absolute inset-0 select-none touch-none"
                style={{
                  imageRendering: 'pixelated',
                  width: '100%',
                  height: '100%',
                }}
              />
              <canvas
                ref={overlayRef}
                width={canvasWidth}
                height={canvasHeight}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={stopPaint}
                onMouseLeave={stopPaint}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={stopPaint}
                className={`absolute inset-0 select-none touch-none ${groupPaintMode ? 'cursor-pointer' : 'cursor-crosshair'}`}
                style={{
                  imageRendering: 'pixelated',
                  width: '100%',
                  height: '100%',
                }}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
