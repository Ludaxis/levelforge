'use client';

import { useMemo, useEffect, useState } from 'react';
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

// ============================================================================
// Types
// ============================================================================

interface SquareBlockBoardProps {
  state: SquareBlockState;
  onTapBlock: (coord: GridCoord) => void;
  clearableBlocks: string[];
  canClearBlock: (block: SquareBlock) => boolean;
  isBlockUnlocked: (block: SquareBlock) => boolean;
}

// ============================================================================
// Constants
// ============================================================================

const MAX_CANVAS_SIZE = 500; // Maximum canvas size for game board
const MIN_CELL_SIZE = 10;
const MAX_CELL_SIZE = 50;

// Calculate optimal cell size based on grid dimensions
function calculateCellSize(rows: number, cols: number): number {
  const maxDimension = Math.max(rows, cols);
  const calculatedSize = Math.floor(MAX_CANVAS_SIZE / maxDimension);
  return Math.max(MIN_CELL_SIZE, Math.min(MAX_CELL_SIZE, calculatedSize));
}

// ============================================================================
// Component
// ============================================================================

export function SquareBlockBoard({
  state,
  onTapBlock,
  clearableBlocks,
  canClearBlock,
  isBlockUnlocked,
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

  // Calculate dynamic cell size
  const cellSize = useMemo(() => calculateCellSize(rows, cols), [rows, cols]);
  const padding = useMemo(() => Math.max(10, Math.min(20, cellSize / 2)), [cellSize]);

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

      {/* CSS keyframes for shake animation */}
      <style jsx>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
          20%, 40%, 60%, 80% { transform: translateX(4px); }
        }
      `}</style>

      <svg
        viewBox={viewBox}
        className="w-full max-w-md mx-auto"
        style={{ aspectRatio: `${width} / ${height}` }}
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
                fill={block.color}
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
                  color={isLocked ? 'rgba(255, 255, 255, 0.3)' : isClearable ? '#ffffff' : 'rgba(255, 255, 255, 0.5)'}
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
            </g>
          );
        })}
      </svg>
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
