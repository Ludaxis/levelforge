'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  DesignedFruitMatchLevel,
  FruitMatchLevel,
  PixelCell,
  FRUIT_COLORS,
  FRUIT_EMOJI,
  FruitType,
  DifficultyTier,
} from '@/types/fruitMatch';
import { pixelKey, migrateFruitType } from '@/lib/fruitMatchUtils';
import { calculateStudioDifficulty } from '@/lib/studioGameLogic';
import {
  exportToReferenceFormat,
  exportStudioLevel,
  importFromReferenceFormat,
  isReferenceFormat,
  ReferenceLevel,
  StudioExportLevel,
  DIFFICULTY_TO_NUMBER,
  NUMBER_TO_DIFFICULTY,
  FRUIT_TO_COLOR_TYPE,
  COLOR_TYPE_TO_FRUIT,
  COLOR_TYPE_TO_HEX,
} from '@/lib/juicyBlastExport';
import { useSyncedLevelCollection } from '@/lib/storage/useSyncedLevelCollection';
import { SyncState } from '@/lib/storage/types';
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
  RefreshCw,
  Cloud,
  CloudOff,
  Share2,
} from 'lucide-react';
import { useAuth } from '@/lib/auth/AuthContext';
import { ShareModal } from '@/components/sharing/ShareModal';
import { AuthModal } from '@/components/auth/AuthModal';
import { createSupabaseStorageProvider } from '@/lib/storage/supabase';

// ============================================================================
// Types
// ============================================================================

interface FruitMatchLevelCollectionProps {
  levels: DesignedFruitMatchLevel[];
  onLevelsChange: (levels: DesignedFruitMatchLevel[]) => void;
  onEditLevel: (level: DesignedFruitMatchLevel) => void;
  onPlayLevel: (level: DesignedFruitMatchLevel) => void;
  syncState?: SyncState;
  onForceSync?: () => Promise<void>;
}

// ============================================================================
// Constants
// ============================================================================

const STORAGE_KEY = 'juicy-blast-level-collection';
const MAX_LEVELS = 10000;
const PAGE_SIZE = 50;

const DIFFICULTY_BADGE_COLORS: Record<DifficultyTier, string> = {
  trivial: 'bg-gray-500/20 text-gray-400 border-gray-500/50',
  easy: 'bg-green-500/20 text-green-400 border-green-500/50',
  medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
  hard: 'bg-orange-500/20 text-orange-400 border-orange-500/50',
  expert: 'bg-red-500/20 text-red-400 border-red-500/50',
  nightmare: 'bg-purple-500/20 text-purple-400 border-purple-500/50',
};


// ============================================================================
// Level Migration Helper
// ============================================================================

/**
 * Migrate fruit types in a level for backward compatibility
 * Converts old fruit type names (cherry, grape, etc.) to new ones
 */
function migrateLevel(level: DesignedFruitMatchLevel): DesignedFruitMatchLevel {
  return {
    ...level,
    // Migrate pixel art fruit types
    pixelArt: level.pixelArt.map(cell => ({
      ...cell,
      fruitType: migrateFruitType(cell.fruitType),
    })),
    // Migrate metrics fruit distribution keys
    metrics: level.metrics ? {
      ...level.metrics,
      fruitDistribution: Object.fromEntries(
        Object.entries(level.metrics.fruitDistribution || {}).map(([key, value]) => [
          migrateFruitType(key),
          value,
        ])
      ) as Record<FruitType, number>,
    } : level.metrics,
    // Migrate launcher order config if present
    launcherOrderConfig: level.launcherOrderConfig ? {
      ...level.launcherOrderConfig,
      groups: level.launcherOrderConfig.groups?.map(g => ({
        ...g,
        colorTypes: g.colorTypes.map(ct => migrateFruitType(ct)),
      })) || [],
      launchers: level.launcherOrderConfig.launchers?.map(l => ({
        ...l,
        fruitType: migrateFruitType(l.fruitType),
      })) || [],
    } : undefined,
  };
}

// ============================================================================
// Hook for localStorage persistence
// ============================================================================

export function useFruitMatchLevelCollection() {
  const collection = useSyncedLevelCollection<DesignedFruitMatchLevel>({
    gameType: 'fruit-match',
    localStorageKey: STORAGE_KEY,
    maxLevels: MAX_LEVELS,
    migrate: migrateLevel,
  });

  return collection;
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
// Sync Status Indicator Component
// ============================================================================

function SyncStatusIndicator({ syncState, onForceSync }: { syncState: SyncState; onForceSync?: () => Promise<void> }) {
  const statusConfig = {
    synced: { color: 'bg-green-500', label: 'Synced', icon: Cloud },
    pending: { color: 'bg-yellow-500', label: 'Syncing...', icon: RefreshCw },
    offline: { color: 'bg-gray-500', label: 'Offline', icon: CloudOff },
    error: { color: 'bg-red-500', label: 'Error', icon: CloudOff },
    conflict: { color: 'bg-orange-500', label: 'Conflict', icon: Cloud },
  };

  const config = statusConfig[syncState.status];
  const Icon = config.icon;

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={onForceSync}
        className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground transition-colors"
        title={`${config.label}${syncState.lastSynced ? ` - Last synced: ${syncState.lastSynced.toLocaleTimeString()}` : ''}${syncState.error ? ` - ${syncState.error}` : ''}`}
      >
        <span className={`w-2 h-2 rounded-full ${config.color} ${syncState.status === 'pending' ? 'animate-pulse' : ''}`} />
        <Icon className={`h-3.5 w-3.5 ${syncState.status === 'pending' ? 'animate-spin' : ''}`} />
      </button>
    </div>
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
  syncState,
  onForceSync,
}: FruitMatchLevelCollectionProps) {
  const { isAuthenticated, isSupabaseAvailable } = useAuth();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [collectionId, setCollectionId] = useState<string | null>(null);

  // Get collection ID for sharing
  useEffect(() => {
    if (isSupabaseAvailable) {
      const provider = createSupabaseStorageProvider<DesignedFruitMatchLevel>('fruit-match');
      if ('getCollectionId' in provider) {
        (provider as { getCollectionId: () => Promise<string | null> }).getCollectionId().then(setCollectionId);
      }
    }
  }, [isSupabaseAvailable, isAuthenticated]);

  // Simple tier helper using standard thresholds
  const getTierFromScore = useCallback((score: number): DifficultyTier => {
    if (score < 20) return 'trivial';
    if (score < 35) return 'easy';
    if (score < 50) return 'medium';
    if (score < 65) return 'hard';
    if (score < 80) return 'expert';
    return 'nightmare';
  }, []);

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

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredLevels.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pagedLevels = useMemo(() => {
    const start = safePage * PAGE_SIZE;
    return filteredLevels.slice(start, start + PAGE_SIZE);
  }, [filteredLevels, safePage]);

  // Single-pass tier stats
  const tierStats = useMemo(() => {
    const counts: Record<DifficultyTier, number> = { trivial: 0, easy: 0, medium: 0, hard: 0, expert: 0, nightmare: 0 };
    for (const l of levels) {
      counts[getTierFromScore(l.metrics.difficultyScore)]++;
    }
    return counts;
  }, [levels, getTierFromScore]);

  // Export a level to JSON — uses studio format when studio data exists, falls back to reference format
  const levelToExportJSON = useCallback((level: DesignedFruitMatchLevel): object => {
    // If the level has studio data (items, launchers with order/variant/layer), use studio format
    if (level.studioSelectableItems && level.studioLaunchers) {
      // Build palette from pixel art colors
      const paletteSet = new Set<string>();
      for (const cell of level.pixelArt) {
        const ct = FRUIT_TO_COLOR_TYPE[cell.fruitType];
        paletteSet.add(COLOR_TYPE_TO_HEX[ct] || '888888');
      }

      const layerToNumber: Record<string, number> = { 'A': 0, 'B': 1, 'C': 2 };
      return exportStudioLevel({
        palette: Array.from(paletteSet),
        levelId: level.name,
        levelIndex: level.levelNumber,
        difficulty: level.metrics.difficulty,
        graphicId: `graphic_${level.pixelArtWidth}x${level.pixelArtHeight}`,
        width: level.pixelArtWidth,
        height: level.pixelArtHeight,
        pixels: level.pixelArt.map((cell) => {
          const ct = FRUIT_TO_COLOR_TYPE[cell.fruitType];
          return {
            row: cell.row,
            col: cell.col,
            colorType: ct,
            colorGroup: ct,
            colorHex: COLOR_TYPE_TO_HEX[ct] || '888888',
            group: cell.groupId ?? 1,
          };
        }),
        selectableItems: level.studioSelectableItems.map((si) => ({
          colorType: si.colorType,
          variant: si.variant,
          layer: si.layer,
          order: si.order,
        })),
        requirements: level.studioLaunchers.map((l) => ({
          colorType: l.colorType,
          value: l.pixelCount,
          group: l.group,
        })),
        launchers: level.studioLaunchers.map((l) => ({
          colorType: l.colorType,
          pixelCount: l.pixelCount,
          group: l.group,
          order: l.order,
          isLocked: l.isLocked,
        })),
        unlockStageData: [],
        maxSelectableItems: level.studioMaxSelectableItems ?? 10,
        blockingOffset: level.studioBlockingOffset,
        waitingStandSlots: level.studioWaitingStandSlots,
        activeLauncherCount: level.studioActiveLauncherCount,
        seed: level.studioSeed,
        moveLimit: level.studioMoveLimit,
      });
    }

    // Fallback: legacy reference format for levels without studio data
    return exportToReferenceFormat({
      levelId: level.name,
      levelIndex: level.levelNumber,
      difficulty: level.metrics.difficulty,
      graphicId: `graphic_${level.pixelArtWidth}x${level.pixelArtHeight}`,
      pixelArtWidth: level.pixelArtWidth,
      pixelArtHeight: level.pixelArtHeight,
      pixelArt: level.pixelArt,
      sinkTileCount: level.sinkStacks.reduce((sum, stack) => sum + stack.length, 0),
    });
  }, []);

  const handleExportLevel = (level: DesignedFruitMatchLevel) => {
    const exportData = levelToExportJSON(level);
    const blob = new Blob([JSON.stringify(exportData, null, 4)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `level_${level.levelNumber}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportAll = () => {
    const exportData = levels.map(levelToExportJSON);
    const blob = new Blob([JSON.stringify(exportData, null, 4)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `juicy-blast-collection-${levels.length}-levels.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportAllSeparate = async () => {
    for (let i = 0; i < levels.length; i++) {
      const level = levels[i];
      const exportData = levelToExportJSON(level);
      const blob = new Blob([JSON.stringify(exportData, null, 4)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `level_${level.levelNumber}.json`;
      a.click();
      URL.revokeObjectURL(url);
      if (i < levels.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  };

  // Convert ReferenceLevel to DesignedFruitMatchLevel
  const referenceToDesignedLevel = (ref: ReferenceLevel, levelNumber: number): DesignedFruitMatchLevel => {
    const imported = importFromReferenceFormat(ref);

    // Calculate metrics from the imported data
    const totalPixels = imported.pixelArt.length;

    // Calculate fruit distribution
    const fruitDistribution: Record<FruitType, number> = {
      blueberry: 0,
      orange: 0,
      strawberry: 0,
      dragonfruit: 0,
      banana: 0,
      apple: 0,
      plum: 0,
      pear: 0,
      blackberry: 0,
    };
    for (const cell of imported.pixelArt) {
      fruitDistribution[cell.fruitType]++;
    }

    const uniqueFruitTypes = Object.values(fruitDistribution).filter(v => v > 0).length;
    const waitingStandSlots = 7;
    const totalTilesInSink = totalPixels * 3; // Estimate: 3 tiles per pixel

    return {
      id: `level-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: `Level ${levelNumber}`,
      levelNumber,
      pixelArt: imported.pixelArt,
      pixelArtWidth: imported.pixelArtWidth,
      pixelArtHeight: imported.pixelArtHeight,
      sinkWidth: 6, // Default sink width
      sinkStacks: [], // Will be regenerated when playing
      waitingStandSlots,
      metrics: {
        totalPixels,
        uniqueFruitTypes,
        fruitDistribution,
        totalTilesInSink,
        waitingStandSlots,
        estimatedMatches: totalPixels,
        difficultyScore: imported.difficulty === 'trivial' ? 15 :
                        imported.difficulty === 'easy' ? 30 :
                        imported.difficulty === 'medium' ? 45 :
                        imported.difficulty === 'hard' ? 60 :
                        imported.difficulty === 'expert' ? 75 : 90,
        difficulty: imported.difficulty,
      },
      createdAt: Date.now(),
    };
  };

  // Convert a studio-format JSON (has Palette + Artwork + SelectableItems) to DesignedFruitMatchLevel
  const studioToDesignedLevel = (data: Record<string, unknown>, levelNumber: number): DesignedFruitMatchLevel => {
    const artwork = data.Artwork as { Width: number; Height: number; PixelData: { Position: { x: number; y: number }; ColorType: number; Group: number; ColorHex: string }[] };
    const height = artwork.Height;
    const width = artwork.Width;

    // Extract launcher data first — needed to reconcile pixel colorTypes
    const rawLaunchers = (data.Launchers as { ColorType: number; Value: number; Group: number; Order: number; IsLocked: boolean }[]) || [];

    // Build group → colorType from launchers so pixels match launcher intent
    // (hex-mapping can produce a wrong colorType, e.g. dark green → Black=8)
    const launcherGroupCT = new Map<number, number>();
    for (const l of rawLaunchers) {
      if (!launcherGroupCT.has(l.Group)) launcherGroupCT.set(l.Group, l.ColorType);
    }

    // Build pixel art — reconcile colorType from launcher data for accurate round-trip
    const pixelArt: PixelCell[] = artwork.PixelData.map((pixel) => {
      const flippedRow = (height - 1) - pixel.Position.y;
      const effectiveCT = launcherGroupCT.get(pixel.Group) ?? pixel.ColorType;
      const fruitType = COLOR_TYPE_TO_FRUIT[effectiveCT] || 'apple';
      return {
        row: flippedRow,
        col: pixel.Position.x,
        fruitType,
        filled: false,
        groupId: pixel.Group,
        colorHex: pixel.ColorHex,
        colorType: effectiveCT,
      };
    });

    // Extract studio data
    const rawItems = (data.SelectableItems as { ColorType: number; Variant: number; Layer: number; Order?: number }[]) || [];
    const layerNames: Record<number, 'A' | 'B' | 'C'> = { 0: 'A', 1: 'B', 2: 'C' };
    const studioSelectableItems = rawItems.map((item, idx) => ({
      colorType: item.ColorType,
      variant: item.Variant ?? 0,
      layer: layerNames[item.Layer] || 'A' as 'A' | 'B' | 'C',
      order: typeof item.Order === 'number' ? item.Order : idx,
    }));
    const studioLaunchers = rawLaunchers.map((l, idx) => ({
      colorType: l.ColorType,
      pixelCount: l.Value,
      group: l.Group,
      order: l.Order ?? idx,
      isLocked: l.IsLocked ?? idx >= 2,
    }));

    const maxSelectableItems = (data.MaxSelectableItems as number) || 10;
    const blockingOffset = typeof data.BlockingOffset === 'number' ? data.BlockingOffset : 0;
    const waitingStandSlots = typeof data.WaitingStandSlots === 'number' ? data.WaitingStandSlots : 5;
    const activeLauncherCount = typeof data.ActiveLauncherCount === 'number' ? data.ActiveLauncherCount : 2;
    const seed = typeof data.Seed === 'number' ? data.Seed : undefined;
    const moveLimit = typeof data.MoveLimit === 'number' ? data.MoveLimit : undefined;

    // Compute real difficulty from studio parameters
    const uniqueColors = new Set(pixelArt.map((p) => FRUIT_TO_COLOR_TYPE[p.fruitType])).size;
    const uniqueVariants = new Set(studioSelectableItems.map((s) => `${s.colorType}:${s.variant}`)).size;
    const diffResult = calculateStudioDifficulty({
      totalPixels: pixelArt.length,
      uniqueColors,
      groupCount: new Set(studioLaunchers.map((l) => l.group)).size,
      launcherCount: studioLaunchers.length,
      maxSelectableItems,
      totalTiles: studioSelectableItems.length,
      blockingOffset,
      uniqueVariants,
    });

    // Fruit distribution
    const fruitDistribution: Record<FruitType, number> = {
      blueberry: 0, orange: 0, strawberry: 0, dragonfruit: 0, banana: 0, apple: 0, plum: 0, pear: 0, blackberry: 0,
    };
    for (const cell of pixelArt) fruitDistribution[cell.fruitType]++;

    return {
      id: `level-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: (data.LevelId as string) || `Level ${levelNumber}`,
      levelNumber,
      pixelArt,
      pixelArtWidth: width,
      pixelArtHeight: height,
      sinkWidth: 6,
      sinkStacks: [],
      waitingStandSlots,
      metrics: {
        totalPixels: pixelArt.length,
        uniqueFruitTypes: uniqueColors,
        fruitDistribution,
        totalTilesInSink: studioSelectableItems.length,
        waitingStandSlots,
        estimatedMatches: pixelArt.length,
        difficultyScore: diffResult.score,
        difficulty: diffResult.tier,
      },
      createdAt: Date.now(),
      studioSelectableItems,
      studioLaunchers,
      studioMaxSelectableItems: maxSelectableItems,
      studioBlockingOffset: blockingOffset,
      studioWaitingStandSlots: waitingStandSlots,
      studioActiveLauncherCount: activeLauncherCount,
      studioSeed: seed,
      studioMoveLimit: moveLimit,
    };
  };

  // Import collection from JSON (supports multiple file selection and reference format)
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

          // Check studio format first (has Palette + Artwork + SelectableItems)
          if (imported && !Array.isArray(imported) && imported.Palette && imported.Artwork && imported.SelectableItems) {
            const match = file.name.match(/level[_-]?(\d+)/i);
            const levelNumber = match ? parseInt(match[1], 10) : currentLevelNumber++;
            newLevels.push(studioToDesignedLevel(imported, levelNumber));
            continue;
          }

          // Check if it's reference format (single level, no Palette)
          if (isReferenceFormat(imported)) {
            const match = file.name.match(/level[_-]?(\d+)/i);
            const levelNumber = match ? parseInt(match[1], 10) : currentLevelNumber++;
            newLevels.push(referenceToDesignedLevel(imported, levelNumber));
            continue;
          }

          // Check if it's our internal format (single level)
          if (imported && !Array.isArray(imported) && imported.pixelArt) {
            const match = file.name.match(/level[_-]?(\d+)/i);
            const levelNumber = match ? parseInt(match[1], 10) : currentLevelNumber++;
            newLevels.push({ ...imported, levelNumber });
            continue;
          }

          // Handle array of levels
          if (Array.isArray(imported)) {
            for (const l of imported) {
              // Studio format in array
              if (l.Palette && l.Artwork && l.SelectableItems) {
                newLevels.push(studioToDesignedLevel(l, currentLevelNumber++));
              } else if (isReferenceFormat(l)) {
                newLevels.push(referenceToDesignedLevel(l, currentLevelNumber++));
              } else if (l.pixelArt) {
                newLevels.push({
                  ...l,
                  levelNumber: currentLevelNumber++,
                });
              }
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
              {levels.length.toLocaleString()} levels designed
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
            {isSupabaseAvailable && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowShareModal(true)}
                disabled={levels.length === 0}
                title={isAuthenticated ? "Share collection" : "Sign in to share"}
              >
                <Share2 className="h-4 w-4" />
              </Button>
            )}
            {syncState && (
              <SyncStatusIndicator syncState={syncState} onForceSync={onForceSync} />
            )}
          </div>
        </div>
      </CardHeader>

      {/* Share Modal */}
      <ShareModal
        open={showShareModal}
        onOpenChange={setShowShareModal}
        collectionId={collectionId}
        gameType="Fruit Match"
        levelCount={levels.length}
        onSignInClick={() => {
          setShowShareModal(false);
          setShowAuthModal(true);
        }}
        onBeforeShare={onForceSync}
      />

      {/* Auth Modal */}
      <AuthModal open={showAuthModal} onOpenChange={setShowAuthModal} />
      <CardContent className="space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search levels..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(0);
            }}
            className="pl-8"
          />
        </div>

        {/* Level Stats Summary */}
        {levels.length > 0 && (
          <div className="flex items-center gap-4 text-sm">
            <span className="text-muted-foreground">{levels.length} levels:</span>
            <div className="flex items-center gap-2 flex-wrap">
              {tierStats.trivial > 0 && <span className="text-gray-400 font-medium">{tierStats.trivial} <span className="text-muted-foreground font-normal text-xs">triv</span></span>}
              {tierStats.easy > 0 && <span className="text-green-400 font-medium">{tierStats.easy} <span className="text-muted-foreground font-normal text-xs">easy</span></span>}
              {tierStats.medium > 0 && <span className="text-yellow-400 font-medium">{tierStats.medium} <span className="text-muted-foreground font-normal text-xs">med</span></span>}
              {tierStats.hard > 0 && <span className="text-orange-400 font-medium">{tierStats.hard} <span className="text-muted-foreground font-normal text-xs">hard</span></span>}
              {tierStats.expert > 0 && <span className="text-red-400 font-medium">{tierStats.expert} <span className="text-muted-foreground font-normal text-xs">exp</span></span>}
              {tierStats.nightmare > 0 && <span className="text-purple-400 font-medium">{tierStats.nightmare} <span className="text-muted-foreground font-normal text-xs">nite</span></span>}
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
            {pagedLevels.map((level) => {
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
            {pagedLevels.map((level) => {
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

                  {/* Level number — click to move to a different position */}
                  <input
                    type="number"
                    min={1}
                    max={levels.length}
                    defaultValue={level.levelNumber}
                    className="w-10 h-8 rounded-full bg-muted text-center text-sm font-medium shrink-0 border-0 focus:ring-2 focus:ring-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    title="Type a number to move this level"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const target = parseInt((e.target as HTMLInputElement).value);
                        if (target >= 1 && target <= levels.length && target !== level.levelNumber) {
                          const newLevels = [...levels];
                          const fromIdx = newLevels.findIndex((l) => l.id === level.id);
                          if (fromIdx !== -1) {
                            const [moved] = newLevels.splice(fromIdx, 1);
                            newLevels.splice(target - 1, 0, moved);
                            onLevelsChange(newLevels.map((l, i) => ({ ...l, levelNumber: i + 1 })));
                          }
                        }
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    onBlur={(e) => {
                      const target = parseInt(e.target.value);
                      if (target >= 1 && target <= levels.length && target !== level.levelNumber) {
                        const newLevels = [...levels];
                        const fromIdx = newLevels.findIndex((l) => l.id === level.id);
                        if (fromIdx !== -1) {
                          const [moved] = newLevels.splice(fromIdx, 1);
                          newLevels.splice(target - 1, 0, moved);
                          onLevelsChange(newLevels.map((l, i) => ({ ...l, levelNumber: i + 1 })));
                        }
                      } else {
                        e.target.value = String(level.levelNumber);
                      }
                    }}
                  />

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

        {/* Pagination */}
        {filteredLevels.length > PAGE_SIZE && (
          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-muted-foreground">
              {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, filteredLevels.length)} of {filteredLevels.length}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                disabled={safePage === 0}
                onClick={() => setPage(0)}
              >
                1
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                disabled={safePage === 0}
                onClick={() => setPage(safePage - 1)}
              >
                Prev
              </Button>
              <span className="text-xs px-2">
                {safePage + 1} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                disabled={safePage >= totalPages - 1}
                onClick={() => setPage(safePage + 1)}
              >
                Next
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                disabled={safePage >= totalPages - 1}
                onClick={() => setPage(totalPages - 1)}
              >
                {totalPages}
              </Button>
              <Input
                type="number"
                min={1}
                max={totalPages}
                placeholder="Go to"
                className="h-7 w-16 text-xs text-center"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const v = parseInt((e.target as HTMLInputElement).value);
                    if (v >= 1 && v <= totalPages) setPage(v - 1);
                  }
                }}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
