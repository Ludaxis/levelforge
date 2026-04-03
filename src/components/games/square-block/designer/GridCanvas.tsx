'use client';

import { SquareBlock } from '@/types/squareBlock';
import { gridKey, gridToPixel, getBlocksAheadColor } from '@/lib/squareGrid';
import { toGrayscale } from '@/lib/utils';
import { DirectionArrow } from './DirectionArrow';
import { DEFAULT_BLOCK_COLOR } from './types';
import type { GridCanvasProps } from './types';

export function GridCanvas({
  rows,
  cols,
  cellSize,
  gridCoords,
  blocks,
  holes,
  hoveredCell,
  setHoveredCell,
  handleCellClick,
  clearableKeys,
  deadlockInfo,
  selectedDirection,
  selectedLocked,
  selectedIceCount,
  selectedMirror,
  showBlocksAhead,
  blocksAheadMap,
  viewBox,
  origin,
  width,
  height,
  zoom,
  isPanning,
  svgContainerRef,
  handleWheel,
  handlePanStart,
  handlePanMove,
  handlePanEnd,
}: GridCanvasProps) {
  return (
    <>
      {/* Grid SVG - Scrollable container, centered */}
      <div
        ref={svgContainerRef}
        className="overflow-auto border border-muted rounded-lg bg-muted/20 flex justify-center"
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
            rx={4}
          />

          {/* Grid cells */}
          {gridCoords.map((coord) => {
            const key = gridKey(coord);
            const pixel = gridToPixel(coord, cellSize, origin);
            const hasBlock = blocks.has(key);
            const hasHole = holes.has(key);
            const isHovered = hoveredCell === key;

            let fillColor = 'rgba(255, 255, 255, 0.03)';
            if (hasHole) {
              fillColor = 'rgba(0, 0, 0, 0.8)';
            } else if (hasBlock) {
              fillColor = 'transparent';
            } else if (isHovered) {
              fillColor = 'rgba(255, 255, 255, 0.1)';
            }

            return (
              <g key={key}>
                <rect
                  x={pixel.x - cellSize / 2 + 2}
                  y={pixel.y - cellSize / 2 + 2}
                  width={cellSize - 4}
                  height={cellSize - 4}
                  fill={fillColor}
                  stroke={hasHole ? 'rgba(139, 69, 19, 0.6)' : 'rgba(255, 255, 255, 0.15)'}
                  strokeWidth={hasHole ? 2 : 1}
                  rx={4}
                  onClick={() => handleCellClick(coord)}
                  onMouseEnter={() => setHoveredCell(key)}
                  onMouseLeave={() => setHoveredCell(null)}
                  style={{ cursor: 'pointer' }}
                />

                {/* Hole visual */}
                {hasHole && (
                  <g pointerEvents="none">
                    <circle cx={pixel.x} cy={pixel.y} r={cellSize * 0.3} fill="rgba(0, 0, 0, 0.9)" />
                    <circle cx={pixel.x} cy={pixel.y} r={cellSize * 0.35} fill="none" stroke="rgba(60, 40, 20, 0.8)" strokeWidth={3} />
                  </g>
                )}

                {/* Preview block */}
                {isHovered && !hasBlock && !hasHole && (
                  <g opacity={0.5} pointerEvents="none">
                    <rect
                      x={pixel.x - cellSize / 2 + 4}
                      y={pixel.y - cellSize / 2 + 4}
                      width={cellSize - 8}
                      height={cellSize - 8}
                      fill={DEFAULT_BLOCK_COLOR}
                      rx={4}
                    />
                    <DirectionArrow cx={pixel.x} cy={pixel.y} direction={selectedDirection} size={cellSize * 0.5} />
                    {/* Lock icon preview */}
                    {selectedLocked && (
                      <g transform={`translate(${pixel.x}, ${pixel.y})`}>
                        <rect x={-6} y={-1} width={12} height={9} fill="rgba(0,0,0,0.7)" stroke="#fbbf24" strokeWidth={1} rx={1} />
                        <path d="M -4 -1 L -4 -4 A 4 4 0 0 1 4 -4 L 4 -1" fill="none" stroke="#fbbf24" strokeWidth={1.5} />
                      </g>
                    )}
                    {/* Ice preview */}
                    {selectedIceCount > 0 && (
                      <g>
                        <rect
                          x={pixel.x - cellSize / 2 + 4}
                          y={pixel.y - cellSize / 2 + 4}
                          width={cellSize - 8}
                          height={cellSize - 8}
                          fill="rgba(135, 206, 250, 0.4)"
                          stroke="rgba(173, 216, 230, 0.8)"
                          strokeWidth={2}
                          rx={4}
                        />
                        <text
                          x={pixel.x}
                          y={pixel.y + 4}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fill="#ffffff"
                          fontSize={cellSize * 0.35}
                          fontWeight="bold"
                        >
                          {selectedIceCount}
                        </text>
                      </g>
                    )}
                    {/* Mirror preview */}
                    {selectedMirror && (
                      <g>
                        <rect
                          x={pixel.x - cellSize / 2 + 2}
                          y={pixel.y - cellSize / 2 + 2}
                          width={cellSize - 4}
                          height={cellSize - 4}
                          fill="none"
                          stroke="rgba(168, 85, 247, 0.8)"
                          strokeWidth={2}
                          strokeDasharray="4 2"
                          rx={4}
                        />
                      </g>
                    )}
                  </g>
                )}

              </g>
            );
          })}

          {/* Placed blocks */}
          {Array.from(blocks.values()).map((block) => {
            const key = gridKey(block.coord);
            const pixel = gridToPixel(block.coord, cellSize, origin);
            const canClear = clearableKeys.has(key);
            const isBlockHovered = hoveredCell === key;

            // Deadlock state
            const hasDeadlock = deadlockInfo.hasDeadlock;
            const stuckReason = deadlockInfo.stuckBlocks.get(key);
            const isBlocker = deadlockInfo.blockerBlocks.has(key);
            const isStuck = !!stuckReason;
            const isMutualBlock = stuckReason?.type === 'mutual_block';
            const isCircularChain = stuckReason?.type === 'circular_chain';
            const isEdgeBlocked = stuckReason?.type === 'edge_blocked';
            const chainLength = stuckReason?.blockingChain?.length ?? 0;
            const rootCause = stuckReason?.rootCause;
            const isRootCause = stuckReason?.rootBlockKey === key;

            // Apply grayscale when in deadlock state
            const blockColor = hasDeadlock ? toGrayscale(block.color) : block.color;

            return (
              <g
                key={key}
                onClick={() => handleCellClick(block.coord)}
                onMouseEnter={() => setHoveredCell(key)}
                onMouseLeave={() => setHoveredCell(null)}
                style={{ cursor: 'pointer' }}
              >
                <rect
                  x={pixel.x - cellSize / 2 + 4}
                  y={pixel.y - cellSize / 2 + 4}
                  width={cellSize - 8}
                  height={cellSize - 8}
                  fill={blockColor}
                  stroke={isBlockHovered ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.3)'}
                  strokeWidth={isBlockHovered ? 2 : 1.5}
                  rx={4}
                />
                <DirectionArrow
                  cx={pixel.x}
                  cy={pixel.y}
                  direction={block.direction}
                  size={cellSize * 0.5}
                  color={block.locked || block.iceCount ? 'rgba(255, 255, 255, 0.3)' : canClear ? '#ffffff' : 'rgba(255, 255, 255, 0.5)'}
                />
                {/* Lock icon for gate blocks */}
                {block.locked && (
                  <g transform={`translate(${pixel.x}, ${pixel.y})`}>
                    <rect x={-6} y={-1} width={12} height={9} fill="rgba(0,0,0,0.7)" stroke="#fbbf24" strokeWidth={1} rx={1} />
                    <path d="M -4 -1 L -4 -4 A 4 4 0 0 1 4 -4 L 4 -1" fill="none" stroke="#fbbf24" strokeWidth={1.5} />
                    <circle cx={0} cy={3} r={1.5} fill="#fbbf24" />
                  </g>
                )}
                {/* Ice overlay for iced blocks */}
                {block.iceCount && block.iceCount > 0 && (
                  <g pointerEvents="none">
                    <rect
                      x={pixel.x - cellSize / 2 + 4}
                      y={pixel.y - cellSize / 2 + 4}
                      width={cellSize - 8}
                      height={cellSize - 8}
                      fill="rgba(135, 206, 250, 0.4)"
                      stroke="rgba(173, 216, 230, 0.8)"
                      strokeWidth={2}
                      rx={4}
                    />
                    <text
                      x={pixel.x}
                      y={pixel.y + 4}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="#ffffff"
                      fontSize={cellSize * 0.35}
                      fontWeight="bold"
                      style={{ textShadow: '0 1px 3px rgba(0,0,0,0.7)' }}
                    >
                      {block.iceCount}
                    </text>
                  </g>
                )}
                {/* Mirror overlay for mirror blocks */}
                {block.mirror && (
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
                      rx={4}
                    />
                    {/* Mirror icon in BOTTOM-LEFT corner */}
                    <g transform={`translate(${pixel.x - cellSize / 2 + 10}, ${pixel.y + cellSize / 2 - 10})`}>
                      <circle cx={0} cy={0} r={7} fill="rgba(168, 85, 247, 0.95)" stroke="white" strokeWidth={1.5} />
                      {/* Flip horizontal arrows icon */}
                      <g transform="scale(0.8)">
                        <path d="M -3 0 L -1 -2 L -1 -0.8 L 1 -0.8 L 1 -2 L 3 0 L 1 2 L 1 0.8 L -1 0.8 L -1 2 Z" fill="white" />
                      </g>
                    </g>
                  </g>
                )}
                {/* Blocks ahead counter */}
                {showBlocksAhead && (() => {
                  const blocksAhead = blocksAheadMap.get(key) ?? 0;
                  const counterColor = getBlocksAheadColor(blocksAhead);
                  const counterRadius = Math.max(6, cellSize * 0.2);
                  const fontSize = Math.max(8, cellSize * 0.25);
                  return (
                    <g transform={`translate(${pixel.x + cellSize / 2 - counterRadius - 2}, ${pixel.y - cellSize / 2 + counterRadius + 2})`} pointerEvents="none">
                      <circle
                        cx={0}
                        cy={0}
                        r={counterRadius}
                        fill={counterColor}
                        stroke="rgba(0, 0, 0, 0.5)"
                        strokeWidth={1}
                      />
                      <text
                        x={0}
                        y={0}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fill="white"
                        fontSize={fontSize}
                        fontWeight="bold"
                        style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}
                      >
                        {blocksAhead}
                      </text>
                    </g>
                  );
                })()}
                {canClear && (
                  <rect
                    x={pixel.x - cellSize / 2 + 2}
                    y={pixel.y - cellSize / 2 + 2}
                    width={cellSize - 4}
                    height={cellSize - 4}
                    fill="none"
                    stroke="rgba(34, 197, 94, 0.5)"
                    strokeWidth={2}
                    strokeDasharray="4 2"
                    rx={4}
                    pointerEvents="none"
                  />
                )}
                {/* ENHANCED DEADLOCK indicators with root cause */}

                {/* ROOT CAUSE: Edge Blocked - Yellow/amber, this block points at edge */}
                {isEdgeBlocked && isRootCause && (
                  <g pointerEvents="none">
                    <rect
                      x={pixel.x - cellSize / 2 + 1}
                      y={pixel.y - cellSize / 2 + 1}
                      width={cellSize - 2}
                      height={cellSize - 2}
                      fill="rgba(251, 191, 36, 0.2)"
                      stroke="rgba(251, 191, 36, 0.9)"
                      strokeWidth={3}
                      rx={5}
                    />
                    {/* Edge/wall icon */}
                    <g transform={`translate(${pixel.x + cellSize / 2 - 8}, ${pixel.y - cellSize / 2 + 8})`}>
                      <circle cx={0} cy={0} r={6} fill="rgba(251, 191, 36, 0.95)" />
                      <text x={0} y={1} textAnchor="middle" fontSize={8} fill="white" fontWeight="bold">&#9645;</text>
                    </g>
                  </g>
                )}

                {/* Mutual Block: Purple solid border */}
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
                      rx={5}
                    />
                    <g transform={`translate(${pixel.x + cellSize / 2 - 8}, ${pixel.y - cellSize / 2 + 8})`}>
                      <circle cx={0} cy={0} r={6} fill="rgba(139, 92, 246, 0.95)" />
                      <text x={0} y={1} textAnchor="middle" fontSize={8} fill="white" fontWeight="bold">&#8596;</text>
                    </g>
                  </g>
                )}

                {/* Circular Chain: Purple with cycle icon */}
                {isCircularChain && (
                  <g pointerEvents="none">
                    <rect
                      x={pixel.x - cellSize / 2 + 1}
                      y={pixel.y - cellSize / 2 + 1}
                      width={cellSize - 2}
                      height={cellSize - 2}
                      fill="rgba(139, 92, 246, 0.15)"
                      stroke="rgba(139, 92, 246, 0.9)"
                      strokeWidth={3}
                      rx={5}
                    />
                    <g transform={`translate(${pixel.x + cellSize / 2 - 8}, ${pixel.y - cellSize / 2 + 8})`}>
                      <circle cx={0} cy={0} r={6} fill="rgba(139, 92, 246, 0.95)" />
                      <text x={0} y={1} textAnchor="middle" fontSize={8} fill="white" fontWeight="bold">&#8635;</text>
                    </g>
                  </g>
                )}

                {/* Blocked by chain leading to edge (not root, not mutual/circular) */}
                {isStuck && !isMutualBlock && !isCircularChain && !isRootCause && rootCause === 'edge_blocked' && (
                  <g pointerEvents="none">
                    <rect
                      x={pixel.x - cellSize / 2 + 1}
                      y={pixel.y - cellSize / 2 + 1}
                      width={cellSize - 2}
                      height={cellSize - 2}
                      fill="rgba(239, 68, 68, 0.15)"
                      stroke="rgba(239, 68, 68, 0.9)"
                      strokeWidth={3}
                      strokeDasharray="5 2"
                      rx={5}
                    />
                    {/* Chain length indicator */}
                    <g transform={`translate(${pixel.x + cellSize / 2 - 8}, ${pixel.y - cellSize / 2 + 8})`}>
                      <circle cx={0} cy={0} r={6} fill="rgba(239, 68, 68, 0.95)" />
                      <text x={0} y={1} textAnchor="middle" fontSize={chainLength > 9 ? 6 : 8} fill="white" fontWeight="bold">
                        {chainLength > 1 ? chainLength : '!'}
                      </text>
                    </g>
                  </g>
                )}

                {/* Pure blocker (not stuck itself) */}
                {isBlocker && !isStuck && (
                  <g pointerEvents="none">
                    <rect
                      x={pixel.x - cellSize / 2 + 1}
                      y={pixel.y - cellSize / 2 + 1}
                      width={cellSize - 2}
                      height={cellSize - 2}
                      fill="rgba(245, 158, 11, 0.15)"
                      stroke="rgba(245, 158, 11, 0.9)"
                      strokeWidth={3}
                      rx={5}
                    />
                    <g transform={`translate(${pixel.x + cellSize / 2 - 8}, ${pixel.y - cellSize / 2 + 8})`}>
                      <circle cx={0} cy={0} r={6} fill="rgba(245, 158, 11, 0.95)" />
                      <text x={0} y={1} textAnchor="middle" fontSize={8} fill="white" fontWeight="bold">&#9939;</text>
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

      {/* Deadlock Legend - shown when deadlock occurs */}
      {deadlockInfo.hasDeadlock && (
        <div className="mt-3 p-3 bg-muted/50 rounded-lg border border-muted">
          <p className="text-xs font-medium text-muted-foreground mb-2">Deadlock - Why blocks are stuck:</p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded border-2 border-amber-400 bg-amber-400/20 flex items-center justify-center">
                <span className="text-[8px]">&#9645;</span>
              </div>
              <span className="text-muted-foreground">Points at edge (root cause)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded border-2 border-purple-500 bg-purple-500/20 flex items-center justify-center">
                <span className="text-[8px]">&#8596;</span>
              </div>
              <span className="text-muted-foreground">Mutual block (A&#8596;B)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded border-2 border-purple-500 bg-purple-500/20 flex items-center justify-center">
                <span className="text-[8px]">&#8635;</span>
              </div>
              <span className="text-muted-foreground">Circular chain (A&#8594;B&#8594;C&#8594;A)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded border-2 border-red-500 border-dashed bg-red-500/20 flex items-center justify-center">
                <span className="text-[8px] font-bold">3</span>
              </div>
              <span className="text-muted-foreground">Blocked (# = chain length)</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
