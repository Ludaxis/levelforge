// Square Grid Utilities
// Simple row/column coordinate system for rectangular grids

// ============================================================================
// Types
// ============================================================================

export interface GridCoord {
  row: number;
  col: number;
}

export type SquareDirection = 'N' | 'E' | 'S' | 'W';
export type SquareAxis = 'N_S' | 'E_W';

// ============================================================================
// Constants
// ============================================================================

// Direction vectors for square grid (row, col deltas)
export const SQUARE_DIRECTIONS: Record<SquareDirection, GridCoord> = {
  N: { row: -1, col: 0 },  // Up
  E: { row: 0, col: 1 },   // Right
  S: { row: 1, col: 0 },   // Down
  W: { row: 0, col: -1 },  // Left
};

export const DIRECTION_ORDER: SquareDirection[] = ['N', 'E', 'S', 'W'];
export const AXIS_ORDER: SquareAxis[] = ['N_S', 'E_W'];

// Direction angles for rendering arrows (degrees, 0 = right)
export const DIRECTION_ANGLES: Record<SquareDirection, number> = {
  N: -90,
  E: 0,
  S: 90,
  W: 180,
};

export const AXIS_ANGLES: Record<SquareAxis, number> = {
  N_S: 90,  // Vertical
  E_W: 0,   // Horizontal
};

// ============================================================================
// Coordinate Functions
// ============================================================================

// Create a unique string key for a coordinate
export function gridKey(coord: GridCoord): string {
  return `${coord.row},${coord.col}`;
}

// Parse a key back to coordinates
export function parseGridKey(key: string): GridCoord {
  const [row, col] = key.split(',').map(Number);
  return { row, col };
}

// Add two coordinates
export function gridAdd(a: GridCoord, b: GridCoord): GridCoord {
  return { row: a.row + b.row, col: a.col + b.col };
}

// Check if two coordinates are equal
export function gridEquals(a: GridCoord, b: GridCoord): boolean {
  return a.row === b.row && a.col === b.col;
}

// Check if coordinate is within rectangular bounds
export function isInBounds(coord: GridCoord, rows: number, cols: number): boolean {
  return coord.row >= 0 && coord.row < rows && coord.col >= 0 && coord.col < cols;
}

// ============================================================================
// Grid Generation
// ============================================================================

// Create a rectangular grid of coordinates
export function createRectangularGrid(rows: number, cols: number): GridCoord[] {
  const coords: GridCoord[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      coords.push({ row, col });
    }
  }
  return coords;
}

// ============================================================================
// Pixel Conversion
// ============================================================================

// Convert grid coordinate to pixel position
export function gridToPixel(
  coord: GridCoord,
  cellSize: number,
  origin: { x: number; y: number } = { x: 0, y: 0 }
): { x: number; y: number } {
  return {
    x: origin.x + coord.col * cellSize + cellSize / 2,
    y: origin.y + coord.row * cellSize + cellSize / 2,
  };
}

// Get rectangle points for a cell (for SVG)
export function getCellRect(
  center: { x: number; y: number },
  size: number,
  padding: number = 2
): { x: number; y: number; width: number; height: number } {
  const actualSize = size - padding * 2;
  return {
    x: center.x - actualSize / 2,
    y: center.y - actualSize / 2,
    width: actualSize,
    height: actualSize,
  };
}

// Get grid bounds for SVG viewBox
export function getGridBounds(
  rows: number,
  cols: number,
  cellSize: number
): { width: number; height: number } {
  return {
    width: cols * cellSize,
    height: rows * cellSize,
  };
}

// ============================================================================
// Direction Utilities
// ============================================================================

// Check if direction is bidirectional axis
export function isBidirectional(dir: SquareDirection | SquareAxis): dir is SquareAxis {
  return dir === 'N_S' || dir === 'E_W';
}

// Get the two directions from a bidirectional axis
export function getAxisDirections(axis: SquareAxis): [SquareDirection, SquareDirection] {
  switch (axis) {
    case 'N_S': return ['N', 'S'];
    case 'E_W': return ['E', 'W'];
  }
}

// Get opposite direction
export function getOppositeDirection(dir: SquareDirection): SquareDirection {
  switch (dir) {
    case 'N': return 'S';
    case 'S': return 'N';
    case 'E': return 'W';
    case 'W': return 'E';
  }
}

// ============================================================================
// Block Counter Functions (for showing blocks ahead)
// ============================================================================

// Count blocking blocks in a single direction
export function countBlocksInDirection(
  startCoord: GridCoord,
  direction: SquareDirection,
  blocks: Map<string, unknown>,
  holes: Set<string>,
  rows: number,
  cols: number
): number {
  const dirVec = SQUARE_DIRECTIONS[direction];
  let current = gridAdd(startCoord, dirVec);
  let blocksCount = 0;

  while (isInBounds(current, rows, cols)) {
    const key = gridKey(current);
    // If there's a hole, path ends here (can fall in)
    if (holes.has(key)) {
      return blocksCount;
    }
    // Count blocks in the path
    if (blocks.has(key)) {
      blocksCount++;
    }
    current = gridAdd(current, dirVec);
  }

  return blocksCount;
}

// Get minimum blocks ahead (handles bidirectional arrows)
export function getMinBlocksAhead(
  startCoord: GridCoord,
  direction: SquareDirection | SquareAxis,
  blocks: Map<string, unknown>,
  holes: Set<string>,
  rows: number,
  cols: number
): number {
  if (isBidirectional(direction)) {
    const [dir1, dir2] = getAxisDirections(direction);
    const count1 = countBlocksInDirection(startCoord, dir1, blocks, holes, rows, cols);
    const count2 = countBlocksInDirection(startCoord, dir2, blocks, holes, rows, cols);
    return Math.min(count1, count2);
  } else {
    return countBlocksInDirection(startCoord, direction, blocks, holes, rows, cols);
  }
}

// Color gradient for blocks ahead visualization
export function getBlocksAheadColor(blocksCount: number): string {
  switch (blocksCount) {
    case 0: return '#22c55e'; // green-500 - immediately clearable
    case 1: return '#84cc16'; // lime-500
    case 2: return '#eab308'; // yellow-500
    case 3: return '#f97316'; // orange-500
    default: return '#ef4444'; // red-500 - many blocks ahead
  }
}
