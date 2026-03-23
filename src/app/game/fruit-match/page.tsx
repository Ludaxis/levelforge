'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  FruitMatchLevelCollection,
  useFruitMatchLevelCollection,
  LevelDesignerV2,
} from '@/components/games/fruit-match';
import { FruitMatchCurveChart } from '@/components/games/fruit-match/FruitMatchCurveChart';
import { FruitMatchLevel, DesignedFruitMatchLevel } from '@/types/fruitMatch';
import { generateSinkStacks, getRequiredFruitCounts } from '@/lib/fruitMatchUtils';
import { ArrowLeft, Palette, Layers, Play, BookOpen } from 'lucide-react';
import Link from 'next/link';
import { ErrorBoundary } from '@/components/layout/ErrorBoundary';

// ============================================================================
// Main Page Component
// ============================================================================

function FruitMatchPageContent() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState('design');
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
      window.history.replaceState({}, '', '/game/fruit-match');
    } catch {
      // Invalid data, ignore
    }
  }, [searchParams, importLevels]);

  // Handle editing a level from collection
  const handleEditLevel = (designedLevel: DesignedFruitMatchLevel) => {
    setEditingLevel(designedLevel);
    setLevelNumber(designedLevel.levelNumber);
    setActiveTab('design');
  };

  // Handle adding/updating level in collection
  const handleAddToCollection = (level: DesignedFruitMatchLevel, collectionId?: string) => {
    if (editingLevel) {
      // Update existing level - use functional update to avoid stale closure
      setLevels((prev: DesignedFruitMatchLevel[]) => prev.map((l) => (l.id === level.id ? level : l)));
      setEditingLevel(null);
    } else {
      // Add new level
      addLevel(level);
      // Auto-increment level number
      setLevelNumber(prev => prev + 1);
    }
  };

  // Convert DesignedFruitMatchLevel to FruitMatchLevel for the play tab grid
  const designedLevelToPlayable = (level: DesignedFruitMatchLevel): FruitMatchLevel => {
    const fruitCounts = getRequiredFruitCounts(level.pixelArt);
    const sinkStacks = generateSinkStacks(level.sinkWidth, fruitCounts, 2, 4);
    return {
      id: level.id,
      name: level.name,
      pixelArt: level.pixelArt.map((c) => ({ ...c, filled: false })),
      pixelArtWidth: level.pixelArtWidth,
      pixelArtHeight: level.pixelArtHeight,
      sinkWidth: level.sinkWidth,
      sinkStacks,
      waitingStandSlots: level.waitingStandSlots,
      difficulty: level.metrics.difficulty,
    };
  };

  // Handle playing from collection play tab - edit the level in studio play mode
  const handlePlayCollectionLevel = (designedLevel: DesignedFruitMatchLevel) => {
    setEditingLevel(designedLevel);
    setLevelNumber(designedLevel.levelNumber);
    setActiveTab('design');
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
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="design" className="flex items-center gap-2">
            <Palette className="h-4 w-4" />
            <span className="hidden sm:inline">Design</span>
          </TabsTrigger>
          <TabsTrigger value="collection" className="flex items-center gap-2">
            <Layers className="h-4 w-4" />
            <span className="hidden sm:inline">Collection</span>
          </TabsTrigger>
          <TabsTrigger value="theory" className="flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            <span className="hidden sm:inline">Theory</span>
          </TabsTrigger>
        </TabsList>

        {/* Design Tab (Studio) */}
        <TabsContent value="design" className="h-[calc(100vh-200px)]">
          <ErrorBoundary>
          <LevelDesignerV2
            onPlayLevel={() => {}}
            onAddToCollection={handleAddToCollection}
            levelNumber={levelNumber}
            onLevelNumberChange={setLevelNumber}
            maxLevelNumber={100}
            editingLevel={editingLevel}
            existingLevelIds={levels.map((l) => l.name)}
          />
          </ErrorBoundary>
        </TabsContent>

        {/* Collection Tab */}
        <TabsContent value="collection" className="space-y-4">
          <ErrorBoundary>
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
              onLevelClick={(ln) => {
                const level = levels.find((l) => l.levelNumber === ln);
                if (level) handleEditLevel(level);
              }}
            />
          )}
          </ErrorBoundary>
        </TabsContent>

        {/* Theory Tab */}
        <TabsContent value="theory" className="space-y-6">
          <ErrorBoundary>
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
                      When you have 3 matching tiles that a launcher needs,
                      they auto-combine.
                    </p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="font-medium">3. Shoot & Fill</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      The launcher shoots the matched fruit to fill pixels
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
                  <li>Don&apos;t fill the waiting stand with random tiles</li>
                  <li>Focus on matching what the current launcher needs</li>
                  <li>Look for stacks that have matching fruits nearby</li>
                  <li>The first launcher (position 1) is ready to shoot</li>
                </ul>
              </section>
            </CardContent>
          </Card>
          </ErrorBoundary>
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
