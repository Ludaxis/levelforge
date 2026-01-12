/**
 * Level Codec - Encode/decode levels to shareable codes
 * Format: v1-{radius}{mode}-{Base64Data}
 */

import { AxialCoord, HexDirection, DIRECTION_ORDER } from './hexGrid';
import { HexStack, StackDirection, GameMode, STACK_COLORS, StackColor, HexAxis, DesignedLevel, LevelMetrics } from '@/types/hexaBlock';

// ============================================================================
// Constants
// ============================================================================

const VERSION = '1';
const AXIS_ORDER: HexAxis[] = ['NE_SW', 'E_W', 'SE_NW'];
const COLOR_ORDER: StackColor[] = ['cyan', 'purple', 'amber', 'emerald', 'rose', 'blue'];

// Direction index mapping: 0-5 for single directions, 6-8 for bidirectional
function directionToIndex(dir: StackDirection): number {
  const singleIndex = DIRECTION_ORDER.indexOf(dir as HexDirection);
  if (singleIndex !== -1) return singleIndex;
  const axisIndex = AXIS_ORDER.indexOf(dir as HexAxis);
  if (axisIndex !== -1) return 6 + axisIndex;
  return 0; // Default to NE
}

function indexToDirection(index: number): StackDirection {
  if (index < 6) return DIRECTION_ORDER[index];
  return AXIS_ORDER[index - 6];
}

// Color index mapping
function colorToIndex(color: string): number {
  const entry = Object.entries(STACK_COLORS).find(([, value]) => value === color);
  if (entry) {
    return COLOR_ORDER.indexOf(entry[0] as StackColor);
  }
  return 0; // Default to cyan
}

function indexToColor(index: number): string {
  const colorName = COLOR_ORDER[index % COLOR_ORDER.length];
  return STACK_COLORS[colorName];
}

// ============================================================================
// Encoding
// ============================================================================

/**
 * Encode a level design to a shareable code string
 */
export function encodeLevel(
  gridRadius: number,
  gameMode: GameMode,
  stacks: Map<string, HexStack>,
  holes: Set<string>
): string {
  // Header: v{version}-{radius}{mode}-
  const modeChar = gameMode === 'push' ? 'p' : 'c';
  const header = `v${VERSION}-${gridRadius}${modeChar}-`;

  // Encode stacks: each stack as 3 bytes (q+offset, r+offset, dir+color)
  // Offset coordinates by gridRadius to make them positive (0 to 2*radius)
  const stackBytes: number[] = [];
  const offset = gridRadius + 10; // Ensure positive values

  for (const stack of stacks.values()) {
    const qEncoded = stack.coord.q + offset;
    const rEncoded = stack.coord.r + offset;
    const dirIndex = directionToIndex(stack.direction);
    const colorIndex = colorToIndex(stack.color);
    // Pack direction (4 bits) and color (4 bits) into one byte
    const dirColorByte = (dirIndex << 4) | colorIndex;

    stackBytes.push(qEncoded, rEncoded, dirColorByte);
  }

  // Encode holes: each hole as 2 bytes
  const holeBytes: number[] = [];
  for (const holeKey of holes) {
    const [q, r] = holeKey.split(',').map(Number);
    holeBytes.push(q + offset, r + offset);
  }

  // Combine: [stackCount (1 byte), ...stacks (3 bytes each), holeCount (1 byte), ...holes (2 bytes each)]
  const data = new Uint8Array([
    stacks.size,
    ...stackBytes,
    holes.size,
    ...holeBytes,
  ]);

  // Base64 encode
  const base64 = btoa(String.fromCharCode(...data))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, ''); // URL-safe base64

  return header + base64;
}

/**
 * Encode a DesignedLevel to a shareable code
 */
export function encodeDesignedLevel(level: DesignedLevel): string {
  const stackMap = new Map<string, HexStack>();
  for (const stack of level.stacks) {
    stackMap.set(`${stack.coord.q},${stack.coord.r}`, stack);
  }

  const holesSet = new Set<string>();
  if (level.holes) {
    for (const hole of level.holes) {
      holesSet.add(`${hole.q},${hole.r}`);
    }
  }

  return encodeLevel(level.gridRadius, level.gameMode, stackMap, holesSet);
}

// ============================================================================
// Decoding
// ============================================================================

export interface DecodedLevel {
  gridRadius: number;
  gameMode: GameMode;
  stacks: HexStack[];
  holes: AxialCoord[];
}

/**
 * Decode a level code string back to level data
 * Returns null if the code is invalid
 */
export function decodeLevel(code: string): DecodedLevel | null {
  try {
    // Parse header: v{version}-{radius}{mode}-{data}
    const parts = code.split('-');
    if (parts.length !== 3) return null;

    const [versionPart, configPart, dataPart] = parts;

    // Validate version
    if (!versionPart.startsWith('v') || versionPart.slice(1) !== VERSION) {
      return null;
    }

    // Parse config
    const gridRadius = parseInt(configPart.slice(0, -1), 10);
    const modeChar = configPart.slice(-1);
    if (isNaN(gridRadius) || gridRadius < 2 || gridRadius > 6) return null;
    if (modeChar !== 'c' && modeChar !== 'p') return null;

    const gameMode: GameMode = modeChar === 'p' ? 'push' : 'classic';

    // Decode base64 (convert URL-safe back to standard)
    const base64 = dataPart.replace(/-/g, '+').replace(/_/g, '/');
    const padding = (4 - (base64.length % 4)) % 4;
    const paddedBase64 = base64 + '='.repeat(padding);

    const binaryString = atob(paddedBase64);
    const data = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      data[i] = binaryString.charCodeAt(i);
    }

    const offset = gridRadius + 10;
    let index = 0;

    // Decode stacks
    const stackCount = data[index++];
    const stacks: HexStack[] = [];

    for (let i = 0; i < stackCount; i++) {
      const q = data[index++] - offset;
      const r = data[index++] - offset;
      const dirColorByte = data[index++];
      const dirIndex = (dirColorByte >> 4) & 0x0f;
      const colorIndex = dirColorByte & 0x0f;

      stacks.push({
        id: `stack-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        coord: { q, r },
        direction: indexToDirection(dirIndex),
        color: indexToColor(colorIndex),
        height: 1,
      });
    }

    // Decode holes
    const holeCount = data[index++];
    const holes: AxialCoord[] = [];

    for (let i = 0; i < holeCount; i++) {
      const q = data[index++] - offset;
      const r = data[index++] - offset;
      holes.push({ q, r });
    }

    return {
      gridRadius,
      gameMode,
      stacks,
      holes,
    };
  } catch {
    return null;
  }
}

// ============================================================================
// JSON Export/Import
// ============================================================================

export interface ExportedLevel {
  version: string;
  level: {
    name: string;
    gridRadius: number;
    gameMode: GameMode;
    stacks: Array<{
      coord: AxialCoord;
      direction: StackDirection;
      color: string;
    }>;
    holes: AxialCoord[];
    metrics: LevelMetrics;
  };
  exportedAt: number;
  designer?: string;
}

/**
 * Export a DesignedLevel to JSON format
 */
export function exportLevelToJSON(level: DesignedLevel, designer?: string): ExportedLevel {
  return {
    version: '1.0',
    level: {
      name: level.name,
      gridRadius: level.gridRadius,
      gameMode: level.gameMode,
      stacks: level.stacks.map((s) => ({
        coord: s.coord,
        direction: s.direction,
        color: s.color,
      })),
      holes: level.holes || [],
      metrics: level.metrics,
    },
    exportedAt: Date.now(),
    designer,
  };
}

/**
 * Import a level from JSON format
 * Returns null if invalid
 */
export function importLevelFromJSON(json: unknown): Omit<DesignedLevel, 'id' | 'levelNumber' | 'createdAt'> | null {
  try {
    const data = json as ExportedLevel;

    // Basic validation
    if (!data.version || !data.level) return null;
    if (!data.level.gridRadius || !data.level.gameMode || !Array.isArray(data.level.stacks)) return null;

    // Reconstruct stacks with IDs
    const stacks: HexStack[] = data.level.stacks.map((s) => ({
      id: `stack-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      coord: s.coord,
      direction: s.direction,
      color: s.color,
      height: 1,
    }));

    return {
      name: data.level.name || 'Imported Level',
      gridRadius: data.level.gridRadius,
      gameMode: data.level.gameMode,
      stacks,
      holes: data.level.holes || [],
      metrics: data.level.metrics,
    };
  } catch {
    return null;
  }
}

/**
 * Download level as JSON file
 */
export function downloadLevelJSON(level: DesignedLevel, designer?: string): void {
  const exported = exportLevelToJSON(level, designer);
  const jsonString = JSON.stringify(exported, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `hexa-block-level-${level.levelNumber}-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Copy level code to clipboard
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older browsers
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      document.body.removeChild(textArea);
      return true;
    } catch {
      document.body.removeChild(textArea);
      return false;
    }
  }
}
