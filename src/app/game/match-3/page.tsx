'use client';

import { useState } from 'react';
import { GameBoard } from '@/components/games/match-3/GameBoard';
import { LevelConfigurator } from '@/components/games/match-3/LevelConfigurator';
import { GameStatus } from '@/components/games/match-3/GameStatus';
import { useMatch3Game } from '@/lib/useMatch3Game';
import { LevelConfig } from '@/types/game';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Gamepad2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

const defaultConfig: LevelConfig = {
  boardSize: 7,
  moveLimit: 28,
  colorCount: 5,
  difficultyTier: 'medium',
  objectives: [
    { color: 'red', target: 18, collected: 0 },
    { color: 'blue', target: 18, collected: 0 },
    { color: 'green', target: 18, collected: 0 },
  ],
};

function GameContainer({ config }: { config: LevelConfig }) {
  const { gameState, handleTileClick, resetGame, isProcessing, outcome } = useMatch3Game(config);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="flex flex-col items-center gap-4">
        <Card className="w-full">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <Gamepad2 className="h-5 w-5" />
              Match-3 Demo
            </CardTitle>
            <CardDescription>
              Click two adjacent tiles to swap them. Match 3+ of the same color.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center py-4">
            <GameBoard
              board={gameState.board}
              selectedTile={gameState.selectedTile}
              onTileClick={handleTileClick}
              disabled={isProcessing || gameState.isComplete}
            />
          </CardContent>
        </Card>
      </div>

      <GameStatus
        gameState={gameState}
        outcome={outcome}
        initialMoves={config.moveLimit}
      />
    </div>
  );
}

export default function Match3Page() {
  const [config, setConfig] = useState<LevelConfig>(defaultConfig);
  const [isPlaying, setIsPlaying] = useState(false);
  const [gameKey, setGameKey] = useState(0);

  const handlePlay = () => {
    setIsPlaying(true);
    setGameKey((k) => k + 1);
  };

  const handleReset = () => {
    setGameKey((k) => k + 1);
  };

  const handleConfigChange = (newConfig: LevelConfig) => {
    setConfig(newConfig);
    if (isPlaying) {
      setGameKey((k) => k + 1);
    }
  };

  return (
    <div className="space-y-4 lg:space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/game">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            All Games
          </Button>
        </Link>
      </div>

      <div>
        <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Match-3 Game Demo</h1>
        <p className="text-muted-foreground mt-2 text-sm lg:text-base">
          Test framework concepts with a playable match-3 game. Configure and see outcomes in real-time.
        </p>
      </div>

      <div className="grid gap-4 lg:gap-6 lg:grid-cols-[350px_1fr]">
        <LevelConfigurator
          config={config}
          onConfigChange={handleConfigChange}
          onPlay={handlePlay}
          onReset={handleReset}
          isPlaying={isPlaying}
        />

        {isPlaying ? (
          <GameContainer key={gameKey} config={config} />
        ) : (
          <Card className="flex items-center justify-center min-h-[400px]">
            <CardContent className="text-center">
              <Gamepad2 className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                Configure your level settings and click &quot;Start Level&quot; to play
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
