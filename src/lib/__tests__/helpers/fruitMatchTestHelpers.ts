import {
  FruitType,
  PixelCell,
  SinkTile,
  Launcher,
  LauncherCapacity,
  FruitMatchLevel,
  generateTileId,
  generateLauncherId,
  DifficultyTier,
  LauncherOrderConfig,
  PixelGroup,
  ExplicitLauncherConfig,
  UnlockStage,
} from '@/types/fruitMatch';
import { LauncherConfig } from '@/lib/fruitMatchUtils';

/**
 * Create a single pixel cell
 */
export function createTestPixel(
  row: number,
  col: number,
  fruitType: FruitType,
  options?: { filled?: boolean; groupId?: number }
): PixelCell {
  return {
    row,
    col,
    fruitType,
    filled: options?.filled ?? false,
    groupId: options?.groupId,
  };
}

/**
 * Create pixel art from a 2D pattern array of fruit types
 */
export function createTestPixelArt(pattern: (FruitType | null)[][]): PixelCell[] {
  const cells: PixelCell[] = [];

  for (let row = 0; row < pattern.length; row++) {
    for (let col = 0; col < pattern[row].length; col++) {
      const fruitType = pattern[row][col];
      if (fruitType !== null) {
        cells.push(createTestPixel(row, col, fruitType));
      }
    }
  }

  return cells;
}

/**
 * Create a simple rectangular pixel art with a single fruit type
 */
export function createUniformPixelArt(
  width: number,
  height: number,
  fruitType: FruitType
): PixelCell[] {
  const cells: PixelCell[] = [];

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      cells.push(createTestPixel(row, col, fruitType));
    }
  }

  return cells;
}

/**
 * Create a test sink tile
 */
export function createTestTile(
  fruitType: FruitType,
  position: number,
  stackIndex: number,
  id?: string
): SinkTile {
  return {
    id: id ?? generateTileId(),
    fruitType,
    position,
    stackIndex,
  };
}

/**
 * Create a sink stack (column) with specified fruit types from bottom to top
 */
export function createTestSinkStack(
  position: number,
  fruits: FruitType[]
): SinkTile[] {
  return fruits.map((fruitType, index) =>
    createTestTile(fruitType, position, index)
  );
}

/**
 * Create multiple sink stacks
 */
export function createTestSinkStacks(stackConfigs: FruitType[][]): SinkTile[][] {
  return stackConfigs.map((fruits, position) =>
    createTestSinkStack(position, fruits)
  );
}

/**
 * Create a test launcher
 */
export function createTestLauncher(
  fruitType: FruitType,
  capacity: LauncherCapacity,
  position: number,
  options?: { groupId?: number }
): Launcher {
  return {
    id: generateLauncherId(),
    requiredFruit: fruitType,
    capacity,
    position,
    groupId: options?.groupId,
  };
}

/**
 * Create a launcher config for queue
 */
export function createTestLauncherConfig(
  fruitType: FruitType,
  capacity: LauncherCapacity,
  groupId?: number
): LauncherConfig {
  return {
    fruitType,
    capacity,
    groupId,
  };
}

/**
 * Create initial launchers from configs
 */
export function createInitialLaunchers(configs: LauncherConfig[]): Launcher[] {
  return configs.slice(0, 4).map((config, index) =>
    createTestLauncher(config.fruitType, config.capacity, index, { groupId: config.groupId })
  );
}

/**
 * Create a complete FruitMatchLevel for testing
 */
export function createTestFruitMatchLevel(
  pixelArt: PixelCell[],
  sinkStacks: SinkTile[][],
  options?: {
    id?: string;
    name?: string;
    pixelArtWidth?: number;
    pixelArtHeight?: number;
    waitingStandSlots?: number;
    difficulty?: DifficultyTier;
    launcherOrderConfig?: LauncherOrderConfig;
  }
): FruitMatchLevel {
  // Calculate dimensions from pixel art if not provided
  let width = options?.pixelArtWidth;
  let height = options?.pixelArtHeight;

  if (!width || !height) {
    const maxRow = Math.max(...pixelArt.map(p => p.row), 0);
    const maxCol = Math.max(...pixelArt.map(p => p.col), 0);
    width = width ?? maxCol + 1;
    height = height ?? maxRow + 1;
  }

  return {
    id: options?.id ?? 'test-level',
    name: options?.name ?? 'Test Level',
    pixelArt,
    pixelArtWidth: width,
    pixelArtHeight: height,
    sinkWidth: sinkStacks.length,
    sinkStacks,
    waitingStandSlots: options?.waitingStandSlots ?? 7,
    difficulty: options?.difficulty ?? 'easy',
    launcherOrderConfig: options?.launcherOrderConfig,
  };
}

/**
 * Create a simple solvable level for testing
 * 4 apples in a 2x2 grid with matching tiles
 */
export function createSimpleSolvableLevel(): FruitMatchLevel {
  const pixelArt = createTestPixelArt([
    ['apple', 'apple'],
    ['apple', 'apple'],
  ]);

  // Need 1 launcher of capacity 20 for 4 pixels
  // So we need 3 apple tiles in the sink
  const sinkStacks = createTestSinkStacks([
    ['apple', 'apple'],
    ['apple'],
  ]);

  return createTestFruitMatchLevel(pixelArt, sinkStacks, {
    pixelArtWidth: 2,
    pixelArtHeight: 2,
    waitingStandSlots: 7,
  });
}

/**
 * Create a level with multiple fruit types for testing
 */
export function createMultiFruitLevel(): FruitMatchLevel {
  const pixelArt = createTestPixelArt([
    ['apple', 'orange'],
    ['orange', 'apple'],
  ]);

  const sinkStacks = createTestSinkStacks([
    ['apple', 'orange'],
    ['orange', 'apple'],
    ['apple', 'orange'],
  ]);

  return createTestFruitMatchLevel(pixelArt, sinkStacks, {
    pixelArtWidth: 2,
    pixelArtHeight: 2,
    waitingStandSlots: 7,
  });
}

/**
 * Create a pixel group for testing
 */
export function createTestPixelGroup(
  id: number,
  colorTypes: FruitType[],
  options?: { name?: string; order?: number }
): PixelGroup {
  return {
    id,
    name: options?.name ?? `Group ${id}`,
    colorTypes,
    order: options?.order ?? id,
  };
}

/**
 * Create an explicit launcher config for testing
 */
export function createTestExplicitLauncher(
  fruitType: FruitType,
  capacity: LauncherCapacity,
  groupId: number,
  orderIndex: number
): ExplicitLauncherConfig {
  return {
    id: `launcher-${orderIndex}`,
    fruitType,
    capacity,
    groupId,
    orderIndex,
  };
}

/**
 * Create an unlock stage for testing
 */
export function createTestUnlockStage(
  id: number,
  groupIds: number[],
  name?: string
): UnlockStage {
  return {
    id,
    name: name ?? `Stage ${id}`,
    groupIds,
  };
}

/**
 * Create a launcher order config for testing
 */
export function createTestLauncherOrderConfig(
  mode: 'auto' | 'manual',
  groups: PixelGroup[],
  launchers: ExplicitLauncherConfig[],
  unlockStages: UnlockStage[]
): LauncherOrderConfig {
  return {
    mode,
    groups,
    launchers,
    unlockStages,
  };
}
