'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  FruitMatchBoard,
  FruitMatchLevelDesigner,
  FruitMatchLevelCollection,
  useFruitMatchLevelCollection,
} from '@/components/games/fruit-match';
import { FruitMatchCurveChart } from '@/components/games/fruit-match/FruitMatchCurveChart';
import { FruitMatchLevel, DesignedFruitMatchLevel } from '@/types/fruitMatch';
import { useFruitMatchGame } from '@/lib/useFruitMatchGame';
import { createSimpleTestLevel, generateSinkStacks, getRequiredFruitCounts } from '@/lib/fruitMatchUtils';
import { ArrowLeft, RotateCcw, Trophy, XCircle, Palette, Layers, Play, BookOpen, Apple } from 'lucide-react';
import Link from 'next/link';

// ============================================================================
// Game Container Component
// ============================================================================

function GameContainer({
  level,
  onBack,
}: {
  level: FruitMatchLevel;
  onBack?: () => void;
}) {
  const game = useFruitMatchGame(level);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="flex flex-col items-center gap-4">
        <Card className="w-full">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Apple className="h-5 w-5" />
                {level.name}
              </CardTitle>
              {onBack && (
                <Button variant="ghost" size="sm" onClick={onBack}>
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Back
                </Button>
              )}
            </div>
            <CardDescription>
              Match 3 fruits to fill the pixel art!
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center py-4">
            <FruitMatchBoard game={game} />
          </CardContent>
        </Card>
      </div>

      {/* Status Panel */}
      <div className="space-y-4">
        {/* Stats */}
        <Card>
          <CardContent className="pt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <div className="text-2xl font-bold">{game.state.moveCount}</div>
                <div className="text-xs text-muted-foreground">Tiles Picked</div>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <div className="text-2xl font-bold">{game.state.matchCount}</div>
                <div className="text-xs text-muted-foreground">Matches</div>
              </div>
            </div>

            {/* Progress bar */}
            <div className="mt-4">
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>Progress</span>
                <span>{game.progress.percentComplete}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 transition-all"
                  style={{ width: `${game.progress.percentComplete}%` }}
                />
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {game.progress.filledPixels}/{game.progress.totalPixels} pixels
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={game.reset}
                className="flex-1"
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Win State */}
        {game.state.isWon && (
          <Card className="border-green-500 border-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2 text-green-500">
                <Trophy className="h-5 w-5" />
                Level Complete!
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">
                Completed in{' '}
                <span className="font-bold">{game.state.matchCount}</span> matches
              </p>
            </CardContent>
          </Card>
        )}

        {/* Lose State */}
        {game.state.isLost && (
          <Card className="border-red-500 border-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2 text-red-500">
                <XCircle className="h-5 w-5" />
                Game Over!
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">
                Waiting stand is full with no valid match. Try again!
              </p>
            </CardContent>
          </Card>
        )}

        {/* Game Info */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">How to Play</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground space-y-2">
            <p>1. Tap tiles in the sink to pick them up</p>
            <p>2. When you have 3 matching tiles that a launcher needs, they auto-match</p>
            <p>3. The launcher shoots and fills one pixel</p>
            <p>4. Fill all pixels to win!</p>
            <p className="text-amber-400">Game over if waiting stand fills with no match</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ============================================================================
// Main Page Component
// ============================================================================

function FruitMatchPageContent() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState('design');
  const [playingLevel, setPlayingLevel] = useState<FruitMatchLevel | null>(null);
  const [gameKey, setGameKey] = useState(0);
  const [levelNumber, setLevelNumber] = useState(1);
  const [editingLevel, setEditingLevel] = useState<DesignedFruitMatchLevel | null>(null);

  // Level collection state
  const { levels, setLevels, isLoaded, addLevel, importLevels, syncState, forceSync } = useFruitMatchLevelCollection();

  // Handle shared import
  useEffect(() => {
    if (searchParams.get('import') !== 'shared') return;
    const raw = localStorage.getItem('shared-import-pending');
    if (!raw) return;
    try {
      const { gameType, levels: sharedLevels } = JSON.parse(raw);
      if (gameType !== 'fruit-match' || !Array.isArray(sharedLevels)) return;
      localStorage.removeItem('shared-import-pending');
      importLevels(sharedLevels as DesignedFruitMatchLevel[]);
      setActiveTab('collection');
      // Clean up URL
      window.history.replaceState({}, '', '/game/fruit-match');
    } catch {
      // Invalid data, ignore
    }
  }, [searchParams, importLevels]);

  // Convert DesignedFruitMatchLevel to FruitMatchLevel for gameplay
  const designedLevelToPlayable = (level: DesignedFruitMatchLevel): FruitMatchLevel => {
    // Regenerate sink stacks for fresh gameplay
    const fruitCounts = getRequiredFruitCounts(level.pixelArt);
    const sinkStacks = generateSinkStacks(level.sinkWidth, fruitCounts, 2, 4);

    return {
      id: level.id,
      name: level.name,
      pixelArt: level.pixelArt.map(c => ({ ...c, filled: false })),
      pixelArtWidth: level.pixelArtWidth,
      pixelArtHeight: level.pixelArtHeight,
      sinkWidth: level.sinkWidth,
      sinkStacks,
      waitingStandSlots: level.waitingStandSlots,
      difficulty: level.metrics.difficulty,
    };
  };

  // Handle playing a custom level from designer
  const handlePlayCustomLevel = (level: FruitMatchLevel) => {
    setPlayingLevel(level);
    setGameKey((k) => k + 1);
    setActiveTab('play');
  };

  // Handle playing a level from collection
  const handlePlayCollectionLevel = (designedLevel: DesignedFruitMatchLevel) => {
    setPlayingLevel(designedLevelToPlayable(designedLevel));
    setGameKey((k) => k + 1);
    setActiveTab('play');
  };

  // Handle editing a level from collection
  const handleEditLevel = (designedLevel: DesignedFruitMatchLevel) => {
    setEditingLevel(designedLevel);
    setLevelNumber(designedLevel.levelNumber);
    setActiveTab('design');
  };

  // Handle adding/updating level in collection
  const handleAddToCollection = (level: DesignedFruitMatchLevel) => {
    if (editingLevel) {
      // Update existing level
      setLevels(levels.map((l) => (l.id === level.id ? level : l)));
      setEditingLevel(null);
    } else {
      // Add new level
      addLevel(level);
      // Auto-increment level number
      setLevelNumber(levels.length + 2);
    }
  };

  // Handle back from playing
  const handleBackFromPlay = () => {
    setPlayingLevel(null);
  };

  // Play test level
  const handlePlayTestLevel = () => {
    const testLevel = createSimpleTestLevel();
    setPlayingLevel(testLevel);
    setGameKey((k) => k + 1);
    setActiveTab('play');
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
        <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">
          Juicy Blast
        </h1>
        <p className="text-muted-foreground mt-2 text-sm lg:text-base">
          Match juicy tiles to fill pixel art targets. Design patterns and test difficulty curves.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="design" className="flex items-center gap-2">
            <Palette className="h-4 w-4" />
            <span className="hidden sm:inline">Design</span>
          </TabsTrigger>
          <TabsTrigger value="collection" className="flex items-center gap-2">
            <Layers className="h-4 w-4" />
            <span className="hidden sm:inline">Collection</span>
          </TabsTrigger>
          <TabsTrigger value="play" className="flex items-center gap-2">
            <Play className="h-4 w-4" />
            <span className="hidden sm:inline">Play</span>
          </TabsTrigger>
          <TabsTrigger value="theory" className="flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            <span className="hidden sm:inline">Theory</span>
          </TabsTrigger>
        </TabsList>

        {/* Design Tab */}
        <TabsContent value="design" className="h-[calc(100vh-200px)]">
          <FruitMatchLevelDesigner
            onPlayLevel={handlePlayCustomLevel}
            onAddToCollection={handleAddToCollection}
            levelNumber={levelNumber}
            onLevelNumberChange={setLevelNumber}
            maxLevelNumber={100}
            editingLevel={editingLevel}
          />
        </TabsContent>

        {/* Collection Tab */}
        <TabsContent value="collection" className="space-y-4">
          <FruitMatchLevelCollection
            levels={levels}
            onLevelsChange={setLevels}
            onEditLevel={handleEditLevel}
            onPlayLevel={handlePlayCollectionLevel}
            syncState={syncState}
            onForceSync={forceSync}
          />

          {/* Sawtooth Curve Chart */}
          {levels.length > 0 && (
            <FruitMatchCurveChart
              levels={levels}
              onLevelClick={(levelNumber) => {
                const level = levels.find((l) => l.levelNumber === levelNumber);
                if (level) {
                  handleEditLevel(level);
                }
              }}
            />
          )}
        </TabsContent>

        {/* Play Tab */}
        <TabsContent value="play" className="space-y-4">
          {playingLevel ? (
            <GameContainer
              key={`game-${gameKey}`}
              level={playingLevel}
              onBack={handleBackFromPlay}
            />
          ) : levels.length > 0 ? (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Play Your Collection</CardTitle>
                  <CardDescription>
                    Select a level from your collection to play
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-2">
                    {levels.map((level) => (
                      <Button
                        key={level.id}
                        variant="outline"
                        size="sm"
                        onClick={() => handlePlayCollectionLevel(level)}
                        className={`h-12 ${
                          level.metrics.difficulty === 'easy'
                            ? 'border-green-500/50'
                            : level.metrics.difficulty === 'medium'
                              ? 'border-yellow-500/50'
                              : level.metrics.difficulty === 'hard'
                                ? 'border-orange-500/50'
                                : 'border-red-500/50'
                        }`}
                      >
                        {level.levelNumber}
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">
                  No levels in your collection yet.
                </p>
                <div className="flex gap-2 justify-center mt-4">
                  <Button onClick={() => setActiveTab('design')}>
                    Design a Level
                  </Button>
                  <Button variant="outline" onClick={handlePlayTestLevel}>
                    <Play className="h-4 w-4 mr-2" />
                    Play Test Level
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Theory Tab */}
        <TabsContent value="theory" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Game Mechanics</CardTitle>
              <CardDescription>
                Understanding the Triple Tile Match puzzle design
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <section>
                <h3 className="text-lg font-semibold mb-2">Core Loop</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="font-medium">1. Pick Tiles</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Tap the top tile of any stack in the sink to add it to
                      your waiting stand.
                    </p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="font-medium">2. Match Triplets</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      When you have 3 of the same fruit that matches a launcher,
                      they auto-combine.
                    </p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="font-medium">3. Shoot & Fill</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      The launcher shoots the matched fruit to fill one pixel
                      in the target art.
                    </p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="font-medium">4. Conveyor Shift</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Launchers shift left, new one appears from the queue
                      based on remaining pixels.
                    </p>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-lg font-semibold mb-2">Difficulty Factors</h3>
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-20 shrink-0 text-right text-sm font-medium text-green-400">
                      Easier
                    </div>
                    <div className="flex-1">
                      <p className="text-sm">
                        Larger waiting stand (9 slots), fewer fruit types,
                        smaller pixel art
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-20 shrink-0 text-right text-sm font-medium text-red-400">
                      Harder
                    </div>
                    <div className="flex-1">
                      <p className="text-sm">
                        Smaller waiting stand (5 slots), more fruit variety,
                        larger pixel art
                      </p>
                    </div>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-lg font-semibold mb-2">Strategic Tips</h3>
                <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                  <li>Watch the launcher queue to plan ahead</li>
                  <li>Don't fill the waiting stand with random tiles</li>
                  <li>Focus on matching what the current launcher needs</li>
                  <li>Look for stacks that have matching fruits nearby</li>
                  <li>The first launcher (position 1) is ready to shoot</li>
                </ul>
              </section>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function FruitMatchPage() {
  return (
    <Suspense>
      <FruitMatchPageContent />
    </Suspense>
  );
}
