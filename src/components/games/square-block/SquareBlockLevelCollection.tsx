'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  DesignedLevel,
  DifficultyTier,
  FlowZone,
  LevelMetrics,
  analyzePuzzle,
  calculateDifficultyScore,
  calculateFlowZone,
  getSawtoothPosition,
} from '@/types/squareBlock';
import { isReferenceFormat, importFromReferenceFormat, exportToReferenceFormat } from '@/lib/squareBlockExport';
import {
  GridCoord,
  gridKey,
  createRectangularGrid,
  gridToPixel,
  getGridBounds,
} from '@/lib/squareGrid';
import {
  Layers,
  Download,
  Upload,
  Trash2,
  Edit,
  Play,
  Copy,
  ChevronUp,
  ChevronDown,
  Search,
  Grid3X3,
  List,
} from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

interface SquareBlockLevelCollectionProps {
  levels: DesignedLevel[];
  onLevelsChange: (levels: DesignedLevel[]) => void;
  onEditLevel: (level: DesignedLevel) => void;
  onPlayLevel: (level: DesignedLevel) => void;
}

// ============================================================================
// Constants
// ============================================================================

const STORAGE_KEY = 'square-block-level-collection';
const MAX_LEVELS = 100;

const DIFFICULTY_BADGE_COLORS: Record<DifficultyTier, string> = {
  easy: 'bg-green-500/20 text-green-400 border-green-500/50',
  medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
  hard: 'bg-orange-500/20 text-orange-400 border-orange-500/50',
  superHard: 'bg-red-500/20 text-red-400 border-red-500/50',
};

const FLOW_ZONE_COLORS: Record<FlowZone, string> = {
  flow: 'text-green-400',
  boredom: 'text-cyan-400',
  frustration: 'text-orange-400',
};

// ============================================================================
// Hook for localStorage persistence
// ============================================================================

export function useLevelCollection() {
  const [levels, setLevels] = useState<DesignedLevel[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setLevels(parsed);
        }
      }
    } catch (e) {
      console.error('Failed to load level collection:', e);
    }
    setIsLoaded(true);
  }, []);

  // Save to localStorage when levels change
  useEffect(() => {
    if (isLoaded) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(levels));
      } catch (e) {
        console.error('Failed to save level collection:', e);
      }
    }
  }, [levels, isLoaded]);

  const addLevel = useCallback((level: DesignedLevel) => {
    setLevels((prev) => {
      if (prev.length >= MAX_LEVELS) {
        return prev;
      }
      const maxNum = prev.reduce((max, l) => Math.max(max, l.levelNumber), 0);
      const newLevel = { ...level, levelNumber: maxNum + 1 };
      return [...prev, newLevel];
    });
  }, []);

  const updateLevel = useCallback((id: string, updates: Partial<DesignedLevel>) => {
    setLevels((prev) =>
      prev.map((l) => (l.id === id ? { ...l, ...updates } : l))
    );
  }, []);

  const deleteLevel = useCallback((id: string) => {
    setLevels((prev) => {
      const filtered = prev.filter((l) => l.id !== id);
      return filtered.map((l, i) => ({ ...l, levelNumber: i + 1 }));
    });
  }, []);

  const duplicateLevel = useCallback((level: DesignedLevel) => {
    setLevels((prev) => {
      if (prev.length >= MAX_LEVELS) return prev;
      const newLevel: DesignedLevel = {
        ...level,
        id: `level-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: `${level.name} (Copy)`,
        levelNumber: prev.length + 1,
        createdAt: Date.now(),
      };
      return [...prev, newLevel];
    });
  }, []);

  const moveLevel = useCallback((id: string, direction: 'up' | 'down') => {
    setLevels((prev) => {
      const index = prev.findIndex((l) => l.id === id);
      if (index === -1) return prev;
      if (direction === 'up' && index === 0) return prev;
      if (direction === 'down' && index === prev.length - 1) return prev;

      const newLevels = [...prev];
      const swapIndex = direction === 'up' ? index - 1 : index + 1;
      [newLevels[index], newLevels[swapIndex]] = [newLevels[swapIndex], newLevels[index]];

      return newLevels.map((l, i) => ({ ...l, levelNumber: i + 1 }));
    });
  }, []);

  const clearAll = useCallback(() => {
    setLevels([]);
  }, []);

  const importLevels = useCallback((importedLevels: DesignedLevel[]) => {
    setLevels(importedLevels.slice(0, MAX_LEVELS).map((l, i) => ({
      ...l,
      levelNumber: i + 1,
    })));
  }, []);

  return {
    levels,
    setLevels,
    isLoaded,
    addLevel,
    updateLevel,
    deleteLevel,
    duplicateLevel,
    moveLevel,
    clearAll,
    importLevels,
  };
}

// ============================================================================
// Mini Level Preview Component
// ============================================================================

interface MiniLevelPreviewProps {
  level: DesignedLevel;
  size?: number;
}

function MiniLevelPreview({ level, size = 60 }: MiniLevelPreviewProps) {
  const cellSize = size / Math.max(level.rows, level.cols);
  const gridCoords = useMemo(() => createRectangularGrid(level.rows, level.cols), [level.rows, level.cols]);

  const { viewBox, origin } = useMemo(() => {
    const bounds = getGridBounds(level.rows, level.cols, cellSize);
    const padding = 2;
    const w = bounds.width + padding * 2;
    const h = bounds.height + padding * 2;
    return {
      viewBox: `0 0 ${w} ${h}`,
      origin: { x: padding, y: padding },
    };
  }, [level.rows, level.cols, cellSize]);

  const blockKeys = new Set(level.blocks.map((b) => gridKey(b.coord)));
  const holeKeys = new Set((level.holes || []).map((h) => gridKey(h)));

  return (
    <svg viewBox={viewBox} width={size} height={size} className="shrink-0">
      {gridCoords.map((coord) => {
        const key = gridKey(coord);
        const pixel = gridToPixel(coord, cellSize, origin);
        const hasBlock = blockKeys.has(key);
        const hasHole = holeKeys.has(key);

        let fill = 'rgba(255, 255, 255, 0.05)';
        if (hasHole) fill = 'rgba(0, 0, 0, 0.8)';
        else if (hasBlock) {
          const block = level.blocks.find((b) => gridKey(b.coord) === key);
          fill = block?.color || '#06b6d4';
        }

        return (
          <rect
            key={key}
            x={pixel.x - cellSize / 2 + 1}
            y={pixel.y - cellSize / 2 + 1}
            width={cellSize - 2}
            height={cellSize - 2}
            fill={fill}
            stroke="rgba(255, 255, 255, 0.1)"
            strokeWidth={0.5}
            rx={1}
          />
        );
      })}
    </svg>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function SquareBlockLevelCollection({
  levels,
  onLevelsChange,
  onEditLevel,
  onPlayLevel,
}: SquareBlockLevelCollectionProps) {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');

  // Filter levels by search
  const filteredLevels = useMemo(() => {
    if (!searchQuery.trim()) return levels;
    const query = searchQuery.toLowerCase();
    return levels.filter(
      (l) =>
        l.name.toLowerCase().includes(query) ||
        l.levelNumber.toString().includes(query)
    );
  }, [levels, searchQuery]);

  // Export single level as reference format JSON
  const handleExportLevel = (level: DesignedLevel) => {
    const referenceFormat = exportToReferenceFormat({
      rows: level.rows,
      cols: level.cols,
      blocks: level.blocks,
    });
    const dataStr = JSON.stringify(referenceFormat, null, 4);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `grid_Level${level.levelNumber}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export all levels as reference format JSON array
  const handleExportAll = () => {
    const referenceLevels = levels.map(level => exportToReferenceFormat({
      rows: level.rows,
      cols: level.cols,
      blocks: level.blocks,
    }));
    const dataStr = JSON.stringify(referenceLevels, null, 4);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `square-block-collection-${levels.length}-levels.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Helper function to create a DesignedLevel from reference format data
  const createDesignedLevelFromReference = (levelData: { rows: number; cols: number; blocks: typeof levels[0]['blocks'] }, levelNumber: number): DesignedLevel => {
    // Create block map for analysis
    const blockMap = new Map();
    for (const block of levelData.blocks) {
      blockMap.set(gridKey(block.coord), block);
    }

    // Analyze the puzzle
    const analysis = analyzePuzzle(blockMap, new Set(), levelData.rows, levelData.cols);
    const breakdown = analysis.solvable ? calculateDifficultyScore(analysis) : null;
    const sawtoothPosition = getSawtoothPosition(levelNumber);
    const flowZone = breakdown ? calculateFlowZone(breakdown.tier, levelNumber) : 'flow';
    const lockedCount = levelData.blocks.filter(b => b.locked).length;

    const metrics: LevelMetrics = {
      cellCount: levelData.blocks.length,
      holeCount: 0,
      lockedCount,
      gridSize: levelData.rows * levelData.cols,
      density: analysis?.density ?? 0,
      initialClearability: analysis?.initialClearability ?? 0,
      solutionCount: analysis?.solutionCount ?? 0,
      avgBranchingFactor: analysis?.avgBranchingFactor ?? 0,
      forcedMoveRatio: analysis?.forcedMoveRatio ?? 0,
      solutionDepth: analysis?.solutionDepth ?? 0,
      difficultyScore: breakdown?.score ?? 0,
      difficulty: breakdown?.tier ?? 'easy',
      flowZone,
      sawtoothPosition,
    };

    return {
      id: `level-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: `Level ${levelNumber}`,
      levelNumber,
      rows: levelData.rows,
      cols: levelData.cols,
      blocks: levelData.blocks,
      gameMode: 'classic',
      metrics,
      createdAt: Date.now(),
    };
  };

  // Import collection from JSON (handles both reference format and internal format)
  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const imported = JSON.parse(event.target?.result as string);

            // Check if it's a single reference format level (has cells array)
            if (isReferenceFormat(imported)) {
              const levelData = importFromReferenceFormat(imported);
              const levelNumber = levels.length + 1;
              const newLevel = createDesignedLevelFromReference(levelData, levelNumber);
              onLevelsChange([...levels, newLevel]);
              return;
            }

            // Check if it's an array of reference format levels
            if (Array.isArray(imported) && imported.length > 0 && isReferenceFormat(imported[0])) {
              const newLevels: DesignedLevel[] = [];
              for (let i = 0; i < Math.min(imported.length, MAX_LEVELS); i++) {
                const levelData = importFromReferenceFormat(imported[i]);
                const levelNumber = levels.length + i + 1;
                newLevels.push(createDesignedLevelFromReference(levelData, levelNumber));
              }
              onLevelsChange([...levels, ...newLevels]);
              return;
            }

            // Handle internal format (array of DesignedLevel)
            if (Array.isArray(imported)) {
              onLevelsChange(imported.slice(0, MAX_LEVELS).map((l: DesignedLevel, i: number) => ({
                ...l,
                levelNumber: i + 1,
              })));
            }
          } catch (e) {
            console.error('Failed to import levels:', e);
            alert('Failed to import level. Invalid format.');
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  const handleDelete = (id: string) => {
    const filtered = levels.filter((l) => l.id !== id);
    onLevelsChange(filtered.map((l, i) => ({ ...l, levelNumber: i + 1 })));
  };

  const handleDuplicate = (level: DesignedLevel) => {
    if (levels.length >= MAX_LEVELS) return;
    const newLevel: DesignedLevel = {
      ...level,
      id: `level-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: `${level.name} (Copy)`,
      levelNumber: levels.length + 1,
      createdAt: Date.now(),
    };
    onLevelsChange([...levels, newLevel]);
  };

  const handleMove = (id: string, direction: 'up' | 'down') => {
    const index = levels.findIndex((l) => l.id === id);
    if (index === -1) return;
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === levels.length - 1) return;

    const newLevels = [...levels];
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    [newLevels[index], newLevels[swapIndex]] = [newLevels[swapIndex], newLevels[index]];
    onLevelsChange(newLevels.map((l, i) => ({ ...l, levelNumber: i + 1 })));
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5" />
              Level Collection
            </CardTitle>
            <CardDescription>
              {levels.length} / {MAX_LEVELS} levels designed
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}>
              {viewMode === 'grid' ? <List className="h-4 w-4" /> : <Grid3X3 className="h-4 w-4" />}
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportAll} disabled={levels.length === 0} title="Export all levels">
              <Download className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={handleImport}>
              <Upload className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search levels..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8"
          />
        </div>

        {/* Level Stats Summary */}
        {levels.length > 0 && (
          <div className="flex items-center gap-4 text-sm">
            <span className="text-muted-foreground">Levels:</span>
            <div className="flex items-center gap-3">
              <span className="text-green-400 font-medium">
                {levels.filter((l) => l.metrics.difficulty === 'easy').length} <span className="text-muted-foreground font-normal">easy</span>
              </span>
              <span className="text-yellow-400 font-medium">
                {levels.filter((l) => l.metrics.difficulty === 'medium').length} <span className="text-muted-foreground font-normal">med</span>
              </span>
              <span className="text-orange-400 font-medium">
                {levels.filter((l) => l.metrics.difficulty === 'hard').length} <span className="text-muted-foreground font-normal">hard</span>
              </span>
              <span className="text-red-400 font-medium">
                {levels.filter((l) => l.metrics.difficulty === 'superHard').length} <span className="text-muted-foreground font-normal">super</span>
              </span>
            </div>
          </div>
        )}

        {/* Level Grid/List */}
        {filteredLevels.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            {levels.length === 0
              ? 'No levels yet. Design and add your first level!'
              : 'No levels match your search.'}
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-2 gap-2 max-h-[500px] overflow-y-auto">
            {filteredLevels.map((level) => {
              const tierColors = {
                easy: { border: 'border-green-500/50', text: 'text-green-400' },
                medium: { border: 'border-yellow-500/50', text: 'text-yellow-400' },
                hard: { border: 'border-orange-500/50', text: 'text-orange-400' },
                superHard: { border: 'border-red-500/50', text: 'text-red-400' },
              };
              const colors = tierColors[level.metrics.difficulty];

              return (
                <div
                  key={level.id}
                  className={`relative overflow-hidden rounded-lg border ${colors.border} bg-card hover:bg-accent/50 transition-colors cursor-pointer group`}
                  onClick={() => onEditLevel(level)}
                >
                  <div className="flex gap-2 p-2">
                    {/* Preview with level number overlay */}
                    <div className="relative shrink-0">
                      <MiniLevelPreview level={level} size={60} />
                      <div className="absolute top-0 left-0 bg-black/80 text-white text-[9px] font-bold px-1 py-0.5 rounded-br">
                        {level.levelNumber}
                      </div>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0 py-0.5">
                      <div className="flex items-baseline gap-1">
                        <span className={`text-xl font-bold ${colors.text}`}>{level.metrics.difficultyScore}</span>
                        <span className="text-[10px] text-muted-foreground truncate">
                          {level.metrics.difficulty === 'superHard' ? 's.hard' : level.metrics.difficulty}
                        </span>
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate">
                        {level.rows}×{level.cols} · {level.metrics.cellCount}b
                      </div>
                    </div>
                  </div>

                  {/* Hover actions bar */}
                  <div className="absolute bottom-0 left-0 right-0 bg-black/90 flex justify-center gap-2 py-1.5 translate-y-full group-hover:translate-y-0 transition-transform">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-white hover:bg-white/20"
                      onClick={(e) => { e.stopPropagation(); onPlayLevel(level); }}
                    >
                      <Play className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-white hover:bg-white/20"
                      onClick={(e) => { e.stopPropagation(); handleExportLevel(level); }}
                    >
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-red-400 hover:bg-red-500/20"
                      onClick={(e) => { e.stopPropagation(); handleDelete(level.id); }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {filteredLevels.map((level) => {
              const tierColors = {
                easy: { border: 'border-green-500/50', text: 'text-green-400' },
                medium: { border: 'border-yellow-500/50', text: 'text-yellow-400' },
                hard: { border: 'border-orange-500/50', text: 'text-orange-400' },
                superHard: { border: 'border-red-500/50', text: 'text-red-400' },
              };
              const colors = tierColors[level.metrics.difficulty];
              return (
                <div
                  key={level.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border ${colors.border} bg-card hover:bg-accent/50 transition-colors cursor-pointer`}
                  onClick={() => onEditLevel(level)}
                >
                  {/* Level number */}
                  <span className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm font-medium shrink-0">
                    {level.levelNumber}
                  </span>

                  {/* Preview */}
                  <div className="shrink-0">
                    <MiniLevelPreview level={level} size={50} />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0 text-sm">
                    <div className="text-muted-foreground">
                      {level.rows}×{level.cols} · {level.metrics.cellCount} blocks
                    </div>
                  </div>

                  {/* Score */}
                  <div className="text-right shrink-0">
                    <span className={`text-xl font-bold ${colors.text}`}>
                      {level.metrics.difficultyScore}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={(e) => { e.stopPropagation(); handleMove(level.id, 'up'); }}>
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={(e) => { e.stopPropagation(); handleMove(level.id, 'down'); }}>
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={(e) => { e.stopPropagation(); onPlayLevel(level); }}>
                      <Play className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={(e) => { e.stopPropagation(); handleExportLevel(level); }}>
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive" onClick={(e) => { e.stopPropagation(); handleDelete(level.id); }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
