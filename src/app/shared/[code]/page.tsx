'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { getSharedCollection, incrementViewCount } from '@/lib/sharing/sharingService';
import { DbSharedCollection, DbLevelCollection, DbLevel, GameType } from '@/lib/supabase/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Loader2,
  ArrowLeft,
  Download,
  Eye,
  Calendar,
  Layers,
  Gamepad2,
  Copy,
  Check,
  ExternalLink,
} from 'lucide-react';

// Game type display names
const GAME_TYPE_NAMES: Record<GameType, string> = {
  'fruit-match': 'Fruit Match',
  'hexa-block': 'Hexa Block',
  'square-block': 'Square Block',
};

// Fruit colors for preview (simplified)
const FRUIT_COLORS: Record<string, string> = {
  blueberry: '#4C9EF2',
  orange: '#F99D00',
  strawberry: '#DF4624',
  dragonfruit: '#DE4C7E',
  banana: '#F3DE00',
  apple: '#90CA00',
  plum: '#8E68E0',
  pear: '#FFFBF7',
  blackberry: '#4C4343',
};

interface LevelData {
  id: string;
  name: string;
  levelNumber: number;
  pixelArt?: Array<{ row: number; col: number; fruitType: string }>;
  pixelArtWidth?: number;
  pixelArtHeight?: number;
  metrics?: {
    difficultyScore: number;
    difficulty: string;
    totalPixels: number;
  };
}

// Mini level preview component
function LevelPreview({ level }: { level: LevelData }) {
  const size = 60;
  const width = level.pixelArtWidth || 8;
  const height = level.pixelArtHeight || 8;
  const cellSize = Math.max(3, Math.floor(size / Math.max(width, height)));

  const cellMap = useMemo(() => {
    const map = new Map<string, { fruitType: string }>();
    if (level.pixelArt) {
      for (const cell of level.pixelArt) {
        map.set(`${cell.row},${cell.col}`, cell);
      }
    }
    return map;
  }, [level.pixelArt]);

  if (!level.pixelArt || level.pixelArt.length === 0) {
    return (
      <div
        className="shrink-0 bg-muted/30 rounded flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        <Gamepad2 className="h-6 w-6 text-muted-foreground" />
      </div>
    );
  }

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      {Array.from({ length: height }).map((_, row) =>
        Array.from({ length: width }).map((_, col) => {
          const key = `${row},${col}`;
          const cell = cellMap.get(key);
          return (
            <rect
              key={key}
              x={col * cellSize + 1}
              y={row * cellSize + 1}
              width={cellSize - 2}
              height={cellSize - 2}
              fill={cell ? FRUIT_COLORS[cell.fruitType] || '#666' : 'rgba(255, 255, 255, 0.05)'}
              stroke="rgba(255, 255, 255, 0.1)"
              strokeWidth={0.5}
              rx={1}
            />
          );
        })
      )}
    </svg>
  );
}

export default function SharedCollectionPage() {
  const params = useParams();
  const router = useRouter();
  const shareCode = params.code as string;

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [share, setShare] = useState<DbSharedCollection | null>(null);
  const [collection, setCollection] = useState<DbLevelCollection | null>(null);
  const [levels, setLevels] = useState<DbLevel[]>([]);
  const [isCopied, setIsCopied] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    async function loadSharedCollection() {
      setIsLoading(true);
      setError(null);

      const result = await getSharedCollection(shareCode);

      if (!result) {
        setError('This collection is not available or the link has expired.');
        setIsLoading(false);
        return;
      }

      setShare(result.share);
      setCollection(result.collection);
      setLevels(result.levels);
      setIsLoading(false);

      // Increment view count (fire and forget)
      incrementViewCount(shareCode);
    }

    loadSharedCollection();
  }, [shareCode]);

  const handleCopyLink = async () => {
    const url = window.location.href;
    await navigator.clipboard.writeText(url);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleExportAll = () => {
    if (levels.length === 0) return;

    setIsExporting(true);

    // Extract level data from DB format
    const exportData = levels.map((dbLevel) => dbLevel.level_data);

    const dataStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${share?.title || 'shared-collection'}-${levels.length}-levels.json`;
    a.click();
    URL.revokeObjectURL(url);

    setIsExporting(false);
  };

  const handleOpenGame = () => {
    if (!collection || levels.length === 0) return;

    // Store shared levels in temp localStorage for the editor to pick up
    const levelData = levels.map((dbLevel) => dbLevel.level_data);
    localStorage.setItem('shared-import-pending', JSON.stringify({
      gameType: collection.game_type,
      levels: levelData,
    }));

    // Navigate to the editor with import flag
    router.push(`/game/${collection.game_type}?import=shared`);
  };

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !share || !collection) {
    return (
      <div className="container mx-auto max-w-2xl py-12">
        <Card>
          <CardHeader>
            <CardTitle>Collection Not Found</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/">
              <Button variant="outline" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Go to Home
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const gameType = collection.game_type as GameType;
  const gameName = GAME_TYPE_NAMES[gameType] || gameType;

  // Parse level data
  const parsedLevels: LevelData[] = levels.map((dbLevel) => {
    const levelData = dbLevel.level_data as Record<string, unknown>;
    return {
      id: (levelData.id as string) || `level-${dbLevel.level_number}`,
      name: (levelData.name as string) || `Level ${dbLevel.level_number}`,
      levelNumber: dbLevel.level_number,
      pixelArt: levelData.pixelArt as Array<{ row: number; col: number; fruitType: string }> | undefined,
      pixelArtWidth: levelData.pixelArtWidth as number | undefined,
      pixelArtHeight: levelData.pixelArtHeight as number | undefined,
      metrics: levelData.metrics as LevelData['metrics'] | undefined,
    };
  });

  return (
    <div className="container mx-auto max-w-4xl py-6 px-4 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            {share.title || 'Shared Collection'}
          </h1>
          <p className="text-muted-foreground">
            {share.description || `A ${gameName} level collection`}
          </p>
        </div>
        <Badge variant="secondary" className="text-sm">
          {gameName}
        </Badge>
      </div>

      {/* Stats */}
      <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Layers className="h-4 w-4" />
          {levels.length} levels
        </span>
        <span className="flex items-center gap-1.5">
          <Eye className="h-4 w-4" />
          {share.view_count} views
        </span>
        <span className="flex items-center gap-1.5">
          <Calendar className="h-4 w-4" />
          Shared {new Date(share.created_at).toLocaleDateString()}
        </span>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <Button onClick={handleExportAll} disabled={isExporting || levels.length === 0} className="gap-2">
          {isExporting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          Export All Levels
        </Button>
        <Button variant="outline" onClick={handleOpenGame} className="gap-2">
          <ExternalLink className="h-4 w-4" />
          Open in Editor
        </Button>
        <Button variant="outline" onClick={handleCopyLink} className="gap-2">
          {isCopied ? (
            <Check className="h-4 w-4 text-green-500" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
          Copy Link
        </Button>
      </div>

      {/* Level Grid */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Levels</CardTitle>
          <CardDescription>
            Preview the levels in this collection. Click "Export All Levels" to download them.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {parsedLevels.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              This collection is empty.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {parsedLevels.map((level) => {
                const difficulty = level.metrics?.difficulty || 'medium';
                const difficultyColors: Record<string, string> = {
                  trivial: 'border-gray-500/50',
                  easy: 'border-green-500/50',
                  medium: 'border-yellow-500/50',
                  hard: 'border-orange-500/50',
                  expert: 'border-red-500/50',
                  nightmare: 'border-purple-500/50',
                };
                const borderColor = difficultyColors[difficulty] || 'border-muted';

                return (
                  <div
                    key={level.id || level.levelNumber}
                    className={`p-3 rounded-lg border ${borderColor} bg-card/50 space-y-2`}
                  >
                    <div className="flex items-center gap-2">
                      <LevelPreview level={level} />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">
                          Level {level.levelNumber}
                        </div>
                        <div className="text-xs text-muted-foreground capitalize">
                          {difficulty}
                        </div>
                        {level.metrics && (
                          <div className="text-xs text-muted-foreground">
                            Score: {level.metrics.difficultyScore}
                          </div>
                        )}
                      </div>
                    </div>
                    {level.pixelArt && (
                      <div className="text-xs text-muted-foreground">
                        {level.pixelArtWidth}x{level.pixelArtHeight} • {level.metrics?.totalPixels || level.pixelArt.length}px
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Footer */}
      <div className="text-center text-sm text-muted-foreground py-4">
        <p>
          Created with{' '}
          <Link href="/" className="text-primary hover:underline">
            LevelForge
          </Link>
        </p>
      </div>
    </div>
  );
}
