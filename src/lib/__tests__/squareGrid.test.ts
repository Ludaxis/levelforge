import { describe, it, expect } from 'vitest';
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
  parseGridKey,
  gridAdd,
  gridEquals,
  isInBounds,
  createRectangularGrid,
  gridToPixel,
  getCellRect,
  getGridBounds,
  isBidirectional,
  getAxisDirections,
  getOppositeDirection,
  countBlocksInDirection,
  getMinBlocksAhead,
  getBlocksAheadColor,
} from '../squareGrid';
import {
  createBlockMap,
  createHoleSet,
  createTestBlock,
} from './helpers/squareBlockTestHelpers';

// ============================================================================
// Coordinate Key Functions
// ============================================================================

describe('Coordinate Key Functions', () => {
  describe('gridKey', () => {
    it('should create a string key from coordinates', () => {
      expect(gridKey({ row: 0, col: 0 })).toBe('0,0');
      expect(gridKey({ row: 3, col: 5 })).toBe('3,5');
      expect(gridKey({ row: -1, col: -2 })).toBe('-1,-2');
    });

    it('should handle large numbers', () => {
      expect(gridKey({ row: 100, col: 200 })).toBe('100,200');
    });
  });

  describe('parseGridKey', () => {
    it('should parse a string key back to coordinates', () => {
      expect(parseGridKey('0,0')).toEqual({ row: 0, col: 0 });
      expect(parseGridKey('3,5')).toEqual({ row: 3, col: 5 });
      expect(parseGridKey('-1,-2')).toEqual({ row: -1, col: -2 });
    });

    it('should be inverse of gridKey', () => {
      const coord = { row: 7, col: 13 };
      expect(parseGridKey(gridKey(coord))).toEqual(coord);
    });
  });

  describe('gridKey/parseGridKey round-trip', () => {
    it('should round-trip for various coordinates', () => {
      const coords: GridCoord[] = [
        { row: 0, col: 0 },
        { row: 1, col: 1 },
        { row: 10, col: 20 },
        { row: -5, col: 3 },
      ];

      for (const coord of coords) {
        const key = gridKey(coord);
        const parsed = parseGridKey(key);
        expect(parsed).toEqual(coord);
      }
    });
  });
});

// ============================================================================
// Coordinate Arithmetic
// ============================================================================

describe('Coordinate Arithmetic', () => {
  describe('gridAdd', () => {
    it('should add two coordinates', () => {
      expect(gridAdd({ row: 1, col: 2 }, { row: 3, col: 4 })).toEqual({ row: 4, col: 6 });
    });

    it('should handle negative values', () => {
      expect(gridAdd({ row: 5, col: 5 }, { row: -2, col: -3 })).toEqual({ row: 3, col: 2 });
    });

    it('should handle zero', () => {
      expect(gridAdd({ row: 1, col: 2 }, { row: 0, col: 0 })).toEqual({ row: 1, col: 2 });
    });

    it('should work with direction vectors', () => {
      const start = { row: 2, col: 2 };
      expect(gridAdd(start, SQUARE_DIRECTIONS.N)).toEqual({ row: 1, col: 2 });
      expect(gridAdd(start, SQUARE_DIRECTIONS.E)).toEqual({ row: 2, col: 3 });
      expect(gridAdd(start, SQUARE_DIRECTIONS.S)).toEqual({ row: 3, col: 2 });
      expect(gridAdd(start, SQUARE_DIRECTIONS.W)).toEqual({ row: 2, col: 1 });
    });
  });

  describe('gridEquals', () => {
    it('should return true for equal coordinates', () => {
      expect(gridEquals({ row: 1, col: 2 }, { row: 1, col: 2 })).toBe(true);
    });

    it('should return false for different coordinates', () => {
      expect(gridEquals({ row: 1, col: 2 }, { row: 1, col: 3 })).toBe(false);
      expect(gridEquals({ row: 1, col: 2 }, { row: 2, col: 2 })).toBe(false);
    });

    it('should handle zero', () => {
      expect(gridEquals({ row: 0, col: 0 }, { row: 0, col: 0 })).toBe(true);
    });
  });
});

// ============================================================================
// Boundary Checking
// ============================================================================

describe('Boundary Checking', () => {
  describe('isInBounds', () => {
    const rows = 5;
    const cols = 5;

    it('should return true for coordinates within bounds', () => {
      expect(isInBounds({ row: 0, col: 0 }, rows, cols)).toBe(true);
      expect(isInBounds({ row: 2, col: 2 }, rows, cols)).toBe(true);
      expect(isInBounds({ row: 4, col: 4 }, rows, cols)).toBe(true);
    });

    it('should return false for row below zero', () => {
      expect(isInBounds({ row: -1, col: 0 }, rows, cols)).toBe(false);
    });

    it('should return false for col below zero', () => {
      expect(isInBounds({ row: 0, col: -1 }, rows, cols)).toBe(false);
    });

    it('should return false for row at or above rows', () => {
      expect(isInBounds({ row: 5, col: 0 }, rows, cols)).toBe(false);
      expect(isInBounds({ row: 6, col: 0 }, rows, cols)).toBe(false);
    });

    it('should return false for col at or above cols', () => {
      expect(isInBounds({ row: 0, col: 5 }, rows, cols)).toBe(false);
      expect(isInBounds({ row: 0, col: 6 }, rows, cols)).toBe(false);
    });

    it('should handle edge cases with small grids', () => {
      expect(isInBounds({ row: 0, col: 0 }, 1, 1)).toBe(true);
      expect(isInBounds({ row: 1, col: 0 }, 1, 1)).toBe(false);
    });
  });
});

// ============================================================================
// Grid Generation
// ============================================================================

describe('Grid Generation', () => {
  describe('createRectangularGrid', () => {
    it('should create a grid with correct number of cells', () => {
      const grid = createRectangularGrid(3, 4);
      expect(grid).toHaveLength(12);
    });

    it('should create cells in row-major order', () => {
      const grid = createRectangularGrid(2, 3);
      expect(grid).toEqual([
        { row: 0, col: 0 },
        { row: 0, col: 1 },
        { row: 0, col: 2 },
        { row: 1, col: 0 },
        { row: 1, col: 1 },
        { row: 1, col: 2 },
      ]);
    });

    it('should handle 1x1 grid', () => {
      const grid = createRectangularGrid(1, 1);
      expect(grid).toEqual([{ row: 0, col: 0 }]);
    });

    it('should handle empty grid', () => {
      const grid = createRectangularGrid(0, 0);
      expect(grid).toEqual([]);
    });
  });
});

// ============================================================================
// Pixel Conversion
// ============================================================================

describe('Pixel Conversion', () => {
  describe('gridToPixel', () => {
    it('should convert grid coordinate to pixel center', () => {
      const result = gridToPixel({ row: 0, col: 0 }, 40);
      expect(result).toEqual({ x: 20, y: 20 }); // Center of first cell
    });

    it('should account for cell size', () => {
      const result = gridToPixel({ row: 1, col: 1 }, 50);
      expect(result).toEqual({ x: 75, y: 75 }); // 50 + 25
    });

    it('should handle custom origin', () => {
      const result = gridToPixel({ row: 0, col: 0 }, 40, { x: 10, y: 20 });
      expect(result).toEqual({ x: 30, y: 40 }); // 10 + 20, 20 + 20
    });
  });

  describe('getCellRect', () => {
    it('should return rectangle for a cell', () => {
      const rect = getCellRect({ x: 20, y: 20 }, 40);
      expect(rect.width).toBe(36); // 40 - 2*2 padding
      expect(rect.height).toBe(36);
    });

    it('should handle custom padding', () => {
      const rect = getCellRect({ x: 20, y: 20 }, 40, 5);
      expect(rect.width).toBe(30); // 40 - 2*5 padding
      expect(rect.height).toBe(30);
    });
  });

  describe('getGridBounds', () => {
    it('should return grid dimensions in pixels', () => {
      const bounds = getGridBounds(3, 4, 40);
      expect(bounds).toEqual({ width: 160, height: 120 });
    });
  });
});

// ============================================================================
// Direction Utilities
// ============================================================================

describe('Direction Utilities', () => {
  describe('SQUARE_DIRECTIONS constant', () => {
    it('should have correct direction vectors', () => {
      expect(SQUARE_DIRECTIONS.N).toEqual({ row: -1, col: 0 });
      expect(SQUARE_DIRECTIONS.E).toEqual({ row: 0, col: 1 });
      expect(SQUARE_DIRECTIONS.S).toEqual({ row: 1, col: 0 });
      expect(SQUARE_DIRECTIONS.W).toEqual({ row: 0, col: -1 });
    });
  });

  describe('DIRECTION_ORDER constant', () => {
    it('should contain all four directions', () => {
      expect(DIRECTION_ORDER).toEqual(['N', 'E', 'S', 'W']);
    });
  });

  describe('AXIS_ORDER constant', () => {
    it('should contain both axes', () => {
      expect(AXIS_ORDER).toEqual(['N_S', 'E_W']);
    });
  });

  describe('DIRECTION_ANGLES constant', () => {
    it('should have correct angles for rendering', () => {
      expect(DIRECTION_ANGLES.N).toBe(-90);
      expect(DIRECTION_ANGLES.E).toBe(0);
      expect(DIRECTION_ANGLES.S).toBe(90);
      expect(DIRECTION_ANGLES.W).toBe(180);
    });
  });

  describe('AXIS_ANGLES constant', () => {
    it('should have correct angles for bidirectional arrows', () => {
      expect(AXIS_ANGLES.N_S).toBe(90);
      expect(AXIS_ANGLES.E_W).toBe(0);
    });
  });

  describe('isBidirectional', () => {
    it('should return true for axes', () => {
      expect(isBidirectional('N_S')).toBe(true);
      expect(isBidirectional('E_W')).toBe(true);
    });

    it('should return false for single directions', () => {
      expect(isBidirectional('N')).toBe(false);
      expect(isBidirectional('E')).toBe(false);
      expect(isBidirectional('S')).toBe(false);
      expect(isBidirectional('W')).toBe(false);
    });
  });

  describe('getAxisDirections', () => {
    it('should return N and S for N_S axis', () => {
      expect(getAxisDirections('N_S')).toEqual(['N', 'S']);
    });

    it('should return E and W for E_W axis', () => {
      expect(getAxisDirections('E_W')).toEqual(['E', 'W']);
    });
  });

  describe('getOppositeDirection', () => {
    it('should return opposite direction', () => {
      expect(getOppositeDirection('N')).toBe('S');
      expect(getOppositeDirection('S')).toBe('N');
      expect(getOppositeDirection('E')).toBe('W');
      expect(getOppositeDirection('W')).toBe('E');
    });

    it('should be symmetric', () => {
      const directions: SquareDirection[] = ['N', 'E', 'S', 'W'];
      for (const dir of directions) {
        expect(getOppositeDirection(getOppositeDirection(dir))).toBe(dir);
      }
    });
  });
});

// ============================================================================
// Block Counting Functions
// ============================================================================

describe('Block Counting Functions', () => {
  describe('countBlocksInDirection', () => {
    it('should return 0 when no blocks in path', () => {
      const blocks = new Map<string, unknown>();
      const holes = new Set<string>();
      const count = countBlocksInDirection({ row: 2, col: 2 }, 'E', blocks, holes, 5, 5);
      expect(count).toBe(0);
    });

    it('should count blocks in the path', () => {
      const blocks = createBlockMap([
        createTestBlock(2, 3, 'N'),
        createTestBlock(2, 4, 'N'),
      ]);
      const holes = new Set<string>();
      const count = countBlocksInDirection({ row: 2, col: 2 }, 'E', blocks, holes, 5, 5);
      expect(count).toBe(2);
    });

    it('should stop counting at holes', () => {
      const blocks = createBlockMap([
        createTestBlock(2, 4, 'N'), // Beyond the hole
      ]);
      const holes = createHoleSet([{ row: 2, col: 3 }]);
      const count = countBlocksInDirection({ row: 2, col: 2 }, 'E', blocks, holes, 5, 5);
      expect(count).toBe(0); // Hole found before block
    });

    it('should stop at grid boundary', () => {
      const blocks = new Map<string, unknown>();
      const holes = new Set<string>();
      const count = countBlocksInDirection({ row: 2, col: 2 }, 'N', blocks, holes, 3, 3);
      expect(count).toBe(0); // Goes out of bounds
    });
  });

  describe('getMinBlocksAhead', () => {
    it('should return count for single direction', () => {
      const blocks = createBlockMap([createTestBlock(2, 3, 'N')]);
      const holes = new Set<string>();
      const count = getMinBlocksAhead({ row: 2, col: 2 }, 'E', blocks, holes, 5, 5);
      expect(count).toBe(1);
    });

    it('should return minimum of both directions for bidirectional', () => {
      // Block only to the south
      const blocks = createBlockMap([createTestBlock(3, 2, 'N')]);
      const holes = new Set<string>();
      const count = getMinBlocksAhead({ row: 2, col: 2 }, 'N_S', blocks, holes, 5, 5);
      expect(count).toBe(0); // North is clear (min of 0 and 1)
    });

    it('should handle both directions having blocks', () => {
      const blocks = createBlockMap([
        createTestBlock(0, 2, 'S'), // North of center
        createTestBlock(1, 2, 'S'), // Also north
        createTestBlock(4, 2, 'N'), // South of center
      ]);
      const holes = new Set<string>();
      const count = getMinBlocksAhead({ row: 2, col: 2 }, 'N_S', blocks, holes, 5, 5);
      expect(count).toBe(1); // min(2 north, 1 south) = 1
    });
  });

  describe('getBlocksAheadColor', () => {
    it('should return green for 0 blocks', () => {
      expect(getBlocksAheadColor(0)).toBe('#22c55e');
    });

    it('should return lime for 1 block', () => {
      expect(getBlocksAheadColor(1)).toBe('#84cc16');
    });

    it('should return yellow for 2 blocks', () => {
      expect(getBlocksAheadColor(2)).toBe('#eab308');
    });

    it('should return orange for 3 blocks', () => {
      expect(getBlocksAheadColor(3)).toBe('#f97316');
    });

    it('should return red for 4+ blocks', () => {
      expect(getBlocksAheadColor(4)).toBe('#ef4444');
      expect(getBlocksAheadColor(10)).toBe('#ef4444');
    });
  });
});
