'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  FruitType,
  PixelCell,
  SinkTile,
  LauncherOrderConfig,
  PixelGroup,
  UnlockStage,
  ExplicitLauncherConfig,
  LauncherCapacity,
  LAUNCHER_CAPACITIES,
  FRUIT_COLORS,
  ALL_FRUITS,
} from '@/types/fruitMatch';
import {
  GripVertical,
  Plus,
  Trash2,
  Layers,
  ListOrdered,
  Unlock,
  ChevronDown,
  ChevronUp,
  MousePointer2,
  Check,
  X,
  Pencil,
  BarChart3,
} from 'lucide-react';
import { OrderDifficultyPanel } from './OrderDifficultyPanel';

// ============================================================================
// Types
// ============================================================================

interface LauncherOrderEditorProps {
  pixelArt: PixelCell[];
  pixelArtWidth: number;
  pixelArtHeight: number;
  config: LauncherOrderConfig | null;
  onChange: (config: LauncherOrderConfig) => void;
  onPixelArtChange?: (pixelArt: PixelCell[]) => void;
  // Optional: sink stacks for difficulty analysis
  sinkStacks?: SinkTile[][];
  waitingStandSlots?: number;
  onSinkStacksChange?: (stacks: SinkTile[][]) => void;
}

// ============================================================================
// ColorSquare Component (no emojis - colored squares only)
// ============================================================================

interface ColorSquareProps {
  fruitType: FruitType;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

function ColorSquare({ fruitType, size = 'md', className = '' }: ColorSquareProps) {
  const sizeClasses = {
    xs: 'w-2 h-2',
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-6 h-6',
  };

  return (
    <div
      className={`${sizeClasses[size]} rounded-sm border border-white/20 shrink-0 ${className}`}
      style={{ backgroundColor: FRUIT_COLORS[fruitType] }}
      title={fruitType}
    />
  );
}

// ============================================================================
// TileStack Component - Visual representation of launcher capacity
// ============================================================================

interface TileStackProps {
  fruitType: FruitType;
  capacity: LauncherCapacity;
  compact?: boolean;
}

function TileStack({ fruitType, capacity, compact = false }: TileStackProps) {
  const maxDisplay = compact ? 5 : 10;
  const displayCount = Math.min(capacity, maxDisplay);
  const overflow = capacity - displayCount;

  return (
    <div className="flex items-center gap-0.5 flex-wrap">
      {Array.from({ length: displayCount }).map((_, i) => (
        <div
          key={i}
          className="w-2.5 h-2.5 rounded-sm border border-white/30"
          style={{ backgroundColor: FRUIT_COLORS[fruitType] }}
        />
      ))}
      {overflow > 0 && (
        <span className="text-[9px] text-muted-foreground ml-0.5">+{overflow}</span>
      )}
    </div>
  );
}

// ============================================================================
// Helper Functions
// ============================================================================

function generateGroupId(): number {
  return Date.now() + Math.floor(Math.random() * 1000);
}

function generateLauncherId(): string {
  return `launcher-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function breakdownIntoCapacities(pixelCount: number): LauncherCapacity[] {
  const capacities: LauncherCapacity[] = [];
  let remaining = pixelCount;

  const sortedCapacities = [...LAUNCHER_CAPACITIES].sort((a, b) => b - a);

  for (const capacity of sortedCapacities) {
    while (remaining >= capacity) {
      capacities.push(capacity);
      remaining -= capacity;
    }
  }

  if (remaining > 0) {
    capacities.push(20);
  }

  return capacities;
}

function generateLaunchersFromPixelArt(
  pixelArt: PixelCell[],
  groups: PixelGroup[]
): ExplicitLauncherConfig[] {
  const launchers: ExplicitLauncherConfig[] = [];
  let orderIndex = 0;

  const sortedGroups = [...groups].sort((a, b) => a.order - b.order);

  for (const group of sortedGroups) {
    // Count pixels by fruit type that belong to this group
    const fruitCounts = new Map<FruitType, number>();
    for (const cell of pixelArt) {
      if (cell.groupId === group.id) {
        fruitCounts.set(cell.fruitType, (fruitCounts.get(cell.fruitType) || 0) + 1);
      }
    }

    // Create launchers for each fruit type in the group
    for (const [fruitType, count] of fruitCounts) {
      if (count > 0) {
        const capacities = breakdownIntoCapacities(count);
        for (const capacity of capacities) {
          launchers.push({
            id: generateLauncherId(),
            fruitType,
            capacity,
            groupId: group.id,
            orderIndex: orderIndex++,
          });
        }
      }
    }
  }

  return launchers;
}

function generateInitialConfig(pixelArt: PixelCell[]): LauncherOrderConfig {
  // Create one group per color type
  const colorCounts = new Map<FruitType, number>();
  for (const cell of pixelArt) {
    colorCounts.set(cell.fruitType, (colorCounts.get(cell.fruitType) || 0) + 1);
  }

  const groups: PixelGroup[] = [];
  let order = 0;

  for (const fruit of ALL_FRUITS) {
    const count = colorCounts.get(fruit);
    if (count && count > 0) {
      groups.push({
        id: generateGroupId() + order,
        name: `${fruit.charAt(0).toUpperCase() + fruit.slice(1)}`,
        colorTypes: [fruit],
        order: order++,
      });
    }
  }

  // Assign groupIds to pixels based on their color
  const updatedPixelArt = pixelArt.map(cell => {
    const group = groups.find(g => g.colorTypes.includes(cell.fruitType));
    return { ...cell, groupId: group?.id };
  });

  const launchers = generateLaunchersFromPixelArt(updatedPixelArt, groups);

  const unlockStages: UnlockStage[] = [{
    id: 1,
    name: 'Stage 1',
    groupIds: groups.map(g => g.id),
  }];

  return {
    mode: 'auto',
    groups,
    launchers,
    unlockStages,
  };
}

// ============================================================================
// PixelSelectionGrid Component - Visual pixel selector for group editing
// ============================================================================

interface PixelSelectionGridProps {
  pixelArt: PixelCell[];
  width: number;
  height: number;
  selectedPixels: Set<string>;
  editingGroupId: number | null;
  groups: PixelGroup[];
  onPixelClick: (row: number, col: number) => void;
  onPixelDrag: (row: number, col: number) => void;
}

function PixelSelectionGrid({
  pixelArt,
  width,
  height,
  selectedPixels,
  editingGroupId,
  groups,
  onPixelClick,
  onPixelDrag,
}: PixelSelectionGridProps) {
  const [isDragging, setIsDragging] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

  // Create a map for quick lookup
  const cellMap = useMemo(() => {
    const map = new Map<string, PixelCell>();
    for (const cell of pixelArt) {
      map.set(`${cell.row},${cell.col}`, cell);
    }
    return map;
  }, [pixelArt]);

  // Calculate cell size based on grid dimensions
  const maxSize = 280;
  const cellSize = Math.max(4, Math.min(12, Math.floor(maxSize / Math.max(width, height))));
  const gap = cellSize > 6 ? 1 : 0;

  const handleMouseDown = (row: number, col: number) => {
    setIsDragging(true);
    onPixelClick(row, col);
  };

  const handleMouseEnter = (row: number, col: number) => {
    if (isDragging) {
      onPixelDrag(row, col);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Get group color for a cell
  const getGroupColor = (groupId: number | undefined): string => {
    if (groupId === undefined) return 'transparent';
    const group = groups.find(g => g.id === groupId);
    if (!group || group.colorTypes.length === 0) return 'rgba(128, 128, 128, 0.5)';
    return FRUIT_COLORS[group.colorTypes[0]] + '60';
  };

  return (
    <div
      ref={gridRef}
      className="inline-grid border border-muted rounded bg-black/50 p-1"
      style={{
        gridTemplateColumns: `repeat(${width}, ${cellSize}px)`,
        gap: `${gap}px`,
      }}
      onMouseLeave={handleMouseUp}
      onMouseUp={handleMouseUp}
    >
      {Array.from({ length: height }).map((_, row) =>
        Array.from({ length: width }).map((_, col) => {
          const key = `${row},${col}`;
          const cell = cellMap.get(key);
          const isSelected = selectedPixels.has(key);
          const isInEditingGroup = editingGroupId !== null && cell?.groupId === editingGroupId;

          if (!cell) {
            return (
              <div
                key={key}
                className="bg-black/30"
                style={{ width: cellSize, height: cellSize }}
              />
            );
          }

          return (
            <div
              key={key}
              className={`cursor-pointer transition-all ${
                isSelected ? 'ring-1 ring-white z-10' : ''
              } ${isInEditingGroup ? 'ring-1 ring-yellow-400' : ''}`}
              style={{
                width: cellSize,
                height: cellSize,
                backgroundColor: FRUIT_COLORS[cell.fruitType],
                opacity: isSelected ? 1 : 0.7,
                boxShadow: cell.groupId !== undefined ? `inset 0 0 0 1px ${getGroupColor(cell.groupId)}` : undefined,
              }}
              onMouseDown={() => handleMouseDown(row, col)}
              onMouseEnter={() => handleMouseEnter(row, col)}
              title={`${cell.fruitType} (${row},${col})${cell.groupId !== undefined ? ` - Group ${groups.find(g => g.id === cell.groupId)?.name || cell.groupId}` : ' - No group'}`}
            />
          );
        })
      )}
    </div>
  );
}

// ============================================================================
// LauncherQueueItem Component
// ============================================================================

interface LauncherQueueItemProps {
  launcher: ExplicitLauncherConfig;
  index: number;
  isDragging: boolean;
  isDragOver: boolean;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragOver: (e: React.DragEvent, id: string) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  isFirst: boolean;
  isLast: boolean;
}

function LauncherQueueItem({
  launcher,
  index,
  isDragging,
  isDragOver,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: LauncherQueueItemProps) {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, launcher.id)}
      onDragOver={(e) => onDragOver(e, launcher.id)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, launcher.id)}
      onDragEnd={onDragEnd}
      className={`flex items-center gap-2 p-2 rounded-lg border bg-card transition-all hover:bg-accent/30 ${
        isDragging ? 'opacity-50 scale-95' : ''
      } ${isDragOver ? 'border-primary border-2 bg-accent/70' : 'border-border'}`}
    >
      <div className="cursor-grab active:cursor-grabbing shrink-0 text-muted-foreground hover:text-foreground">
        <GripVertical className="h-4 w-4" />
      </div>
      <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium shrink-0">
        {index + 1}
      </span>
      <ColorSquare fruitType={launcher.fruitType} size="lg" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold" style={{ color: FRUIT_COLORS[launcher.fruitType] }}>
            x{launcher.capacity}
          </span>
          <span className="text-xs text-muted-foreground capitalize">
            {launcher.fruitType}
          </span>
        </div>
        <TileStack fruitType={launcher.fruitType} capacity={launcher.capacity} />
      </div>
      <div className="flex flex-col gap-0.5 shrink-0">
        <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => onMoveUp(launcher.id)} disabled={isFirst}>
          <ChevronUp className="h-3 w-3" />
        </Button>
        <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => onMoveDown(launcher.id)} disabled={isLast}>
          <ChevronDown className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// GroupItem Component - Enhanced with edit button
// ============================================================================

interface GroupItemProps {
  group: PixelGroup;
  pixelCount: number;
  launcherCount: number;
  isEditing: boolean;
  isDragging: boolean;
  isDragOver: boolean;
  onDragStart: (e: React.DragEvent, id: number) => void;
  onDragOver: (e: React.DragEvent, id: number) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, id: number) => void;
  onDragEnd: () => void;
  onDelete: (id: number) => void;
  onNameChange: (id: number, name: string) => void;
  onEditClick: (id: number) => void;
}

function GroupItem({
  group,
  pixelCount,
  launcherCount,
  isEditing,
  isDragging,
  isDragOver,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  onDelete,
  onNameChange,
  onEditClick,
}: GroupItemProps) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [editName, setEditName] = useState(group.name);

  const handleNameSubmit = () => {
    onNameChange(group.id, editName);
    setIsRenaming(false);
  };

  // Get unique colors in this group from colorTypes
  const uniqueColors = group.colorTypes;

  return (
    <div
      draggable={!isEditing}
      onDragStart={(e) => !isEditing && onDragStart(e, group.id)}
      onDragOver={(e) => !isEditing && onDragOver(e, group.id)}
      onDragLeave={onDragLeave}
      onDrop={(e) => !isEditing && onDrop(e, group.id)}
      onDragEnd={onDragEnd}
      className={`flex items-center gap-2 p-2 rounded-lg border bg-card transition-all ${
        isDragging ? 'opacity-50 scale-95' : ''
      } ${isDragOver ? 'border-primary border-2 bg-accent/70' : 'border-border'} ${
        isEditing ? 'ring-2 ring-yellow-400 bg-yellow-400/10' : ''
      }`}
    >
      {!isEditing && (
        <div className="cursor-grab active:cursor-grabbing shrink-0 text-muted-foreground hover:text-foreground">
          <GripVertical className="h-4 w-4" />
        </div>
      )}

      <div className="flex gap-1 shrink-0">
        {uniqueColors.slice(0, 4).map((fruit, idx) => (
          <ColorSquare key={idx} fruitType={fruit} size="md" />
        ))}
        {uniqueColors.length > 4 && (
          <span className="text-[10px] text-muted-foreground">+{uniqueColors.length - 4}</span>
        )}
      </div>

      {isRenaming ? (
        <Input
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onBlur={handleNameSubmit}
          onKeyDown={(e) => e.key === 'Enter' && handleNameSubmit()}
          className="h-6 text-xs flex-1"
          autoFocus
        />
      ) : (
        <span
          className="text-sm flex-1 cursor-pointer hover:underline truncate"
          onClick={() => setIsRenaming(true)}
        >
          {group.name}
        </span>
      )}

      <div className="flex gap-1 shrink-0">
        <Badge variant="secondary" className="text-[10px]">
          {pixelCount}px
        </Badge>
        <Badge variant="outline" className="text-[10px]">
          {launcherCount} L
        </Badge>
      </div>

      <Button
        variant={isEditing ? 'default' : 'ghost'}
        size="sm"
        className="h-6 w-6 p-0"
        onClick={() => onEditClick(group.id)}
        title={isEditing ? 'Stop editing' : 'Edit pixels in group'}
      >
        {isEditing ? <Check className="h-3 w-3" /> : <Pencil className="h-3 w-3" />}
      </Button>

      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
        onClick={() => onDelete(group.id)}
      >
        <Trash2 className="h-3 w-3" />
      </Button>
    </div>
  );
}

// ============================================================================
// StageItem Component
// ============================================================================

interface StageItemProps {
  stage: UnlockStage;
  groups: PixelGroup[];
  onGroupToggle: (stageId: number, groupId: number) => void;
  onDelete: (id: number) => void;
  onNameChange: (id: number, name: string) => void;
}

function StageItem({ stage, groups, onGroupToggle, onDelete, onNameChange }: StageItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(stage.name);

  const handleNameSubmit = () => {
    onNameChange(stage.id, editName);
    setIsEditing(false);
  };

  return (
    <div className="p-3 rounded-lg border border-border bg-card space-y-2">
      <div className="flex items-center justify-between">
        {isEditing ? (
          <Input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleNameSubmit}
            onKeyDown={(e) => e.key === 'Enter' && handleNameSubmit()}
            className="h-6 text-xs w-32"
            autoFocus
          />
        ) : (
          <span className="text-sm font-medium cursor-pointer hover:underline" onClick={() => setIsEditing(true)}>
            {stage.name}
          </span>
        )}
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive" onClick={() => onDelete(stage.id)}>
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
      <div className="flex flex-wrap gap-1">
        {groups.map((group) => {
          const isIncluded = stage.groupIds.includes(group.id);
          return (
            <button
              key={group.id}
              onClick={() => onGroupToggle(stage.id, group.id)}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                isIncluded
                  ? 'bg-primary/20 border border-primary text-primary'
                  : 'bg-muted/30 border border-transparent text-muted-foreground hover:bg-muted/50'
              }`}
            >
              {group.colorTypes.slice(0, 2).map((fruit, idx) => (
                <ColorSquare key={idx} fruitType={fruit} size="sm" />
              ))}
              <span className="truncate max-w-[60px]">{group.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function LauncherOrderEditor({
  pixelArt,
  pixelArtWidth,
  pixelArtHeight,
  config,
  onChange,
  onPixelArtChange,
  sinkStacks,
  waitingStandSlots = 7,
  onSinkStacksChange,
}: LauncherOrderEditorProps) {
  const [showGroups, setShowGroups] = useState(true);
  const [showStages, setShowStages] = useState(false);
  const [showPixelEditor, setShowPixelEditor] = useState(false);

  // Pixel selection state
  const [selectedPixels, setSelectedPixels] = useState<Set<string>>(new Set());
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null);
  const [newGroupName, setNewGroupName] = useState('');

  // Track if we've already synced the initial config
  const hasInitializedRef = useRef(false);

  // Initialize config if not provided
  const currentConfig = useMemo(() => {
    if (config) return config;
    if (pixelArt.length === 0) return null;
    return generateInitialConfig(pixelArt);
  }, [config, pixelArt]);

  // Sync generated config to parent when config prop is null but we have pixelArt
  useEffect(() => {
    if (!hasInitializedRef.current && config === null && currentConfig !== null && pixelArt.length > 0) {
      hasInitializedRef.current = true;
      // Also update pixel art with groupIds
      if (onPixelArtChange) {
        const updatedPixelArt = pixelArt.map(cell => {
          const group = currentConfig.groups.find(g => g.colorTypes.includes(cell.fruitType));
          return { ...cell, groupId: group?.id };
        });
        onPixelArtChange(updatedPixelArt);
      }
      onChange(currentConfig);
    }
    // Reset the flag if config becomes null again (e.g., new pixel art loaded)
    if (config !== null) {
      hasInitializedRef.current = true;
    }
  }, [config, currentConfig, pixelArt, onChange, onPixelArtChange]);

  // Drag state for groups
  const [draggedGroupId, setDraggedGroupId] = useState<number | null>(null);
  const [dragOverGroupId, setDragOverGroupId] = useState<number | null>(null);

  // Drag state for launchers
  const [draggedLauncherId, setDraggedLauncherId] = useState<string | null>(null);
  const [dragOverLauncherId, setDragOverLauncherId] = useState<string | null>(null);

  // Calculate pixel counts per group
  const groupPixelCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const cell of pixelArt) {
      if (cell.groupId !== undefined) {
        counts.set(cell.groupId, (counts.get(cell.groupId) || 0) + 1);
      }
    }
    return counts;
  }, [pixelArt]);

  // Calculate launcher counts per group
  const groupLauncherCounts = useMemo(() => {
    if (!currentConfig) return new Map<number, number>();
    const counts = new Map<number, number>();
    for (const launcher of currentConfig.launchers) {
      counts.set(launcher.groupId, (counts.get(launcher.groupId) || 0) + 1);
    }
    return counts;
  }, [currentConfig]);

  // Pixels without a group
  const ungroupedPixelCount = useMemo(() => {
    return pixelArt.filter(c => c.groupId === undefined).length;
  }, [pixelArt]);

  // Summary stats
  const stats = useMemo(() => {
    if (!currentConfig) return { totalLaunchers: 0, totalPixels: 0, colorBreakdown: [] as { fruit: FruitType; pixels: number; launchers: number }[] };

    const colorBreakdown: { fruit: FruitType; pixels: number; launchers: number }[] = [];
    const launchersByFruit = new Map<FruitType, number>();

    for (const launcher of currentConfig.launchers) {
      launchersByFruit.set(launcher.fruitType, (launchersByFruit.get(launcher.fruitType) || 0) + 1);
    }

    for (const fruit of ALL_FRUITS) {
      const pixels = pixelArt.filter(c => c.fruitType === fruit).length;
      const launchers = launchersByFruit.get(fruit) || 0;
      if (pixels > 0) {
        colorBreakdown.push({ fruit, pixels, launchers });
      }
    }

    return {
      totalLaunchers: currentConfig.launchers.length,
      totalPixels: pixelArt.length,
      colorBreakdown,
    };
  }, [currentConfig, pixelArt]);

  // Selected pixels color breakdown
  const selectedColorBreakdown = useMemo(() => {
    if (selectedPixels.size === 0) return [];

    const colorCounts = new Map<FruitType, number>();
    for (const cell of pixelArt) {
      if (selectedPixels.has(`${cell.row},${cell.col}`)) {
        colorCounts.set(cell.fruitType, (colorCounts.get(cell.fruitType) || 0) + 1);
      }
    }

    const breakdown: { fruit: FruitType; count: number }[] = [];
    for (const [fruit, count] of colorCounts) {
      breakdown.push({ fruit, count });
    }
    // Sort by count descending
    breakdown.sort((a, b) => b.count - a.count);
    return breakdown;
  }, [selectedPixels, pixelArt]);

  // Mode toggle
  const handleModeChange = useCallback((mode: 'auto' | 'manual') => {
    if (!currentConfig) return;

    if (mode === 'auto') {
      const newConfig = generateInitialConfig(pixelArt);
      onChange(newConfig);
      // Update pixel art with new groupIds
      if (onPixelArtChange) {
        const updatedPixelArt = pixelArt.map(cell => {
          const group = newConfig.groups.find(g => g.colorTypes.includes(cell.fruitType));
          return { ...cell, groupId: group?.id };
        });
        onPixelArtChange(updatedPixelArt);
      }
    } else {
      onChange({ ...currentConfig, mode });
    }
  }, [currentConfig, pixelArt, onChange, onPixelArtChange]);

  // ============================================================================
  // Pixel Selection Handlers
  // ============================================================================

  const handlePixelClick = useCallback((row: number, col: number) => {
    const key = `${row},${col}`;

    if (editingGroupId !== null) {
      // We're editing a group - toggle pixel membership
      const cell = pixelArt.find(c => c.row === row && c.col === col);
      if (!cell || !onPixelArtChange || !currentConfig) return;

      const updatedPixelArt = pixelArt.map(c => {
        if (c.row === row && c.col === col) {
          // Toggle: if already in this group, remove; otherwise add
          const newGroupId = c.groupId === editingGroupId ? undefined : editingGroupId;
          return { ...c, groupId: newGroupId };
        }
        return c;
      });
      onPixelArtChange(updatedPixelArt);

      // Regenerate launchers
      const newLaunchers = generateLaunchersFromPixelArt(updatedPixelArt, currentConfig.groups);
      onChange({ ...currentConfig, launchers: newLaunchers, mode: 'manual' });
    } else {
      // Normal selection mode
      setSelectedPixels(prev => {
        const newSet = new Set(prev);
        if (newSet.has(key)) {
          newSet.delete(key);
        } else {
          newSet.add(key);
        }
        return newSet;
      });
    }
  }, [editingGroupId, pixelArt, onPixelArtChange, currentConfig, onChange]);

  const handlePixelDrag = useCallback((row: number, col: number) => {
    const key = `${row},${col}`;

    if (editingGroupId !== null) {
      // We're editing a group - add pixel to group
      const cell = pixelArt.find(c => c.row === row && c.col === col);
      if (!cell || !onPixelArtChange || !currentConfig) return;
      if (cell.groupId === editingGroupId) return; // Already in group

      const updatedPixelArt = pixelArt.map(c => {
        if (c.row === row && c.col === col) {
          return { ...c, groupId: editingGroupId };
        }
        return c;
      });
      onPixelArtChange(updatedPixelArt);

      // Regenerate launchers
      const newLaunchers = generateLaunchersFromPixelArt(updatedPixelArt, currentConfig.groups);
      onChange({ ...currentConfig, launchers: newLaunchers, mode: 'manual' });
    } else {
      // Normal selection - add to selection
      setSelectedPixels(prev => {
        const newSet = new Set(prev);
        newSet.add(key);
        return newSet;
      });
    }
  }, [editingGroupId, pixelArt, onPixelArtChange, currentConfig, onChange]);

  const clearSelection = useCallback(() => {
    setSelectedPixels(new Set());
  }, []);

  // Create new group from selected pixels
  const createGroupFromSelection = useCallback(() => {
    if (!currentConfig || !onPixelArtChange || selectedPixels.size === 0) return;

    const groupName = newGroupName.trim() || `Group ${currentConfig.groups.length + 1}`;
    const newGroupId = generateGroupId();

    // Get unique fruit types in selection
    const selectedCells = pixelArt.filter(c => selectedPixels.has(`${c.row},${c.col}`));
    const colorTypes = Array.from(new Set(selectedCells.map(c => c.fruitType)));

    const newGroup: PixelGroup = {
      id: newGroupId,
      name: groupName,
      colorTypes,
      order: currentConfig.groups.length,
    };

    // Update pixel art with new groupId
    const updatedPixelArt = pixelArt.map(cell => {
      if (selectedPixels.has(`${cell.row},${cell.col}`)) {
        return { ...cell, groupId: newGroupId };
      }
      return cell;
    });
    onPixelArtChange(updatedPixelArt);

    // Update config
    const newGroups = [...currentConfig.groups, newGroup];
    const newLaunchers = generateLaunchersFromPixelArt(updatedPixelArt, newGroups);

    // Add to first stage if exists
    const newStages = currentConfig.unlockStages.map((s, i) =>
      i === 0 ? { ...s, groupIds: [...s.groupIds, newGroupId] } : s
    );

    onChange({
      ...currentConfig,
      groups: newGroups,
      launchers: newLaunchers,
      unlockStages: newStages,
      mode: 'manual',
    });

    // Clear selection and name
    setSelectedPixels(new Set());
    setNewGroupName('');
  }, [currentConfig, onPixelArtChange, selectedPixels, pixelArt, newGroupName, onChange]);

  // ============================================================================
  // Group Edit Mode
  // ============================================================================

  const handleEditGroupClick = useCallback((groupId: number) => {
    if (editingGroupId === groupId) {
      // Stop editing
      setEditingGroupId(null);
    } else {
      // Start editing this group
      setEditingGroupId(groupId);
      setSelectedPixels(new Set()); // Clear selection when entering edit mode
    }
  }, [editingGroupId]);

  // ============================================================================
  // Launcher handlers
  // ============================================================================

  const handleLauncherDragStart = useCallback((e: React.DragEvent, id: string) => {
    setDraggedLauncherId(id);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleLauncherDragOver = useCallback((e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedLauncherId && id !== draggedLauncherId) {
      setDragOverLauncherId(id);
    }
  }, [draggedLauncherId]);

  const handleLauncherDragLeave = useCallback(() => {
    setDragOverLauncherId(null);
  }, []);

  const handleLauncherDrop = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!currentConfig || !draggedLauncherId || draggedLauncherId === targetId) {
      setDraggedLauncherId(null);
      setDragOverLauncherId(null);
      return;
    }

    const launchers = [...currentConfig.launchers];
    const draggedIndex = launchers.findIndex(l => l.id === draggedLauncherId);
    const targetIndex = launchers.findIndex(l => l.id === targetId);

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedLauncherId(null);
      setDragOverLauncherId(null);
      return;
    }

    const [draggedLauncher] = launchers.splice(draggedIndex, 1);
    launchers.splice(targetIndex, 0, draggedLauncher);

    const reorderedLaunchers = launchers.map((l, i) => ({ ...l, orderIndex: i }));

    onChange({ ...currentConfig, launchers: reorderedLaunchers, mode: 'manual' });

    setDraggedLauncherId(null);
    setDragOverLauncherId(null);
  }, [currentConfig, draggedLauncherId, onChange]);

  const handleLauncherDragEnd = useCallback(() => {
    setDraggedLauncherId(null);
    setDragOverLauncherId(null);
  }, []);

  const handleLauncherMoveUp = useCallback((id: string) => {
    if (!currentConfig) return;
    const launchers = [...currentConfig.launchers].sort((a, b) => a.orderIndex - b.orderIndex);
    const index = launchers.findIndex(l => l.id === id);
    if (index <= 0) return;
    [launchers[index], launchers[index - 1]] = [launchers[index - 1], launchers[index]];
    const reorderedLaunchers = launchers.map((l, i) => ({ ...l, orderIndex: i }));
    onChange({ ...currentConfig, launchers: reorderedLaunchers, mode: 'manual' });
  }, [currentConfig, onChange]);

  const handleLauncherMoveDown = useCallback((id: string) => {
    if (!currentConfig) return;
    const launchers = [...currentConfig.launchers].sort((a, b) => a.orderIndex - b.orderIndex);
    const index = launchers.findIndex(l => l.id === id);
    if (index === -1 || index >= launchers.length - 1) return;
    [launchers[index], launchers[index + 1]] = [launchers[index + 1], launchers[index]];
    const reorderedLaunchers = launchers.map((l, i) => ({ ...l, orderIndex: i }));
    onChange({ ...currentConfig, launchers: reorderedLaunchers, mode: 'manual' });
  }, [currentConfig, onChange]);

  // ============================================================================
  // Group handlers
  // ============================================================================

  const handleGroupDragStart = useCallback((e: React.DragEvent, id: number) => {
    setDraggedGroupId(id);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleGroupDragOver = useCallback((e: React.DragEvent, id: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedGroupId && id !== draggedGroupId) {
      setDragOverGroupId(id);
    }
  }, [draggedGroupId]);

  const handleGroupDragLeave = useCallback(() => {
    setDragOverGroupId(null);
  }, []);

  const handleGroupDrop = useCallback((e: React.DragEvent, targetId: number) => {
    e.preventDefault();
    if (!currentConfig || !draggedGroupId || draggedGroupId === targetId) {
      setDraggedGroupId(null);
      setDragOverGroupId(null);
      return;
    }

    const groups = [...currentConfig.groups];
    const draggedIndex = groups.findIndex(g => g.id === draggedGroupId);
    const targetIndex = groups.findIndex(g => g.id === targetId);

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedGroupId(null);
      setDragOverGroupId(null);
      return;
    }

    const [draggedGroup] = groups.splice(draggedIndex, 1);
    groups.splice(targetIndex, 0, draggedGroup);

    const reorderedGroups = groups.map((g, i) => ({ ...g, order: i }));
    const newLaunchers = generateLaunchersFromPixelArt(pixelArt, reorderedGroups);

    onChange({ ...currentConfig, groups: reorderedGroups, launchers: newLaunchers, mode: 'manual' });

    setDraggedGroupId(null);
    setDragOverGroupId(null);
  }, [currentConfig, draggedGroupId, pixelArt, onChange]);

  const handleGroupDragEnd = useCallback(() => {
    setDraggedGroupId(null);
    setDragOverGroupId(null);
  }, []);

  const handleGroupDelete = useCallback((id: number) => {
    if (!currentConfig || !onPixelArtChange) return;

    // Remove groupId from pixels
    const updatedPixelArt = pixelArt.map(cell =>
      cell.groupId === id ? { ...cell, groupId: undefined } : cell
    );
    onPixelArtChange(updatedPixelArt);

    // Remove group
    const groups = currentConfig.groups.filter(g => g.id !== id);
    const reorderedGroups = groups.map((g, i) => ({ ...g, order: i }));

    // Update stages
    const unlockStages = currentConfig.unlockStages.map(s => ({
      ...s,
      groupIds: s.groupIds.filter(gid => gid !== id),
    }));

    const newLaunchers = generateLaunchersFromPixelArt(updatedPixelArt, reorderedGroups);

    onChange({ ...currentConfig, groups: reorderedGroups, launchers: newLaunchers, unlockStages });

    if (editingGroupId === id) {
      setEditingGroupId(null);
    }
  }, [currentConfig, pixelArt, onPixelArtChange, onChange, editingGroupId]);

  const handleGroupNameChange = useCallback((id: number, name: string) => {
    if (!currentConfig) return;
    const groups = currentConfig.groups.map(g => g.id === id ? { ...g, name } : g);
    onChange({ ...currentConfig, groups });
  }, [currentConfig, onChange]);

  const handleAddEmptyGroup = useCallback(() => {
    if (!currentConfig) return;

    const newGroup: PixelGroup = {
      id: generateGroupId(),
      name: `Group ${currentConfig.groups.length + 1}`,
      colorTypes: [],
      order: currentConfig.groups.length,
    };

    const groups = [...currentConfig.groups, newGroup];
    const newStages = currentConfig.unlockStages.map((s, i) =>
      i === 0 ? { ...s, groupIds: [...s.groupIds, newGroup.id] } : s
    );

    onChange({ ...currentConfig, groups, unlockStages: newStages });
  }, [currentConfig, onChange]);

  // ============================================================================
  // Stage handlers
  // ============================================================================

  const handleStageGroupToggle = useCallback((stageId: number, groupId: number) => {
    if (!currentConfig) return;
    const unlockStages = currentConfig.unlockStages.map(s => {
      if (s.id !== stageId) return s;
      const isIncluded = s.groupIds.includes(groupId);
      return { ...s, groupIds: isIncluded ? s.groupIds.filter(id => id !== groupId) : [...s.groupIds, groupId] };
    });
    onChange({ ...currentConfig, unlockStages });
  }, [currentConfig, onChange]);

  const handleStageDelete = useCallback((id: number) => {
    if (!currentConfig || currentConfig.unlockStages.length <= 1) return;
    const unlockStages = currentConfig.unlockStages.filter(s => s.id !== id);
    onChange({ ...currentConfig, unlockStages });
  }, [currentConfig, onChange]);

  const handleStageNameChange = useCallback((id: number, name: string) => {
    if (!currentConfig) return;
    const unlockStages = currentConfig.unlockStages.map(s => s.id === id ? { ...s, name } : s);
    onChange({ ...currentConfig, unlockStages });
  }, [currentConfig, onChange]);

  const handleAddStage = useCallback(() => {
    if (!currentConfig) return;
    const newStage: UnlockStage = { id: Date.now(), name: `Stage ${currentConfig.unlockStages.length + 1}`, groupIds: [] };
    onChange({ ...currentConfig, unlockStages: [...currentConfig.unlockStages, newStage] });
  }, [currentConfig, onChange]);

  // ============================================================================
  // Render
  // ============================================================================

  if (pixelArt.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Create pixel art first to configure launcher order.
      </div>
    );
  }

  if (!currentConfig) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Loading configuration...
      </div>
    );
  }

  const sortedLaunchers = [...currentConfig.launchers].sort((a, b) => a.orderIndex - b.orderIndex);

  return (
    <div className="space-y-4">
      {/* Mode Toggle & Summary */}
      <div className="flex items-center justify-between gap-4 p-3 bg-muted/30 rounded-lg">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium">Mode:</span>
          <div className="flex gap-1">
            <Button variant={currentConfig.mode === 'auto' ? 'default' : 'outline'} size="sm" onClick={() => handleModeChange('auto')}>
              Auto
            </Button>
            <Button variant={currentConfig.mode === 'manual' ? 'default' : 'outline'} size="sm" onClick={() => handleModeChange('manual')}>
              Manual
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{stats.totalPixels} pixels</span>
          <span>{stats.totalLaunchers} launchers</span>
          <span>{currentConfig.groups.length} groups</span>
        </div>
      </div>

      {/* Pixel Editor Section */}
      <Card>
        <CardHeader className="pb-2 cursor-pointer" onClick={() => setShowPixelEditor(!showPixelEditor)}>
          <CardTitle className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <MousePointer2 className="h-4 w-4" />
              Pixel Group Editor
              {ungroupedPixelCount > 0 && (
                <Badge variant="destructive" className="text-[10px]">
                  {ungroupedPixelCount} ungrouped
                </Badge>
              )}
            </div>
            {showPixelEditor ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </CardTitle>
        </CardHeader>
        {showPixelEditor && (
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {editingGroupId !== null
                ? 'Click or drag on pixels to add/remove them from the selected group.'
                : 'Select pixels below, then create a new group, or click the edit button on a group to modify it.'}
            </p>

            {/* Pixel Selection Grid */}
            <div className="flex justify-center">
              <PixelSelectionGrid
                pixelArt={pixelArt}
                width={pixelArtWidth}
                height={pixelArtHeight}
                selectedPixels={selectedPixels}
                editingGroupId={editingGroupId}
                groups={currentConfig.groups}
                onPixelClick={handlePixelClick}
                onPixelDrag={handlePixelDrag}
              />
            </div>

            {/* Selection Actions */}
            {editingGroupId === null && (
              <div className="space-y-2">
                {/* Selected pixels color breakdown */}
                {selectedColorBreakdown.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 p-2 bg-muted/30 rounded">
                    <span className="text-xs text-muted-foreground mr-1">Selected:</span>
                    {selectedColorBreakdown.map(({ fruit, count }) => (
                      <div key={fruit} className="flex items-center gap-1 px-1.5 py-0.5 bg-card rounded border border-border">
                        <ColorSquare fruitType={fruit} size="xs" />
                        <span className="text-[10px] font-medium">{count}</span>
                      </div>
                    ))}
                    <span className="text-xs text-muted-foreground ml-1">= {selectedPixels.size} total</span>
                  </div>
                )}

                {/* Create group controls */}
                <div className="flex items-center gap-2 flex-wrap">
                  <Input
                    placeholder="New group name..."
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    className="h-8 text-sm flex-1 min-w-[150px]"
                  />
                  <Button
                    size="sm"
                    onClick={createGroupFromSelection}
                    disabled={selectedPixels.size === 0}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Create Group ({selectedPixels.size})
                  </Button>
                  {selectedPixels.size > 0 && (
                    <Button size="sm" variant="outline" onClick={clearSelection}>
                      <X className="h-3 w-3 mr-1" />
                      Clear
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Editing Mode Indicator */}
            {editingGroupId !== null && (
              <div className="flex items-center justify-between p-2 bg-yellow-400/20 rounded border border-yellow-400/50">
                <span className="text-sm text-yellow-200">
                  Editing: {currentConfig.groups.find(g => g.id === editingGroupId)?.name || 'Group'}
                </span>
                <Button size="sm" variant="outline" onClick={() => setEditingGroupId(null)}>
                  <Check className="h-3 w-3 mr-1" />
                  Done
                </Button>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Groups Section */}
      <Card>
        <CardHeader className="pb-2 cursor-pointer" onClick={() => setShowGroups(!showGroups)}>
          <CardTitle className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4" />
              Groups
              <Badge variant="outline" className="text-[10px]">{currentConfig.groups.length}</Badge>
            </div>
            {showGroups ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </CardTitle>
        </CardHeader>
        {showGroups && (
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground mb-2">
              Drag groups to reorder. Click the pencil icon to edit pixels in a group.
            </p>
            <div className="space-y-2 max-h-[200px] overflow-y-auto">
              {currentConfig.groups
                .sort((a, b) => a.order - b.order)
                .map((group) => (
                  <GroupItem
                    key={group.id}
                    group={group}
                    pixelCount={groupPixelCounts.get(group.id) || 0}
                    launcherCount={groupLauncherCounts.get(group.id) || 0}
                    isEditing={editingGroupId === group.id}
                    isDragging={draggedGroupId === group.id}
                    isDragOver={dragOverGroupId === group.id}
                    onDragStart={handleGroupDragStart}
                    onDragOver={handleGroupDragOver}
                    onDragLeave={handleGroupDragLeave}
                    onDrop={handleGroupDrop}
                    onDragEnd={handleGroupDragEnd}
                    onDelete={handleGroupDelete}
                    onNameChange={handleGroupNameChange}
                    onEditClick={handleEditGroupClick}
                  />
                ))}
            </div>
            <Button variant="outline" size="sm" className="w-full" onClick={handleAddEmptyGroup}>
              <Plus className="h-3 w-3 mr-1" />
              Add Empty Group
            </Button>
          </CardContent>
        )}
      </Card>

      {/* Order Difficulty Analysis */}
      {sinkStacks && sinkStacks.length > 0 && (
        <OrderDifficultyPanel
          pixelArt={pixelArt}
          sinkStacks={sinkStacks}
          waitingStandSlots={waitingStandSlots}
          launcherOrderConfig={currentConfig}
          onSinkStacksChange={onSinkStacksChange}
        />
      )}

      {/* Launcher Queue */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <ListOrdered className="h-4 w-4" />
              Launcher Queue
              <Badge variant="secondary" className="text-[10px]">{currentConfig.launchers.length} launchers</Badge>
            </div>
            <span className="text-xs font-normal text-muted-foreground">
              {currentConfig.mode === 'auto' ? 'Shuffled each game' : 'Fixed order'}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1 max-h-[300px] overflow-y-auto pr-1">
            {sortedLaunchers.map((launcher, index) => (
              <LauncherQueueItem
                key={launcher.id}
                launcher={launcher}
                index={index}
                isDragging={draggedLauncherId === launcher.id}
                isDragOver={dragOverLauncherId === launcher.id}
                onDragStart={handleLauncherDragStart}
                onDragOver={handleLauncherDragOver}
                onDragLeave={handleLauncherDragLeave}
                onDrop={handleLauncherDrop}
                onDragEnd={handleLauncherDragEnd}
                onMoveUp={handleLauncherMoveUp}
                onMoveDown={handleLauncherMoveDown}
                isFirst={index === 0}
                isLast={index === sortedLaunchers.length - 1}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Unlock Stages */}
      <Card>
        <CardHeader className="pb-2 cursor-pointer" onClick={() => setShowStages(!showStages)}>
          <CardTitle className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <Unlock className="h-4 w-4" />
              Unlock Stages
              <Badge variant="outline" className="text-[10px]">{currentConfig.unlockStages.length}</Badge>
            </div>
            {showStages ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </CardTitle>
        </CardHeader>
        {showStages && (
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground mb-2">
              Define which groups unlock progressively during gameplay.
            </p>
            <div className="space-y-2 max-h-[150px] overflow-y-auto">
              {currentConfig.unlockStages.map((stage) => (
                <StageItem
                  key={stage.id}
                  stage={stage}
                  groups={currentConfig.groups}
                  onGroupToggle={handleStageGroupToggle}
                  onDelete={handleStageDelete}
                  onNameChange={handleStageNameChange}
                />
              ))}
            </div>
            <Button variant="outline" size="sm" className="w-full" onClick={handleAddStage}>
              <Plus className="h-3 w-3 mr-1" />
              Add Stage
            </Button>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
