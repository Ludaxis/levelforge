'use client';

import { SinkTile, FRUIT_EMOJI, FRUIT_COLORS } from '@/types/fruitMatch';
import { getTopTile } from '@/lib/fruitMatchUtils';

interface TileSinkProps {
  sinkStacks: SinkTile[][];
  onPickTile: (position: number) => void;
  canPick: boolean;
  animatingTileId: string | null;
}

// Number of visible rows in each stack
const VISIBLE_ROWS = 2;
const TILE_SIZE = 36;
const TILE_OVERLAP = 12; // How much tiles overlap vertically

export function TileSink({
  sinkStacks,
  onPickTile,
  canPick,
  animatingTileId,
}: TileSinkProps) {
  const totalTiles = sinkStacks.reduce((sum, s) => sum + s.length, 0);
  const numColumns = sinkStacks.length;

  // Calculate stack height for layout
  const stackVisualHeight = TILE_SIZE + (VISIBLE_ROWS - 1) * TILE_OVERLAP + 24; // +24 for hidden count

  return (
    <div
      className="overflow-x-auto p-2 bg-gradient-to-t from-amber-900/30 to-transparent rounded border border-amber-900/30"
    >
      <div
        className="flex gap-2 justify-center"
        style={{ minWidth: numColumns * (TILE_SIZE + 8) }}
      >
        {sinkStacks.map((stack, position) => {
          const topTile = getTopTile(stack);
          const isPickable = canPick && topTile !== null;

          // Get sorted stack (top tiles first - lowest stackIndex)
          const sortedStack = [...stack].sort((a, b) => a.stackIndex - b.stackIndex);

          // Show only top VISIBLE_ROWS tiles
          const visibleTiles = sortedStack.slice(0, VISIBLE_ROWS);
          const hiddenCount = Math.max(0, stack.length - VISIBLE_ROWS);

          return (
            <div
              key={position}
              className="flex flex-col items-center"
              style={{ width: TILE_SIZE, minHeight: stackVisualHeight }}
            >
              {/* Stack of visible tiles */}
              <div
                className="relative"
                style={{
                  width: TILE_SIZE,
                  height: TILE_SIZE + (VISIBLE_ROWS - 1) * TILE_OVERLAP
                }}
              >
                {visibleTiles.map((tile, visualIndex) => {
                  const isTop = visualIndex === 0;
                  const isAnimating = tile.id === animatingTileId;
                  const color = FRUIT_COLORS[tile.fruitType];

                  return (
                    <button
                      key={tile.id}
                      onClick={() => isTop && isPickable && onPickTile(position)}
                      disabled={!isTop || !isPickable || isAnimating}
                      className={`
                        absolute left-0
                        rounded border-2 flex items-center justify-center
                        transition-all duration-200
                        ${isTop && isPickable ? 'cursor-pointer hover:scale-110 hover:-translate-y-1' : 'cursor-default'}
                        ${isAnimating ? 'animate-bounce scale-110 opacity-50' : ''}
                      `}
                      style={{
                        width: TILE_SIZE,
                        height: TILE_SIZE,
                        backgroundColor: color,
                        borderColor: isTop ? 'white' : `${color}60`,
                        boxShadow: isTop
                          ? '0 2px 8px rgba(0,0,0,0.4)'
                          : '0 1px 2px rgba(0,0,0,0.2)',
                        top: visualIndex * TILE_OVERLAP,
                        zIndex: VISIBLE_ROWS - visualIndex + 10,
                        opacity: isTop ? 1 : 0.5,
                      }}
                    >
                      <span className={`text-sm ${isTop ? '' : 'opacity-70'}`}>
                        {FRUIT_EMOJI[tile.fruitType]}
                      </span>

                      {/* Clickable indicator for top tile */}
                      {isTop && isPickable && (
                        <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-green-500 border border-white flex items-center justify-center shadow z-20">
                          <span className="text-[8px] text-white font-bold">+</span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Hidden count indicator */}
              {hiddenCount > 0 && (
                <div className="mt-0.5 text-[8px] text-muted-foreground bg-black/40 rounded px-1">
                  +{hiddenCount}
                </div>
              )}

              {/* Empty column indicator */}
              {stack.length === 0 && (
                <div
                  className="rounded border border-dashed border-muted bg-black/20"
                  style={{ width: TILE_SIZE, height: TILE_SIZE }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
