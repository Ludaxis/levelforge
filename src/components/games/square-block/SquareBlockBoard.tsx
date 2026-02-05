'use client';

import { useMemo, useEffect, useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { ZoomIn, ZoomOut, Maximize, Move } from 'lucide-react';
import { SquareBlockState, SquareBlock, BlockDirection, MAX_MISTAKES } from '@/types/squareBlock';
import {
  GridCoord,
  SquareDirection,
  SquareAxis,
  gridKey,
  gridToPixel,
  getGridBounds,
  DIRECTION_ANGLES,
  AXIS_ANGLES,
  isBidirectional,
} from '@/lib/squareGrid';
import { DeadlockInfo } from '@/lib/useSquareBlockGame';

// ============================================================================
// Types
// ============================================================================

interface SquareBlockBoardProps {
  state: SquareBlockState;
  onTapBlock: (coord: GridCoord) => void;
  clearableBlocks: string[];
  canClearBlock: (block: SquareBlock) => boolean;
  isBlockUnlocked: (block: SquareBlock) => boolean;
  getRemainingIce: (block: SquareBlock) => number | null;
  isBlockMirror: (block: SquareBlock) => boolean;
  deadlockInfo?: DeadlockInfo;  // Enhanced deadlock information
}

// ============================================================================
// Constants
// ============================================================================

// Fixed cell size for readability - grid scrolls instead of shrinking
const FIXED_CELL_SIZE = 36;

// ============================================================================
// Component
// ============================================================================

// Helper function to convert hex color to grayscale
function toGrayscale(hexColor: string): string {
  // Handle non-hex colors
  if (!hexColor.startsWith('#')) return hexColor;

  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  // Use luminance formula for perceptually accurate grayscale
  const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  return `#${gray.toString(16).padStart(2, '0').repeat(3)}`;
}

export function SquareBlockBoard({
  state,
  onTapBlock,
  clearableBlocks,
  canClearBlock,
  isBlockUnlocked,
  getRemainingIce,
  isBlockMirror,
  deadlockInfo,
}: SquareBlockBoardProps) {
  const { level, blocks, holes, animatingBlock, animationPhase, animationData, mistakes, lastMistakeBlockId } = state;
  const { rows, cols } = level;

  // Track shaking block for animation
  const [shakingBlockId, setShakingBlockId] = useState<string | null>(null);

  // Trigger shake animation when a mistake occurs
  useEffect(() => {
    if (lastMistakeBlockId) {
      setShakingBlockId(lastMistakeBlockId);
      const timer = setTimeout(() => setShakingBlockId(null), 500);
      return () => clearTimeout(timer);
    }
  }, [lastMistakeBlockId]);

  // Zoom and pan state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const svgContainerRef = useRef<HTMLDivElement>(null);

  // Zoom controls
  const handleZoomIn = useCallback(() => {
    setZoom(z => Math.min(z * 1.25, 5));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom(z => Math.max(z / 1.25, 0.25));
  }, []);

  const handleZoomReset = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // Ctrl + Mouse wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setZoom(z => Math.max(0.5, Math.min(3, z * delta)));
    }
    // Without Ctrl, allow normal scrolling
  }, []);

  // Pan handlers
  const handlePanStart = useCallback((e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) { // Middle click or Alt+click
      e.preventDefault();
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  }, [pan]);

  const handlePanMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
    }
  }, [isPanning, panStart]);

  const handlePanEnd = useCallback(() => {
    setIsPanning(false);
  }, []);

  // Fixed cell size for readability
  const cellSize = FIXED_CELL_SIZE;
  const padding = 16;

  // Calculate SVG dimensions
  const { viewBox, origin, width, height } = useMemo(() => {
    const bounds = getGridBounds(rows, cols, cellSize);
    const w = bounds.width + padding * 2;
    const h = bounds.height + padding * 2;

    return {
      viewBox: `0 0 ${w} ${h}`,
      origin: { x: padding, y: padding },
      width: w,
      height: h,
    };
  }, [rows, cols, cellSize, padding]);

  // Generate grid coordinates
  const gridCoords = useMemo(() => {
    const coords: GridCoord[] = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        coords.push({ row, col });
      }
    }
    return coords;
  }, [rows, cols]);

  // Generate hearts display
  const hearts = Array.from({ length: MAX_MISTAKES }, (_, i) => {
    const isLost = i < mistakes;
    return (
      <span
        key={i}
        className={`text-2xl transition-all duration-300 ${isLost ? 'grayscale opacity-50' : ''}`}
      >
        {isLost ? '🩶' : '❤️'}
      </span>
    );
  });

  return (
    <div className="relative">
      {/* Hearts display */}
      <div className="flex justify-center gap-2 mb-4">
        {hearts}
      </div>

      {/* Zoom Controls */}
      <div className="flex items-center justify-center gap-2 mb-2">
        <Button variant="outline" size="sm" onClick={handleZoomOut} title="Zoom Out">
          <ZoomOut className="h-4 w-4" />
        </Button>
        <span className="text-xs text-muted-foreground w-16 text-center">{Math.round(zoom * 100)}%</span>
        <Button variant="outline" size="sm" onClick={handleZoomIn} title="Zoom In">
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={handleZoomReset} title="Reset View">
          <Maximize className="h-4 w-4" />
        </Button>
        <span className="text-xs text-muted-foreground ml-2">
          Ctrl+scroll to zoom
        </span>
      </div>

      {/* CSS keyframes for shake animation */}
      <style jsx>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
          20%, 40%, 60%, 80% { transform: translateX(4px); }
        }
      `}</style>

      {/* SVG Container - Scrollable */}
      <div
        ref={svgContainerRef}
        className="overflow-auto border border-muted rounded-lg bg-muted/20"
        style={{ maxHeight: '500px', cursor: isPanning ? 'grabbing' : 'default' }}
        onWheel={handleWheel}
        onMouseDown={handlePanStart}
        onMouseMove={handlePanMove}
        onMouseUp={handlePanEnd}
        onMouseLeave={handlePanEnd}
      >
        <svg
          viewBox={viewBox}
          style={{
            width: width * zoom,
            height: height * zoom,
            minWidth: width * zoom,
            minHeight: height * zoom,
          }}
        >
        {/* Background */}
        <rect
          x={origin.x}
          y={origin.y}
          width={cols * cellSize}
          height={rows * cellSize}
          fill="rgba(0, 0, 0, 0.3)"
          rx={8}
        />

        {/* Grid cells */}
        {gridCoords.map((coord) => {
          const key = gridKey(coord);
          const pixel = gridToPixel(coord, cellSize, origin);
          const hasHole = holes.has(key);

          return (
            <g key={key}>
              {/* Cell background */}
              <rect
                x={pixel.x - cellSize / 2 + 2}
                y={pixel.y - cellSize / 2 + 2}
                width={cellSize - 4}
                height={cellSize - 4}
                fill={hasHole ? 'rgba(0, 0, 0, 0.8)' : 'rgba(255, 255, 255, 0.03)'}
                stroke={hasHole ? 'rgba(139, 69, 19, 0.6)' : 'rgba(255, 255, 255, 0.1)'}
                strokeWidth={hasHole ? 2 : 1}
                rx={4}
              />

              {/* Hole visual */}
              {hasHole && (
                <g>
                  <circle
                    cx={pixel.x}
                    cy={pixel.y}
                    r={cellSize * 0.3}
                    fill="rgba(0, 0, 0, 0.9)"
                  />
                  <circle
                    cx={pixel.x}
                    cy={pixel.y}
                    r={cellSize * 0.35}
                    fill="none"
                    stroke="rgba(60, 40, 20, 0.8)"
                    strokeWidth={4}
                  />
                  <circle
                    cx={pixel.x}
                    cy={pixel.y}
                    r={cellSize * 0.18}
                    fill="rgba(20, 10, 5, 1)"
                  />
                </g>
              )}
            </g>
          );
        })}

        {/* Blocks */}
        {Array.from(blocks.values()).map((block) => {
          const key = gridKey(block.coord);
          const pixel = gridToPixel(block.coord, cellSize, origin);
          const isClearable = clearableBlocks.includes(key);
          const isAnimating = animatingBlock === block.id;
          const isLocked = block.locked && !isBlockUnlocked(block);
          const isFrozen = getRemainingIce(block) !== null && (getRemainingIce(block) ?? 0) > 0;
          const isMirror = isBlockMirror(block);

          // Deadlock state
          const hasDeadlock = deadlockInfo?.hasDeadlock ?? false;
          const stuckReason = deadlockInfo?.stuckBlocks.get(key);
          const isBlocker = deadlockInfo?.blockerBlocks.has(key) ?? false;
          const isStuck = !!stuckReason;
          const isMutualBlock = stuckReason?.type === 'mutual_block';

          // Apply grayscale to block color when in deadlock state
          const blockColor = hasDeadlock ? toGrayscale(block.color) : block.color;

          // Calculate animation transform
          let animationStyle: React.CSSProperties = {};
          const isShaking = shakingBlockId === block.id;

          if (isShaking) {
            // Shake animation for mistakes
            animationStyle = {
              animation: 'shake 0.5s ease-in-out',
            };
          } else if (isAnimating && animationData) {
            if (animationPhase === 'rolling' && animationData.exitOffset) {
              // Exit animation - slide out and fade
              animationStyle = {
                transform: `translate(${animationData.exitOffset.x}px, ${animationData.exitOffset.y}px)`,
                opacity: 0,
                transition: 'transform 0.5s ease-in, opacity 0.5s ease-in',
              };
            } else if (animationPhase === 'pushing' && animationData.pushOffset) {
              // Push animation - slide to new position (no fade)
              animationStyle = {
                transform: `translate(${animationData.pushOffset.x}px, ${animationData.pushOffset.y}px)`,
                transition: 'transform 0.35s ease-out',
              };
            } else if (animationPhase === 'bouncing' && animationData.bounceOffset) {
              // Bounce animation - JS controlled two-phase animation
              if (animationData.bouncePhase === 'out') {
                // Phase 1: Move toward blocker
                animationStyle = {
                  transform: `translate(${animationData.bounceOffset.x}px, ${animationData.bounceOffset.y}px)`,
                  transition: 'transform 0.15s ease-out',
                };
              } else {
                // Phase 2: Return to original position
                animationStyle = {
                  transform: 'translate(0, 0)',
                  transition: 'transform 0.2s ease-in',
                };
              }
            }
          }

          return (
            <g
              key={block.id}
              onClick={() => !isAnimating && onTapBlock(block.coord)}
              style={{
                cursor: isAnimating ? 'default' : 'pointer',
                ...animationStyle,
              }}
            >
              {/* Block body */}
              <rect
                x={pixel.x - cellSize / 2 + 4}
                y={pixel.y - cellSize / 2 + 4}
                width={cellSize - 8}
                height={cellSize - 8}
                fill={blockColor}
                stroke="rgba(0, 0, 0, 0.3)"
                strokeWidth={2}
                rx={6}
                className="transition-all duration-150"
              />

              {/* Direction arrow */}
              <g transform={`translate(${pixel.x}, ${pixel.y})`}>
                <DirectionArrow
                  direction={block.direction}
                  size={cellSize * 0.5}
                  color={isLocked || isFrozen ? 'rgba(255, 255, 255, 0.3)' : isClearable ? '#ffffff' : 'rgba(255, 255, 255, 0.5)'}
                />
              </g>

              {/* Lock icon overlay for locked blocks */}
              {isLocked && (
                <g transform={`translate(${pixel.x}, ${pixel.y})`}>
                  {/* Lock body */}
                  <rect
                    x={-8}
                    y={-2}
                    width={16}
                    height={12}
                    fill="rgba(0, 0, 0, 0.7)"
                    stroke="#fbbf24"
                    strokeWidth={1.5}
                    rx={2}
                  />
                  {/* Lock shackle */}
                  <path
                    d="M -5 -2 L -5 -6 A 5 5 0 0 1 5 -6 L 5 -2"
                    fill="none"
                    stroke="#fbbf24"
                    strokeWidth={2}
                    strokeLinecap="round"
                  />
                  {/* Keyhole */}
                  <circle cx={0} cy={4} r={2} fill="#fbbf24" />
                </g>
              )}

              {/* Ice overlay for frozen blocks */}
              {(() => {
                const remainingIce = getRemainingIce(block);
                if (remainingIce === null || remainingIce <= 0) return null;

                return (
                  <g>
                    {/* Ice crystal overlay */}
                    <rect
                      x={pixel.x - cellSize / 2 + 4}
                      y={pixel.y - cellSize / 2 + 4}
                      width={cellSize - 8}
                      height={cellSize - 8}
                      fill="rgba(135, 206, 250, 0.4)"
                      stroke="rgba(173, 216, 230, 0.8)"
                      strokeWidth={2}
                      rx={6}
                      pointerEvents="none"
                    />
                    {/* Ice count number */}
                    <text
                      x={pixel.x}
                      y={pixel.y + 4}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="#ffffff"
                      fontSize={cellSize * 0.4}
                      fontWeight="bold"
                      style={{ textShadow: '0 1px 3px rgba(0,0,0,0.7)' }}
                      pointerEvents="none"
                    >
                      {remainingIce}
                    </text>
                  </g>
                );
              })()}

              {/* Mirror indicator for mirror blocks */}
              {isMirror && (
                <g pointerEvents="none">
                  {/* Purple dashed border */}
                  <rect
                    x={pixel.x - cellSize / 2 + 2}
                    y={pixel.y - cellSize / 2 + 2}
                    width={cellSize - 4}
                    height={cellSize - 4}
                    fill="none"
                    stroke="rgba(168, 85, 247, 0.8)"
                    strokeWidth={2}
                    strokeDasharray="4 2"
                    rx={6}
                  />
                  {/* Mirror icon in BOTTOM-LEFT corner */}
                  <g transform={`translate(${pixel.x - cellSize / 2 + 12}, ${pixel.y + cellSize / 2 - 12})`}>
                    <circle cx={0} cy={0} r={7} fill="rgba(168, 85, 247, 0.95)" stroke="white" strokeWidth={1.5} />
                    {/* Flip horizontal arrows icon */}
                    <g transform="scale(0.8)">
                      <path d="M -3 0 L -1 -2 L -1 -0.8 L 1 -0.8 L 1 -2 L 3 0 L 1 2 L 1 0.8 L -1 0.8 L -1 2 Z" fill="white" />
                    </g>
                  </g>
                </g>
              )}

              {/* Clearable indicator */}
              {isClearable && (
                <rect
                  x={pixel.x - cellSize / 2 + 2}
                  y={pixel.y - cellSize / 2 + 2}
                  width={cellSize - 4}
                  height={cellSize - 4}
                  fill="none"
                  stroke="rgba(34, 197, 94, 0.6)"
                  strokeWidth={2}
                  strokeDasharray="5 3"
                  rx={6}
                  pointerEvents="none"
                  className="animate-pulse"
                />
              )}

              {/* ENHANCED DEADLOCK indicators */}
              {/* Mutual Block: Purple solid border with circular arrow icon */}
              {isMutualBlock && (
                <g pointerEvents="none">
                  <rect
                    x={pixel.x - cellSize / 2 + 1}
                    y={pixel.y - cellSize / 2 + 1}
                    width={cellSize - 2}
                    height={cellSize - 2}
                    fill="rgba(139, 92, 246, 0.15)"
                    stroke="rgba(139, 92, 246, 0.9)"
                    strokeWidth={3}
                    rx={6}
                  />
                  {/* Circular arrows icon in corner */}
                  <g transform={`translate(${pixel.x + cellSize / 2 - 10}, ${pixel.y - cellSize / 2 + 10})`}>
                    <circle cx={0} cy={0} r={7} fill="rgba(139, 92, 246, 0.95)" />
                    {/* Circular arrows symbol */}
                    <text x={0} y={1} textAnchor="middle" fontSize={9} fill="white" fontWeight="bold">↻</text>
                  </g>
                </g>
              )}

              {/* Blocker Block (not mutual): Orange solid border with chain icon */}
              {isBlocker && !isMutualBlock && !isStuck && (
                <g pointerEvents="none">
                  <rect
                    x={pixel.x - cellSize / 2 + 1}
                    y={pixel.y - cellSize / 2 + 1}
                    width={cellSize - 2}
                    height={cellSize - 2}
                    fill="rgba(245, 158, 11, 0.15)"
                    stroke="rgba(245, 158, 11, 0.9)"
                    strokeWidth={3}
                    rx={6}
                  />
                  {/* Chain link icon in corner */}
                  <g transform={`translate(${pixel.x + cellSize / 2 - 10}, ${pixel.y - cellSize / 2 + 10})`}>
                    <circle cx={0} cy={0} r={7} fill="rgba(245, 158, 11, 0.95)" />
                    <text x={0} y={1} textAnchor="middle" fontSize={9} fill="white" fontWeight="bold">⛓</text>
                  </g>
                </g>
              )}

              {/* Blocked Block (not mutual, not a blocker itself): Red dashed border with warning icon */}
              {isStuck && !isMutualBlock && (
                <g pointerEvents="none">
                  <rect
                    x={pixel.x - cellSize / 2 + 1}
                    y={pixel.y - cellSize / 2 + 1}
                    width={cellSize - 2}
                    height={cellSize - 2}
                    fill="rgba(239, 68, 68, 0.15)"
                    stroke="rgba(239, 68, 68, 0.9)"
                    strokeWidth={3}
                    strokeDasharray={isBlocker ? "none" : "6 3"}
                    rx={6}
                  />
                  {/* Warning icon in corner */}
                  <g transform={`translate(${pixel.x + cellSize / 2 - 10}, ${pixel.y - cellSize / 2 + 10})`}>
                    <circle cx={0} cy={0} r={7} fill={isBlocker ? "rgba(245, 158, 11, 0.95)" : "rgba(239, 68, 68, 0.95)"} />
                    <text x={0} y={1} textAnchor="middle" fontSize={11} fill="white" fontWeight="bold">{isBlocker ? "⛓" : "!"}</text>
                  </g>
                </g>
              )}
            </g>
          );
        })}
        </svg>
      </div>

      {/* Scroll hint for large grids */}
      {(rows > 10 || cols > 10) && (
        <p className="text-xs text-center text-muted-foreground mt-1">
          Scroll to navigate, Ctrl+scroll to zoom
        </p>
      )}
    </div>
  );
}

// ============================================================================
// Direction Arrow Component
// ============================================================================

interface DirectionArrowProps {
  direction: BlockDirection;
  size: number;
  color?: string;
}

function DirectionArrow({ direction, size, color = '#ffffff' }: DirectionArrowProps) {
  const arrowLength = size * 0.7;
  const arrowHeadSize = size * 0.35;
  const strokeWidth = 3;
  const outlineWidth = strokeWidth + 2;

  if (isBidirectional(direction)) {
    const angle = AXIS_ANGLES[direction as SquareAxis];
    const lineStart = -arrowLength * 0.35;
    const lineEnd = arrowLength * 0.35;

    return (
      <g transform={`rotate(${angle})`}>
        {/* Dark outline */}
        <line
          x1={lineStart}
          y1={0}
          x2={lineEnd}
          y2={0}
          stroke="rgba(0, 0, 0, 0.6)"
          strokeWidth={outlineWidth}
          strokeLinecap="round"
        />
        <polygon
          points={`${lineEnd - arrowHeadSize * 0.7},${-arrowHeadSize * 0.5} ${lineEnd + 3},0 ${lineEnd - arrowHeadSize * 0.7},${arrowHeadSize * 0.5}`}
          fill="rgba(0, 0, 0, 0.6)"
          stroke="rgba(0, 0, 0, 0.6)"
          strokeWidth={2}
          strokeLinejoin="round"
        />
        <polygon
          points={`${lineStart + arrowHeadSize * 0.7},${-arrowHeadSize * 0.5} ${lineStart - 3},0 ${lineStart + arrowHeadSize * 0.7},${arrowHeadSize * 0.5}`}
          fill="rgba(0, 0, 0, 0.6)"
          stroke="rgba(0, 0, 0, 0.6)"
          strokeWidth={2}
          strokeLinejoin="round"
        />

        {/* Main line and arrows */}
        <line
          x1={lineStart}
          y1={0}
          x2={lineEnd}
          y2={0}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        <polygon
          points={`${lineEnd - arrowHeadSize * 0.7},${-arrowHeadSize * 0.5} ${lineEnd + 3},0 ${lineEnd - arrowHeadSize * 0.7},${arrowHeadSize * 0.5}`}
          fill={color}
          stroke={color}
          strokeWidth={1}
          strokeLinejoin="round"
        />
        <polygon
          points={`${lineStart + arrowHeadSize * 0.7},${-arrowHeadSize * 0.5} ${lineStart - 3},0 ${lineStart + arrowHeadSize * 0.7},${arrowHeadSize * 0.5}`}
          fill={color}
          stroke={color}
          strokeWidth={1}
          strokeLinejoin="round"
        />
      </g>
    );
  }

  // Single direction arrow
  const angle = DIRECTION_ANGLES[direction as SquareDirection];
  const lineStart = -arrowLength * 0.3;
  const lineEnd = arrowLength * 0.35;

  return (
    <g transform={`rotate(${angle})`}>
      {/* Dark outline */}
      <line
        x1={lineStart}
        y1={0}
        x2={lineEnd}
        y2={0}
        stroke="rgba(0, 0, 0, 0.6)"
        strokeWidth={outlineWidth}
        strokeLinecap="round"
      />
      <polygon
        points={`${lineEnd - arrowHeadSize * 0.7},${-arrowHeadSize * 0.55} ${lineEnd + 3},0 ${lineEnd - arrowHeadSize * 0.7},${arrowHeadSize * 0.55}`}
        fill="rgba(0, 0, 0, 0.6)"
        stroke="rgba(0, 0, 0, 0.6)"
        strokeWidth={2}
        strokeLinejoin="round"
      />

      {/* Main line and arrow */}
      <line
        x1={lineStart}
        y1={0}
        x2={lineEnd}
        y2={0}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <polygon
        points={`${lineEnd - arrowHeadSize * 0.7},${-arrowHeadSize * 0.55} ${lineEnd + 3},0 ${lineEnd - arrowHeadSize * 0.7},${arrowHeadSize * 0.55}`}
        fill={color}
        stroke={color}
        strokeWidth={1}
        strokeLinejoin="round"
      />
    </g>
  );
}
