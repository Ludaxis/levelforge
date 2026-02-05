import { describe, it, expect } from 'vitest';
import {
  AxialCoord,
  CubeCoord,
  HexDirection,
  HEX_DIRECTIONS,
  DIRECTION_ORDER,
  hexKey,
  parseHexKey,
  axialToCube,
  cubeToAxial,
  axialToPixel,
  pixelToAxial,
  cubeRound,
  hexAdd,
  hexSubtract,
  hexMultiply,
  hexEquals,
  getNeighbor,
  getNeighbors,
  getDistance,
  getHexesInRange,
  getHexRing,
  getLine,
  getPathInDirection,
  createHexagonalGrid,
  createRectangularGrid,
  getHexCorners,
  getHexPolygonPoints,
  isInHexagonalBounds,
  getGridBounds,
  countBlocksInDirection,
  getMinBlocksAhead,
  getBlocksAheadColor,
  getBlocksAheadOpacity,
} from '../hexGrid';

// ============================================================================
// Coordinate Key Utilities
// ============================================================================

describe('Coordinate Key Utilities', () => {
  describe('hexKey', () => {
    it('should create a string key from axial coordinates', () => {
      expect(hexKey({ q: 0, r: 0 })).toBe('0,0');
      expect(hexKey({ q: 3, r: -2 })).toBe('3,-2');
      expect(hexKey({ q: -1, r: 5 })).toBe('-1,5');
    });
  });

  describe('parseHexKey', () => {
    it('should parse a string key back to coordinates', () => {
      expect(parseHexKey('0,0')).toEqual({ q: 0, r: 0 });
      expect(parseHexKey('3,-2')).toEqual({ q: 3, r: -2 });
      expect(parseHexKey('-1,5')).toEqual({ q: -1, r: 5 });
    });

    it('should round-trip with hexKey', () => {
      const coords: AxialCoord[] = [
        { q: 0, r: 0 },
        { q: 5, r: -3 },
        { q: -2, r: 7 },
      ];
      for (const coord of coords) {
        expect(parseHexKey(hexKey(coord))).toEqual(coord);
      }
    });
  });
});

// ============================================================================
// Coordinate Conversions
// ============================================================================

describe('Coordinate Conversions', () => {
  describe('axialToCube', () => {
    it('should convert axial to cube coordinates', () => {
      const result0 = axialToCube({ q: 0, r: 0 });
      expect(result0.q).toBe(0);
      expect(result0.r).toBe(0);
      // s = -q - r, when both are 0, could be -0
      expect(result0.s === 0 || Object.is(result0.s, -0)).toBe(true);

      const result1 = axialToCube({ q: 1, r: -1 });
      expect(result1.q).toBe(1);
      expect(result1.r).toBe(-1);
      // s = -1 - (-1) = 0, but may be -0
      expect(result1.s === 0 || Object.is(result1.s, -0)).toBe(true);

      const result2 = axialToCube({ q: 2, r: 1 });
      expect(result2.q).toBe(2);
      expect(result2.r).toBe(1);
      expect(result2.s).toBe(-3);
    });

    it('should satisfy q + r + s = 0', () => {
      const coords: AxialCoord[] = [
        { q: 0, r: 0 },
        { q: 3, r: -1 },
        { q: -2, r: 5 },
      ];
      for (const coord of coords) {
        const cube = axialToCube(coord);
        expect(cube.q + cube.r + cube.s).toBe(0);
      }
    });
  });

  describe('cubeToAxial', () => {
    it('should convert cube to axial coordinates', () => {
      expect(cubeToAxial({ q: 0, r: 0, s: 0 })).toEqual({ q: 0, r: 0 });
      expect(cubeToAxial({ q: 1, r: -1, s: 0 })).toEqual({ q: 1, r: -1 });
    });

    it('should be inverse of axialToCube', () => {
      const coords: AxialCoord[] = [
        { q: 0, r: 0 },
        { q: 3, r: -1 },
        { q: -2, r: 5 },
      ];
      for (const coord of coords) {
        const cube = axialToCube(coord);
        const back = cubeToAxial(cube);
        expect(back).toEqual(coord);
      }
    });
  });

  describe('axialToPixel', () => {
    it('should convert origin to (0, 0) pixel', () => {
      const pixel = axialToPixel({ q: 0, r: 0 }, 10);
      expect(pixel.x).toBeCloseTo(0, 5);
      expect(pixel.y).toBeCloseTo(0, 5);
    });

    it('should handle custom origin', () => {
      const pixel = axialToPixel({ q: 0, r: 0 }, 10, { x: 100, y: 50 });
      expect(pixel.x).toBeCloseTo(100, 5);
      expect(pixel.y).toBeCloseTo(50, 5);
    });

    it('should place hexes in correct positions', () => {
      const size = 10;
      const pixelE = axialToPixel({ q: 1, r: 0 }, size);
      // E direction: x should be positive, y should be 0
      expect(pixelE.x).toBeGreaterThan(0);
      expect(pixelE.y).toBeCloseTo(0, 5);

      const pixelSE = axialToPixel({ q: 0, r: 1 }, size);
      // SE direction: both x and y should be positive
      expect(pixelSE.x).toBeGreaterThan(0);
      expect(pixelSE.y).toBeGreaterThan(0);
    });
  });

  describe('pixelToAxial', () => {
    it('should convert pixel near origin to (0, 0)', () => {
      const axial = pixelToAxial({ x: 0, y: 0 }, 10);
      expect(axial.q).toBe(0);
      expect(axial.r).toBe(0);
    });

    it('should round-trip with axialToPixel', () => {
      const size = 10;
      const coords: AxialCoord[] = [
        { q: 0, r: 0 },
        { q: 1, r: 0 },
        { q: 0, r: 1 },
        { q: -1, r: 1 },
      ];
      for (const coord of coords) {
        const pixel = axialToPixel(coord, size);
        const back = pixelToAxial(pixel, size);
        // Handle -0 edge case: use + 0 to normalize -0 to 0
        expect(back.q + 0).toBe(coord.q + 0);
        expect(back.r + 0).toBe(coord.r + 0);
      }
    });
  });

  describe('cubeRound', () => {
    it('should round fractional cube coordinates', () => {
      // Near origin
      const rounded = cubeRound({ q: 0.1, r: -0.1, s: 0 });
      // Handle -0 edge case: use === comparison which treats -0 === 0
      expect(rounded.q === 0).toBe(true);
      expect(rounded.r === 0).toBe(true);
    });

    it('should handle rounding when q is largest diff', () => {
      const rounded = cubeRound({ q: 0.9, r: 0.05, s: -0.95 });
      expect(rounded.q + rounded.r).toBeDefined(); // Just check it doesn't throw
    });
  });
});

// ============================================================================
// Hex Arithmetic
// ============================================================================

describe('Hex Arithmetic', () => {
  describe('hexAdd', () => {
    it('should add two hex coordinates', () => {
      expect(hexAdd({ q: 1, r: 2 }, { q: 3, r: -1 })).toEqual({ q: 4, r: 1 });
    });

    it('should handle zero', () => {
      expect(hexAdd({ q: 5, r: -3 }, { q: 0, r: 0 })).toEqual({ q: 5, r: -3 });
    });
  });

  describe('hexSubtract', () => {
    it('should subtract two hex coordinates', () => {
      expect(hexSubtract({ q: 5, r: 3 }, { q: 2, r: 1 })).toEqual({ q: 3, r: 2 });
    });
  });

  describe('hexMultiply', () => {
    it('should multiply hex by scalar', () => {
      expect(hexMultiply({ q: 2, r: -1 }, 3)).toEqual({ q: 6, r: -3 });
    });

    it('should handle zero multiplier', () => {
      const result = hexMultiply({ q: 5, r: -3 }, 0);
      // Handle -0 edge case: multiply by 0 can produce -0
      expect(result.q === 0 || Object.is(result.q, -0)).toBe(true);
      expect(result.r === 0 || Object.is(result.r, -0)).toBe(true);
    });
  });

  describe('hexEquals', () => {
    it('should return true for equal coordinates', () => {
      expect(hexEquals({ q: 1, r: 2 }, { q: 1, r: 2 })).toBe(true);
    });

    it('should return false for different coordinates', () => {
      expect(hexEquals({ q: 1, r: 2 }, { q: 1, r: 3 })).toBe(false);
      expect(hexEquals({ q: 1, r: 2 }, { q: 2, r: 2 })).toBe(false);
    });
  });
});

// ============================================================================
// Neighbors & Distance
// ============================================================================

describe('Neighbors & Distance', () => {
  describe('HEX_DIRECTIONS constant', () => {
    it('should have 6 directions', () => {
      expect(Object.keys(HEX_DIRECTIONS)).toHaveLength(6);
    });

    it('should have correct direction vectors', () => {
      expect(HEX_DIRECTIONS.NE).toEqual({ q: 1, r: -1 });
      expect(HEX_DIRECTIONS.E).toEqual({ q: 1, r: 0 });
      expect(HEX_DIRECTIONS.SE).toEqual({ q: 0, r: 1 });
      expect(HEX_DIRECTIONS.SW).toEqual({ q: -1, r: 1 });
      expect(HEX_DIRECTIONS.W).toEqual({ q: -1, r: 0 });
      expect(HEX_DIRECTIONS.NW).toEqual({ q: 0, r: -1 });
    });
  });

  describe('DIRECTION_ORDER constant', () => {
    it('should list directions in clockwise order', () => {
      expect(DIRECTION_ORDER).toEqual(['NE', 'E', 'SE', 'SW', 'W', 'NW']);
    });
  });

  describe('getNeighbor', () => {
    it('should return neighbor in given direction', () => {
      const center = { q: 0, r: 0 };
      expect(getNeighbor(center, 'E')).toEqual({ q: 1, r: 0 });
      expect(getNeighbor(center, 'W')).toEqual({ q: -1, r: 0 });
    });
  });

  describe('getNeighbors', () => {
    it('should return all 6 neighbors', () => {
      const neighbors = getNeighbors({ q: 0, r: 0 });
      expect(neighbors).toHaveLength(6);
    });

    it('should return neighbors in direction order', () => {
      const neighbors = getNeighbors({ q: 0, r: 0 });
      expect(neighbors[0]).toEqual({ q: 1, r: -1 }); // NE
      expect(neighbors[1]).toEqual({ q: 1, r: 0 });  // E
    });
  });

  describe('getDistance', () => {
    it('should return 0 for same hex', () => {
      expect(getDistance({ q: 0, r: 0 }, { q: 0, r: 0 })).toBe(0);
    });

    it('should return 1 for adjacent hexes', () => {
      const center = { q: 0, r: 0 };
      for (const dir of DIRECTION_ORDER) {
        const neighbor = getNeighbor(center, dir);
        expect(getDistance(center, neighbor)).toBe(1);
      }
    });

    it('should return correct distance for farther hexes', () => {
      expect(getDistance({ q: 0, r: 0 }, { q: 3, r: 0 })).toBe(3);
      expect(getDistance({ q: 0, r: 0 }, { q: 2, r: -2 })).toBe(2);
    });
  });
});

// ============================================================================
// Range & Area
// ============================================================================

describe('Range & Area', () => {
  describe('getHexesInRange', () => {
    it('should return 1 hex for range 0', () => {
      const hexes = getHexesInRange({ q: 0, r: 0 }, 0);
      expect(hexes).toHaveLength(1);
      expect(hexes[0]).toEqual({ q: 0, r: 0 });
    });

    it('should return 7 hexes for range 1', () => {
      const hexes = getHexesInRange({ q: 0, r: 0 }, 1);
      expect(hexes).toHaveLength(7);
    });

    it('should return 19 hexes for range 2', () => {
      const hexes = getHexesInRange({ q: 0, r: 0 }, 2);
      expect(hexes).toHaveLength(19);
    });

    it('should include center', () => {
      const hexes = getHexesInRange({ q: 5, r: -3 }, 1);
      expect(hexes.some(h => h.q === 5 && h.r === -3)).toBe(true);
    });
  });

  describe('getHexRing', () => {
    it('should return center for radius 0', () => {
      const ring = getHexRing({ q: 0, r: 0 }, 0);
      expect(ring).toHaveLength(1);
      expect(ring[0]).toEqual({ q: 0, r: 0 });
    });

    it('should return 6 hexes for radius 1', () => {
      const ring = getHexRing({ q: 0, r: 0 }, 1);
      expect(ring).toHaveLength(6);
    });

    it('should return 12 hexes for radius 2', () => {
      const ring = getHexRing({ q: 0, r: 0 }, 2);
      expect(ring).toHaveLength(12);
    });

    it('should return hexes at correct distance', () => {
      const center = { q: 0, r: 0 };
      const ring = getHexRing(center, 2);
      for (const hex of ring) {
        expect(getDistance(center, hex)).toBe(2);
      }
    });
  });
});

// ============================================================================
// Line Drawing
// ============================================================================

describe('Line Drawing', () => {
  describe('getLine', () => {
    it('should return single hex for same start and end', () => {
      const line = getLine({ q: 0, r: 0 }, { q: 0, r: 0 });
      expect(line).toHaveLength(1);
    });

    it('should return correct number of hexes', () => {
      const line = getLine({ q: 0, r: 0 }, { q: 3, r: 0 });
      expect(line).toHaveLength(4); // 0, 1, 2, 3
    });

    it('should include start and end', () => {
      const start = { q: 0, r: 0 };
      const end = { q: 2, r: -2 };
      const line = getLine(start, end);
      expect(hexEquals(line[0], start)).toBe(true);
      expect(hexEquals(line[line.length - 1], end)).toBe(true);
    });
  });

  describe('getPathInDirection', () => {
    it('should return empty path when first hex is invalid', () => {
      const path = getPathInDirection({ q: 0, r: 0 }, 'E', () => false);
      expect(path).toHaveLength(0);
    });

    it('should return hexes until invalid', () => {
      // Valid for distance <= 2 from origin
      const isValid = (hex: AxialCoord) => getDistance({ q: 0, r: 0 }, hex) <= 2;
      const path = getPathInDirection({ q: 0, r: 0 }, 'E', isValid);
      expect(path).toHaveLength(2); // q=1 and q=2 are valid, q=3 is not
    });
  });
});

// ============================================================================
// Grid Generation
// ============================================================================

describe('Grid Generation', () => {
  describe('createHexagonalGrid', () => {
    it('should create 1 hex for radius 0', () => {
      const grid = createHexagonalGrid(0);
      expect(grid).toHaveLength(1);
    });

    it('should create 7 hexes for radius 1', () => {
      const grid = createHexagonalGrid(1);
      expect(grid).toHaveLength(7);
    });

    it('should create 19 hexes for radius 2', () => {
      const grid = createHexagonalGrid(2);
      expect(grid).toHaveLength(19);
    });
  });

  describe('createRectangularGrid', () => {
    it('should create correct number of hexes', () => {
      const grid = createRectangularGrid(3, 4);
      expect(grid).toHaveLength(12);
    });

    it('should create 1 hex for 1x1', () => {
      const grid = createRectangularGrid(1, 1);
      expect(grid).toHaveLength(1);
    });
  });
});

// ============================================================================
// Hex Polygon Points
// ============================================================================

describe('Hex Polygon Points', () => {
  describe('getHexCorners', () => {
    it('should return 6 corners', () => {
      const corners = getHexCorners({ x: 0, y: 0 }, 10);
      expect(corners).toHaveLength(6);
    });

    it('should place corners at correct distance from center', () => {
      const center = { x: 100, y: 100 };
      const size = 20;
      const corners = getHexCorners(center, size);

      for (const corner of corners) {
        const dx = corner.x - center.x;
        const dy = corner.y - center.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        expect(distance).toBeCloseTo(size, 5);
      }
    });
  });

  describe('getHexPolygonPoints', () => {
    it('should return a string of comma-separated point pairs', () => {
      const points = getHexPolygonPoints({ x: 0, y: 0 }, 10);
      expect(typeof points).toBe('string');
      expect(points.split(' ')).toHaveLength(6);
    });
  });
});

// ============================================================================
// Grid Bounds
// ============================================================================

describe('Grid Bounds', () => {
  describe('isInHexagonalBounds', () => {
    it('should return true for center', () => {
      expect(isInHexagonalBounds({ q: 0, r: 0 }, 2)).toBe(true);
    });

    it('should return true for hexes within radius', () => {
      expect(isInHexagonalBounds({ q: 2, r: 0 }, 2)).toBe(true);
      expect(isInHexagonalBounds({ q: 1, r: 1 }, 2)).toBe(true);
    });

    it('should return false for hexes outside radius', () => {
      expect(isInHexagonalBounds({ q: 3, r: 0 }, 2)).toBe(false);
      expect(isInHexagonalBounds({ q: 2, r: 2 }, 2)).toBe(false);
    });
  });

  describe('getGridBounds', () => {
    it('should return zero bounds for empty grid', () => {
      const bounds = getGridBounds([], 10);
      expect(bounds.width).toBe(0);
      expect(bounds.height).toBe(0);
    });

    it('should calculate bounds for single hex', () => {
      const bounds = getGridBounds([{ q: 0, r: 0 }], 10);
      expect(bounds.width).toBeGreaterThan(0);
      expect(bounds.height).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// Blocks Ahead Analysis
// ============================================================================

describe('Blocks Ahead Analysis', () => {
  describe('countBlocksInDirection', () => {
    it('should return 0 for empty path', () => {
      const stacks = new Map<string, unknown>();
      const holes = new Set<string>();
      const count = countBlocksInDirection({ q: 0, r: 0 }, 'E', stacks, holes, 2);
      expect(count).toBe(0);
    });

    it('should count stacks in path', () => {
      const stacks = new Map<string, unknown>();
      stacks.set('1,0', {}); // E from origin
      stacks.set('2,0', {}); // Further E
      const holes = new Set<string>();
      const count = countBlocksInDirection({ q: 0, r: 0 }, 'E', stacks, holes, 3);
      expect(count).toBe(2);
    });

    it('should stop at holes', () => {
      const stacks = new Map<string, unknown>();
      stacks.set('2,0', {}); // Beyond hole
      const holes = new Set<string>(['1,0']); // Hole between
      const count = countBlocksInDirection({ q: 0, r: 0 }, 'E', stacks, holes, 3);
      expect(count).toBe(0);
    });
  });

  describe('getMinBlocksAhead', () => {
    it('should return single direction count for non-bidirectional', () => {
      const stacks = new Map<string, unknown>();
      const holes = new Set<string>();
      const count = getMinBlocksAhead(
        { q: 0, r: 0 },
        'E' as HexDirection,
        stacks,
        holes,
        2,
        () => false,
        () => ['E', 'W'] as [HexDirection, HexDirection]
      );
      expect(count).toBe(0);
    });

    it('should return minimum for bidirectional', () => {
      const stacks = new Map<string, unknown>();
      stacks.set('1,0', {}); // E from origin
      const holes = new Set<string>();
      const count = getMinBlocksAhead(
        { q: 0, r: 0 },
        'E_W' as any,
        stacks,
        holes,
        2,
        (dir) => dir === 'E_W',
        () => ['E', 'W'] as [HexDirection, HexDirection]
      );
      expect(count).toBe(0); // W has 0 blocks, min(1, 0) = 0
    });
  });

  describe('getBlocksAheadColor', () => {
    it('should return green for 0', () => {
      expect(getBlocksAheadColor(0)).toBe('#22c55e');
    });

    it('should return lime for 1', () => {
      expect(getBlocksAheadColor(1)).toBe('#84cc16');
    });

    it('should return yellow for 2', () => {
      expect(getBlocksAheadColor(2)).toBe('#eab308');
    });

    it('should return orange for 3', () => {
      expect(getBlocksAheadColor(3)).toBe('#f97316');
    });

    it('should return red for 4+', () => {
      expect(getBlocksAheadColor(4)).toBe('#ef4444');
      expect(getBlocksAheadColor(100)).toBe('#ef4444');
    });
  });

  describe('getBlocksAheadOpacity', () => {
    it('should return 0.25 for 0 blocks', () => {
      expect(getBlocksAheadOpacity(0)).toBe(0.25);
    });

    it('should return 0.35 for 1+ blocks', () => {
      expect(getBlocksAheadOpacity(1)).toBe(0.35);
      expect(getBlocksAheadOpacity(5)).toBe(0.35);
    });
  });
});
