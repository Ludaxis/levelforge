'use client';

import { Tile, Position, COLOR_HEX } from '@/types/game';
import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';

interface GameBoardProps {
  board: (Tile | null)[][];
  selectedTile: Position | null;
  onTileClick: (row: number, col: number) => void;
  disabled?: boolean;
}

export function GameBoard({ board, selectedTile, onTileClick, disabled }: GameBoardProps) {
  const size = board.length;
  const [tileSize, setTileSize] = useState(50);

  useEffect(() => {
    const updateTileSize = () => {
      const isMobile = window.innerWidth < 640;
      const maxBoardWidth = isMobile ? window.innerWidth - 64 : 400;
      const calculatedSize = Math.min(50, Math.floor((maxBoardWidth - (size - 1) * 4 - 16) / size));
      setTileSize(Math.max(32, calculatedSize));
    };

    updateTileSize();
    window.addEventListener('resize', updateTileSize);
    return () => window.removeEventListener('resize', updateTileSize);
  }, [size]);

  return (
    <div
      className="inline-grid gap-1 p-2 bg-slate-800 dark:bg-slate-900 rounded-lg"
      style={{
        gridTemplateColumns: `repeat(${size}, ${tileSize}px)`,
        gridTemplateRows: `repeat(${size}, ${tileSize}px)`,
      }}
    >
      {board.map((row, rowIndex) =>
        row.map((tile, colIndex) => {
          const isSelected =
            selectedTile?.row === rowIndex && selectedTile?.col === colIndex;

          return (
            <button
              key={tile?.id || `${rowIndex}-${colIndex}`}
              onClick={() => onTileClick(rowIndex, colIndex)}
              disabled={disabled || !tile}
              className={cn(
                'rounded-md transition-all duration-150 transform',
                'hover:scale-105 active:scale-95',
                'shadow-md hover:shadow-lg',
                isSelected && 'ring-4 ring-white scale-110 z-10',
                disabled && 'cursor-not-allowed opacity-80'
              )}
              style={{
                width: tileSize,
                height: tileSize,
                backgroundColor: tile ? COLOR_HEX[tile.color] : 'transparent',
              }}
            >
              {tile && (
                <div className="w-full h-full flex items-center justify-center">
                  <div
                    className="w-3/4 h-3/4 rounded-full opacity-30"
                    style={{
                      background: `radial-gradient(circle at 30% 30%, white, transparent)`,
                    }}
                  />
                </div>
              )}
            </button>
          );
        })
      )}
    </div>
  );
}
