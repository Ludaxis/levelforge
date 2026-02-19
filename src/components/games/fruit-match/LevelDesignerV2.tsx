'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Progress } from '@/components/ui/progress';
import {
  FruitType,
  PixelCell,
  FruitMatchLevel,
  DesignedFruitMatchLevel,
  FRUIT_COLORS,
  ALL_FRUITS,
  VARIANT_NAMES,
} from '@/types/fruitMatch';
import {
  calculateLevelMetrics,
  generateSinkStacks,
  getRequiredFruitCounts,
} from '@/lib/fruitMatchUtils';
import {
  StudioDifficultyParams,
  StudioDifficultyResult,
  calculateStudioDifficulty,
  StudioGameConfig,
  findMaxSolvableDepth,
} from '@/lib/useStudioGame';
import {
  targetDifficulty,
  simulateStudioGame,
  StudioSimulationResult,
  DifficultyRecipe,
  scoreToTier,
} from '@/lib/studioDifficultyEngine';
import {
  COLOR_TYPE_TO_FRUIT,
  COLOR_TYPE_TO_HEX,
  FRUIT_TO_COLOR_TYPE,
  DIFFICULTY_TO_NUMBER,
  NUMBER_TO_DIFFICULTY,
  isReferenceFormat,
  importFromReferenceFormat,
  isFullPixelArtFormat,
  importFromFullPixelArtFormat,
  exportStudioLevel,
  StudioExportData,
} from '@/lib/juicyBlastExport';
import { StudioGameBoard } from './StudioGameBoard';
import {
  Upload,
  Download,
  Plus,
  Trash2,
  GripVertical,
  ChevronUp,
  ChevronDown,
  ZoomIn,
  ZoomOut,
  Maximize,
  Eraser,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Lock,
  Eye,
  Layers,
  Play,
  Paintbrush,
  MousePointer,
  Target,
  Zap,
  Hash,
  Loader2,
} from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

interface LevelDesignerV2Props {
  onPlayLevel: (level: FruitMatchLevel) => void;
  onAddToCollection?: (level: DesignedFruitMatchLevel) => void;
  levelNumber?: number;
  onLevelNumberChange?: (num: number) => void;
  maxLevelNumber?: number;
  editingLevel?: DesignedFruitMatchLevel | null;
}

interface StudioPixelCell {
  row: number;
  col: number;
  colorType: number;
  colorGroup: number;
  colorHex: string;
  group: number;
  fruitType: FruitType;
}

interface StudioGroup {
  id: number;
  name: string;
  pixelsByColor: Record<number, number>;
  totalPixels: number;
}

interface StudioLauncher {
  id: string;
  colorType: number;
  pixelCount: number;
  group: number;
  isLocked: boolean;
  order: number;
}

interface StudioSelectableItem {
  id: string;
  colorType: number;
  variant: number;
  layer: 'A' | 'B' | 'C';
  order: number;
}

// ============================================================================
// Constants
// ============================================================================

const DIFFICULTY_COLORS: Record<string, string> = {
  trivial: 'bg-gray-500',
  easy: 'bg-green-500',
  medium: 'bg-yellow-500 text-black',
  hard: 'bg-orange-500',
  expert: 'bg-red-500',
  nightmare: 'bg-purple-500',
};

// ============================================================================
// Helper: generate unique IDs
// ============================================================================

let _idCounter = 0;
function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${++_idCounter}`;
}

// ============================================================================
// ColorSquare helper
// ============================================================================

function ColorSwatch({ colorType, size = 20, className = '' }: { colorType: number; size?: number; className?: string }) {
  const hex = COLOR_TYPE_TO_HEX[colorType] || '888888';
  return (
    <div
      className={`rounded-sm border border-white/20 shrink-0 ${className}`}
      style={{ backgroundColor: `#${hex}`, width: size, height: size }}
      title={COLOR_TYPE_TO_FRUIT[colorType] || `Color ${colorType}`}
    />
  );
}

// ============================================================================
// Section 1: Paint Tool Bar
// ============================================================================

function PaintToolBar({
  selectedColorType,
  onSelect,
}: {
  selectedColorType: number | 'eraser';
  onSelect: (ct: number | 'eraser') => void;
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-muted-foreground mr-1">Paint:</span>
          {Array.from({ length: 9 }, (_, i) => i).map((ct) => (
            <button
              key={ct}
              onClick={() => onSelect(ct)}
              className={`w-8 h-8 rounded border-2 transition-all ${
                selectedColorType === ct
                  ? 'border-white scale-110 ring-2 ring-primary ring-offset-1 ring-offset-background'
                  : 'border-white/20 hover:border-white/50'
              }`}
              style={{ backgroundColor: `#${COLOR_TYPE_TO_HEX[ct]}` }}
              title={COLOR_TYPE_TO_FRUIT[ct]}
            />
          ))}
          <button
            onClick={() => onSelect('eraser')}
            className={`w-8 h-8 rounded border-2 flex items-center justify-center transition-all ${
              selectedColorType === 'eraser'
                ? 'border-white scale-110 ring-2 ring-primary ring-offset-1 ring-offset-background bg-muted'
                : 'border-white/20 hover:border-white/50 bg-muted/50'
            }`}
            title="Eraser"
          >
            <Eraser className="h-4 w-4" />
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Section 2: Artwork Canvas
// ============================================================================

function ArtworkCanvas({
  pixels,
  width,
  height,
  zoom,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onWheel,
  onUploadClick,
  onCellPaint,
  onGroupPaint,
  paintColor,
  hasData,
  groupPaintMode,
  groups,
  selectedGroupId,
}: {
  pixels: Map<string, StudioPixelCell>;
  width: number;
  height: number;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onWheel: (e: React.WheelEvent) => void;
  onUploadClick: () => void;
  onCellPaint: (row: number, col: number) => void;
  onGroupPaint: (row: number, col: number) => void;
  paintColor: number | 'eraser';
  hasData: boolean;
  groupPaintMode: boolean;
  groups: StudioGroup[];
  selectedGroupId: number | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [isPainting, setIsPainting] = useState(false);
  const lastPaintedCell = useRef<{ row: number; col: number } | null>(null);

  const maxCanvasSize = 600;
  const cellSize = Math.max(1, Math.floor(maxCanvasSize / Math.max(width, height)));
  const canvasWidth = width * cellSize;
  const canvasHeight = height * cellSize;

  // Build group index map for overlay colors
  const groupIndexMap = useMemo(() => {
    const map = new Map<number, number>();
    groups.forEach((g, idx) => map.set(g.id, idx));
    return map;
  }, [groups]);

  // Draw main canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Grid
    ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        ctx.fillRect(c * cellSize, r * cellSize, cellSize - 0.5, cellSize - 0.5);
      }
    }

    // Pixels - use original ColorHex
    pixels.forEach((cell) => {
      ctx.fillStyle = `#${cell.colorHex}`;
      ctx.fillRect(cell.col * cellSize, cell.row * cellSize, cellSize - 0.5, cellSize - 0.5);
    });
  }, [pixels, width, height, cellSize, canvasWidth, canvasHeight]);

  // Draw group overlay when in group paint mode
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    if (!groupPaintMode) return;

    pixels.forEach((cell) => {
      const gIdx = groupIndexMap.get(cell.group);
      if (gIdx === undefined) return;
      const color = getGroupColor(gIdx);
      const isSelectedGroup = cell.group === selectedGroupId;

      // Semi-transparent overlay
      ctx.fillStyle = isSelectedGroup ? `${color}55` : `${color}30`;
      ctx.fillRect(cell.col * cellSize, cell.row * cellSize, cellSize - 0.5, cellSize - 0.5);

      // Border for selected group pixels
      if (isSelectedGroup && cellSize >= 4) {
        ctx.strokeStyle = `${color}CC`;
        ctx.lineWidth = 1;
        ctx.strokeRect(
          cell.col * cellSize + 0.5,
          cell.row * cellSize + 0.5,
          cellSize - 1.5,
          cellSize - 1.5,
        );
      }
    });
  }, [pixels, groupPaintMode, groupIndexMap, selectedGroupId, cellSize, canvasWidth, canvasHeight]);

  const getCellFromEvent = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;

      let clientX: number, clientY: number;
      if ('touches' in e) {
        if (e.touches.length === 0) return null;
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }
      const x = (clientX - rect.left) * scaleX;
      const y = (clientY - rect.top) * scaleY;
      const col = Math.floor(x / cellSize);
      const row = Math.floor(y / cellSize);
      if (row >= 0 && row < height && col >= 0 && col < width) return { row, col };
      return null;
    },
    [cellSize, width, height],
  );

  const doPaint = useCallback(
    (row: number, col: number) => {
      if (lastPaintedCell.current?.row === row && lastPaintedCell.current?.col === col) return;
      lastPaintedCell.current = { row, col };
      if (groupPaintMode) {
        onGroupPaint(row, col);
      } else {
        onCellPaint(row, col);
      }
    },
    [onCellPaint, onGroupPaint, groupPaintMode],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      setIsPainting(true);
      lastPaintedCell.current = null;
      const cell = getCellFromEvent(e);
      if (cell) doPaint(cell.row, cell.col);
    },
    [getCellFromEvent, doPaint],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isPainting) return;
      const cell = getCellFromEvent(e);
      if (cell) doPaint(cell.row, cell.col);
    },
    [isPainting, getCellFromEvent, doPaint],
  );

  const stopPaint = useCallback(() => {
    setIsPainting(false);
    lastPaintedCell.current = null;
  }, []);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      setIsPainting(true);
      lastPaintedCell.current = null;
      const cell = getCellFromEvent(e);
      if (cell) doPaint(cell.row, cell.col);
    },
    [getCellFromEvent, doPaint],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent<HTMLCanvasElement>) => {
      if (!isPainting) return;
      e.preventDefault();
      const cell = getCellFromEvent(e);
      if (cell) doPaint(cell.row, cell.col);
    },
    [isPainting, getCellFromEvent, doPaint],
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          <span>{groupPaintMode ? 'Group Assignment Mode' : 'Artwork Canvas'}</span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={onZoomOut} title="Zoom Out" className="h-7 w-7 p-0">
              <ZoomOut className="h-3.5 w-3.5" />
            </Button>
            <span className="text-xs text-muted-foreground w-12 text-center">{Math.round(zoom * 100)}%</span>
            <Button variant="outline" size="sm" onClick={onZoomIn} title="Zoom In" className="h-7 w-7 p-0">
              <ZoomIn className="h-3.5 w-3.5" />
            </Button>
            <Button variant="outline" size="sm" onClick={onZoomReset} title="Fit" className="h-7 w-7 p-0">
              <Maximize className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <button
            onClick={onUploadClick}
            className="w-full h-40 border-2 border-dashed border-muted rounded-lg flex flex-col items-center justify-center gap-2 hover:border-primary/50 transition-colors"
          >
            <Upload className="h-8 w-8 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Click to upload Pixel Art JSON</span>
            <span className="text-xs text-muted-foreground">Supports full pixel art format &amp; reference format</span>
          </button>
        ) : (
          <div
            className="overflow-auto border border-muted rounded-lg bg-black/50 p-2 flex justify-center"
            style={{ maxHeight: '500px' }}
            onWheel={onWheel}
          >
            <div className="relative" style={{ width: canvasWidth * zoom, height: canvasHeight * zoom }}>
              <canvas
                ref={canvasRef}
                width={canvasWidth}
                height={canvasHeight}
                className="absolute inset-0 select-none touch-none"
                style={{
                  imageRendering: 'pixelated',
                  width: '100%',
                  height: '100%',
                }}
              />
              <canvas
                ref={overlayRef}
                width={canvasWidth}
                height={canvasHeight}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={stopPaint}
                onMouseLeave={stopPaint}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={stopPaint}
                className={`absolute inset-0 select-none touch-none ${groupPaintMode ? 'cursor-pointer' : 'cursor-crosshair'}`}
                style={{
                  imageRendering: 'pixelated',
                  width: '100%',
                  height: '100%',
                }}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Section 3: Artwork Info + Color Palette
// ============================================================================

function ArtworkInfoPanel({
  width,
  height,
  totalPixels,
  colorCounts,
}: {
  width: number;
  height: number;
  totalPixels: number;
  colorCounts: { colorType: number; count: number; hex: string }[];
}) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="grid grid-cols-2 gap-4">
          {/* Left: Artwork Info */}
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Artwork Info</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="p-2 bg-muted/30 rounded">
                <div className="text-muted-foreground text-xs">Size</div>
                <div className="font-medium">{width} x {height}</div>
              </div>
              <div className="p-2 bg-muted/30 rounded">
                <div className="text-muted-foreground text-xs">Pixels</div>
                <div className="font-medium">{totalPixels}</div>
              </div>
              <div className="p-2 bg-muted/30 rounded">
                <div className="text-muted-foreground text-xs">Colors</div>
                <div className="font-medium">{colorCounts.length}</div>
              </div>
            </div>
          </div>

          {/* Right: Color Palette */}
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Color Palette</h4>
            <div className="space-y-1 max-h-[150px] overflow-y-auto">
              {colorCounts.map(({ colorType, count, hex }) => (
                <div key={colorType} className="flex items-center gap-2 text-sm">
                  <div
                    className="w-4 h-4 rounded-sm border border-white/20 shrink-0"
                    style={{ backgroundColor: `#${hex}` }}
                  />
                  <span className="text-xs text-muted-foreground capitalize flex-1">
                    {COLOR_TYPE_TO_FRUIT[colorType] || `Type ${colorType}`}
                  </span>
                  <span className="text-xs font-mono">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Section 4: Grouping
// ============================================================================

// Stable group colors for visual identification
const GROUP_COLORS = [
  '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
  '#EC4899', '#06B6D4', '#F97316', '#6366F1', '#14B8A6',
];

function getGroupColor(index: number): string {
  return GROUP_COLORS[index % GROUP_COLORS.length];
}

function GroupingSection({
  groups,
  selectedGroupId,
  onSelectGroup,
  onAddGroup,
  onDeleteGroup,
  onRenameGroup,
  onReorder,
}: {
  groups: StudioGroup[];
  selectedGroupId: number | null;
  onSelectGroup: (id: number | null) => void;
  onAddGroup: () => void;
  onDeleteGroup: (id: number) => void;
  onRenameGroup: (id: number, name: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
}) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const startRename = (g: StudioGroup) => {
    setEditingId(g.id);
    setEditName(g.name);
  };

  const submitRename = () => {
    if (editingId !== null) {
      onRenameGroup(editingId, editName);
      setEditingId(null);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4" />
            Groups
            <Badge variant="outline" className="text-[10px]">{groups.length}</Badge>
          </div>
          <div className="flex items-center gap-1">
            {selectedGroupId !== null && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => onSelectGroup(null)}
              >
                <MousePointer className="h-3 w-3 mr-1" />
                Done
              </Button>
            )}
            <Button variant="outline" size="sm" className="h-7" onClick={onAddGroup}>
              <Plus className="h-3 w-3 mr-1" />
              Add
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {selectedGroupId !== null && (
          <div className="mb-2 p-2 bg-primary/10 border border-primary/30 rounded-lg text-xs text-primary">
            <Paintbrush className="h-3 w-3 inline mr-1" />
            Click pixels on the canvas to assign them to the selected group. Click <strong>Done</strong> when finished.
          </div>
        )}
        {groups.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            Groups auto-populate from JSON. Click Add to create manually.
          </p>
        ) : (
          <div className="space-y-1.5 max-h-[250px] overflow-y-auto">
            {groups.map((g, idx) => {
              const isSelected = selectedGroupId === g.id;
              const groupColor = getGroupColor(idx);
              return (
                <div
                  key={g.id}
                  draggable
                  onDragStart={() => setDraggedIdx(idx)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (draggedIdx !== null && idx !== draggedIdx) setDragOverIdx(idx);
                  }}
                  onDragLeave={() => setDragOverIdx(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (draggedIdx !== null && draggedIdx !== idx) onReorder(draggedIdx, idx);
                    setDraggedIdx(null);
                    setDragOverIdx(null);
                  }}
                  onDragEnd={() => {
                    setDraggedIdx(null);
                    setDragOverIdx(null);
                  }}
                  className={`flex items-center gap-2 p-2 rounded-lg border text-sm transition-all cursor-pointer ${
                    draggedIdx === idx ? 'opacity-50' : ''
                  } ${dragOverIdx === idx ? 'border-primary border-2' : ''} ${
                    isSelected
                      ? 'border-primary bg-primary/10 ring-1 ring-primary'
                      : 'border-border bg-card hover:bg-muted/30'
                  }`}
                  onClick={() => onSelectGroup(isSelected ? null : g.id)}
                >
                  {/* Drag handle */}
                  <div
                    className="cursor-grab active:cursor-grabbing shrink-0 text-muted-foreground"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <GripVertical className="h-4 w-4" />
                  </div>

                  {/* Group color indicator */}
                  <div
                    className="w-3 h-3 rounded-full shrink-0 border border-white/30"
                    style={{ backgroundColor: groupColor }}
                  />

                  {/* Color breakdown dots */}
                  <div className="flex gap-0.5 shrink-0">
                    {Object.entries(g.pixelsByColor).slice(0, 4).map(([ct]) => (
                      <ColorSwatch key={ct} colorType={Number(ct)} size={14} />
                    ))}
                  </div>

                  {/* Name */}
                  {editingId === g.id ? (
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onBlur={submitRename}
                      onKeyDown={(e) => e.key === 'Enter' && submitRename()}
                      onClick={(e) => e.stopPropagation()}
                      className="h-6 text-xs flex-1"
                      autoFocus
                    />
                  ) : (
                    <span
                      className="text-xs flex-1 truncate cursor-pointer hover:underline"
                      onClick={(e) => {
                        e.stopPropagation();
                        startRename(g);
                      }}
                    >
                      {g.name}
                    </span>
                  )}

                  {/* Pixel count */}
                  <Badge variant="secondary" className="text-[10px] shrink-0">
                    {g.totalPixels}px
                  </Badge>

                  {/* Select for painting */}
                  {isSelected && (
                    <Badge variant="default" className="text-[10px] shrink-0">
                      <Paintbrush className="h-2.5 w-2.5 mr-0.5" />
                      Painting
                    </Badge>
                  )}

                  {/* Delete */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteGroup(g.id);
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
        <p className="text-xs text-muted-foreground mt-2">
          Click a group to select it, then paint pixels on the canvas. Drag to reorder.
        </p>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Section 5: Launcher (Requirement)
// ============================================================================

function LauncherSection({
  launchers,
  onAdd,
  onDelete,
  onReorder,
}: {
  launchers: StudioLauncher[];
  onAdd: () => void;
  onDelete: (id: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
}) {
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const sorted = useMemo(() => [...launchers].sort((a, b) => a.order - b.order), [launchers]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            Launcher (Requirement)
            <Badge variant="outline" className="text-[10px]">{launchers.length}</Badge>
          </div>
          <Button variant="outline" size="sm" className="h-7" onClick={onAdd}>
            <Plus className="h-3 w-3 mr-1" />
            Add
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">Add launchers for each color requirement.</p>
        ) : (
          <div className="space-y-1 max-h-[250px] overflow-y-auto">
            {sorted.map((launcher, idx) => (
              <div
                key={launcher.id}
                draggable
                onDragStart={() => setDraggedIdx(idx)}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (draggedIdx !== null && idx !== draggedIdx) setDragOverIdx(idx);
                }}
                onDragLeave={() => setDragOverIdx(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  if (draggedIdx !== null && draggedIdx !== idx) onReorder(draggedIdx, idx);
                  setDraggedIdx(null);
                  setDragOverIdx(null);
                }}
                onDragEnd={() => {
                  setDraggedIdx(null);
                  setDragOverIdx(null);
                }}
                className={`flex items-center gap-2 p-2 rounded-lg border bg-card text-sm transition-all ${
                  draggedIdx === idx ? 'opacity-50' : ''
                } ${dragOverIdx === idx ? 'border-primary border-2' : 'border-border'}`}
              >
                <div className="cursor-grab active:cursor-grabbing shrink-0 text-muted-foreground">
                  <GripVertical className="h-4 w-4" />
                </div>

                <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium shrink-0">
                  {idx + 1}
                </span>

                <ColorSwatch colorType={launcher.colorType} size={20} />

                <span className="text-xs flex-1 capitalize">
                  {COLOR_TYPE_TO_FRUIT[launcher.colorType]} x{launcher.pixelCount}
                </span>

                {launcher.isLocked && (
                  <Lock className="h-3 w-3 text-muted-foreground shrink-0" />
                )}

                <Badge variant={launcher.isLocked ? 'outline' : 'default'} className="text-[10px] shrink-0">
                  {launcher.isLocked ? 'Locked' : 'Active'}
                </Badge>

                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive shrink-0"
                  onClick={() => onDelete(launcher.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground mt-2">
          First {launchers.length > 0 ? Math.min(launchers.length, 2) : 2} = active, rest = locked by default. Drag to reorder. Active count controlled in Difficulty Analysis.
        </p>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Section 6: Game Preview (read-only canvas)
// ============================================================================

function GamePreviewCanvas({
  pixels,
  width,
  height,
}: {
  pixels: Map<string, StudioPixelCell>;
  width: number;
  height: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewSize = 200;
  const cellSize = Math.max(1, Math.floor(previewSize / Math.max(width, height)));
  const canvasWidth = width * cellSize;
  const canvasHeight = height * cellSize;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    pixels.forEach((cell) => {
      ctx.fillStyle = `#${cell.colorHex}`;
      ctx.fillRect(cell.col * cellSize, cell.row * cellSize, cellSize - 0.5, cellSize - 0.5);
    });
  }, [pixels, width, height, cellSize, canvasWidth, canvasHeight]);

  return (
    <canvas
      ref={canvasRef}
      width={canvasWidth}
      height={canvasHeight}
      className="select-none"
      style={{ imageRendering: 'pixelated' }}
    />
  );
}

// ============================================================================
// Section 7: Item Pool (Selectable Items)
// ============================================================================

function ItemPoolSection({
  items,
  maxSelectableItems,
  onMaxChange,
  onAddItem,
  onDeleteItem,
  onReorder,
}: {
  items: StudioSelectableItem[];
  maxSelectableItems: number;
  onMaxChange: (v: number) => void;
  onAddItem: (colorType: number, variant: number) => void;
  onDeleteItem: (id: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
}) {
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [addColorType, setAddColorType] = useState(0);
  const [addVariant, setAddVariant] = useState(0);

  const sorted = useMemo(() => [...items].sort((a, b) => a.order - b.order), [items]);

  // Split into layers
  const layerA = sorted.filter((i) => i.layer === 'A');
  const layerB = sorted.filter((i) => i.layer === 'B');
  const layerC = sorted.filter((i) => i.layer === 'C');

  const renderItem = (item: StudioSelectableItem, globalIdx: number) => {
    const fruit = COLOR_TYPE_TO_FRUIT[item.colorType];
    const variantName = fruit ? VARIANT_NAMES[fruit]?.[item.variant] || `V${item.variant}` : `V${item.variant}`;
    return (
      <div
        key={item.id}
        draggable
        onDragStart={() => setDraggedIdx(globalIdx)}
        onDragOver={(e) => {
          e.preventDefault();
          if (draggedIdx !== null && globalIdx !== draggedIdx) setDragOverIdx(globalIdx);
        }}
        onDragLeave={() => setDragOverIdx(null)}
        onDrop={(e) => {
          e.preventDefault();
          if (draggedIdx !== null && draggedIdx !== globalIdx) onReorder(draggedIdx, globalIdx);
          setDraggedIdx(null);
          setDragOverIdx(null);
        }}
        onDragEnd={() => {
          setDraggedIdx(null);
          setDragOverIdx(null);
        }}
        className={`flex items-center gap-1.5 p-1.5 rounded border bg-card text-xs transition-all ${
          draggedIdx === globalIdx ? 'opacity-50' : ''
        } ${dragOverIdx === globalIdx ? 'border-primary border-2' : 'border-border'}`}
      >
        <GripVertical className="h-3 w-3 text-muted-foreground cursor-grab shrink-0" />
        <ColorSwatch colorType={item.colorType} size={16} />
        <span className="truncate flex-1">{variantName}</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive shrink-0"
          onClick={() => onDeleteItem(item.id)}
        >
          <Trash2 className="h-2.5 w-2.5" />
        </Button>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          <span>Item Pool (Selectable Items)</span>
          <Badge variant="outline" className="text-[10px]">{items.length} items</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* MaxSelectableItems */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Max Selectable:</span>
          <Input
            type="number"
            min={6}
            max={10}
            value={maxSelectableItems}
            onChange={(e) => onMaxChange(Math.max(6, Math.min(10, Number(e.target.value) || 6)))}
            className="h-7 w-20 text-xs"
          />
        </div>

        {/* Add Item */}
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={addColorType}
            onChange={(e) => {
              setAddColorType(Number(e.target.value));
              setAddVariant(0);
            }}
            className="h-7 text-xs bg-background border rounded px-2"
          >
            {Array.from({ length: 9 }, (_, i) => i).map((ct) => (
              <option key={ct} value={ct}>
                {COLOR_TYPE_TO_FRUIT[ct]}
              </option>
            ))}
          </select>
          <select
            value={addVariant}
            onChange={(e) => setAddVariant(Number(e.target.value))}
            className="h-7 text-xs bg-background border rounded px-2"
          >
            {[0, 1, 2].map((v) => {
              const fruit = COLOR_TYPE_TO_FRUIT[addColorType];
              const name = fruit ? VARIANT_NAMES[fruit]?.[v] || `Variant ${v}` : `Variant ${v}`;
              return (
                <option key={v} value={v}>
                  {name}
                </option>
              );
            })}
          </select>
          <Button variant="outline" size="sm" className="h-7" onClick={() => onAddItem(addColorType, addVariant)}>
            <Plus className="h-3 w-3 mr-1" />
            Add
          </Button>
        </div>

        {/* Layer A */}
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <Badge className="bg-green-600 text-[10px]">Layer A</Badge>
            <span className="text-[10px] text-muted-foreground">Surface (visible)</span>
            <span className="text-[10px] text-muted-foreground ml-auto">{layerA.length}/{maxSelectableItems}</span>
          </div>
          <div className="space-y-0.5 max-h-[120px] overflow-y-auto">
            {layerA.map((item) => renderItem(item, sorted.indexOf(item)))}
          </div>
        </div>

        {/* Layer B */}
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <Badge className="bg-blue-600 text-[10px]">Layer B</Badge>
            <span className="text-[10px] text-muted-foreground">Replaces A when picked</span>
            <span className="text-[10px] text-muted-foreground ml-auto">{layerB.length}/{maxSelectableItems}</span>
          </div>
          <div className="space-y-0.5 max-h-[120px] overflow-y-auto">
            {layerB.map((item) => renderItem(item, sorted.indexOf(item)))}
          </div>
        </div>

        {/* Layer C */}
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <Badge className="bg-purple-600 text-[10px]">Layer C</Badge>
            <span className="text-[10px] text-muted-foreground">Queue (fills B slots)</span>
            <span className="text-[10px] text-muted-foreground ml-auto">{layerC.length}</span>
          </div>
          <div className="space-y-0.5 max-h-[120px] overflow-y-auto">
            {layerC.map((item) => renderItem(item, sorted.indexOf(item)))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Section 8: Difficulty Analysis
// ============================================================================

function DifficultyComponentBar({ label, value, weight }: { label: string; value: number; weight: number }) {
  const pct = Math.round(value * 100);
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label} ({(weight * 100).toFixed(0)}%)</span>
        <span className="font-mono">{pct}/100</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function DifficultyAnalysis({
  difficultyResult,
  maxSelectableItems,
  mismatchDepth,
  waitingStandSlots,
  activeLauncherCount,
  seed,
  simulationResult,
  isTargeting,
  isSimulating,
  onMaxSelectableChange,
  onMismatchDepthChange,
  onWaitingStandSlotsChange,
  onActiveLauncherCountChange,
  onSeedChange,
  onEasier,
  onHarder,
  onAutoTarget,
  onSimulate,
}: {
  difficultyResult: StudioDifficultyResult | null;
  maxSelectableItems: number;
  mismatchDepth: number;
  waitingStandSlots: number;
  activeLauncherCount: number;
  seed: number | undefined;
  simulationResult: StudioSimulationResult | null;
  isTargeting: boolean;
  isSimulating: boolean;
  onMaxSelectableChange: (v: number) => void;
  onMismatchDepthChange: (v: number) => void;
  onWaitingStandSlotsChange: (v: number) => void;
  onActiveLauncherCountChange: (v: number) => void;
  onSeedChange: (v: number | undefined) => void;
  onEasier: () => void;
  onHarder: () => void;
  onAutoTarget: (targetScore: number) => void;
  onSimulate: () => void;
}) {
  const [targetInput, setTargetInput] = useState('50');

  if (!difficultyResult) {
    return (
      <Card>
        <CardContent className="pt-4 text-center text-xs text-muted-foreground py-8">
          Import pixel art to see difficulty analysis.
        </CardContent>
      </Card>
    );
  }

  const { score, tier, components } = difficultyResult;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Difficulty Analysis
          </div>
          <div className="flex items-center gap-1.5">
            {simulationResult && (
              <Badge variant="outline" className="text-[10px]">
                WR: {Math.round(simulationResult.winRate * 100)}%
              </Badge>
            )}
            <Badge className={DIFFICULTY_COLORS[tier] || 'bg-gray-500'}>
              {score}/100 ({tier})
            </Badge>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Progress value={score} className="h-2" />

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onEasier} className="flex-1">
            <TrendingDown className="h-4 w-4 mr-1" />
            Easier
          </Button>
          <Button variant="outline" size="sm" onClick={onHarder} className="flex-1">
            <TrendingUp className="h-4 w-4 mr-1" />
            Harder
          </Button>
        </div>

        {/* Auto Target */}
        <div className="flex items-center gap-2 pt-1 border-t border-border">
          <Input
            type="number"
            min={0}
            max={100}
            value={targetInput}
            onChange={(e) => setTargetInput(e.target.value)}
            className="h-7 w-20 text-xs"
            placeholder="Score"
          />
          <Button
            variant="default"
            size="sm"
            className="flex-1 h-7"
            onClick={() => onAutoTarget(Math.max(0, Math.min(100, Number(targetInput) || 50)))}
            disabled={isTargeting}
          >
            {isTargeting ? (
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            ) : (
              <Target className="h-3.5 w-3.5 mr-1" />
            )}
            Auto Target
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7"
            onClick={onSimulate}
            disabled={isSimulating}
            title="Run simulation"
          >
            {isSimulating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Zap className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>

        {/* Simulation Results */}
        {simulationResult && (
          <div className="p-2 bg-muted/30 rounded-lg space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Win Rate</span>
              <span className="font-mono">{Math.round(simulationResult.winRate * 100)}% ({Math.round(simulationResult.confidenceInterval[0] * 100)}-{Math.round(simulationResult.confidenceInterval[1] * 100)}%)</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Avg Moves</span>
              <span className="font-mono">{Math.round(simulationResult.avgMoves)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Peak Stand</span>
              <span className="font-mono">{simulationResult.peakStandUsage}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Near-Loss Rate</span>
              <span className="font-mono">{Math.round(simulationResult.nearLossRate * 100)}%</span>
            </div>
            <div className="text-[10px] text-muted-foreground text-right">{simulationResult.runs} runs</div>
          </div>
        )}

        {/* Component breakdown */}
        <div className="space-y-2">
          <DifficultyComponentBar label="Tile Burial" value={components.tileBurial} weight={0.35} />
          <DifficultyComponentBar label="Stand Pressure" value={components.standPressure} weight={0.15} />
          <DifficultyComponentBar label="Color Complexity" value={components.colorComplexity} weight={0.10} />
          <DifficultyComponentBar label="Sequence Length" value={components.sequenceLength} weight={0.10} />
          <DifficultyComponentBar label="Layer Depth" value={components.layerDepth} weight={0.10} />
          <DifficultyComponentBar label="Grid Constraint" value={components.gridConstraint} weight={0.20} />
        </div>

        {/* Sliders */}
        <div className="space-y-2 pt-1 border-t border-border">
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Tile Burial</span>
              <span className="font-mono">{Math.round(mismatchDepth * 100)}%</span>
            </div>
            <Slider
              value={[mismatchDepth * 100]}
              min={0}
              max={100}
              step={5}
              onValueChange={([v]) => onMismatchDepthChange(v / 100)}
            />
            <p className="text-[10px] text-muted-foreground">
              0% = matching tiles on top (easy). Higher = tiles buried deeper.
            </p>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Max Selectable Items</span>
              <span className="font-mono">{maxSelectableItems}</span>
            </div>
            <Slider
              value={[maxSelectableItems]}
              min={6}
              max={10}
              step={1}
              onValueChange={([v]) => onMaxSelectableChange(v)}
            />
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Waiting Stand Slots</span>
              <span className="font-mono">{waitingStandSlots}</span>
            </div>
            <Slider
              value={[waitingStandSlots]}
              min={3}
              max={7}
              step={1}
              onValueChange={([v]) => onWaitingStandSlotsChange(v)}
            />
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Active Launchers</span>
              <span className="font-mono">{activeLauncherCount}</span>
            </div>
            <Slider
              value={[activeLauncherCount]}
              min={1}
              max={3}
              step={1}
              onValueChange={([v]) => onActiveLauncherCountChange(v)}
            />
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Seed</span>
              <span className="font-mono">{seed ?? 'random'}</span>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={seed ?? ''}
                onChange={(e) => {
                  const val = e.target.value;
                  onSeedChange(val === '' ? undefined : Number(val));
                }}
                placeholder="Random"
                className="h-7 text-xs flex-1"
              />
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => onSeedChange(Math.floor(Math.random() * 2147483647))}
              >
                <Hash className="h-3 w-3 mr-1" />
                New
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Main Component: LevelDesignerV2
// ============================================================================

export function LevelDesignerV2({
  onPlayLevel,
  onAddToCollection,
  levelNumber = 1,
  onLevelNumberChange,
  maxLevelNumber = 100,
  editingLevel,
}: LevelDesignerV2Props) {
  // Core pixel data
  const [pixels, setPixels] = useState<Map<string, StudioPixelCell>>(new Map());
  const [artWidth, setArtWidth] = useState(32);
  const [artHeight, setArtHeight] = useState(32);
  const [palette, setPalette] = useState<string[]>([]);

  // Paint tool
  const [paintColor, setPaintColor] = useState<number | 'eraser'>(0);

  // Zoom
  const [zoom, setZoom] = useState(1);

  // Groups
  const [groups, setGroups] = useState<StudioGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);

  // Launchers
  const [launchers, setLaunchers] = useState<StudioLauncher[]>([]);

  // Item Pool
  const [selectableItems, setSelectableItems] = useState<StudioSelectableItem[]>([]);
  const [maxSelectableItems, setMaxSelectableItems] = useState(10);

  // Difficulty
  const [waitingStandSlots, setWaitingStandSlots] = useState(5);
  const [activeLauncherCount, setActiveLauncherCount] = useState(2);
  const [sinkWidth, setSinkWidth] = useState(6);
  const [mismatchDepth, setMismatchDepth] = useState(0);
  const [seed, setSeed] = useState<number | undefined>(undefined);
  const [simulationResult, setSimulationResult] = useState<StudioSimulationResult | null>(null);
  const [isTargeting, setIsTargeting] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);

  // Play mode
  const [playMode, setPlayMode] = useState(false);

  // File input ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ============================================================================
  // Derived state
  // ============================================================================

  const pixelArray = useMemo(() => Array.from(pixels.values()), [pixels]);
  const hasData = pixelArray.length > 0;

  // Color counts
  const colorCounts = useMemo(() => {
    const map = new Map<number, { count: number; hex: string }>();
    pixelArray.forEach((p) => {
      const existing = map.get(p.colorType);
      if (existing) {
        existing.count++;
      } else {
        map.set(p.colorType, { count: 1, hex: p.colorHex });
      }
    });
    return Array.from(map.entries())
      .map(([colorType, { count, hex }]) => ({ colorType, count, hex }))
      .sort((a, b) => b.count - a.count);
  }, [pixelArray]);

  // Convert to PixelCell for existing utilities
  const pixelCellArray = useMemo((): PixelCell[] => {
    return pixelArray.map((p) => ({
      row: p.row,
      col: p.col,
      fruitType: p.fruitType,
      filled: false,
      groupId: p.group,
      colorHex: p.colorHex,
      colorType: p.colorType,
    }));
  }, [pixelArray]);

  // Fruit counts for sink generation
  const fruitCounts = useMemo(() => {
    return getRequiredFruitCounts(pixelCellArray);
  }, [pixelCellArray]);

  // Sink stacks
  const sinkStacks = useMemo(() => {
    if (pixelCellArray.length === 0) return [];
    return generateSinkStacks(sinkWidth, fruitCounts, 2, 4);
  }, [pixelCellArray, sinkWidth, fruitCounts]);

  // Studio difficulty params — derived from current designer state
  const studioDifficultyParams = useMemo((): StudioDifficultyParams | null => {
    if (pixelArray.length === 0 || launchers.length === 0) return null;
    const uniqueColors = new Set(pixelArray.map((p) => p.colorType)).size;
    const groupCount = groups.length;
    const totalTiles = selectableItems.length;
    return {
      totalPixels: pixelArray.length,
      uniqueColors,
      groupCount,
      launcherCount: launchers.length,
      waitingStandSlots,
      maxSelectableItems,
      totalTiles,
      mismatchDepth,
    };
  }, [pixelArray, launchers, groups.length, selectableItems, waitingStandSlots, maxSelectableItems, mismatchDepth]);

  // Studio difficulty result
  const difficultyResult = useMemo((): StudioDifficultyResult | null => {
    if (!studioDifficultyParams) return null;
    return calculateStudioDifficulty(studioDifficultyParams);
  }, [studioDifficultyParams]);

  // Level metrics
  const metrics = useMemo(() => {
    if (pixelCellArray.length === 0 || sinkStacks.length === 0) return null;
    return calculateLevelMetrics(pixelCellArray, sinkStacks, waitingStandSlots, studioDifficultyParams ?? undefined);
  }, [pixelCellArray, sinkStacks, waitingStandSlots, studioDifficultyParams]);

  // Preview level for difficulty
  const previewLevel = useMemo((): FruitMatchLevel | null => {
    if (pixelCellArray.length < 4 || sinkStacks.length === 0) return null;
    return {
      id: 'studio-preview',
      name: 'Preview',
      pixelArt: pixelCellArray,
      pixelArtWidth: artWidth,
      pixelArtHeight: artHeight,
      sinkWidth,
      sinkStacks,
      waitingStandSlots,
      difficulty: metrics?.difficulty || 'medium',
    };
  }, [pixelCellArray, artWidth, artHeight, sinkWidth, sinkStacks, waitingStandSlots, metrics]);

  // Recompute item layers when maxSelectableItems or item count changes
  const itemsWithLayers = useMemo((): StudioSelectableItem[] => {
    const sorted = [...selectableItems].sort((a, b) => a.order - b.order);
    return sorted.map((item, idx) => {
      let layer: 'A' | 'B' | 'C';
      if (idx < maxSelectableItems) {
        layer = 'A';
      } else if (idx < 2 * maxSelectableItems) {
        layer = 'B';
      } else {
        layer = 'C';
      }
      return { ...item, layer };
    });
  }, [selectableItems, maxSelectableItems]);

  // Build colorType → hex mapping from actual pixel data
  const colorTypeToHex = useMemo((): Record<number, string> => {
    const map: Record<number, string> = {};
    pixelArray.forEach((p) => {
      if (!map[p.colorType]) {
        map[p.colorType] = p.colorHex;
      }
    });
    return map;
  }, [pixelArray]);

  // Build StudioGameConfig for play mode
  const studioGameConfig = useMemo((): StudioGameConfig | null => {
    if (pixelCellArray.length < 4 || itemsWithLayers.length === 0 || launchers.length === 0) return null;
    return {
      pixelArt: pixelCellArray,
      pixelArtWidth: artWidth,
      pixelArtHeight: artHeight,
      maxSelectableItems,
      waitingStandSlots,
      selectableItems: itemsWithLayers.map((item) => ({
        colorType: item.colorType,
        variant: item.variant,
        order: item.order,
      })),
      launchers: [...launchers]
        .sort((a, b) => a.order - b.order)
        .map((l) => ({
          colorType: l.colorType,
          pixelCount: l.pixelCount,
          group: l.group,
          order: l.order,
        })),
      activeLauncherCount,
      mismatchDepth,
      colorTypeToHex,
      seed,
    };
  }, [pixelCellArray, artWidth, artHeight, maxSelectableItems, waitingStandSlots, itemsWithLayers, launchers, activeLauncherCount, mismatchDepth, colorTypeToHex, seed]);

  // ============================================================================
  // JSON Import
  // ============================================================================

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileImport = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
        const content = await file.text();
        const data = JSON.parse(content);

        if (isFullPixelArtFormat(data)) {
          // Full pixel art format from converter
          const result = importFromFullPixelArtFormat(data);
          setPalette(result.palette);
          setArtWidth(result.width);
          setArtHeight(result.height);

          const map = new Map<string, StudioPixelCell>();
          result.pixels.forEach((p) => {
            map.set(`${p.row},${p.col}`, p);
          });
          setPixels(map);

          // Auto-populate groups from JSON Group field
          const groupMap = new Map<number, StudioGroup>();
          result.pixels.forEach((p) => {
            const existing = groupMap.get(p.group);
            if (existing) {
              existing.pixelsByColor[p.colorType] = (existing.pixelsByColor[p.colorType] || 0) + 1;
              existing.totalPixels++;
            } else {
              groupMap.set(p.group, {
                id: p.group,
                name: `Group ${p.group}`,
                pixelsByColor: { [p.colorType]: 1 },
                totalPixels: 1,
              });
            }
          });
          setGroups(Array.from(groupMap.values()).sort((a, b) => a.id - b.id));

          // Auto-generate launchers from groups (ordered by group then colorType)
          const newLaunchers: StudioLauncher[] = [];
          let order = 0;
          const sortedGroups = Array.from(groupMap.values()).sort((a, b) => a.id - b.id);
          for (const group of sortedGroups) {
            const colorTypes = Object.keys(group.pixelsByColor).map(Number).sort((a, b) => a - b);
            for (const ct of colorTypes) {
              newLaunchers.push({
                id: uid('launcher'),
                colorType: ct,
                pixelCount: group.pixelsByColor[ct],
                group: group.id,
                isLocked: order >= 2,
                order: order++,
              });
            }
          }
          setLaunchers(newLaunchers);

          // Set maxSelectableItems based on launcher count (capped at 10)
          const totalTiles = newLaunchers.length * 3;
          const newMaxItems = Math.min(Math.max(6, Math.ceil(totalTiles / 2)), 10);
          setMaxSelectableItems(newMaxItems);

          // Auto-generate selectable items: exactly 3 tiles per launcher
          const newItems: StudioSelectableItem[] = [];
          let itemOrder = 0;
          for (const launcher of newLaunchers) {
            for (let i = 0; i < 3; i++) {
              const layer: 'A' | 'B' | 'C' = itemOrder < newMaxItems
                ? 'A'
                : itemOrder < 2 * newMaxItems
                  ? 'B'
                  : 'C';
              newItems.push({
                id: uid('item'),
                colorType: launcher.colorType,
                variant: 0,
                layer,
                order: itemOrder++,
              });
            }
          }
          setSelectableItems(newItems);

          // Extract level number from filename
          const match = file.name.match(/level[_-]?(\d+)/i);
          if (match && onLevelNumberChange) {
            onLevelNumberChange(parseInt(match[1], 10));
          }
        } else if (isReferenceFormat(data)) {
          // Reference level format (has SelectableItems)
          const result = importFromReferenceFormat(data);
          setArtWidth(result.pixelArtWidth);
          setArtHeight(result.pixelArtHeight);

          const map = new Map<string, StudioPixelCell>();
          result.pixelArt.forEach((cell) => {
            const colorType = FRUIT_TO_COLOR_TYPE[cell.fruitType];
            const colorHex = COLOR_TYPE_TO_HEX[colorType] || '888888';
            const colorData = result.colorData.get(`${cell.row},${cell.col}`);
            map.set(`${cell.row},${cell.col}`, {
              row: cell.row,
              col: cell.col,
              colorType: colorData?.colorType ?? colorType,
              colorGroup: colorData?.colorType ?? colorType,
              colorHex: colorData?.colorHex ?? colorHex,
              group: colorData?.group ?? 1,
              fruitType: cell.fruitType,
            });
          });
          setPixels(map);

          // Build groups
          const groupMap = new Map<number, StudioGroup>();
          map.forEach((p) => {
            const existing = groupMap.get(p.group);
            if (existing) {
              existing.pixelsByColor[p.colorType] = (existing.pixelsByColor[p.colorType] || 0) + 1;
              existing.totalPixels++;
            } else {
              groupMap.set(p.group, {
                id: p.group,
                name: `Group ${p.group}`,
                pixelsByColor: { [p.colorType]: 1 },
                totalPixels: 1,
              });
            }
          });
          setGroups(Array.from(groupMap.values()).sort((a, b) => a.id - b.id));

          // Build launchers from requirements
          const newLaunchers: StudioLauncher[] = result.requirements.map((req, idx) => ({
            id: uid('launcher'),
            colorType: req.ColorType,
            pixelCount: req.Value,
            group: req.Group,
            isLocked: idx >= 2,
            order: idx,
          }));
          setLaunchers(newLaunchers);

          // Build selectable items
          const newItems: StudioSelectableItem[] = result.selectableItems.map((si, idx) => ({
            id: uid('item'),
            colorType: si.ColorType,
            variant: 0,
            layer: idx < maxSelectableItems ? 'A' : idx < 2 * maxSelectableItems ? 'B' : 'C',
            order: idx,
          }));
          setSelectableItems(newItems);

          // Build palette from color data
          const paletteSet = new Set<string>();
          result.colorData.forEach((cd) => paletteSet.add(cd.colorHex));
          setPalette(Array.from(paletteSet));

          const match = file.name.match(/level[_-]?(\d+)/i);
          if (match && onLevelNumberChange) {
            onLevelNumberChange(parseInt(match[1], 10));
          }
        } else if (data.Palette && data.Artwork && data.SelectableItems) {
          // Studio merged format (re-import)
          const height = data.Artwork.Height;
          setArtWidth(data.Artwork.Width);
          setArtHeight(height);
          setPalette(data.Palette || []);
          setMaxSelectableItems(Math.min(data.MaxSelectableItems || 10, 10));

          const map = new Map<string, StudioPixelCell>();
          const groupMap = new Map<number, StudioGroup>();

          for (const pixel of data.Artwork.PixelData) {
            const flippedRow = (height - 1) - pixel.Position.y;
            const fruitType = COLOR_TYPE_TO_FRUIT[pixel.ColorType] || 'apple';
            const sp: StudioPixelCell = {
              row: flippedRow,
              col: pixel.Position.x,
              colorType: pixel.ColorType,
              colorGroup: pixel.ColorGroup ?? pixel.ColorType,
              colorHex: pixel.ColorHex,
              group: pixel.Group,
              fruitType,
            };
            map.set(`${flippedRow},${pixel.Position.x}`, sp);

            const existing = groupMap.get(pixel.Group);
            if (existing) {
              existing.pixelsByColor[pixel.ColorType] = (existing.pixelsByColor[pixel.ColorType] || 0) + 1;
              existing.totalPixels++;
            } else {
              groupMap.set(pixel.Group, {
                id: pixel.Group,
                name: `Group ${pixel.Group}`,
                pixelsByColor: { [pixel.ColorType]: 1 },
                totalPixels: 1,
              });
            }
          }
          setPixels(map);
          setGroups(Array.from(groupMap.values()).sort((a, b) => a.id - b.id));

          // Launchers from Requirements
          const reqs = data.Requirements || [];
          setLaunchers(
            reqs.map((r: { ColorType: number; Value: number; Group: number }, idx: number) => ({
              id: uid('launcher'),
              colorType: r.ColorType,
              pixelCount: r.Value,
              group: r.Group,
              isLocked: idx >= 2,
              order: idx,
            })),
          );

          // Items from SelectableItems
          const layerNames: Record<number, 'A' | 'B' | 'C'> = { 0: 'A', 1: 'B', 2: 'C' };
          const si = data.SelectableItems || [];
          setSelectableItems(
            si.map((item: { ColorType: number; Variant: number; Layer: number }, idx: number) => ({
              id: uid('item'),
              colorType: item.ColorType,
              variant: item.Variant ?? 0,
              layer: layerNames[item.Layer] || 'A',
              order: idx,
            })),
          );

          if (onLevelNumberChange && data.LevelIndex) {
            onLevelNumberChange(data.LevelIndex);
          }
        } else {
          alert('Unsupported JSON format. Expected full pixel art, reference, or studio format.');
        }
      } catch (err) {
        console.error('Failed to import:', err);
        alert('Failed to import JSON. Invalid format.');
      }

      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [maxSelectableItems, onLevelNumberChange],
  );

  // ============================================================================
  // Paint handler
  // ============================================================================

  const handleCellPaint = useCallback(
    (row: number, col: number) => {
      const key = `${row},${col}`;

      setPixels((prev) => {
        const newMap = new Map(prev);
        if (paintColor === 'eraser') {
          newMap.delete(key);
        } else {
          const hex = COLOR_TYPE_TO_HEX[paintColor] || '888888';
          const fruitType = COLOR_TYPE_TO_FRUIT[paintColor] || 'apple';
          const existing = prev.get(key);
          newMap.set(key, {
            row,
            col,
            colorType: paintColor,
            colorGroup: existing?.colorGroup ?? paintColor,
            colorHex: hex,
            group: existing?.group ?? 1,
            fruitType,
          });
        }
        return newMap;
      });
    },
    [paintColor],
  );

  // ============================================================================
  // Zoom handlers
  // ============================================================================

  const handleZoomIn = useCallback(() => setZoom((z) => Math.min(z * 1.25, 5)), []);
  const handleZoomOut = useCallback(() => setZoom((z) => Math.max(z / 1.25, 0.25)), []);
  const handleZoomReset = useCallback(() => setZoom(1), []);
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setZoom((z) => Math.max(0.25, Math.min(5, z * delta)));
    }
  }, []);

  // ============================================================================
  // Group handlers
  // ============================================================================

  const handleAddGroup = useCallback(() => {
    const newId = groups.length > 0 ? Math.max(...groups.map((g) => g.id)) + 1 : 1;
    setGroups((prev) => [
      ...prev,
      { id: newId, name: `Group ${newId}`, pixelsByColor: {}, totalPixels: 0 },
    ]);
  }, [groups]);

  const handleDeleteGroup = useCallback((id: number) => {
    setGroups((prev) => prev.filter((g) => g.id !== id));
  }, []);

  const handleRenameGroup = useCallback((id: number, name: string) => {
    setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, name } : g)));
  }, []);

  const handleReorderGroup = useCallback((fromIndex: number, toIndex: number) => {
    setGroups((prev) => {
      const sorted = [...prev];
      const [moved] = sorted.splice(fromIndex, 1);
      sorted.splice(toIndex, 0, moved);
      return sorted;
    });
  }, []);

  // Assign a pixel to a group and recompute group stats + launcher pixelCounts
  const handleAssignPixelToGroup = useCallback(
    (row: number, col: number) => {
      if (selectedGroupId === null) return;
      const key = `${row},${col}`;
      setPixels((prev) => {
        const existing = prev.get(key);
        if (!existing) return prev;
        if (existing.group === selectedGroupId) return prev;
        const newMap = new Map(prev);
        newMap.set(key, { ...existing, group: selectedGroupId });
        return newMap;
      });
    },
    [selectedGroupId],
  );

  // Recompute group stats from pixel data whenever pixels change
  const recomputedGroups = useMemo((): StudioGroup[] => {
    if (groups.length === 0) return groups;
    // Reset all groups' pixel counts
    const groupMap = new Map<number, StudioGroup>();
    for (const g of groups) {
      groupMap.set(g.id, { ...g, pixelsByColor: {}, totalPixels: 0 });
    }
    pixels.forEach((p) => {
      const g = groupMap.get(p.group);
      if (g) {
        g.pixelsByColor[p.colorType] = (g.pixelsByColor[p.colorType] || 0) + 1;
        g.totalPixels++;
      }
    });
    return groups.map((g) => groupMap.get(g.id) ?? g);
  }, [groups, pixels]);

  // Sync launcher pixelCounts when pixel group assignments change
  useEffect(() => {
    if (recomputedGroups.length === 0) return;
    setLaunchers((prev) => {
      let changed = false;
      const updated = prev.map((l) => {
        const g = recomputedGroups.find((gr) => gr.id === l.group);
        if (!g) return l;
        const newCount = g.pixelsByColor[l.colorType] ?? 0;
        if (newCount !== l.pixelCount) {
          changed = true;
          return { ...l, pixelCount: newCount };
        }
        return l;
      });
      return changed ? updated : prev;
    });
  }, [recomputedGroups]);

  // ============================================================================
  // Launcher handlers
  // ============================================================================

  const handleAddLauncher = useCallback(() => {
    const newOrder = launchers.length;
    setLaunchers((prev) => [
      ...prev,
      {
        id: uid('launcher'),
        colorType: 0,
        pixelCount: 20,
        group: groups[0]?.id ?? 1,
        isLocked: newOrder >= 2,
        order: newOrder,
      },
    ]);
  }, [launchers.length, groups]);

  const handleDeleteLauncher = useCallback((id: string) => {
    setLaunchers((prev) => {
      const filtered = prev.filter((l) => l.id !== id);
      // Re-assign order and locked status
      return filtered
        .sort((a, b) => a.order - b.order)
        .map((l, idx) => ({ ...l, order: idx, isLocked: idx >= 2 }));
    });
  }, []);

  const handleReorderLauncher = useCallback((fromIndex: number, toIndex: number) => {
    setLaunchers((prev) => {
      const sorted = [...prev].sort((a, b) => a.order - b.order);
      const [moved] = sorted.splice(fromIndex, 1);
      sorted.splice(toIndex, 0, moved);
      return sorted.map((l, idx) => ({ ...l, order: idx, isLocked: idx >= 2 }));
    });
  }, []);

  // ============================================================================
  // Item Pool handlers
  // ============================================================================

  const handleAddItem = useCallback(
    (colorType: number, variant: number) => {
      const newOrder = selectableItems.length;
      const layer: 'A' | 'B' | 'C' =
        newOrder < maxSelectableItems ? 'A' : newOrder < 2 * maxSelectableItems ? 'B' : 'C';
      setSelectableItems((prev) => [
        ...prev,
        { id: uid('item'), colorType, variant, layer, order: newOrder },
      ]);
    },
    [selectableItems.length, maxSelectableItems],
  );

  const handleDeleteItem = useCallback((id: string) => {
    setSelectableItems((prev) => {
      const filtered = prev.filter((i) => i.id !== id);
      return filtered
        .sort((a, b) => a.order - b.order)
        .map((item, idx) => ({ ...item, order: idx }));
    });
  }, []);

  const handleReorderItem = useCallback((fromIndex: number, toIndex: number) => {
    setSelectableItems((prev) => {
      const sorted = [...prev].sort((a, b) => a.order - b.order);
      const [moved] = sorted.splice(fromIndex, 1);
      sorted.splice(toIndex, 0, moved);
      return sorted.map((item, idx) => ({ ...item, order: idx }));
    });
  }, []);

  // ============================================================================
  // Difficulty adjustments
  // ============================================================================

  const handleEasier = useCallback(() => {
    if (!difficultyResult) return;
    const { tileBurial, gridConstraint } = difficultyResult.components;
    // Priority: reduce the highest adjustable contributor (tile burial or grid constraint)
    const burialContrib = tileBurial * 0.25;
    const gridContrib = gridConstraint * 0.15;

    if (burialContrib >= gridContrib && mismatchDepth > 0) {
      setMismatchDepth((v) => Math.max(0, +(v - 0.15).toFixed(2)));
    } else if (maxSelectableItems < 10) {
      setMaxSelectableItems((v) => Math.min(10, v + 1));
    } else if (mismatchDepth > 0) {
      setMismatchDepth((v) => Math.max(0, +(v - 0.15).toFixed(2)));
    }
  }, [difficultyResult, mismatchDepth, maxSelectableItems]);

  const handleHarder = useCallback(() => {
    if (!difficultyResult || !studioGameConfig) return;
    const { tileBurial, gridConstraint } = difficultyResult.components;
    // Priority: increase the adjustable component with the most room to grow
    const burialRoom = (1 - tileBurial) * 0.25;
    const gridRoom = (1 - gridConstraint) * 0.15;

    if (burialRoom >= gridRoom && mismatchDepth < 1) {
      // Find the max solvable depth and clamp to it
      const maxDepth = findMaxSolvableDepth(studioGameConfig);
      const target = +(mismatchDepth + 0.15).toFixed(2);
      setMismatchDepth(Math.min(target, maxDepth));
    } else if (maxSelectableItems > 6) {
      setMaxSelectableItems((v) => Math.max(6, v - 1));
    } else if (mismatchDepth < 1) {
      const maxDepth = findMaxSolvableDepth(studioGameConfig);
      const target = +(mismatchDepth + 0.15).toFixed(2);
      setMismatchDepth(Math.min(target, maxDepth));
    }
  }, [difficultyResult, studioGameConfig, mismatchDepth, maxSelectableItems]);

  const handleAutoTarget = useCallback((targetScore: number) => {
    if (!studioGameConfig) return;
    setIsTargeting(true);
    // Use setTimeout to let the UI show the loading state
    setTimeout(() => {
      try {
        const result = targetDifficulty(studioGameConfig, targetScore, {
          seed: seed ?? Math.floor(Math.random() * 2147483647),
        });
        setMismatchDepth(result.recipe.mismatchDepth);
        setMaxSelectableItems(result.recipe.maxSelectableItems);
        setWaitingStandSlots(result.recipe.waitingStandSlots);
        setActiveLauncherCount(result.recipe.activeLauncherCount);
        if (result.recipe.seed && seed === undefined) {
          setSeed(result.recipe.seed);
        }
      } finally {
        setIsTargeting(false);
      }
    }, 10);
  }, [studioGameConfig, seed]);

  const handleSimulate = useCallback(() => {
    if (!studioGameConfig) return;
    setIsSimulating(true);
    setTimeout(() => {
      try {
        const recipe: DifficultyRecipe = {
          mismatchDepth,
          maxSelectableItems,
          waitingStandSlots,
          activeLauncherCount,
          seed: seed ?? Math.floor(Math.random() * 2147483647),
        };
        const result = simulateStudioGame(studioGameConfig, recipe, 100);
        setSimulationResult(result);
      } finally {
        setIsSimulating(false);
      }
    }, 10);
  }, [studioGameConfig, mismatchDepth, maxSelectableItems, waitingStandSlots, activeLauncherCount, seed]);

  // ============================================================================
  // Export JSON
  // ============================================================================

  const handleExportJSON = useCallback(() => {
    const exportData: StudioExportData = {
      palette,
      levelId: `level_${String(levelNumber).padStart(3, '0')}`,
      levelIndex: levelNumber,
      difficulty: difficultyResult?.tier || 'medium',
      graphicId: `graphic_${artWidth}x${artHeight}`,
      width: artWidth,
      height: artHeight,
      pixels: pixelArray.map((p) => ({
        row: p.row,
        col: p.col,
        colorType: p.colorType,
        colorGroup: p.colorGroup,
        colorHex: p.colorHex,
        group: p.group,
      })),
      selectableItems: itemsWithLayers.map((item) => ({
        colorType: item.colorType,
        variant: item.variant,
        layer: item.layer,
        order: item.order,
      })),
      requirements: launchers
        .sort((a, b) => a.order - b.order)
        .map((l) => ({
          colorType: l.colorType,
          value: l.pixelCount,
          group: l.group,
        })),
      unlockStageData: [{ requiredCompletedGroups: groups.map((g) => g.id) }],
      maxSelectableItems,
      seed,
      mismatchDepth,
      waitingStandSlots,
      activeLauncherCount,
    };

    const result = exportStudioLevel(exportData);
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `level_${levelNumber}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [palette, levelNumber, difficultyResult, artWidth, artHeight, pixelArray, itemsWithLayers, launchers, groups, maxSelectableItems, seed, mismatchDepth, waitingStandSlots, activeLauncherCount]);

  // ============================================================================
  // Add to Collection
  // ============================================================================

  const handleAddToCollection = useCallback(() => {
    if (!onAddToCollection || !metrics || sinkStacks.length === 0) return;

    const designedLevel: DesignedFruitMatchLevel = {
      id: editingLevel?.id || `level-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: `Level ${levelNumber}`,
      levelNumber,
      pixelArt: pixelCellArray,
      pixelArtWidth: artWidth,
      pixelArtHeight: artHeight,
      sinkWidth,
      sinkStacks,
      waitingStandSlots,
      metrics,
      createdAt: editingLevel?.createdAt || Date.now(),
    };

    onAddToCollection(designedLevel);
  }, [
    onAddToCollection,
    metrics,
    pixelCellArray,
    artWidth,
    artHeight,
    sinkWidth,
    sinkStacks,
    waitingStandSlots,
    levelNumber,
    editingLevel,
  ]);

  // ============================================================================
  // Load editing level
  // ============================================================================

  useEffect(() => {
    if (!editingLevel) return;

    setArtWidth(editingLevel.pixelArtWidth);
    setArtHeight(editingLevel.pixelArtHeight);
    setSinkWidth(editingLevel.sinkWidth);
    setSelectedGroupId(null);

    // Build pixel map
    const map = new Map<string, StudioPixelCell>();
    for (const cell of editingLevel.pixelArt) {
      const colorType = FRUIT_TO_COLOR_TYPE[cell.fruitType];
      const colorHex = cell.colorHex ?? COLOR_TYPE_TO_HEX[colorType] ?? '888888';
      map.set(`${cell.row},${cell.col}`, {
        row: cell.row,
        col: cell.col,
        colorType,
        colorGroup: colorType,
        colorHex,
        group: cell.groupId ?? 1,
        fruitType: cell.fruitType,
      });
    }
    setPixels(map);

    // Build palette from pixel data
    const paletteSet = new Set<string>();
    map.forEach((p) => paletteSet.add(p.colorHex));
    setPalette(Array.from(paletteSet));

    // Regenerate groups from pixel group assignments
    const groupMap = new Map<number, StudioGroup>();
    map.forEach((p) => {
      const existing = groupMap.get(p.group);
      if (existing) {
        existing.pixelsByColor[p.colorType] = (existing.pixelsByColor[p.colorType] || 0) + 1;
        existing.totalPixels++;
      } else {
        groupMap.set(p.group, {
          id: p.group,
          name: `Group ${p.group}`,
          pixelsByColor: { [p.colorType]: 1 },
          totalPixels: 1,
        });
      }
    });
    setGroups(Array.from(groupMap.values()).sort((a, b) => a.id - b.id));

    // Regenerate launchers from groups
    const newLaunchers: StudioLauncher[] = [];
    let order = 0;
    const sortedGroups = Array.from(groupMap.values()).sort((a, b) => a.id - b.id);
    for (const group of sortedGroups) {
      const colorTypes = Object.keys(group.pixelsByColor).map(Number).sort((a, b) => a - b);
      for (const ct of colorTypes) {
        newLaunchers.push({
          id: uid('launcher'),
          colorType: ct,
          pixelCount: group.pixelsByColor[ct],
          group: group.id,
          isLocked: order >= 2,
          order: order++,
        });
      }
    }
    setLaunchers(newLaunchers);

    // Regenerate selectable items (3 per launcher, max selectable capped at 10)
    const totalTiles = newLaunchers.length * 3;
    const newMaxItems = Math.min(Math.max(6, Math.ceil(totalTiles / 2)), 10);
    setMaxSelectableItems(newMaxItems);

    const newItems: StudioSelectableItem[] = [];
    let itemOrder = 0;
    for (const launcher of newLaunchers) {
      for (let i = 0; i < 3; i++) {
        const layer: 'A' | 'B' | 'C' = itemOrder < newMaxItems
          ? 'A'
          : itemOrder < 2 * newMaxItems
            ? 'B'
            : 'C';
        newItems.push({
          id: uid('item'),
          colorType: launcher.colorType,
          variant: 0,
          layer,
          order: itemOrder++,
        });
      }
    }
    setSelectableItems(newItems);
  }, [editingLevel]);

  // ============================================================================
  // Render
  // ============================================================================

  // ============================================================================
  // Play Mode — render StudioGameBoard
  // ============================================================================

  if (playMode && studioGameConfig) {
    return (
      <StudioGameBoard
        config={studioGameConfig}
        onBack={() => setPlayMode(false)}
      />
    );
  }

  // ============================================================================
  // Designer Mode
  // ============================================================================

  return (
    <div className="space-y-4">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleFileImport}
        className="hidden"
      />

      {/* 1. Paint Tool Bar */}
      <PaintToolBar selectedColorType={paintColor} onSelect={setPaintColor} />

      {/* 2. Artwork Canvas */}
      <ArtworkCanvas
        pixels={pixels}
        width={artWidth}
        height={artHeight}
        zoom={zoom}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onZoomReset={handleZoomReset}
        onWheel={handleWheel}
        onUploadClick={handleUploadClick}
        onCellPaint={handleCellPaint}
        onGroupPaint={handleAssignPixelToGroup}
        paintColor={paintColor}
        hasData={hasData}
        groupPaintMode={selectedGroupId !== null}
        groups={recomputedGroups}
        selectedGroupId={selectedGroupId}
      />

      {/* 3. Artwork Info + Color Palette */}
      {hasData && (
        <ArtworkInfoPanel
          width={artWidth}
          height={artHeight}
          totalPixels={pixelArray.length}
          colorCounts={colorCounts}
        />
      )}

      {/* 4. Grouping */}
      {hasData && (
        <GroupingSection
          groups={recomputedGroups}
          selectedGroupId={selectedGroupId}
          onSelectGroup={setSelectedGroupId}
          onAddGroup={handleAddGroup}
          onDeleteGroup={handleDeleteGroup}
          onRenameGroup={handleRenameGroup}
          onReorder={handleReorderGroup}
        />
      )}

      {/* 5. Launcher (Requirement) */}
      {hasData && (
        <LauncherSection
          launchers={launchers}
          onAdd={handleAddLauncher}
          onDelete={handleDeleteLauncher}
          onReorder={handleReorderLauncher}
        />
      )}

      {/* 6. Game Preview + Play Button */}
      {hasData && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4" />
                Game Preview
              </div>
              {studioGameConfig && (
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => setPlayMode(true)}
                  className="h-7"
                >
                  <Play className="h-3.5 w-3.5 mr-1" />
                  Play
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex justify-center">
            <GamePreviewCanvas pixels={pixels} width={artWidth} height={artHeight} />
          </CardContent>
        </Card>
      )}

      {/* 7. Item Pool */}
      {hasData && (
        <ItemPoolSection
          items={itemsWithLayers}
          maxSelectableItems={maxSelectableItems}
          onMaxChange={setMaxSelectableItems}
          onAddItem={handleAddItem}
          onDeleteItem={handleDeleteItem}
          onReorder={handleReorderItem}
        />
      )}

      {/* 8. Difficulty Analysis */}
      {hasData && (
        <DifficultyAnalysis
          difficultyResult={difficultyResult}
          maxSelectableItems={maxSelectableItems}
          mismatchDepth={mismatchDepth}
          waitingStandSlots={waitingStandSlots}
          activeLauncherCount={activeLauncherCount}
          seed={seed}
          simulationResult={simulationResult}
          isTargeting={isTargeting}
          isSimulating={isSimulating}
          onMaxSelectableChange={setMaxSelectableItems}
          onMismatchDepthChange={setMismatchDepth}
          onWaitingStandSlotsChange={setWaitingStandSlots}
          onActiveLauncherCountChange={setActiveLauncherCount}
          onSeedChange={setSeed}
          onEasier={handleEasier}
          onHarder={handleHarder}
          onAutoTarget={handleAutoTarget}
          onSimulate={handleSimulate}
        />
      )}

      {/* 9. Save & Add to Collection */}
      {hasData && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Save &amp; Add to Collection</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Level Position */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs text-muted-foreground">Level Position</label>
                <Badge variant="outline">#{levelNumber}</Badge>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => onLevelNumberChange?.(Math.max(1, levelNumber - 1))}
                  disabled={levelNumber <= 1}
                >
                  -
                </Button>
                <Slider
                  value={[levelNumber]}
                  min={1}
                  max={maxLevelNumber}
                  step={1}
                  onValueChange={([v]) => onLevelNumberChange?.(v)}
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => onLevelNumberChange?.(Math.min(maxLevelNumber, levelNumber + 1))}
                  disabled={levelNumber >= maxLevelNumber}
                >
                  +
                </Button>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              {onAddToCollection && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleAddToCollection}
                  disabled={pixelArray.length < 4 || !metrics}
                  className="flex-1"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  {editingLevel ? 'Update Level' : 'Add to Collection'}
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={handleExportJSON}
                disabled={pixelArray.length === 0}
                className="flex-1"
              >
                <Download className="h-4 w-4 mr-1" />
                Export JSON
              </Button>
            </div>

            {/* Re-import */}
            <Button
              size="sm"
              variant="outline"
              onClick={handleUploadClick}
              className="w-full"
            >
              <Upload className="h-4 w-4 mr-1" />
              Import Another JSON
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
