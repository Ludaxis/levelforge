'use client';

import { useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  HexStack,
  HexaBlockLevel,
  STACK_COLORS,
  GameMode,
  StackDirection,
  HexAxis,
  isBidirectional,
  getAxisDirections,
  DesignedLevel,
  LevelMetrics,
  getDifficultyFromClearability,
  calculateDifficulty,
  calculateFlowZone,
  getSawtoothPosition,
  getExpectedDifficulty,
  estimateLevel,
} from '@/types/hexaBlock';
import {
  AxialCoord,
  HexDirection,
  HEX_DIRECTIONS,
  DIRECTION_ORDER,
  hexKey,
  createHexagonalGrid,
  axialToPixel,
  getHexPolygonPoints,
  getGridBounds,
  isInHexagonalBounds,
  hexAdd,
} from '@/lib/hexGrid';
import { Settings, Play, Trash2, Shuffle, CheckCircle, AlertTriangle, Dices, Circle, Plus, Lightbulb, BarChart3, Target, Activity, TrendingUp, Clock, Users, Percent } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

// Bidirectional axis options
const AXIS_ORDER: HexAxis[] = ['E_W', 'NE_SW', 'SE_NW'];

// All direction options (single + bidirectional)
const ALL_DIRECTIONS: StackDirection[] = [...DIRECTION_ORDER, ...AXIS_ORDER];

// ============================================================================
// Types
// ============================================================================

interface HexBlockLevelDesignerProps {
  onPlayLevel: (level: HexaBlockLevel) => void;
  onAddToCollection?: (level: DesignedLevel) => void;
  levelNumber?: number;
  onLevelNumberChange?: (num: number) => void;
  maxLevelNumber?: number;
  editingLevel?: DesignedLevel | null;
  showMetricsPanel?: boolean;
}

// ============================================================================
// Constants for Metrics
// ============================================================================

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

interface StackConfig {
  direction: HexDirection;
  color: string;
  height: number;
}

// ============================================================================
// Constants
// ============================================================================

const HEX_SIZE = 35;
const STACK_COLOR_OPTIONS = Object.entries(STACK_COLORS);

const DIRECTION_LABELS: Record<StackDirection, string> = {
  NE: '↗',
  E: '→',
  SE: '↘',
  SW: '↙',
  W: '←',
  NW: '↖',
  E_W: '↔',
  NE_SW: '⤢',
  SE_NW: '⤡',
};

const DIRECTION_ANGLES: Record<HexDirection, number> = {
  NE: -60,
  E: 0,
  SE: 60,
  SW: 120,
  W: 180,
  NW: -120,
};

// Angles for bidirectional axes (for rendering)
const AXIS_ANGLES: Record<HexAxis, number> = {
  E_W: 0,
  NE_SW: -60,
  SE_NW: 60,
};

// ============================================================================
// Component
// ============================================================================

export function HexBlockLevelDesigner({
  onPlayLevel,
  onAddToCollection,
  levelNumber = 1,
  onLevelNumberChange,
  maxLevelNumber = 100,
  editingLevel,
  showMetricsPanel = false,
}: HexBlockLevelDesignerProps) {
  // Grid configuration
  const [gridRadius, setGridRadius] = useState(3);

  // Game mode: 'classic' or 'push'
  const [gameMode, setGameMode] = useState<GameMode>('classic');

  // Random generator settings
  const [targetStackCount, setTargetStackCount] = useState(5);
  const [targetDifficulty, setTargetDifficulty] = useState<'any' | 'easy' | 'medium' | 'hard'>('any');

  // Current tool settings
  const [selectedDirection, setSelectedDirection] = useState<StackDirection>('E');
  const [selectedColor, setSelectedColor] = useState<string>(STACK_COLORS.cyan);

  // Edit mode: 'place' to add/remove stacks, 'direction' to change arrows
  const [editMode, setEditMode] = useState<'place' | 'direction'>('place');

  // Placement mode: 'stack' to place stacks, 'hole' to place holes
  const [placementMode, setPlacementMode] = useState<'stack' | 'hole'>('stack');

  // Placed stacks
  const [stacks, setStacks] = useState<Map<string, HexStack>>(new Map());

  // Placed holes
  const [holes, setHoles] = useState<Set<string>>(new Set());

  // Move limit (extra moves beyond optimal)
  const [extraMoves, setExtraMoves] = useState(5);

  // Hover state for preview
  const [hoveredHex, setHoveredHex] = useState<string | null>(null);

  // Generate grid coordinates
  const gridCoords = useMemo(() => createHexagonalGrid(gridRadius), [gridRadius]);

  // Calculate bounds
  const { viewBox, origin, width, height } = useMemo(() => {
    const bounds = getGridBounds(gridCoords, HEX_SIZE);
    const padding = 25;
    const w = bounds.width + padding * 2;
    const h = bounds.height + padding * 2;

    return {
      viewBox: `0 0 ${w} ${h}`,
      origin: { x: -bounds.minX + padding, y: -bounds.minY + padding },
      width: w,
      height: h,
    };
  }, [gridCoords]);

  // Check if a path in a single direction is clear (to edge or hole)
  const isDirectionClear = (
    startCoord: AxialCoord,
    direction: HexDirection,
    currentStacks: Map<string, HexStack>,
    currentHoles: Set<string>
  ): boolean => {
    const dirVec = HEX_DIRECTIONS[direction];
    let current = hexAdd(startCoord, dirVec);

    while (isInHexagonalBounds(current, gridRadius)) {
      const key = hexKey(current);
      // If there's a hole, the stack can fall in - path is clear!
      if (currentHoles.has(key)) {
        return true;
      }
      if (currentStacks.has(key)) {
        return false; // Blocked by another stack
      }
      current = hexAdd(current, dirVec);
    }
    return true; // Clear path to edge
  };

  // Check if a stack can be cleared (has clear path to edge or hole)
  const canClearStack = (stack: HexStack, currentStacks: Map<string, HexStack>, currentHoles: Set<string>): boolean => {
    if (isBidirectional(stack.direction)) {
      // Check both directions for bidirectional arrows
      const [dir1, dir2] = getAxisDirections(stack.direction);
      return isDirectionClear(stack.coord, dir1, currentStacks, currentHoles) || isDirectionClear(stack.coord, dir2, currentStacks, currentHoles);
    } else {
      return isDirectionClear(stack.coord, stack.direction as HexDirection, currentStacks, currentHoles);
    }
  };

  // Check if level is solvable using greedy simulation
  // Optimal moves always equals cell count (each cell = 1 move)
  const solveLevel = (
    initialStacks: Map<string, HexStack>,
    levelHoles: Set<string>
  ): { solvable: boolean; optimalMoves: number; message: string } => {
    if (initialStacks.size === 0) {
      return { solvable: false, optimalMoves: 0, message: 'Add at least one cell' };
    }

    const totalCells = initialStacks.size;

    // Greedy simulation - just check if we can clear all cells
    const remaining = new Map(initialStacks);

    while (remaining.size > 0) {
      let clearedAny = false;

      for (const [key, stack] of remaining) {
        if (canClearStack(stack, remaining, levelHoles)) {
          remaining.delete(key);
          clearedAny = true;
          break;
        }
      }

      if (!clearedAny) {
        return {
          solvable: false,
          optimalMoves: 0,
          message: `Deadlock: ${remaining.size} cells blocked`,
        };
      }
    }

    return {
      solvable: true,
      optimalMoves: totalCells,
      message: `Solvable: ${totalCells} moves`,
    };
  };

  const solvability = solveLevel(stacks, holes);

  // Get valid directions for a stack (directions that lead to grid exit or hole)
  const getValidDirections = useCallback(
    (coord: AxialCoord, currentStacks: Map<string, HexStack>, currentHoles: Set<string>, mode: GameMode): StackDirection[] => {
      const validDirs: StackDirection[] = [];

      // Check single directions
      for (const dir of DIRECTION_ORDER) {
        if (isDirectionClear(coord, dir, currentStacks, currentHoles)) {
          validDirs.push(dir);
        }
      }

      // Check bidirectional axes only in push mode (valid if either direction is clear)
      if (mode === 'push') {
        for (const axis of AXIS_ORDER) {
          const [dir1, dir2] = getAxisDirections(axis);
          if (isDirectionClear(coord, dir1, currentStacks, currentHoles) || isDirectionClear(coord, dir2, currentStacks, currentHoles)) {
            validDirs.push(axis);
          }
        }
      }

      return validDirs;
    },
    [gridRadius]
  );

  // Calculate initial clearability ratio (how many stacks can be cleared immediately)
  const getInitialClearability = (
    stackMap: Map<string, HexStack>,
    levelHoles: Set<string>
  ): number => {
    if (stackMap.size === 0) return 0;
    let clearable = 0;
    for (const stack of stackMap.values()) {
      if (canClearStack(stack, stackMap, levelHoles)) {
        clearable++;
      }
    }
    return clearable / stackMap.size;
  };

  // Check if level matches target difficulty
  const matchesDifficulty = (
    stackMap: Map<string, HexStack>,
    levelHoles: Set<string>,
    difficulty: 'any' | 'easy' | 'medium' | 'hard'
  ): boolean => {
    if (difficulty === 'any') return true;

    const ratio = getInitialClearability(stackMap, levelHoles);

    switch (difficulty) {
      case 'easy':
        return ratio >= 0.5; // 50%+ initially clearable
      case 'medium':
        return ratio >= 0.2 && ratio < 0.5; // 20-50% initially clearable
      case 'hard':
        return ratio > 0 && ratio < 0.2; // <20% initially clearable (but at least 1)
      default:
        return true;
    }
  };

  // Generate a single random level attempt
  const generateSingleLevel = (): Map<string, HexStack> => {
    const newStacks = new Map<string, HexStack>();
    const availableCoords = gridCoords.filter(coord => !holes.has(hexKey(coord)));
    const colors = Object.values(STACK_COLORS);

    // Shuffle available coordinates
    const shuffled = [...availableCoords];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const count = Math.min(targetStackCount, shuffled.length);

    for (let i = 0; i < count; i++) {
      const coord = shuffled[i];
      const key = hexKey(coord);

      // For harder difficulties, prefer directions that are more likely to be blocked
      const validDirs = getValidDirections(coord, newStacks, holes, gameMode);

      if (validDirs.length > 0) {
        let direction: StackDirection;

        if (targetDifficulty === 'hard' || targetDifficulty === 'medium') {
          // Prefer directions that point toward the center (more likely to be blocked)
          const centerDirs = validDirs.filter(d => {
            if (isBidirectional(d)) return true; // Bidirectional has more flexibility
            // Single directions pointing toward center
            const dirVec = HEX_DIRECTIONS[d as HexDirection];
            const nextCoord = hexAdd(coord, dirVec);
            return isInHexagonalBounds(nextCoord, gridRadius);
          });
          const dirsToUse = centerDirs.length > 0 ? centerDirs : validDirs;
          direction = dirsToUse[Math.floor(Math.random() * dirsToUse.length)];
        } else {
          direction = validDirs[Math.floor(Math.random() * validDirs.length)];
        }

        const color = colors[Math.floor(Math.random() * colors.length)];

        const stack: HexStack = {
          id: `stack-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          coord,
          direction,
          color,
          height: 1,
        };

        newStacks.set(key, stack);
      }
    }

    return newStacks;
  };

  // Generate random solvable level with target difficulty
  const generateRandomLevel = useCallback(() => {
    // For large levels, reduce attempts to keep it fast
    const maxAttempts = targetStackCount > 50 ? 10 : 30;
    let bestCandidate: Map<string, HexStack> | null = null;
    let bestDiffMatch = false;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const candidateStacks = generateSingleLevel();

      // Check if solvable
      const result = solveLevel(candidateStacks, holes);

      if (result.solvable) {
        const diffMatch = matchesDifficulty(candidateStacks, holes, targetDifficulty);

        if (diffMatch) {
          // Perfect match - use it immediately
          setStacks(candidateStacks);
          return;
        }

        // Keep track of best solvable level
        if (!bestCandidate || (diffMatch && !bestDiffMatch)) {
          bestCandidate = candidateStacks;
          bestDiffMatch = diffMatch;
        }
      }
    }

    // Use best candidate found, or generate one more
    if (bestCandidate) {
      setStacks(bestCandidate);
    } else {
      setStacks(generateSingleLevel());
    }
  }, [gridCoords, targetStackCount, targetDifficulty, holes, gridRadius]);

  // Handle hex click
  const handleHexClick = (coord: AxialCoord) => {
    const key = hexKey(coord);

    if (editMode === 'direction') {
      // Cycle through directions for existing stack
      if (stacks.has(key)) {
        const stack = stacks.get(key)!;
        let newDirection: StackDirection;

        if (gameMode === 'classic') {
          // Classic mode: only single directions
          // If current is bidirectional, convert to single direction first
          if (isBidirectional(stack.direction)) {
            const [dir1] = getAxisDirections(stack.direction);
            newDirection = dir1;
          } else {
            const currentIndex = DIRECTION_ORDER.indexOf(stack.direction as HexDirection);
            const nextIndex = (currentIndex + 1) % DIRECTION_ORDER.length;
            newDirection = DIRECTION_ORDER[nextIndex];
          }
        } else {
          // Push mode: cycle through all directions including bidirectional
          if (isBidirectional(stack.direction)) {
            // Cycle through bidirectional axes
            const currentIndex = AXIS_ORDER.indexOf(stack.direction);
            const nextIndex = (currentIndex + 1) % AXIS_ORDER.length;
            newDirection = AXIS_ORDER[nextIndex];
          } else {
            // Cycle through single directions
            const currentIndex = DIRECTION_ORDER.indexOf(stack.direction as HexDirection);
            const nextIndex = (currentIndex + 1) % DIRECTION_ORDER.length;
            newDirection = DIRECTION_ORDER[nextIndex];
          }
        }

        const newStacks = new Map(stacks);
        newStacks.set(key, { ...stack, direction: newDirection });
        setStacks(newStacks);
      }
    } else if (placementMode === 'hole') {
      // Hole placement mode
      if (holes.has(key)) {
        // Remove existing hole
        const newHoles = new Set(holes);
        newHoles.delete(key);
        setHoles(newHoles);
      } else if (!stacks.has(key)) {
        // Add hole (only if no stack there)
        const newHoles = new Set(holes);
        newHoles.add(key);
        setHoles(newHoles);
      }
    } else {
      // Stack placement mode
      if (stacks.has(key)) {
        // Remove existing stack
        const newStacks = new Map(stacks);
        newStacks.delete(key);
        setStacks(newStacks);
      } else if (!holes.has(key)) {
        // Add new stack (only if no hole there)
        const newStack: HexStack = {
          id: `stack-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          coord,
          direction: selectedDirection,
          color: selectedColor,
          height: 1,
        };
        const newStacks = new Map(stacks);
        newStacks.set(key, newStack);
        setStacks(newStacks);
      }
    }
  };

  // Clear all stacks and holes
  const clearAll = () => {
    setStacks(new Map());
    setHoles(new Set());
  };

  // Play the level
  const handlePlay = () => {
    // Convert holes set to array of coordinates
    const holeCoords: AxialCoord[] = [];
    holes.forEach(key => {
      const [q, r] = key.split(',').map(Number);
      holeCoords.push({ q, r });
    });

    const level: HexaBlockLevel = {
      id: `custom-${Date.now()}`,
      name: 'Custom Level',
      gridRadius,
      difficulty: 'medium',
      gameMode,
      stacks: Array.from(stacks.values()),
      holes: holeCoords.length > 0 ? holeCoords : undefined,
      parMoves: moveLimit,
    };
    onPlayLevel(level);
  };

  // Add to collection
  const handleAddToCollection = () => {
    if (!onAddToCollection || !solvability.solvable) return;

    const holeCoords: AxialCoord[] = [];
    holes.forEach(key => {
      const [q, r] = key.split(',').map(Number);
      holeCoords.push({ q, r });
    });

    const clearability = getInitialClearability(stacks, holes);
    const difficulty = calculateDifficulty(clearability, stacks.size, moveBufferPercent);
    const sawtoothPosition = getSawtoothPosition(levelNumber);
    const flowZone = calculateFlowZone(difficulty, levelNumber);

    const metrics: LevelMetrics = {
      cellCount: stacks.size,
      holeCount: holes.size,
      optimalMoves: stacks.size,
      moveLimit,
      moveBuffer: extraMoves,
      moveBufferPercent,
      initialClearability: clearability,
      difficulty,
      flowZone,
      sawtoothPosition,
    };

    const designedLevel: DesignedLevel = {
      id: editingLevel?.id || `level-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: `Level ${levelNumber}`,
      levelNumber,
      gridRadius,
      stacks: Array.from(stacks.values()),
      holes: holeCoords.length > 0 ? holeCoords : undefined,
      gameMode,
      metrics,
      createdAt: editingLevel?.createdAt || Date.now(),
    };

    onAddToCollection(designedLevel);
    // Clear the designer after adding
    setStacks(new Map());
    setHoles(new Set());
  };

  // Get expected difficulty for current level position
  const expectedDifficulty = getExpectedDifficulty(levelNumber);
  const currentClearability = getInitialClearability(stacks, holes);

  // Move calculations
  const optimalMoves = stacks.size;
  const moveLimit = optimalMoves + extraMoves;
  const moveBufferPercent = optimalMoves > 0 ? (extraMoves / optimalMoves) * 100 : 0;

  // Difficulty factors in both clearability AND move buffer
  const currentDifficulty = stacks.size > 0 ? calculateDifficulty(currentClearability, stacks.size, moveBufferPercent) : null;

  // Update grid radius (clear stacks and holes outside new bounds)
  const handleRadiusChange = (newRadius: number) => {
    setGridRadius(newRadius);
    // Remove stacks outside new bounds
    const newStacks = new Map<string, HexStack>();
    stacks.forEach((stack, key) => {
      if (isInHexagonalBounds(stack.coord, newRadius)) {
        newStacks.set(key, stack);
      }
    });
    setStacks(newStacks);

    // Remove holes outside new bounds
    const newHoles = new Set<string>();
    holes.forEach(key => {
      const [q, r] = key.split(',').map(Number);
      if (isInHexagonalBounds({ q, r }, newRadius)) {
        newHoles.add(key);
      }
    });
    setHoles(newHoles);
  };

  return (
    <div className="space-y-4">
      {/* Solvability Check - Above Grid */}
      {(() => {
        const clearability = getInitialClearability(stacks, holes);
        const difficultyLabel = clearability >= 0.5 ? 'Easy' : clearability >= 0.2 ? 'Medium' : clearability > 0 ? 'Hard' : '-';
        const difficultyColor = clearability >= 0.5 ? 'text-green-400' : clearability >= 0.2 ? 'text-yellow-400' : 'text-red-400';

        return (
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
              <Badge variant="outline">{stacks.size} cells</Badge>
              {holes.size > 0 && <Badge variant="outline">{holes.size} holes</Badge>}
              {stacks.size > 0 && solvability.solvable && (
                <Badge variant="outline" className={difficultyColor}>
                  {difficultyLabel}
                </Badge>
              )}
            </div>
          </div>
        );
      })()}

      {/* Design Canvas */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Level Designer
          </CardTitle>
          <CardDescription>
            {editMode === 'place' ? 'Click hexes to place/remove stacks' : 'Click stacks to change arrow direction'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Direction & Color Selectors (only in stack place mode) */}
          {editMode === 'place' && placementMode === 'stack' && (
            <div className="space-y-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">Direction</label>
                <div className="flex flex-wrap gap-1">
                  {/* Single directions */}
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
                {/* Bidirectional axes - only in push mode */}
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
                  {STACK_COLOR_OPTIONS.map(([name, color]) => (
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
                  // Reset to single direction if bidirectional was selected
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
                ? 'Blocked stacks bounce back to original position'
                : 'Blocked stacks slide and stop next to the blocker. Bidirectional arrows available.'}
            </p>
          </div>

          <div className="flex justify-center">
            <svg
              viewBox={viewBox}
              className="w-full max-w-sm mx-auto"
              style={{ aspectRatio: `${width} / ${height}` }}
            >
              {/* Grid hexes */}
              {gridCoords.map((coord) => {
                const key = hexKey(coord);
                const pixel = axialToPixel(coord, HEX_SIZE, origin);
                const points = getHexPolygonPoints(pixel, HEX_SIZE);
                const hasStack = stacks.has(key);
                const hasHole = holes.has(key);
                const isHovered = hoveredHex === key;

                // Determine fill color
                let fillColor = 'rgba(255, 255, 255, 0.03)';
                if (hasHole) {
                  fillColor = 'rgba(0, 0, 0, 0.8)';
                } else if (hasStack) {
                  fillColor = 'transparent';
                } else if (isHovered) {
                  fillColor = placementMode === 'hole' ? 'rgba(0, 0, 0, 0.4)' : 'rgba(255, 255, 255, 0.1)';
                }

                return (
                  <g key={key}>
                    <polygon
                      points={points}
                      fill={fillColor}
                      stroke={hasHole ? 'rgba(139, 69, 19, 0.6)' : 'rgba(255, 255, 255, 0.15)'}
                      strokeWidth={hasHole ? 2 : 1}
                      onClick={() => handleHexClick(coord)}
                      onMouseEnter={() => setHoveredHex(key)}
                      onMouseLeave={() => setHoveredHex(null)}
                      style={{ cursor: 'pointer' }}
                    />

                    {/* Hole visual effect */}
                    {hasHole && (
                      <g pointerEvents="none">
                        <circle
                          cx={pixel.x}
                          cy={pixel.y}
                          r={HEX_SIZE * 0.5}
                          fill="rgba(0, 0, 0, 0.9)"
                        />
                        <circle
                          cx={pixel.x}
                          cy={pixel.y}
                          r={HEX_SIZE * 0.65}
                          fill="none"
                          stroke="rgba(60, 40, 20, 0.8)"
                          strokeWidth={5}
                        />
                        <circle
                          cx={pixel.x}
                          cy={pixel.y}
                          r={HEX_SIZE * 0.3}
                          fill="rgba(20, 10, 5, 1)"
                        />
                      </g>
                    )}

                    {/* Preview stack on hover (when no stack/hole exists, in stack place mode) */}
                    {isHovered && !hasStack && !hasHole && editMode === 'place' && placementMode === 'stack' && (
                      <g opacity={0.5} pointerEvents="none">
                        <polygon
                          points={getHexPolygonPoints(pixel, HEX_SIZE * 0.85)}
                          fill={selectedColor}
                          stroke="rgba(0, 0, 0, 0.3)"
                          strokeWidth={1}
                        />
                        <DirectionArrow
                          cx={pixel.x}
                          cy={pixel.y}
                          direction={selectedDirection}
                          size={HEX_SIZE * 0.6}
                        />
                      </g>
                    )}

                    {/* Preview hole on hover (when no stack/hole exists, in hole place mode) */}
                    {isHovered && !hasStack && !hasHole && editMode === 'place' && placementMode === 'hole' && (
                      <g opacity={0.6} pointerEvents="none">
                        <circle
                          cx={pixel.x}
                          cy={pixel.y}
                          r={HEX_SIZE * 0.5}
                          fill="rgba(0, 0, 0, 0.7)"
                        />
                        <circle
                          cx={pixel.x}
                          cy={pixel.y}
                          r={HEX_SIZE * 0.3}
                          fill="rgba(20, 10, 5, 0.8)"
                        />
                      </g>
                    )}
                  </g>
                );
              })}

              {/* Placed stacks */}
              {Array.from(stacks.values()).map((stack) => {
                const key = hexKey(stack.coord);
                const pixel = axialToPixel(stack.coord, HEX_SIZE, origin);
                const canClear = canClearStack(stack, stacks, holes);
                const isStackHovered = hoveredHex === key;

                // Preview next direction when hovering in direction edit mode
                let nextDir: StackDirection;
                if (gameMode === 'classic') {
                  // Classic mode: only single directions
                  if (isBidirectional(stack.direction)) {
                    const [dir1] = getAxisDirections(stack.direction);
                    nextDir = dir1;
                  } else {
                    const currentDirIndex = DIRECTION_ORDER.indexOf(stack.direction as HexDirection);
                    nextDir = DIRECTION_ORDER[(currentDirIndex + 1) % DIRECTION_ORDER.length];
                  }
                } else {
                  // Push mode: all directions including bidirectional
                  if (isBidirectional(stack.direction)) {
                    const currentDirIndex = AXIS_ORDER.indexOf(stack.direction);
                    nextDir = AXIS_ORDER[(currentDirIndex + 1) % AXIS_ORDER.length];
                  } else {
                    const currentDirIndex = DIRECTION_ORDER.indexOf(stack.direction as HexDirection);
                    nextDir = DIRECTION_ORDER[(currentDirIndex + 1) % DIRECTION_ORDER.length];
                  }
                }

                return (
                  <g
                    key={key}
                    onClick={() => handleHexClick(stack.coord)}
                    onMouseEnter={() => setHoveredHex(key)}
                    onMouseLeave={() => setHoveredHex(null)}
                    style={{ cursor: 'pointer' }}
                  >
                    {/* Single hex cell */}
                    <polygon
                      points={getHexPolygonPoints(pixel, HEX_SIZE * 0.85)}
                      fill={stack.color}
                      stroke={isStackHovered && editMode === 'direction' ? 'rgba(255, 255, 255, 0.8)' : 'rgba(0, 0, 0, 0.3)'}
                      strokeWidth={isStackHovered && editMode === 'direction' ? 2 : 1.5}
                    />

                    {/* Direction arrow (show next direction preview in edit mode) */}
                    <DirectionArrow
                      cx={pixel.x}
                      cy={pixel.y}
                      direction={isStackHovered && editMode === 'direction' ? nextDir : stack.direction}
                      size={HEX_SIZE * 0.6}
                      color={
                        isStackHovered && editMode === 'direction'
                          ? '#fbbf24' // Amber for preview
                          : canClear
                            ? '#ffffff'
                            : 'rgba(255, 255, 255, 0.5)'
                      }
                    />

                    {/* Clearable indicator */}
                    {canClear && editMode !== 'direction' && (
                      <circle
                        cx={pixel.x}
                        cy={pixel.y}
                        r={HEX_SIZE * 0.9}
                        fill="none"
                        stroke="rgba(34, 197, 94, 0.5)"
                        strokeWidth={2}
                        strokeDasharray="4 2"
                        pointerEvents="none"
                      />
                    )}

                    {/* Edit mode indicator */}
                    {isStackHovered && editMode === 'direction' && (
                      <text
                        x={pixel.x}
                        y={pixel.y + HEX_SIZE * 0.7}
                        textAnchor="middle"
                        fontSize={10}
                        fill="#fbbf24"
                        pointerEvents="none"
                      >
                        Click to rotate
                      </text>
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
              <span className="text-sm text-muted-foreground">Radius: {gridRadius} ({gridCoords.length} hexes)</span>
            </div>
            <Slider
              value={[gridRadius]}
              onValueChange={([v]) => handleRadiusChange(v)}
              min={2}
              max={6}
              step={1}
            />
          </div>

          {/* Edit Mode Toggle */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Edit Mode</label>
            <div className="flex gap-1">
              <Button
                variant={editMode === 'place' && placementMode === 'stack' ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setEditMode('place');
                  setPlacementMode('stack');
                }}
                className="flex-1"
              >
                Stacks
              </Button>
              <Button
                variant={editMode === 'place' && placementMode === 'hole' ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setEditMode('place');
                  setPlacementMode('hole');
                }}
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
            <p className="text-xs text-muted-foreground">
              {editMode === 'direction'
                ? 'Click stacks to cycle through arrow directions'
                : placementMode === 'hole'
                ? 'Click to add/remove holes (stacks fall into holes)'
                : 'Click to add/remove stacks'}
            </p>
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
                <span className="text-xs text-muted-foreground">Cells</span>
                <span className="text-sm font-medium">{targetStackCount}</span>
              </div>
              <Slider
                value={[targetStackCount]}
                onValueChange={([v]) => setTargetStackCount(v)}
                min={2}
                max={Math.min(100, Math.floor(gridCoords.length * 0.8))}
                step={1}
              />
            </div>
            <div className="space-y-2">
              <span className="text-xs text-muted-foreground">Target Difficulty</span>
              <div className="flex gap-1">
                <Button
                  variant={targetDifficulty === 'any' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTargetDifficulty('any')}
                  className="flex-1 text-xs"
                >
                  Any
                </Button>
                <Button
                  variant={targetDifficulty === 'easy' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTargetDifficulty('easy')}
                  className="flex-1 text-xs"
                >
                  Easy
                </Button>
                <Button
                  variant={targetDifficulty === 'medium' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTargetDifficulty('medium')}
                  className="flex-1 text-xs"
                >
                  Med
                </Button>
                <Button
                  variant={targetDifficulty === 'hard' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTargetDifficulty('hard')}
                  className="flex-1 text-xs"
                >
                  Hard
                </Button>
              </div>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={generateRandomLevel}
              className="w-full"
            >
              <Shuffle className="h-4 w-4 mr-2" />
              Generate Random Level
            </Button>
          </div>

          {/* Level Number & Expected Difficulty */}
          {onAddToCollection && (
            <div className="space-y-3 p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Level Position</label>
                <Badge variant="outline">#{levelNumber}</Badge>
              </div>
              <Slider
                value={[levelNumber]}
                onValueChange={([v]) => onLevelNumberChange?.(v)}
                min={1}
                max={maxLevelNumber}
                step={1}
              />
              <div className="flex items-center gap-2 p-2 bg-background/50 rounded">
                <Lightbulb className="h-4 w-4 text-yellow-500 shrink-0" />
                <div className="text-xs">
                  <span className="text-muted-foreground">Expected: </span>
                  <span className={`font-medium ${
                    expectedDifficulty === 'easy' ? 'text-green-400' :
                    expectedDifficulty === 'medium' ? 'text-yellow-400' :
                    expectedDifficulty === 'hard' ? 'text-orange-400' :
                    'text-red-400'
                  }`}>
                    {expectedDifficulty.charAt(0).toUpperCase() + expectedDifficulty.slice(1)}
                  </span>
                  <span className="text-muted-foreground ml-1">
                    (Position {getSawtoothPosition(levelNumber)} in cycle)
                  </span>
                </div>
              </div>
              {currentDifficulty && currentDifficulty !== expectedDifficulty && (
                <div className="text-xs text-muted-foreground">
                  Current level is <span className={
                    currentDifficulty === 'easy' ? 'text-green-400' :
                    currentDifficulty === 'medium' ? 'text-yellow-400' :
                    currentDifficulty === 'hard' ? 'text-orange-400' :
                    'text-red-400'
                  }>{currentDifficulty}</span>, but position expects {expectedDifficulty}.
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={clearAll}
              disabled={stacks.size === 0}
              className="flex-1"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Clear All
            </Button>
            <Button
              size="sm"
              onClick={handlePlay}
              disabled={!solvability.solvable}
              className="flex-1"
            >
              <Play className="h-4 w-4 mr-2" />
              Play Level
            </Button>
          </div>

          {/* Add to Collection */}
          {onAddToCollection && (
            <Button
              size="sm"
              variant="secondary"
              onClick={handleAddToCollection}
              disabled={!solvability.solvable || stacks.size === 0}
              className="w-full"
            >
              <Plus className="h-4 w-4 mr-2" />
              {editingLevel ? 'Update Level' : 'Add to Collection'}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Embedded Metrics Panel */}
      {showMetricsPanel && (
        <EmbeddedMetricsPanel
          stacks={stacks}
          holes={holes}
          levelNumber={levelNumber}
          solvable={solvability.solvable}
          initialClearability={currentClearability}
          gridRadius={gridRadius}
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
  stacks: Map<string, HexStack>;
  holes: Set<string>;
  levelNumber: number;
  solvable: boolean;
  initialClearability: number;
  gridRadius: number;
  extraMoves: number;
  onExtraMovesChange: (value: number) => void;
}

function EmbeddedMetricsPanel({
  stacks,
  holes,
  levelNumber,
  solvable,
  initialClearability,
  gridRadius,
  extraMoves,
  onExtraMovesChange,
}: EmbeddedMetricsPanelProps) {
  const cellCount = stacks.size;
  const holeCount = holes.size;
  const optimalMoves = cellCount;
  const moveLimit = optimalMoves + extraMoves;
  const moveBufferPercent = optimalMoves > 0 ? (extraMoves / optimalMoves) * 100 : 0;
  const difficulty = calculateDifficulty(initialClearability, cellCount, moveBufferPercent);
  const sawtoothPosition = getSawtoothPosition(levelNumber);
  const expectedDiff = getExpectedDifficulty(levelNumber);
  const flowZone = calculateFlowZone(difficulty, levelNumber);

  // Level time and attempt estimation
  const estimation = cellCount > 0 ? estimateLevel(moveLimit, difficulty, cellCount) : null;

  const flowColors = FLOW_ZONE_COLORS[flowZone];
  const diffColors = DIFFICULTY_BADGE_COLORS[difficulty];
  const expectedColors = DIFFICULTY_BADGE_COLORS[expectedDiff];

  // Design tip based on current state
  let designTip = '';
  if (!solvable) {
    designTip = 'Level is not solvable. Ensure at least one cell has a clear exit path.';
  } else if (cellCount === 0) {
    designTip = 'Add cells to the grid to create a puzzle.';
  } else if (flowZone === 'boredom') {
    designTip = 'Level is easier than expected. Add more blocking cells or change arrow directions toward the center.';
  } else if (flowZone === 'frustration') {
    designTip = 'Level is harder than expected. Add more cells pointing to edges or use bidirectional arrows.';
  } else if (difficulty === expectedDiff) {
    designTip = 'Great! Level difficulty matches the sawtooth pattern for this position.';
  } else {
    designTip = 'Level is in the flow zone. Good balance between challenge and accessibility.';
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <BarChart3 className="h-4 w-4" />
          Level {levelNumber} Metrics
        </CardTitle>
        <CardDescription>
          Position {sawtoothPosition} in 10-level cycle
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Basic Stats */}
        <div className="grid grid-cols-4 gap-2 text-center">
          <div className="p-2 bg-muted/50 rounded-lg">
            <p className="text-2xl font-bold">{cellCount}</p>
            <p className="text-xs text-muted-foreground">Cells</p>
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
            <span className="text-sm">
              +{extraMoves} ({moveBufferPercent.toFixed(0)}%)
            </span>
          </div>
          <Slider
            value={[extraMoves]}
            onValueChange={([v]) => onExtraMovesChange(v)}
            min={0}
            max={Math.max(20, optimalMoves)}
            step={1}
          />
          <p className="text-xs text-muted-foreground">
            More buffer = easier level. {optimalMoves} minimum + {extraMoves} extra = {moveLimit} total moves allowed.
          </p>
        </div>

        {/* Clearability Progress */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Initial Clearability</span>
            <span className="font-medium">{(initialClearability * 100).toFixed(0)}%</span>
          </div>
          <Progress value={initialClearability * 100} className="h-2" />
          <p className="text-xs text-muted-foreground">
            {Math.round(initialClearability * cellCount)} of {cellCount} cells clearable at start
          </p>
        </div>

        {/* Difficulty Comparison */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <Target className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Difficulty</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Actual</span>
                <Badge className={`${diffColors.bg} ${diffColors.text}`}>
                  {difficulty === 'superHard' ? 'Super Hard' : difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Expected (Sawtooth)</span>
                <Badge variant="outline" className={expectedColors.text}>
                  {expectedDiff === 'superHard' ? 'Super Hard' : expectedDiff.charAt(0).toUpperCase() + expectedDiff.slice(1)}
                </Badge>
              </div>
            </div>
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
          <p className="text-xs text-muted-foreground mt-1">
            {flowZone === 'flow' && 'Difficulty matches player progression expectation'}
            {flowZone === 'boredom' && 'Easier than expected - players may disengage'}
            {flowZone === 'frustration' && 'Harder than expected - players may get stuck'}
          </p>
        </div>

        {/* Level Estimation */}
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

        {/* Sawtooth Position Visual */}
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
                    isActive
                      ? `${colors.bg} ${colors.text} ring-2 ring-white`
                      : 'bg-muted/30 text-muted-foreground'
                  }`}
                >
                  {pos}
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Recovery</span>
            <span>Spike</span>
            <span>Peak</span>
          </div>
        </div>

        {/* Design Tip */}
        <div className="p-3 bg-muted/30 rounded-lg">
          <div className="flex items-start gap-2">
            <Lightbulb className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">{designTip}</p>
          </div>
        </div>

        {/* Difficulty Calculation Explanation */}
        <div className="p-3 bg-muted/20 rounded-lg text-xs text-muted-foreground">
          <p className="font-medium text-foreground mb-1">How Difficulty is Calculated:</p>
          <p className="mb-2"><strong>Move Buffer</strong> is the primary factor. Clearability sets the base.</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="font-medium text-foreground/80">Clearability (base):</p>
              <ul className="mt-0.5 space-y-0">
                <li>≥50% = Easy</li>
                <li>20-50% = Medium</li>
                <li>5-20% = Hard</li>
                <li>&lt;5% = Super Hard</li>
              </ul>
            </div>
            <div>
              <p className="font-medium text-foreground/80">Buffer (major impact):</p>
              <ul className="mt-0.5 space-y-0">
                <li>≥100% = much easier (-2)</li>
                <li>60-100% = easier (-1)</li>
                <li>40-60% = normal</li>
                <li>25-40% = harder (+1)</li>
                <li>15-25% = hard (+2)</li>
                <li>&lt;15% = very hard (+3)</li>
              </ul>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface DirectionArrowProps {
  cx: number;
  cy: number;
  direction: StackDirection;
  size: number;
  color?: string;
}

function DirectionArrow({ cx, cy, direction, size, color = '#ffffff' }: DirectionArrowProps) {
  // Increased sizes for better visibility
  const arrowLength = size * 0.7;
  const arrowHeadSize = size * 0.35;
  const strokeWidth = 3;
  const outlineWidth = strokeWidth + 2;

  if (isBidirectional(direction)) {
    // Bidirectional arrow (double-headed)
    const angle = AXIS_ANGLES[direction];
    const lineStart = -arrowLength * 0.35;
    const lineEnd = arrowLength * 0.35;

    return (
      <g transform={`translate(${cx}, ${cy}) rotate(${angle})`}>
        {/* Dark outline for contrast */}
        <line
          x1={lineStart}
          y1={0}
          x2={lineEnd}
          y2={0}
          stroke="rgba(0, 0, 0, 0.6)"
          strokeWidth={outlineWidth}
          strokeLinecap="round"
        />
        {/* Right arrowhead outline */}
        <polygon
          points={`${lineEnd - arrowHeadSize * 0.7},${-arrowHeadSize * 0.5} ${lineEnd + 3},0 ${lineEnd - arrowHeadSize * 0.7},${arrowHeadSize * 0.5}`}
          fill="rgba(0, 0, 0, 0.6)"
          stroke="rgba(0, 0, 0, 0.6)"
          strokeWidth={2}
          strokeLinejoin="round"
        />
        {/* Left arrowhead outline */}
        <polygon
          points={`${lineStart + arrowHeadSize * 0.7},${-arrowHeadSize * 0.5} ${lineStart - 3},0 ${lineStart + arrowHeadSize * 0.7},${arrowHeadSize * 0.5}`}
          fill="rgba(0, 0, 0, 0.6)"
          stroke="rgba(0, 0, 0, 0.6)"
          strokeWidth={2}
          strokeLinejoin="round"
        />

        {/* Main line */}
        <line
          x1={lineStart}
          y1={0}
          x2={lineEnd}
          y2={0}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {/* Right arrowhead - filled */}
        <polygon
          points={`${lineEnd - arrowHeadSize * 0.7},${-arrowHeadSize * 0.5} ${lineEnd + 3},0 ${lineEnd - arrowHeadSize * 0.7},${arrowHeadSize * 0.5}`}
          fill={color}
          stroke={color}
          strokeWidth={1}
          strokeLinejoin="round"
        />
        {/* Left arrowhead - filled */}
        <polygon
          points={`${lineStart + arrowHeadSize * 0.7},${-arrowHeadSize * 0.5} ${lineStart - 3},0 ${lineStart + arrowHeadSize * 0.7},${arrowHeadSize * 0.5}`}
          fill={color}
          stroke={color}
          strokeWidth={1}
          strokeLinejoin="round"
        />
      </g>
    );
  }

  // Single direction arrow
  const angle = DIRECTION_ANGLES[direction as HexDirection];
  const lineStart = -arrowLength * 0.3;
  const lineEnd = arrowLength * 0.35;

  return (
    <g transform={`translate(${cx}, ${cy}) rotate(${angle})`}>
      {/* Dark outline for contrast */}
      <line
        x1={lineStart}
        y1={0}
        x2={lineEnd}
        y2={0}
        stroke="rgba(0, 0, 0, 0.6)"
        strokeWidth={outlineWidth}
        strokeLinecap="round"
      />
      {/* Arrowhead outline */}
      <polygon
        points={`${lineEnd - arrowHeadSize * 0.7},${-arrowHeadSize * 0.55} ${lineEnd + 3},0 ${lineEnd - arrowHeadSize * 0.7},${arrowHeadSize * 0.55}`}
        fill="rgba(0, 0, 0, 0.6)"
        stroke="rgba(0, 0, 0, 0.6)"
        strokeWidth={2}
        strokeLinejoin="round"
      />

      {/* Main line */}
      <line
        x1={lineStart}
        y1={0}
        x2={lineEnd}
        y2={0}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      {/* Arrowhead - filled */}
      <polygon
        points={`${lineEnd - arrowHeadSize * 0.7},${-arrowHeadSize * 0.55} ${lineEnd + 3},0 ${lineEnd - arrowHeadSize * 0.7},${arrowHeadSize * 0.55}`}
        fill={color}
        stroke={color}
        strokeWidth={1}
        strokeLinejoin="round"
      />
    </g>
  );
}

// ============================================================================
// Utilities
// ============================================================================

function adjustBrightness(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.max(0, Math.min(255, (num >> 16) + amt));
  const G = Math.max(0, Math.min(255, ((num >> 8) & 0x00ff) + amt));
  const B = Math.max(0, Math.min(255, (num & 0x0000ff) + amt));
  return `#${(0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1)}`;
}
