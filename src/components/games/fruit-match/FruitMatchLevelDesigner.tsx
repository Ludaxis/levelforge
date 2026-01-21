'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  FruitType,
  PixelCell,
  FruitMatchLevel,
  DesignedFruitMatchLevel,
  LauncherOrderConfig,
  FRUIT_EMOJI,
  FRUIT_COLORS,
  ALL_FRUITS,
} from '@/types/fruitMatch';
import {
  generateSinkStacks,
  getRequiredFruitCounts,
  calculateLevelMetrics,
  pixelKey,
  migrateFruitType,
} from '@/lib/fruitMatchUtils';
import {
  emojiToPixelArtAsync,
  imageToPixelArt,
  POPULAR_EMOJIS,
} from '@/lib/pixelArtConverter';
import {
  calculateDifficultyMetrics,
  DifficultyMetrics,
} from '@/lib/fruitMatchDifficulty';
import {
  exportToReferenceFormat,
  importFromReferenceFormat,
  isReferenceFormat,
} from '@/lib/juicyBlastExport';
import { LauncherOrderEditor } from './LauncherOrderEditor';
import {
  Settings,
  Play,
  Trash2,
  Plus,
  BarChart3,
  CheckCircle,
  AlertTriangle,
  Eraser,
  Upload,
  Download,
  Image as ImageIcon,
  Smile,
  Pencil,
  Loader2,
  TrendingUp,
  TrendingDown,
  ZoomIn,
  ZoomOut,
  Maximize,
  Layers,
} from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

interface FruitMatchLevelDesignerProps {
  onPlayLevel: (level: FruitMatchLevel) => void;
  onAddToCollection?: (level: DesignedFruitMatchLevel) => void;
  levelNumber?: number;
  onLevelNumberChange?: (num: number) => void;
  maxLevelNumber?: number;
  editingLevel?: DesignedFruitMatchLevel | null;
}

type DesignMode = 'emoji' | 'image' | 'edit' | 'groups';

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_GRID_SIZE = 32;
const MIN_GRID_SIZE = 20;
const MAX_GRID_SIZE = 100;

const DIFFICULTY_COLORS = {
  trivial: 'bg-gray-500',
  easy: 'bg-green-500',
  medium: 'bg-yellow-500 text-black',
  hard: 'bg-orange-500',
  expert: 'bg-red-500',
  nightmare: 'bg-purple-500',
};

// ============================================================================
// Component
// ============================================================================

export function FruitMatchLevelDesigner({
  onPlayLevel,
  onAddToCollection,
  levelNumber = 1,
  onLevelNumberChange,
  maxLevelNumber = 100,
  editingLevel,
}: FruitMatchLevelDesignerProps) {
  // Design mode
  const [designMode, setDesignMode] = useState<DesignMode>('emoji');

  // Grid configuration
  const [gridWidth, setGridWidth] = useState(DEFAULT_GRID_SIZE);
  const [gridHeight, setGridHeight] = useState(DEFAULT_GRID_SIZE);

  // Pixel art state (Map for quick lookup)
  const [pixelArt, setPixelArt] = useState<Map<string, PixelCell>>(new Map());

  // Emoji selection
  const [selectedEmoji, setSelectedEmoji] = useState<string>('🍎');
  const [customEmoji, setCustomEmoji] = useState('');

  // Edit mode paint tool
  const [selectedFruit, setSelectedFruit] = useState<FruitType | 'eraser'>('apple');

  // Sink configuration
  const [sinkWidth, setSinkWidth] = useState(6);
  const [waitingStandSlots, setWaitingStandSlots] = useState(7);
  const [minStackHeight, setMinStackHeight] = useState(2);
  const [maxStackHeight, setMaxStackHeight] = useState(4);

  // Loading state for emoji conversion
  const [isLoading, setIsLoading] = useState(false);

  // Difficulty adjustment state
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [lastAdjustmentResult, setLastAdjustmentResult] = useState<{
    success: boolean;
    scoreBefore: number;
    scoreAfter: number;
    action: string;
  } | null>(null);

  // Zoom state
  const [zoom, setZoom] = useState(1);

  // Launcher order config state
  const [launcherOrderConfig, setLauncherOrderConfig] = useState<LauncherOrderConfig | null>(null);

  // Painting state (for click-and-hold)
  const [isPainting, setIsPainting] = useState(false);
  const lastPaintedCell = useRef<{ row: number; col: number } | null>(null);

  // File input ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Canvas ref for pixel art preview
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Auto-clear adjustment feedback after 3 seconds
  useEffect(() => {
    if (lastAdjustmentResult) {
      const timer = setTimeout(() => setLastAdjustmentResult(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [lastAdjustmentResult]);

  // Load editing level
  useEffect(() => {
    if (editingLevel) {
      setGridWidth(editingLevel.pixelArtWidth);
      setGridHeight(editingLevel.pixelArtHeight);
      setSinkWidth(editingLevel.sinkWidth);
      setWaitingStandSlots(editingLevel.waitingStandSlots);
      setDesignMode('edit');

      // Convert pixel art array to Map (with fruit type migration for backward compatibility)
      const map = new Map<string, PixelCell>();
      for (const cell of editingLevel.pixelArt) {
        map.set(pixelKey(cell.row, cell.col), {
          ...cell,
          fruitType: migrateFruitType(cell.fruitType),
        });
      }
      setPixelArt(map);

      // Load launcher order config if present (with fruit type migration)
      if (editingLevel.launcherOrderConfig) {
        const migratedConfig: LauncherOrderConfig = {
          ...editingLevel.launcherOrderConfig,
          groups: editingLevel.launcherOrderConfig.groups?.map(g => ({
            ...g,
            colorTypes: g.colorTypes.map(ct => migrateFruitType(ct)),
          })) || [],
          launchers: editingLevel.launcherOrderConfig.launchers?.map(l => ({
            ...l,
            fruitType: migrateFruitType(l.fruitType),
          })) || [],
        };
        setLauncherOrderConfig(migratedConfig);
      }
    }
  }, [editingLevel]);

  // Convert pixel art Map to array
  const pixelArtArray = useMemo(() => {
    return Array.from(pixelArt.values());
  }, [pixelArt]);

  // Calculate required fruit counts
  const fruitCounts = useMemo(() => {
    return getRequiredFruitCounts(pixelArtArray.map(c => ({ ...c, filled: false })));
  }, [pixelArtArray]);

  // Calculate level metrics
  const metrics = useMemo(() => {
    if (pixelArtArray.length === 0) return null;

    // Generate sink stacks for metric calculation
    const sinkStacks = generateSinkStacks(sinkWidth, fruitCounts, minStackHeight, maxStackHeight);
    return calculateLevelMetrics(pixelArtArray, sinkStacks, waitingStandSlots);
  }, [pixelArtArray, sinkWidth, fruitCounts, minStackHeight, maxStackHeight, waitingStandSlots]);

  // Check if level is valid
  const isValid = useMemo(() => {
    return pixelArtArray.length >= 4; // At least 4 pixels
  }, [pixelArtArray]);

  // Create a preview level for difficulty analysis
  const previewLevel = useMemo((): FruitMatchLevel | null => {
    if (!isValid || pixelArtArray.length === 0) return null;

    const sinkStacks = generateSinkStacks(sinkWidth, fruitCounts, minStackHeight, maxStackHeight);

    return {
      id: `preview-${Date.now()}`,
      name: 'Preview Level',
      pixelArt: pixelArtArray,
      pixelArtWidth: gridWidth,
      pixelArtHeight: gridHeight,
      sinkWidth,
      sinkStacks,
      waitingStandSlots,
      difficulty: metrics?.difficulty || 'medium',
    };
  }, [isValid, pixelArtArray, gridWidth, gridHeight, sinkWidth, fruitCounts, minStackHeight, maxStackHeight, waitingStandSlots, metrics]);

  // Detailed difficulty metrics
  const difficultyMetrics = useMemo((): DifficultyMetrics | null => {
    if (!previewLevel) return null;
    return calculateDifficultyMetrics(previewLevel);
  }, [previewLevel]);

  // Zoom controls
  const handleZoomIn = useCallback(() => {
    setZoom(z => Math.min(z * 1.25, 5));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom(z => Math.max(z / 1.25, 0.25));
  }, []);

  const handleZoomReset = useCallback(() => {
    setZoom(1);
  }, []);

  // Ctrl + Mouse wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setZoom(z => Math.max(0.5, Math.min(3, z * delta)));
    }
  }, []);

  // Convert emoji to pixel art (async using Twemoji)
  const handleEmojiSelect = useCallback(async (emoji: string) => {
    setSelectedEmoji(emoji);
    setIsLoading(true);

    try {
      const cells = await emojiToPixelArtAsync(emoji, gridWidth, gridHeight);

      const map = new Map<string, PixelCell>();
      for (const cell of cells) {
        map.set(pixelKey(cell.row, cell.col), cell);
      }
      setPixelArt(map);
    } catch (error) {
      console.error('Failed to convert emoji:', error);
    } finally {
      setIsLoading(false);
    }
  }, [gridWidth, gridHeight]);

  // Handle custom emoji input
  const handleCustomEmojiSubmit = useCallback(() => {
    if (customEmoji.trim()) {
      // Take only the first emoji if multiple are entered
      const emoji = [...customEmoji][0];
      if (emoji) {
        handleEmojiSelect(emoji);
        setCustomEmoji('');
      }
    }
  }, [customEmoji, handleEmojiSelect]);

  // Handle image import
  const handleImageImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    try {
      const cells = await imageToPixelArt(file, gridWidth, gridHeight);
      const map = new Map<string, PixelCell>();
      for (const cell of cells) {
        map.set(pixelKey(cell.row, cell.col), cell);
      }
      setPixelArt(map);
      setDesignMode('edit'); // Switch to edit mode to allow touch-ups
    } catch (error) {
      console.error('Failed to import image:', error);
      alert('Failed to import image. Please try a different image.');
    } finally {
      setIsLoading(false);
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [gridWidth, gridHeight]);

  // Handle cell click - paint or erase (in edit mode)
  const handleCellClick = useCallback((row: number, col: number) => {
    if (designMode !== 'edit') return;

    const key = pixelKey(row, col);

    setPixelArt(prev => {
      const newMap = new Map(prev);

      if (selectedFruit === 'eraser') {
        newMap.delete(key);
      } else {
        newMap.set(key, {
          row,
          col,
          fruitType: selectedFruit,
          filled: false,
        });
      }

      return newMap;
    });
  }, [designMode, selectedFruit]);

  // Clear all pixels
  const clearAll = useCallback(() => {
    setPixelArt(new Map());
    setSelectedEmoji('');
    setDesignMode('edit');
    setLauncherOrderConfig(null);
  }, []);

  // Export design as JSON (reference format)
  const handleExportJSON = useCallback(() => {
    const referenceLevel = exportToReferenceFormat({
      levelId: `level_${String(levelNumber).padStart(3, '0')}`,
      levelIndex: levelNumber,
      difficulty: metrics?.difficulty || 'medium',
      graphicId: `graphic_${gridWidth}x${gridHeight}`,
      pixelArtWidth: gridWidth,
      pixelArtHeight: gridHeight,
      pixelArt: pixelArtArray,
      launcherOrderConfig: launcherOrderConfig || undefined,
    });

    const dataStr = JSON.stringify(referenceLevel, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `level_${levelNumber}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [pixelArtArray, gridWidth, gridHeight, levelNumber, metrics, launcherOrderConfig]);

  // Import design from JSON (supports reference format and internal format)
  const handleImportJSON = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const content = await file.text();
        const imported = JSON.parse(content);

        // Check if it's reference format
        if (isReferenceFormat(imported)) {
          const refImported = importFromReferenceFormat(imported);

          // Load pixel art from reference format (preserve groupId)
          const map = new Map<string, PixelCell>();
          for (const cell of refImported.pixelArt) {
            map.set(pixelKey(cell.row, cell.col), {
              row: cell.row,
              col: cell.col,
              fruitType: cell.fruitType,
              filled: false,
              groupId: cell.groupId,
            });
          }
          setPixelArt(map);

          // Load settings
          setGridWidth(refImported.pixelArtWidth);
          setGridHeight(refImported.pixelArtHeight);

          // Extract level number from filename or LevelIndex
          const match = file.name.match(/level[_-]?(\d+)/i);
          const extractedLevelNumber = match ? parseInt(match[1], 10) : refImported.levelIndex;
          if (onLevelNumberChange && extractedLevelNumber) {
            onLevelNumberChange(extractedLevelNumber);
          }

          // Load launcher order config if present in imported data
          if (refImported.launcherOrderConfig) {
            setLauncherOrderConfig(refImported.launcherOrderConfig);
          } else {
            setLauncherOrderConfig(null);
          }

          setDesignMode('edit');
          setSelectedEmoji('');
          return;
        }

        // Validate and load internal format data
        if (imported.pixelArt && Array.isArray(imported.pixelArt)) {
          // Load pixel art (with fruit type migration for backward compatibility)
          const map = new Map<string, PixelCell>();
          for (const cell of imported.pixelArt) {
            if (cell.row !== undefined && cell.col !== undefined && cell.fruitType) {
              map.set(pixelKey(cell.row, cell.col), {
                row: cell.row,
                col: cell.col,
                fruitType: migrateFruitType(cell.fruitType),
                filled: false,
                groupId: cell.groupId,
              });
            }
          }
          setPixelArt(map);

          // Load settings if present
          if (imported.pixelArtWidth) setGridWidth(imported.pixelArtWidth);
          if (imported.pixelArtHeight) setGridHeight(imported.pixelArtHeight);
          if (imported.sinkWidth) setSinkWidth(imported.sinkWidth);
          if (imported.waitingStandSlots) setWaitingStandSlots(imported.waitingStandSlots);
          if (imported.minStackHeight) setMinStackHeight(imported.minStackHeight);
          if (imported.maxStackHeight) setMaxStackHeight(imported.maxStackHeight);
          if (imported.launcherOrderConfig) {
            // Migrate fruit types in launcherOrderConfig for backward compatibility
            const migratedConfig: LauncherOrderConfig = {
              ...imported.launcherOrderConfig,
              groups: imported.launcherOrderConfig.groups?.map((g: { id: number; name: string; colorTypes: string[]; order: number }) => ({
                ...g,
                colorTypes: g.colorTypes.map((ct: string) => migrateFruitType(ct)),
              })) || [],
              launchers: imported.launcherOrderConfig.launchers?.map((l: { id: string; fruitType: string; capacity: number; groupId: number; orderIndex: number }) => ({
                ...l,
                fruitType: migrateFruitType(l.fruitType),
              })) || [],
            };
            setLauncherOrderConfig(migratedConfig);
          } else {
            setLauncherOrderConfig(null);
          }

          setDesignMode('edit');
          setSelectedEmoji('');
        } else {
          alert('Invalid JSON format. Expected pixelArt array or reference format.');
        }
      } catch (err) {
        console.error('Failed to import:', err);
        alert('Failed to import JSON. Invalid format.');
      }
    };
    input.click();
  }, [onLevelNumberChange]);

  // Handle grid size change - regenerate from emoji
  const handleGridSizeChange = useCallback(async (newWidth: number, newHeight: number) => {
    setGridWidth(newWidth);
    setGridHeight(newHeight);

    // If we have a selected emoji and we're in emoji mode, regenerate
    if (designMode === 'emoji' && selectedEmoji) {
      setIsLoading(true);
      try {
        const cells = await emojiToPixelArtAsync(selectedEmoji, newWidth, newHeight);
        const map = new Map<string, PixelCell>();
        for (const cell of cells) {
          map.set(pixelKey(cell.row, cell.col), cell);
        }
        setPixelArt(map);
      } catch (error) {
        console.error('Failed to regenerate pixel art:', error);
      } finally {
        setIsLoading(false);
      }
    } else {
      // In edit mode, just clip pixels outside new bounds
      setPixelArt(prev => {
        const newMap = new Map<string, PixelCell>();
        prev.forEach((cell, key) => {
          if (cell.row < newHeight && cell.col < newWidth) {
            newMap.set(key, cell);
          }
        });
        return newMap;
      });
    }
  }, [designMode, selectedEmoji]);

  // Difficulty adjustment - make easier
  const decreaseDifficulty = useCallback(async () => {
    if (!difficultyMetrics || isAdjusting) return;

    setIsAdjusting(true);
    const scoreBefore = difficultyMetrics.difficultyScore;

    await new Promise(resolve => setTimeout(resolve, 10));

    try {
      // Strategy: Increase waiting stand slots (more buffer = easier)
      if (waitingStandSlots < 9) {
        setWaitingStandSlots(prev => Math.min(9, prev + 1));
        setLastAdjustmentResult({
          success: true,
          scoreBefore,
          scoreAfter: scoreBefore - 5,
          action: `Increased waiting stand slots`,
        });
        return;
      }

      // Strategy: Decrease sink width (fewer columns = simpler)
      if (sinkWidth > 4) {
        setSinkWidth(prev => Math.max(4, prev - 1));
        setLastAdjustmentResult({
          success: true,
          scoreBefore,
          scoreAfter: scoreBefore - 3,
          action: `Decreased sink columns`,
        });
        return;
      }

      // Strategy: Decrease max stack height
      if (maxStackHeight > 2) {
        setMaxStackHeight(prev => Math.max(2, prev - 1));
        setLastAdjustmentResult({
          success: true,
          scoreBefore,
          scoreAfter: scoreBefore - 4,
          action: `Decreased max stack height`,
        });
        return;
      }

      setLastAdjustmentResult({
        success: false,
        scoreBefore,
        scoreAfter: scoreBefore,
        action: `Cannot decrease difficulty further`,
      });
    } finally {
      setIsAdjusting(false);
    }
  }, [difficultyMetrics, isAdjusting, waitingStandSlots, sinkWidth, maxStackHeight]);

  // Difficulty adjustment - make harder
  const increaseDifficulty = useCallback(async () => {
    if (!difficultyMetrics || isAdjusting) return;

    setIsAdjusting(true);
    const scoreBefore = difficultyMetrics.difficultyScore;

    await new Promise(resolve => setTimeout(resolve, 10));

    try {
      // Strategy: Decrease waiting stand slots (less buffer = harder)
      if (waitingStandSlots > 5) {
        setWaitingStandSlots(prev => Math.max(5, prev - 1));
        setLastAdjustmentResult({
          success: true,
          scoreBefore,
          scoreAfter: scoreBefore + 5,
          action: `Decreased waiting stand slots`,
        });
        return;
      }

      // Strategy: Increase sink width (more columns = harder)
      if (sinkWidth < 10) {
        setSinkWidth(prev => Math.min(10, prev + 1));
        setLastAdjustmentResult({
          success: true,
          scoreBefore,
          scoreAfter: scoreBefore + 3,
          action: `Increased sink columns`,
        });
        return;
      }

      // Strategy: Increase max stack height
      if (maxStackHeight < 6) {
        setMaxStackHeight(prev => Math.min(6, prev + 1));
        setLastAdjustmentResult({
          success: true,
          scoreBefore,
          scoreAfter: scoreBefore + 4,
          action: `Increased max stack height`,
        });
        return;
      }

      setLastAdjustmentResult({
        success: false,
        scoreBefore,
        scoreAfter: scoreBefore,
        action: `Cannot increase difficulty further`,
      });
    } finally {
      setIsAdjusting(false);
    }
  }, [difficultyMetrics, isAdjusting, waitingStandSlots, sinkWidth, maxStackHeight]);

  // Create playable level
  const createLevel = useCallback((): FruitMatchLevel | null => {
    if (!isValid) return null;

    const sinkStacks = generateSinkStacks(sinkWidth, fruitCounts, minStackHeight, maxStackHeight);

    return {
      id: `custom-${Date.now()}`,
      name: `Level ${levelNumber}`,
      pixelArt: pixelArtArray,
      pixelArtWidth: gridWidth,
      pixelArtHeight: gridHeight,
      sinkWidth,
      sinkStacks,
      waitingStandSlots,
      difficulty: metrics?.difficulty || 'medium',
      launcherOrderConfig: launcherOrderConfig || undefined,
    };
  }, [isValid, pixelArtArray, gridWidth, gridHeight, sinkWidth, fruitCounts, minStackHeight, maxStackHeight, waitingStandSlots, levelNumber, metrics, launcherOrderConfig]);

  // Play level
  const handlePlay = useCallback(() => {
    const level = createLevel();
    if (level) {
      onPlayLevel(level);
    }
  }, [createLevel, onPlayLevel]);

  // Add to collection
  const handleAddToCollection = useCallback(() => {
    if (!onAddToCollection || !metrics) return;

    const sinkStacks = generateSinkStacks(sinkWidth, fruitCounts, minStackHeight, maxStackHeight);

    const designedLevel: DesignedFruitMatchLevel = {
      id: editingLevel?.id || `level-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: `Level ${levelNumber}`,
      levelNumber,
      pixelArt: pixelArtArray,
      pixelArtWidth: gridWidth,
      pixelArtHeight: gridHeight,
      sinkWidth,
      sinkStacks,
      waitingStandSlots,
      metrics,
      createdAt: editingLevel?.createdAt || Date.now(),
      launcherOrderConfig: launcherOrderConfig || undefined,
    };

    onAddToCollection(designedLevel);
    clearAll();
  }, [onAddToCollection, metrics, pixelArtArray, gridWidth, gridHeight, sinkWidth, fruitCounts, minStackHeight, maxStackHeight, waitingStandSlots, levelNumber, editingLevel, clearAll, launcherOrderConfig]);

  // Cell size for grid - scale based on grid size, min 1px for large grids
  const maxCanvasSize = 600;
  const cellSize = Math.max(1, Math.floor(maxCanvasSize / Math.max(gridWidth, gridHeight)));

  // Canvas dimensions
  const canvasWidth = gridWidth * cellSize;
  const canvasHeight = gridHeight * cellSize;

  // Draw pixel art on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Fully clear the canvas first
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // Draw dark background (opaque)
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Draw grid background
    ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
    for (let row = 0; row < gridHeight; row++) {
      for (let col = 0; col < gridWidth; col++) {
        ctx.fillRect(col * cellSize, row * cellSize, cellSize - 0.5, cellSize - 0.5);
      }
    }

    // Draw filled pixels
    pixelArt.forEach((cell) => {
      ctx.fillStyle = FRUIT_COLORS[cell.fruitType];
      ctx.fillRect(cell.col * cellSize, cell.row * cellSize, cellSize - 0.5, cellSize - 0.5);
    });
  }, [pixelArt, gridWidth, gridHeight, cellSize, canvasWidth, canvasHeight]);

  // Get cell coordinates from mouse/touch event
  const getCellFromEvent = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
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

    if (row >= 0 && row < gridHeight && col >= 0 && col < gridWidth) {
      return { row, col };
    }
    return null;
  }, [cellSize, gridWidth, gridHeight]);

  // Paint a cell (used by mouse/touch handlers)
  const paintCell = useCallback((row: number, col: number) => {
    // Skip if same as last painted cell (avoid redundant updates)
    if (lastPaintedCell.current?.row === row && lastPaintedCell.current?.col === col) {
      return;
    }
    lastPaintedCell.current = { row, col };
    handleCellClick(row, col);
  }, [handleCellClick]);

  // Handle mouse down - start painting
  const handleCanvasMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (designMode !== 'edit') return;
    e.preventDefault();

    setIsPainting(true);
    lastPaintedCell.current = null;

    const cell = getCellFromEvent(e);
    if (cell) {
      paintCell(cell.row, cell.col);
    }
  }, [designMode, getCellFromEvent, paintCell]);

  // Handle mouse move - continue painting if mouse is down
  const handleCanvasMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (designMode !== 'edit' || !isPainting) return;

    const cell = getCellFromEvent(e);
    if (cell) {
      paintCell(cell.row, cell.col);
    }
  }, [designMode, isPainting, getCellFromEvent, paintCell]);

  // Handle mouse up - stop painting
  const handleCanvasMouseUp = useCallback(() => {
    setIsPainting(false);
    lastPaintedCell.current = null;
  }, []);

  // Handle mouse leave - stop painting when leaving canvas
  const handleCanvasMouseLeave = useCallback(() => {
    setIsPainting(false);
    lastPaintedCell.current = null;
  }, []);

  // Handle touch start - start painting
  const handleCanvasTouchStart = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    if (designMode !== 'edit') return;
    e.preventDefault();

    setIsPainting(true);
    lastPaintedCell.current = null;

    const cell = getCellFromEvent(e);
    if (cell) {
      paintCell(cell.row, cell.col);
    }
  }, [designMode, getCellFromEvent, paintCell]);

  // Handle touch move - continue painting
  const handleCanvasTouchMove = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    if (designMode !== 'edit' || !isPainting) return;
    e.preventDefault();

    const cell = getCellFromEvent(e);
    if (cell) {
      paintCell(cell.row, cell.col);
    }
  }, [designMode, isPainting, getCellFromEvent, paintCell]);

  // Handle touch end - stop painting
  const handleCanvasTouchEnd = useCallback(() => {
    setIsPainting(false);
    lastPaintedCell.current = null;
  }, []);

  // Computed values for difficulty adjustment buttons
  const canIncreaseDifficulty = waitingStandSlots > 5 || sinkWidth < 10 || maxStackHeight < 6;
  const canDecreaseDifficulty = waitingStandSlots < 9 || sinkWidth > 4 || maxStackHeight > 2;

  return (
    <div className="space-y-4">
      {/* Validity Check Banner */}
      <div
        className={`flex items-center gap-2 p-3 rounded-lg ${
          isValid ? 'bg-green-500/10 border border-green-500/30' : 'bg-amber-500/10 border border-amber-500/30'
        }`}
      >
        {isValid ? (
          <CheckCircle className="h-5 w-5 text-green-500" />
        ) : (
          <AlertTriangle className="h-5 w-5 text-amber-500" />
        )}
        <div className="flex-1">
          <p className={`text-sm font-medium ${isValid ? 'text-green-500' : 'text-amber-500'}`}>
            {isValid ? 'Level is valid!' : 'Need at least 4 pixels'}
          </p>
          <p className="text-xs text-muted-foreground">
            {pixelArtArray.length} pixels designed
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <Badge variant="outline">{pixelArtArray.length} pixels</Badge>
          {difficultyMetrics && (
            <Badge className={DIFFICULTY_COLORS[difficultyMetrics.difficultyTier]}>
              {difficultyMetrics.difficultyScore}/100 ({difficultyMetrics.difficultyTier})
            </Badge>
          )}
        </div>
      </div>

      {/* Level Designer Card */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Level Designer
          </CardTitle>
          <CardDescription>
            Create pixel art from emoji, import an image, or paint manually
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Design Mode Tabs */}
          <Tabs value={designMode} onValueChange={(v) => setDesignMode(v as DesignMode)}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="emoji" className="flex items-center gap-2">
                <Smile className="h-4 w-4" />
                Emoji
              </TabsTrigger>
              <TabsTrigger value="image" className="flex items-center gap-2">
                <ImageIcon className="h-4 w-4" />
                Image
              </TabsTrigger>
              <TabsTrigger value="edit" className="flex items-center gap-2">
                <Pencil className="h-4 w-4" />
                Edit
              </TabsTrigger>
              <TabsTrigger
                value="groups"
                className="flex items-center gap-2"
                disabled={pixelArtArray.length === 0}
              >
                <Layers className="h-4 w-4" />
                Groups
              </TabsTrigger>
            </TabsList>

            {/* Emoji Mode */}
            <TabsContent value="emoji" className="space-y-4 mt-4">
              {/* Popular Emojis */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Pick an Emoji</label>
                <div className="flex flex-wrap gap-1 max-h-[150px] overflow-y-auto p-2 bg-muted/30 rounded-lg">
                  {POPULAR_EMOJIS.map((emoji) => (
                    <Button
                      key={emoji}
                      variant={selectedEmoji === emoji ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => handleEmojiSelect(emoji)}
                      className="w-10 h-10 text-xl p-0"
                    >
                      {emoji}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Custom Emoji Input */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Or Enter Custom Emoji</label>
                <div className="flex gap-2">
                  <Input
                    value={customEmoji}
                    onChange={(e) => setCustomEmoji(e.target.value)}
                    placeholder="Paste any emoji..."
                    className="flex-1"
                    onKeyDown={(e) => e.key === 'Enter' && handleCustomEmojiSubmit()}
                  />
                  <Button onClick={handleCustomEmojiSubmit} disabled={!customEmoji.trim()}>
                    Convert
                  </Button>
                </div>
              </div>
            </TabsContent>

            {/* Image Mode */}
            <TabsContent value="image" className="space-y-4 mt-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Import Image</label>
                <div className="flex flex-col gap-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageImport}
                    className="hidden"
                  />
                  <Button
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full h-20 border-dashed"
                  >
                    <div className="flex flex-col items-center gap-2">
                      <Upload className="h-6 w-6 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">
                        Click to upload image
                      </span>
                    </div>
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">
                    Image will be converted to {gridWidth}x{gridHeight} pixel art using fruit colors
                  </p>
                </div>
              </div>
            </TabsContent>

            {/* Edit Mode */}
            <TabsContent value="edit" className="space-y-4 mt-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Paint Tool</label>
                <div className="flex flex-wrap gap-2">
                  {ALL_FRUITS.map((fruit) => (
                    <Button
                      key={fruit}
                      variant={selectedFruit === fruit ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSelectedFruit(fruit)}
                      className={`w-10 h-10 p-1 ${selectedFruit === fruit ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}`}
                      title={fruit}
                    >
                      <div
                        className="w-full h-full rounded"
                        style={{ backgroundColor: FRUIT_COLORS[fruit] }}
                      />
                    </Button>
                  ))}
                  <Button
                    variant={selectedFruit === 'eraser' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedFruit('eraser')}
                    className="w-10 h-10"
                  >
                    <Eraser className="h-5 w-5" />
                  </Button>
                </div>
              </div>
            </TabsContent>

            {/* Groups Mode */}
            <TabsContent value="groups" className="space-y-4 mt-4">
              <LauncherOrderEditor
                pixelArt={pixelArtArray}
                pixelArtWidth={gridWidth}
                pixelArtHeight={gridHeight}
                config={launcherOrderConfig}
                onChange={setLauncherOrderConfig}
                onPixelArtChange={(updatedPixelArt) => {
                  // Convert array back to Map
                  const map = new Map<string, PixelCell>();
                  for (const cell of updatedPixelArt) {
                    map.set(pixelKey(cell.row, cell.col), cell);
                  }
                  setPixelArt(map);
                }}
              />
            </TabsContent>
          </Tabs>

          {/* Zoom Controls */}
          <div className="flex items-center justify-center gap-2">
            <Button variant="outline" size="sm" onClick={handleZoomOut} title="Zoom Out">
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-xs text-muted-foreground w-16 text-center">{Math.round(zoom * 100)}%</span>
            <Button variant="outline" size="sm" onClick={handleZoomIn} title="Zoom In">
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={handleZoomReset} title="Reset View">
              <Maximize className="h-4 w-4" />
            </Button>
            <span className="text-xs text-muted-foreground ml-2">
              Ctrl+scroll to zoom
            </span>
          </div>

          {/* Pixel Art Canvas */}
          <div
            className="overflow-auto border border-muted rounded-lg bg-black/50 p-2 flex justify-center relative"
            style={{ maxHeight: '500px' }}
            onWheel={handleWheel}
          >
            {/* Loading Overlay */}
            {isLoading && (
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-20 rounded-lg">
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <span className="text-sm text-muted-foreground">Converting...</span>
                </div>
              </div>
            )}
            <canvas
              ref={canvasRef}
              width={canvasWidth}
              height={canvasHeight}
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              onMouseLeave={handleCanvasMouseLeave}
              onTouchStart={handleCanvasTouchStart}
              onTouchMove={handleCanvasTouchMove}
              onTouchEnd={handleCanvasTouchEnd}
              className={`${designMode === 'edit' ? 'cursor-crosshair' : 'cursor-default'} select-none touch-none`}
              style={{
                imageRendering: 'pixelated',
                width: canvasWidth * zoom,
                height: canvasHeight * zoom,
                maxWidth: 'none',
              }}
            />
          </div>

          {/* Hint for edit mode */}
          {designMode !== 'edit' && pixelArtArray.length > 0 && (
            <p className="text-xs text-center text-muted-foreground">
              Switch to Edit mode to make manual changes
            </p>
          )}

          {/* Fruit Distribution */}
          {pixelArtArray.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {Object.entries(fruitCounts)
                .filter(([_, count]) => count > 0)
                .map(([fruit, count]) => (
                  <div
                    key={fruit}
                    className="flex items-center gap-1 px-2 py-1 rounded bg-muted/30"
                  >
                    <span>{FRUIT_EMOJI[fruit as FruitType]}</span>
                    <span className="text-sm">{count}</span>
                  </div>
                ))}
            </div>
          )}

          {/* Difficulty Adjustment Buttons */}
          {pixelArtArray.length >= 4 && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={decreaseDifficulty}
                  disabled={isAdjusting || !canDecreaseDifficulty}
                  className="flex-1"
                >
                  <TrendingDown className="h-4 w-4 mr-2" />
                  Easier
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={increaseDifficulty}
                  disabled={isAdjusting || !canIncreaseDifficulty}
                  className="flex-1"
                >
                  <TrendingUp className="h-4 w-4 mr-2" />
                  Harder
                </Button>
              </div>

              {/* Adjustment Feedback Toast */}
              {lastAdjustmentResult && (
                <div className={`p-2 rounded-lg text-sm ${
                  lastAdjustmentResult.success
                    ? 'bg-green-500/10 border border-green-500/30 text-green-400'
                    : 'bg-amber-500/10 border border-amber-500/30 text-amber-400'
                }`}>
                  <p className="font-medium">{lastAdjustmentResult.action}</p>
                  {lastAdjustmentResult.success && (
                    <p className="text-xs">
                      Score: {lastAdjustmentResult.scoreBefore} → {lastAdjustmentResult.scoreAfter}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Difficulty Breakdown Panel */}
          {difficultyMetrics && (
            <div className="p-3 bg-muted/30 rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Difficulty Analysis
                </span>
                <Badge className={DIFFICULTY_COLORS[difficultyMetrics.difficultyTier]}>
                  {difficultyMetrics.difficultyScore}/100 ({difficultyMetrics.difficultyTier})
                </Badge>
              </div>

              {/* Progress bar */}
              <Progress value={difficultyMetrics.difficultyScore} className="h-2" />

              {/* Score breakdown */}
              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Visibility ({(difficultyMetrics.visibilityScore * 100).toFixed(0)}%)</span>
                  <span className="font-mono">+{((1 - difficultyMetrics.visibilityScore) * 25).toFixed(1)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Distribution ({(difficultyMetrics.distributionEvenness * 100).toFixed(0)}%)</span>
                  <span className="font-mono">+{((1 - difficultyMetrics.distributionEvenness) * 20).toFixed(1)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Buffer Ratio ({difficultyMetrics.bufferRatio.toFixed(2)})</span>
                  <span className="font-mono">+{(Math.max(0, 15 - difficultyMetrics.bufferRatio * 5)).toFixed(1)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Complexity ({(difficultyMetrics.decisionComplexity * 100).toFixed(0)}%)</span>
                  <span className="font-mono">+{(difficultyMetrics.decisionComplexity * 20).toFixed(1)}</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-muted font-medium">
                  <span>Total Score</span>
                  <span className="font-mono">{difficultyMetrics.difficultyScore}/100</span>
                </div>
              </div>

              {/* Solvability */}
              <div className={`flex items-center gap-2 p-2 rounded-lg ${
                difficultyMetrics.isSolvable ? 'bg-green-500/10' : 'bg-red-500/10'
              }`}>
                {difficultyMetrics.isSolvable ? (
                  <>
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span className="text-xs text-green-500 font-medium">
                      Guaranteed Solvable
                    </span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4 text-red-500" />
                    <span className="text-xs text-red-500 font-medium">
                      Solvability Issues
                    </span>
                  </>
                )}
              </div>

              {/* Issues List */}
              {difficultyMetrics.solvabilityIssues.length > 0 && (
                <div className="space-y-1">
                  {difficultyMetrics.solvabilityIssues.map((issue, idx) => (
                    <p key={idx} className="text-[10px] text-yellow-500 flex items-start gap-1">
                      <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                      {issue}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Grid Size Controls */}
          <div className="space-y-2 pt-4 border-t">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Grid Size</label>
              <span className="text-sm text-muted-foreground">{gridWidth} x {gridHeight}</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-foreground">Width</label>
                <Slider
                  value={[gridWidth]}
                  onValueChange={([v]) => handleGridSizeChange(v, gridHeight)}
                  min={MIN_GRID_SIZE}
                  max={MAX_GRID_SIZE}
                  step={8}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Height</label>
                <Slider
                  value={[gridHeight]}
                  onValueChange={([v]) => handleGridSizeChange(gridWidth, v)}
                  min={MIN_GRID_SIZE}
                  max={MAX_GRID_SIZE}
                  step={8}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Configuration Panel Card */}
      <Card>
        <CardContent className="pt-4 space-y-4">
          {/* Game Settings */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Game Settings
            </h3>

            {/* Waiting Stand Slots */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm">Waiting Stand Slots</label>
                <Badge variant="outline">{waitingStandSlots}</Badge>
              </div>
              <Slider
                value={[waitingStandSlots]}
                onValueChange={([v]) => setWaitingStandSlots(v)}
                min={5}
                max={9}
                step={1}
              />
              <p className="text-xs text-muted-foreground">
                Fewer slots = harder. Game over when full with no match.
              </p>
            </div>

            {/* Sink Width */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm">Sink Columns</label>
                <Badge variant="outline">{sinkWidth}</Badge>
              </div>
              <Slider
                value={[sinkWidth]}
                onValueChange={([v]) => setSinkWidth(v)}
                min={4}
                max={10}
                step={1}
              />
            </div>

            {/* Stack Height Range */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm">Stack Height</label>
                <Badge variant="outline">{minStackHeight} - {maxStackHeight}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-muted-foreground">Min</label>
                  <Slider
                    value={[minStackHeight]}
                    onValueChange={([v]) => setMinStackHeight(Math.min(v, maxStackHeight))}
                    min={1}
                    max={4}
                    step={1}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Max</label>
                  <Slider
                    value={[maxStackHeight]}
                    onValueChange={([v]) => setMaxStackHeight(Math.max(v, minStackHeight))}
                    min={2}
                    max={6}
                    step={1}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={clearAll} disabled={pixelArtArray.length === 0} className="flex-1">
              <Trash2 className="h-4 w-4 mr-2" />
              Clear All
            </Button>
            <Button size="sm" onClick={handlePlay} disabled={!isValid} className="flex-1">
              <Play className="h-4 w-4 mr-2" />
              Play Level
            </Button>
          </div>

          {/* Level Number & Add to Collection */}
          {onAddToCollection && (
            <div className="space-y-3 pt-3 border-t">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Level Position</label>
                <Badge variant="outline">#{levelNumber}</Badge>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
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
                  onClick={() => onLevelNumberChange?.(Math.min(maxLevelNumber, levelNumber + 1))}
                  disabled={levelNumber >= maxLevelNumber}
                >
                  +
                </Button>
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={handleAddToCollection}
                disabled={!isValid || !metrics}
                className="w-full"
              >
                <Plus className="h-4 w-4 mr-2" />
                {editingLevel ? 'Update Level' : 'Add to Collection'}
              </Button>
            </div>
          )}

          {/* Import/Export JSON */}
          <div className="pt-3 border-t space-y-2">
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handleImportJSON}
                className="flex-1"
              >
                <Upload className="h-4 w-4 mr-2" />
                Import JSON
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleExportJSON}
                disabled={pixelArtArray.length === 0}
                className="flex-1"
              >
                <Download className="h-4 w-4 mr-2" />
                Export JSON
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
