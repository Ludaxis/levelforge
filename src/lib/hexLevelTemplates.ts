/**
 * Level Templates - Pre-built patterns for quick level creation
 */

import {
  AxialCoord,
  HexDirection,
  DIRECTION_ORDER,
  hexKey,
  getHexRing,
  getHexesInRange,
  hexAdd,
  HEX_DIRECTIONS,
  isInHexagonalBounds,
} from './hexGrid';
import { HexStack, GameMode, STACK_COLORS, StackColor, generateStackId } from '@/types/hexaBlock';

// ============================================================================
// Template Types
// ============================================================================

export interface LevelTemplate {
  id: string;
  name: string;
  description: string;
  icon: string; // Lucide icon name
  generate: (gridRadius: number, gameMode: GameMode) => {
    stacks: HexStack[];
    holes: AxialCoord[];
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

const COLOR_KEYS = Object.keys(STACK_COLORS) as StackColor[];

function getColor(index: number): string {
  return STACK_COLORS[COLOR_KEYS[index % COLOR_KEYS.length]];
}

function getOppositeDirection(dir: HexDirection): HexDirection {
  const opposites: Record<HexDirection, HexDirection> = {
    NE: 'SW',
    E: 'W',
    SE: 'NW',
    SW: 'NE',
    W: 'E',
    NW: 'SE',
  };
  return opposites[dir];
}

// Direction pointing outward from center for a given hex
function getOutwardDirection(coord: AxialCoord): HexDirection {
  const angle = Math.atan2(coord.r + coord.q * 0.5, coord.q * Math.sqrt(3) / 2);
  const sector = Math.round((angle / Math.PI) * 3 + 3) % 6;
  return DIRECTION_ORDER[sector];
}

// Direction pointing toward center
function getInwardDirection(coord: AxialCoord): HexDirection {
  return getOppositeDirection(getOutwardDirection(coord));
}

// ============================================================================
// Templates
// ============================================================================

const spiralTemplate: LevelTemplate = {
  id: 'spiral',
  name: 'Spiral',
  description: 'Stacks spiral outward from center, all pointing outward',
  icon: 'Disc',
  generate: (gridRadius: number) => {
    const stacks: HexStack[] = [];
    let colorIndex = 0;

    // Generate rings from center outward
    for (let ring = 1; ring <= gridRadius; ring++) {
      const ringCoords = getHexRing({ q: 0, r: 0 }, ring);
      for (const coord of ringCoords) {
        // Create a copy of the coordinate
        const stackCoord: AxialCoord = { q: coord.q, r: coord.r };
        stacks.push({
          id: generateStackId(),
          coord: stackCoord,
          direction: getOutwardDirection(stackCoord),
          color: getColor(colorIndex++),
          height: 1,
        });
      }
    }

    return { stacks, holes: [] };
  },
};

const ringTemplate: LevelTemplate = {
  id: 'ring',
  name: 'Ring',
  description: 'Stacks on outer ring pointing inward',
  icon: 'Circle',
  generate: (gridRadius: number) => {
    const stacks: HexStack[] = [];
    const ring = getHexRing({ q: 0, r: 0 }, gridRadius);
    let colorIndex = 0;

    for (const coord of ring) {
      stacks.push({
        id: generateStackId(),
        coord,
        direction: getInwardDirection(coord),
        color: getColor(colorIndex++),
        height: 1,
      });
    }

    return { stacks, holes: [] };
  },
};

const starTemplate: LevelTemplate = {
  id: 'star',
  name: 'Star',
  description: 'Six arms radiating from center',
  icon: 'Star',
  generate: (gridRadius: number) => {
    const stacks: HexStack[] = [];

    // All 6 directions with their vectors
    const directions: Array<{ dir: HexDirection; vec: AxialCoord }> = [
      { dir: 'NE', vec: { q: 1, r: -1 } },
      { dir: 'E', vec: { q: 1, r: 0 } },
      { dir: 'SE', vec: { q: 0, r: 1 } },
      { dir: 'SW', vec: { q: -1, r: 1 } },
      { dir: 'W', vec: { q: -1, r: 0 } },
      { dir: 'NW', vec: { q: 0, r: -1 } },
    ];

    // Create 6 arms radiating from center
    directions.forEach(({ dir, vec }, armIndex) => {
      for (let step = 1; step <= gridRadius; step++) {
        const coord: AxialCoord = {
          q: vec.q * step,
          r: vec.r * step,
        };

        if (isInHexagonalBounds(coord, gridRadius)) {
          stacks.push({
            id: generateStackId(),
            coord,
            direction: dir,
            color: getColor(armIndex),
            height: 1,
          });
        }
      }
    });

    return { stacks, holes: [] };
  },
};

const crossTemplate: LevelTemplate = {
  id: 'cross',
  name: 'Cross',
  description: 'Plus pattern with stacks pointing outward',
  icon: 'Plus',
  generate: (gridRadius: number) => {
    const stacks: HexStack[] = [];

    // Two axes forming a cross (4 arms)
    const arms: Array<{ dir: HexDirection; vec: AxialCoord }> = [
      { dir: 'E', vec: { q: 1, r: 0 } },
      { dir: 'W', vec: { q: -1, r: 0 } },
      { dir: 'NE', vec: { q: 1, r: -1 } },
      { dir: 'SW', vec: { q: -1, r: 1 } },
    ];

    arms.forEach(({ dir, vec }, armIndex) => {
      for (let step = 1; step <= gridRadius; step++) {
        const coord: AxialCoord = {
          q: vec.q * step,
          r: vec.r * step,
        };

        if (isInHexagonalBounds(coord, gridRadius)) {
          stacks.push({
            id: generateStackId(),
            coord,
            direction: dir,
            color: getColor(armIndex),
            height: 1,
          });
        }
      }
    });

    return { stacks, holes: [] };
  },
};

const scatteredTemplate: LevelTemplate = {
  id: 'scattered',
  name: 'Scattered',
  description: 'Random distribution with varied directions',
  icon: 'Shuffle',
  generate: (gridRadius: number) => {
    const stacks: HexStack[] = [];
    const allCoords = getHexesInRange({ q: 0, r: 0 }, gridRadius).filter(
      (c) => c.q !== 0 || c.r !== 0 // Exclude center
    );

    // Shuffle and take ~40% of cells
    const shuffled = [...allCoords].sort(() => Math.random() - 0.5);
    const count = Math.max(3, Math.floor(allCoords.length * 0.4));
    const selected = shuffled.slice(0, count);

    let colorIndex = 0;
    for (const coord of selected) {
      // Random direction
      const dir = DIRECTION_ORDER[Math.floor(Math.random() * 6)];
      stacks.push({
        id: generateStackId(),
        coord,
        direction: dir,
        color: getColor(colorIndex++),
        height: 1,
      });
    }

    return { stacks, holes: [] };
  },
};

const symmetricTemplate: LevelTemplate = {
  id: 'symmetric',
  name: 'Symmetric',
  description: 'Mirror-symmetric pattern around center',
  icon: 'Maximize2',
  generate: (gridRadius: number) => {
    const stacks: HexStack[] = [];
    const placed = new Set<string>();
    let colorIndex = 0;

    // Place stacks in one sector and mirror
    for (let r = 1; r <= gridRadius; r++) {
      const ring = getHexRing({ q: 0, r: 0 }, r);
      // Take every other hex in the ring for variety
      const selectedFromRing = ring.filter((_, i) => i % 2 === 0);

      for (const coord of selectedFromRing) {
        const key = hexKey(coord);
        if (placed.has(key)) continue;

        // Add this coord
        const dir = getOutwardDirection(coord);
        stacks.push({
          id: generateStackId(),
          coord,
          direction: dir,
          color: getColor(colorIndex),
          height: 1,
        });
        placed.add(key);

        // Add mirror coord (rotate 180 degrees)
        const mirrorCoord = { q: -coord.q, r: -coord.r };
        const mirrorKey = hexKey(mirrorCoord);
        if (!placed.has(mirrorKey) && isInHexagonalBounds(mirrorCoord, gridRadius)) {
          stacks.push({
            id: generateStackId(),
            coord: mirrorCoord,
            direction: getOppositeDirection(dir),
            color: getColor(colorIndex),
            height: 1,
          });
          placed.add(mirrorKey);
        }

        colorIndex++;
      }
    }

    return { stacks, holes: [] };
  },
};

const tunnelTemplate: LevelTemplate = {
  id: 'tunnel',
  name: 'Tunnel',
  description: 'Two parallel lines with a gap, pointing toward gap',
  icon: 'ArrowRightLeft',
  generate: (gridRadius: number) => {
    const stacks: HexStack[] = [];
    let colorIndex = 0;

    // Create two walls along E-W axis with gap in middle
    for (let q = -gridRadius; q <= gridRadius; q++) {
      // Skip center for gap
      if (Math.abs(q) <= 1) continue;

      // Top wall (r = -1 or -2)
      const topR = -Math.floor(gridRadius / 2);
      const topCoord = { q, r: topR };
      if (isInHexagonalBounds(topCoord, gridRadius)) {
        stacks.push({
          id: generateStackId(),
          coord: topCoord,
          direction: 'SE', // Point toward center gap
          color: getColor(colorIndex++),
          height: 1,
        });
      }

      // Bottom wall
      const bottomR = Math.floor(gridRadius / 2);
      const bottomCoord = { q, r: bottomR };
      if (isInHexagonalBounds(bottomCoord, gridRadius)) {
        stacks.push({
          id: generateStackId(),
          coord: bottomCoord,
          direction: 'NW', // Point toward center gap
          color: getColor(colorIndex++),
          height: 1,
        });
      }
    }

    return { stacks, holes: [] };
  },
};

const centerHoleTemplate: LevelTemplate = {
  id: 'center-hole',
  name: 'Center Hole',
  description: 'Ring of stacks around a central hole',
  icon: 'Target',
  generate: (gridRadius: number) => {
    const stacks: HexStack[] = [];
    const holes: AxialCoord[] = [{ q: 0, r: 0 }]; // Center hole

    // Inner ring pointing toward center hole
    const innerRing = getHexRing({ q: 0, r: 0 }, 1);
    let colorIndex = 0;

    for (const coord of innerRing) {
      stacks.push({
        id: generateStackId(),
        coord,
        direction: getInwardDirection(coord),
        color: getColor(colorIndex++),
        height: 1,
      });
    }

    // Outer ring pointing outward (if radius allows)
    if (gridRadius >= 2) {
      const outerRing = getHexRing({ q: 0, r: 0 }, 2);
      for (const coord of outerRing) {
        stacks.push({
          id: generateStackId(),
          coord,
          direction: getOutwardDirection(coord),
          color: getColor(colorIndex++),
          height: 1,
        });
      }
    }

    return { stacks, holes };
  },
};

// ============================================================================
// Export All Templates
// ============================================================================

export const LEVEL_TEMPLATES: LevelTemplate[] = [
  scatteredTemplate,
  ringTemplate,
  starTemplate,
  crossTemplate,
  symmetricTemplate,
  centerHoleTemplate,
];

export function getTemplateById(id: string): LevelTemplate | undefined {
  return LEVEL_TEMPLATES.find((t) => t.id === id);
}
