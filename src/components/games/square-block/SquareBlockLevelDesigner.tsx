'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  SquareBlock,
  SquareBlockLevel,
  BLOCK_COLORS,
  GameMode,
  BlockDirection,
  DesignedLevel,
  LevelMetrics,
  DifficultyTier,
  calculateFlowZone,
  getSawtoothPosition,
  getExpectedDifficulty,
  estimateLevel,
  analyzePuzzle,
  calculateDifficultyScore,
  quickSolve as analyzerQuickSolve,
} from '@/types/squareBlock';
import {
  GridCoord,
  SquareDirection,
  SquareAxis,
  SQUARE_DIRECTIONS,
  DIRECTION_ORDER,
  AXIS_ORDER,
  DIRECTION_ANGLES,
  AXIS_ANGLES,
  gridKey,
  createRectangularGrid,
  gridToPixel,
  isInBounds,
  gridAdd,
  isBidirectional,
  getAxisDirections,
  getMinBlocksAhead,
  getBlocksAheadColor,
} from '@/lib/squareGrid';
import {
  Settings, Play, Trash2, CheckCircle, AlertTriangle,
  Plus, BarChart3, Target, Activity,
  TrendingUp, TrendingDown, Clock, Percent, Lock, Unlock, Eye, EyeOff, Sparkles, Download, Upload, Snowflake, FlipHorizontal,
  ZoomIn, ZoomOut, Maximize, Move
} from 'lucide-react';
import { downloadLevelAsJSON, parseAndImportLevel } from '@/lib/squareBlockExport';
import { CollectionMetadata } from '@/lib/storage/types';
import { DeadlockInfo, StuckReason } from '@/lib/useSquareBlockGame';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown, FolderOpen } from 'lucide-react';

// ============================================================================
// Constants
// ============================================================================

// Fixed cell size for readability - grid scrolls instead of shrinking
const FIXED_CELL_SIZE = 32;

const DEFAULT_BLOCK_COLOR = BLOCK_COLORS.cyan;

const DIRECTION_LABELS: Record<BlockDirection, string> = {
  N: '↑',
  E: '→',
  S: '↓',
  W: '←',
  N_S: '↕',
  E_W: '↔',
};

const FLOW_ZONE_COLORS = {
  flow: { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/50' },
  boredom: { bg: 'bg-cyan-500/20', text: 'text-cyan-400', border: 'border-cyan-500/50' },
  frustration: { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/50' },
};

const DIFFICULTY_BADGE_COLORS = {
  easy: { bg: 'bg-green-500', text: 'text-white' },
  medium: { bg: 'bg-yellow-500', text: 'text-black' },
  hard: { bg: 'bg-orange-500', text: 'text-white' },
  superHard: { bg: 'bg-red-500', text: 'text-white' },
};

const SAWTOOTH_EXPECTED_DISPLAY = {
  1: 'easy', 2: 'easy', 3: 'medium', 4: 'medium', 5: 'hard',
  6: 'medium', 7: 'medium', 8: 'hard', 9: 'hard', 10: 'superHard',
} as const;

// Helper function to convert hex color to grayscale
function toGrayscale(hexColor: string): string {
  if (!hexColor.startsWith('#')) return hexColor;
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  return `#${gray.toString(16).padStart(2, '0').repeat(3)}`;
}

// ============================================================================
// Types
// ============================================================================

interface StagedLevel {
  id: string;
  filename: string;
  levelData: { rows: number; cols: number; blocks: SquareBlock[] };
  blockCount: number;
  solvable: boolean;
  difficultyScore: number | null;
  difficultyTier: DifficultyTier | null;
  selected: boolean;
  error?: string;
}

interface SquareBlockLevelDesignerProps {
  onPlayLevel: (level: SquareBlockLevel) => void;
  onAddToCollection?: (level: DesignedLevel, collectionId?: string) => void;
  levelNumber?: number;
  onLevelNumberChange?: (num: number) => void;
  maxLevelNumber?: number;
  editingLevel?: DesignedLevel | null;
  showMetricsPanel?: boolean;
  // Multiple collections support
  collections?: CollectionMetadata[];
  activeCollectionId?: string | null;
}

// ============================================================================
// Component
// ============================================================================

export function SquareBlockLevelDesigner({
  onPlayLevel,
  onAddToCollection,
  levelNumber = 1,
  onLevelNumberChange,
  maxLevelNumber = 100,
  editingLevel,
  showMetricsPanel = false,
  collections,
  activeCollectionId,
}: SquareBlockLevelDesignerProps) {
  // Grid configuration
  const [rows, setRows] = useState(5);
  const [cols, setCols] = useState(5);

  // Target collection for adding levels
  const [targetCollectionId, setTargetCollectionId] = useState<string | undefined>(activeCollectionId ?? undefined);

  // Update target collection when active collection changes
  useEffect(() => {
    if (activeCollectionId && !targetCollectionId) {
      setTargetCollectionId(activeCollectionId);
    }
  }, [activeCollectionId, targetCollectionId]);



  // Current tool settings
  const [selectedDirection, setSelectedDirection] = useState<BlockDirection>('E');
  const [selectedLocked, setSelectedLocked] = useState(false);
  const [selectedIceCount, setSelectedIceCount] = useState<number>(0);
  const [selectedMirror, setSelectedMirror] = useState(false);


  // Placed blocks and holes
  const [blocks, setBlocks] = useState<Map<string, SquareBlock>>(new Map());
  const [holes, setHoles] = useState<Set<string>>(new Set());

  // Multi-file import staging
  const [stagedLevels, setStagedLevels] = useState<StagedLevel[]>([]);

  // Load editing level when it changes
  useEffect(() => {
    if (editingLevel) {
      // Load level data into designer
      setRows(editingLevel.rows);
      setCols(editingLevel.cols);

      // Convert blocks array to Map
      const blockMap = new Map<string, SquareBlock>();
      for (const block of editingLevel.blocks) {
        const key = gridKey(block.coord);
        blockMap.set(key, block);
      }
      setBlocks(blockMap);

      // Load holes if any
      if (editingLevel.holes) {
        const holeSet = new Set<string>();
        for (const hole of editingLevel.holes) {
          holeSet.add(gridKey(hole));
        }
        setHoles(holeSet);
      } else {
        setHoles(new Set());
      }
    }
  }, [editingLevel]);

  // Hover state
  const [hoveredCell, setHoveredCell] = useState<string | null>(null);

  // Show blocks ahead toggle
  const [showBlocksAhead, setShowBlocksAhead] = useState(false);

  // Loading state
  const [isGenerating, setIsGenerating] = useState(false);

  // Difficulty adjustment state
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [lastAdjustmentResult, setLastAdjustmentResult] = useState<{
    success: boolean;
    scoreBefore: number;
    scoreAfter: number;
    action: string;
  } | null>(null);

  // Auto-clear adjustment feedback after 3 seconds
  useEffect(() => {
    if (lastAdjustmentResult) {
      const timer = setTimeout(() => setLastAdjustmentResult(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [lastAdjustmentResult]);

  // Zoom and pan state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const svgContainerRef = useRef<HTMLDivElement>(null);

  // Zoom controls
  const handleZoomIn = useCallback(() => {
    setZoom(z => Math.min(z * 1.25, 5));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom(z => Math.max(z / 1.25, 0.25));
  }, []);

  const handleZoomReset = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // Ctrl + Mouse wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setZoom(z => Math.max(0.5, Math.min(3, z * delta)));
    }
    // Without Ctrl, allow normal scrolling
  }, []);

  // Pan handlers
  const handlePanStart = useCallback((e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) { // Middle click or Alt+click
      e.preventDefault();
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  }, [pan]);

  const handlePanMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
    }
  }, [isPanning, panStart]);

  const handlePanEnd = useCallback(() => {
    setIsPanning(false);
  }, []);

  // Fixed cell size for readability
  const cellSize = FIXED_CELL_SIZE;

  // Generate grid coordinates
  const gridCoords = useMemo(() => createRectangularGrid(rows, cols), [rows, cols]);

  // Calculate SVG dimensions
  const { viewBox, origin, width, height } = useMemo(() => {
    const padding = Math.max(10, Math.min(20, cellSize / 2));
    const w = cols * cellSize + padding * 2;
    const h = rows * cellSize + padding * 2;
    return {
      viewBox: `0 0 ${w} ${h}`,
      origin: { x: padding, y: padding },
      width: w,
      height: h,
    };
  }, [rows, cols, cellSize]);

  // Calculate blocks ahead for all blocks (for visualization)
  const blocksAheadMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const [key, block] of blocks) {
      const blocksAhead = getMinBlocksAhead(
        block.coord,
        block.direction,
        blocks,
        holes,
        rows,
        cols
      );
      map.set(key, blocksAhead);
    }
    return map;
  }, [blocks, holes, rows, cols]);

  // Check if direction is clear
  const isDirectionClear = useCallback((
    startCoord: GridCoord,
    direction: SquareDirection,
    currentBlocks: Map<string, SquareBlock>,
    currentHoles: Set<string>
  ): boolean => {
    const dirVec = SQUARE_DIRECTIONS[direction];
    let current = gridAdd(startCoord, dirVec);

    while (isInBounds(current, rows, cols)) {
      const key = gridKey(current);
      if (currentHoles.has(key)) return true;  // Can fall into hole
      if (currentBlocks.has(key)) return false; // Blocked
      current = gridAdd(current, dirVec);
    }
    return true; // Reaches edge
  }, [rows, cols]);

  // Check if block can be cleared
  const canClearBlock = useCallback((block: SquareBlock, currentBlocks: Map<string, SquareBlock>, currentHoles: Set<string>): boolean => {
    // Check if locked block still has neighbors
    if (block.locked) {
      const directions: SquareDirection[] = ['N', 'E', 'S', 'W'];
      for (const dir of directions) {
        const neighborCoord = gridAdd(block.coord, SQUARE_DIRECTIONS[dir]);
        const neighborKey = gridKey(neighborCoord);
        if (currentBlocks.has(neighborKey)) {
          return false; // Still has neighbors, can't clear
        }
      }
    }

    // Check direction clearance
    if (isBidirectional(block.direction)) {
      const [dir1, dir2] = getAxisDirections(block.direction);
      return isDirectionClear(block.coord, dir1, currentBlocks, currentHoles) ||
             isDirectionClear(block.coord, dir2, currentBlocks, currentHoles);
    }
    return isDirectionClear(block.coord, block.direction as SquareDirection, currentBlocks, currentHoles);
  }, [isDirectionClear]);

  // Solve level using analyzer's quickSolve (handles ice, mirror, gate properly)
  const solvability = useMemo(() => {
    if (blocks.size === 0) {
      return { solvable: false, optimalMoves: 0, message: 'Add at least one block' };
    }

    const result = analyzerQuickSolve(blocks, holes, rows, cols);

    if (result.solvable) {
      return {
        solvable: true,
        optimalMoves: result.moves,
        message: `Solvable: ${result.moves} moves`,
      };
    } else {
      return {
        solvable: false,
        optimalMoves: 0,
        message: `Deadlock: some blocks stuck`,
      };
    }
  }, [blocks, holes, rows, cols]);

  // Get path info for a single direction (for deadlock analysis)
  const getDirectionPath = useCallback((
    startCoord: GridCoord,
    direction: SquareDirection,
    currentBlocks: Map<string, SquareBlock>,
    currentHoles: Set<string>
  ): { blocked: boolean; blockerCoord: GridCoord | null; holeCoord: GridCoord | null } => {
    const dirVec = SQUARE_DIRECTIONS[direction];
    let current = gridAdd(startCoord, dirVec);
    let blockerCoord: GridCoord | null = null;
    let holeCoord: GridCoord | null = null;

    while (isInBounds(current, rows, cols)) {
      const key = gridKey(current);
      if (currentHoles.has(key)) {
        holeCoord = current;
        return { blocked: false, blockerCoord: null, holeCoord };
      }
      if (currentBlocks.has(key)) {
        blockerCoord = current;
        return { blocked: true, blockerCoord, holeCoord: null };
      }
      current = gridAdd(current, dirVec);
    }
    return { blocked: false, blockerCoord: null, holeCoord: null };
  }, [rows, cols]);

  // Get the best path for a block (handles bidirectional)
  const getBlockPath = useCallback((
    block: SquareBlock,
    currentBlocks: Map<string, SquareBlock>,
    currentHoles: Set<string>
  ): { blocked: boolean; blockerCoord: GridCoord | null; holeCoord: GridCoord | null } => {
    if (isBidirectional(block.direction)) {
      const [dir1, dir2] = getAxisDirections(block.direction);
      const path1 = getDirectionPath(block.coord, dir1, currentBlocks, currentHoles);
      const path2 = getDirectionPath(block.coord, dir2, currentBlocks, currentHoles);

      // If either direction is clear, block is not stuck
      if (!path1.blocked || path1.holeCoord) {
        return path1;
      }
      if (!path2.blocked || path2.holeCoord) {
        return path2;
      }
      // Both blocked - return the first one's blocker info
      return path1;
    }
    return getDirectionPath(block.coord, block.direction as SquareDirection, currentBlocks, currentHoles);
  }, [getDirectionPath]);

  // Compute deadlock info for enhanced visualization
  const deadlockInfo = useMemo((): DeadlockInfo => {
    const emptyResult: DeadlockInfo = {
      stuckBlocks: new Map(),
      blockerBlocks: new Set(),
      hasDeadlock: false,
    };

    if (solvability.solvable) return emptyResult;

    const stuckBlocks = new Map<string, StuckReason>();
    const blockerBlocks = new Set<string>();

    for (const [key, block] of blocks) {
      // Skip if currently clearable
      if (canClearBlock(block, blocks, holes)) continue;

      // Iced blocks with ice remaining are "waiting" (not stuck yet)
      if (block.iceCount && block.iceCount > 0) continue;

      // Gate blocks with neighbors are "waiting" for neighbors to clear
      if (block.locked) {
        const hasNeighbor = ['N', 'E', 'S', 'W'].some(dir => {
          const neighborCoord = gridAdd(block.coord, SQUARE_DIRECTIONS[dir as SquareDirection]);
          return blocks.has(gridKey(neighborCoord));
        });
        if (hasNeighbor) continue;
      }

      // Block is stuck - determine why
      const pathInfo = getBlockPath(block, blocks, holes);

      if (pathInfo.blocked && pathInfo.blockerCoord) {
        const blockerKey = gridKey(pathInfo.blockerCoord);
        stuckBlocks.set(key, {
          type: 'blocked_by',
          blockedBy: blockerKey,
          message: `Blocked by block at ${blockerKey}`,
        });
        blockerBlocks.add(blockerKey);
      } else {
        stuckBlocks.set(key, {
          type: 'both_directions_blocked',
          message: 'Both exit directions blocked',
        });
      }
    }

    // Detect mutual blocks
    for (const [key, reason] of stuckBlocks) {
      if (reason.blockedBy && stuckBlocks.has(reason.blockedBy)) {
        const otherReason = stuckBlocks.get(reason.blockedBy);
        if (otherReason?.blockedBy === key) {
          reason.type = 'mutual_block';
          reason.message = `Mutual deadlock with ${reason.blockedBy}`;
        }
      }
    }

    return {
      stuckBlocks,
      blockerBlocks,
      hasDeadlock: stuckBlocks.size > 0,
    };
  }, [blocks, holes, solvability.solvable, canClearBlock, getBlockPath]);

  // For backward compatibility
  const stuckBlocks = useMemo(() => new Set(deadlockInfo.stuckBlocks.keys()), [deadlockInfo]);

  // Block type counts for display
  const blockTypeCounts = useMemo(() => {
    const blocksArray = Array.from(blocks.values());
    return {
      total: blocksArray.length,
      normal: blocksArray.filter(b => !b.locked && !(b.iceCount && b.iceCount > 0) && !b.mirror).length,
      gate: blocksArray.filter(b => b.locked).length,
      ice: blocksArray.filter(b => b.iceCount && b.iceCount > 0).length,
      mirror: blocksArray.filter(b => b.mirror).length,
    };
  }, [blocks]);

  // Deep puzzle analysis for difficulty scoring
  const puzzleAnalysis = useMemo(() => {
    if (blocks.size === 0) return null;
    return analyzePuzzle(blocks, holes, rows, cols);
  }, [blocks, holes, rows, cols]);

  // Calculate difficulty from analysis
  const difficultyBreakdown = useMemo(() => {
    if (!puzzleAnalysis || !puzzleAnalysis.solvable) return null;
    return calculateDifficultyScore(puzzleAnalysis);
  }, [puzzleAnalysis]);

  // Helper function to shuffle an array in place
  function shuffleArray<T>(array: T[]): void {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }

  // Get direction preference based on difficulty target
  const getDirectionPreference = useCallback((
    coord: GridCoord,
    difficulty: 'any' | DifficultyTier
  ): BlockDirection[] => {
    const allDirs: BlockDirection[] = [...DIRECTION_ORDER];

    if (difficulty === 'any' || difficulty === 'medium') {
      // Random shuffle
      for (let i = allDirs.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allDirs[i], allDirs[j]] = [allDirs[j], allDirs[i]];
      }
      return allDirs;
    }

    // Calculate distance to each edge
    const distToNorth = coord.row;
    const distToSouth = rows - 1 - coord.row;
    const distToWest = coord.col;
    const distToEast = cols - 1 - coord.col;

    const scoreDirection = (dir: BlockDirection): number => {
      if (isBidirectional(dir)) {
        // For bidirectional, use shorter path
        if (dir === 'N_S') return Math.min(distToNorth, distToSouth);
        if (dir === 'E_W') return Math.min(distToWest, distToEast);
        return 0;
      }

      // Score = distance to edge in that direction
      // Lower distance = closer to edge = easier to clear
      const dirVec = SQUARE_DIRECTIONS[dir as SquareDirection];
      if (dirVec.row < 0) return distToNorth; // N
      if (dirVec.row > 0) return distToSouth; // S
      if (dirVec.col < 0) return distToWest;  // W
      if (dirVec.col > 0) return distToEast;  // E
      return 0;
    };

    // Sort based on difficulty
    if (difficulty === 'easy') {
      // Prefer directions pointing toward CLOSEST edge (short clear path)
      allDirs.sort((a, b) => scoreDirection(a) - scoreDirection(b));
    } else {
      // hard/superHard: Prefer directions pointing toward FARTHEST edge (long blocked path)
      allDirs.sort((a, b) => scoreDirection(b) - scoreDirection(a));
    }

    return allDirs;
  }, [rows, cols]);

  // Smart Fill: Fill entire grid, GUARANTEED solvable
  const smartFillLevel = useCallback(async () => {
    setIsGenerating(true);

    // Allow UI to update
    await new Promise(resolve => setTimeout(resolve, 10));

    try {
      const colors = Object.values(BLOCK_COLORS);
      const availableCoords = gridCoords.filter((coord) => !holes.has(gridKey(coord)));

      if (availableCoords.length === 0) return;

      const newBlocks = new Map<string, SquareBlock>();
      const allDirections: BlockDirection[] = [...DIRECTION_ORDER];

      // STEP 1: Fill ALL cells pointing toward nearest edge (NO locks yet)
      for (const coord of availableCoords) {
        const key = gridKey(coord);
        const easyDirs = getDirectionPreference(coord, 'easy');

        newBlocks.set(key, {
          id: `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          coord,
          direction: easyDirs[0],
          color: colors[Math.floor(Math.random() * colors.length)],
        });
      }

      // STEP 2: Randomly flip some directions (while keeping solvable)
      const blockList = Array.from(newBlocks.entries());
      const blockCount = blockList.length;

      // Shuffle for random selection
      for (let i = blockList.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [blockList[i], blockList[j]] = [blockList[j], blockList[i]];
      }

      // Scale targets based on grid size to limit solvability checks
      // Small grids: more flips/locks for variety
      // Large grids: fewer flips but still decent locks for difficulty
      const flipPercent = blockCount > 200 ? 0.25 : blockCount > 100 ? 0.35 : 0.5;
      const lockPercent = blockCount > 200 ? 0.15 : blockCount > 100 ? 0.18 : 0.20;

      const flipTarget = Math.floor(blockCount * flipPercent);
      let flipped = 0;

      for (const [key, block] of blockList) {
        if (flipped >= flipTarget) break;

        const otherDirs = allDirections.filter(d => d !== block.direction);
        if (otherDirs.length === 0) continue;

        const randomDir = otherDirs[Math.floor(Math.random() * otherDirs.length)];
        const originalDir = block.direction;

        newBlocks.set(key, { ...block, direction: randomDir });

        if (analyzerQuickSolve(newBlocks, holes, rows, cols).solvable) {
          flipped++;
        } else {
          newBlocks.set(key, { ...block, direction: originalDir });
        }
      }

      // STEP 3: Add locks randomly (only if it keeps solvable)
      const lockTarget = Math.floor(blockCount * lockPercent);
      let locked = 0;

      // Re-shuffle for lock selection
      for (let i = blockList.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [blockList[i], blockList[j]] = [blockList[j], blockList[i]];
      }

      for (const [key] of blockList) {
        if (locked >= lockTarget) break;

        const block = newBlocks.get(key)!;
        if (block.locked) continue;

        // Try adding lock
        newBlocks.set(key, { ...block, locked: true });

        if (analyzerQuickSolve(newBlocks, holes, rows, cols).solvable) {
          locked++;
        } else {
          // Revert if not solvable
          newBlocks.set(key, { ...block, locked: undefined });
        }
      }

      setBlocks(newBlocks);
    } finally {
      setIsGenerating(false);
    }
  }, [gridCoords, holes, getDirectionPreference, rows, cols]);

  // Increase difficulty - try modifications that make the puzzle harder
  const increaseDifficulty = useCallback(async () => {
    if (!difficultyBreakdown || blocks.size === 0) return;

    setIsAdjusting(true);
    const scoreBefore = difficultyBreakdown.score;

    await new Promise(resolve => setTimeout(resolve, 10));

    try {
      const newBlocks = new Map(blocks);
      const blockList = Array.from(newBlocks.entries());
      shuffleArray(blockList);

      // Strategy 1: Flip a random block's direction toward farthest edge
      for (const [key, block] of blockList) {
        const hardDirs = getDirectionPreference(block.coord, 'hard');
        const currentDir = block.direction;

        for (const newDir of hardDirs) {
          if (newDir === currentDir) continue;

          const originalBlock = { ...block };
          newBlocks.set(key, { ...block, direction: newDir });

          if (analyzerQuickSolve(newBlocks, holes, rows, cols).solvable) {
            setBlocks(newBlocks);
            const newAnalysis = analyzePuzzle(newBlocks, holes, rows, cols);
            const newBreakdown = newAnalysis.solvable ? calculateDifficultyScore(newAnalysis) : null;
            const scoreAfter = newBreakdown?.score ?? scoreBefore;

            if (scoreAfter > scoreBefore) {
              setLastAdjustmentResult({
                success: true,
                scoreBefore,
                scoreAfter,
                action: `Rotated block toward harder edge`,
              });
              return;
            }
          }
          newBlocks.set(key, originalBlock);
        }
      }

      // Strategy 2: Add locked to a random normal block
      const normalBlocks = blockList.filter(([, b]) => !b.locked && !b.iceCount);
      shuffleArray(normalBlocks);

      for (const [key, block] of normalBlocks) {
        const originalBlock = { ...block };
        newBlocks.set(key, { ...block, locked: true });

        if (analyzerQuickSolve(newBlocks, holes, rows, cols).solvable) {
          setBlocks(newBlocks);
          const newAnalysis = analyzePuzzle(newBlocks, holes, rows, cols);
          const newBreakdown = newAnalysis.solvable ? calculateDifficultyScore(newAnalysis) : null;
          const scoreAfter = newBreakdown?.score ?? scoreBefore;

          setLastAdjustmentResult({
            success: true,
            scoreBefore,
            scoreAfter,
            action: `Added gate block`,
          });
          return;
        }
        newBlocks.set(key, originalBlock);
      }

      // Strategy 3: Add ice to a random normal block
      const nonIcedBlocks = blockList.filter(([, b]) => !b.iceCount && !b.locked);
      shuffleArray(nonIcedBlocks);

      for (const [key, block] of nonIcedBlocks) {
        const iceCount = Math.floor(Math.random() * 5) + 3; // 3-7
        const originalBlock = { ...block };
        newBlocks.set(key, { ...block, iceCount });

        if (analyzerQuickSolve(newBlocks, holes, rows, cols).solvable) {
          setBlocks(newBlocks);
          const newAnalysis = analyzePuzzle(newBlocks, holes, rows, cols);
          const newBreakdown = newAnalysis.solvable ? calculateDifficultyScore(newAnalysis) : null;
          const scoreAfter = newBreakdown?.score ?? scoreBefore;

          setLastAdjustmentResult({
            success: true,
            scoreBefore,
            scoreAfter,
            action: `Added ice (${iceCount}) to block`,
          });
          return;
        }
        newBlocks.set(key, originalBlock);
      }

      // Strategy 4: Add mirror to a random non-mirror block
      const nonMirrorBlocks = blockList.filter(([, b]) => !b.mirror);
      shuffleArray(nonMirrorBlocks);

      for (const [key, block] of nonMirrorBlocks) {
        const originalBlock = { ...block };
        newBlocks.set(key, { ...block, mirror: true });

        if (analyzerQuickSolve(newBlocks, holes, rows, cols).solvable) {
          setBlocks(newBlocks);
          const newAnalysis = analyzePuzzle(newBlocks, holes, rows, cols);
          const newBreakdown = newAnalysis.solvable ? calculateDifficultyScore(newAnalysis) : null;
          const scoreAfter = newBreakdown?.score ?? scoreBefore;

          setLastAdjustmentResult({
            success: true,
            scoreBefore,
            scoreAfter,
            action: `Added mirror to block`,
          });
          return;
        }
        newBlocks.set(key, originalBlock);
      }

      // No changes could be made
      setLastAdjustmentResult({
        success: false,
        scoreBefore,
        scoreAfter: scoreBefore,
        action: `Cannot increase difficulty further`,
      });
    } finally {
      setIsAdjusting(false);
    }
  }, [blocks, holes, rows, cols, difficultyBreakdown, getDirectionPreference]);

  // Decrease difficulty - try modifications that make the puzzle easier
  const decreaseDifficulty = useCallback(async () => {
    if (!difficultyBreakdown || blocks.size === 0) return;

    setIsAdjusting(true);
    const scoreBefore = difficultyBreakdown.score;

    await new Promise(resolve => setTimeout(resolve, 10));

    try {
      const newBlocks = new Map(blocks);
      const blockList = Array.from(newBlocks.entries());
      shuffleArray(blockList);

      // Strategy 1: Remove mirror from a random mirror block
      const mirrorBlocks = blockList.filter(([, b]) => b.mirror);
      shuffleArray(mirrorBlocks);

      for (const [key, block] of mirrorBlocks) {
        const { mirror: _, ...blockWithoutMirror } = block;
        newBlocks.set(key, blockWithoutMirror);

        const newAnalysis = analyzePuzzle(newBlocks, holes, rows, cols);
        const newBreakdown = newAnalysis.solvable ? calculateDifficultyScore(newAnalysis) : null;
        const scoreAfter = newBreakdown?.score ?? scoreBefore;

        setBlocks(newBlocks);
        setLastAdjustmentResult({
          success: true,
          scoreBefore,
          scoreAfter,
          action: `Removed mirror from block`,
        });
        return;
      }

      // Strategy 2: Remove ice from a random iced block
      const icedBlocks = blockList.filter(([, b]) => b.iceCount && b.iceCount > 0);
      shuffleArray(icedBlocks);

      for (const [key, block] of icedBlocks) {
        const { iceCount: _, ...blockWithoutIce } = block;
        newBlocks.set(key, blockWithoutIce);

        const newAnalysis = analyzePuzzle(newBlocks, holes, rows, cols);
        const newBreakdown = newAnalysis.solvable ? calculateDifficultyScore(newAnalysis) : null;
        const scoreAfter = newBreakdown?.score ?? scoreBefore;

        setBlocks(newBlocks);
        setLastAdjustmentResult({
          success: true,
          scoreBefore,
          scoreAfter,
          action: `Removed ice from block`,
        });
        return;
      }

      // Strategy 3: Remove locked from a random locked block
      const lockedBlocks = blockList.filter(([, b]) => b.locked);
      shuffleArray(lockedBlocks);

      for (const [key, block] of lockedBlocks) {
        const { locked: _, ...blockWithoutLocked } = block;
        newBlocks.set(key, blockWithoutLocked);

        const newAnalysis = analyzePuzzle(newBlocks, holes, rows, cols);
        const newBreakdown = newAnalysis.solvable ? calculateDifficultyScore(newAnalysis) : null;
        const scoreAfter = newBreakdown?.score ?? scoreBefore;

        setBlocks(newBlocks);
        setLastAdjustmentResult({
          success: true,
          scoreBefore,
          scoreAfter,
          action: `Removed gate from block`,
        });
        return;
      }

      // Strategy 4: Find blocked blocks and rotate them to a clearable direction
      // This directly improves clearability
      const allDirections: SquareDirection[] = ['N', 'E', 'S', 'W'];

      for (const [key, block] of blockList) {
        // Skip locked/iced blocks as they have special clearability rules
        if (block.locked || block.iceCount) continue;

        // Check if this block is currently NOT clearable
        const currentlyClearable = canClearBlock(block, newBlocks, holes);
        if (currentlyClearable) continue; // Already clearable, skip

        // Try each direction to find one that makes it clearable
        for (const dir of allDirections) {
          if (dir === block.direction) continue;

          const modifiedBlock = { ...block, direction: dir as BlockDirection };
          newBlocks.set(key, modifiedBlock);

          // Check if now clearable AND puzzle still solvable
          const nowClearable = canClearBlock(modifiedBlock, newBlocks, holes);
          if (nowClearable && analyzerQuickSolve(newBlocks, holes, rows, cols).solvable) {
            const newAnalysis = analyzePuzzle(newBlocks, holes, rows, cols);
            const newBreakdown = newAnalysis.solvable ? calculateDifficultyScore(newAnalysis) : null;
            const scoreAfter = newBreakdown?.score ?? scoreBefore;

            setBlocks(newBlocks);
            setLastAdjustmentResult({
              success: true,
              scoreBefore,
              scoreAfter,
              action: `Made blocked block clearable`,
            });
            return;
          }

          // Revert
          newBlocks.set(key, block);
        }
      }

      // Strategy 5: Flip any block toward nearest edge (fallback)
      for (const [key, block] of blockList) {
        if (block.locked || block.iceCount) continue;

        const easyDirs = getDirectionPreference(block.coord, 'easy');
        const currentDir = block.direction;

        for (const newDir of easyDirs) {
          if (newDir === currentDir) continue;

          newBlocks.set(key, { ...block, direction: newDir });

          if (analyzerQuickSolve(newBlocks, holes, rows, cols).solvable) {
            const newAnalysis = analyzePuzzle(newBlocks, holes, rows, cols);
            const newBreakdown = newAnalysis.solvable ? calculateDifficultyScore(newAnalysis) : null;
            const scoreAfter = newBreakdown?.score ?? scoreBefore;

            if (scoreAfter < scoreBefore) {
              setBlocks(newBlocks);
              setLastAdjustmentResult({
                success: true,
                scoreBefore,
                scoreAfter,
                action: `Rotated block toward easier edge`,
              });
              return;
            }
          }

          // Revert if didn't help
          newBlocks.set(key, block);
        }
      }

      // No changes could be made
      setLastAdjustmentResult({
        success: false,
        scoreBefore,
        scoreAfter: scoreBefore,
        action: `Cannot decrease difficulty further`,
      });
    } finally {
      setIsAdjusting(false);
    }
  }, [blocks, holes, rows, cols, difficultyBreakdown, getDirectionPreference, canClearBlock]);

  // Computed values for difficulty adjustment button states
  const canIncreaseDifficulty = useMemo(() => {
    if (!difficultyBreakdown || difficultyBreakdown.score >= 100) return false;
    return Array.from(blocks.values()).some(b => !b.locked || !b.iceCount || !b.mirror);
  }, [blocks, difficultyBreakdown]);

  const canDecreaseDifficulty = useMemo(() => {
    if (!difficultyBreakdown || difficultyBreakdown.score <= 0) return false;
    return Array.from(blocks.values()).some(b => b.locked || b.iceCount || b.mirror);
  }, [blocks, difficultyBreakdown]);

  // Handle cell click - always in block placement mode
  const handleCellClick = (coord: GridCoord) => {
    const key = gridKey(coord);

    if (blocks.has(key)) {
      // Remove existing block
      const newBlocks = new Map(blocks);
      newBlocks.delete(key);
      setBlocks(newBlocks);
    } else if (!holes.has(key)) {
      // Place new block
      const newBlock: SquareBlock = {
        id: `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        coord,
        direction: selectedDirection,
        color: DEFAULT_BLOCK_COLOR,
        locked: selectedLocked || undefined,
        iceCount: selectedIceCount > 0 ? selectedIceCount : undefined,
        mirror: selectedMirror || undefined,
      };
      const newBlocks = new Map(blocks);
      newBlocks.set(key, newBlock);
      setBlocks(newBlocks);
    }
  };

  // Clear all
  const clearAll = () => {
    setBlocks(new Map());
    setHoles(new Set());
  };

  // Play level
  const handlePlay = () => {
    const holeCoords: GridCoord[] = [];
    holes.forEach(key => {
      const [row, col] = key.split(',').map(Number);
      holeCoords.push({ row, col });
    });

    const level: SquareBlockLevel = {
      id: `custom-${Date.now()}`,
      name: 'Custom Level',
      rows,
      cols,
      difficulty: 'medium',
      gameMode: 'classic',
      blocks: Array.from(blocks.values()),
      holes: holeCoords.length > 0 ? holeCoords : undefined,
    };
    onPlayLevel(level);
  };

  // Export level as JSON
  const handleExportJSON = () => {
    if (blocks.size === 0) return;

    const levelData = {
      rows,
      cols,
      blocks: Array.from(blocks.values()),
    };

    const filename = `grid_Level${levelNumber}.json`;
    downloadLevelAsJSON(levelData, filename);
  };

  // Import level from JSON (single file - loads into designer)
  const handleImportJSON = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const content = event.target?.result as string;
          const imported = parseAndImportLevel(content);
          if (imported) {
            // Update grid size
            setRows(imported.rows);
            setCols(imported.cols);

            // Convert blocks array to Map
            const newBlocks = new Map<string, SquareBlock>();
            for (const block of imported.blocks) {
              const key = gridKey(block.coord);
              newBlocks.set(key, block);
            }
            setBlocks(newBlocks);
            setHoles(new Set()); // Clear holes (not supported in reference format)
          } else {
            alert('Failed to import level. Invalid format.');
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  // Import multiple files (adds to staging area)
  const handleImportMultipleFiles = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.multiple = true;
    input.onchange = async (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files) return;

      const newStaged: StagedLevel[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          const content = await file.text();
          const imported = parseAndImportLevel(content);
          if (imported) {
            const blockMap = new Map<string, SquareBlock>();
            for (const block of imported.blocks) {
              blockMap.set(gridKey(block.coord), block);
            }
            const result = analyzerQuickSolve(blockMap, new Set(), imported.rows, imported.cols);
            let difficultyScore: number | null = null;
            let difficultyTier: DifficultyTier | null = null;
            if (result.solvable) {
              const analysis = analyzePuzzle(blockMap, new Set(), imported.rows, imported.cols);
              if (analysis.solvable) {
                const breakdown = calculateDifficultyScore(analysis);
                difficultyScore = breakdown.score;
                difficultyTier = breakdown.tier;
              }
            }
            newStaged.push({
              id: `staged-${Date.now()}-${i}`,
              filename: file.name,
              levelData: imported,
              blockCount: imported.blocks.length,
              solvable: result.solvable,
              difficultyScore,
              difficultyTier,
              selected: result.solvable,
            });
          } else {
            newStaged.push({
              id: `staged-${Date.now()}-${i}`,
              filename: file.name,
              levelData: { rows: 0, cols: 0, blocks: [] },
              blockCount: 0, solvable: false, difficultyScore: null, difficultyTier: null,
              selected: false, error: 'Invalid format',
            });
          }
        } catch {
          newStaged.push({
            id: `staged-${Date.now()}-${i}`,
            filename: file.name,
            levelData: { rows: 0, cols: 0, blocks: [] },
            blockCount: 0, solvable: false, difficultyScore: null, difficultyTier: null,
            selected: false, error: 'Parse error',
          });
        }
      }
      setStagedLevels(prev => [...prev, ...newStaged]);
    };
    input.click();
  };

  // Add staged levels to collection
  const handleAddStagedToCollection = () => {
    if (!onAddToCollection) return;
    const selected = stagedLevels.filter(s => s.selected && !s.error && s.solvable);
    let currentLevelNum = levelNumber;
    for (const staged of selected) {
      const blockMap = new Map<string, SquareBlock>();
      for (const block of staged.levelData.blocks) {
        blockMap.set(gridKey(block.coord), block);
      }
      const analysis = analyzePuzzle(blockMap, new Set(), staged.levelData.rows, staged.levelData.cols);
      const breakdown = analysis.solvable ? calculateDifficultyScore(analysis) : null;
      const sawtoothPosition = getSawtoothPosition(currentLevelNum);
      const flowZone = breakdown ? calculateFlowZone(breakdown.tier, currentLevelNum) : 'flow';
      const lockedCount = staged.levelData.blocks.filter(b => b.locked).length;
      const icedCount = staged.levelData.blocks.filter(b => b.iceCount && b.iceCount > 0).length;
      const mirrorCount = staged.levelData.blocks.filter(b => b.mirror).length;

      const metrics: LevelMetrics = {
        cellCount: staged.levelData.blocks.length,
        holeCount: 0,
        lockedCount,
        icedCount,
        mirrorCount,
        gridSize: staged.levelData.rows * staged.levelData.cols,
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

      const designedLevel: DesignedLevel = {
        id: `level-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: `Level ${currentLevelNum}`,
        levelNumber: currentLevelNum,
        rows: staged.levelData.rows,
        cols: staged.levelData.cols,
        blocks: staged.levelData.blocks,
        gameMode: 'classic',
        metrics,
        createdAt: Date.now(),
      };

      onAddToCollection(designedLevel, targetCollectionId);
      currentLevelNum++;
    }
    setStagedLevels([]); // Clear staging after adding
    if (onLevelNumberChange) {
      onLevelNumberChange(currentLevelNum);
    }
  };

  // Add to collection
  const handleAddToCollection = () => {
    if (!onAddToCollection || !solvability.solvable || !puzzleAnalysis || !difficultyBreakdown) return;

    const holeCoords: GridCoord[] = [];
    holes.forEach(key => {
      const [row, col] = key.split(',').map(Number);
      holeCoords.push({ row, col });
    });

    const sawtoothPosition = getSawtoothPosition(levelNumber);
    const flowZone = calculateFlowZone(difficultyBreakdown.tier, levelNumber);
    const lockedCount = Array.from(blocks.values()).filter(b => b.locked).length;
    const icedCount = Array.from(blocks.values()).filter(b => b.iceCount && b.iceCount > 0).length;
    const mirrorCount = Array.from(blocks.values()).filter(b => b.mirror).length;

    const metrics: LevelMetrics = {
      cellCount: blocks.size,
      holeCount: holes.size,
      lockedCount,
      icedCount,
      mirrorCount,
      gridSize: rows * cols,
      density: puzzleAnalysis.density,
      initialClearability: puzzleAnalysis.initialClearability,
      solutionCount: puzzleAnalysis.solutionCount,
      avgBranchingFactor: puzzleAnalysis.avgBranchingFactor,
      forcedMoveRatio: puzzleAnalysis.forcedMoveRatio,
      solutionDepth: puzzleAnalysis.solutionDepth,
      difficultyScore: difficultyBreakdown.score,
      difficulty: difficultyBreakdown.tier,
      flowZone,
      sawtoothPosition,
    };

    const designedLevel: DesignedLevel = {
      id: editingLevel?.id || `level-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: `Level ${levelNumber}`,
      levelNumber,
      rows,
      cols,
      blocks: Array.from(blocks.values()),
      holes: holeCoords.length > 0 ? holeCoords : undefined,
      gameMode: 'classic',
      metrics,
      createdAt: editingLevel?.createdAt || Date.now(),
    };

    onAddToCollection(designedLevel, targetCollectionId);
    // Clear the designer after adding
    setBlocks(new Map());
    setHoles(new Set());
  };

  // Handle grid size change
  const handleSizeChange = (newRows: number, newCols: number) => {
    setRows(newRows);
    setCols(newCols);

    // Remove blocks outside new bounds
    const newBlocks = new Map<string, SquareBlock>();
    blocks.forEach((block, key) => {
      if (isInBounds(block.coord, newRows, newCols)) {
        newBlocks.set(key, block);
      }
    });
    setBlocks(newBlocks);

    // Remove holes outside new bounds
    const newHoles = new Set<string>();
    holes.forEach(key => {
      const [row, col] = key.split(',').map(Number);
      if (isInBounds({ row, col }, newRows, newCols)) {
        newHoles.add(key);
      }
    });
    setHoles(newHoles);
  };

  return (
    <div className="space-y-4">
      {/* Import Staging Area - TOP of Design section */}
      {stagedLevels.length > 0 && (
        <Card className="border-blue-500/30">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Upload className="h-4 w-4" />
                Imported Files ({stagedLevels.length})
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setStagedLevels([])}>
                Clear All
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="max-h-[250px] overflow-y-auto space-y-2">
              {stagedLevels.map(staged => (
                <div key={staged.id} className={`flex items-center gap-3 p-2 rounded-lg border ${
                  staged.error ? 'bg-red-500/10 border-red-500/30' :
                  staged.solvable ? 'bg-green-500/10 border-green-500/30' :
                  'bg-amber-500/10 border-amber-500/30'
                }`}>
                  <input
                    type="checkbox"
                    checked={staged.selected}
                    disabled={!!staged.error || !staged.solvable}
                    onChange={(e) => setStagedLevels(prev =>
                      prev.map(s => s.id === staged.id ? { ...s, selected: e.target.checked } : s)
                    )}
                    className="h-4 w-4"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{staged.filename}</p>
                    <p className="text-xs text-muted-foreground">
                      {staged.levelData.rows}×{staged.levelData.cols} · {staged.blockCount} blocks
                    </p>
                  </div>
                  {staged.error ? (
                    <Badge variant="destructive">{staged.error}</Badge>
                  ) : !staged.solvable ? (
                    <Badge variant="outline" className="text-amber-500">Deadlock</Badge>
                  ) : (
                    <Badge className={
                      staged.difficultyTier === 'easy' ? 'bg-green-500' :
                      staged.difficultyTier === 'medium' ? 'bg-yellow-500 text-black' :
                      staged.difficultyTier === 'hard' ? 'bg-orange-500' : 'bg-red-500'
                    }>
                      {staged.difficultyScore}
                    </Badge>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => {
                      // Load into designer for preview/editing
                      setRows(staged.levelData.rows);
                      setCols(staged.levelData.cols);
                      const blockMap = new Map<string, SquareBlock>();
                      for (const block of staged.levelData.blocks) {
                        blockMap.set(gridKey(block.coord), block);
                      }
                      setBlocks(blockMap);
                      setHoles(new Set());
                    }}
                    title="Load into designer"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-destructive"
                    onClick={() => setStagedLevels(prev => prev.filter(s => s.id !== staged.id))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={handleImportMultipleFiles}>
                <Plus className="h-4 w-4 mr-1" /> Add More Files
              </Button>
              <div className="flex-1" />
              <span className="text-xs text-muted-foreground">
                {stagedLevels.filter(s => s.selected).length} selected
              </span>
              <Button
                size="sm"
                disabled={stagedLevels.filter(s => s.selected).length === 0 || !onAddToCollection}
                onClick={handleAddStagedToCollection}
              >
                Add to Collection
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Solvability Check */}
      <div
        className={`flex items-center gap-2 p-3 rounded-lg ${
          solvability.solvable ? 'bg-green-500/10 border border-green-500/30' : 'bg-amber-500/10 border border-amber-500/30'
        }`}
      >
        {solvability.solvable ? (
          <CheckCircle className="h-5 w-5 text-green-500" />
        ) : (
          <AlertTriangle className="h-5 w-5 text-amber-500" />
        )}
        <div className="flex-1">
          <p className={`text-sm font-medium ${solvability.solvable ? 'text-green-500' : 'text-amber-500'}`}>
            {solvability.solvable ? 'Level is solvable!' : 'Not solvable'}
          </p>
          <p className="text-xs text-muted-foreground">
            {!solvability.solvable && deadlockInfo.hasDeadlock
              ? (() => {
                  const mutualCount = Array.from(deadlockInfo.stuckBlocks.values()).filter(r => r.type === 'mutual_block').length / 2;
                  const blockedCount = deadlockInfo.stuckBlocks.size - (mutualCount * 2);
                  const blockerOnlyCount = Array.from(deadlockInfo.blockerBlocks).filter(k => !deadlockInfo.stuckBlocks.has(k)).length;
                  const parts: string[] = [];
                  if (mutualCount > 0) parts.push(`${Math.floor(mutualCount)} mutual`);
                  if (blockedCount > 0) parts.push(`${blockedCount} blocked`);
                  if (blockerOnlyCount > 0) parts.push(`${blockerOnlyCount} blocker${blockerOnlyCount > 1 ? 's' : ''}`);
                  return `Deadlock: ${parts.join(', ')}`;
                })()
              : solvability.message}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <Badge variant="outline">{blocks.size} blocks</Badge>
          {holes.size > 0 && <Badge variant="outline">{holes.size} holes</Badge>}
        </div>
      </div>

      {/* Block Type Counts */}
      {blocks.size > 0 && (
        <div className="flex items-center gap-4 p-3 bg-muted/30 rounded-lg text-sm">
          <span className="text-muted-foreground font-medium">Block Types:</span>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-cyan-500" />
            <span>{blockTypeCounts.normal}</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-amber-500" />
            <span className="text-amber-400">{blockTypeCounts.gate} gate</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-blue-400" />
            <span className="text-blue-400">{blockTypeCounts.ice} ice</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-purple-500" />
            <span className="text-purple-400">{blockTypeCounts.mirror} mirror</span>
          </div>
        </div>
      )}

      {/* Design Canvas */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Level Designer
          </CardTitle>
          <CardDescription>
            Click cells to place/remove blocks
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Direction & Color Selectors */}
          <div className="space-y-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">Direction</label>
                <div className="flex flex-wrap gap-1">
                  {DIRECTION_ORDER.map((dir) => (
                    <Button
                      key={dir}
                      variant={selectedDirection === dir ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSelectedDirection(dir)}
                      className="w-10 h-10 text-lg"
                    >
                      {DIRECTION_LABELS[dir]}
                    </Button>
                  ))}
                </div>
              </div>
              {/* Gate Toggle */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Gate Block</label>
                <Button
                  variant={selectedLocked ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setSelectedLocked(!selectedLocked);
                    // Mutual exclusion: clear ice count when enabling gate
                    if (!selectedLocked) setSelectedIceCount(0);
                  }}
                  disabled={selectedIceCount > 0}
                  className="w-full"
                >
                  {selectedLocked ? (
                    <>
                      <Lock className="h-4 w-4 mr-2" />
                      Gate (needs neighbors cleared)
                    </>
                  ) : (
                    <>
                      <Unlock className="h-4 w-4 mr-2" />
                      Normal Block
                    </>
                  )}
                </Button>
              </div>

              {/* Ice Count */}
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Snowflake className="h-4 w-4 text-cyan-400" />
                  Ice Count
                </label>
                <div className="flex items-center gap-2">
                  <Slider
                    value={[selectedIceCount]}
                    onValueChange={([v]) => {
                      setSelectedIceCount(v);
                      // Mutual exclusion: clear locked when setting ice count
                      if (v > 0) setSelectedLocked(false);
                    }}
                    min={0}
                    max={100}
                    step={1}
                    disabled={selectedLocked}
                  />
                  <Badge variant="outline" className="min-w-[50px] justify-center">
                    {selectedIceCount || 'None'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Block unfreezes after this many clears
                </p>
              </div>

              {/* Mirror Toggle */}
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <FlipHorizontal className="h-4 w-4 text-purple-400" />
                  Mirror Block
                </label>
                <Button
                  variant={selectedMirror ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedMirror(!selectedMirror)}
                  className="w-full"
                >
                  {selectedMirror ? (
                    <>
                      <FlipHorizontal className="h-4 w-4 mr-2" />
                      Mirror (moves opposite)
                    </>
                  ) : (
                    <>
                      <FlipHorizontal className="h-4 w-4 mr-2 opacity-50" />
                      Normal Direction
                    </>
                  )}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Block moves opposite to arrow direction
                </p>
              </div>
            </div>

          {/* Zoom Controls */}
          <div className="flex items-center justify-center gap-2 mb-2">
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

          {/* Grid SVG - Scrollable container */}
          <div
            ref={svgContainerRef}
            className="overflow-auto border border-muted rounded-lg bg-muted/20"
            style={{ maxHeight: '500px', cursor: isPanning ? 'grabbing' : 'default' }}
            onWheel={handleWheel}
            onMouseDown={handlePanStart}
            onMouseMove={handlePanMove}
            onMouseUp={handlePanEnd}
            onMouseLeave={handlePanEnd}
          >
            <svg
              viewBox={viewBox}
              style={{
                width: width * zoom,
                height: height * zoom,
                minWidth: width * zoom,
                minHeight: height * zoom,
              }}
            >
              {/* Background */}
              <rect
                x={origin.x}
                y={origin.y}
                width={cols * cellSize}
                height={rows * cellSize}
                fill="rgba(0, 0, 0, 0.3)"
                rx={4}
              />

              {/* Grid cells */}
              {gridCoords.map((coord) => {
                const key = gridKey(coord);
                const pixel = gridToPixel(coord, cellSize, origin);
                const hasBlock = blocks.has(key);
                const hasHole = holes.has(key);
                const isHovered = hoveredCell === key;

                let fillColor = 'rgba(255, 255, 255, 0.03)';
                if (hasHole) {
                  fillColor = 'rgba(0, 0, 0, 0.8)';
                } else if (hasBlock) {
                  fillColor = 'transparent';
                } else if (isHovered) {
                  fillColor = 'rgba(255, 255, 255, 0.1)';
                }

                return (
                  <g key={key}>
                    <rect
                      x={pixel.x - cellSize / 2 + 2}
                      y={pixel.y - cellSize / 2 + 2}
                      width={cellSize - 4}
                      height={cellSize - 4}
                      fill={fillColor}
                      stroke={hasHole ? 'rgba(139, 69, 19, 0.6)' : 'rgba(255, 255, 255, 0.15)'}
                      strokeWidth={hasHole ? 2 : 1}
                      rx={4}
                      onClick={() => handleCellClick(coord)}
                      onMouseEnter={() => setHoveredCell(key)}
                      onMouseLeave={() => setHoveredCell(null)}
                      style={{ cursor: 'pointer' }}
                    />

                    {/* Hole visual */}
                    {hasHole && (
                      <g pointerEvents="none">
                        <circle cx={pixel.x} cy={pixel.y} r={cellSize * 0.3} fill="rgba(0, 0, 0, 0.9)" />
                        <circle cx={pixel.x} cy={pixel.y} r={cellSize * 0.35} fill="none" stroke="rgba(60, 40, 20, 0.8)" strokeWidth={3} />
                      </g>
                    )}

                    {/* Preview block */}
                    {isHovered && !hasBlock && !hasHole && (
                      <g opacity={0.5} pointerEvents="none">
                        <rect
                          x={pixel.x - cellSize / 2 + 4}
                          y={pixel.y - cellSize / 2 + 4}
                          width={cellSize - 8}
                          height={cellSize - 8}
                          fill={DEFAULT_BLOCK_COLOR}
                          rx={4}
                        />
                        <DirectionArrow cx={pixel.x} cy={pixel.y} direction={selectedDirection} size={cellSize * 0.5} />
                        {/* Lock icon preview */}
                        {selectedLocked && (
                          <g transform={`translate(${pixel.x}, ${pixel.y})`}>
                            <rect x={-6} y={-1} width={12} height={9} fill="rgba(0,0,0,0.7)" stroke="#fbbf24" strokeWidth={1} rx={1} />
                            <path d="M -4 -1 L -4 -4 A 4 4 0 0 1 4 -4 L 4 -1" fill="none" stroke="#fbbf24" strokeWidth={1.5} />
                          </g>
                        )}
                        {/* Ice preview */}
                        {selectedIceCount > 0 && (
                          <g>
                            <rect
                              x={pixel.x - cellSize / 2 + 4}
                              y={pixel.y - cellSize / 2 + 4}
                              width={cellSize - 8}
                              height={cellSize - 8}
                              fill="rgba(135, 206, 250, 0.4)"
                              stroke="rgba(173, 216, 230, 0.8)"
                              strokeWidth={2}
                              rx={4}
                            />
                            <text
                              x={pixel.x}
                              y={pixel.y + 4}
                              textAnchor="middle"
                              dominantBaseline="middle"
                              fill="#ffffff"
                              fontSize={cellSize * 0.35}
                              fontWeight="bold"
                            >
                              {selectedIceCount}
                            </text>
                          </g>
                        )}
                        {/* Mirror preview */}
                        {selectedMirror && (
                          <g>
                            <rect
                              x={pixel.x - cellSize / 2 + 2}
                              y={pixel.y - cellSize / 2 + 2}
                              width={cellSize - 4}
                              height={cellSize - 4}
                              fill="none"
                              stroke="rgba(168, 85, 247, 0.8)"
                              strokeWidth={2}
                              strokeDasharray="4 2"
                              rx={4}
                            />
                          </g>
                        )}
                      </g>
                    )}

                  </g>
                );
              })}

              {/* Placed blocks */}
              {Array.from(blocks.values()).map((block) => {
                const key = gridKey(block.coord);
                const pixel = gridToPixel(block.coord, cellSize, origin);
                const canClear = canClearBlock(block, blocks, holes);
                const isBlockHovered = hoveredCell === key;

                // Deadlock state
                const hasDeadlock = deadlockInfo.hasDeadlock;
                const stuckReason = deadlockInfo.stuckBlocks.get(key);
                const isBlocker = deadlockInfo.blockerBlocks.has(key);
                const isStuck = !!stuckReason;
                const isMutualBlock = stuckReason?.type === 'mutual_block';

                // Apply grayscale when in deadlock state
                const blockColor = hasDeadlock ? toGrayscale(block.color) : block.color;

                return (
                  <g
                    key={key}
                    onClick={() => handleCellClick(block.coord)}
                    onMouseEnter={() => setHoveredCell(key)}
                    onMouseLeave={() => setHoveredCell(null)}
                    style={{ cursor: 'pointer' }}
                  >
                    <rect
                      x={pixel.x - cellSize / 2 + 4}
                      y={pixel.y - cellSize / 2 + 4}
                      width={cellSize - 8}
                      height={cellSize - 8}
                      fill={blockColor}
                      stroke={isBlockHovered ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.3)'}
                      strokeWidth={isBlockHovered ? 2 : 1.5}
                      rx={4}
                    />
                    <DirectionArrow
                      cx={pixel.x}
                      cy={pixel.y}
                      direction={block.direction}
                      size={cellSize * 0.5}
                      color={block.locked || block.iceCount ? 'rgba(255, 255, 255, 0.3)' : canClear ? '#ffffff' : 'rgba(255, 255, 255, 0.5)'}
                    />
                    {/* Lock icon for gate blocks */}
                    {block.locked && (
                      <g transform={`translate(${pixel.x}, ${pixel.y})`}>
                        <rect x={-6} y={-1} width={12} height={9} fill="rgba(0,0,0,0.7)" stroke="#fbbf24" strokeWidth={1} rx={1} />
                        <path d="M -4 -1 L -4 -4 A 4 4 0 0 1 4 -4 L 4 -1" fill="none" stroke="#fbbf24" strokeWidth={1.5} />
                        <circle cx={0} cy={3} r={1.5} fill="#fbbf24" />
                      </g>
                    )}
                    {/* Ice overlay for iced blocks */}
                    {block.iceCount && block.iceCount > 0 && (
                      <g pointerEvents="none">
                        <rect
                          x={pixel.x - cellSize / 2 + 4}
                          y={pixel.y - cellSize / 2 + 4}
                          width={cellSize - 8}
                          height={cellSize - 8}
                          fill="rgba(135, 206, 250, 0.4)"
                          stroke="rgba(173, 216, 230, 0.8)"
                          strokeWidth={2}
                          rx={4}
                        />
                        <text
                          x={pixel.x}
                          y={pixel.y + 4}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fill="#ffffff"
                          fontSize={cellSize * 0.35}
                          fontWeight="bold"
                          style={{ textShadow: '0 1px 3px rgba(0,0,0,0.7)' }}
                        >
                          {block.iceCount}
                        </text>
                      </g>
                    )}
                    {/* Mirror overlay for mirror blocks */}
                    {block.mirror && (
                      <g pointerEvents="none">
                        {/* Purple dashed border */}
                        <rect
                          x={pixel.x - cellSize / 2 + 2}
                          y={pixel.y - cellSize / 2 + 2}
                          width={cellSize - 4}
                          height={cellSize - 4}
                          fill="none"
                          stroke="rgba(168, 85, 247, 0.8)"
                          strokeWidth={2}
                          strokeDasharray="4 2"
                          rx={4}
                        />
                        {/* Mirror icon in BOTTOM-LEFT corner */}
                        <g transform={`translate(${pixel.x - cellSize / 2 + 10}, ${pixel.y + cellSize / 2 - 10})`}>
                          <circle cx={0} cy={0} r={7} fill="rgba(168, 85, 247, 0.95)" stroke="white" strokeWidth={1.5} />
                          {/* Flip horizontal arrows icon */}
                          <g transform="scale(0.8)">
                            <path d="M -3 0 L -1 -2 L -1 -0.8 L 1 -0.8 L 1 -2 L 3 0 L 1 2 L 1 0.8 L -1 0.8 L -1 2 Z" fill="white" />
                          </g>
                        </g>
                      </g>
                    )}
                    {/* Blocks ahead counter */}
                    {showBlocksAhead && (() => {
                      const blocksAhead = blocksAheadMap.get(key) ?? 0;
                      const counterColor = getBlocksAheadColor(blocksAhead);
                      const counterRadius = Math.max(6, cellSize * 0.2);
                      const fontSize = Math.max(8, cellSize * 0.25);
                      return (
                        <g transform={`translate(${pixel.x + cellSize / 2 - counterRadius - 2}, ${pixel.y - cellSize / 2 + counterRadius + 2})`} pointerEvents="none">
                          <circle
                            cx={0}
                            cy={0}
                            r={counterRadius}
                            fill={counterColor}
                            stroke="rgba(0, 0, 0, 0.5)"
                            strokeWidth={1}
                          />
                          <text
                            x={0}
                            y={0}
                            textAnchor="middle"
                            dominantBaseline="central"
                            fill="white"
                            fontSize={fontSize}
                            fontWeight="bold"
                            style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}
                          >
                            {blocksAhead}
                          </text>
                        </g>
                      );
                    })()}
                    {canClear && (
                      <rect
                        x={pixel.x - cellSize / 2 + 2}
                        y={pixel.y - cellSize / 2 + 2}
                        width={cellSize - 4}
                        height={cellSize - 4}
                        fill="none"
                        stroke="rgba(34, 197, 94, 0.5)"
                        strokeWidth={2}
                        strokeDasharray="4 2"
                        rx={4}
                        pointerEvents="none"
                      />
                    )}
                    {/* ENHANCED DEADLOCK indicators */}
                    {/* Mutual Block: Purple solid border with circular arrow icon */}
                    {isMutualBlock && (
                      <g pointerEvents="none">
                        <rect
                          x={pixel.x - cellSize / 2 + 1}
                          y={pixel.y - cellSize / 2 + 1}
                          width={cellSize - 2}
                          height={cellSize - 2}
                          fill="rgba(139, 92, 246, 0.15)"
                          stroke="rgba(139, 92, 246, 0.9)"
                          strokeWidth={3}
                          rx={5}
                        />
                        {/* Circular arrows icon in corner */}
                        <g transform={`translate(${pixel.x + cellSize / 2 - 8}, ${pixel.y - cellSize / 2 + 8})`}>
                          <circle cx={0} cy={0} r={6} fill="rgba(139, 92, 246, 0.95)" />
                          <text x={0} y={1} textAnchor="middle" fontSize={8} fill="white" fontWeight="bold">↻</text>
                        </g>
                      </g>
                    )}

                    {/* Blocker Block (not mutual): Orange solid border with chain icon */}
                    {isBlocker && !isMutualBlock && !isStuck && (
                      <g pointerEvents="none">
                        <rect
                          x={pixel.x - cellSize / 2 + 1}
                          y={pixel.y - cellSize / 2 + 1}
                          width={cellSize - 2}
                          height={cellSize - 2}
                          fill="rgba(245, 158, 11, 0.15)"
                          stroke="rgba(245, 158, 11, 0.9)"
                          strokeWidth={3}
                          rx={5}
                        />
                        {/* Chain link icon in corner */}
                        <g transform={`translate(${pixel.x + cellSize / 2 - 8}, ${pixel.y - cellSize / 2 + 8})`}>
                          <circle cx={0} cy={0} r={6} fill="rgba(245, 158, 11, 0.95)" />
                          <text x={0} y={1} textAnchor="middle" fontSize={8} fill="white" fontWeight="bold">⛓</text>
                        </g>
                      </g>
                    )}

                    {/* Blocked Block (not mutual): Red dashed border with warning icon */}
                    {isStuck && !isMutualBlock && (
                      <g pointerEvents="none">
                        <rect
                          x={pixel.x - cellSize / 2 + 1}
                          y={pixel.y - cellSize / 2 + 1}
                          width={cellSize - 2}
                          height={cellSize - 2}
                          fill="rgba(239, 68, 68, 0.15)"
                          stroke="rgba(239, 68, 68, 0.9)"
                          strokeWidth={3}
                          strokeDasharray={isBlocker ? "none" : "5 2"}
                          rx={5}
                        />
                        {/* Warning or chain icon in corner */}
                        <g transform={`translate(${pixel.x + cellSize / 2 - 8}, ${pixel.y - cellSize / 2 + 8})`}>
                          <circle cx={0} cy={0} r={6} fill={isBlocker ? "rgba(245, 158, 11, 0.95)" : "rgba(239, 68, 68, 0.95)"} />
                          <text x={0} y={1} textAnchor="middle" fontSize={10} fill="white" fontWeight="bold">{isBlocker ? "⛓" : "!"}</text>
                        </g>
                      </g>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Scroll hint for large grids */}
          {(rows > 10 || cols > 10) && (
            <p className="text-xs text-center text-muted-foreground mt-1">
              Scroll to navigate, Ctrl+scroll to zoom
            </p>
          )}

          {/* Difficulty Adjustment Buttons */}
          {blocks.size > 0 && solvability.solvable && (
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

          {/* Difficulty Breakdown */}
          {blocks.size > 0 && puzzleAnalysis && (
            <div className="p-3 bg-muted/30 rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Difficulty Analysis
                </span>
                {difficultyBreakdown && (
                  <Badge className={`${
                    difficultyBreakdown.tier === 'easy' ? 'bg-green-500' :
                    difficultyBreakdown.tier === 'medium' ? 'bg-yellow-500 text-black' :
                    difficultyBreakdown.tier === 'hard' ? 'bg-orange-500' :
                    'bg-red-500'
                  }`}>
                    {difficultyBreakdown.score}/100 ({difficultyBreakdown.tier})
                  </Badge>
                )}
              </div>

              {difficultyBreakdown && (
                <div className="space-y-2">
                  {/* Progress bar */}
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all ${
                        difficultyBreakdown.tier === 'easy' ? 'bg-green-500' :
                        difficultyBreakdown.tier === 'medium' ? 'bg-yellow-500' :
                        difficultyBreakdown.tier === 'hard' ? 'bg-orange-500' :
                        'bg-red-500'
                      }`}
                      style={{ width: `${difficultyBreakdown.score}%` }}
                    />
                  </div>

                  {/* Score breakdown */}
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Avg Blockers ({difficultyBreakdown.components.avgBlockers.toFixed(2)} × 4.5)</span>
                      <span className="font-mono">+{(difficultyBreakdown.components.avgBlockers * 4.5).toFixed(1)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Clearability ({(difficultyBreakdown.components.clearability * 100).toFixed(1)}%)</span>
                      <span className="font-mono">+{((1 - difficultyBreakdown.components.clearability) * 20).toFixed(1)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Block Count ({difficultyBreakdown.components.blockCount})</span>
                      <span className="font-mono">+{Math.min(difficultyBreakdown.components.blockCount / 40, 10).toFixed(1)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Gate Blocks ({difficultyBreakdown.components.lockedCount})</span>
                      <span className="font-mono">+{Math.min(difficultyBreakdown.components.lockedCount, 5)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Ice Blocks ({difficultyBreakdown.components.icedCount}{difficultyBreakdown.components.icedCount > 0 ? `, avg ${difficultyBreakdown.components.avgIceCount.toFixed(1)}` : ''})</span>
                      <span className="font-mono">+{(Math.min(difficultyBreakdown.components.icedCount, 5) + Math.min(difficultyBreakdown.components.avgIceCount * 0.5, 5)).toFixed(1)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Mirror Blocks ({difficultyBreakdown.components.mirrorCount})</span>
                      <span className="font-mono">+{Math.min(difficultyBreakdown.components.mirrorCount, 5)}</span>
                    </div>
                    {difficultyBreakdown.components.sizeBonus > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Size Bonus (400+ blocks)</span>
                        <span className="font-mono">+{difficultyBreakdown.components.sizeBonus.toFixed(1)}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center pt-2 border-t border-muted font-medium">
                      <span>Total Score</span>
                      <span className="font-mono">{difficultyBreakdown.score}/100</span>
                    </div>
                  </div>

                  {/* Formula */}
                  <div className="pt-2 border-t border-muted text-xs space-y-1.5">
                    <p className="font-medium text-foreground">Difficulty Formula:</p>
                    <div className="font-mono text-muted-foreground bg-muted/50 p-2 rounded space-y-1">
                      <p>avgBlockers × 4.5 (primary)</p>
                      <p>+ (1 - clearability) × 20</p>
                      <p>+ min(blocks/40, 10)</p>
                      <p>+ min(gate, 5)</p>
                      <p>+ min(ice, 5) + min(avgIce × 0.5, 5)</p>
                      <p>+ min(mirror, 5)</p>
                      <p>+ sizeBonus (400+ blocks: up to +20)</p>
                    </div>
                    <p className="text-muted-foreground">0-24 = Easy, 25-49 = Medium, 50-74 = Hard, 75+ = Super Hard</p>
                  </div>

                  {/* Generation algorithm explanation */}
                  <div className="pt-2 border-t border-muted text-xs space-y-2">
                    <p className="font-medium text-foreground">How "Fill Grid Randomly" works:</p>
                    <div className="space-y-1.5 text-muted-foreground">
                      <p>1. Fills every cell with a block pointing toward nearest edge</p>
                      <p>2. Randomly flips ~50% of directions while keeping solvable</p>
                      <p>3. Adds random gate blocks while keeping solvable</p>
                      <p>4. Calculates difficulty based on blockers, gate %, and clearability</p>
                    </div>
                    <p className="text-muted-foreground italic">Click multiple times to get different configurations.</p>
                  </div>
                </div>
              )}

              {!puzzleAnalysis.solvable && (
                <p className="text-xs text-amber-500">Level is not solvable - metrics unavailable</p>
              )}
            </div>
          )}

          {/* Grid Size */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Grid Size</label>
              <span className="text-sm text-muted-foreground">{rows} x {cols} ({rows * cols} cells)</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-foreground">Rows</label>
                <Slider
                  value={[rows]}
                  onValueChange={([v]) => handleSizeChange(v, cols)}
                  min={3}
                  max={50}
                  step={1}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Columns</label>
                <Slider
                  value={[cols]}
                  onValueChange={([v]) => handleSizeChange(rows, v)}
                  min={3}
                  max={50}
                  step={1}
                />
              </div>
            </div>
          </div>

        </CardContent>
      </Card>

      {/* Configuration Panel */}
      <Card>
        <CardContent className="pt-4 space-y-4">
          {/* Smart Fill */}
          <Button
            variant="secondary"
            size="sm"
            onClick={smartFillLevel}
            disabled={isGenerating}
            className="w-full"
            title="Fill entire grid with random solvable blocks"
          >
            {isGenerating ? (
              <>
                <span className="animate-spin mr-2">⏳</span>
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Fill Grid Randomly
              </>
            )}
          </Button>

          {/* View Options */}
          <div className="flex gap-2">
            <Button
              variant={showBlocksAhead ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowBlocksAhead(!showBlocksAhead)}
              className="flex-1"
            >
              {showBlocksAhead ? (
                <>
                  <Eye className="h-4 w-4 mr-2" />
                  Hide Blockers
                </>
              ) : (
                <>
                  <EyeOff className="h-4 w-4 mr-2" />
                  Show Blockers
                </>
              )}
            </Button>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={clearAll} disabled={blocks.size === 0} className="flex-1">
              <Trash2 className="h-4 w-4 mr-2" />
              Clear All
            </Button>
            <Button size="sm" onClick={handlePlay} disabled={!solvability.solvable} className="flex-1">
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
              <div className="text-xs text-muted-foreground text-center">
                Expected: <span className={`font-medium ${DIFFICULTY_BADGE_COLORS[getExpectedDifficulty(levelNumber)]?.text || 'text-foreground'}`}>
                  {getExpectedDifficulty(levelNumber)}
                </span> (Position {getSawtoothPosition(levelNumber)} in cycle)
              </div>
              {/* Collection Target Selector */}
              {collections && collections.length > 1 && (
                <div className="flex items-center gap-2">
                  <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="flex-1 justify-between h-8">
                        <span className="truncate text-xs">
                          {collections.find(c => c.id === targetCollectionId)?.name || 'Select collection'}
                        </span>
                        <ChevronDown className="h-3 w-3 ml-1 shrink-0" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-56">
                      {collections.map(c => (
                        <DropdownMenuItem
                          key={c.id}
                          onClick={() => setTargetCollectionId(c.id)}
                          className={c.id === targetCollectionId ? 'bg-accent' : ''}
                        >
                          <span className="flex-1 truncate">{c.name}</span>
                          <span className="text-xs text-muted-foreground ml-2">{c.levelCount}</span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
              <Button
                size="sm"
                variant="secondary"
                onClick={handleAddToCollection}
                disabled={!solvability.solvable || blocks.size === 0}
                className="w-full"
              >
                <Plus className="h-4 w-4 mr-2" />
                {editingLevel ? 'Update Level' : `Add to ${collections?.find(c => c.id === targetCollectionId)?.name || 'Collection'}`}
              </Button>
            </div>
          )}

          {/* Import/Export JSON */}
          <div className="pt-3 border-t space-y-2">
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handleImportMultipleFiles}
                className="flex-1"
                title="Import multiple JSON files"
              >
                <Upload className="h-4 w-4 mr-2" />
                Import Files
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleExportJSON}
                disabled={blocks.size === 0}
                className="flex-1"
              >
                <Download className="h-4 w-4 mr-2" />
                Export JSON
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Embedded Metrics Panel */}
      {showMetricsPanel && (
        <EmbeddedMetricsPanel
          blocks={blocks}
          holes={holes}
          rows={rows}
          cols={cols}
          levelNumber={levelNumber}
          solvable={solvability.solvable}
        />
      )}
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

interface EmbeddedMetricsPanelProps {
  blocks: Map<string, SquareBlock>;
  holes: Set<string>;
  rows: number;
  cols: number;
  levelNumber: number;
  solvable: boolean;
}

function EmbeddedMetricsPanel({
  blocks,
  holes,
  rows,
  cols,
  levelNumber,
  solvable,
}: EmbeddedMetricsPanelProps) {
  const cellCount = blocks.size;
  const holeCount = holes.size;
  const lockedCount = Array.from(blocks.values()).filter(b => b.locked).length;
  const icedCount = Array.from(blocks.values()).filter(b => b.iceCount && b.iceCount > 0).length;
  const mirrorCount = Array.from(blocks.values()).filter(b => b.mirror).length;

  // Use new analyzer
  const analysis = useMemo(() => {
    if (cellCount === 0) return null;
    return analyzePuzzle(blocks, holes, rows, cols);
  }, [blocks, holes, rows, cols, cellCount]);

  const breakdown = useMemo(() => {
    if (!analysis || !analysis.solvable) return null;
    return calculateDifficultyScore(analysis);
  }, [analysis]);

  const difficulty = breakdown?.tier ?? 'easy';
  const sawtoothPosition = getSawtoothPosition(levelNumber);
  const expectedDiff = getExpectedDifficulty(levelNumber);
  const flowZone = calculateFlowZone(difficulty, levelNumber);
  const estimation = cellCount > 0 ? estimateLevel(difficulty, cellCount) : null;

  const flowColors = FLOW_ZONE_COLORS[flowZone];
  const diffColors = DIFFICULTY_BADGE_COLORS[difficulty];
  const expectedColors = DIFFICULTY_BADGE_COLORS[expectedDiff];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <BarChart3 className="h-4 w-4" />
          Level {levelNumber} Metrics
        </CardTitle>
        <CardDescription>Position {sawtoothPosition} in 10-level cycle</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Basic Stats */}
        <div className="grid grid-cols-5 gap-2 text-center">
          <div className="p-2 bg-muted/50 rounded-lg">
            <p className="text-2xl font-bold">{cellCount}</p>
            <p className="text-xs text-muted-foreground">Blocks</p>
          </div>
          <div className="p-2 bg-muted/50 rounded-lg">
            <p className="text-2xl font-bold">{holeCount}</p>
            <p className="text-xs text-muted-foreground">Holes</p>
          </div>
          <div className="p-2 bg-muted/50 rounded-lg">
            <p className="text-2xl font-bold text-amber-400">{lockedCount}</p>
            <p className="text-xs text-muted-foreground">Gate</p>
          </div>
          <div className="p-2 bg-muted/50 rounded-lg">
            <p className="text-2xl font-bold text-cyan-400">{icedCount}</p>
            <p className="text-xs text-muted-foreground">Iced</p>
          </div>
          <div className="p-2 bg-muted/50 rounded-lg">
            <p className="text-2xl font-bold text-purple-400">{mirrorCount}</p>
            <p className="text-xs text-muted-foreground">Mirror</p>
          </div>
        </div>

        {/* Mistake Mechanic Info */}
        <div className="p-3 bg-muted/30 rounded-lg text-center">
          <p className="text-sm text-muted-foreground">
            Players have <span className="font-bold text-red-500">3 chances</span> (❤️❤️❤️)
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Tapping a blocked block = lose a heart
          </p>
        </div>

        {/* Difficulty Score */}
        {breakdown && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Difficulty Score</span>
              <span className={`font-bold ${
                breakdown.tier === 'easy' ? 'text-green-500' :
                breakdown.tier === 'medium' ? 'text-yellow-500' :
                breakdown.tier === 'hard' ? 'text-orange-500' :
                'text-red-500'
              }`}>{breakdown.score}/100</span>
            </div>
            <Progress value={breakdown.score} className="h-2" />

            {/* Breakdown Components */}
            <div className="text-xs space-y-1 mt-2 p-2 bg-muted/30 rounded">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Avg Blockers ({breakdown.components.avgBlockers.toFixed(1)}×4.5)</span>
                <span>+{(breakdown.components.avgBlockers * 4.5).toFixed(1)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Clearability ({(breakdown.components.clearability * 100).toFixed(0)}%)</span>
                <span>+{((1 - breakdown.components.clearability) * 20).toFixed(1)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Blocks ({breakdown.components.blockCount})</span>
                <span>+{Math.min(breakdown.components.blockCount / 40, 10).toFixed(1)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Gate ({breakdown.components.lockedCount})</span>
                <span>+{Math.min(breakdown.components.lockedCount, 5)}</span>
              </div>
              {breakdown.components.sizeBonus > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Size Bonus (400+)</span>
                  <span>+{breakdown.components.sizeBonus.toFixed(1)}</span>
                </div>
              )}
              <div className="flex justify-between pt-1 border-t border-muted font-medium">
                <span>Score</span>
                <span>{breakdown.score}/100</span>
              </div>
            </div>
          </div>
        )}

        {/* Difficulty Tier */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <Target className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Difficulty Tier</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Actual</span>
            <Badge className={`${diffColors.bg} ${diffColors.text}`}>
              {difficulty === 'superHard' ? 'Super Hard' : difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Expected</span>
            <Badge variant="outline" className={expectedColors.text}>
              {expectedDiff === 'superHard' ? 'Super Hard' : expectedDiff.charAt(0).toUpperCase() + expectedDiff.slice(1)}
            </Badge>
          </div>
        </div>

        {/* Flow Zone */}
        <div className={`p-3 rounded-lg border ${flowColors.bg} ${flowColors.border}`}>
          <div className="flex items-center gap-2">
            <Activity className={`h-4 w-4 ${flowColors.text}`} />
            <span className={`font-medium ${flowColors.text}`}>
              {flowZone === 'flow' ? 'Flow State' : flowZone === 'boredom' ? 'Too Easy' : 'Too Hard'}
            </span>
          </div>
        </div>

        {/* Estimation */}
        {estimation && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Player Estimation</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 bg-muted/50 rounded-lg">
                <p className="text-sm font-bold">{estimation.timePerAttemptDisplay}</p>
                <p className="text-xs text-muted-foreground">Per Attempt</p>
              </div>
              <div className="p-2 bg-muted/50 rounded-lg">
                <p className="text-sm font-bold">{estimation.attemptsDisplay}</p>
                <p className="text-xs text-muted-foreground">Attempts</p>
              </div>
              <div className="p-2 bg-muted/50 rounded-lg">
                <p className="text-sm font-bold">{estimation.totalTimeDisplay}</p>
                <p className="text-xs text-muted-foreground">Total Time</p>
              </div>
            </div>
            <div className="flex items-center justify-between p-2 bg-muted/30 rounded-lg text-xs">
              <div className="flex items-center gap-1.5">
                <Percent className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Target Win Rate:</span>
              </div>
              <span className="font-medium">{estimation.targetWinRate[0]}% - {estimation.targetWinRate[1]}%</span>
            </div>
          </div>
        )}

        {/* Sawtooth */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Sawtooth Position</span>
          </div>
          <div className="flex gap-0.5">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((pos) => {
              const expected = SAWTOOTH_EXPECTED_DISPLAY[pos as keyof typeof SAWTOOTH_EXPECTED_DISPLAY];
              const colors = DIFFICULTY_BADGE_COLORS[expected];
              const isActive = pos === sawtoothPosition;
              return (
                <div
                  key={pos}
                  className={`flex-1 h-8 rounded-sm flex items-center justify-center text-xs font-medium transition-all ${
                    isActive ? `${colors.bg} ${colors.text} ring-2 ring-white` : 'bg-muted/30 text-muted-foreground'
                  }`}
                >
                  {pos}
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Direction Arrow
// ============================================================================

interface DirectionArrowProps {
  cx: number;
  cy: number;
  direction: BlockDirection;
  size: number;
  color?: string;
}

function DirectionArrow({ cx, cy, direction, size, color = '#ffffff' }: DirectionArrowProps) {
  const arrowLength = size * 0.7;
  const arrowHeadSize = size * 0.35;
  const strokeWidth = 3;
  const outlineWidth = strokeWidth + 2;

  if (isBidirectional(direction)) {
    const angle = AXIS_ANGLES[direction];
    const lineStart = -arrowLength * 0.35;
    const lineEnd = arrowLength * 0.35;

    return (
      <g transform={`translate(${cx}, ${cy}) rotate(${angle})`}>
        <line x1={lineStart} y1={0} x2={lineEnd} y2={0} stroke="rgba(0, 0, 0, 0.6)" strokeWidth={outlineWidth} strokeLinecap="round" />
        <polygon points={`${lineEnd - arrowHeadSize * 0.7},${-arrowHeadSize * 0.5} ${lineEnd + 3},0 ${lineEnd - arrowHeadSize * 0.7},${arrowHeadSize * 0.5}`} fill="rgba(0, 0, 0, 0.6)" />
        <polygon points={`${lineStart + arrowHeadSize * 0.7},${-arrowHeadSize * 0.5} ${lineStart - 3},0 ${lineStart + arrowHeadSize * 0.7},${arrowHeadSize * 0.5}`} fill="rgba(0, 0, 0, 0.6)" />
        <line x1={lineStart} y1={0} x2={lineEnd} y2={0} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
        <polygon points={`${lineEnd - arrowHeadSize * 0.7},${-arrowHeadSize * 0.5} ${lineEnd + 3},0 ${lineEnd - arrowHeadSize * 0.7},${arrowHeadSize * 0.5}`} fill={color} />
        <polygon points={`${lineStart + arrowHeadSize * 0.7},${-arrowHeadSize * 0.5} ${lineStart - 3},0 ${lineStart + arrowHeadSize * 0.7},${arrowHeadSize * 0.5}`} fill={color} />
      </g>
    );
  }

  const angle = DIRECTION_ANGLES[direction as SquareDirection];
  const lineStart = -arrowLength * 0.3;
  const lineEnd = arrowLength * 0.35;

  return (
    <g transform={`translate(${cx}, ${cy}) rotate(${angle})`}>
      <line x1={lineStart} y1={0} x2={lineEnd} y2={0} stroke="rgba(0, 0, 0, 0.6)" strokeWidth={outlineWidth} strokeLinecap="round" />
      <polygon points={`${lineEnd - arrowHeadSize * 0.7},${-arrowHeadSize * 0.55} ${lineEnd + 3},0 ${lineEnd - arrowHeadSize * 0.7},${arrowHeadSize * 0.55}`} fill="rgba(0, 0, 0, 0.6)" />
      <line x1={lineStart} y1={0} x2={lineEnd} y2={0} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <polygon points={`${lineEnd - arrowHeadSize * 0.7},${-arrowHeadSize * 0.55} ${lineEnd + 3},0 ${lineEnd - arrowHeadSize * 0.7},${arrowHeadSize * 0.55}`} fill={color} />
    </g>
  );
}
