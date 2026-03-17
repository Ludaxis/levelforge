'use client';

import { useState, useMemo, useCallback, useRef } from 'react';
import {
  HexStack,
  HexaBlockLevel,
  STACK_COLORS,
  GameMode,
  StackDirection,
  HexAxis,
  AXIS_ANGLES,
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
  DIRECTION_ANGLES,
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
import { LEVEL_TEMPLATES, LevelTemplate } from '@/lib/hexLevelTemplates';
import { encodeLevel, decodeLevel, downloadLevelJSON, copyToClipboard, importLevelFromJSON } from '@/lib/levelCodec';
import {
  HexBlockLevelDesignerProps,
  HEX_SIZE,
  AXIS_ORDER,
  ALL_DIRECTIONS,
  ControlPanel,
  ConfigurationPanel,
  HexGridCanvas,
  EmbeddedMetricsPanel,
} from './designer';

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
      <ControlPanel
        solvability={solvability}
        stacks={stacks}
        holes={holes}
        initialClearability={currentClearability}
        editMode={editMode}
        placementMode={placementMode}
        selectedDirection={selectedDirection}
        selectedColor={selectedColor}
        selectedCarouselArms={selectedCarouselArms}
        gameMode={gameMode}
        gridRadius={gridRadius}
        gridCoords={gridCoords}
        showBlocksAhead={showBlocksAhead}
        onEditModeChange={setEditMode}
        onPlacementModeChange={setPlacementMode}
        onDirectionChange={setSelectedDirection}
        onColorChange={setSelectedColor}
        onCarouselArmsChange={setSelectedCarouselArms}
        onGameModeChange={setGameMode}
        onRadiusChange={handleRadiusChange}
        onShowBlocksAheadChange={setShowBlocksAhead}
      />

      {/* Right Panel - Grid + Configuration */}
      <div className="flex-1 flex flex-col gap-4 min-h-0">
        {/* Grid Card */}
        <HexGridCanvas
          viewBox={viewBox}
          width={width}
          height={height}
          origin={origin}
          gridCoords={gridCoords}
          stacks={stacks}
          holes={holes}
          pauses={pauses}
          carousels={carousels}
          hoveredHex={hoveredHex}
          editMode={editMode}
          placementMode={placementMode}
          selectedDirection={selectedDirection}
          selectedColor={selectedColor}
          selectedCarouselArms={selectedCarouselArms}
          showBlocksAhead={showBlocksAhead}
          blocksAheadMap={blocksAheadMap}
          onHexClick={handleHexClick}
          onHexHover={setHoveredHex}
        />

        {/* Configuration Panel */}
        <ConfigurationPanel
          stacks={stacks}
          holes={holes}
          gridCoords={gridCoords}
          targetStackCount={targetStackCount}
          targetDifficulty={targetDifficulty}
          solvability={solvability}
          shareCode={shareCode}
          importCode={importCode}
          copySuccess={copySuccess}
          editingLevel={editingLevel}
          onAddToCollection={onAddToCollection}
          fileInputRef={fileInputRef}
          onTargetStackCountChange={setTargetStackCount}
          onTargetDifficultyChange={setTargetDifficulty}
          onGenerateRandom={generateRandomLevel}
          onSmartFill={smartFillLevel}
          onApplyTemplate={applyTemplate}
          onExportJSON={handleExportJSON}
          onImportJSON={handleImportJSON}
          onGenerateShareCode={generateShareCode}
          onCopyCode={handleCopyCode}
          onImportCode={handleImportCode}
          onImportCodeChange={setImportCode}
          onClearAll={clearAll}
          onPlay={handlePlay}
          onAddToCollectionClick={handleAddToCollection}
        />
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
