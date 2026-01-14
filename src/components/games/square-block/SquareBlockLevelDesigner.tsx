'use client';

import { useState, useMemo, useCallback } from 'react';
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
  quickSolve,
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
  Circle, Plus, BarChart3, Target, Activity,
  TrendingUp, Clock, Percent, Lock, Unlock, Eye, EyeOff, Sparkles
} from 'lucide-react';

// ============================================================================
// Constants
// ============================================================================

const MAX_CANVAS_SIZE = 400; // Maximum canvas width/height in pixels
const MIN_CELL_SIZE = 8;    // Minimum cell size for very large grids
const MAX_CELL_SIZE = 40;   // Maximum cell size for small grids

// Calculate optimal cell size based on grid dimensions
function calculateCellSize(rows: number, cols: number): number {
  const maxDimension = Math.max(rows, cols);
  const calculatedSize = Math.floor(MAX_CANVAS_SIZE / maxDimension);
  return Math.max(MIN_CELL_SIZE, Math.min(MAX_CELL_SIZE, calculatedSize));
}

const BLOCK_COLOR_OPTIONS = Object.entries(BLOCK_COLORS);

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

// ============================================================================
// Types
// ============================================================================

interface SquareBlockLevelDesignerProps {
  onPlayLevel: (level: SquareBlockLevel) => void;
  onAddToCollection?: (level: DesignedLevel) => void;
  levelNumber?: number;
  onLevelNumberChange?: (num: number) => void;
  maxLevelNumber?: number;
  editingLevel?: DesignedLevel | null;
  showMetricsPanel?: boolean;
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
}: SquareBlockLevelDesignerProps) {
  // Grid configuration
  const [rows, setRows] = useState(5);
  const [cols, setCols] = useState(5);

  // Game mode
  const [gameMode, setGameMode] = useState<GameMode>('classic');


  // Current tool settings
  const [selectedDirection, setSelectedDirection] = useState<BlockDirection>('E');
  const [selectedColor, setSelectedColor] = useState<string>(BLOCK_COLORS.cyan);
  const [selectedLocked, setSelectedLocked] = useState(false);

  // Edit mode
  const [editMode, setEditMode] = useState<'place' | 'direction'>('place');
  const [placementMode, setPlacementMode] = useState<'block' | 'hole'>('block');

  // Placed blocks and holes
  const [blocks, setBlocks] = useState<Map<string, SquareBlock>>(new Map());
  const [holes, setHoles] = useState<Set<string>>(new Set());

  // Hover state
  const [hoveredCell, setHoveredCell] = useState<string | null>(null);

  // Show blocks ahead toggle
  const [showBlocksAhead, setShowBlocksAhead] = useState(false);

  // Loading state
  const [isGenerating, setIsGenerating] = useState(false);

  // Calculate dynamic cell size based on grid dimensions
  const cellSize = useMemo(() => calculateCellSize(rows, cols), [rows, cols]);

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
      if (currentHoles.has(key)) return true;
      if (currentBlocks.has(key)) return false;
      current = gridAdd(current, dirVec);
    }
    return true;
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

  // Solve level (greedy)
  const solveLevel = (
    initialBlocks: Map<string, SquareBlock>,
    levelHoles: Set<string>
  ): { solvable: boolean; optimalMoves: number; message: string } => {
    if (initialBlocks.size === 0) {
      return { solvable: false, optimalMoves: 0, message: 'Add at least one block' };
    }

    const totalCells = initialBlocks.size;
    const remaining = new Map(initialBlocks);

    while (remaining.size > 0) {
      let clearedAny = false;

      for (const [key, block] of remaining) {
        if (canClearBlock(block, remaining, levelHoles)) {
          remaining.delete(key);
          clearedAny = true;
          break;
        }
      }

      if (!clearedAny) {
        return {
          solvable: false,
          optimalMoves: 0,
          message: `Deadlock: ${remaining.size} blocks stuck`,
        };
      }
    }

    return {
      solvable: true,
      optimalMoves: totalCells,
      message: `Solvable: ${totalCells} moves`,
    };
  };

  const solvability = solveLevel(blocks, holes);

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

  // Get direction preference based on difficulty target
  const getDirectionPreference = useCallback((
    coord: GridCoord,
    difficulty: 'any' | DifficultyTier
  ): BlockDirection[] => {
    const allDirs: BlockDirection[] = [...DIRECTION_ORDER];
    if (gameMode === 'push') {
      allDirs.push(...AXIS_ORDER);
    }

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
  }, [rows, cols, gameMode]);

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
      const allDirections: BlockDirection[] = gameMode === 'push'
        ? [...DIRECTION_ORDER, ...AXIS_ORDER]
        : [...DIRECTION_ORDER];

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

        if (quickSolve(newBlocks, holes, rows, cols).solvable) {
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

        if (quickSolve(newBlocks, holes, rows, cols).solvable) {
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
  }, [gridCoords, holes, gameMode, getDirectionPreference, rows, cols]);

  // Handle cell click
  const handleCellClick = (coord: GridCoord) => {
    const key = gridKey(coord);

    if (editMode === 'direction') {
      if (blocks.has(key)) {
        const block = blocks.get(key)!;
        let newDirection: BlockDirection;

        if (gameMode === 'classic') {
          if (isBidirectional(block.direction)) {
            const [dir1] = getAxisDirections(block.direction);
            newDirection = dir1;
          } else {
            const currentIndex = DIRECTION_ORDER.indexOf(block.direction as SquareDirection);
            newDirection = DIRECTION_ORDER[(currentIndex + 1) % DIRECTION_ORDER.length];
          }
        } else {
          if (isBidirectional(block.direction)) {
            const currentIndex = AXIS_ORDER.indexOf(block.direction as SquareAxis);
            newDirection = AXIS_ORDER[(currentIndex + 1) % AXIS_ORDER.length];
          } else {
            const currentIndex = DIRECTION_ORDER.indexOf(block.direction as SquareDirection);
            newDirection = DIRECTION_ORDER[(currentIndex + 1) % DIRECTION_ORDER.length];
          }
        }

        const newBlocks = new Map(blocks);
        newBlocks.set(key, { ...block, direction: newDirection });
        setBlocks(newBlocks);
      }
    } else if (placementMode === 'hole') {
      if (holes.has(key)) {
        const newHoles = new Set(holes);
        newHoles.delete(key);
        setHoles(newHoles);
      } else if (!blocks.has(key)) {
        const newHoles = new Set(holes);
        newHoles.add(key);
        setHoles(newHoles);
      }
    } else {
      if (blocks.has(key)) {
        const newBlocks = new Map(blocks);
        newBlocks.delete(key);
        setBlocks(newBlocks);
      } else if (!holes.has(key)) {
        const newBlock: SquareBlock = {
          id: `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          coord,
          direction: selectedDirection,
          color: selectedColor,
          locked: selectedLocked || undefined,
        };
        const newBlocks = new Map(blocks);
        newBlocks.set(key, newBlock);
        setBlocks(newBlocks);
      }
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
      gameMode,
      blocks: Array.from(blocks.values()),
      holes: holeCoords.length > 0 ? holeCoords : undefined,
    };
    onPlayLevel(level);
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

    const metrics: LevelMetrics = {
      cellCount: blocks.size,
      holeCount: holes.size,
      lockedCount,
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
      gameMode,
      metrics,
      createdAt: editingLevel?.createdAt || Date.now(),
    };

    onAddToCollection(designedLevel);
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
          <p className="text-xs text-muted-foreground">{solvability.message}</p>
        </div>
        <div className="flex gap-2 items-center">
          <Badge variant="outline">{blocks.size} blocks</Badge>
          {holes.size > 0 && <Badge variant="outline">{holes.size} holes</Badge>}
        </div>
      </div>

      {/* Design Canvas */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Level Designer
          </CardTitle>
          <CardDescription>
            {editMode === 'place' ? 'Click cells to place/remove blocks' : 'Click blocks to change arrow direction'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Direction & Color Selectors */}
          {editMode === 'place' && placementMode === 'block' && (
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
                {gameMode === 'push' && (
                  <div className="flex flex-wrap gap-1">
                    {AXIS_ORDER.map((axis) => (
                      <Button
                        key={axis}
                        variant={selectedDirection === axis ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setSelectedDirection(axis)}
                        className="w-12 h-10 text-lg"
                      >
                        {DIRECTION_LABELS[axis]}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Color</label>
                <div className="flex flex-wrap gap-2">
                  {BLOCK_COLOR_OPTIONS.map(([name, color]) => (
                    <button
                      key={name}
                      onClick={() => setSelectedColor(color)}
                      className={`w-8 h-8 rounded-full transition-transform ${
                        selectedColor === color ? 'ring-2 ring-white scale-110' : ''
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
              {/* Locked Toggle */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Locked Block</label>
                <Button
                  variant={selectedLocked ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedLocked(!selectedLocked)}
                  className="w-full"
                >
                  {selectedLocked ? (
                    <>
                      <Lock className="h-4 w-4 mr-2" />
                      Locked (needs neighbors cleared)
                    </>
                  ) : (
                    <>
                      <Unlock className="h-4 w-4 mr-2" />
                      Normal Block
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Game Mode */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Game Mode</label>
            <div className="flex gap-2">
              <Button
                variant={gameMode === 'classic' ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setGameMode('classic');
                  if (isBidirectional(selectedDirection)) {
                    setSelectedDirection('E');
                  }
                }}
                className="flex-1"
              >
                Classic
              </Button>
              <Button
                variant={gameMode === 'push' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setGameMode('push')}
                className="flex-1"
              >
                Push
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {gameMode === 'classic'
                ? 'Blocked blocks bounce back to original position'
                : 'Blocked blocks slide and stop next to the blocker. Bidirectional arrows available.'}
            </p>
          </div>

          {/* Grid SVG */}
          <div className="flex justify-center">
            <svg
              viewBox={viewBox}
              className="w-full max-w-sm mx-auto"
              style={{ aspectRatio: `${width} / ${height}` }}
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
                  fillColor = placementMode === 'hole' ? 'rgba(0, 0, 0, 0.4)' : 'rgba(255, 255, 255, 0.1)';
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
                    {isHovered && !hasBlock && !hasHole && editMode === 'place' && placementMode === 'block' && (
                      <g opacity={0.5} pointerEvents="none">
                        <rect
                          x={pixel.x - cellSize / 2 + 4}
                          y={pixel.y - cellSize / 2 + 4}
                          width={cellSize - 8}
                          height={cellSize - 8}
                          fill={selectedColor}
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
                      </g>
                    )}

                    {/* Preview hole */}
                    {isHovered && !hasBlock && !hasHole && editMode === 'place' && placementMode === 'hole' && (
                      <g opacity={0.6} pointerEvents="none">
                        <circle cx={pixel.x} cy={pixel.y} r={cellSize * 0.25} fill="rgba(0, 0, 0, 0.7)" />
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
                      fill={block.color}
                      stroke={isBlockHovered && editMode === 'direction' ? 'rgba(255, 255, 255, 0.8)' : 'rgba(0, 0, 0, 0.3)'}
                      strokeWidth={isBlockHovered && editMode === 'direction' ? 2 : 1.5}
                      rx={4}
                    />
                    <DirectionArrow
                      cx={pixel.x}
                      cy={pixel.y}
                      direction={block.direction}
                      size={cellSize * 0.5}
                      color={block.locked ? 'rgba(255, 255, 255, 0.3)' : canClear ? '#ffffff' : 'rgba(255, 255, 255, 0.5)'}
                    />
                    {/* Lock icon for locked blocks */}
                    {block.locked && (
                      <g transform={`translate(${pixel.x}, ${pixel.y})`}>
                        <rect x={-6} y={-1} width={12} height={9} fill="rgba(0,0,0,0.7)" stroke="#fbbf24" strokeWidth={1} rx={1} />
                        <path d="M -4 -1 L -4 -4 A 4 4 0 0 1 4 -4 L 4 -1" fill="none" stroke="#fbbf24" strokeWidth={1.5} />
                        <circle cx={0} cy={3} r={1.5} fill="#fbbf24" />
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
                    {canClear && editMode !== 'direction' && (
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
                  </g>
                );
              })}
            </svg>
          </div>

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
                      <span className="text-muted-foreground">Blockers ({puzzleAnalysis.avgBlockers.toFixed(1)} avg)</span>
                      <span className="font-mono">
                        +{difficultyBreakdown.components.blockers.toFixed(0)}/50
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Locked ({puzzleAnalysis.lockedCount}/{puzzleAnalysis.blockCount} = {((puzzleAnalysis.lockedCount / puzzleAnalysis.blockCount) * 100).toFixed(0)}%)</span>
                      <span className="font-mono">
                        +{difficultyBreakdown.components.lockedPercent.toFixed(0)}/25
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Clearability ({(puzzleAnalysis.initialClearability * 100).toFixed(0)}% can clear first)</span>
                      <span className="font-mono">
                        +{difficultyBreakdown.components.clearability.toFixed(0)}/25
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Size Bonus ({puzzleAnalysis.blockCount} blocks)</span>
                      <span className="font-mono text-green-500">
                        {difficultyBreakdown.components.sizeBonus}/20
                      </span>
                    </div>
                  </div>

                  {/* Metric explanations */}
                  <div className="pt-2 border-t border-muted text-xs text-muted-foreground space-y-1.5">
                    <p><strong className="text-foreground">Blockers:</strong> Avg blocks in the way per block. (0 = 0pts, 5+ = 50pts)</p>
                    <p><strong className="text-foreground">Locked %:</strong> % of blocks that are locked. (0% = 0pts, 30%+ = 25pts)</p>
                    <p><strong className="text-foreground">Clearability:</strong> % you can tap first move. (100% = 0pts, 0% = 25pts)</p>
                    <p><strong className="text-foreground">Size Bonus:</strong> Fewer blocks = easier. (&lt;10: -25, &lt;20: -20, &lt;30: -15, &lt;50: -10)</p>
                  </div>

                  {/* Formula */}
                  <div className="pt-2 border-t border-muted text-xs space-y-1.5">
                    <p className="font-medium text-foreground">Difficulty Score Formula:</p>
                    <div className="font-mono text-muted-foreground bg-muted/50 p-2 rounded space-y-1">
                      <p>blockers = min(avgBlockers/5, 1) × 50</p>
                      <p>locked = min(lockedPct/30%, 1) × 25</p>
                      <p>clearability = (1 - clearablePct) × 25</p>
                      <p>sizeBonus = blocks&lt;10: -25, &lt;20: -20, &lt;30: -15, &lt;50: -10</p>
                      <p className="pt-1 border-t border-muted">score = blockers + locked + clearability + sizeBonus</p>
                    </div>
                    <p className="text-muted-foreground">0-19 = Easy, 20-39 = Medium, 40-59 = Hard, 60+ = Super Hard</p>
                  </div>

                  {/* Generation algorithm explanation */}
                  <div className="pt-2 border-t border-muted text-xs space-y-2">
                    <p className="font-medium text-foreground">How "Fill Grid Randomly" works:</p>
                    <div className="space-y-1.5 text-muted-foreground">
                      <p>1. Fills every cell with a block pointing toward nearest edge</p>
                      <p>2. Randomly flips ~50% of directions while keeping solvable</p>
                      <p>3. Adds random locked blocks while keeping solvable</p>
                      <p>4. Calculates difficulty based on blockers, locked %, and clearability</p>
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
                  max={20}
                  step={1}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Columns</label>
                <Slider
                  value={[cols]}
                  onValueChange={([v]) => handleSizeChange(rows, v)}
                  min={3}
                  max={20}
                  step={1}
                />
              </div>
            </div>
          </div>

          {/* Edit Mode Toggle */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Edit Mode</label>
            <div className="flex gap-1">
              <Button
                variant={editMode === 'place' && placementMode === 'block' ? 'default' : 'outline'}
                size="sm"
                onClick={() => { setEditMode('place'); setPlacementMode('block'); }}
                className="flex-1"
              >
                Blocks
              </Button>
              <Button
                variant={editMode === 'place' && placementMode === 'hole' ? 'default' : 'outline'}
                size="sm"
                onClick={() => { setEditMode('place'); setPlacementMode('hole'); }}
                className="flex-1"
              >
                <Circle className="h-3 w-3 mr-1" />
                Holes
              </Button>
              <Button
                variant={editMode === 'direction' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setEditMode('direction')}
                className="flex-1"
              >
                Arrows
              </Button>
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
              <Button
                size="sm"
                variant="secondary"
                onClick={handleAddToCollection}
                disabled={!solvability.solvable || blocks.size === 0}
                className="w-full"
              >
                <Plus className="h-4 w-4 mr-2" />
                {editingLevel ? 'Update Level' : 'Add to Collection'}
              </Button>
            </div>
          )}
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
        <div className="grid grid-cols-3 gap-2 text-center">
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
            <p className="text-xs text-muted-foreground">Locked</p>
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
                <span className="text-muted-foreground">Blockers ({analysis?.avgBlockers?.toFixed(1) ?? 0} avg)</span>
                <span>+{breakdown.components.blockers.toFixed(0)}/50</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Locked ({lockedCount} = {cellCount > 0 ? ((lockedCount / cellCount) * 100).toFixed(0) : 0}%)</span>
                <span>+{breakdown.components.lockedPercent.toFixed(0)}/25</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Clearability ({((analysis?.initialClearability ?? 0) * 100).toFixed(0)}%)</span>
                <span>+{breakdown.components.clearability.toFixed(0)}/25</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Size Bonus ({cellCount} blocks)</span>
                <span className="text-green-500">{breakdown.components.sizeBonus}/20</span>
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
