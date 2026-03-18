'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  PixelCell,
  DesignedFruitMatchLevel,
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
  initializeState,
  findMaxSolvableBlockingOffset,
} from '@/lib/useStudioGame';
import {
  targetDifficulty,
  simulateStudioGame,
  StudioSimulationResult,
  DifficultyRecipe,
} from '@/lib/studioDifficultyEngine';
import {
  COLOR_TYPE_TO_FRUIT,
  COLOR_TYPE_TO_HEX,
  FRUIT_TO_COLOR_TYPE,
  isReferenceFormat,
  importFromReferenceFormat,
  isFullPixelArtFormat,
  importFromFullPixelArtFormat,
  exportStudioLevel,
  StudioExportData,
  hexToColorType,
} from '@/lib/juicyBlastExport';
import { StudioGameBoard } from './StudioGameBoard';
import {
  Upload,
  Download,
  Plus,
  Eye,
  Play,
} from 'lucide-react';
import {
  LevelDesignerV2Props,
  StudioPixelCell,
  StudioGroup,
  StudioLauncher,
  StudioSelectableItem,
  uid,
} from './designer/types';
import { PaintToolBar } from './designer/PaintToolBar';
import { ArtworkCanvas } from './designer/ArtworkCanvas';
import { ArtworkInfoPanel } from './designer/ArtworkInfoPanel';
import { GroupingSection } from './designer/GroupingSection';
import { LauncherSection } from './designer/LauncherSection';
import { GamePreviewCanvas } from './designer/GamePreviewCanvas';
import { ItemPoolSection } from './designer/ItemPoolSection';
import { DifficultyAnalysis } from './designer/DifficultyAnalysis';
import { StudioArrangementPreview } from './StudioArrangementPreview';

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
  existingLevelIds = [],
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
  const [blockingOffset, setBlockingOffset] = useState(0);
  const [seed, setSeed] = useState<number | undefined>(undefined);
  const [simulationResult, setSimulationResult] = useState<StudioSimulationResult | null>(null);
  const [isTargeting, setIsTargeting] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [parameterLocks, setParameterLocks] = useState({
    blocking: false,
    surfaceSize: false,
    activeLaunchers: false,
  });

  // Play mode
  const [playMode, setPlayMode] = useState(false);

  // Level variant & file name
  const [levelVariant, setLevelVariant] = useState(1);
  const [fileName, setFileName] = useState('');
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [pendingExport, setPendingExport] = useState(false);
  const [pendingAddToCollection, setPendingAddToCollection] = useState(false);

  // Computed Level ID
  const levelId = `Level${levelNumber}_${levelVariant}`;

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
      maxSelectableItems,
      totalTiles,
      blockingOffset,
    };
  }, [pixelArray, launchers, groups.length, selectableItems, maxSelectableItems, blockingOffset]);

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

  // Sort items by order, preserving designer-assigned layers
  const itemsWithLayers = useMemo((): StudioSelectableItem[] => {
    return [...selectableItems].sort((a, b) => a.order - b.order);
  }, [selectableItems]);

  // Build colorType → hex mapping from palette (preferred) or standard colors
  // The palette contains the canonical colors; individual pixel colorHex values
  // are actual rendered colors (outlines, shading) and shouldn't be used for swatches.
  const colorTypeToHex = useMemo((): Record<number, string> => {
    const map: Record<number, string> = {};
    if (palette.length > 0) {
      // Map each palette entry to a game colorType and store the palette hex
      palette.forEach((hex) => {
        const gameColorType = hexToColorType(hex);
        if (!(gameColorType in map)) {
          map[gameColorType] = hex;
        }
      });
    }
    // Fill in any missing colorTypes from the standard map
    pixelArray.forEach((p) => {
      if (!(p.colorType in map)) {
        map[p.colorType] = COLOR_TYPE_TO_HEX[p.colorType] || p.colorHex;
      }
    });
    return map;
  }, [palette, pixelArray]);

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
        layer: item.layer,
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
      blockingOffset,
      colorTypeToHex,
      seed,
    };
  }, [pixelCellArray, artWidth, artHeight, maxSelectableItems, waitingStandSlots, itemsWithLayers, launchers, activeLauncherCount, blockingOffset, colorTypeToHex, seed]);

  const arrangementPreviewState = useMemo(() => {
    if (!studioGameConfig) return null;
    return initializeState({
      ...studioGameConfig,
      seed: studioGameConfig.seed ?? 42,
    });
  }, [studioGameConfig]);

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

        // Pre-fill file name from imported file (without extension)
        const importedFileName = file.name.replace(/\.json$/i, '');
        setFileName(importedFileName);

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

          // Set maxSelectableItems based on launcher count (capped at 20)
          const totalTiles = newLaunchers.length * 3;
          const newMaxItems = Math.min(Math.max(1, Math.ceil(totalTiles / 2)), 20);
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
          setBlockingOffset(0);
          setWaitingStandSlots(5);
          setActiveLauncherCount(2);
          setSeed(undefined);

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

          // Build launchers — prefer Launchers array (preserves splits), fall back to Requirements
          const rawLaunchers = (data as unknown as Record<string, unknown>).Launchers as
            | { ColorType: number; Value: number; Group: number; Order: number; IsLocked: boolean }[]
            | undefined;
          const newLaunchers: StudioLauncher[] = rawLaunchers
            ? rawLaunchers.map((l, idx) => ({
                id: uid('launcher'),
                colorType: l.ColorType,
                pixelCount: l.Value,
                group: l.Group,
                isLocked: l.IsLocked ?? idx >= 2,
                order: l.Order ?? idx,
              }))
            : result.requirements.map((req, idx) => ({
                id: uid('launcher'),
                colorType: req.ColorType,
                pixelCount: req.Value,
                group: req.Group,
                isLocked: idx >= 2,
                order: idx,
              }));
          setLaunchers(newLaunchers);

          // Set maxSelectableItems from data if present (before building items so layers are correct)
          const rawData = data as unknown as Record<string, unknown>;
          const importedMaxItems = typeof rawData.MaxSelectableItems === 'number'
            ? Math.min(rawData.MaxSelectableItems, 20)
            : maxSelectableItems;
          setMaxSelectableItems(importedMaxItems);
          setBlockingOffset(
            typeof rawData.BlockingOffset === 'number'
              ? Math.max(0, Math.min(10, Math.round(rawData.BlockingOffset)))
              : typeof rawData.MismatchDepth === 'number'
                ? Math.max(0, Math.min(10, Math.round(rawData.MismatchDepth * 10)))
                : 0,
          );
          setWaitingStandSlots(
            typeof rawData.WaitingStandSlots === 'number'
              ? Math.max(3, Math.min(7, Math.round(rawData.WaitingStandSlots)))
              : 5,
          );
          setActiveLauncherCount(
            typeof rawData.ActiveLauncherCount === 'number'
              ? Math.max(1, Math.min(3, Math.round(rawData.ActiveLauncherCount)))
              : 2,
          );
          setSeed(typeof rawData.Seed === 'number' ? rawData.Seed : undefined);

          // Build selectable items — use Layer field if present, otherwise compute from position
          const hasLayerField = result.selectableItems.some((si) => si.Layer !== undefined && si.Layer !== null);
          const newItems: StudioSelectableItem[] = result.selectableItems.map((si, idx) => {
            const layer: 'A' | 'B' | 'C' = hasLayerField
              ? (si.Layer === 1 ? 'B' : si.Layer === 2 ? 'C' : 'A')
              : (idx < importedMaxItems ? 'A' : idx < 2 * importedMaxItems ? 'B' : 'C');
            return {
              id: uid('item'),
              colorType: si.ColorType,
              variant: (si as unknown as Record<string, unknown>).Variant as number ?? 0,
              layer,
              order: idx,
            };
          });
          setSelectableItems(newItems);

          // Build palette from color data
          const paletteSet = new Set<string>();
          result.colorData.forEach((cd) => paletteSet.add(cd.colorHex));
          setPalette(Array.from(paletteSet));

          // Parse LevelId (e.g. "Level1_1") for position + variant
          const levelIdMatch = data.LevelId?.match(/^Level(\d+)_(\d+)$/);
          if (levelIdMatch) {
            if (onLevelNumberChange) onLevelNumberChange(parseInt(levelIdMatch[1], 10));
            setLevelVariant(parseInt(levelIdMatch[2], 10));
          } else {
            const match = file.name.match(/level[_-]?(\d+)/i);
            if (match && onLevelNumberChange) {
              onLevelNumberChange(parseInt(match[1], 10));
            }
          }
        } else if (data.Palette && data.Artwork && data.SelectableItems) {
          // Studio merged format (re-import)
          const height = data.Artwork.Height;
          setArtWidth(data.Artwork.Width);
          setArtHeight(height);
          setPalette(data.Palette || []);
          setMaxSelectableItems(Math.min(data.MaxSelectableItems || 10, 20));
          setBlockingOffset(
            typeof data.BlockingOffset === 'number'
              ? Math.max(0, Math.min(10, Math.round(data.BlockingOffset)))
              : typeof data.MismatchDepth === 'number'
                ? Math.max(0, Math.min(10, Math.round(data.MismatchDepth * 10)))
                : 0,
          );
          setWaitingStandSlots(
            typeof data.WaitingStandSlots === 'number'
              ? Math.max(3, Math.min(7, Math.round(data.WaitingStandSlots)))
              : 5,
          );
          setActiveLauncherCount(
            typeof data.ActiveLauncherCount === 'number'
              ? Math.max(1, Math.min(3, Math.round(data.ActiveLauncherCount)))
              : 2,
          );
          setSeed(typeof data.Seed === 'number' ? data.Seed : undefined);

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

          // Launchers — prefer Launchers array (preserves splits), fall back to Requirements
          if (data.Launchers && Array.isArray(data.Launchers)) {
            setLaunchers(
              data.Launchers.map((l: { ColorType: number; Value: number; Group: number; Order: number; IsLocked: boolean }, idx: number) => ({
                id: uid('launcher'),
                colorType: l.ColorType,
                pixelCount: l.Value,
                group: l.Group,
                isLocked: l.IsLocked ?? idx >= 2,
                order: l.Order ?? idx,
              })),
            );
          } else {
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
          }

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

          // Parse LevelId (e.g. "Level1_1") for position + variant
          const studioLevelIdMatch = data.LevelId?.match(/^Level(\d+)_(\d+)$/);
          if (studioLevelIdMatch) {
            if (onLevelNumberChange) onLevelNumberChange(parseInt(studioLevelIdMatch[1], 10));
            setLevelVariant(parseInt(studioLevelIdMatch[2], 10));
          } else if (onLevelNumberChange && data.LevelIndex) {
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

  // Sync launcher pixelCounts when pixel group assignments change.
  // When multiple launchers share the same (colorType, group), distribute
  // the total proportionally so split launchers aren't overwritten to the total.
  useEffect(() => {
    if (recomputedGroups.length === 0) return;
    setLaunchers((prev) => {
      // Group launchers by (colorType, group) to detect splits
      const keyMap = new Map<string, number[]>();
      prev.forEach((l, idx) => {
        const key = `${l.colorType}-${l.group}`;
        if (!keyMap.has(key)) keyMap.set(key, []);
        keyMap.get(key)!.push(idx);
      });

      let changed = false;
      const updated = [...prev];

      for (const [, indices] of keyMap) {
        const first = prev[indices[0]];
        const g = recomputedGroups.find((gr) => gr.id === first.group);
        if (!g) continue;
        const totalPixels = g.pixelsByColor[first.colorType] ?? 0;
        const currentSum = indices.reduce((sum, i) => sum + prev[i].pixelCount, 0);

        if (totalPixels === currentSum) continue; // already in sync

        if (indices.length === 1) {
          // Single launcher — set directly
          if (prev[indices[0]].pixelCount !== totalPixels) {
            changed = true;
            updated[indices[0]] = { ...prev[indices[0]], pixelCount: totalPixels };
          }
        } else {
          // Multiple launchers (splits) — distribute proportionally
          let remaining = totalPixels;
          for (let i = 0; i < indices.length; i++) {
            const idx = indices[i];
            const ratio = currentSum > 0 ? prev[idx].pixelCount / currentSum : 1 / indices.length;
            const share = i < indices.length - 1
              ? Math.round(totalPixels * ratio)
              : remaining; // last one gets the remainder
            remaining -= share;
            if (prev[idx].pixelCount !== share) {
              changed = true;
              updated[idx] = { ...prev[idx], pixelCount: share };
            }
          }
        }
      }
      return changed ? updated : prev;
    });
  }, [recomputedGroups]);

  // ============================================================================
  // Launcher handlers
  // ============================================================================

  const handleAddLauncher = useCallback((colorType: number, pixelCount: number, group: number) => {
    const newOrder = launchers.length;
    setLaunchers((prev) => [
      ...prev,
      {
        id: uid('launcher'),
        colorType,
        pixelCount,
        group,
        isLocked: newOrder >= 2,
        order: newOrder,
      },
    ]);
  }, [launchers.length]);

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

  const handleUpdateLauncher = useCallback((id: string, updates: Partial<Pick<StudioLauncher, 'colorType' | 'pixelCount' | 'group'>>) => {
    setLaunchers((prev) => prev.map((l) => (l.id === id ? { ...l, ...updates } : l)));
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

  const handleChangeLayer = useCallback((id: string, layer: 'A' | 'B' | 'C') => {
    setSelectableItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, layer } : item)),
    );
  }, []);

  const handleReorderItem = useCallback((fromIndex: number, toIndex: number) => {
    setSelectableItems((prev) => {
      const sorted = [...prev].sort((a, b) => a.order - b.order);
      const [moved] = sorted.splice(fromIndex, 1);
      sorted.splice(toIndex, 0, moved);
      // Determine the target layer from the item at the drop position
      // (the item that was displaced)
      const targetItem = sorted[toIndex === sorted.length ? toIndex - 1 : toIndex];
      const targetLayer = targetItem ? targetItem.layer : moved.layer;
      return sorted.map((item, idx) => ({
        ...item,
        order: idx,
        layer: item === moved ? targetLayer : item.layer,
      }));
    });
  }, []);

  // ============================================================================
  // Difficulty adjustments
  // ============================================================================

  const maxActiveLaunchers = useMemo(() => Math.min(3, Math.max(1, launchers.length || 1)), [launchers.length]);

  const handleToggleParameterLock = useCallback((key: 'blocking' | 'surfaceSize' | 'activeLaunchers') => {
    setParameterLocks((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }, []);

  const handleEasier = useCallback(() => {
    if (!parameterLocks.blocking && blockingOffset > 0) {
      setBlockingOffset((value) => Math.max(0, value - 1));
      return;
    }
    if (!parameterLocks.surfaceSize && maxSelectableItems < 20) {
      setMaxSelectableItems((v) => Math.min(20, v + 1));
      return;
    }
    if (!parameterLocks.activeLaunchers && activeLauncherCount < maxActiveLaunchers) {
      setActiveLauncherCount((value) => Math.min(maxActiveLaunchers, value + 1));
    }
  }, [parameterLocks, blockingOffset, maxSelectableItems, activeLauncherCount, maxActiveLaunchers]);

  const handleHarder = useCallback(() => {
    if (!studioGameConfig) return;
    if (!parameterLocks.blocking && blockingOffset < 10) {
      const maxOffset = findMaxSolvableBlockingOffset(studioGameConfig);
      if (blockingOffset < maxOffset) {
        setBlockingOffset((value) => Math.min(maxOffset, value + 1));
        return;
      }
    }
    if (!parameterLocks.surfaceSize && maxSelectableItems > 1) {
      setMaxSelectableItems((v) => Math.max(1, v - 1));
      return;
    }
    if (!parameterLocks.activeLaunchers && activeLauncherCount > 1) {
      setActiveLauncherCount((value) => Math.max(1, value - 1));
    }
  }, [studioGameConfig, parameterLocks, blockingOffset, maxSelectableItems, activeLauncherCount]);

  const handleAutoTarget = useCallback((targetScore: number) => {
    if (!studioGameConfig) return;
    setIsTargeting(true);
    // Use setTimeout to let the UI show the loading state
    setTimeout(() => {
      try {
        const result = targetDifficulty(studioGameConfig, targetScore, {
          seed: seed ?? Math.floor(Math.random() * 2147483647),
        });
        setBlockingOffset(result.recipe.blockingOffset);
        setMaxSelectableItems(result.recipe.maxSelectableItems);
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
          blockingOffset,
          mismatchDepth: blockingOffset / 10,
          maxSelectableItems,
          activeLauncherCount,
          seed: seed ?? Math.floor(Math.random() * 2147483647),
        };
        const result = simulateStudioGame(studioGameConfig, recipe, 100);
        setSimulationResult(result);
      } finally {
        setIsSimulating(false);
      }
    }, 10);
  }, [studioGameConfig, blockingOffset, maxSelectableItems, activeLauncherCount, seed]);

  // ============================================================================
  // Export JSON
  // ============================================================================

  const doExportJSON = useCallback(() => {
    const exportData: StudioExportData = {
      palette,
      levelId,
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
      launchers: launchers
        .sort((a, b) => a.order - b.order)
        .map((l) => ({
          colorType: l.colorType,
          pixelCount: l.pixelCount,
          group: l.group,
          order: l.order,
          isLocked: l.isLocked,
        })),
      unlockStageData: [{ requiredCompletedGroups: groups.map((g) => g.id) }],
      maxSelectableItems,
      seed,
      blockingOffset,
      mismatchDepth: blockingOffset / 10,
      waitingStandSlots,
      activeLauncherCount,
    };

    const result = exportStudioLevel(exportData);
    const blob = new Blob([JSON.stringify(result, null, 4)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName.trim() || levelId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [palette, levelId, levelNumber, fileName, difficultyResult, artWidth, artHeight, pixelArray, itemsWithLayers, launchers, groups, maxSelectableItems, seed, blockingOffset, waitingStandSlots, activeLauncherCount]);

  const handleExportJSON = useCallback(() => {
    if (existingLevelIds.includes(levelId) && !editingLevel) {
      setPendingExport(true);
      setPendingAddToCollection(false);
      setShowDuplicateDialog(true);
      return;
    }
    doExportJSON();
  }, [levelId, existingLevelIds, editingLevel, doExportJSON]);

  // ============================================================================
  // Add to Collection
  // ============================================================================

  const doAddToCollection = useCallback(() => {
    if (!onAddToCollection || !metrics || sinkStacks.length === 0) return;

    const designedLevel: DesignedFruitMatchLevel = {
      id: editingLevel?.id || `level-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: levelId,
      levelNumber,
      pixelArt: pixelCellArray,
      pixelArtWidth: artWidth,
      pixelArtHeight: artHeight,
      sinkWidth,
      sinkStacks,
      waitingStandSlots,
      metrics,
      createdAt: editingLevel?.createdAt || Date.now(),
      studioSelectableItems: itemsWithLayers.map((item) => ({
        colorType: item.colorType,
        variant: item.variant,
        layer: item.layer,
        order: item.order,
      })),
      studioLaunchers: [...launchers]
        .sort((a, b) => a.order - b.order)
        .map((launcher) => ({
          colorType: launcher.colorType,
          pixelCount: launcher.pixelCount,
          group: launcher.group,
          order: launcher.order,
          isLocked: launcher.isLocked,
        })),
      studioMaxSelectableItems: maxSelectableItems,
      studioBlockingOffset: blockingOffset,
      studioWaitingStandSlots: waitingStandSlots,
      studioActiveLauncherCount: activeLauncherCount,
      studioSeed: seed,
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
    itemsWithLayers,
    launchers,
    maxSelectableItems,
    blockingOffset,
    activeLauncherCount,
    seed,
    levelId,
    levelNumber,
    editingLevel,
  ]);

  const handleAddToCollection = useCallback(() => {
    if (!onAddToCollection || !metrics || sinkStacks.length === 0) return;
    if (existingLevelIds.includes(levelId) && !editingLevel) {
      setPendingExport(false);
      setPendingAddToCollection(true);
      setShowDuplicateDialog(true);
      return;
    }
    doAddToCollection();
  }, [onAddToCollection, metrics, sinkStacks, levelId, existingLevelIds, editingLevel, doAddToCollection]);

  const handleDuplicateConfirm = useCallback(() => {
    setShowDuplicateDialog(false);
    if (pendingExport) doExportJSON();
    if (pendingAddToCollection) doAddToCollection();
    setPendingExport(false);
    setPendingAddToCollection(false);
  }, [pendingExport, pendingAddToCollection, doExportJSON, doAddToCollection]);

  const handleDuplicateCancel = useCallback(() => {
    setShowDuplicateDialog(false);
    setPendingExport(false);
    setPendingAddToCollection(false);
  }, []);

  // ============================================================================
  // Load editing level
  // ============================================================================

  useEffect(() => {
    if (!editingLevel) return;

    setArtWidth(editingLevel.pixelArtWidth);
    setArtHeight(editingLevel.pixelArtHeight);
    setSinkWidth(editingLevel.sinkWidth);
    setSelectedGroupId(null);
    setBlockingOffset(editingLevel.studioBlockingOffset ?? 0);
    setWaitingStandSlots(editingLevel.studioWaitingStandSlots ?? editingLevel.waitingStandSlots ?? 5);
    setActiveLauncherCount(editingLevel.studioActiveLauncherCount ?? 2);
    setSeed(editingLevel.studioSeed);

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

    if (editingLevel.studioLaunchers && editingLevel.studioLaunchers.length > 0) {
      setLaunchers(
        editingLevel.studioLaunchers.map((launcher, idx) => ({
          id: uid('launcher'),
          colorType: launcher.colorType,
          pixelCount: launcher.pixelCount,
          group: launcher.group,
          isLocked: launcher.isLocked ?? idx >= 2,
          order: launcher.order ?? idx,
        })),
      );
    } else {
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
    }

    if (editingLevel.studioSelectableItems && editingLevel.studioSelectableItems.length > 0) {
      setSelectableItems(
        editingLevel.studioSelectableItems.map((item, idx) => ({
          id: uid('item'),
          colorType: item.colorType,
          variant: item.variant,
          layer: item.layer,
          order: item.order ?? idx,
        })),
      );
      setMaxSelectableItems(editingLevel.studioMaxSelectableItems ?? 10);
    } else {
      const fallbackLaunchers = editingLevel.studioLaunchers && editingLevel.studioLaunchers.length > 0
        ? editingLevel.studioLaunchers
        : (() => {
            const generated: Array<{
              colorType: number;
              pixelCount: number;
              group: number;
              order: number;
              isLocked: boolean;
            }> = [];
            let order = 0;
            for (const group of Array.from(groupMap.values()).sort((a, b) => a.id - b.id)) {
              const colorTypes = Object.keys(group.pixelsByColor).map(Number).sort((a, b) => a - b);
              for (const ct of colorTypes) {
                generated.push({
                  colorType: ct,
                  pixelCount: group.pixelsByColor[ct],
                  group: group.id,
                  order,
                  isLocked: order >= 2,
                });
                order++;
              }
            }
            return generated;
          })();
      const totalTiles = fallbackLaunchers.length * 3;
      const newMaxItems = Math.min(Math.max(6, Math.ceil(totalTiles / 2)), 10);
      setMaxSelectableItems(newMaxItems);

      const newItems: StudioSelectableItem[] = [];
      let itemOrder = 0;
      for (const launcher of fallbackLaunchers) {
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
    }
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
          colorTypeToHex={colorTypeToHex}
          totalPixels={pixelArray.length}
        />
      )}

      {/* 5. Launcher (Requirement) */}
      {hasData && (
        <LauncherSection
          launchers={launchers}
          groups={recomputedGroups}
          onAdd={handleAddLauncher}
          onDelete={handleDeleteLauncher}
          onReorder={handleReorderLauncher}
          onUpdate={handleUpdateLauncher}
          colorTypeToHex={colorTypeToHex}
          totalPixels={pixelArray.length}
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
          <CardContent>
            <div className="flex justify-center">
              <GamePreviewCanvas pixels={pixels} width={artWidth} height={artHeight} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* 6b. Arrangement Preview + Difficulty Controls (expandable inside) */}
      {hasData && arrangementPreviewState && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              Arrangement Preview
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <DifficultyAnalysis
              difficultyResult={difficultyResult}
              difficultyParams={studioDifficultyParams}
              maxSelectableItems={maxSelectableItems}
              blockingOffset={blockingOffset}
              waitingStandSlots={waitingStandSlots}
              activeLauncherCount={activeLauncherCount}
              maxActiveLaunchers={maxActiveLaunchers}
              seed={seed}
              parameterLocks={parameterLocks}
              simulationResult={simulationResult}
              isTargeting={isTargeting}
              isSimulating={isSimulating}
              onMaxSelectableChange={setMaxSelectableItems}
              onBlockingOffsetChange={setBlockingOffset}
              onWaitingStandSlotsChange={setWaitingStandSlots}
              onActiveLauncherCountChange={setActiveLauncherCount}
              onSeedChange={setSeed}
              onToggleParameterLock={handleToggleParameterLock}
              onEasier={handleEasier}
              onHarder={handleHarder}
              onAutoTarget={handleAutoTarget}
              onSimulate={handleSimulate}
            />
            <StudioArrangementPreview
              previewState={arrangementPreviewState}
              colorTypeToHex={colorTypeToHex}
              waitingStandSlots={waitingStandSlots}
              blockingOffset={blockingOffset}
              maxSelectableItems={maxSelectableItems}
            />
          </CardContent>
        </Card>
      )}

      {/* 8. Item Pool */}
      {hasData && (
        <ItemPoolSection
          items={itemsWithLayers}
          maxSelectableItems={maxSelectableItems}
          onMaxChange={setMaxSelectableItems}
          onAddItem={handleAddItem}
          onDeleteItem={handleDeleteItem}
          onReorder={handleReorderItem}
          onChangeLayer={handleChangeLayer}
          colorTypeToHex={colorTypeToHex}
        />
      )}

      {/* 9. Save & Add to Collection */}
      {hasData && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Save &amp; Add to Collection</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Level Position & Variant */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Level Position</label>
                <Input
                  type="number"
                  min={1}
                  max={maxLevelNumber}
                  value={levelNumber}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (!isNaN(v) && v >= 1 && v <= maxLevelNumber) onLevelNumberChange?.(v);
                  }}
                  className="h-8"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Level Variant</label>
                <Input
                  type="number"
                  min={1}
                  value={levelVariant}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (!isNaN(v) && v >= 1) setLevelVariant(v);
                  }}
                  className="h-8"
                />
              </div>
            </div>

            {/* Level ID (computed) */}
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Level ID</label>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs font-mono">{levelId}</Badge>
                {existingLevelIds.includes(levelId) && !editingLevel && (
                  <span className="text-xs text-yellow-500">ID already exists</span>
                )}
              </div>
            </div>

            {/* File Name */}
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">File Name</label>
              <Input
                type="text"
                placeholder={levelId}
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                className="h-8 font-mono text-xs"
              />
              <p className="text-[10px] text-muted-foreground">
                Exports as {fileName.trim() || levelId}.json
              </p>
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

      {/* Duplicate Level ID Dialog */}
      <Dialog open={showDuplicateDialog} onOpenChange={setShowDuplicateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Duplicate Level ID</DialogTitle>
            <DialogDescription>
              A level with ID <span className="font-mono font-bold">{levelId}</span> already exists.
              Do you want to replace it or go back to change the Level Position / Variant?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={handleDuplicateCancel}>
              Go Back
            </Button>
            <Button variant="destructive" onClick={handleDuplicateConfirm}>
              Replace
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
