'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import {
  DesignedFruitMatchLevel,
  FruitMatchLevel,
  PixelCell,
  FRUIT_COLORS,
  FRUIT_EMOJI,
  FruitType,
  DifficultyTier,
} from '@/types/fruitMatch';
import { pixelKey } from '@/lib/fruitMatchUtils';
import {
  Layers,
  Download,
  Upload,
  Trash2,
  Pencil,
  Play,
  Search,
  Grid3X3,
  List,
  Files,
  GripVertical,
  Settings,
  RotateCcw,
} from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

interface FruitMatchLevelCollectionProps {
  levels: DesignedFruitMatchLevel[];
  onLevelsChange: (levels: DesignedFruitMatchLevel[]) => void;
  onEditLevel: (level: DesignedFruitMatchLevel) => void;
  onPlayLevel: (level: DesignedFruitMatchLevel) => void;
  sawtoothConfig?: SawtoothConfig;
  onSawtoothConfigChange?: (config: SawtoothConfig) => void;
}

// Flow zone types
type FlowZone = 'flow' | 'boredom' | 'frustration';

// Sawtooth configuration
interface SawtoothConfig {
  // Difficulty tier thresholds (score ranges) - 6 tiers
  trivialMax: number;   // 0 to trivialMax = Trivial
  easyMax: number;      // trivialMax+1 to easyMax = Easy
  mediumMax: number;    // easyMax+1 to mediumMax = Medium
  hardMax: number;      // mediumMax+1 to hardMax = Hard
  expertMax: number;    // hardMax+1 to expertMax = Expert
  // expertMax+1 to 100 = Nightmare

  // Expected difficulty for each sawtooth position (1-10)
  expectedPattern: DifficultyTier[];

  // Curve simulation parameters
  totalLevels: number;         // Total levels to display in curve (10-500)
  skillGrowthRate: number;     // How fast skill grows per level (0.05-0.30)
  baselineIncrease: number;    // How much difficulty increases per cycle (0-1.0)
}

const DEFAULT_SAWTOOTH_CONFIG: SawtoothConfig = {
  trivialMax: 19,
  easyMax: 34,
  mediumMax: 49,
  hardMax: 64,
  expertMax: 79,
  expectedPattern: ['trivial', 'easy', 'easy', 'medium', 'medium', 'hard', 'hard', 'expert', 'expert', 'nightmare'],
  totalLevels: 100,
  skillGrowthRate: 0.15,
  baselineIncrease: 0.3,
};

// Export the config type and default for use in parent components
export type { SawtoothConfig };
export { DEFAULT_SAWTOOTH_CONFIG };

// ============================================================================
// Constants
// ============================================================================

const STORAGE_KEY = 'fruit-match-level-collection';
const MAX_LEVELS = 100;

const DIFFICULTY_BADGE_COLORS: Record<DifficultyTier, string> = {
  trivial: 'bg-gray-500/20 text-gray-400 border-gray-500/50',
  easy: 'bg-green-500/20 text-green-400 border-green-500/50',
  medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
  hard: 'bg-orange-500/20 text-orange-400 border-orange-500/50',
  expert: 'bg-red-500/20 text-red-400 border-red-500/50',
  nightmare: 'bg-purple-500/20 text-purple-400 border-purple-500/50',
};

const FLOW_ZONE_COLORS: Record<FlowZone, string> = {
  flow: 'text-green-400',
  boredom: 'text-cyan-400',
  frustration: 'text-orange-400',
};

// ============================================================================
// Hook for localStorage persistence
// ============================================================================

export function useFruitMatchLevelCollection() {
  const [levels, setLevels] = useState<DesignedFruitMatchLevel[]>([]);
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
      console.error('Failed to load fruit match level collection:', e);
    }
    setIsLoaded(true);
  }, []);

  // Save to localStorage when levels change
  useEffect(() => {
    if (isLoaded) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(levels));
      } catch (e) {
        console.error('Failed to save fruit match level collection:', e);
      }
    }
  }, [levels, isLoaded]);

  const addLevel = useCallback((level: DesignedFruitMatchLevel) => {
    setLevels((prev) => {
      if (prev.length >= MAX_LEVELS) return prev;
      const maxNum = prev.reduce((max, l) => Math.max(max, l.levelNumber), 0);
      const newLevel = { ...level, levelNumber: maxNum + 1 };
      return [...prev, newLevel];
    });
  }, []);

  const updateLevel = useCallback((id: string, updates: Partial<DesignedFruitMatchLevel>) => {
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

  const importLevels = useCallback((importedLevels: DesignedFruitMatchLevel[]) => {
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
    moveLevel,
    clearAll,
    importLevels,
  };
}

// ============================================================================
// Mini Level Preview Component
// ============================================================================

interface MiniLevelPreviewProps {
  level: DesignedFruitMatchLevel;
  size?: number;
}

function MiniLevelPreview({ level, size = 60 }: MiniLevelPreviewProps) {
  const cellSize = Math.max(3, Math.floor(size / Math.max(level.pixelArtWidth, level.pixelArtHeight)));

  // Create a lookup for quick access
  const cellMap = useMemo(() => {
    const map = new Map<string, PixelCell>();
    for (const cell of level.pixelArt) {
      map.set(pixelKey(cell.row, cell.col), cell);
    }
    return map;
  }, [level.pixelArt]);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="shrink-0"
    >
      {Array.from({ length: level.pixelArtHeight }).map((_, row) =>
        Array.from({ length: level.pixelArtWidth }).map((_, col) => {
          const key = pixelKey(row, col);
          const cell = cellMap.get(key);

          return (
            <rect
              key={key}
              x={col * cellSize + 1}
              y={row * cellSize + 1}
              width={cellSize - 2}
              height={cellSize - 2}
              fill={cell ? FRUIT_COLORS[cell.fruitType] : 'rgba(255, 255, 255, 0.05)'}
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

// ============================================================================
// Main Component
// ============================================================================

export function FruitMatchLevelCollection({
  levels,
  onLevelsChange,
  onEditLevel,
  onPlayLevel,
  sawtoothConfig: externalConfig,
  onSawtoothConfigChange,
}: FruitMatchLevelCollectionProps) {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [internalConfig, setInternalConfig] = useState<SawtoothConfig>(DEFAULT_SAWTOOTH_CONFIG);

  // Use external config if provided, otherwise use internal state
  const sawtoothConfig = externalConfig ?? internalConfig;
  const setSawtoothConfig = (config: SawtoothConfig) => {
    if (onSawtoothConfigChange) {
      onSawtoothConfigChange(config);
    } else {
      setInternalConfig(config);
    }
  };

  // Helper to get tier from score using config
  const getTierFromScore = useCallback((score: number): DifficultyTier => {
    if (score <= sawtoothConfig.trivialMax) return 'trivial';
    if (score <= sawtoothConfig.easyMax) return 'easy';
    if (score <= sawtoothConfig.mediumMax) return 'medium';
    if (score <= sawtoothConfig.hardMax) return 'hard';
    if (score <= sawtoothConfig.expertMax) return 'expert';
    return 'nightmare';
  }, [sawtoothConfig]);

  // Helper to get expected difficulty from position using config
  const getExpectedFromPosition = useCallback((levelNumber: number): DifficultyTier => {
    const position = ((levelNumber - 1) % 10);
    return sawtoothConfig.expectedPattern[position];
  }, [sawtoothConfig]);

  // Calculate flow zone using config
  const getFlowZone = useCallback((score: number, levelNumber: number): FlowZone => {
    const actual = getTierFromScore(score);
    const expected = getExpectedFromPosition(levelNumber);

    if (actual === expected) return 'flow';

    const rank: Record<DifficultyTier, number> = { trivial: 1, easy: 2, medium: 3, hard: 4, expert: 5, nightmare: 6 };
    return rank[actual] > rank[expected] ? 'frustration' : 'boredom';
  }, [getTierFromScore, getExpectedFromPosition]);

  // Reset config to defaults
  const resetConfig = () => setSawtoothConfig(DEFAULT_SAWTOOTH_CONFIG);

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

  // Export single level as JSON
  const handleExportLevel = (level: DesignedFruitMatchLevel) => {
    const dataStr = JSON.stringify(level, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fruit-match-level-${level.levelNumber}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export all levels as single JSON file
  const handleExportAll = () => {
    const dataStr = JSON.stringify(levels, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fruit-match-collection-${levels.length}-levels.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export all levels as separate JSON files
  const handleExportAllSeparate = async () => {
    for (let i = 0; i < levels.length; i++) {
      const level = levels[i];
      const dataStr = JSON.stringify(level, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fruit-match-level-${level.levelNumber}.json`;
      a.click();
      URL.revokeObjectURL(url);
      // Small delay between downloads to prevent browser from blocking
      if (i < levels.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  };

  // Import collection from JSON (supports multiple file selection)
  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.multiple = true;
    input.onchange = async (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files || files.length === 0) return;

      const newLevels: DesignedFruitMatchLevel[] = [];
      let currentLevelNumber = levels.length + 1;

      for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
        const file = files[fileIndex];
        try {
          const content = await file.text();
          const imported = JSON.parse(content);

          // Check if it's a single level
          if (imported && !Array.isArray(imported) && imported.pixelArt) {
            const match = file.name.match(/level-(\d+)/i);
            const levelNumber = match ? parseInt(match[1], 10) : currentLevelNumber++;
            newLevels.push({ ...imported, levelNumber });
            continue;
          }

          // Handle array of levels
          if (Array.isArray(imported)) {
            for (const l of imported) {
              newLevels.push({
                ...l,
                levelNumber: currentLevelNumber++,
              });
            }
          }
        } catch (e) {
          console.error(`Failed to import ${file.name}:`, e);
        }
      }

      if (newLevels.length > 0) {
        // Sort by level number and reassign sequential numbers
        newLevels.sort((a, b) => a.levelNumber - b.levelNumber);
        const allLevels = [...levels, ...newLevels].slice(0, MAX_LEVELS);
        onLevelsChange(allLevels.map((l, i) => ({ ...l, levelNumber: i + 1 })));
      } else {
        alert('No valid levels found in selected files.');
      }
    };
    input.click();
  };

  const handleDelete = (id: string) => {
    const filtered = levels.filter((l) => l.id !== id);
    onLevelsChange(filtered.map((l, i) => ({ ...l, levelNumber: i + 1 })));
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

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedId && id !== draggedId) {
      setDragOverId(id);
    }
  };

  const handleDragLeave = () => {
    setDragOverId(null);
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null);
      setDragOverId(null);
      return;
    }

    const draggedIndex = levels.findIndex((l) => l.id === draggedId);
    const targetIndex = levels.findIndex((l) => l.id === targetId);

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedId(null);
      setDragOverId(null);
      return;
    }

    const newLevels = [...levels];
    const [draggedLevel] = newLevels.splice(draggedIndex, 1);
    newLevels.splice(targetIndex, 0, draggedLevel);
    onLevelsChange(newLevels.map((l, i) => ({ ...l, levelNumber: i + 1 })));

    setDraggedId(null);
    setDragOverId(null);
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverId(null);
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
            <Button variant="outline" size="sm" onClick={handleExportAllSeparate} disabled={levels.length === 0} title="Export as separate files">
              <Files className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportAll} disabled={levels.length === 0} title="Export all as single file">
              <Download className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={handleImport}>
              <Upload className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search and Settings Toggle */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search levels..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8"
            />
          </div>
          <Button
            variant={showSettings ? 'default' : 'outline'}
            size="icon"
            onClick={() => setShowSettings(!showSettings)}
            title="Sawtooth Settings"
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>

        {/* Sawtooth Configuration Panel */}
        {showSettings && (
          <div className="p-4 bg-muted/30 rounded-lg space-y-4 border border-muted">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Sawtooth Configuration</h3>
              <Button variant="ghost" size="sm" onClick={resetConfig}>
                <RotateCcw className="h-3.5 w-3.5 mr-1" />
                Reset
              </Button>
            </div>

            {/* Difficulty Tier Thresholds */}
            <div className="space-y-3">
              <h4 className="text-xs font-medium text-muted-foreground">Difficulty Tier Thresholds</h4>

              {/* Trivial Max */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-gray-400">Trivial (0 - {sawtoothConfig.trivialMax})</label>
                  <Input
                    type="number"
                    value={sawtoothConfig.trivialMax}
                    onChange={(e) => {
                      const v = Math.max(1, Math.min(sawtoothConfig.easyMax - 1, parseInt(e.target.value) || 0));
                      setSawtoothConfig({ ...sawtoothConfig, trivialMax: v });
                    }}
                    className="w-16 h-7 text-xs text-center"
                    min={1}
                    max={sawtoothConfig.easyMax - 1}
                  />
                </div>
                <Slider
                  value={[sawtoothConfig.trivialMax]}
                  onValueChange={([v]) => setSawtoothConfig({ ...sawtoothConfig, trivialMax: Math.min(v, sawtoothConfig.easyMax - 1) })}
                  min={1}
                  max={30}
                  step={1}
                  className="[&_[role=slider]]:bg-gray-500"
                />
              </div>

              {/* Easy Max */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-green-400">Easy ({sawtoothConfig.trivialMax + 1} - {sawtoothConfig.easyMax})</label>
                  <Input
                    type="number"
                    value={sawtoothConfig.easyMax}
                    onChange={(e) => {
                      const v = Math.max(sawtoothConfig.trivialMax + 1, Math.min(sawtoothConfig.mediumMax - 1, parseInt(e.target.value) || 0));
                      setSawtoothConfig({ ...sawtoothConfig, easyMax: v });
                    }}
                    className="w-16 h-7 text-xs text-center"
                    min={sawtoothConfig.trivialMax + 1}
                    max={sawtoothConfig.mediumMax - 1}
                  />
                </div>
                <Slider
                  value={[sawtoothConfig.easyMax]}
                  onValueChange={([v]) => setSawtoothConfig({ ...sawtoothConfig, easyMax: Math.max(sawtoothConfig.trivialMax + 1, Math.min(v, sawtoothConfig.mediumMax - 1)) })}
                  min={15}
                  max={45}
                  step={1}
                  className="[&_[role=slider]]:bg-green-500"
                />
              </div>

              {/* Medium Max */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-yellow-400">Medium ({sawtoothConfig.easyMax + 1} - {sawtoothConfig.mediumMax})</label>
                  <Input
                    type="number"
                    value={sawtoothConfig.mediumMax}
                    onChange={(e) => {
                      const v = Math.max(sawtoothConfig.easyMax + 1, Math.min(sawtoothConfig.hardMax - 1, parseInt(e.target.value) || 0));
                      setSawtoothConfig({ ...sawtoothConfig, mediumMax: v });
                    }}
                    className="w-16 h-7 text-xs text-center"
                    min={sawtoothConfig.easyMax + 1}
                    max={sawtoothConfig.hardMax - 1}
                  />
                </div>
                <Slider
                  value={[sawtoothConfig.mediumMax]}
                  onValueChange={([v]) => setSawtoothConfig({ ...sawtoothConfig, mediumMax: Math.max(sawtoothConfig.easyMax + 1, Math.min(v, sawtoothConfig.hardMax - 1)) })}
                  min={30}
                  max={60}
                  step={1}
                  className="[&_[role=slider]]:bg-yellow-500"
                />
              </div>

              {/* Hard Max */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-orange-400">Hard ({sawtoothConfig.mediumMax + 1} - {sawtoothConfig.hardMax})</label>
                  <Input
                    type="number"
                    value={sawtoothConfig.hardMax}
                    onChange={(e) => {
                      const v = Math.max(sawtoothConfig.mediumMax + 1, Math.min(sawtoothConfig.expertMax - 1, parseInt(e.target.value) || 0));
                      setSawtoothConfig({ ...sawtoothConfig, hardMax: v });
                    }}
                    className="w-16 h-7 text-xs text-center"
                    min={sawtoothConfig.mediumMax + 1}
                    max={sawtoothConfig.expertMax - 1}
                  />
                </div>
                <Slider
                  value={[sawtoothConfig.hardMax]}
                  onValueChange={([v]) => setSawtoothConfig({ ...sawtoothConfig, hardMax: Math.max(sawtoothConfig.mediumMax + 1, Math.min(v, sawtoothConfig.expertMax - 1)) })}
                  min={45}
                  max={75}
                  step={1}
                  className="[&_[role=slider]]:bg-orange-500"
                />
              </div>

              {/* Expert Max */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-red-400">Expert ({sawtoothConfig.hardMax + 1} - {sawtoothConfig.expertMax})</label>
                  <Input
                    type="number"
                    value={sawtoothConfig.expertMax}
                    onChange={(e) => {
                      const v = Math.max(sawtoothConfig.hardMax + 1, Math.min(99, parseInt(e.target.value) || 0));
                      setSawtoothConfig({ ...sawtoothConfig, expertMax: v });
                    }}
                    className="w-16 h-7 text-xs text-center"
                    min={sawtoothConfig.hardMax + 1}
                    max={99}
                  />
                </div>
                <Slider
                  value={[sawtoothConfig.expertMax]}
                  onValueChange={([v]) => setSawtoothConfig({ ...sawtoothConfig, expertMax: Math.max(sawtoothConfig.hardMax + 1, v) })}
                  min={60}
                  max={99}
                  step={1}
                  className="[&_[role=slider]]:bg-red-500"
                />
              </div>

              {/* Nightmare indicator */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-purple-400">Nightmare ({sawtoothConfig.expertMax + 1} - 100)</span>
              </div>
            </div>

            {/* Expected Pattern per Position */}
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-muted-foreground">Expected Difficulty Pattern (per 10-level cycle)</h4>
              <div className="grid grid-cols-10 gap-1">
                {sawtoothConfig.expectedPattern.map((tier, i) => {
                  const tierOptions: DifficultyTier[] = ['trivial', 'easy', 'medium', 'hard', 'expert', 'nightmare'];
                  const colors: Record<DifficultyTier, string> = {
                    trivial: 'bg-gray-500/20 border-gray-500 text-gray-400',
                    easy: 'bg-green-500/20 border-green-500 text-green-400',
                    medium: 'bg-yellow-500/20 border-yellow-500 text-yellow-400',
                    hard: 'bg-orange-500/20 border-orange-500 text-orange-400',
                    expert: 'bg-red-500/20 border-red-500 text-red-400',
                    nightmare: 'bg-purple-500/20 border-purple-500 text-purple-400',
                  };
                  const labels: Record<DifficultyTier, string> = { trivial: 'T', easy: 'E', medium: 'M', hard: 'H', expert: 'X', nightmare: 'N' };
                  return (
                    <div key={i} className="flex flex-col items-center gap-1">
                      <span className="text-[9px] text-muted-foreground">{i + 1}</span>
                      <button
                        className={`w-full aspect-square rounded border text-[10px] font-bold ${colors[tier]} hover:opacity-80`}
                        onClick={() => {
                          const currentIndex = tierOptions.indexOf(tier);
                          const nextIndex = (currentIndex + 1) % tierOptions.length;
                          const newPattern = [...sawtoothConfig.expectedPattern];
                          newPattern[i] = tierOptions[nextIndex];
                          setSawtoothConfig({ ...sawtoothConfig, expectedPattern: newPattern });
                        }}
                        title={`Position ${i + 1}: ${tier} (click to change)`}
                      >
                        {labels[tier]}
                      </button>
                    </div>
                  );
                })}
              </div>
              <p className="text-[10px] text-muted-foreground">Click each position to cycle through: Trivial → Easy → Medium → Hard → Expert → Nightmare</p>
            </div>

            {/* Curve Simulation Parameters */}
            <div className="space-y-3 pt-3 border-t border-muted">
              <h4 className="text-xs font-medium text-muted-foreground">Curve Simulation Parameters</h4>

              {/* Total Levels */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs">Total Levels</label>
                  <Input
                    type="number"
                    value={sawtoothConfig.totalLevels}
                    onChange={(e) => {
                      const v = Math.max(10, Math.min(500, parseInt(e.target.value) || 100));
                      setSawtoothConfig({ ...sawtoothConfig, totalLevels: v });
                    }}
                    className="w-20 h-7 text-xs text-center"
                    min={10}
                    max={500}
                    step={10}
                  />
                </div>
                <Slider
                  value={[sawtoothConfig.totalLevels]}
                  onValueChange={([v]) => setSawtoothConfig({ ...sawtoothConfig, totalLevels: v })}
                  min={10}
                  max={500}
                  step={10}
                />
              </div>

              {/* Skill Growth Rate */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs">Skill Growth Rate</label>
                  <Input
                    type="number"
                    value={sawtoothConfig.skillGrowthRate}
                    onChange={(e) => {
                      const v = Math.max(0.05, Math.min(0.30, parseFloat(e.target.value) || 0.15));
                      setSawtoothConfig({ ...sawtoothConfig, skillGrowthRate: v });
                    }}
                    className="w-20 h-7 text-xs text-center"
                    min={0.05}
                    max={0.30}
                    step={0.01}
                  />
                </div>
                <Slider
                  value={[sawtoothConfig.skillGrowthRate * 100]}
                  onValueChange={([v]) => setSawtoothConfig({ ...sawtoothConfig, skillGrowthRate: v / 100 })}
                  min={5}
                  max={30}
                  step={1}
                />
                <p className="text-[10px] text-muted-foreground">How quickly players improve. Lower = steeper learning curve.</p>
              </div>

              {/* Difficulty Baseline Increase */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs">Baseline Increase</label>
                  <Input
                    type="number"
                    value={sawtoothConfig.baselineIncrease}
                    onChange={(e) => {
                      const v = Math.max(0, Math.min(1.0, parseFloat(e.target.value) || 0.3));
                      setSawtoothConfig({ ...sawtoothConfig, baselineIncrease: v });
                    }}
                    className="w-20 h-7 text-xs text-center"
                    min={0}
                    max={1.0}
                    step={0.1}
                  />
                </div>
                <Slider
                  value={[sawtoothConfig.baselineIncrease * 10]}
                  onValueChange={([v]) => setSawtoothConfig({ ...sawtoothConfig, baselineIncrease: v / 10 })}
                  min={0}
                  max={10}
                  step={1}
                />
                <p className="text-[10px] text-muted-foreground">How much harder each 10-level cycle becomes.</p>
              </div>
            </div>
          </div>
        )}

        {/* Level Stats Summary */}
        {levels.length > 0 && (
          <div className="flex items-center gap-4 text-sm">
            <span className="text-muted-foreground">Levels:</span>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-gray-400 font-medium">
                {levels.filter((l) => getTierFromScore(l.metrics.difficultyScore) === 'trivial').length} <span className="text-muted-foreground font-normal text-xs">triv</span>
              </span>
              <span className="text-green-400 font-medium">
                {levels.filter((l) => getTierFromScore(l.metrics.difficultyScore) === 'easy').length} <span className="text-muted-foreground font-normal text-xs">easy</span>
              </span>
              <span className="text-yellow-400 font-medium">
                {levels.filter((l) => getTierFromScore(l.metrics.difficultyScore) === 'medium').length} <span className="text-muted-foreground font-normal text-xs">med</span>
              </span>
              <span className="text-orange-400 font-medium">
                {levels.filter((l) => getTierFromScore(l.metrics.difficultyScore) === 'hard').length} <span className="text-muted-foreground font-normal text-xs">hard</span>
              </span>
              <span className="text-red-400 font-medium">
                {levels.filter((l) => getTierFromScore(l.metrics.difficultyScore) === 'expert').length} <span className="text-muted-foreground font-normal text-xs">exp</span>
              </span>
              <span className="text-purple-400 font-medium">
                {levels.filter((l) => getTierFromScore(l.metrics.difficultyScore) === 'nightmare').length} <span className="text-muted-foreground font-normal text-xs">nite</span>
              </span>
            </div>
          </div>
        )}

        {/* Flow Zone Indicators */}
        {levels.length > 0 && (
          <div className="flex items-center gap-1 text-[9px] text-muted-foreground overflow-x-auto p-2 bg-muted/30 rounded">
            {levels.map((level, i) => {
              const expected = getExpectedFromPosition(i + 1);
              const actual = getTierFromScore(level.metrics.difficultyScore);
              const flowZone = getFlowZone(level.metrics.difficultyScore, i + 1);
              const color = flowZone === 'flow' ? 'bg-green-500/20 text-green-400' :
                           flowZone === 'boredom' ? 'bg-blue-500/20 text-blue-400' : 'bg-red-500/20 text-red-400';
              return (
                <div
                  key={level.id}
                  className={`px-1.5 py-0.5 rounded ${color} shrink-0`}
                  title={`Level ${i + 1}: Expected ${expected}, Actual ${actual} (${flowZone})`}
                >
                  {i + 1}
                </div>
              );
            })}
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
              const tier = getTierFromScore(level.metrics.difficultyScore);
              const tierColors: Record<DifficultyTier, { border: string; text: string }> = {
                trivial: { border: 'border-gray-500/50', text: 'text-gray-400' },
                easy: { border: 'border-green-500/50', text: 'text-green-400' },
                medium: { border: 'border-yellow-500/50', text: 'text-yellow-400' },
                hard: { border: 'border-orange-500/50', text: 'text-orange-400' },
                expert: { border: 'border-red-500/50', text: 'text-red-400' },
                nightmare: { border: 'border-purple-500/50', text: 'text-purple-400' },
              };
              const colors = tierColors[tier];

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
                          {tier}
                        </span>
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate">
                        {level.pixelArtWidth}x{level.pixelArtHeight} · {level.metrics.totalPixels}px
                      </div>
                    </div>
                  </div>

                  {/* Hover actions bar */}
                  <div className="absolute bottom-0 left-0 right-0 bg-black/90 flex justify-center gap-2 py-1.5 translate-y-full group-hover:translate-y-0 transition-transform">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-white hover:bg-white/20"
                      onClick={(e) => { e.stopPropagation(); onEditLevel(level); }}
                      title="Edit level"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-white hover:bg-white/20"
                      onClick={(e) => { e.stopPropagation(); onPlayLevel(level); }}
                      title="Play level"
                    >
                      <Play className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-white hover:bg-white/20"
                      onClick={(e) => { e.stopPropagation(); handleExportLevel(level); }}
                      title="Export level"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-red-400 hover:bg-red-500/20"
                      onClick={(e) => { e.stopPropagation(); handleDelete(level.id); }}
                      title="Delete level"
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
              const tier = getTierFromScore(level.metrics.difficultyScore);
              const tierColors: Record<DifficultyTier, { border: string; text: string }> = {
                trivial: { border: 'border-gray-500/50', text: 'text-gray-400' },
                easy: { border: 'border-green-500/50', text: 'text-green-400' },
                medium: { border: 'border-yellow-500/50', text: 'text-yellow-400' },
                hard: { border: 'border-orange-500/50', text: 'text-orange-400' },
                expert: { border: 'border-red-500/50', text: 'text-red-400' },
                nightmare: { border: 'border-purple-500/50', text: 'text-purple-400' },
              };
              const colors = tierColors[tier];
              const isDragging = draggedId === level.id;
              const isDragOver = dragOverId === level.id;
              return (
                <div
                  key={level.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, level.id)}
                  onDragOver={(e) => handleDragOver(e, level.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, level.id)}
                  onDragEnd={handleDragEnd}
                  className={`flex items-center gap-3 p-3 rounded-lg border ${colors.border} bg-card hover:bg-accent/50 transition-all cursor-pointer ${isDragging ? 'opacity-50 scale-95' : ''} ${isDragOver ? 'border-primary border-2 bg-accent/70' : ''}`}
                  onClick={() => onEditLevel(level)}
                >
                  {/* Drag handle */}
                  <div
                    className="cursor-grab active:cursor-grabbing shrink-0 text-muted-foreground hover:text-foreground"
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <GripVertical className="h-5 w-5" />
                  </div>

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
                      {level.pixelArtWidth}x{level.pixelArtHeight} · {level.metrics.totalPixels} pixels
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
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={(e) => { e.stopPropagation(); onEditLevel(level); }} title="Edit level">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={(e) => { e.stopPropagation(); onPlayLevel(level); }} title="Play level">
                      <Play className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={(e) => { e.stopPropagation(); handleExportLevel(level); }} title="Export level">
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive" onClick={(e) => { e.stopPropagation(); handleDelete(level.id); }} title="Delete level">
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
