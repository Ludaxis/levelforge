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
} from '@/types/hexaBlock';
import {
  AxialCoord,
  hexKey,
  createHexagonalGrid,
  axialToPixel,
  getHexPolygonPoints,
  getGridBounds,
} from '@/lib/hexGrid';
import { useSyncedLevelCollection } from '@/lib/storage/useSyncedLevelCollection';
import { SyncState } from '@/lib/storage/types';
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

interface HexaBlockLevelCollectionProps {
  levels: DesignedLevel[];
  onLevelsChange: (levels: DesignedLevel[]) => void;
  onEditLevel: (level: DesignedLevel) => void;
  onPlayLevel: (level: DesignedLevel) => void;
  syncState?: SyncState;
  onForceSync?: () => void;
}

// ============================================================================
// Constants
// ============================================================================

const STORAGE_KEY = 'hexa-block-level-collection';
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
  const collection = useSyncedLevelCollection<DesignedLevel>({
    gameType: 'hexa-block',
    localStorageKey: STORAGE_KEY,
    maxLevels: MAX_LEVELS,
  });

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
  const gridCoords = useMemo(() => createHexagonalGrid(level.gridRadius), [level.gridRadius]);
  const hexSize = size / (level.gridRadius * 2 + 1) / 1.5;

  const { viewBox, origin } = useMemo(() => {
    const bounds = getGridBounds(gridCoords, hexSize);
    const padding = 2;
    const w = bounds.width + padding * 2;
    const h = bounds.height + padding * 2;
    return {
      viewBox: `0 0 ${w} ${h}`,
      origin: { x: -bounds.minX + padding, y: -bounds.minY + padding },
    };
  }, [gridCoords, hexSize]);

  const stackKeys = new Set(level.stacks.map((s) => hexKey(s.coord)));
  const holeKeys = new Set((level.holes || []).map((h) => hexKey(h)));

  return (
    <svg viewBox={viewBox} width={size} height={size} className="shrink-0">
      {gridCoords.map((coord) => {
        const key = hexKey(coord);
        const pixel = axialToPixel(coord, hexSize, origin);
        const points = getHexPolygonPoints(pixel, hexSize);
        const hasStack = stackKeys.has(key);
        const hasHole = holeKeys.has(key);

        let fill = 'rgba(255, 255, 255, 0.05)';
        if (hasHole) fill = 'rgba(0, 0, 0, 0.8)';
        else if (hasStack) {
          const stack = level.stacks.find((s) => hexKey(s.coord) === key);
          fill = stack?.color || '#06b6d4';
        }

        return (
          <polygon
            key={key}
            points={points}
            fill={fill}
            stroke="rgba(255, 255, 255, 0.1)"
            strokeWidth={0.5}
          />
        );
      })}
    </svg>
  );
}

// ============================================================================
// Sync Status Indicator Component
// ============================================================================

function SyncStatusIndicator({ syncState, onForceSync }: { syncState: SyncState; onForceSync?: () => void }) {
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

export function HexaBlockLevelCollection({
  levels,
  onLevelsChange,
  onEditLevel,
  onPlayLevel,
  syncState,
  onForceSync,
}: HexaBlockLevelCollectionProps) {
  const { isAuthenticated, isSupabaseAvailable } = useAuth();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [showShareModal, setShowShareModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [collectionId, setCollectionId] = useState<string | null>(null);

  // Get collection ID for sharing
  useEffect(() => {
    if (isSupabaseAvailable) {
      const provider = createSupabaseStorageProvider<DesignedLevel>('hexa-block');
      if ('getCollectionId' in provider) {
        (provider as { getCollectionId: () => Promise<string | null> }).getCollectionId().then(setCollectionId);
      }
    }
  }, [isSupabaseAvailable, isAuthenticated]);

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

  // Export collection as JSON
  const handleExport = () => {
    const dataStr = JSON.stringify(levels, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hexa-block-collection-${levels.length}-levels.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Import collection from JSON
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
            if (Array.isArray(imported)) {
              onLevelsChange(imported.slice(0, MAX_LEVELS).map((l: DesignedLevel, i: number) => ({
                ...l,
                levelNumber: i + 1,
              })));
            }
          } catch (e) {
            console.error('Failed to import levels:', e);
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
            <Button variant="outline" size="sm" onClick={handleExport} disabled={levels.length === 0}>
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
        gameType="Hexa Block"
        levelCount={levels.length}
        onSignInClick={() => {
          setShowShareModal(false);
          setShowAuthModal(true);
        }}
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
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8"
          />
        </div>

        {/* Level Stats Summary */}
        {levels.length > 0 && (
          <div className="flex gap-2 text-xs">
            <Badge variant="outline" className={DIFFICULTY_BADGE_COLORS.easy}>
              {levels.filter((l) => l.metrics.difficulty === 'easy').length} Easy
            </Badge>
            <Badge variant="outline" className={DIFFICULTY_BADGE_COLORS.medium}>
              {levels.filter((l) => l.metrics.difficulty === 'medium').length} Med
            </Badge>
            <Badge variant="outline" className={DIFFICULTY_BADGE_COLORS.hard}>
              {levels.filter((l) => l.metrics.difficulty === 'hard').length} Hard
            </Badge>
            <Badge variant="outline" className={DIFFICULTY_BADGE_COLORS.superHard}>
              {levels.filter((l) => l.metrics.difficulty === 'superHard').length} S.Hard
            </Badge>
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
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 max-h-[400px] overflow-y-auto">
            {filteredLevels.map((level) => (
              <div
                key={level.id}
                className="p-2 rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer group"
                onClick={() => onEditLevel(level)}
              >
                <div className="flex justify-center mb-1">
                  <MiniLevelPreview level={level} size={50} />
                </div>
                <div className="text-center">
                  <p className="text-xs font-medium truncate">#{level.levelNumber}</p>
                  <Badge
                    variant="outline"
                    className={`text-[10px] px-1 py-0 ${DIFFICULTY_BADGE_COLORS[level.metrics.difficulty]}`}
                  >
                    {level.metrics.difficulty}
                  </Badge>
                </div>
                <div className="flex gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      onPlayLevel(level);
                    }}
                  >
                    <Play className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(level.id);
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {filteredLevels.map((level) => (
              <div
                key={level.id}
                className="flex items-center gap-3 p-2 rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors"
              >
                <MiniLevelPreview level={level} size={40} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">#{level.levelNumber}</span>
                    <span className="text-sm text-muted-foreground truncate">{level.name}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{level.metrics.cellCount} cells</span>
                    <span className={FLOW_ZONE_COLORS[level.metrics.flowZone]}>
                      {level.metrics.flowZone}
                    </span>
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className={DIFFICULTY_BADGE_COLORS[level.metrics.difficulty]}
                >
                  {level.metrics.difficulty}
                </Badge>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => handleMove(level.id, 'up')}>
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleMove(level.id, 'down')}>
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => onEditLevel(level)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => onPlayLevel(level)}>
                    <Play className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDuplicate(level)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(level.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
