// Square Block Export Utility
// Converts internal level format to reference JSON format

import { SquareBlock, BlockDirection } from '@/types/squareBlock';
import { GridCoord } from '@/lib/squareGrid';

// ============================================================================
// Reference Format Types
// ============================================================================

export interface ReferenceCell {
  direction: number;      // 0=empty, 1=N, 2=E, 3=S, 4=W, 5=N_S, 6=E_W
  colorHex: string;       // 8-char hex with alpha (e.g., "#06B6D4FF")
  mechanic?: number;      // 0=normal, 3=locked (optional for legacy files)
  mechanicExtras?: string;// Optional extras (e.g., timed locks like "60")
}

export interface ReferenceFormat {
  rows: number;
  cols: number;
  cells: ReferenceCell[];
}

// ============================================================================
// Direction Mapping
// ============================================================================

const DIRECTION_TO_NUMBER: Record<BlockDirection, number> = {
  N: 1,
  E: 2,
  S: 3,
  W: 4,
  N_S: 5,
  E_W: 6,
};

// ============================================================================
// Empty Cell
// ============================================================================

const EMPTY_CELL: ReferenceCell = {
  direction: 0,
  colorHex: '#00000000',
  mechanic: 0,
  mechanicExtras: '',
};

// ============================================================================
// Conversion Functions
// ============================================================================

/**
 * Convert a 6-char hex color to 8-char with alpha
 * e.g., "#06b6d4" -> "#06B6D4FF"
 */
function convertColorToHex8(color: string): string {
  // Remove # if present
  const hex = color.startsWith('#') ? color.slice(1) : color;

  // If already 8 chars (with alpha), just uppercase and return
  if (hex.length === 8) {
    return '#' + hex.toUpperCase();
  }

  // Add FF alpha and uppercase
  return '#' + hex.toUpperCase() + 'FF';
}

/**
 * Convert a SquareBlock to ReferenceCell format
 */
function blockToReferenceCell(block: SquareBlock): ReferenceCell {
  const mechanic = typeof block.mechanic === 'number' ? block.mechanic : block.locked ? 3 : 0;
  const mechanicExtras =
    block.unlockAfterMoves !== undefined
      ? String(block.unlockAfterMoves)
      : block.mechanicExtras || '';

  return {
    direction: DIRECTION_TO_NUMBER[block.direction],
    colorHex: convertColorToHex8(block.color),
    mechanic,
    mechanicExtras,
  };
}

/**
 * Create a coordinate key for block lookup
 */
function coordKey(row: number, col: number): string {
  return `${row},${col}`;
}

// ============================================================================
// Main Export Function
// ============================================================================

export interface ExportableLevelData {
  rows: number;
  cols: number;
  blocks: SquareBlock[];
}

/**
 * Export level data to reference JSON format
 * Creates a cells array with one entry per grid cell in row-major order
 */
export function exportToReferenceFormat(level: ExportableLevelData): ReferenceFormat {
  const { rows, cols, blocks } = level;

  // Create a map of blocks by coordinate for O(1) lookup
  const blockMap = new Map<string, SquareBlock>();
  for (const block of blocks) {
    const key = coordKey(block.coord.row, block.coord.col);
    blockMap.set(key, block);
  }

  // Generate cells array in row-major order
  const cells: ReferenceCell[] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const key = coordKey(row, col);
      const block = blockMap.get(key);

      if (block) {
        cells.push(blockToReferenceCell(block));
      } else {
        // Empty cell - use spread to create new object
        cells.push({ ...EMPTY_CELL });
      }
    }
  }

  return {
    rows,
    cols,
    cells,
  };
}

/**
 * Download level as JSON file
 */
export function downloadLevelAsJSON(level: ExportableLevelData, filename: string): void {
  const referenceFormat = exportToReferenceFormat(level);
  const jsonString = JSON.stringify(referenceFormat, null, 4);

  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.json') ? filename : `${filename}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

// ============================================================================
// Import Functions (Reference Format -> Internal Format)
// ============================================================================

const NUMBER_TO_DIRECTION: Record<number, BlockDirection | null> = {
  0: null,  // Empty cell
  1: 'N',
  2: 'E',
  3: 'S',
  4: 'W',
  5: 'N_S',
  6: 'E_W',
};

/**
 * Check if a JSON object is in reference format (has cells array)
 */
export function isReferenceFormat(data: unknown): data is ReferenceFormat {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;
  return (
    typeof obj.rows === 'number' &&
    typeof obj.cols === 'number' &&
    Array.isArray(obj.cells)
  );
}

/**
 * Convert 8-char hex color to 6-char (remove alpha)
 * e.g., "#06B6D4FF" -> "#06b6d4"
 */
function convertHex8ToColor(colorHex: string): string {
  // Remove # if present
  const hex = colorHex.startsWith('#') ? colorHex.slice(1) : colorHex;

  // If 8 chars, take first 6 (RGB without alpha)
  if (hex.length === 8) {
    return '#' + hex.slice(0, 6).toLowerCase();
  }

  // Already 6 chars or other format
  return '#' + hex.toLowerCase();
}

/**
 * Import from reference JSON format to internal format
 */
export function importFromReferenceFormat(data: ReferenceFormat): ExportableLevelData {
  const { rows, cols, cells } = data;
  const blocks: SquareBlock[] = [];

  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    const row = Math.floor(i / cols);
    const col = i % cols;

    // Skip empty cells (direction 0 or transparent color)
    if (cell.direction === 0 || cell.colorHex === '#00000000') {
      continue;
    }

    const mechanic = typeof cell.mechanic === 'number' ? cell.mechanic : 0;
    const mechanicExtras = typeof cell.mechanicExtras === 'string' ? cell.mechanicExtras : '';
    const unlockAfterMoves =
      mechanic === 3 && mechanicExtras.trim() !== '' && !Number.isNaN(Number(mechanicExtras))
        ? Number(mechanicExtras)
        : undefined;

    const direction = NUMBER_TO_DIRECTION[cell.direction];
    if (!direction) continue;

    const block: SquareBlock = {
      id: `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      coord: { row, col },
      direction,
      color: convertHex8ToColor(cell.colorHex),
      locked: mechanic === 3 ? true : undefined,
      mechanic,
      mechanicExtras,
      unlockAfterMoves,
    };

    blocks.push(block);
  }

  return {
    rows,
    cols,
    blocks,
  };
}

/**
 * Parse JSON file and import level data
 * Handles both reference format and internal format
 */
export function parseAndImportLevel(jsonString: string): ExportableLevelData | null {
  try {
    const data = JSON.parse(jsonString);

    // Check if it's reference format (has cells array)
    if (isReferenceFormat(data)) {
      return importFromReferenceFormat(data);
    }

    // Check if it's internal format (has blocks array)
    if (data && typeof data === 'object' && Array.isArray(data.blocks)) {
      return {
        rows: data.rows || 5,
        cols: data.cols || 5,
        blocks: data.blocks,
      };
    }

    return null;
  } catch (e) {
    console.error('Failed to parse level JSON:', e);
    return null;
  }
}
