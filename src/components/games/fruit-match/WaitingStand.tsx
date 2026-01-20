'use client';

import { SinkTile, FruitType, FRUIT_EMOJI, FRUIT_COLORS, Launcher } from '@/types/fruitMatch';

interface WaitingStandProps {
  tiles: SinkTile[];
  slots: number;
  launchers: Launcher[];
  matchingFruit: FruitType | null;
  isAnimating: boolean;
}

export function WaitingStand({
  tiles,
  slots,
  launchers,
  matchingFruit,
  isAnimating,
}: WaitingStandProps) {
  // Group tiles by fruit type for visual clustering
  const launcherFruits = new Set(launchers.map(l => l.requiredFruit));

  // Count tiles per fruit type
  const fruitCounts: Record<FruitType, number> = {
    apple: 0, orange: 0, lemon: 0, grape: 0, cherry: 0, kiwi: 0
  };
  tiles.forEach(tile => {
    fruitCounts[tile.fruitType]++;
  });

  return (
    <div className="flex flex-wrap gap-1 p-2 bg-muted/20 rounded border border-muted min-h-[40px] justify-center max-w-[280px]">
      {/* Render filled slots */}
      {tiles.map((tile) => {
        const isMatching = tile.fruitType === matchingFruit && isAnimating;
        const isLauncherMatch = launcherFruits.has(tile.fruitType);
        const count = fruitCounts[tile.fruitType];
        const hasEnoughForMatch = count >= 3;
        const color = FRUIT_COLORS[tile.fruitType];

        return (
          <div
            key={tile.id}
            className={`
              relative w-8 h-8 rounded border flex items-center justify-center
              transition-all duration-200
              ${isMatching ? 'animate-bounce scale-110' : ''}
              ${hasEnoughForMatch && isLauncherMatch ? 'ring-1 ring-green-400' : ''}
            `}
            style={{
              backgroundColor: `${color}30`,
              borderColor: isMatching ? color : `${color}50`,
            }}
          >
            <span className="text-base">{FRUIT_EMOJI[tile.fruitType]}</span>
          </div>
        );
      })}

      {/* Render empty slots */}
      {Array.from({ length: slots - tiles.length }).map((_, index) => (
        <div
          key={`empty-${index}`}
          className="w-8 h-8 rounded border border-dashed border-muted bg-black/10"
        />
      ))}
    </div>
  );
}
