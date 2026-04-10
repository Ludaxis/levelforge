'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  DesignedLevel,
  LevelMetrics,
  calculateFlowZone,
  getSawtoothPosition,
} from '@/types/squareBlock';
import {
  analyzePuzzle,
  calculateDifficultyScore,
} from '@/lib/puzzleAnalyzer';
import {
  isReferenceFormat,
  importFromReferenceFormat,
  exportToReferenceFormat,
  sanitizeSquareBlocksForDesigner,
} from '@/lib/squareBlockExport';
import {
  gridKey,
  createRectangularGrid,
  gridToPixel,
  getGridBounds,
} from '@/lib/squareGrid';
import { useSyncedLevelCollection } from '@/lib/storage/useSyncedLevelCollection';
import { useMultipleCollections } from '@/lib/storage/useMultipleCollections';
import { SyncState, CollectionMetadata } from '@/lib/storage/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Layers,
  Download,
  Upload,
  Trash2,
  Pencil,
  Play,
  Copy,
  ChevronUp,
  ChevronDown,
  Search,
  Grid3X3,
  List,
  Files,
  GripVertical,
  RefreshCw,
  Cloud,
  CloudOff,
  Share2,
  Plus,
  FolderOpen,
  ChevronDown as ChevronDownIcon,
  CheckSquare,
  Square as SquareIcon,
} from 'lucide-react';
import { useAuth } from '@/lib/auth/AuthContext';
import { ShareModal } from '@/components/sharing/ShareModal';
import { AuthModal } from '@/components/auth/AuthModal';
import { createSupabaseStorageProvider } from '@/lib/storage/supabase';

// ============================================================================
// Types
// ============================================================================

interface SquareBlockLevelCollectionProps {
  levels: DesignedLevel[];
  onLevelsChange: (levels: DesignedLevel[]) => void;
  onEditLevel: (level: DesignedLevel) => void;
  onPlayLevel: (level: DesignedLevel) => void;
  syncState?: SyncState;
  onForceSync?: () => Promise<void>;
  // Multiple collections support
  collections?: CollectionMetadata[];
  activeCollectionId?: string | null;
  onCollectionChange?: (collectionId: string) => void;
  onCreateCollection?: (name: string, description?: string) => string;
  onRenameCollection?: (id: string, name: string, description?: string) => void;
  onDeleteCollection?: (id: string) => void;
}

// Export the config type and default for use in parent components
// Re-export SawtoothConfig from chart component
export type { SawtoothConfig } from './CollectionCurveChart';
export { DEFAULT_SAWTOOTH_CONFIG } from './CollectionCurveChart';
import type { SawtoothConfig, DisplayTier } from './CollectionCurveChart';
import { DEFAULT_SAWTOOTH_CONFIG, DEFAULT_TIER_THRESHOLDS, scoreToTierWithThresholds } from './CollectionCurveChart';

// ============================================================================
// Constants
// ============================================================================

const STORAGE_KEY = 'square-block-level-collection';
const MAX_LEVELS = 10000;
const PAGE_SIZE = 50;

const DIFFICULTY_BADGE_COLORS: Record<DisplayTier, string> = {
  trivial: 'bg-gray-500/20 text-gray-400 border-gray-500/50',
  easy: 'bg-green-500/20 text-green-400 border-green-500/50',
  medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
  hard: 'bg-orange-500/20 text-orange-400 border-orange-500/50',
  superHard: 'bg-red-500/20 text-red-400 border-red-500/50',
};

function sanitizeDesignedLevel(level: DesignedLevel): DesignedLevel {
  return {
    ...level,
    blocks: sanitizeSquareBlocksForDesigner(level.blocks),
  };
}



// ============================================================================
// Hook for localStorage persistence
// ============================================================================

export function useLevelCollection() {
  const collection = useSyncedLevelCollection<DesignedLevel>({
    gameType: 'square-block',
    localStorageKey: STORAGE_KEY,
    maxLevels: MAX_LEVELS,
    migrate: sanitizeDesignedLevel,
  });

  // Multiple collections support
  const multiCollections = useMultipleCollections<DesignedLevel>('square-block', MAX_LEVELS);
  const {
    collections,
    activeCollectionId,
    activeCollection,
    createCollection,
    renameCollection,
    deleteCollection,
    setActiveCollection,
    getLevelsForCollection: getStoredLevelsForCollection,
    saveLevelsForCollection: saveStoredLevelsForCollection,
    isLoaded: collectionsLoaded,
  } = multiCollections;

  const getLevelsForCollection = useCallback((id: string) => {
    return getStoredLevelsForCollection(id).map(sanitizeDesignedLevel);
  }, [getStoredLevelsForCollection]);

  const saveLevelsForCollection = useCallback((id: string, levels: DesignedLevel[]) => {
    saveStoredLevelsForCollection(id, levels.map(sanitizeDesignedLevel));
  }, [saveStoredLevelsForCollection]);

  // Add duplicateLevel for backwards compatibility
  const duplicateLevel = useCallback((level: DesignedLevel) => {
    collection.setLevels((prev: DesignedLevel[]) => {
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
  }, [collection]);

  return {
    ...collection,
    duplicateLevel,
    // Multiple collections
    collections,
    activeCollectionId,
    activeCollection,
    createCollection,
    renameCollection,
    deleteCollection,
    setActiveCollection,
    getLevelsForCollection,
    saveLevelsForCollection,
    collectionsLoaded,
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

export function SquareBlockLevelCollection({
  levels,
  onLevelsChange,
  onEditLevel,
  onPlayLevel,
  syncState,
  onForceSync,
  collections,
  activeCollectionId,
  onCollectionChange,
  onCreateCollection,
  onRenameCollection,
  onDeleteCollection,
}: SquareBlockLevelCollectionProps) {
  const { isAuthenticated, isSupabaseAvailable } = useAuth();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showShareModal, setShowShareModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [collectionId, setCollectionId] = useState<string | null>(null);
  // Collection management dialogs
  const [showNewCollectionDialog, setShowNewCollectionDialog] = useState(false);
  const [showManageDialog, setShowManageDialog] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [newCollectionDesc, setNewCollectionDesc] = useState('');
  const [editingCollectionId, setEditingCollectionId] = useState<string | null>(null);
  const [editCollectionName, setEditCollectionName] = useState('');
  const [editCollectionDesc, setEditCollectionDesc] = useState('');

  // Get collection ID for sharing
  useEffect(() => {
    if (isSupabaseAvailable) {
      const provider = createSupabaseStorageProvider<DesignedLevel>('square-block');
      if ('getCollectionId' in provider) {
        (provider as { getCollectionId: () => Promise<string | null> }).getCollectionId().then(setCollectionId);
      }
    }
  }, [isSupabaseAvailable, isAuthenticated]);

  // Tier helper using configurable thresholds
  const getTierFromScore = useCallback((score: number): DisplayTier => {
    return scoreToTierWithThresholds(score, DEFAULT_TIER_THRESHOLDS);
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

  // Export single level as reference format JSON
  const handleExportLevel = (level: DesignedLevel) => {
    const referenceFormat = exportToReferenceFormat({
      rows: level.rows,
      cols: level.cols,
      blocks: sanitizeSquareBlocksForDesigner(level.blocks),
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
      blocks: sanitizeSquareBlocksForDesigner(level.blocks),
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

  // Export all levels as separate JSON files
  const handleExportAllSeparate = async () => {
    for (let i = 0; i < levels.length; i++) {
      const level = levels[i];
      const referenceFormat = exportToReferenceFormat({
        rows: level.rows,
        cols: level.cols,
        blocks: sanitizeSquareBlocksForDesigner(level.blocks),
      });
      const dataStr = JSON.stringify(referenceFormat, null, 4);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `grid_Level${level.levelNumber}_1.json`;
      a.click();
      URL.revokeObjectURL(url);
      // Small delay between downloads to prevent browser from blocking
      if (i < levels.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  };

  // Helper function to create a DesignedLevel from reference format data
  const createDesignedLevelFromReference = (levelData: { rows: number; cols: number; blocks: typeof levels[0]['blocks'] }, levelNumber: number): DesignedLevel => {
    const sanitizedBlocks = sanitizeSquareBlocksForDesigner(levelData.blocks);
    // Create block map for analysis
    const blockMap = new Map();
    for (const block of sanitizedBlocks) {
      blockMap.set(gridKey(block.coord), block);
    }

    // Analyze the puzzle
    const analysis = analyzePuzzle(blockMap, new Set(), levelData.rows, levelData.cols);
    const breakdown = analysis.solvable ? calculateDifficultyScore(analysis) : null;
    const sawtoothPosition = getSawtoothPosition(levelNumber);
    const flowZone = breakdown ? calculateFlowZone(breakdown.tier, levelNumber) : 'flow';
    const lockedCount = sanitizedBlocks.filter(b => b.locked).length;
    const icedCount = sanitizedBlocks.filter(b => b.iceCount && b.iceCount > 0).length;
    const mirrorCount = sanitizedBlocks.filter(b => b.mirror === true).length;

    const metrics: LevelMetrics = {
      cellCount: sanitizedBlocks.length,
      holeCount: 0,
      lockedCount,
      icedCount,
      mirrorCount,
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
      name: `grid_Level${levelNumber}_1`,
      levelNumber,
      rows: levelData.rows,
      cols: levelData.cols,
      blocks: sanitizedBlocks,
      gameMode: 'classic',
      metrics,
      createdAt: Date.now(),
    };
  };

  // Import collection from JSON (handles both reference format and internal format)
  // Supports multiple file selection
  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.multiple = true; // Allow multiple file selection
    input.onchange = async (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files || files.length === 0) return;

      const newLevels: DesignedLevel[] = [];
      let currentLevelNumber = levels.length + 1;

      // Process each file
      for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
        const file = files[fileIndex];
        try {
          const content = await file.text();
          const imported = JSON.parse(content);

          // Check if it's a single reference format level (has cells array)
          if (isReferenceFormat(imported)) {
            const levelData = importFromReferenceFormat(imported);
            // Try to extract level number from filename (e.g., grid_Level35_1.json)
            const match = file.name.match(/Level(\d+)/i);
            const levelNumber = match ? parseInt(match[1], 10) : currentLevelNumber++;
            const newLevel = createDesignedLevelFromReference(levelData, levelNumber);
            newLevels.push(newLevel);
            continue;
          }

          // Check if it's an array of reference format levels
          if (Array.isArray(imported) && imported.length > 0 && isReferenceFormat(imported[0])) {
            for (let i = 0; i < imported.length; i++) {
              const levelData = importFromReferenceFormat(imported[i]);
              const levelNumber = currentLevelNumber++;
              newLevels.push(createDesignedLevelFromReference(levelData, levelNumber));
            }
            continue;
          }

          // Handle internal format (array of DesignedLevel)
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
        // Sort by level number
        newLevels.sort((a, b) => a.levelNumber - b.levelNumber);

        // Replace existing levels with matching level numbers, append the rest
        const importedByNumber = new Map<number, DesignedLevel>();
        for (const nl of newLevels) {
          importedByNumber.set(nl.levelNumber, nl);
        }

        // Replace matching levels in existing collection
        const merged = levels.map((l) => {
          const replacement = importedByNumber.get(l.levelNumber);
          if (replacement) {
            importedByNumber.delete(l.levelNumber);
            return { ...replacement, id: l.id }; // preserve id for stable keys
          }
          return l;
        });

        // Append any remaining new levels that didn't match existing numbers
        const remaining = Array.from(importedByNumber.values());
        const allLevels = [...merged, ...remaining].slice(0, MAX_LEVELS);
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
    setSelectedIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
  };

  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} selected level${selectedIds.size > 1 ? 's' : ''}?`)) return;
    const filtered = levels.filter((l) => !selectedIds.has(l.id));
    onLevelsChange(filtered.map((l, i) => ({ ...l, levelNumber: i + 1 })));
    setSelectedIds(new Set());
  };

  const handleClearAll = () => {
    if (levels.length === 0) return;
    if (!confirm(`Clear all ${levels.length} levels from the collection?`)) return;
    onLevelsChange([]);
    setSelectedIds(new Set());
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === pagedLevels.length) {
      // Deselect all on current page
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const l of pagedLevels) next.delete(l.id);
        return next;
      });
    } else {
      // Select all on current page
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const l of pagedLevels) next.add(l.id);
        return next;
      });
    }
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
            <Button variant="outline" size="sm" onClick={handleExportAllSeparate} disabled={levels.length === 0} title="Export as separate files (grid_LevelN_1.json)">
              <Files className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportAll} disabled={levels.length === 0} title="Export all as single file">
              <Download className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={handleImport} title="Import levels (replaces matching level numbers)">
              <Upload className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={handleClearAll} disabled={levels.length === 0} title="Clear all levels">
              <Trash2 className="h-4 w-4" />
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
        gameType="Tap Music"
        levelCount={levels.length}
        onSignInClick={() => {
          setShowShareModal(false);
          setShowAuthModal(true);
        }}
        onBeforeShare={onForceSync}
      />

      {/* Auth Modal */}
      <AuthModal open={showAuthModal} onOpenChange={setShowAuthModal} />

      {/* New Collection Dialog */}
      <Dialog open={showNewCollectionDialog} onOpenChange={setShowNewCollectionDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Collection</DialogTitle>
            <DialogDescription>Create a new collection to organize your levels</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Collection Name</label>
              <Input
                placeholder="e.g., Easy Levels, Draft, etc."
                value={newCollectionName}
                onChange={e => setNewCollectionName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Description (optional)</label>
              <Input
                placeholder="A brief description of this collection"
                value={newCollectionDesc}
                onChange={e => setNewCollectionDesc(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowNewCollectionDialog(false)}>Cancel</Button>
              <Button
                disabled={!newCollectionName.trim()}
                onClick={() => {
                  if (onCreateCollection && newCollectionName.trim()) {
                    const id = onCreateCollection(newCollectionName.trim(), newCollectionDesc.trim() || undefined);
                    setShowNewCollectionDialog(false);
                    setNewCollectionName('');
                    setNewCollectionDesc('');
                    if (onCollectionChange) onCollectionChange(id);
                  }
                }}
              >
                Create
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Manage Collections Dialog */}
      <Dialog open={showManageDialog} onOpenChange={setShowManageDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Manage Collections</DialogTitle>
            <DialogDescription>Rename or delete collections</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 pt-2 max-h-[300px] overflow-y-auto">
            {collections?.map(c => (
              <div key={c.id} className="flex items-center gap-2 p-2 rounded-lg border">
                {editingCollectionId === c.id ? (
                  <>
                    <div className="flex-1 space-y-1">
                      <Input
                        value={editCollectionName}
                        onChange={e => setEditCollectionName(e.target.value)}
                        className="h-8"
                        placeholder="Collection name"
                      />
                      <Input
                        value={editCollectionDesc}
                        onChange={e => setEditCollectionDesc(e.target.value)}
                        className="h-8"
                        placeholder="Description (optional)"
                      />
                    </div>
                    <Button
                      size="sm"
                      onClick={() => {
                        if (onRenameCollection && editCollectionName.trim()) {
                          onRenameCollection(c.id, editCollectionName.trim(), editCollectionDesc.trim() || undefined);
                        }
                        setEditingCollectionId(null);
                      }}
                    >
                      Save
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setEditingCollectionId(null)}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.levelCount} levels</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => {
                        setEditingCollectionId(c.id);
                        setEditCollectionName(c.name);
                        setEditCollectionDesc(c.description || '');
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-destructive"
                      onClick={() => {
                        if (onDeleteCollection && confirm(`Delete "${c.name}"? This cannot be undone.`)) {
                          onDeleteCollection(c.id);
                        }
                      }}
                      disabled={collections.length <= 1}
                      title={collections.length <= 1 ? "Cannot delete last collection" : "Delete collection"}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <CardContent className="space-y-4">
        {/* Collection Selector (only shown when multiple collections enabled) */}
        {collections && collections.length > 0 && (
          <div className="flex items-center gap-2 pb-2 border-b">
            <FolderOpen className="h-4 w-4 text-muted-foreground" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="flex-1 justify-between">
                  <span className="truncate">
                    {collections.find(c => c.id === activeCollectionId)?.name || 'Select collection'}
                  </span>
                  <ChevronDownIcon className="h-4 w-4 ml-2 shrink-0" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                {collections.map(c => (
                  <DropdownMenuItem
                    key={c.id}
                    onClick={() => onCollectionChange?.(c.id)}
                    className={c.id === activeCollectionId ? 'bg-accent' : ''}
                  >
                    <span className="flex-1 truncate">{c.name}</span>
                    <Badge variant="outline" className="ml-2">{c.levelCount}</Badge>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setShowNewCollectionDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  New Collection
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowManageDialog(true)}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Manage Collections
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

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
            <span className="text-muted-foreground">Levels:</span>
            <div className="flex items-center gap-3">
              <span className="text-gray-400 font-medium">
                {levels.filter((l) => getTierFromScore(l.metrics.difficultyScore) === 'trivial').length} <span className="text-muted-foreground font-normal">triv</span>
              </span>
              <span className="text-green-400 font-medium">
                {levels.filter((l) => getTierFromScore(l.metrics.difficultyScore) === 'easy').length} <span className="text-muted-foreground font-normal">easy</span>
              </span>
              <span className="text-yellow-400 font-medium">
                {levels.filter((l) => getTierFromScore(l.metrics.difficultyScore) === 'medium').length} <span className="text-muted-foreground font-normal">med</span>
              </span>
              <span className="text-orange-400 font-medium">
                {levels.filter((l) => getTierFromScore(l.metrics.difficultyScore) === 'hard').length} <span className="text-muted-foreground font-normal">hard</span>
              </span>
              <span className="text-red-400 font-medium">
                {levels.filter((l) => getTierFromScore(l.metrics.difficultyScore) === 'superHard').length} <span className="text-muted-foreground font-normal">super</span>
              </span>
            </div>
          </div>
        )}


        {/* Selection controls */}
        {levels.length > 0 && (
          <div className="flex items-center gap-2 text-xs">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={toggleSelectAll}
            >
              {selectedIds.size === pagedLevels.length && pagedLevels.length > 0 ? (
                <CheckSquare className="h-3.5 w-3.5 mr-1" />
              ) : (
                <SquareIcon className="h-3.5 w-3.5 mr-1" />
              )}
              {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select'}
            </Button>
            {selectedIds.size > 0 && (
              <Button
                variant="destructive"
                size="sm"
                className="h-7 text-xs"
                onClick={handleDeleteSelected}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Delete {selectedIds.size}
              </Button>
            )}
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
              const tierColors: Record<DisplayTier, { border: string; text: string }> = {
                trivial: { border: 'border-gray-500/50', text: 'text-gray-400' },
                easy: { border: 'border-green-500/50', text: 'text-green-400' },
                medium: { border: 'border-yellow-500/50', text: 'text-yellow-400' },
                hard: { border: 'border-orange-500/50', text: 'text-orange-400' },
                superHard: { border: 'border-red-500/50', text: 'text-red-400' },
              };
              const colors = tierColors[tier];

              const isSelected = selectedIds.has(level.id);
              return (
                <div
                  key={level.id}
                  className={`relative overflow-hidden rounded-lg border ${isSelected ? 'border-primary ring-1 ring-primary' : colors.border} bg-card hover:bg-accent/50 transition-colors cursor-pointer group`}
                  onClick={() => onEditLevel(level)}
                >
                  <div className="flex gap-2 p-2">
                    {/* Checkbox + Preview with level number overlay */}
                    <div className="relative shrink-0">
                      <MiniLevelPreview level={level} size={60} />
                      <div className="absolute top-0 left-0 bg-black/80 text-white text-[9px] font-bold px-1 py-0.5 rounded-br">
                        {level.levelNumber}
                      </div>
                      <button
                        className="absolute top-0 right-0 p-0.5 bg-black/60 rounded-bl hover:bg-black/80"
                        onClick={(e) => { e.stopPropagation(); toggleSelect(level.id); }}
                      >
                        {isSelected ? (
                          <CheckSquare className="h-3.5 w-3.5 text-primary" />
                        ) : (
                          <SquareIcon className="h-3.5 w-3.5 text-white/60" />
                        )}
                      </button>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0 py-0.5">
                      <div className="flex items-baseline gap-1">
                        <span className={`text-xl font-bold ${colors.text}`}>{level.metrics.difficultyScore}</span>
                        <span className="text-[10px] text-muted-foreground truncate">
                          {tier === 'superHard' ? 's.hard' : tier}
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
              const tierColors: Record<DisplayTier, { border: string; text: string }> = {
                trivial: { border: 'border-gray-500/50', text: 'text-gray-400' },
                easy: { border: 'border-green-500/50', text: 'text-green-400' },
                medium: { border: 'border-yellow-500/50', text: 'text-yellow-400' },
                hard: { border: 'border-orange-500/50', text: 'text-orange-400' },
                superHard: { border: 'border-red-500/50', text: 'text-red-400' },
              };
              const colors = tierColors[tier];
              const isDragging = draggedId === level.id;
              const isDragOver = dragOverId === level.id;
              const isSelected = selectedIds.has(level.id);
              return (
                <div
                  key={level.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, level.id)}
                  onDragOver={(e) => handleDragOver(e, level.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, level.id)}
                  onDragEnd={handleDragEnd}
                  className={`flex items-center gap-3 p-3 rounded-lg border ${isSelected ? 'border-primary ring-1 ring-primary' : colors.border} bg-card hover:bg-accent/50 transition-all cursor-pointer ${isDragging ? 'opacity-50 scale-95' : ''} ${isDragOver ? 'border-primary border-2 bg-accent/70' : ''}`}
                  onClick={() => onEditLevel(level)}
                >
                  {/* Checkbox */}
                  <button
                    className="shrink-0"
                    onClick={(e) => { e.stopPropagation(); toggleSelect(level.id); }}
                  >
                    {isSelected ? (
                      <CheckSquare className="h-4 w-4 text-primary" />
                    ) : (
                      <SquareIcon className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>

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
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-2">
            <Button variant="outline" size="sm" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
              Prev
            </Button>
            <span className="text-xs text-muted-foreground">
              Page {safePage + 1} of {totalPages}
            </span>
            <Button variant="outline" size="sm" disabled={safePage >= totalPages - 1} onClick={() => setPage(safePage + 1)}>
              Next
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
