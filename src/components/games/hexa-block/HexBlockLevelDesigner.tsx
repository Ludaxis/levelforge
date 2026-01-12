'use client';

import { useState, useMemo, useCallback, useRef } from 'react';
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
  Carousel,
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
  generateStackId,
  generateCarouselId,
  sortArmsClockwise,
  CLOCKWISE_DIRECTIONS,
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
  hexEquals,
  getMinBlocksAhead,
  getBlocksAheadColor,
  getBlocksAheadOpacity,
} from '@/lib/hexGrid';
import { Settings, Play, Trash2, Shuffle, CheckCircle, AlertTriangle, Dices, Circle, Plus, Lightbulb, BarChart3, Target, Activity, TrendingUp, Clock, Users, Percent, Eye, EyeOff, Download, Upload, Copy, Share2, Grid3X3, Sparkles } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { LEVEL_TEMPLATES, LevelTemplate } from '@/lib/hexLevelTemplates';
import { encodeLevel, decodeLevel, downloadLevelJSON, copyToClipboard, importLevelFromJSON } from '@/lib/levelCodec';

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

  // Placement mode: 'stack' to place stacks, 'hole' to place holes, 'pause' to place pause cells, 'carousel' to place carousels
  const [placementMode, setPlacementMode] = useState<'stack' | 'hole' | 'pause' | 'carousel'>('stack');

  // Placed stacks
  const [stacks, setStacks] = useState<Map<string, HexStack>>(new Map());

  // Placed holes
  const [holes, setHoles] = useState<Set<string>>(new Set());

  // Placed pause cells
  const [pauses, setPauses] = useState<Set<string>>(new Set());

  // Placed carousels (keyed by coord key)
  const [carousels, setCarousels] = useState<Map<string, Carousel>>(new Map());

  // Selected carousel arms for placement (2-6 directions)
  const [selectedCarouselArms, setSelectedCarouselArms] = useState<Set<HexDirection>>(new Set(['E', 'W']));

  // Move limit (extra moves beyond optimal)
  const [extraMoves, setExtraMoves] = useState(5);

  // Hover state for preview
  const [hoveredHex, setHoveredHex] = useState<string | null>(null);

  // Blocks Ahead visualization toggle
  const [showBlocksAhead, setShowBlocksAhead] = useState(false);

  // Share code modal state
  const [shareCode, setShareCode] = useState<string | null>(null);
  const [importCode, setImportCode] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);

  // File input ref for importing JSON
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Get path info for a single direction (returns blocking info and destination)
  const getDirectionPathInfo = (
    startCoord: AxialCoord,
    direction: HexDirection,
    currentStacks: Map<string, HexStack>,
    currentHoles: Set<string>,
    currentPauses?: Set<string>
  ): {
    blocked: boolean;
    lastFreeCoord: AxialCoord;
    holeCoord: AxialCoord | null;
    pauseCoord: AxialCoord | null;
    pathLength: number;
  } => {
    const dirVec = HEX_DIRECTIONS[direction];
    let current = hexAdd(startCoord, dirVec);
    let lastFreeCoord = startCoord;
    let pathLength = 0;

    while (isInHexagonalBounds(current, gridRadius)) {
      const key = hexKey(current);

      // Check if there's a hole - stack falls in
      if (currentHoles.has(key)) {
        return { blocked: false, lastFreeCoord: current, holeCoord: current, pauseCoord: null, pathLength: pathLength + 1 };
      }

      // Check if there's a pause cell - stack stops here
      if (currentPauses?.has(key)) {
        return { blocked: false, lastFreeCoord: current, holeCoord: null, pauseCoord: current, pathLength: pathLength + 1 };
      }

      // Check if blocked by another stack
      if (currentStacks.has(key)) {
        return { blocked: true, lastFreeCoord, holeCoord: null, pauseCoord: null, pathLength };
      }

      lastFreeCoord = current;
      pathLength++;
      current = hexAdd(current, dirVec);
    }

    return { blocked: false, lastFreeCoord, holeCoord: null, pauseCoord: null, pathLength };
  };

  // Check if a stack can be cleared (has clear path to edge or hole, not blocked by pause)
  const canClearStack = (
    stack: HexStack,
    currentStacks: Map<string, HexStack>,
    currentHoles: Set<string>,
    currentPauses?: Set<string>
  ): boolean => {
    if (isBidirectional(stack.direction)) {
      const [dir1, dir2] = getAxisDirections(stack.direction);
      const path1 = getDirectionPathInfo(stack.coord, dir1, currentStacks, currentHoles, currentPauses);
      const path2 = getDirectionPathInfo(stack.coord, dir2, currentStacks, currentHoles, currentPauses);
      // Can clear if not blocked and no pause in the way
      const canExit1 = (!path1.blocked && !path1.pauseCoord) || path1.holeCoord !== null;
      const canExit2 = (!path2.blocked && !path2.pauseCoord) || path2.holeCoord !== null;
      return canExit1 || canExit2;
    } else {
      const path = getDirectionPathInfo(stack.coord, stack.direction as HexDirection, currentStacks, currentHoles, currentPauses);
      // Can clear if not blocked, no pause, or has hole
      return (!path.blocked && !path.pauseCoord) || path.holeCoord !== null;
    }
  };

  // Check if a stack can move at all (for push mode - even blocked stacks can move)
  const canMoveStack = (stack: HexStack, currentStacks: Map<string, HexStack>, currentHoles: Set<string>): boolean => {
    if (isBidirectional(stack.direction)) {
      const [dir1, dir2] = getAxisDirections(stack.direction);
      const path1 = getDirectionPathInfo(stack.coord, dir1, currentStacks, currentHoles);
      const path2 = getDirectionPathInfo(stack.coord, dir2, currentStacks, currentHoles);
      return path1.pathLength > 0 || path2.pathLength > 0;
    } else {
      const path = getDirectionPathInfo(stack.coord, stack.direction as HexDirection, currentStacks, currentHoles);
      return path.pathLength > 0;
    }
  };

  // Get the best move result for a stack (handles bidirectional and pauses)
  const getStackMoveResult = (
    stack: HexStack,
    currentStacks: Map<string, HexStack>,
    currentHoles: Set<string>,
    currentPauses?: Set<string>
  ): { cleared: boolean; newCoord: AxialCoord | null; pausedAt: AxialCoord | null } => {
    if (isBidirectional(stack.direction)) {
      const [dir1, dir2] = getAxisDirections(stack.direction);
      const path1 = getDirectionPathInfo(stack.coord, dir1, currentStacks, currentHoles, currentPauses);
      const path2 = getDirectionPathInfo(stack.coord, dir2, currentStacks, currentHoles, currentPauses);

      // Check which direction can exit (not blocked, no pause, or has hole)
      const canExit1 = (!path1.blocked && !path1.pauseCoord) || path1.holeCoord !== null;
      const canExit2 = (!path2.blocked && !path2.pauseCoord) || path2.holeCoord !== null;

      // Prefer direction that clears
      if (canExit1 && !canExit2) {
        return { cleared: true, newCoord: null, pausedAt: null };
      } else if (!canExit1 && canExit2) {
        return { cleared: true, newCoord: null, pausedAt: null };
      } else if (canExit1 && canExit2) {
        return { cleared: true, newCoord: null, pausedAt: null };
      } else {
        // Check if either direction hits a pause
        if (path1.pauseCoord && !path2.pauseCoord) {
          return { cleared: false, newCoord: path1.pauseCoord, pausedAt: path1.pauseCoord };
        } else if (path2.pauseCoord && !path1.pauseCoord) {
          return { cleared: false, newCoord: path2.pauseCoord, pausedAt: path2.pauseCoord };
        } else if (path1.pauseCoord && path2.pauseCoord) {
          // Both have pause - pick closer one
          const bestPath = path1.pathLength <= path2.pathLength ? path1 : path2;
          return { cleared: false, newCoord: bestPath.pauseCoord, pausedAt: bestPath.pauseCoord };
        }
        // Both blocked in push mode - pick longer path for movement
        const bestPath = path1.pathLength >= path2.pathLength ? path1 : path2;
        if (bestPath.pathLength > 0) {
          return { cleared: false, newCoord: bestPath.lastFreeCoord, pausedAt: null };
        }
        return { cleared: false, newCoord: null, pausedAt: null };
      }
    } else {
      const path = getDirectionPathInfo(stack.coord, stack.direction as HexDirection, currentStacks, currentHoles, currentPauses);

      // Check for pause first
      if (path.pauseCoord) {
        return { cleared: false, newCoord: path.pauseCoord, pausedAt: path.pauseCoord };
      }

      if (!path.blocked || path.holeCoord !== null) {
        return { cleared: true, newCoord: null, pausedAt: null };
      }
      if (path.pathLength > 0) {
        return { cleared: false, newCoord: path.lastFreeCoord, pausedAt: null };
      }
      return { cleared: false, newCoord: null, pausedAt: null };
    }
  };

  // Check if level is solvable using simulation
  const solveLevel = (
    initialStacks: Map<string, HexStack>,
    levelHoles: Set<string>,
    levelPauses?: Set<string>,
    levelCarousels?: Map<string, Carousel>
  ): { solvable: boolean; optimalMoves: number; pauseEncounters: number; message: string } => {
    if (initialStacks.size === 0) {
      return { solvable: false, optimalMoves: 0, pauseEncounters: 0, message: 'Add at least one cell' };
    }

    const totalCells = initialStacks.size;
    const remaining = new Map(initialStacks);
    const pausedStackIds = new Set<string>(); // Track stacks currently paused
    let moves = 0;
    let pauseEncounters = 0;
    const maxMoves = totalCells * 30; // Safety limit for push mode iterations (increased for carousel handling)

    // Helper to simulate carousel rotation
    const rotateCarousel = (carousel: Carousel, stackMap: Map<string, HexStack>): Map<string, HexStack> => {
      const newStacks = new Map(stackMap);
      const arms = carousel.arms;
      if (arms.length < 2) return newStacks;

      // Get stacks at arm positions
      const armCoords = arms.map(dir => hexAdd(carousel.coord, HEX_DIRECTIONS[dir]));
      const stacksOnArms: (HexStack | null)[] = armCoords.map(armCoord => {
        const armKey = hexKey(armCoord);
        return newStacks.get(armKey) || null;
      });

      // Check if there are any stacks to rotate
      const hasStacks = stacksOnArms.some(s => s !== null);
      if (!hasStacks) return newStacks;

      // Remove all stacks from arm positions
      for (const armCoord of armCoords) {
        const armKey = hexKey(armCoord);
        newStacks.delete(armKey);
      }

      // Place stacks in their new positions (rotated clockwise)
      for (let i = 0; i < stacksOnArms.length; i++) {
        const stack = stacksOnArms[i];
        if (stack) {
          const nextIndex = (i + 1) % arms.length;
          const newCoord = armCoords[nextIndex];
          const newKey = hexKey(newCoord);
          newStacks.set(newKey, { ...stack, coord: newCoord });
        }
      }

      return newStacks;
    };

    // Helper to check if carousel rotation would make progress
    const wouldCarouselHelp = (carousel: Carousel, stackMap: Map<string, HexStack>): boolean => {
      const rotated = rotateCarousel(carousel, stackMap);
      // Check if any stack becomes clearable after rotation
      for (const stack of rotated.values()) {
        if (canClearStack(stack, rotated, levelHoles, levelPauses)) {
          return true;
        }
      }
      // Check if stacks changed position (some progress)
      for (const [key, stack] of stackMap) {
        const rotatedStack = rotated.get(key);
        if (!rotatedStack || !hexEquals(stack.coord, rotatedStack.coord)) {
          return true; // Stack moved
        }
      }
      return false;
    };

    while (remaining.size > 0 && moves < maxMoves) {
      let madeProgress = false;

      // First, try to clear paused stacks (they get priority since they need a second tap)
      for (const [key, stack] of remaining) {
        if (pausedStackIds.has(stack.id)) {
          // Paused stack - check if it can now be cleared (simulate second tap)
          // For paused stacks, check the path WITHOUT pause cells (they already passed through)
          if (canClearStack(stack, remaining, levelHoles)) {
            remaining.delete(key);
            pausedStackIds.delete(stack.id);
            moves++;
            madeProgress = true;
            break;
          }
        }
      }

      // If no paused stack was cleared, try to find a non-paused stack that can be cleared
      if (!madeProgress) {
        for (const [key, stack] of remaining) {
          if (pausedStackIds.has(stack.id)) continue; // Skip paused stacks
          if (canClearStack(stack, remaining, levelHoles, levelPauses)) {
            remaining.delete(key);
            moves++;
            madeProgress = true;
            break;
          }
        }
      }

      // If nothing can be cleared directly, try to move stacks (push mode or to pause cells)
      if (!madeProgress) {
        for (const [key, stack] of remaining) {
          if (pausedStackIds.has(stack.id)) {
            // Paused stack that can't clear - try to move it further
            const result = getStackMoveResult(stack, remaining, levelHoles, levelPauses);
            if (result.newCoord && !hexEquals(result.newCoord, stack.coord)) {
              remaining.delete(key);
              const movedStack = { ...stack, coord: result.newCoord };
              remaining.set(hexKey(result.newCoord), movedStack);
              if (result.pausedAt) {
                pauseEncounters++;
              } else {
                pausedStackIds.delete(stack.id); // No longer paused if moved normally
              }
              moves++;
              madeProgress = true;
              break;
            }
          } else {
            // Non-paused stack - check if it moves to a pause or can move in push mode
            const result = getStackMoveResult(stack, remaining, levelHoles, levelPauses);
            if (result.pausedAt) {
              // Stack will stop at pause cell
              remaining.delete(key);
              const movedStack = { ...stack, coord: result.pausedAt };
              remaining.set(hexKey(result.pausedAt), movedStack);
              pausedStackIds.add(stack.id);
              pauseEncounters++;
              moves++;
              madeProgress = true;
              break;
            } else if (gameMode === 'push' && result.newCoord && !hexEquals(result.newCoord, stack.coord)) {
              // Push mode movement
              remaining.delete(key);
              const movedStack = { ...stack, coord: result.newCoord };
              remaining.set(hexKey(result.newCoord), movedStack);
              moves++;
              madeProgress = true;
              break;
            }
          }
        }
      }

      // If still no progress, try carousel rotations
      if (!madeProgress && levelCarousels && levelCarousels.size > 0) {
        for (const carousel of levelCarousels.values()) {
          if (wouldCarouselHelp(carousel, remaining)) {
            // Apply carousel rotation
            const rotated = rotateCarousel(carousel, remaining);
            remaining.clear();
            for (const [key, stack] of rotated) {
              remaining.set(key, stack);
            }
            moves++;
            madeProgress = true;
            break;
          }
        }
      }

      if (!madeProgress) {
        return {
          solvable: false,
          optimalMoves: 0,
          pauseEncounters,
          message: `Deadlock: ${remaining.size} cells blocked`,
        };
      }
    }

    if (remaining.size > 0) {
      return {
        solvable: false,
        optimalMoves: 0,
        pauseEncounters,
        message: `Could not solve: ${remaining.size} cells remaining`,
      };
    }

    return {
      solvable: true,
      optimalMoves: moves,
      pauseEncounters,
      message: `Solvable: ${moves} moves${pauseEncounters > 0 ? ` (${pauseEncounters} pause${pauseEncounters > 1 ? 's' : ''})` : ''}`,
    };
  };

  const solvability = solveLevel(stacks, holes, pauses, carousels);

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

      // Check if solvable (no pauses in generated levels initially)
      const result = solveLevel(candidateStacks, holes, pauses);

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

  // Calculate blocks ahead for all stacks (for visualization)
  const blocksAheadMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const [key, stack] of stacks) {
      const blocksAhead = getMinBlocksAhead(
        stack.coord,
        stack.direction,
        stacks,
        holes,
        gridRadius,
        (dir: StackDirection) => isBidirectional(dir),
        (axis: StackDirection) => getAxisDirections(axis as HexAxis)
      );
      map.set(key, blocksAhead);
    }
    return map;
  }, [stacks, holes, gridRadius]);

  // Smart Fill: Fill all empty cells while maintaining solvability
  const smartFillLevel = useCallback(() => {
    // Get all empty cells (not holes, not occupied)
    const emptyCoords = gridCoords.filter(
      (coord) => !holes.has(hexKey(coord)) && !stacks.has(hexKey(coord))
    );

    // Shuffle for randomness
    const shuffled = [...emptyCoords];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const colors = Object.values(STACK_COLORS);
    let newStacks = new Map(stacks);

    for (const coord of shuffled) {
      const key = hexKey(coord);

      // Try each direction and find one that keeps level solvable
      const directions: StackDirection[] = [...DIRECTION_ORDER];
      if (gameMode === 'push') {
        directions.push(...AXIS_ORDER);
      }

      // Shuffle directions for variety
      for (let i = directions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [directions[i], directions[j]] = [directions[j], directions[i]];
      }

      for (const dir of directions) {
        const testStack: HexStack = {
          id: generateStackId(),
          coord,
          direction: dir,
          color: colors[Math.floor(Math.random() * colors.length)],
          height: 1,
        };

        const testStacks = new Map(newStacks);
        testStacks.set(key, testStack);

        // Check if still solvable
        const result = solveLevel(testStacks, holes, pauses);
        if (result.solvable) {
          newStacks = testStacks;
          break; // Successfully placed a stack
        }
      }
    }

    setStacks(newStacks);
  }, [gridCoords, stacks, holes, gameMode]);

  // Apply a level template (ensures solvability)
  const applyTemplate = useCallback((template: LevelTemplate) => {
    const { stacks: templateStacks, holes: templateHoles } = template.generate(gridRadius, gameMode);

    // Convert holes to Set (stays constant)
    const newHoles = new Set<string>();
    for (const hole of templateHoles) {
      newHoles.add(hexKey(hole));
    }

    // Helper: convert stacks array to Map
    const stacksToMap = (stacksArr: HexStack[]): Map<string, HexStack> => {
      const map = new Map<string, HexStack>();
      for (const stack of stacksArr) {
        map.set(hexKey(stack.coord), stack);
      }
      return map;
    };

    // Helper: check solvability (inline version of solveLevel)
    const checkSolvable = (stacksMap: Map<string, HexStack>, holesSet: Set<string>): boolean => {
      if (stacksMap.size === 0) return false;

      const remaining = new Map(stacksMap);
      const maxMoves = stacksMap.size * 10;
      let moves = 0;

      while (remaining.size > 0 && moves < maxMoves) {
        let madeProgress = false;

        // Try to find a stack that can be cleared
        for (const [key, stack] of remaining) {
          if (canClearStack(stack, remaining, holesSet)) {
            remaining.delete(key);
            moves++;
            madeProgress = true;
            break;
          }
        }

        // In push mode, try moving blocked stacks
        if (!madeProgress && gameMode === 'push') {
          for (const [key, stack] of remaining) {
            const result = getStackMoveResult(stack, remaining, holesSet);
            if (result.newCoord && !hexEquals(result.newCoord, stack.coord)) {
              remaining.delete(key);
              const movedStack = { ...stack, coord: result.newCoord };
              remaining.set(hexKey(result.newCoord), movedStack);
              moves++;
              madeProgress = true;
              break;
            }
          }
        }

        if (!madeProgress) return false;
      }

      return remaining.size === 0;
    };

    // Helper: get all valid directions for a given position
    const getValidDirsForCoord = (coord: AxialCoord, stacksMap: Map<string, HexStack>, holesSet: Set<string>): StackDirection[] => {
      const validDirs: StackDirection[] = [];

      // Check single directions
      for (const dir of DIRECTION_ORDER) {
        if (isDirectionClear(coord, dir, stacksMap, holesSet)) {
          validDirs.push(dir);
        }
      }

      // In push mode, also allow bidirectional axes
      if (gameMode === 'push') {
        for (const axis of AXIS_ORDER) {
          const [dir1, dir2] = getAxisDirections(axis);
          // Allow axis if at least one direction has some path
          const path1 = getDirectionPathInfo(coord, dir1, stacksMap, holesSet);
          const path2 = getDirectionPathInfo(coord, dir2, stacksMap, holesSet);
          if (!path1.blocked || !path2.blocked || path1.pathLength > 0 || path2.pathLength > 0) {
            validDirs.push(axis);
          }
        }
      }

      return validDirs;
    };

    // First, try the original template directions
    const originalMap = stacksToMap(templateStacks);
    if (checkSolvable(originalMap, newHoles)) {
      setStacks(originalMap);
      setHoles(newHoles);
      return;
    }

    // If not solvable, try randomizing directions
    const maxAttempts = 100;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const randomizedStacks: HexStack[] = templateStacks.map(stack => {
        // Build a temporary map without this stack to check valid directions
        const tempMap = new Map<string, HexStack>();
        for (const s of templateStacks) {
          if (s.id !== stack.id) {
            tempMap.set(hexKey(s.coord), s);
          }
        }

        const validDirs = getValidDirsForCoord(stack.coord, tempMap, newHoles);

        // Pick a random valid direction, or random from all if none valid
        let newDir: StackDirection;
        if (validDirs.length > 0) {
          newDir = validDirs[Math.floor(Math.random() * validDirs.length)];
        } else {
          const allDirs = gameMode === 'push' ? ALL_DIRECTIONS : DIRECTION_ORDER;
          newDir = allDirs[Math.floor(Math.random() * allDirs.length)];
        }

        return { ...stack, direction: newDir };
      });

      const randomMap = stacksToMap(randomizedStacks);
      if (checkSolvable(randomMap, newHoles)) {
        setStacks(randomMap);
        setHoles(newHoles);
        return;
      }
    }

    // If still not solvable after max attempts, use the original (user can adjust manually)
    setStacks(originalMap);
    setHoles(newHoles);
  }, [gridRadius, gameMode, canClearStack, getStackMoveResult, isDirectionClear, getDirectionPathInfo]);

  // Generate share code
  const generateShareCode = useCallback(() => {
    const code = encodeLevel(gridRadius, gameMode, stacks, holes);
    setShareCode(code);
    setCopySuccess(false);
  }, [gridRadius, gameMode, stacks, holes]);

  // Copy share code to clipboard
  const handleCopyCode = useCallback(async () => {
    if (shareCode) {
      const success = await copyToClipboard(shareCode);
      setCopySuccess(success);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  }, [shareCode]);

  // Import from share code
  const handleImportCode = useCallback(() => {
    if (!importCode.trim()) return;

    const decoded = decodeLevel(importCode.trim());
    if (decoded) {
      // Convert stacks to Map
      const newStacks = new Map<string, HexStack>();
      for (const stack of decoded.stacks) {
        newStacks.set(hexKey(stack.coord), stack);
      }

      // Convert holes to Set
      const newHoles = new Set<string>();
      for (const hole of decoded.holes) {
        newHoles.add(hexKey(hole));
      }

      setGridRadius(decoded.gridRadius);
      setGameMode(decoded.gameMode);
      setStacks(newStacks);
      setHoles(newHoles);
      setImportCode('');
      setShareCode(null);
    } else {
      alert('Invalid level code');
    }
  }, [importCode]);

  // Export level as JSON
  const handleExportJSON = useCallback(() => {
    if (stacks.size === 0) return;

    const holeCoords: AxialCoord[] = [];
    holes.forEach((key) => {
      const [q, r] = key.split(',').map(Number);
      holeCoords.push({ q, r });
    });

    const optMoves = stacks.size;
    const moveLim = optMoves + extraMoves;
    const bufferPercent = optMoves > 0 ? (extraMoves / optMoves) * 100 : 0;

    const clearability = getInitialClearability(stacks, holes);
    const difficulty = calculateDifficulty(clearability, stacks.size, bufferPercent);
    const sawtoothPosition = getSawtoothPosition(levelNumber);
    const flowZone = calculateFlowZone(difficulty, levelNumber);

    const metrics: LevelMetrics = {
      cellCount: stacks.size,
      holeCount: holes.size,
      pauseCount: pauses.size,
      carouselCount: carousels.size,
      optimalMoves: optMoves,
      moveLimit: moveLim,
      moveBuffer: extraMoves,
      moveBufferPercent: bufferPercent,
      initialClearability: clearability,
      difficulty,
      flowZone,
      sawtoothPosition,
    };

    const pauseCoords = Array.from(pauses).map(key => {
      const [q, r] = key.split(',').map(Number);
      return { q, r };
    });

    const carouselArray = Array.from(carousels.values());

    const designedLevel: DesignedLevel = {
      id: `level-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: `Level ${levelNumber}`,
      levelNumber,
      gridRadius,
      stacks: Array.from(stacks.values()),
      holes: holeCoords.length > 0 ? holeCoords : undefined,
      pauses: pauseCoords.length > 0 ? pauseCoords : undefined,
      carousels: carouselArray.length > 0 ? carouselArray : undefined,
      gameMode,
      metrics,
      createdAt: Date.now(),
    };

    downloadLevelJSON(designedLevel);
  }, [stacks, holes, pauses, carousels, gridRadius, gameMode, levelNumber, extraMoves]);

  // Import level from JSON file
  const handleImportJSON = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        const imported = importLevelFromJSON(json);

        if (imported) {
          // Convert stacks to Map
          const newStacks = new Map<string, HexStack>();
          for (const stack of imported.stacks) {
            newStacks.set(hexKey(stack.coord), stack);
          }

          // Convert holes to Set
          const newHoles = new Set<string>();
          if (imported.holes) {
            for (const hole of imported.holes) {
              newHoles.add(hexKey(hole));
            }
          }

          setGridRadius(imported.gridRadius);
          setGameMode(imported.gameMode);
          setStacks(newStacks);
          setHoles(newHoles);
        } else {
          alert('Invalid level file format');
        }
      } catch {
        alert('Failed to parse level file');
      }
    };
    reader.readAsText(file);

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

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
      } else if (!stacks.has(key) && !pauses.has(key)) {
        // Add hole (only if no stack or pause there)
        const newHoles = new Set(holes);
        newHoles.add(key);
        setHoles(newHoles);
      }
    } else if (placementMode === 'pause') {
      // Pause cell placement mode
      if (pauses.has(key)) {
        // Remove existing pause
        const newPauses = new Set(pauses);
        newPauses.delete(key);
        setPauses(newPauses);
      } else if (!stacks.has(key) && !holes.has(key) && !carousels.has(key)) {
        // Add pause (only if no stack, hole, or carousel there)
        const newPauses = new Set(pauses);
        newPauses.add(key);
        setPauses(newPauses);
      }
    } else if (placementMode === 'carousel') {
      // Carousel placement mode
      if (carousels.has(key)) {
        // Remove existing carousel
        const newCarousels = new Map(carousels);
        newCarousels.delete(key);
        setCarousels(newCarousels);
      } else if (!stacks.has(key) && !holes.has(key) && !pauses.has(key)) {
        // Add carousel (only if cell is empty)
        // Need at least 2 arms
        if (selectedCarouselArms.size < 2) return;

        const newCarousel: Carousel = {
          id: generateCarouselId(),
          coord,
          arms: sortArmsClockwise(Array.from(selectedCarouselArms)),
        };
        const newCarousels = new Map(carousels);
        newCarousels.set(key, newCarousel);
        setCarousels(newCarousels);
      }
    } else {
      // Stack placement mode
      if (stacks.has(key)) {
        // Remove existing stack
        const newStacks = new Map(stacks);
        newStacks.delete(key);
        setStacks(newStacks);
      } else if (!holes.has(key) && !pauses.has(key) && !carousels.has(key)) {
        // Add new stack (only if no hole, pause, or carousel there)
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

  // Clear all stacks, holes, pauses, and carousels
  const clearAll = () => {
    setStacks(new Map());
    setHoles(new Set());
    setPauses(new Set());
    setCarousels(new Map());
  };

  // Play the level
  const handlePlay = () => {
    // Convert holes set to array of coordinates
    const holeCoords: AxialCoord[] = [];
    holes.forEach(key => {
      const [q, r] = key.split(',').map(Number);
      holeCoords.push({ q, r });
    });

    // Convert pauses set to array of coordinates
    const pauseCoords: AxialCoord[] = [];
    pauses.forEach(key => {
      const [q, r] = key.split(',').map(Number);
      pauseCoords.push({ q, r });
    });

    // Convert carousels map to array
    const carouselArray = Array.from(carousels.values());

    const level: HexaBlockLevel = {
      id: `custom-${Date.now()}`,
      name: 'Custom Level',
      gridRadius,
      difficulty: 'medium',
      gameMode,
      stacks: Array.from(stacks.values()),
      holes: holeCoords.length > 0 ? holeCoords : undefined,
      pauses: pauseCoords.length > 0 ? pauseCoords : undefined,
      carousels: carouselArray.length > 0 ? carouselArray : undefined,
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

    const pauseCoords: AxialCoord[] = [];
    pauses.forEach(key => {
      const [q, r] = key.split(',').map(Number);
      pauseCoords.push({ q, r });
    });

    // Convert carousels map to array
    const carouselArray = Array.from(carousels.values());

    const clearability = getInitialClearability(stacks, holes);
    const difficulty = calculateDifficulty(clearability, stacks.size, moveBufferPercent);
    const sawtoothPosition = getSawtoothPosition(levelNumber);
    const flowZone = calculateFlowZone(difficulty, levelNumber);

    const metrics: LevelMetrics = {
      cellCount: stacks.size,
      holeCount: holes.size,
      pauseCount: pauses.size,
      carouselCount: carousels.size,
      optimalMoves: solvability.optimalMoves, // Includes pause encounters
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
      pauses: pauseCoords.length > 0 ? pauseCoords : undefined,
      carousels: carouselArray.length > 0 ? carouselArray : undefined,
      gameMode,
      metrics,
      createdAt: editingLevel?.createdAt || Date.now(),
    };

    onAddToCollection(designedLevel);
    // Clear the designer after adding
    setStacks(new Map());
    setHoles(new Set());
    setPauses(new Set());
    setCarousels(new Map());
  };

  // Get expected difficulty for current level position
  const expectedDifficulty = getExpectedDifficulty(levelNumber);
  const currentClearability = getInitialClearability(stacks, holes);

  // Move calculations (optimalMoves includes pause encounters from solver)
  const optimalMoves = solvability.solvable ? solvability.optimalMoves : stacks.size;
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
    <div className="flex gap-4 h-full">
      {/* Left Panel - Controls */}
      <div className="w-72 flex-shrink-0 flex flex-col gap-3">
        {/* Solvability Check - Fixed at top */}
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
                  {solvability.solvable ? 'Solvable!' : 'Not solvable'}
                </p>
                <p className="text-xs text-muted-foreground">{solvability.message}</p>
              </div>
              <div className="flex flex-col gap-1 items-end text-xs">
                <Badge variant="outline" className="text-xs">{stacks.size} cells</Badge>
                {holes.size > 0 && <Badge variant="outline" className="text-xs">{holes.size} holes</Badge>}
                {stacks.size > 0 && solvability.solvable && (
                  <Badge variant="outline" className={`text-xs ${difficultyColor}`}>
                    {difficultyLabel}
                  </Badge>
                )}
              </div>
            </div>
          );
        })()}

        {/* Controls Card */}
        <Card className="flex-1 overflow-y-auto">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Settings className="h-4 w-4" />
              Level Designer
            </CardTitle>
            <CardDescription className="text-xs">
              {editMode === 'place' ? 'Click hexes to place/remove stacks' : 'Click stacks to change arrow direction'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Direction & Color Selectors (only in stack place mode) */}
            {editMode === 'place' && placementMode === 'stack' && (
              <div className="space-y-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium">Direction</label>
                  <div className="flex flex-wrap gap-1">
                    {/* Single directions */}
                    {DIRECTION_ORDER.map((dir) => (
                      <Button
                        key={dir}
                        variant={selectedDirection === dir ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setSelectedDirection(dir)}
                        className="w-8 h-8 text-sm p-0"
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
                          className="w-10 h-8 text-sm p-0"
                        >
                          {DIRECTION_LABELS[axis]}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Color</label>
                  <div className="flex flex-wrap gap-1.5">
                    {STACK_COLOR_OPTIONS.map(([name, color]) => (
                      <button
                        key={name}
                        onClick={() => setSelectedColor(color)}
                        className={`w-6 h-6 rounded-full transition-transform ${
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
            <div className="space-y-1">
              <label className="text-xs font-medium">Game Mode</label>
              <div className="flex gap-1">
                <Button
                  variant={gameMode === 'classic' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setGameMode('classic');
                    if (isBidirectional(selectedDirection)) {
                      setSelectedDirection('E');
                    }
                  }}
                  className="flex-1 h-7 text-xs"
                >
                  Classic
                </Button>
                <Button
                  variant={gameMode === 'push' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setGameMode('push')}
                  className="flex-1 h-7 text-xs"
                >
                  Push
                </Button>
              </div>
            </div>

            {/* Grid Size */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium">Grid Size</label>
                <span className="text-xs text-muted-foreground">R:{gridRadius} ({gridCoords.length})</span>
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
            <div className="space-y-1">
              <label className="text-xs font-medium">Edit Mode</label>
              <div className="grid grid-cols-2 gap-1">
                <Button
                  variant={editMode === 'place' && placementMode === 'stack' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setEditMode('place');
                    setPlacementMode('stack');
                  }}
                  className="h-7 text-xs"
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
                  className="h-7 text-xs"
                >
                  Holes
                </Button>
                <Button
                  variant={editMode === 'place' && placementMode === 'pause' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setEditMode('place');
                    setPlacementMode('pause');
                  }}
                  className="h-7 text-xs"
                >
                  Pauses
                </Button>
                <Button
                  variant={editMode === 'place' && placementMode === 'carousel' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setEditMode('place');
                    setPlacementMode('carousel');
                  }}
                  className="h-7 text-xs"
                >
                  Rotators
                </Button>
                <Button
                  variant={editMode === 'direction' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setEditMode('direction')}
                  className="h-7 text-xs col-span-2"
                >
                  Arrows
                </Button>
              </div>
            </div>

            {/* Carousel Arm Selector (shown when carousel mode is active) */}
            {placementMode === 'carousel' && editMode === 'place' && (
              <div className="space-y-1">
                <label className="text-xs font-medium">Rotator Arms ({selectedCarouselArms.size} selected)</label>
                <div className="flex gap-1 flex-wrap">
                  {CLOCKWISE_DIRECTIONS.map((dir) => (
                    <Button
                      key={dir}
                      variant={selectedCarouselArms.has(dir) ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => {
                        const newArms = new Set(selectedCarouselArms);
                        if (newArms.has(dir)) {
                          // Don't remove if it would leave less than 2 arms
                          if (newArms.size > 2) {
                            newArms.delete(dir);
                          }
                        } else {
                          newArms.add(dir);
                        }
                        setSelectedCarouselArms(newArms);
                      }}
                      className="h-6 w-8 text-xs p-0"
                    >
                      {DIRECTION_LABELS[dir]}
                    </Button>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground">Select 2-6 arms. Tiles rotate clockwise.</p>
              </div>
            )}

            {/* Blocks Ahead Toggle */}
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium">Blocks Analysis</label>
              <Button
                variant={showBlocksAhead ? 'default' : 'outline'}
                size="sm"
                onClick={() => setShowBlocksAhead(!showBlocksAhead)}
                className="h-6 text-xs px-2"
              >
                {showBlocksAhead ? <Eye className="h-3 w-3 mr-1" /> : <EyeOff className="h-3 w-3 mr-1" />}
                {showBlocksAhead ? 'On' : 'Off'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Right Panel - Grid + Configuration */}
      <div className="flex-1 flex flex-col gap-4 min-h-0">
        {/* Grid Card */}
        <Card className="flex-shrink-0">
          <CardContent className="p-4 flex justify-center">
            <svg
              viewBox={viewBox}
              className="w-full max-w-md"
              style={{ aspectRatio: `${width} / ${height}` }}
            >
              {/* Grid hexes */}
              {gridCoords.map((coord) => {
                const key = hexKey(coord);
                const pixel = axialToPixel(coord, HEX_SIZE, origin);
                const points = getHexPolygonPoints(pixel, HEX_SIZE);
                const hasStack = stacks.has(key);
                const hasHole = holes.has(key);
                const hasPause = pauses.has(key);
                const hasCarousel = carousels.has(key);
                const carousel = carousels.get(key);
                const isHovered = hoveredHex === key;

                // Determine fill color
                let fillColor = 'rgba(255, 255, 255, 0.03)';
                if (hasHole) {
                  fillColor = 'rgba(0, 0, 0, 0.8)';
                } else if (hasPause) {
                  fillColor = 'rgba(59, 130, 246, 0.2)'; // Blue tint for pause cells
                } else if (hasCarousel) {
                  fillColor = 'rgba(168, 85, 247, 0.15)'; // Purple tint for carousels
                } else if (hasStack) {
                  fillColor = 'transparent';
                } else if (isHovered) {
                  fillColor = placementMode === 'hole' ? 'rgba(0, 0, 0, 0.4)' :
                              placementMode === 'pause' ? 'rgba(59, 130, 246, 0.3)' :
                              placementMode === 'carousel' ? 'rgba(168, 85, 247, 0.3)' :
                              'rgba(255, 255, 255, 0.1)';
                }

                return (
                  <g key={key}>
                    <polygon
                      points={points}
                      fill={fillColor}
                      stroke={hasHole ? 'rgba(139, 69, 19, 0.6)' :
                              hasPause ? 'rgba(59, 130, 246, 0.6)' :
                              hasCarousel ? 'rgba(168, 85, 247, 0.6)' :
                              'rgba(255, 255, 255, 0.15)'}
                      strokeWidth={hasHole || hasPause || hasCarousel ? 2 : 1}
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

                    {/* Pause cell visual effect - pause icon (||) */}
                    {hasPause && (
                      <g pointerEvents="none">
                        {/* Left bar */}
                        <rect
                          x={pixel.x - 8}
                          y={pixel.y - 10}
                          width={5}
                          height={20}
                          rx={2}
                          fill="rgba(59, 130, 246, 0.8)"
                        />
                        {/* Right bar */}
                        <rect
                          x={pixel.x + 3}
                          y={pixel.y - 10}
                          width={5}
                          height={20}
                          rx={2}
                          fill="rgba(59, 130, 246, 0.8)"
                        />
                      </g>
                    )}

                    {/* Carousel/Rotator visual effect */}
                    {hasCarousel && carousel && (
                      <g pointerEvents="none">
                        {/* Center circle */}
                        <circle
                          cx={pixel.x}
                          cy={pixel.y}
                          r={HEX_SIZE * 0.25}
                          fill="rgba(168, 85, 247, 0.8)"
                          stroke="rgba(168, 85, 247, 1)"
                          strokeWidth={2}
                        />
                        {/* Arm lines pointing to adjacent cells */}
                        {carousel.arms.map((dir) => {
                          const dirVec = HEX_DIRECTIONS[dir];
                          const armLength = HEX_SIZE * 0.55;
                          const angle = DIRECTION_ANGLES[dir];
                          const radians = (angle * Math.PI) / 180;
                          const endX = pixel.x + Math.cos(radians) * armLength;
                          const endY = pixel.y + Math.sin(radians) * armLength;
                          return (
                            <g key={dir}>
                              <line
                                x1={pixel.x}
                                y1={pixel.y}
                                x2={endX}
                                y2={endY}
                                stroke="rgba(168, 85, 247, 0.9)"
                                strokeWidth={3}
                                strokeLinecap="round"
                              />
                              {/* Small circle at arm end */}
                              <circle
                                cx={endX}
                                cy={endY}
                                r={4}
                                fill="rgba(168, 85, 247, 1)"
                              />
                            </g>
                          );
                        })}
                        {/* Clockwise arrow indicator */}
                        <path
                          d={`M ${pixel.x - 5} ${pixel.y - 2} A 5 5 0 1 1 ${pixel.x + 5} ${pixel.y - 2}`}
                          fill="none"
                          stroke="white"
                          strokeWidth={1.5}
                          strokeLinecap="round"
                        />
                        <path
                          d={`M ${pixel.x + 3} ${pixel.y - 5} L ${pixel.x + 5} ${pixel.y - 2} L ${pixel.x + 2} ${pixel.y}`}
                          fill="none"
                          stroke="white"
                          strokeWidth={1.5}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </g>
                    )}

                    {/* Preview stack on hover (when no stack/hole/pause/carousel exists, in stack place mode) */}
                    {isHovered && !hasStack && !hasHole && !hasPause && !hasCarousel && editMode === 'place' && placementMode === 'stack' && (
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

                    {/* Preview pause on hover (when empty, in pause place mode) */}
                    {isHovered && !hasStack && !hasHole && !hasPause && !hasCarousel && editMode === 'place' && placementMode === 'pause' && (
                      <g opacity={0.5} pointerEvents="none">
                        <rect
                          x={pixel.x - 8}
                          y={pixel.y - 10}
                          width={5}
                          height={20}
                          rx={2}
                          fill="rgba(59, 130, 246, 0.8)"
                        />
                        <rect
                          x={pixel.x + 3}
                          y={pixel.y - 10}
                          width={5}
                          height={20}
                          rx={2}
                          fill="rgba(59, 130, 246, 0.8)"
                        />
                      </g>
                    )}

                    {/* Preview carousel on hover (when empty, in carousel place mode) */}
                    {isHovered && !hasStack && !hasHole && !hasPause && !hasCarousel && editMode === 'place' && placementMode === 'carousel' && selectedCarouselArms.size >= 2 && (
                      <g opacity={0.5} pointerEvents="none">
                        {/* Center circle */}
                        <circle
                          cx={pixel.x}
                          cy={pixel.y}
                          r={HEX_SIZE * 0.25}
                          fill="rgba(168, 85, 247, 0.8)"
                          stroke="rgba(168, 85, 247, 1)"
                          strokeWidth={2}
                        />
                        {/* Arm lines */}
                        {Array.from(selectedCarouselArms).map((dir) => {
                          const armLength = HEX_SIZE * 0.55;
                          const angle = DIRECTION_ANGLES[dir];
                          const radians = (angle * Math.PI) / 180;
                          const endX = pixel.x + Math.cos(radians) * armLength;
                          const endY = pixel.y + Math.sin(radians) * armLength;
                          return (
                            <g key={dir}>
                              <line
                                x1={pixel.x}
                                y1={pixel.y}
                                x2={endX}
                                y2={endY}
                                stroke="rgba(168, 85, 247, 0.9)"
                                strokeWidth={3}
                                strokeLinecap="round"
                              />
                              <circle
                                cx={endX}
                                cy={endY}
                                r={4}
                                fill="rgba(168, 85, 247, 1)"
                              />
                            </g>
                          );
                        })}
                      </g>
                    )}
                  </g>
                );
              })}

              {/* Render stacks */}
              {Array.from(stacks.values()).map((stack) => {
                const key = hexKey(stack.coord);
                const pixel = axialToPixel(stack.coord, HEX_SIZE, origin);
                const isHovered = hoveredHex === key;
                const blocksAhead = showBlocksAhead ? (blocksAheadMap.get(key) ?? 0) : null;

                return (
                  <g
                    key={stack.id}
                    onClick={() => handleHexClick(stack.coord)}
                    onMouseEnter={() => setHoveredHex(key)}
                    onMouseLeave={() => setHoveredHex(null)}
                    style={{ cursor: 'pointer' }}
                  >
                    <polygon
                      points={getHexPolygonPoints(pixel, HEX_SIZE * 0.85)}
                      fill={stack.color}
                      stroke={isHovered ? 'white' : 'rgba(0, 0, 0, 0.3)'}
                      strokeWidth={isHovered ? 2 : 1}
                    />

                    <DirectionArrow
                      cx={pixel.x}
                      cy={pixel.y}
                      direction={stack.direction}
                      size={HEX_SIZE * 0.6}
                    />

                    {/* Blocks ahead indicator */}
                    {blocksAhead !== null && (
                      <>
                        <circle
                          cx={pixel.x}
                          cy={pixel.y + HEX_SIZE * 0.35}
                          r={8}
                          fill={getBlocksAheadColor(blocksAhead)}
                          stroke="rgba(0, 0, 0, 0.5)"
                          strokeWidth={1}
                        />
                        <text
                          x={pixel.x}
                          y={pixel.y + HEX_SIZE * 0.35}
                          textAnchor="middle"
                          dominantBaseline="central"
                          fontSize={9}
                          fontWeight="bold"
                          fill="black"
                          pointerEvents="none"
                        >
                          {blocksAhead}
                        </text>
                      </>
                    )}

                    {/* "Click to rotate" hint */}
                    {isHovered && editMode === 'direction' && (
                      <text
                        x={pixel.x}
                        y={pixel.y + HEX_SIZE * 0.5}
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
          </CardContent>
        </Card>

        {/* Configuration Panel */}
        <Card className="flex-1 overflow-y-auto">
          <CardContent className="pt-3 space-y-3">
            {/* Random Generator */}
            <div className="space-y-2 p-2 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2">
                <Dices className="h-3 w-3" />
                <label className="text-xs font-medium">Random Generator</label>
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Cells</span>
                  <span className="text-xs font-medium">{targetStackCount}</span>
                </div>
                <Slider
                  value={[targetStackCount]}
                  onValueChange={([v]) => setTargetStackCount(v)}
                  min={2}
                  max={Math.min(100, Math.floor(gridCoords.length * 0.8))}
                  step={1}
                />
              </div>
              <div className="flex gap-1">
                <Button
                  variant={targetDifficulty === 'any' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTargetDifficulty('any')}
                  className="flex-1 h-6 text-xs"
                >
                  Any
                </Button>
                <Button
                  variant={targetDifficulty === 'easy' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTargetDifficulty('easy')}
                  className="flex-1 h-6 text-xs"
                >
                  Easy
                </Button>
                <Button
                  variant={targetDifficulty === 'medium' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTargetDifficulty('medium')}
                  className="flex-1 h-6 text-xs"
                >
                  Med
                </Button>
                <Button
                  variant={targetDifficulty === 'hard' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTargetDifficulty('hard')}
                  className="flex-1 h-6 text-xs"
                >
                  Hard
                </Button>
              </div>
              <div className="flex gap-1">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={generateRandomLevel}
                  className="flex-1 h-7 text-xs"
                >
                  <Shuffle className="h-3 w-3 mr-1" />
                  Random
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={smartFillLevel}
                  className="flex-1 h-7 text-xs"
                  title="Fill all empty cells while maintaining solvability"
                >
                  <Sparkles className="h-3 w-3 mr-1" />
                  Smart Fill
                </Button>
              </div>
            </div>

            {/* Level Templates */}
            <div className="space-y-2 p-2 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2">
                <Grid3X3 className="h-3 w-3" />
                <label className="text-xs font-medium">Templates</label>
              </div>
              <div className="grid grid-cols-4 gap-1">
                {LEVEL_TEMPLATES.map((template) => (
                  <Button
                    key={template.id}
                    variant="outline"
                    size="sm"
                    onClick={() => applyTemplate(template)}
                    className="text-xs h-6 px-1"
                    title={template.description}
                  >
                    {template.name}
                  </Button>
                ))}
              </div>
            </div>

            {/* Export/Import/Share */}
            <div className="space-y-2 p-2 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2">
                <Share2 className="h-3 w-3" />
                <label className="text-xs font-medium">Export & Share</label>
              </div>

              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleImportJSON}
                className="hidden"
              />

              {/* Export/Import JSON */}
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportJSON}
                  disabled={stacks.size === 0}
                  className="flex-1 h-6 text-xs"
                >
                  <Download className="h-3 w-3 mr-1" />
                  Export
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 h-6 text-xs"
                >
                  <Upload className="h-3 w-3 mr-1" />
                  Import
                </Button>
              </div>

              {/* Share Code */}
              <Button
                variant="outline"
                size="sm"
                onClick={generateShareCode}
                disabled={stacks.size === 0}
                className="w-full h-6 text-xs"
              >
                <Copy className="h-3 w-3 mr-1" />
                Generate Code
              </Button>

              {shareCode && (
                <div className="flex gap-1">
                  <input
                    type="text"
                    value={shareCode}
                    readOnly
                    className="flex-1 px-2 py-0.5 text-xs bg-background border rounded font-mono"
                  />
                  <Button
                    variant={copySuccess ? 'default' : 'outline'}
                    size="sm"
                    onClick={handleCopyCode}
                    className="h-6 text-xs px-2"
                  >
                    {copySuccess ? '✓' : 'Copy'}
                  </Button>
                </div>
              )}

              {/* Import from Code */}
              <div className="flex gap-1">
                <input
                  type="text"
                  value={importCode}
                  onChange={(e) => setImportCode(e.target.value)}
                  placeholder="Paste code..."
                  className="flex-1 px-2 py-0.5 text-xs bg-background border rounded font-mono"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleImportCode}
                  disabled={!importCode.trim()}
                  className="h-6 text-xs px-2"
                >
                  Load
                </Button>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-1 pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={clearAll}
                disabled={stacks.size === 0}
                className="flex-1 h-8 text-xs"
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Clear
              </Button>
              <Button
                size="sm"
                onClick={handlePlay}
                disabled={!solvability.solvable}
                className="flex-1 h-8 text-xs"
              >
                <Play className="h-3 w-3 mr-1" />
                Play
              </Button>
            </div>

            {/* Add to Collection */}
            {onAddToCollection && (
              <Button
                size="sm"
                variant="secondary"
                onClick={handleAddToCollection}
                disabled={!solvability.solvable || stacks.size === 0}
                className="w-full h-8 text-xs"
              >
                <Plus className="h-3 w-3 mr-1" />
                {editingLevel ? 'Update Level' : 'Add to Collection'}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

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
          optimalMoves={optimalMoves}
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
  optimalMoves: number; // From solver, includes pause encounters
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
  optimalMoves,
  onExtraMovesChange,
}: EmbeddedMetricsPanelProps) {
  const cellCount = stacks.size;
  const holeCount = holes.size;
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
