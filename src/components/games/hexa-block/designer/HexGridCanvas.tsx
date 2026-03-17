'use client';

import { Card, CardContent } from '@/components/ui/card';
import {
  HEX_DIRECTIONS,
  DIRECTION_ANGLES,
  hexKey,
  axialToPixel,
  getHexPolygonPoints,
  getBlocksAheadColor,
} from '@/lib/hexGrid';
import { DirectionArrow } from './DirectionArrow';
import { HEX_SIZE, HexGridCanvasProps } from './types';

export function HexGridCanvas({
  viewBox,
  width,
  height,
  origin,
  gridCoords,
  stacks,
  holes,
  pauses,
  carousels,
  hoveredHex,
  editMode,
  placementMode,
  selectedDirection,
  selectedColor,
  selectedCarouselArms,
  showBlocksAhead,
  blocksAheadMap,
  onHexClick,
  onHexHover,
}: HexGridCanvasProps) {
  return (
    <Card className="flex-shrink-0">
      <CardContent className="p-4 flex justify-center">
        <svg
          viewBox={viewBox}
          className="w-full max-w-md"
          style={{ aspectRatio: `${width} / ${height}` }}
        >
          {/* Grid hexes */}
          {gridCoords.map((coord) => {
            const key = hexKey(coord);
            const pixel = axialToPixel(coord, HEX_SIZE, origin);
            const points = getHexPolygonPoints(pixel, HEX_SIZE);
            const hasStack = stacks.has(key);
            const hasHole = holes.has(key);
            const hasPause = pauses.has(key);
            const hasCarousel = carousels.has(key);
            const carousel = carousels.get(key);
            const isHovered = hoveredHex === key;

            // Determine fill color
            let fillColor = 'rgba(255, 255, 255, 0.03)';
            if (hasHole) {
              fillColor = 'rgba(0, 0, 0, 0.8)';
            } else if (hasPause) {
              fillColor = 'rgba(59, 130, 246, 0.2)'; // Blue tint for pause cells
            } else if (hasCarousel) {
              fillColor = 'rgba(168, 85, 247, 0.15)'; // Purple tint for carousels
            } else if (hasStack) {
              fillColor = 'transparent';
            } else if (isHovered) {
              fillColor = placementMode === 'hole' ? 'rgba(0, 0, 0, 0.4)' :
                          placementMode === 'pause' ? 'rgba(59, 130, 246, 0.3)' :
                          placementMode === 'carousel' ? 'rgba(168, 85, 247, 0.3)' :
                          'rgba(255, 255, 255, 0.1)';
            }

            return (
              <g key={key}>
                <polygon
                  points={points}
                  fill={fillColor}
                  stroke={hasHole ? 'rgba(139, 69, 19, 0.6)' :
                          hasPause ? 'rgba(59, 130, 246, 0.6)' :
                          hasCarousel ? 'rgba(168, 85, 247, 0.6)' :
                          'rgba(255, 255, 255, 0.15)'}
                  strokeWidth={hasHole || hasPause || hasCarousel ? 2 : 1}
                  onClick={() => onHexClick(coord)}
                  onMouseEnter={() => onHexHover(key)}
                  onMouseLeave={() => onHexHover(null)}
                  style={{ cursor: 'pointer' }}
                />

                {/* Hole visual effect */}
                {hasHole && (
                  <g pointerEvents="none">
                    <circle
                      cx={pixel.x}
                      cy={pixel.y}
                      r={HEX_SIZE * 0.5}
                      fill="rgba(0, 0, 0, 0.9)"
                    />
                    <circle
                      cx={pixel.x}
                      cy={pixel.y}
                      r={HEX_SIZE * 0.65}
                      fill="none"
                      stroke="rgba(60, 40, 20, 0.8)"
                      strokeWidth={5}
                    />
                    <circle
                      cx={pixel.x}
                      cy={pixel.y}
                      r={HEX_SIZE * 0.3}
                      fill="rgba(20, 10, 5, 1)"
                    />
                  </g>
                )}

                {/* Pause cell visual effect - pause icon (||) */}
                {hasPause && (
                  <g pointerEvents="none">
                    {/* Left bar */}
                    <rect
                      x={pixel.x - 8}
                      y={pixel.y - 10}
                      width={5}
                      height={20}
                      rx={2}
                      fill="rgba(59, 130, 246, 0.8)"
                    />
                    {/* Right bar */}
                    <rect
                      x={pixel.x + 3}
                      y={pixel.y - 10}
                      width={5}
                      height={20}
                      rx={2}
                      fill="rgba(59, 130, 246, 0.8)"
                    />
                  </g>
                )}

                {/* Carousel/Rotator visual effect */}
                {hasCarousel && carousel && (
                  <g pointerEvents="none">
                    {/* Center circle */}
                    <circle
                      cx={pixel.x}
                      cy={pixel.y}
                      r={HEX_SIZE * 0.25}
                      fill="rgba(168, 85, 247, 0.8)"
                      stroke="rgba(168, 85, 247, 1)"
                      strokeWidth={2}
                    />
                    {/* Arm lines pointing to adjacent cells */}
                    {carousel.arms.map((dir) => {
                      const armLength = HEX_SIZE * 0.55;
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
                            strokeWidth={3}
                            strokeLinecap="round"
                          />
                          {/* Small circle at arm end */}
                          <circle
                            cx={endX}
                            cy={endY}
                            r={4}
                            fill="rgba(168, 85, 247, 1)"
                          />
                        </g>
                      );
                    })}
                    {/* Clockwise arrow indicator */}
                    <path
                      d={`M ${pixel.x - 5} ${pixel.y - 2} A 5 5 0 1 1 ${pixel.x + 5} ${pixel.y - 2}`}
                      fill="none"
                      stroke="white"
                      strokeWidth={1.5}
                      strokeLinecap="round"
                    />
                    <path
                      d={`M ${pixel.x + 3} ${pixel.y - 5} L ${pixel.x + 5} ${pixel.y - 2} L ${pixel.x + 2} ${pixel.y}`}
                      fill="none"
                      stroke="white"
                      strokeWidth={1.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </g>
                )}

                {/* Preview stack on hover (when no stack/hole/pause/carousel exists, in stack place mode) */}
                {isHovered && !hasStack && !hasHole && !hasPause && !hasCarousel && editMode === 'place' && placementMode === 'stack' && (
                  <g opacity={0.5} pointerEvents="none">
                    <polygon
                      points={getHexPolygonPoints(pixel, HEX_SIZE * 0.85)}
                      fill={selectedColor}
                      stroke="rgba(0, 0, 0, 0.3)"
                      strokeWidth={1}
                    />
                    <DirectionArrow
                      cx={pixel.x}
                      cy={pixel.y}
                      direction={selectedDirection}
                      size={HEX_SIZE * 0.6}
                    />
                  </g>
                )}

                {/* Preview pause on hover (when empty, in pause place mode) */}
                {isHovered && !hasStack && !hasHole && !hasPause && !hasCarousel && editMode === 'place' && placementMode === 'pause' && (
                  <g opacity={0.5} pointerEvents="none">
                    <rect
                      x={pixel.x - 8}
                      y={pixel.y - 10}
                      width={5}
                      height={20}
                      rx={2}
                      fill="rgba(59, 130, 246, 0.8)"
                    />
                    <rect
                      x={pixel.x + 3}
                      y={pixel.y - 10}
                      width={5}
                      height={20}
                      rx={2}
                      fill="rgba(59, 130, 246, 0.8)"
                    />
                  </g>
                )}

                {/* Preview carousel on hover (when empty, in carousel place mode) */}
                {isHovered && !hasStack && !hasHole && !hasPause && !hasCarousel && editMode === 'place' && placementMode === 'carousel' && selectedCarouselArms.size >= 2 && (
                  <g opacity={0.5} pointerEvents="none">
                    {/* Center circle */}
                    <circle
                      cx={pixel.x}
                      cy={pixel.y}
                      r={HEX_SIZE * 0.25}
                      fill="rgba(168, 85, 247, 0.8)"
                      stroke="rgba(168, 85, 247, 1)"
                      strokeWidth={2}
                    />
                    {/* Arm lines */}
                    {Array.from(selectedCarouselArms).map((dir) => {
                      const armLength = HEX_SIZE * 0.55;
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
                            strokeWidth={3}
                            strokeLinecap="round"
                          />
                          <circle
                            cx={endX}
                            cy={endY}
                            r={4}
                            fill="rgba(168, 85, 247, 1)"
                          />
                        </g>
                      );
                    })}
                  </g>
                )}
              </g>
            );
          })}

          {/* Render stacks */}
          {Array.from(stacks.values()).map((stack) => {
            const key = hexKey(stack.coord);
            const pixel = axialToPixel(stack.coord, HEX_SIZE, origin);
            const isHovered = hoveredHex === key;
            const blocksAhead = showBlocksAhead ? (blocksAheadMap.get(key) ?? 0) : null;

            return (
              <g
                key={stack.id}
                onClick={() => onHexClick(stack.coord)}
                onMouseEnter={() => onHexHover(key)}
                onMouseLeave={() => onHexHover(null)}
                style={{ cursor: 'pointer' }}
              >
                <polygon
                  points={getHexPolygonPoints(pixel, HEX_SIZE * 0.85)}
                  fill={stack.color}
                  stroke={isHovered ? 'white' : 'rgba(0, 0, 0, 0.3)'}
                  strokeWidth={isHovered ? 2 : 1}
                />

                <DirectionArrow
                  cx={pixel.x}
                  cy={pixel.y}
                  direction={stack.direction}
                  size={HEX_SIZE * 0.6}
                />

                {/* Blocks ahead indicator */}
                {blocksAhead !== null && (
                  <>
                    <circle
                      cx={pixel.x}
                      cy={pixel.y + HEX_SIZE * 0.35}
                      r={8}
                      fill={getBlocksAheadColor(blocksAhead)}
                      stroke="rgba(0, 0, 0, 0.5)"
                      strokeWidth={1}
                    />
                    <text
                      x={pixel.x}
                      y={pixel.y + HEX_SIZE * 0.35}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={9}
                      fontWeight="bold"
                      fill="black"
                      pointerEvents="none"
                    >
                      {blocksAhead}
                    </text>
                  </>
                )}

                {/* "Click to rotate" hint */}
                {isHovered && editMode === 'direction' && (
                  <text
                    x={pixel.x}
                    y={pixel.y + HEX_SIZE * 0.5}
                    textAnchor="middle"
                    fontSize={10}
                    fill="#fbbf24"
                    pointerEvents="none"
                  >
                    Click to rotate
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </CardContent>
    </Card>
  );
}
