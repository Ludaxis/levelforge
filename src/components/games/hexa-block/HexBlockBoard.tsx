'use client';

import { useMemo } from 'react';
import {
  HexStack,
  AnimationData,
  StackDirection,
  HexAxis,
  Carousel,
  isBidirectional,
} from '@/types/hexaBlock';
import {
  AxialCoord,
  HexDirection,
  HEX_DIRECTIONS,
  hexKey,
  createHexagonalGrid,
  axialToPixel,
  getHexPolygonPoints,
  getGridBounds,
} from '@/lib/hexGrid';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

interface HexBlockBoardProps {
  gridRadius: number;
  stacks: Map<string, HexStack>;
  holes: Set<string>;
  pauses?: Set<string>;
  carousels?: Map<string, Carousel>;
  onStackTap: (coord: AxialCoord) => void;
  onCarouselTap?: (coord: AxialCoord) => void;
  clearableStacks: string[];
  animatingStack: string | null;
  animationPhase: 'idle' | 'rolling' | 'bouncing' | 'exiting';
  animationData: AnimationData | null;
  disabled?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const HEX_SIZE = 40;
const DIRECTION_ANGLES: Record<HexDirection, number> = {
  NE: -60,
  E: 0,
  SE: 60,
  SW: 120,
  W: 180,
  NW: -120,
};

const AXIS_ANGLES: Record<HexAxis, number> = {
  E_W: 0,
  NE_SW: -60,
  SE_NW: 60,
};

// ============================================================================
// Component
// ============================================================================

export function HexBlockBoard({
  gridRadius,
  stacks,
  holes,
  pauses,
  carousels,
  onStackTap,
  onCarouselTap,
  clearableStacks,
  animatingStack,
  animationPhase,
  animationData,
  disabled,
}: HexBlockBoardProps) {
  // Generate grid coordinates
  const gridCoords = useMemo(() => createHexagonalGrid(gridRadius), [gridRadius]);

  // Calculate bounds and dimensions
  const { viewBox, origin, width, height } = useMemo(() => {
    const bounds = getGridBounds(gridCoords, HEX_SIZE);
    const padding = 30;
    const w = bounds.width + padding * 2;
    const h = bounds.height + padding * 2;

    return {
      viewBox: `0 0 ${w} ${h}`,
      origin: { x: -bounds.minX + padding, y: -bounds.minY + padding },
      width: w,
      height: h,
    };
  }, [gridCoords]);

  return (
    <div className="relative">
      <svg
        viewBox={viewBox}
        className="w-full max-w-md mx-auto"
        style={{ aspectRatio: `${width} / ${height}` }}
      >
        {/* Background grid */}
        {gridCoords.map((coord) => {
          const key = hexKey(coord);
          const pixel = axialToPixel(coord, HEX_SIZE, origin);
          const points = getHexPolygonPoints(pixel, HEX_SIZE);
          const isHole = holes.has(key);
          const isPause = pauses?.has(key);
          const isCarousel = carousels?.has(key);

          let fillColor = 'rgba(255, 255, 255, 0.03)';
          let strokeColor = 'rgba(255, 255, 255, 0.1)';
          let strokeWidth = 1;

          if (isHole) {
            fillColor = 'rgba(0, 0, 0, 0.8)';
            strokeColor = 'rgba(139, 69, 19, 0.6)';
            strokeWidth = 2;
          } else if (isPause) {
            fillColor = 'rgba(59, 130, 246, 0.2)';
            strokeColor = 'rgba(59, 130, 246, 0.6)';
            strokeWidth = 2;
          } else if (isCarousel) {
            fillColor = 'rgba(168, 85, 247, 0.15)';
            strokeColor = 'rgba(168, 85, 247, 0.6)';
            strokeWidth = 2;
          }

          return (
            <polygon
              key={`bg-${key}`}
              points={points}
              fill={fillColor}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
            />
          );
        })}

        {/* Holes - render pit effect */}
        {gridCoords
          .filter((coord) => holes.has(hexKey(coord)))
          .map((coord) => {
            const key = hexKey(coord);
            const pixel = axialToPixel(coord, HEX_SIZE, origin);

            return (
              <g key={`hole-${key}`}>
                {/* Inner dark circle */}
                <circle
                  cx={pixel.x}
                  cy={pixel.y}
                  r={HEX_SIZE * 0.5}
                  fill="rgba(0, 0, 0, 0.9)"
                />
                {/* Gradient ring for depth effect */}
                <circle
                  cx={pixel.x}
                  cy={pixel.y}
                  r={HEX_SIZE * 0.65}
                  fill="none"
                  stroke="rgba(60, 40, 20, 0.8)"
                  strokeWidth={6}
                />
                {/* Inner highlight */}
                <circle
                  cx={pixel.x}
                  cy={pixel.y}
                  r={HEX_SIZE * 0.3}
                  fill="rgba(20, 10, 5, 1)"
                />
              </g>
            );
          })}

        {/* Pauses - render pause icon */}
        {pauses && gridCoords
          .filter((coord) => pauses.has(hexKey(coord)))
          .map((coord) => {
            const key = hexKey(coord);
            const pixel = axialToPixel(coord, HEX_SIZE, origin);

            return (
              <g key={`pause-${key}`} pointerEvents="none">
                {/* Left bar */}
                <rect
                  x={pixel.x - 8}
                  y={pixel.y - 12}
                  width={6}
                  height={24}
                  rx={2}
                  fill="rgba(59, 130, 246, 0.8)"
                />
                {/* Right bar */}
                <rect
                  x={pixel.x + 2}
                  y={pixel.y - 12}
                  width={6}
                  height={24}
                  rx={2}
                  fill="rgba(59, 130, 246, 0.8)"
                />
              </g>
            );
          })}

        {/* Carousels - render rotator */}
        {carousels && Array.from(carousels.entries()).map(([key, carousel]) => {
          const pixel = axialToPixel(carousel.coord, HEX_SIZE, origin);

          return (
            <g
              key={`carousel-${key}`}
              onClick={() => !disabled && onCarouselTap?.(carousel.coord)}
              style={{ cursor: disabled ? 'default' : 'pointer' }}
            >
              {/* Center circle */}
              <circle
                cx={pixel.x}
                cy={pixel.y}
                r={HEX_SIZE * 0.3}
                fill="rgba(168, 85, 247, 0.8)"
                stroke="rgba(168, 85, 247, 1)"
                strokeWidth={2}
              />
              {/* Arm lines */}
              {carousel.arms.map((dir) => {
                const armLength = HEX_SIZE * 0.6;
                const angle = DIRECTION_ANGLES[dir];
                const radians = (angle * Math.PI) / 180;
                const endX = pixel.x + Math.cos(radians) * armLength;
                const endY = pixel.y + Math.sin(radians) * armLength;
                return (
                  <g key={dir}>
                    <line
                      x1={pixel.x}
                      y1={pixel.y}
                      x2={endX}
                      y2={endY}
                      stroke="rgba(168, 85, 247, 0.9)"
                      strokeWidth={4}
                      strokeLinecap="round"
                    />
                    <circle
                      cx={endX}
                      cy={endY}
                      r={5}
                      fill="rgba(168, 85, 247, 1)"
                    />
                  </g>
                );
              })}
              {/* Clockwise arrow indicator */}
              <path
                d={`M ${pixel.x - 6} ${pixel.y - 3} A 6 6 0 1 1 ${pixel.x + 6} ${pixel.y - 3}`}
                fill="none"
                stroke="white"
                strokeWidth={2}
                strokeLinecap="round"
              />
              <path
                d={`M ${pixel.x + 4} ${pixel.y - 6} L ${pixel.x + 6} ${pixel.y - 3} L ${pixel.x + 3} ${pixel.y}`}
                fill="none"
                stroke="white"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          );
        })}

        {/* Stacks */}
        {Array.from(stacks.entries()).map(([key, stack]) => {
          const pixel = axialToPixel(stack.coord, HEX_SIZE, origin);
          const isClearable = clearableStacks.includes(key);
          const isAnimating = animatingStack === stack.id;

          // Calculate animation transform
          let animationStyle: React.CSSProperties = {};
          if (isAnimating && animationData) {
            if (animationPhase === 'rolling' && animationData.exitOffset) {
              // Animate to exit position
              animationStyle = {
                transform: `translate(${animationData.exitOffset.x}px, ${animationData.exitOffset.y}px)`,
                opacity: 0,
                transition: 'transform 0.6s ease-in, opacity 0.6s ease-in',
              };
            } else if (animationPhase === 'bouncing' && animationData.bounceOffset) {
              // Bounce animation handled via CSS keyframes with custom property
              animationStyle = {
                '--bounce-x': `${animationData.bounceOffset.x}px`,
                '--bounce-y': `${animationData.bounceOffset.y}px`,
              } as React.CSSProperties;
            }
          }

          return (
            <g
              key={key}
              onClick={() => !disabled && !isAnimating && onStackTap(stack.coord)}
              style={{
                cursor: disabled || isAnimating ? 'default' : 'pointer',
                ...animationStyle,
              }}
              className={cn(
                isAnimating && animationPhase === 'bouncing' && 'animate-hex-bounce'
              )}
            >
              {/* Single hex cell */}
              <polygon
                points={getHexPolygonPoints(pixel, HEX_SIZE * 0.9)}
                fill={stack.color}
                stroke="rgba(0, 0, 0, 0.3)"
                strokeWidth={1.5}
                className="transition-all duration-150"
              />

              {/* Direction arrow */}
              <g transform={`translate(${pixel.x}, ${pixel.y})`}>
                <DirectionArrow
                  direction={stack.direction}
                  size={HEX_SIZE * 0.7}
                  color={isClearable ? '#ffffff' : 'rgba(255, 255, 255, 0.5)'}
                />
              </g>

              {/* Clearable indicator */}
              {isClearable && !disabled && (
                <circle
                  cx={pixel.x}
                  cy={pixel.y}
                  r={HEX_SIZE * 0.95}
                  fill="none"
                  stroke="rgba(34, 197, 94, 0.6)"
                  strokeWidth={2}
                  strokeDasharray="5 3"
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
// Sub-components
// ============================================================================

interface DirectionArrowProps {
  direction: StackDirection;
  size: number;
  color: string;
}

function DirectionArrow({ direction, size, color }: DirectionArrowProps) {
  // Increased sizes for better visibility
  const arrowLength = size * 0.7;
  const arrowHeadSize = size * 0.35;
  const strokeWidth = 3;
  const outlineWidth = strokeWidth + 2;

  if (isBidirectional(direction)) {
    // Bidirectional arrow (double-headed)
    const angle = AXIS_ANGLES[direction];
    const lineStart = -arrowLength * 0.35;
    const lineEnd = arrowLength * 0.35;

    return (
      <g transform={`rotate(${angle})`}>
        {/* Dark outline for contrast */}
        <line
          x1={lineStart}
          y1={0}
          x2={lineEnd}
          y2={0}
          stroke="rgba(0, 0, 0, 0.6)"
          strokeWidth={outlineWidth}
          strokeLinecap="round"
        />
        {/* Right arrowhead outline */}
        <polygon
          points={`${lineEnd - arrowHeadSize * 0.7},${-arrowHeadSize * 0.5} ${lineEnd + 3},0 ${lineEnd - arrowHeadSize * 0.7},${arrowHeadSize * 0.5}`}
          fill="rgba(0, 0, 0, 0.6)"
          stroke="rgba(0, 0, 0, 0.6)"
          strokeWidth={2}
          strokeLinejoin="round"
        />
        {/* Left arrowhead outline */}
        <polygon
          points={`${lineStart + arrowHeadSize * 0.7},${-arrowHeadSize * 0.5} ${lineStart - 3},0 ${lineStart + arrowHeadSize * 0.7},${arrowHeadSize * 0.5}`}
          fill="rgba(0, 0, 0, 0.6)"
          stroke="rgba(0, 0, 0, 0.6)"
          strokeWidth={2}
          strokeLinejoin="round"
        />

        {/* Main line */}
        <line
          x1={lineStart}
          y1={0}
          x2={lineEnd}
          y2={0}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {/* Right arrowhead - filled */}
        <polygon
          points={`${lineEnd - arrowHeadSize * 0.7},${-arrowHeadSize * 0.5} ${lineEnd + 3},0 ${lineEnd - arrowHeadSize * 0.7},${arrowHeadSize * 0.5}`}
          fill={color}
          stroke={color}
          strokeWidth={1}
          strokeLinejoin="round"
        />
        {/* Left arrowhead - filled */}
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
  const angle = DIRECTION_ANGLES[direction as HexDirection];
  const lineStart = -arrowLength * 0.3;
  const lineEnd = arrowLength * 0.35;

  return (
    <g transform={`rotate(${angle})`}>
      {/* Dark outline for contrast */}
      <line
        x1={lineStart}
        y1={0}
        x2={lineEnd}
        y2={0}
        stroke="rgba(0, 0, 0, 0.6)"
        strokeWidth={outlineWidth}
        strokeLinecap="round"
      />
      {/* Arrowhead outline */}
      <polygon
        points={`${lineEnd - arrowHeadSize * 0.7},${-arrowHeadSize * 0.55} ${lineEnd + 3},0 ${lineEnd - arrowHeadSize * 0.7},${arrowHeadSize * 0.55}`}
        fill="rgba(0, 0, 0, 0.6)"
        stroke="rgba(0, 0, 0, 0.6)"
        strokeWidth={2}
        strokeLinejoin="round"
      />

      {/* Main line */}
      <line
        x1={lineStart}
        y1={0}
        x2={lineEnd}
        y2={0}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      {/* Arrowhead - filled */}
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

