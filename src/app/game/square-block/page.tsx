'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  SquareBlockBoard,
  SquareBlockLevelDesigner,
  SquareBlockLevelCollection,
  CollectionCurveChart,
  useLevelCollection,
} from '@/components/games/square-block';
import { SquareBlockLevel, DesignedLevel } from '@/types/squareBlock';
import { useSquareBlockGame } from '@/lib/useSquareBlockGame';
import { ArrowLeft, Undo2, RotateCcw, Trophy, XCircle, Palette, Layers, Play } from 'lucide-react';
import Link from 'next/link';

// Default level for play mode
const DEFAULT_LEVEL: SquareBlockLevel = {
  id: 'default',
  name: 'Tutorial',
  rows: 5,
  cols: 5,
  difficulty: 'easy',
  gameMode: 'classic',
  blocks: [
    { id: '1', coord: { row: 2, col: 2 }, direction: 'E', color: '#06b6d4' },
    { id: '2', coord: { row: 2, col: 3 }, direction: 'E', color: '#a855f7' },
    { id: '3', coord: { row: 1, col: 2 }, direction: 'N', color: '#f59e0b' },
  ],
  parMoves: 5,
};

export default function SquareBlockPage() {
  const [activeTab, setActiveTab] = useState<'design' | 'collection' | 'play'>('design');
  const [currentLevel, setCurrentLevel] = useState<SquareBlockLevel>(DEFAULT_LEVEL);
  const [levelNumber, setLevelNumber] = useState(1);
  const [editingLevel, setEditingLevel] = useState<DesignedLevel | null>(null);
  const [gameKey, setGameKey] = useState(0);

  // Level collection state
  const { levels, setLevels, isLoaded, addLevel } = useLevelCollection();

  const game = useSquareBlockGame(currentLevel);

  // Convert DesignedLevel to SquareBlockLevel for gameplay
  const designedLevelToPlayable = (level: DesignedLevel): SquareBlockLevel => ({
    id: level.id,
    name: level.name,
    rows: level.rows,
    cols: level.cols,
    blocks: level.blocks,
    holes: level.holes,
    difficulty: level.metrics.difficulty === 'superHard' ? 'hard' : level.metrics.difficulty,
    gameMode: level.gameMode,
    parMoves: level.metrics.moveLimit,
  });

  // Handle playing a custom level from designer
  const handlePlayLevel = (level: SquareBlockLevel) => {
    setCurrentLevel(level);
    game.loadLevel(level);
    setGameKey((k) => k + 1);
    setActiveTab('play');
  };

  // Handle playing a level from collection
  const handlePlayFromCollection = (designedLevel: DesignedLevel) => {
    handlePlayLevel(designedLevelToPlayable(designedLevel));
  };

  // Handle editing a level from collection
  const handleEditFromCollection = (designedLevel: DesignedLevel) => {
    setEditingLevel(designedLevel);
    setLevelNumber(designedLevel.levelNumber);
    setActiveTab('design');
  };

  // Handle adding/updating level in collection
  const handleAddToCollection = (level: DesignedLevel) => {
    if (editingLevel) {
      // Update existing level
      setLevels(levels.map(l => l.id === level.id ? level : l));
      setEditingLevel(null);
    } else {
      // Add new level
      addLevel(level);
      // Auto-increment level number
      setLevelNumber(levels.length + 2);
    }
  };

  // Handle clicking on a level in the curve chart
  const handleCurveLevelClick = (num: number) => {
    const level = levels.find(l => l.levelNumber === num);
    if (level) {
      handleEditFromCollection(level);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      <div className="container mx-auto px-4 py-6 max-w-6xl">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link href="/game">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Square Block Away</h1>
            <p className="text-sm text-muted-foreground">
              Design and play rectangular grid puzzles. Learn how level design affects difficulty curves and player flow state.
            </p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'design' | 'collection' | 'play')}>
          <TabsList className="grid w-full grid-cols-3 mb-6">
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
          </TabsList>

          {/* Design Tab */}
          <TabsContent value="design">
            <div className="grid gap-4 lg:grid-cols-[400px_1fr]">
              <SquareBlockLevelDesigner
                onPlayLevel={handlePlayLevel}
                onAddToCollection={handleAddToCollection}
                levelNumber={levelNumber}
                onLevelNumberChange={setLevelNumber}
                maxLevelNumber={100}
                editingLevel={editingLevel}
                showMetricsPanel={true}
              />
              <Card>
                <CardHeader>
                  <CardTitle>How to Design</CardTitle>
                  <CardDescription>Create puzzle levels that follow best practices</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 text-sm text-muted-foreground">
                  <div className="space-y-2">
                    <p className="font-medium text-foreground">1. Set the Grid Size</p>
                    <p>Choose rows/cols 3-10. Larger grids allow more complex puzzles.</p>
                  </div>
                  <div className="space-y-2">
                    <p className="font-medium text-foreground">2. Match Expected Difficulty</p>
                    <p>Check the expected difficulty for your level position. Position 5 should be hard, position 10 super hard.</p>
                  </div>
                  <div className="space-y-2">
                    <p className="font-medium text-foreground">3. Follow the Sawtooth Pattern</p>
                    <p>Easy levels after hard spikes. Hard spikes at positions 5, 15, 25... Super hard peaks at 10, 20, 30...</p>
                  </div>
                  <div className="space-y-2">
                    <p className="font-medium text-foreground">4. Keep Players in Flow</p>
                    <p>Difficulty should match player skill. Too easy = boredom. Too hard = frustration.</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Collection Tab */}
          <TabsContent value="collection">
            <div className="grid gap-4 lg:grid-cols-[1fr_400px]">
              <CollectionCurveChart
                levels={levels}
                onLevelClick={handleCurveLevelClick}
                maxLevels={100}
              />
              <SquareBlockLevelCollection
                levels={levels}
                onLevelsChange={setLevels}
                onEditLevel={handleEditFromCollection}
                onPlayLevel={handlePlayFromCollection}
              />
            </div>
          </TabsContent>

          {/* Play Tab */}
          <TabsContent value="play">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Game Board */}
              <div className="lg:col-span-2">
                <Card>
                  <CardHeader>
                    <CardTitle>{currentLevel.name}</CardTitle>
                    <CardDescription>
                      {currentLevel.gameMode === 'push' ? 'Push Mode' : 'Classic Mode'} - {currentLevel.rows}x{currentLevel.cols} grid
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <SquareBlockBoard
                      key={`board-${gameKey}`}
                      state={game.state}
                      onTapBlock={game.tapBlock}
                      clearableBlocks={game.clearableBlocks}
                      canClearBlock={game.canClearBlock}
                    />
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
                        {game.state.moveLimit > 0 ? (
                          <>
                            <div className="text-2xl font-bold">
                              {Math.max(0, game.state.moveLimit - game.state.moveCount)}
                            </div>
                            <div className="text-xs text-muted-foreground">Moves Left</div>
                          </>
                        ) : (
                          <>
                            <div className="text-2xl font-bold">{game.state.moveCount}</div>
                            <div className="text-xs text-muted-foreground">Moves</div>
                          </>
                        )}
                      </div>
                      <div className="text-center p-3 bg-muted/50 rounded-lg">
                        <div className="text-2xl font-bold">{game.state.blocks.size}</div>
                        <div className="text-xs text-muted-foreground">Blocks Left</div>
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
                        onClick={game.undo}
                        disabled={game.state.history.length === 0 || !!game.state.animatingBlock}
                        className="flex-1"
                      >
                        <Undo2 className="h-4 w-4 mr-2" />
                        Undo
                      </Button>
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
                {game.state.isComplete && (
                  <Card className="border-green-500 border-2">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2 text-green-500">
                        <Trophy className="h-5 w-5" />
                        Level Complete!
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm">
                        Cleared in <span className="font-bold">{game.state.moveCount}</span> moves
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
                        Out of Moves!
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm">
                        {game.state.blocks.size} blocks remaining. Use Undo or Reset.
                      </p>
                    </CardContent>
                  </Card>
                )}

                {/* Not Solvable Warning */}
                {!game.isSolvable && !game.state.isComplete && !game.state.isLost && (
                  <Card className="border-amber-500/50">
                    <CardContent className="pt-4">
                      <p className="text-sm text-amber-500">
                        No blocks can be cleared. Use Undo or Reset.
                      </p>
                    </CardContent>
                  </Card>
                )}

                {/* Play Collection Levels */}
                {levels.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Play Collection</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-5 gap-1">
                        {levels.slice(0, 20).map((level) => (
                          <Button
                            key={level.id}
                            variant="outline"
                            size="sm"
                            onClick={() => handlePlayFromCollection(level)}
                            className={`h-8 w-8 p-0 text-xs ${
                              level.metrics.difficulty === 'easy' ? 'border-green-500/50' :
                              level.metrics.difficulty === 'medium' ? 'border-yellow-500/50' :
                              level.metrics.difficulty === 'hard' ? 'border-orange-500/50' :
                              'border-red-500/50'
                            }`}
                          >
                            {level.levelNumber}
                          </Button>
                        ))}
                      </div>
                      {levels.length > 20 && (
                        <p className="text-xs text-muted-foreground mt-2 text-center">
                          +{levels.length - 20} more in Collection tab
                        </p>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Back to Design */}
                <Button
                  variant="secondary"
                  onClick={() => setActiveTab('design')}
                  className="w-full"
                >
                  Back to Designer
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}
