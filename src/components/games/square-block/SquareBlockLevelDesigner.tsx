'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import {
  SquareBlock,
  SquareBlockLevel,
  BLOCK_COLORS,
  BlockDirection,
  DesignedLevel,
  LevelMetrics,
  DifficultyTier,
  calculateFlowZone,
  getSawtoothPosition,
} from '@/types/squareBlock';
import {
  analyzePuzzle,
  calculateDifficultyScore,
  quickSolve as analyzerQuickSolve,
} from '@/lib/puzzleAnalyzer';
import {
  GridCoord,
  SquareDirection,
  SQUARE_DIRECTIONS,
  DIRECTION_ORDER,
  gridKey,
  createRectangularGrid,
  isInBounds,
  gridAdd,
  isBidirectional,
  getAxisDirections,
  getMinBlocksAhead,
} from '@/lib/squareGrid';
import { Settings } from 'lucide-react';
import { downloadLevelAsJSON, parseAndImportLevel } from '@/lib/squareBlockExport';
import { DeadlockInfo, StuckReason, RootCauseType } from '@/lib/useSquareBlockGame';
import {
  FIXED_CELL_SIZE,
  DEFAULT_BLOCK_COLOR,
  StagedLevel,
  SquareBlockLevelDesignerProps,
  StagingArea,
  SolvabilityBanner,
  ToolBar,
  GridCanvas,
  DifficultyPanel,
  ConfigurationPanel,
  EmbeddedMetricsPanel,
} from './designer';

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
  const [eraserMode, setEraserMode] = useState(false);


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

  // Calculate blocks ahead for all blocks (for visualization) — debounced
  const [blocksAheadMap, setBlocksAheadMap] = useState<Map<string, number>>(new Map());
  const blocksAheadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (blocksAheadTimerRef.current) clearTimeout(blocksAheadTimerRef.current);
    blocksAheadTimerRef.current = setTimeout(() => {
      const map = new Map<string, number>();
      for (const [key, block] of blocks) {
        map.set(key, getMinBlocksAhead(block.coord, block.direction, blocks, holes, rows, cols));
      }
      setBlocksAheadMap(map);
    }, 200);
  }, [blocks, holes, rows, cols]);

  // Pre-compute clearable block keys — debounced
  const [clearableKeys, setClearableKeys] = useState<Set<string>>(new Set());
  const clearableTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Debounced clearable keys computation
  useEffect(() => {
    if (clearableTimerRef.current) clearTimeout(clearableTimerRef.current);
    clearableTimerRef.current = setTimeout(() => {
      const keys = new Set<string>();
      for (const [key, block] of blocks) {
        if (canClearBlock(block, blocks, holes)) keys.add(key);
      }
      setClearableKeys(keys);
    }, 100);
  }, [blocks, holes, canClearBlock]);

  // Solve level — debounced to avoid blocking UI on every click
  const [solvability, setSolvability] = useState<{ solvable: boolean; optimalMoves: number; message: string }>({
    solvable: false, optimalMoves: 0, message: 'Add at least one block',
  });
  const solvabilityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (solvabilityTimerRef.current) clearTimeout(solvabilityTimerRef.current);
    if (blocks.size === 0) {
      setSolvability({ solvable: false, optimalMoves: 0, message: 'Add at least one block' });
      return;
    }
    solvabilityTimerRef.current = setTimeout(() => {
      const result = analyzerQuickSolve(blocks, holes, rows, cols);
      setSolvability(result.solvable
        ? { solvable: true, optimalMoves: result.moves, message: `Solvable: ${result.moves} moves` }
        : { solvable: false, optimalMoves: 0, message: 'Deadlock: some blocks stuck' }
      );
    }, 150);
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

  // Compute deadlock info with full chain tracing — debounced
  const emptyDeadlock: DeadlockInfo = useMemo(() => ({
    stuckBlocks: new Map(), blockerBlocks: new Set(), hasDeadlock: false,
  }), []);
  const [deadlockInfo, setDeadlockInfo] = useState<DeadlockInfo>(emptyDeadlock);
  const deadlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (deadlockTimerRef.current) clearTimeout(deadlockTimerRef.current);
    if (solvability.solvable) {
      setDeadlockInfo(emptyDeadlock);
      return;
    }
    deadlockTimerRef.current = setTimeout(() => {
      const immediateBlocker = new Map<string, string | null>();
      const isStuck = new Set<string>();
      for (const [key, block] of blocks) {
        if (canClearBlock(block, blocks, holes)) continue;
        if (block.iceCount && block.iceCount > 0) continue;
        if (block.locked) {
          const hasNeighbor = ['N', 'E', 'S', 'W'].some(dir => {
            const neighborCoord = gridAdd(block.coord, SQUARE_DIRECTIONS[dir as SquareDirection]);
            return blocks.has(gridKey(neighborCoord));
          });
          if (hasNeighbor) continue;
        }
        isStuck.add(key);
        const pathInfo = getBlockPath(block, blocks, holes);
        if (pathInfo.blocked && pathInfo.blockerCoord) {
          immediateBlocker.set(key, gridKey(pathInfo.blockerCoord));
        } else {
          immediateBlocker.set(key, null);
        }
      }
      const stuckMap = new Map<string, StuckReason>();
      const blockers = new Set<string>();
      function traceChain(startKey: string): { chain: string[]; rootCause: RootCauseType; rootBlockKey?: string } {
        const chain: string[] = [startKey];
        const visited = new Set<string>([startKey]);
        let current = startKey;
        while (true) {
          const bk = immediateBlocker.get(current);
          if (bk === null || bk === undefined) return { chain, rootCause: 'edge_blocked', rootBlockKey: current };
          if (visited.has(bk)) {
            const cl = chain.length - chain.indexOf(bk);
            return { chain, rootCause: cl === 2 ? 'mutual_block' : 'circular_chain' };
          }
          if (!isStuck.has(bk)) return { chain, rootCause: 'edge_blocked', rootBlockKey: bk };
          chain.push(bk); visited.add(bk); current = bk;
        }
      }
      for (const key of isStuck) {
        const { chain, rootCause, rootBlockKey } = traceChain(key);
        const bk = immediateBlocker.get(key);
        for (let i = 1; i < chain.length; i++) blockers.add(chain[i]);
        let message: string, type: StuckReason['type'];
        if (rootCause === 'edge_blocked') {
          if (chain.length === 1) { message = 'Points at edge'; type = 'edge_blocked'; }
          else { message = `Chain: ${chain.length} blocks`; type = 'blocked_by'; }
        } else if (rootCause === 'mutual_block') { message = `Mutual block`; type = 'mutual_block'; }
        else { message = `Circular chain of ${chain.length}`; type = 'circular_chain'; }
        stuckMap.set(key, { type, blockedBy: bk ?? undefined, blockingChain: chain, rootCause, rootBlockKey, message });
      }
      setDeadlockInfo({ stuckBlocks: stuckMap, blockerBlocks: blockers, hasDeadlock: stuckMap.size > 0 });
    }, 250);
  }, [blocks, holes, solvability.solvable, canClearBlock, getBlockPath, emptyDeadlock]);

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

  // Deep puzzle analysis for difficulty scoring — debounced (heaviest computation)
  const [puzzleAnalysis, setPuzzleAnalysis] = useState<ReturnType<typeof analyzePuzzle> | null>(null);
  const [difficultyBreakdown, setDifficultyBreakdown] = useState<ReturnType<typeof calculateDifficultyScore> | null>(null);
  const analysisTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (analysisTimerRef.current) clearTimeout(analysisTimerRef.current);
    if (blocks.size === 0) {
      setPuzzleAnalysis(null);
      setDifficultyBreakdown(null);
      return;
    }
    analysisTimerRef.current = setTimeout(() => {
      const analysis = analyzePuzzle(blocks, holes, rows, cols);
      setPuzzleAnalysis(analysis);
      setDifficultyBreakdown(analysis.solvable ? calculateDifficultyScore(analysis) : null);
    }, 300);
  }, [blocks, holes, rows, cols]);

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

  // Handle cell click - update existing block's properties (preserving color) or place/remove
  const handleCellClick = (coord: GridCoord) => {
    const key = gridKey(coord);

    // Eraser mode: remove any block on click
    if (eraserMode) {
      if (blocks.has(key)) {
        const newBlocks = new Map(blocks);
        newBlocks.delete(key);
        setBlocks(newBlocks);
      }
      return;
    }

    if (blocks.has(key)) {
      const existingBlock = blocks.get(key)!;

      // Check if toolbar settings differ from the existing block
      const newLocked = selectedLocked || undefined;
      const newIceCount = selectedIceCount > 0 ? selectedIceCount : undefined;
      const newMirror = selectedMirror || undefined;

      const isSameDirection = existingBlock.direction === selectedDirection;
      const isSameLocked = !!existingBlock.locked === selectedLocked;
      const isSameIce = (existingBlock.iceCount ?? 0) === selectedIceCount;
      const isSameMirror = !!existingBlock.mirror === selectedMirror;

      if (isSameDirection && isSameLocked && isSameIce && isSameMirror) {
        // Same settings as toolbar → remove the block
        const newBlocks = new Map(blocks);
        newBlocks.delete(key);
        setBlocks(newBlocks);
      } else {
        // Different settings → update block in-place, preserving its color
        const newBlocks = new Map(blocks);
        newBlocks.set(key, {
          ...existingBlock,
          direction: selectedDirection,
          locked: newLocked,
          iceCount: newIceCount,
          mirror: newMirror,
        });
        setBlocks(newBlocks);
      }
    } else if (!holes.has(key)) {
      // Place new block on empty cell
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

    const filename = `grid_Level${levelNumber}_1.json`;
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
      // Sort by level number extracted from filename (e.g., grid_Level5_1.json → 5)
      newStaged.sort((a, b) => {
        const numA = a.filename.match(/Level(\d+)/i)?.[1];
        const numB = b.filename.match(/Level(\d+)/i)?.[1];
        if (numA && numB) return parseInt(numA, 10) - parseInt(numB, 10);
        if (numA) return -1;
        if (numB) return 1;
        return 0;
      });
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
      // Extract level number from filename if available (e.g., grid_Level5_1.json → 5)
      const fileMatch = staged.filename.match(/Level(\d+)/i);
      if (fileMatch) {
        currentLevelNum = parseInt(fileMatch[1], 10);
      }
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
        name: `grid_Level${currentLevelNum}_1`,
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

    if (blocks.size === 0) return;

    // Find bounding box of existing blocks
    let minRow = Infinity, maxRow = -Infinity, minCol = Infinity, maxCol = -Infinity;
    blocks.forEach((block) => {
      minRow = Math.min(minRow, block.coord.row);
      maxRow = Math.max(maxRow, block.coord.row);
      minCol = Math.min(minCol, block.coord.col);
      maxCol = Math.max(maxCol, block.coord.col);
    });
    holes.forEach((key) => {
      const [r, c] = key.split(',').map(Number);
      minRow = Math.min(minRow, r);
      maxRow = Math.max(maxRow, r);
      minCol = Math.min(minCol, c);
      maxCol = Math.max(maxCol, c);
    });

    const artWidth = maxCol - minCol + 1;
    const artHeight = maxRow - minRow + 1;

    // Calculate shift to center artwork in new grid
    const shiftRow = Math.max(0, Math.floor((newRows - artHeight) / 2)) - minRow;
    const shiftCol = Math.max(0, Math.floor((newCols - artWidth) / 2)) - minCol;

    // Shift blocks and keep only those in bounds
    const newBlocks = new Map<string, SquareBlock>();
    blocks.forEach((block) => {
      const newCoord = { row: block.coord.row + shiftRow, col: block.coord.col + shiftCol };
      if (isInBounds(newCoord, newRows, newCols)) {
        const newKey = gridKey(newCoord);
        newBlocks.set(newKey, { ...block, coord: newCoord });
      }
    });
    setBlocks(newBlocks);

    // Shift holes and keep only those in bounds
    const newHoles = new Set<string>();
    holes.forEach(key => {
      const [row, col] = key.split(',').map(Number);
      const newRow = row + shiftRow;
      const newCol = col + shiftCol;
      if (isInBounds({ row: newRow, col: newCol }, newRows, newCols)) {
        newHoles.add(gridKey({ row: newRow, col: newCol }));
      }
    });
    setHoles(newHoles);
  };

  return (
    <div className="space-y-4">
      {/* Import Staging Area - TOP of Design section */}
      <StagingArea
        stagedLevels={stagedLevels}
        setStagedLevels={setStagedLevels}
        handleImportMultipleFiles={handleImportMultipleFiles}
        handleAddStagedToCollection={handleAddStagedToCollection}
        onAddToCollection={onAddToCollection}
        setRows={setRows}
        setCols={setCols}
        setBlocks={setBlocks}
        setHoles={setHoles}
      />

      {/* Solvability Check + Block Type Counts */}
      <SolvabilityBanner
        solvability={solvability}
        deadlockInfo={deadlockInfo}
        blocks={blocks}
        holes={holes}
        blockTypeCounts={blockTypeCounts}
      />

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
          <ToolBar
            selectedDirection={selectedDirection}
            setSelectedDirection={setSelectedDirection}
            selectedLocked={selectedLocked}
            setSelectedLocked={setSelectedLocked}
            selectedIceCount={selectedIceCount}
            setSelectedIceCount={setSelectedIceCount}
            selectedMirror={selectedMirror}
            setSelectedMirror={setSelectedMirror}
            eraserMode={eraserMode}
            setEraserMode={setEraserMode}
            zoom={zoom}
            handleZoomIn={handleZoomIn}
            handleZoomOut={handleZoomOut}
            handleZoomReset={handleZoomReset}
          />

          <GridCanvas
            rows={rows}
            cols={cols}
            cellSize={cellSize}
            gridCoords={gridCoords}
            blocks={blocks}
            holes={holes}
            hoveredCell={hoveredCell}
            setHoveredCell={setHoveredCell}
            handleCellClick={handleCellClick}
            clearableKeys={clearableKeys}
            deadlockInfo={deadlockInfo}
            selectedDirection={selectedDirection}
            selectedLocked={selectedLocked}
            selectedIceCount={selectedIceCount}
            selectedMirror={selectedMirror}
            showBlocksAhead={showBlocksAhead}
            blocksAheadMap={blocksAheadMap}
            viewBox={viewBox}
            origin={origin}
            width={width}
            height={height}
            zoom={zoom}
            isPanning={isPanning}
            svgContainerRef={svgContainerRef}
            handleWheel={handleWheel}
            handlePanStart={handlePanStart}
            handlePanMove={handlePanMove}
            handlePanEnd={handlePanEnd}
          />

          <DifficultyPanel
            blocks={blocks}
            puzzleAnalysis={puzzleAnalysis}
            difficultyBreakdown={difficultyBreakdown}
            solvability={solvability}
            isAdjusting={isAdjusting}
            lastAdjustmentResult={lastAdjustmentResult}
            canIncreaseDifficulty={canIncreaseDifficulty}
            canDecreaseDifficulty={canDecreaseDifficulty}
            increaseDifficulty={increaseDifficulty}
            decreaseDifficulty={decreaseDifficulty}
          />

          <ConfigurationPanel
            blocks={blocks}
            holes={holes}
            rows={rows}
            cols={cols}
            solvability={solvability}
            isGenerating={isGenerating}
            showBlocksAhead={showBlocksAhead}
            setShowBlocksAhead={setShowBlocksAhead}
            smartFillLevel={smartFillLevel}
            clearAll={clearAll}
            handlePlay={handlePlay}
            handleExportJSON={handleExportJSON}
            handleImportMultipleFiles={handleImportMultipleFiles}
            handleSizeChange={handleSizeChange}
            onAddToCollection={onAddToCollection}
            editingLevel={editingLevel}
            levelNumber={levelNumber}
            onLevelNumberChange={onLevelNumberChange}
            maxLevelNumber={maxLevelNumber}
            handleAddToCollection={handleAddToCollection}
            collections={collections}
            targetCollectionId={targetCollectionId}
            setTargetCollectionId={setTargetCollectionId}
          />
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
