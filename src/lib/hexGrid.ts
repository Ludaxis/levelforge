/**
 * Hexagonal Grid Utilities
 * Based on Red Blob Games: https://www.redblobgames.com/grids/hexagons/
 *
 * Uses axial coordinates (q, r) as primary storage format
 * Supports pointy-top orientation
 */

// ============================================================================
// Types
// ============================================================================

export interface AxialCoord {
  q: number;
  r: number;
}

export interface CubeCoord {
  q: number;
  r: number;
  s: number;
}

export interface PixelCoord {
  x: number;
  y: number;
}

export type HexDirection = 'NE' | 'E' | 'SE' | 'SW' | 'W' | 'NW';

// ============================================================================
// Constants
// ============================================================================

// Direction vectors for pointy-top hexagons
export const HEX_DIRECTIONS: Record<HexDirection, AxialCoord> = {
  NE: { q: 1, r: -1 },
  E: { q: 1, r: 0 },
  SE: { q: 0, r: 1 },
  SW: { q: -1, r: 1 },
  W: { q: -1, r: 0 },
  NW: { q: 0, r: -1 },
};

// Direction order for iteration (clockwise from NE)
export const DIRECTION_ORDER: HexDirection[] = ['NE', 'E', 'SE', 'SW', 'W', 'NW'];

// ============================================================================
// Coordinate Key Utilities
// ============================================================================

export function hexKey(hex: AxialCoord): string {
  return `${hex.q},${hex.r}`;
}

export function parseHexKey(key: string): AxialCoord {
  const [q, r] = key.split(',').map(Number);
  return { q, r };
}

// ============================================================================
// Coordinate Conversions
// ============================================================================

export function axialToCube(hex: AxialCoord): CubeCoord {
  return {
    q: hex.q,
    r: hex.r,
    s: -hex.q - hex.r,
  };
}

export function cubeToAxial(cube: CubeCoord): AxialCoord {
  return {
    q: cube.q,
    r: cube.r,
  };
}

/**
 * Convert axial coordinates to pixel position (pointy-top orientation)
 * @param hex - Axial coordinates
 * @param size - Hex size (circumradius - center to vertex)
 * @param origin - Optional origin offset
 */
export function axialToPixel(
  hex: AxialCoord,
  size: number,
  origin: PixelCoord = { x: 0, y: 0 }
): PixelCoord {
  const x = size * (Math.sqrt(3) * hex.q + (Math.sqrt(3) / 2) * hex.r);
  const y = size * ((3 / 2) * hex.r);
  return {
    x: x + origin.x,
    y: y + origin.y,
  };
}

/**
 * Convert pixel position to axial coordinates (pointy-top orientation)
 * @param pixel - Pixel position
 * @param size - Hex size (circumradius)
 * @param origin - Optional origin offset
 */
export function pixelToAxial(
  pixel: PixelCoord,
  size: number,
  origin: PixelCoord = { x: 0, y: 0 }
): AxialCoord {
  const px = pixel.x - origin.x;
  const py = pixel.y - origin.y;

  const q = ((Math.sqrt(3) / 3) * px - (1 / 3) * py) / size;
  const r = ((2 / 3) * py) / size;

  return cubeRound({ q, r, s: -q - r });
}

// ============================================================================
// Rounding (for pixel-to-hex conversion)
// ============================================================================

export function cubeRound(cube: CubeCoord): AxialCoord {
  let rq = Math.round(cube.q);
  let rr = Math.round(cube.r);
  let rs = Math.round(cube.s);

  const dq = Math.abs(rq - cube.q);
  const dr = Math.abs(rr - cube.r);
  const ds = Math.abs(rs - cube.s);

  if (dq > dr && dq > ds) {
    rq = -rr - rs;
  } else if (dr > ds) {
    rr = -rq - rs;
  } else {
    rs = -rq - rr;
  }

  return { q: rq, r: rr };
}

// ============================================================================
// Hex Arithmetic
// ============================================================================

export function hexAdd(a: AxialCoord, b: AxialCoord): AxialCoord {
  return { q: a.q + b.q, r: a.r + b.r };
}

export function hexSubtract(a: AxialCoord, b: AxialCoord): AxialCoord {
  return { q: a.q - b.q, r: a.r - b.r };
}

export function hexMultiply(hex: AxialCoord, k: number): AxialCoord {
  return { q: hex.q * k, r: hex.r * k };
}

export function hexEquals(a: AxialCoord, b: AxialCoord): boolean {
  return a.q === b.q && a.r === b.r;
}

// ============================================================================
// Neighbors & Distance
// ============================================================================

export function getNeighbor(hex: AxialCoord, direction: HexDirection): AxialCoord {
  return hexAdd(hex, HEX_DIRECTIONS[direction]);
}

export function getNeighbors(hex: AxialCoord): AxialCoord[] {
  return DIRECTION_ORDER.map((dir) => getNeighbor(hex, dir));
}

export function getDistance(a: AxialCoord, b: AxialCoord): number {
  const cube1 = axialToCube(a);
  const cube2 = axialToCube(b);
  return Math.max(
    Math.abs(cube1.q - cube2.q),
    Math.abs(cube1.r - cube2.r),
    Math.abs(cube1.s - cube2.s)
  );
}

// ============================================================================
// Range & Area
// ============================================================================

/**
 * Get all hexes within N steps from center
 */
export function getHexesInRange(center: AxialCoord, range: number): AxialCoord[] {
  const results: AxialCoord[] = [];
  for (let q = -range; q <= range; q++) {
    for (let r = Math.max(-range, -q - range); r <= Math.min(range, -q + range); r++) {
      results.push(hexAdd(center, { q, r }));
    }
  }
  return results;
}

/**
 * Get hexes forming a ring at distance N from center
 */
export function getHexRing(center: AxialCoord, radius: number): AxialCoord[] {
  if (radius === 0) return [center];

  const results: AxialCoord[] = [];
  let hex = hexAdd(center, hexMultiply(HEX_DIRECTIONS.SW, radius));

  for (const dir of DIRECTION_ORDER) {
    for (let i = 0; i < radius; i++) {
      results.push(hex);
      hex = getNeighbor(hex, dir);
    }
  }

  return results;
}

// ============================================================================
// Line Drawing
// ============================================================================

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function cubeLerp(a: CubeCoord, b: CubeCoord, t: number): CubeCoord {
  return {
    q: lerp(a.q, b.q, t),
    r: lerp(a.r, b.r, t),
    s: lerp(a.s, b.s, t),
  };
}

/**
 * Get all hexes along a line from A to B
 */
export function getLine(a: AxialCoord, b: AxialCoord): AxialCoord[] {
  const distance = getDistance(a, b);
  if (distance === 0) return [a];

  const cubeA = axialToCube(a);
  const cubeB = axialToCube(b);
  const results: AxialCoord[] = [];

  for (let i = 0; i <= distance; i++) {
    const t = i / distance;
    results.push(cubeRound(cubeLerp(cubeA, cubeB, t)));
  }

  return results;
}

/**
 * Get all hexes from start going in direction until reaching a boundary
 * @param start - Starting hex
 * @param direction - Direction to travel
 * @param isValid - Function to check if a hex is within bounds
 * @returns Array of hexes along the path (excluding start)
 */
export function getPathInDirection(
  start: AxialCoord,
  direction: HexDirection,
  isValid: (hex: AxialCoord) => boolean
): AxialCoord[] {
  const path: AxialCoord[] = [];
  let current = getNeighbor(start, direction);

  while (isValid(current)) {
    path.push(current);
    current = getNeighbor(current, direction);
  }

  return path;
}

// ============================================================================
// Grid Generation
// ============================================================================

/**
 * Create a hexagon-shaped grid with given radius
 * Radius 0 = 1 hex, Radius 1 = 7 hexes, Radius 2 = 19 hexes, etc.
 */
export function createHexagonalGrid(radius: number): AxialCoord[] {
  return getHexesInRange({ q: 0, r: 0 }, radius);
}

/**
 * Create a rectangular grid of hexes
 * Uses offset coordinates internally, returns axial
 */
export function createRectangularGrid(width: number, height: number): AxialCoord[] {
  const results: AxialCoord[] = [];
  for (let row = 0; row < height; row++) {
    const offset = Math.floor(row / 2);
    for (let col = -offset; col < width - offset; col++) {
      results.push({ q: col, r: row });
    }
  }
  return results;
}

// ============================================================================
// Hex Polygon Points (for SVG rendering)
// ============================================================================

/**
 * Get the 6 corner points of a hex (pointy-top orientation)
 * @param center - Pixel position of hex center
 * @param size - Hex size (circumradius)
 */
export function getHexCorners(center: PixelCoord, size: number): PixelCoord[] {
  const corners: PixelCoord[] = [];
  for (let i = 0; i < 6; i++) {
    const angleDeg = 60 * i - 30; // Pointy-top starts at -30°
    const angleRad = (Math.PI / 180) * angleDeg;
    corners.push({
      x: center.x + size * Math.cos(angleRad),
      y: center.y + size * Math.sin(angleRad),
    });
  }
  return corners;
}

/**
 * Get SVG polygon points string for a hex
 */
export function getHexPolygonPoints(center: PixelCoord, size: number): string {
  return getHexCorners(center, size)
    .map((p) => `${p.x},${p.y}`)
    .join(' ');
}

// ============================================================================
// Grid Bounds
// ============================================================================

/**
 * Check if a hex is within a hexagonal grid of given radius
 */
export function isInHexagonalBounds(hex: AxialCoord, radius: number): boolean {
  const cube = axialToCube(hex);
  return Math.max(Math.abs(cube.q), Math.abs(cube.r), Math.abs(cube.s)) <= radius;
}

/**
 * Get the bounding box in pixels for a set of hexes
 */
export function getGridBounds(
  hexes: AxialCoord[],
  size: number
): { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number } {
  if (hexes.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const hex of hexes) {
    const pixel = axialToPixel(hex, size);
    const corners = getHexCorners(pixel, size);
    for (const corner of corners) {
      minX = Math.min(minX, corner.x);
      minY = Math.min(minY, corner.y);
      maxX = Math.max(maxX, corner.x);
      maxY = Math.max(maxY, corner.y);
    }
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}
