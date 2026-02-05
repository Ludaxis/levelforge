import { SquareBlock, BlockDirection, SquareBlockLevel, GameMode } from '@/types/squareBlock';
import { GridCoord, gridKey } from '@/lib/squareGrid';

/**
 * Create a test block with common defaults
 */
export function createTestBlock(
  row: number,
  col: number,
  direction: BlockDirection,
  options?: {
    locked?: boolean;
    iceCount?: number;
    mirror?: boolean;
    color?: string;
    unlockAfterMoves?: number;
  }
): SquareBlock {
  return {
    id: `block-${row}-${col}`,
    coord: { row, col },
    direction,
    color: options?.color ?? '#06b6d4',
    locked: options?.locked,
    iceCount: options?.iceCount,
    mirror: options?.mirror,
    unlockAfterMoves: options?.unlockAfterMoves,
  };
}

/**
 * Create a test level with blocks and optional configuration
 */
export function createTestLevel(
  blocks: SquareBlock[],
  options?: {
    rows?: number;
    cols?: number;
    holes?: GridCoord[];
    gameMode?: GameMode;
    name?: string;
    id?: string;
  }
): SquareBlockLevel {
  const rows = options?.rows ?? 5;
  const cols = options?.cols ?? 5;

  return {
    id: options?.id ?? 'test-level',
    name: options?.name ?? 'Test Level',
    rows,
    cols,
    blocks,
    holes: options?.holes,
    difficulty: 'easy',
    gameMode: options?.gameMode,
  };
}

/**
 * Create blocks from a pattern array
 * Pattern characters:
 * - '.' = empty
 * - 'N', 'E', 'S', 'W' = single direction
 * - 'V' = N_S (vertical bidirectional)
 * - 'H' = E_W (horizontal bidirectional)
 * - 'L' = locked (defaults to 'N')
 * - 'M' = mirror (defaults to 'N')
 * - 'I' = iced (defaults to 'N', iceCount=1)
 */
export function createBlockGrid(pattern: string[][]): SquareBlock[] {
  const blocks: SquareBlock[] = [];

  for (let row = 0; row < pattern.length; row++) {
    for (let col = 0; col < pattern[row].length; col++) {
      const char = pattern[row][col];
      if (char === '.') continue;

      let direction: BlockDirection = 'N';
      let locked = false;
      let mirror = false;
      let iceCount: number | undefined;

      switch (char) {
        case 'N': direction = 'N'; break;
        case 'E': direction = 'E'; break;
        case 'S': direction = 'S'; break;
        case 'W': direction = 'W'; break;
        case 'V': direction = 'N_S'; break;
        case 'H': direction = 'E_W'; break;
        case 'L': direction = 'N'; locked = true; break;
        case 'M': direction = 'N'; mirror = true; break;
        case 'I': direction = 'N'; iceCount = 1; break;
      }

      blocks.push(createTestBlock(row, col, direction, { locked, mirror, iceCount }));
    }
  }

  return blocks;
}

/**
 * Create a block map from an array of blocks
 */
export function createBlockMap(blocks: SquareBlock[]): Map<string, SquareBlock> {
  const map = new Map<string, SquareBlock>();
  for (const block of blocks) {
    map.set(gridKey(block.coord), block);
  }
  return map;
}

/**
 * Create a hole set from coordinates
 */
export function createHoleSet(holes: GridCoord[]): Set<string> {
  return new Set(holes.map(gridKey));
}

/**
 * Create a simple line of blocks facing a direction
 */
export function createBlockLine(
  startRow: number,
  startCol: number,
  direction: BlockDirection,
  count: number,
  orientation: 'horizontal' | 'vertical' = 'horizontal'
): SquareBlock[] {
  const blocks: SquareBlock[] = [];
  for (let i = 0; i < count; i++) {
    const row = orientation === 'horizontal' ? startRow : startRow + i;
    const col = orientation === 'horizontal' ? startCol + i : startCol;
    blocks.push(createTestBlock(row, col, direction));
  }
  return blocks;
}

/**
 * Create a test level that's immediately clearable (all blocks can exit)
 */
export function createClearableLevel(size: number = 3): SquareBlockLevel {
  const blocks: SquareBlock[] = [];

  // Single block in center pointing east (can exit right edge)
  blocks.push(createTestBlock(1, 1, 'E'));

  return createTestLevel(blocks, { rows: size, cols: size });
}

/**
 * Create a deadlock level (no blocks can be cleared)
 */
export function createDeadlockLevel(): SquareBlockLevel {
  // Two blocks facing each other - both blocked
  const blocks = [
    createTestBlock(1, 0, 'E'),  // Blocked by the block at (1,2)
    createTestBlock(1, 2, 'W'),  // Blocked by the block at (1,0)
  ];

  return createTestLevel(blocks, { rows: 3, cols: 3 });
}
