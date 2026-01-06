'use client';

import { useMemo, useCallback, useState, useEffect } from 'react';
import {
  AxialCoord,
  hexKey,
  axialToPixel,
  pixelToAxial,
  getHexPolygonPoints,
  getGridBounds,
} from '@/lib/hexGrid';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

export interface HexGridProps<T> {
  /** Map of hex data keyed by "q,r" */
  hexes: Map<string, T>;
  /** Hex size in pixels (circumradius - center to vertex) */
  size: number;
  /** Render function for each hex */
  renderHex: (coord: AxialCoord, data: T, isHovered: boolean) => React.ReactNode;
  /** Click handler for a hex */
  onHexClick?: (coord: AxialCoord, data: T) => void;
  /** Hover handler */
  onHexHover?: (coord: AxialCoord | null) => void;
  /** Additional class names */
  className?: string;
  /** Padding around the grid in pixels */
  padding?: number;
  /** Whether to show hex outlines */
  showOutlines?: boolean;
  /** Outline color */
  outlineColor?: string;
  /** Outline width */
  outlineWidth?: number;
  /** Background color for empty hexes (if rendering empty grid) */
  emptyHexColor?: string;
  /** All grid coordinates (for rendering empty cells) */
  gridCoords?: AxialCoord[];
}

// ============================================================================
// Component
// ============================================================================

export function HexGrid<T>({
  hexes,
  size,
  renderHex,
  onHexClick,
  onHexHover,
  className,
  padding = 20,
  showOutlines = true,
  outlineColor = 'rgba(255, 255, 255, 0.1)',
  outlineWidth = 1,
  emptyHexColor = 'rgba(255, 255, 255, 0.05)',
  gridCoords,
}: HexGridProps<T>) {
  const [hoveredHex, setHoveredHex] = useState<string | null>(null);

  // Calculate all hex coords to render (either from data or provided grid)
  const allCoords = useMemo(() => {
    if (gridCoords) return gridCoords;
    return Array.from(hexes.keys()).map((key) => {
      const [q, r] = key.split(',').map(Number);
      return { q, r };
    });
  }, [hexes, gridCoords]);

  // Calculate grid bounds and SVG dimensions
  const { bounds, viewBox, origin } = useMemo(() => {
    if (allCoords.length === 0) {
      return {
        bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100, width: 100, height: 100 },
        viewBox: '0 0 100 100',
        origin: { x: 50, y: 50 },
      };
    }

    const b = getGridBounds(allCoords, size);
    const width = b.width + padding * 2;
    const height = b.height + padding * 2;

    return {
      bounds: b,
      viewBox: `0 0 ${width} ${height}`,
      origin: {
        x: -b.minX + padding,
        y: -b.minY + padding,
      },
    };
  }, [allCoords, size, padding]);

  // Handle mouse move for hover detection
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const svg = e.currentTarget;
      const rect = svg.getBoundingClientRect();
      const viewBoxParts = viewBox.split(' ').map(Number);
      const scaleX = viewBoxParts[2] / rect.width;
      const scaleY = viewBoxParts[3] / rect.height;

      const pixel = {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      };

      const hex = pixelToAxial(pixel, size, origin);
      const key = hexKey(hex);

      // Check if this hex exists in our grid
      const exists = gridCoords
        ? gridCoords.some((c) => c.q === hex.q && c.r === hex.r)
        : hexes.has(key);

      if (exists) {
        if (hoveredHex !== key) {
          setHoveredHex(key);
          onHexHover?.(hex);
        }
      } else {
        if (hoveredHex !== null) {
          setHoveredHex(null);
          onHexHover?.(null);
        }
      }
    },
    [hexes, gridCoords, size, origin, viewBox, hoveredHex, onHexHover]
  );

  const handleMouseLeave = useCallback(() => {
    setHoveredHex(null);
    onHexHover?.(null);
  }, [onHexHover]);

  const handleClick = useCallback(
    (coord: AxialCoord) => {
      const key = hexKey(coord);
      const data = hexes.get(key);
      if (data !== undefined && onHexClick) {
        onHexClick(coord, data);
      }
    },
    [hexes, onHexClick]
  );

  return (
    <svg
      viewBox={viewBox}
      className={cn('w-full h-full', className)}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* Render empty grid cells first (background) */}
      {gridCoords?.map((coord) => {
        const key = hexKey(coord);
        const hasData = hexes.has(key);
        if (hasData) return null;

        const pixel = axialToPixel(coord, size, origin);
        const points = getHexPolygonPoints(pixel, size);

        return (
          <polygon
            key={`empty-${key}`}
            points={points}
            fill={emptyHexColor}
            stroke={showOutlines ? outlineColor : 'none'}
            strokeWidth={outlineWidth}
          />
        );
      })}

      {/* Render hexes with data */}
      {Array.from(hexes.entries()).map(([key, data]) => {
        const [q, r] = key.split(',').map(Number);
        const coord = { q, r };
        const pixel = axialToPixel(coord, size, origin);
        const points = getHexPolygonPoints(pixel, size);
        const isHovered = hoveredHex === key;

        return (
          <g
            key={key}
            onClick={() => handleClick(coord)}
            style={{ cursor: onHexClick ? 'pointer' : 'default' }}
          >
            {/* Hex outline */}
            {showOutlines && (
              <polygon
                points={points}
                fill="transparent"
                stroke={outlineColor}
                strokeWidth={outlineWidth}
              />
            )}

            {/* Custom hex content */}
            <g transform={`translate(${pixel.x}, ${pixel.y})`}>
              {renderHex(coord, data, isHovered)}
            </g>
          </g>
        );
      })}
    </svg>
  );
}

// ============================================================================
// Hex Cell Component (convenience wrapper)
// ============================================================================

export interface HexCellProps {
  size: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  className?: string;
  children?: React.ReactNode;
}

export function HexCell({
  size,
  fill = 'transparent',
  stroke = 'rgba(255, 255, 255, 0.2)',
  strokeWidth = 1,
  className,
  children,
}: HexCellProps) {
  const points = getHexPolygonPoints({ x: 0, y: 0 }, size);

  return (
    <g className={className}>
      <polygon points={points} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      {children}
    </g>
  );
}

// ============================================================================
// Direction Arrow Component
// ============================================================================

export interface DirectionArrowProps {
  direction: 'NE' | 'E' | 'SE' | 'SW' | 'W' | 'NW';
  size: number;
  color?: string;
  strokeWidth?: number;
}

const DIRECTION_ANGLES: Record<string, number> = {
  NE: -60,
  E: 0,
  SE: 60,
  SW: 120,
  W: 180,
  NW: -120,
};

export function DirectionArrow({
  direction,
  size,
  color = 'white',
  strokeWidth = 2,
}: DirectionArrowProps) {
  const angle = DIRECTION_ANGLES[direction];
  const arrowLength = size * 0.5;
  const arrowHeadSize = size * 0.2;

  return (
    <g transform={`rotate(${angle})`}>
      {/* Arrow line */}
      <line
        x1={-arrowLength * 0.3}
        y1={0}
        x2={arrowLength * 0.5}
        y2={0}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      {/* Arrow head */}
      <path
        d={`M ${arrowLength * 0.5 - arrowHeadSize} ${-arrowHeadSize * 0.6}
            L ${arrowLength * 0.5} 0
            L ${arrowLength * 0.5 - arrowHeadSize} ${arrowHeadSize * 0.6}`}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );
}
