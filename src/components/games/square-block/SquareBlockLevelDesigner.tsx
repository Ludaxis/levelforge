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
  calculateDifficulty,
  calculateFlowZone,
  getSawtoothPosition,
  getExpectedDifficulty,
  estimateLevel,
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
} from '@/lib/squareGrid';
import {
  Settings, Play, Trash2, Shuffle, CheckCircle, AlertTriangle,
  Dices, Circle, Plus, Lightbulb, BarChart3, Target, Activity,
  TrendingUp, Clock, Percent
} from 'lucide-react';

// ============================================================================
// Constants
// ============================================================================

const CELL_SIZE = 40;
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

  // Random generator settings
  const [targetBlockCount, setTargetBlockCount] = useState(5);
  const [targetDifficulty, setTargetDifficulty] = useState<'any' | 'easy' | 'medium' | 'hard'>('any');

  // Current tool settings
  const [selectedDirection, setSelectedDirection] = useState<BlockDirection>('E');
  const [selectedColor, setSelectedColor] = useState<string>(BLOCK_COLORS.cyan);

  // Edit mode
  const [editMode, setEditMode] = useState<'place' | 'direction'>('place');
  const [placementMode, setPlacementMode] = useState<'block' | 'hole'>('block');

  // Placed blocks and holes
  const [blocks, setBlocks] = useState<Map<string, SquareBlock>>(new Map());
  const [holes, setHoles] = useState<Set<string>>(new Set());

  // Move limit
  const [extraMoves, setExtraMoves] = useState(5);

  // Hover state
  const [hoveredCell, setHoveredCell] = useState<string | null>(null);

  // Generate grid coordinates
  const gridCoords = useMemo(() => createRectangularGrid(rows, cols), [rows, cols]);

  // Calculate SVG dimensions
  const { viewBox, origin, width, height } = useMemo(() => {
    const padding = 20;
    const w = cols * CELL_SIZE + padding * 2;
    const h = rows * CELL_SIZE + padding * 2;
    return {
      viewBox: `0 0 ${w} ${h}`,
      origin: { x: padding, y: padding },
      width: w,
      height: h,
    };
  }, [rows, cols]);

  // Check if direction is clear
  const isDirectionClear = (
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
  };

  // Check if block can be cleared
  const canClearBlock = (block: SquareBlock, currentBlocks: Map<string, SquareBlock>, currentHoles: Set<string>): boolean => {
    if (isBidirectional(block.direction)) {
      const [dir1, dir2] = getAxisDirections(block.direction);
      return isDirectionClear(block.coord, dir1, currentBlocks, currentHoles) ||
             isDirectionClear(block.coord, dir2, currentBlocks, currentHoles);
    }
    return isDirectionClear(block.coord, block.direction as SquareDirection, currentBlocks, currentHoles);
  };

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

  // Get valid directions
  const getValidDirections = useCallback(
    (coord: GridCoord, currentBlocks: Map<string, SquareBlock>, currentHoles: Set<string>, mode: GameMode): BlockDirection[] => {
      const validDirs: BlockDirection[] = [];

      for (const dir of DIRECTION_ORDER) {
        if (isDirectionClear(coord, dir, currentBlocks, currentHoles)) {
          validDirs.push(dir);
        }
      }

      if (mode === 'push') {
        for (const axis of AXIS_ORDER) {
          const [dir1, dir2] = getAxisDirections(axis);
          if (isDirectionClear(coord, dir1, currentBlocks, currentHoles) ||
              isDirectionClear(coord, dir2, currentBlocks, currentHoles)) {
            validDirs.push(axis);
          }
        }
      }

      return validDirs;
    },
    [rows, cols]
  );

  // Calculate clearability
  const getInitialClearability = (blockMap: Map<string, SquareBlock>, levelHoles: Set<string>): number => {
    if (blockMap.size === 0) return 0;
    let clearable = 0;
    for (const block of blockMap.values()) {
      if (canClearBlock(block, blockMap, levelHoles)) clearable++;
    }
    return clearable / blockMap.size;
  };

  // Check difficulty match
  const matchesDifficulty = (
    blockMap: Map<string, SquareBlock>,
    levelHoles: Set<string>,
    difficulty: 'any' | 'easy' | 'medium' | 'hard'
  ): boolean => {
    if (difficulty === 'any') return true;
    const ratio = getInitialClearability(blockMap, levelHoles);

    switch (difficulty) {
      case 'easy': return ratio >= 0.5;
      case 'medium': return ratio >= 0.2 && ratio < 0.5;
      case 'hard': return ratio > 0 && ratio < 0.2;
      default: return true;
    }
  };

  // Generate random level
  const generateSingleLevel = (): Map<string, SquareBlock> => {
    const newBlocks = new Map<string, SquareBlock>();
    const availableCoords = gridCoords.filter(coord => !holes.has(gridKey(coord)));
    const colors = Object.values(BLOCK_COLORS);

    const shuffled = [...availableCoords];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const count = Math.min(targetBlockCount, shuffled.length);

    for (let i = 0; i < count; i++) {
      const coord = shuffled[i];
      const key = gridKey(coord);
      const validDirs = getValidDirections(coord, newBlocks, holes, gameMode);

      if (validDirs.length > 0) {
        let direction: BlockDirection;

        if (targetDifficulty === 'hard' || targetDifficulty === 'medium') {
          const centerDirs = validDirs.filter(d => {
            if (isBidirectional(d)) return true;
            const dirVec = SQUARE_DIRECTIONS[d as SquareDirection];
            const nextCoord = gridAdd(coord, dirVec);
            return isInBounds(nextCoord, rows, cols);
          });
          const dirsToUse = centerDirs.length > 0 ? centerDirs : validDirs;
          direction = dirsToUse[Math.floor(Math.random() * dirsToUse.length)];
        } else {
          direction = validDirs[Math.floor(Math.random() * validDirs.length)];
        }

        const color = colors[Math.floor(Math.random() * colors.length)];

        const block: SquareBlock = {
          id: `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          coord,
          direction,
          color,
        };

        newBlocks.set(key, block);
      }
    }

    return newBlocks;
  };

  const generateRandomLevel = useCallback(() => {
    const maxAttempts = targetBlockCount > 50 ? 10 : 30;
    let bestCandidate: Map<string, SquareBlock> | null = null;
    let bestDiffMatch = false;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const candidateBlocks = generateSingleLevel();
      const result = solveLevel(candidateBlocks, holes);

      if (result.solvable) {
        const diffMatch = matchesDifficulty(candidateBlocks, holes, targetDifficulty);

        if (diffMatch) {
          setBlocks(candidateBlocks);
          return;
        }

        if (!bestCandidate || (diffMatch && !bestDiffMatch)) {
          bestCandidate = candidateBlocks;
          bestDiffMatch = diffMatch;
        }
      }
    }

    if (bestCandidate) {
      setBlocks(bestCandidate);
    } else {
      setBlocks(generateSingleLevel());
    }
  }, [gridCoords, targetBlockCount, targetDifficulty, holes, rows, cols, gameMode]);

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
      parMoves: moveLimit,
    };
    onPlayLevel(level);
  };

  // Add to collection
  const handleAddToCollection = () => {
    if (!onAddToCollection || !solvability.solvable) return;

    const holeCoords: GridCoord[] = [];
    holes.forEach(key => {
      const [row, col] = key.split(',').map(Number);
      holeCoords.push({ row, col });
    });

    const optimalMoves = blocks.size;
    const moveBufferPercent = optimalMoves > 0 ? (extraMoves / optimalMoves) * 100 : 0;
    const difficulty = calculateDifficulty(currentClearability, blocks.size, moveBufferPercent);
    const sawtoothPosition = getSawtoothPosition(levelNumber);
    const flowZone = calculateFlowZone(difficulty, levelNumber);

    const metrics: LevelMetrics = {
      cellCount: blocks.size,
      holeCount: holes.size,
      optimalMoves,
      moveLimit: optimalMoves + extraMoves,
      moveBuffer: extraMoves,
      moveBufferPercent,
      initialClearability: currentClearability,
      difficulty,
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

  // Metrics calculations
  const currentClearability = getInitialClearability(blocks, holes);
  const optimalMoves = blocks.size;
  const moveLimit = optimalMoves + extraMoves;
  const moveBufferPercent = optimalMoves > 0 ? (extraMoves / optimalMoves) * 100 : 0;
  const currentDifficulty = blocks.size > 0 ? calculateDifficulty(currentClearability, blocks.size, moveBufferPercent) : null;

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
                width={cols * CELL_SIZE}
                height={rows * CELL_SIZE}
                fill="rgba(0, 0, 0, 0.3)"
                rx={4}
              />

              {/* Grid cells */}
              {gridCoords.map((coord) => {
                const key = gridKey(coord);
                const pixel = gridToPixel(coord, CELL_SIZE, origin);
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
                      x={pixel.x - CELL_SIZE / 2 + 2}
                      y={pixel.y - CELL_SIZE / 2 + 2}
                      width={CELL_SIZE - 4}
                      height={CELL_SIZE - 4}
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
                        <circle cx={pixel.x} cy={pixel.y} r={CELL_SIZE * 0.3} fill="rgba(0, 0, 0, 0.9)" />
                        <circle cx={pixel.x} cy={pixel.y} r={CELL_SIZE * 0.35} fill="none" stroke="rgba(60, 40, 20, 0.8)" strokeWidth={3} />
                      </g>
                    )}

                    {/* Preview block */}
                    {isHovered && !hasBlock && !hasHole && editMode === 'place' && placementMode === 'block' && (
                      <g opacity={0.5} pointerEvents="none">
                        <rect
                          x={pixel.x - CELL_SIZE / 2 + 4}
                          y={pixel.y - CELL_SIZE / 2 + 4}
                          width={CELL_SIZE - 8}
                          height={CELL_SIZE - 8}
                          fill={selectedColor}
                          rx={4}
                        />
                        <DirectionArrow cx={pixel.x} cy={pixel.y} direction={selectedDirection} size={CELL_SIZE * 0.5} />
                      </g>
                    )}

                    {/* Preview hole */}
                    {isHovered && !hasBlock && !hasHole && editMode === 'place' && placementMode === 'hole' && (
                      <g opacity={0.6} pointerEvents="none">
                        <circle cx={pixel.x} cy={pixel.y} r={CELL_SIZE * 0.25} fill="rgba(0, 0, 0, 0.7)" />
                      </g>
                    )}
                  </g>
                );
              })}

              {/* Placed blocks */}
              {Array.from(blocks.values()).map((block) => {
                const key = gridKey(block.coord);
                const pixel = gridToPixel(block.coord, CELL_SIZE, origin);
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
                      x={pixel.x - CELL_SIZE / 2 + 4}
                      y={pixel.y - CELL_SIZE / 2 + 4}
                      width={CELL_SIZE - 8}
                      height={CELL_SIZE - 8}
                      fill={block.color}
                      stroke={isBlockHovered && editMode === 'direction' ? 'rgba(255, 255, 255, 0.8)' : 'rgba(0, 0, 0, 0.3)'}
                      strokeWidth={isBlockHovered && editMode === 'direction' ? 2 : 1.5}
                      rx={4}
                    />
                    <DirectionArrow
                      cx={pixel.x}
                      cy={pixel.y}
                      direction={block.direction}
                      size={CELL_SIZE * 0.5}
                      color={canClear ? '#ffffff' : 'rgba(255, 255, 255, 0.5)'}
                    />
                    {canClear && editMode !== 'direction' && (
                      <rect
                        x={pixel.x - CELL_SIZE / 2 + 2}
                        y={pixel.y - CELL_SIZE / 2 + 2}
                        width={CELL_SIZE - 4}
                        height={CELL_SIZE - 4}
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
                  max={10}
                  step={1}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Columns</label>
                <Slider
                  value={[cols]}
                  onValueChange={([v]) => handleSizeChange(rows, v)}
                  min={3}
                  max={10}
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
          {/* Random Generator */}
          <div className="space-y-3 p-3 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-2">
              <Dices className="h-4 w-4" />
              <label className="text-sm font-medium">Random Generator</label>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Blocks</span>
                <span className="text-sm font-medium">{targetBlockCount}</span>
              </div>
              <Slider
                value={[targetBlockCount]}
                onValueChange={([v]) => setTargetBlockCount(v)}
                min={2}
                max={Math.min(100, Math.floor(rows * cols * 0.8))}
                step={1}
              />
            </div>
            <div className="space-y-2">
              <span className="text-xs text-muted-foreground">Target Difficulty</span>
              <div className="flex gap-1">
                {(['any', 'easy', 'medium', 'hard'] as const).map((diff) => (
                  <Button
                    key={diff}
                    variant={targetDifficulty === diff ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setTargetDifficulty(diff)}
                    className="flex-1 text-xs"
                  >
                    {diff.charAt(0).toUpperCase() + diff.slice(1)}
                  </Button>
                ))}
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={generateRandomLevel} className="w-full">
              <Shuffle className="h-4 w-4 mr-2" />
              Generate Random Level
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
          levelNumber={levelNumber}
          solvable={solvability.solvable}
          initialClearability={currentClearability}
          extraMoves={extraMoves}
          onExtraMovesChange={setExtraMoves}
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
  levelNumber: number;
  solvable: boolean;
  initialClearability: number;
  extraMoves: number;
  onExtraMovesChange: (value: number) => void;
}

function EmbeddedMetricsPanel({
  blocks,
  holes,
  levelNumber,
  solvable,
  initialClearability,
  extraMoves,
  onExtraMovesChange,
}: EmbeddedMetricsPanelProps) {
  const cellCount = blocks.size;
  const holeCount = holes.size;
  const optimalMoves = cellCount;
  const moveLimit = optimalMoves + extraMoves;
  const moveBufferPercent = optimalMoves > 0 ? (extraMoves / optimalMoves) * 100 : 0;
  const difficulty = calculateDifficulty(initialClearability, cellCount, moveBufferPercent);
  const sawtoothPosition = getSawtoothPosition(levelNumber);
  const expectedDiff = getExpectedDifficulty(levelNumber);
  const flowZone = calculateFlowZone(difficulty, levelNumber);
  const estimation = cellCount > 0 ? estimateLevel(moveLimit, difficulty, cellCount) : null;

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
        <div className="grid grid-cols-4 gap-2 text-center">
          <div className="p-2 bg-muted/50 rounded-lg">
            <p className="text-2xl font-bold">{cellCount}</p>
            <p className="text-xs text-muted-foreground">Blocks</p>
          </div>
          <div className="p-2 bg-muted/50 rounded-lg">
            <p className="text-2xl font-bold">{holeCount}</p>
            <p className="text-xs text-muted-foreground">Holes</p>
          </div>
          <div className="p-2 bg-muted/50 rounded-lg">
            <p className="text-2xl font-bold">{optimalMoves}</p>
            <p className="text-xs text-muted-foreground">Min Moves</p>
          </div>
          <div className="p-2 bg-muted/50 rounded-lg">
            <p className="text-2xl font-bold text-primary">{moveLimit}</p>
            <p className="text-xs text-muted-foreground">Move Limit</p>
          </div>
        </div>

        {/* Move Limit Slider */}
        <div className="space-y-2 p-3 bg-muted/30 rounded-lg">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Extra Moves Buffer</label>
            <span className="text-sm">+{extraMoves} ({moveBufferPercent.toFixed(0)}%)</span>
          </div>
          <Slider
            value={[extraMoves]}
            onValueChange={([v]) => onExtraMovesChange(v)}
            min={0}
            max={Math.max(20, optimalMoves)}
            step={1}
          />
        </div>

        {/* Clearability */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Initial Clearability</span>
            <span className="font-medium">{(initialClearability * 100).toFixed(0)}%</span>
          </div>
          <Progress value={initialClearability * 100} className="h-2" />
        </div>

        {/* Difficulty */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <Target className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Difficulty</span>
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
