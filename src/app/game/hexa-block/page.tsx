'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { HexBlockBoard } from '@/components/games/hexa-block/HexBlockBoard';
import { HexBlockStatus } from '@/components/games/hexa-block/HexBlockStatus';
import { HexBlockLevelDesigner } from '@/components/games/hexa-block/HexBlockLevelDesigner';
import { HexaBlockLevelCollection, useLevelCollection } from '@/components/games/hexa-block/HexaBlockLevelCollection';
import { CollectionCurveChart } from '@/components/games/hexa-block/CollectionCurveChart';
import { useHexaBlockGame } from '@/lib/useHexaBlockGame';
import { HexaBlockLevel, DesignedLevel } from '@/types/hexaBlock';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Hexagon, ArrowLeft, Palette, Layers, Play, BookOpen } from 'lucide-react';
import Link from 'next/link';
import dynamic from 'next/dynamic';

// Dynamically import chart components to avoid SSR issues
const SawtoothCurve = dynamic(
  () => import('@/components/charts/SawtoothCurve').then(mod => ({ default: mod.SawtoothCurve })),
  { ssr: false }
);
const FlowStateChart = dynamic(
  () => import('@/components/charts/FlowStateChart').then(mod => ({ default: mod.FlowStateChart })),
  { ssr: false }
);
const FlowSawtoothBridge = dynamic(
  () => import('@/components/charts/FlowSawtoothBridge').then(mod => ({ default: mod.FlowSawtoothBridge })),
  { ssr: false }
);

// ============================================================================
// Game Container Component
// ============================================================================

function GameContainer({ level, onBack }: { level: HexaBlockLevel; onBack?: () => void }) {
  const {
    state,
    tapStack,
    tapCarousel,
    undo,
    reset,
    clearableStacks,
    isSolvable,
  } = useHexaBlockGame(level);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="flex flex-col items-center gap-4">
        <Card className="w-full">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Hexagon className="h-5 w-5" />
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
              Tap stacks to roll them off the board. Clear all stacks to win!
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center py-4">
            <HexBlockBoard
              gridRadius={level.gridRadius}
              stacks={state.stacks}
              holes={state.holes}
              pauses={state.pauses}
              carousels={state.carousels}
              onStackTap={tapStack}
              onCarouselTap={tapCarousel}
              clearableStacks={clearableStacks}
              animatingStack={state.animatingStack}
              animationPhase={state.animationPhase}
              animationData={state.animationData}
              disabled={state.isComplete}
            />
          </CardContent>
        </Card>
      </div>

      <HexBlockStatus
        state={state}
        onUndo={undo}
        onReset={reset}
        isSolvable={isSolvable}
      />
    </div>
  );
}

// ============================================================================
// Main Page Component
// ============================================================================

function HexaBlockPageContent() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState('design');
  const [playingLevel, setPlayingLevel] = useState<HexaBlockLevel | null>(null);
  const [gameKey, setGameKey] = useState(0);
  const [levelNumber, setLevelNumber] = useState(1);
  const [editingLevel, setEditingLevel] = useState<DesignedLevel | null>(null);

  // Level collection state
  const { levels, setLevels, isLoaded, addLevel, importLevels, syncState, forceSync } = useLevelCollection();

  // Handle shared import
  useEffect(() => {
    if (searchParams.get('import') !== 'shared') return;
    const raw = localStorage.getItem('shared-import-pending');
    if (!raw) return;
    try {
      const { gameType, levels: sharedLevels } = JSON.parse(raw);
      if (gameType !== 'hexa-block' || !Array.isArray(sharedLevels)) return;
      localStorage.removeItem('shared-import-pending');
      importLevels(sharedLevels as DesignedLevel[]);
      setActiveTab('collection');
      window.history.replaceState({}, '', '/game/hexa-block');
    } catch {
      // Invalid data, ignore
    }
  }, [searchParams, importLevels]);

  // Handle playing a custom level from designer
  const handlePlayCustomLevel = (level: HexaBlockLevel) => {
    setPlayingLevel(level);
    setGameKey((k) => k + 1);
    setActiveTab('play');
  };

  // Handle playing a level from collection
  const handlePlayCollectionLevel = (designedLevel: DesignedLevel) => {
    const level: HexaBlockLevel = {
      id: designedLevel.id,
      name: designedLevel.name,
      gridRadius: designedLevel.gridRadius,
      difficulty: designedLevel.metrics.difficulty === 'superHard' ? 'hard' : designedLevel.metrics.difficulty,
      gameMode: designedLevel.gameMode,
      stacks: designedLevel.stacks,
      holes: designedLevel.holes,
      pauses: designedLevel.pauses,
      carousels: designedLevel.carousels,
    };
    setPlayingLevel(level);
    setGameKey((k) => k + 1);
    setActiveTab('play');
  };

  // Handle editing a level from collection
  const handleEditLevel = (designedLevel: DesignedLevel) => {
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
      handleEditLevel(level);
    }
  };

  // Handle back from playing
  const handleBackFromPlay = () => {
    setPlayingLevel(null);
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
        <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Hexa Block Away</h1>
        <p className="text-muted-foreground mt-2 text-sm lg:text-base">
          Design and play hexagonal logic puzzles. Learn how level design affects difficulty curves and player flow state.
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
          <HexBlockLevelDesigner
            onPlayLevel={handlePlayCustomLevel}
            onAddToCollection={handleAddToCollection}
            levelNumber={levelNumber}
            onLevelNumberChange={setLevelNumber}
            maxLevelNumber={100}
            editingLevel={editingLevel}
            showMetricsPanel={false}
          />
        </TabsContent>

        {/* Collection Tab */}
        <TabsContent value="collection" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[1fr_400px]">
            <CollectionCurveChart
              levels={levels}
              onLevelClick={handleCurveLevelClick}
              maxLevels={100}
            />
            <HexaBlockLevelCollection
              levels={levels}
              onLevelsChange={setLevels}
              onEditLevel={handleEditLevel}
              onPlayLevel={handlePlayCollectionLevel}
              syncState={syncState}
              onForceSync={forceSync}
            />
          </div>
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
                  <CardDescription>Select a level from your collection to play</CardDescription>
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
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">
                  No levels in your collection yet. Design some levels first!
                </p>
                <Button className="mt-4" onClick={() => setActiveTab('design')}>
                  Go to Design
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Theory Tab */}
        <TabsContent value="theory" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Level Design Theory</CardTitle>
              <CardDescription>
                Understanding how difficulty curves, flow state, and the sawtooth pattern work together
              </CardDescription>
            </CardHeader>
          </Card>

          <div className="space-y-8">
            <section>
              <h3 className="text-lg font-semibold mb-4">The Sawtooth Difficulty Curve</h3>
              <SawtoothCurve />
            </section>

            <section>
              <h3 className="text-lg font-semibold mb-4">Flow State Engagement</h3>
              <FlowStateChart />
            </section>

            <section>
              <h3 className="text-lg font-semibold mb-4">Connecting Sawtooth and Flow</h3>
              <FlowSawtoothBridge />
            </section>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function HexaBlockPage() {
  return (
    <Suspense>
      <HexaBlockPageContent />
    </Suspense>
  );
}
