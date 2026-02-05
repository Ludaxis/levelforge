import { AxialCoord, hexKey, HexDirection } from '@/lib/hexGrid';

/**
 * Type definition for hex block (matching the expected structure)
 */
export interface HexBlock {
  id: string;
  coord: AxialCoord;
  direction: HexDirection | 'NE_SW' | 'E_W' | 'SE_NW';
  color: string;
  locked?: boolean;
  iceCount?: number;
  mirror?: boolean;
}

export interface HexBlockLevel {
  id: string;
  name: string;
  gridRadius: number;
  stacks: HexBlock[];
  holes?: AxialCoord[];
  difficulty: 'easy' | 'medium' | 'hard';
}

/**
 * Create a test hex block
 */
export function createTestHexBlock(
  q: number,
  r: number,
  direction: HexBlock['direction'],
  options?: {
    locked?: boolean;
    iceCount?: number;
    mirror?: boolean;
    color?: string;
  }
): HexBlock {
  return {
    id: `hex-block-${q}-${r}`,
    coord: { q, r },
    direction,
    color: options?.color ?? '#06b6d4',
    locked: options?.locked,
    iceCount: options?.iceCount,
    mirror: options?.mirror,
  };
}

/**
 * Create a test hex level
 */
export function createTestHexLevel(
  stacks: HexBlock[],
  options?: {
    gridRadius?: number;
    holes?: AxialCoord[];
    name?: string;
    id?: string;
  }
): HexBlockLevel {
  return {
    id: options?.id ?? 'test-hex-level',
    name: options?.name ?? 'Test Hex Level',
    gridRadius: options?.gridRadius ?? 2,
    stacks,
    holes: options?.holes,
    difficulty: 'easy',
  };
}

/**
 * Create a hex block map from an array
 */
export function createHexBlockMap(blocks: HexBlock[]): Map<string, HexBlock> {
  const map = new Map<string, HexBlock>();
  for (const block of blocks) {
    map.set(hexKey(block.coord), block);
  }
  return map;
}

/**
 * Create a hole set from hex coordinates
 */
export function createHexHoleSet(holes: AxialCoord[]): Set<string> {
  return new Set(holes.map(hexKey));
}

/**
 * Create a ring of hex blocks around center
 */
export function createHexRing(
  radius: number,
  direction: HexBlock['direction']
): HexBlock[] {
  if (radius === 0) {
    return [createTestHexBlock(0, 0, direction)];
  }

  const blocks: HexBlock[] = [];
  const directions: AxialCoord[] = [
    { q: 1, r: -1 },  // NE
    { q: 1, r: 0 },   // E
    { q: 0, r: 1 },   // SE
    { q: -1, r: 1 },  // SW
    { q: -1, r: 0 },  // W
    { q: 0, r: -1 },  // NW
  ];

  let hex = { q: -radius, r: 0 }; // Start at W

  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < radius; j++) {
      blocks.push(createTestHexBlock(hex.q, hex.r, direction));
      hex = { q: hex.q + directions[i].q, r: hex.r + directions[i].r };
    }
  }

  return blocks;
}

/**
 * Create a clearable hex level (block can exit immediately)
 */
export function createClearableHexLevel(): HexBlockLevel {
  const blocks = [createTestHexBlock(0, 0, 'E')]; // Can exit to the east
  return createTestHexLevel(blocks, { gridRadius: 1 });
}

/**
 * Create a deadlock hex level (no blocks can be cleared)
 */
export function createDeadlockHexLevel(): HexBlockLevel {
  const blocks = [
    createTestHexBlock(-1, 0, 'E'),  // Blocked by block at (1, 0)
    createTestHexBlock(1, 0, 'W'),   // Blocked by block at (-1, 0)
  ];
  return createTestHexLevel(blocks, { gridRadius: 2 });
}

/**
 * Get all hexes in a hexagonal grid of given radius
 */
export function getHexesInRadius(radius: number): AxialCoord[] {
  const hexes: AxialCoord[] = [];
  for (let q = -radius; q <= radius; q++) {
    for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius); r++) {
      hexes.push({ q, r });
    }
  }
  return hexes;
}
