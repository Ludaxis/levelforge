'use client';

import { useMemo } from 'react';
import { SquareBlockState, SquareBlock, BlockDirection } from '@/types/squareBlock';
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
}

// ============================================================================
// Constants
// ============================================================================

const CELL_SIZE = 50;
const PADDING = 20;

// ============================================================================
// Component
// ============================================================================

export function SquareBlockBoard({
  state,
  onTapBlock,
  clearableBlocks,
  canClearBlock,
}: SquareBlockBoardProps) {
  const { level, blocks, holes, animatingBlock, animationPhase, animationData } = state;
  const { rows, cols } = level;

  // Calculate SVG dimensions
  const { viewBox, origin, width, height } = useMemo(() => {
    const bounds = getGridBounds(rows, cols, CELL_SIZE);
    const w = bounds.width + PADDING * 2;
    const h = bounds.height + PADDING * 2;

    return {
      viewBox: `0 0 ${w} ${h}`,
      origin: { x: PADDING, y: PADDING },
      width: w,
      height: h,
    };
  }, [rows, cols]);

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

  return (
    <div className="relative">
      <svg
        viewBox={viewBox}
        className="w-full max-w-md mx-auto"
        style={{ aspectRatio: `${width} / ${height}` }}
      >
        {/* Background */}
        <rect
          x={origin.x}
          y={origin.y}
          width={cols * CELL_SIZE}
          height={rows * CELL_SIZE}
          fill="rgba(0, 0, 0, 0.3)"
          rx={8}
        />

        {/* Grid cells */}
        {gridCoords.map((coord) => {
          const key = gridKey(coord);
          const pixel = gridToPixel(coord, CELL_SIZE, origin);
          const hasHole = holes.has(key);

          return (
            <g key={key}>
              {/* Cell background */}
              <rect
                x={pixel.x - CELL_SIZE / 2 + 2}
                y={pixel.y - CELL_SIZE / 2 + 2}
                width={CELL_SIZE - 4}
                height={CELL_SIZE - 4}
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
                    r={CELL_SIZE * 0.3}
                    fill="rgba(0, 0, 0, 0.9)"
                  />
                  <circle
                    cx={pixel.x}
                    cy={pixel.y}
                    r={CELL_SIZE * 0.35}
                    fill="none"
                    stroke="rgba(60, 40, 20, 0.8)"
                    strokeWidth={4}
                  />
                  <circle
                    cx={pixel.x}
                    cy={pixel.y}
                    r={CELL_SIZE * 0.18}
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
          const pixel = gridToPixel(block.coord, CELL_SIZE, origin);
          const isClearable = clearableBlocks.includes(key);
          const isAnimating = animatingBlock === block.id;

          // Calculate animation transform
          let animationStyle: React.CSSProperties = {};
          if (isAnimating && animationData) {
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
                x={pixel.x - CELL_SIZE / 2 + 4}
                y={pixel.y - CELL_SIZE / 2 + 4}
                width={CELL_SIZE - 8}
                height={CELL_SIZE - 8}
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
                  size={CELL_SIZE * 0.5}
                  color={isClearable ? '#ffffff' : 'rgba(255, 255, 255, 0.5)'}
                />
              </g>

              {/* Clearable indicator */}
              {isClearable && (
                <rect
                  x={pixel.x - CELL_SIZE / 2 + 2}
                  y={pixel.y - CELL_SIZE / 2 + 2}
                  width={CELL_SIZE - 4}
                  height={CELL_SIZE - 4}
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
