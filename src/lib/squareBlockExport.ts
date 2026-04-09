// Square Block Export Utility
// Converts internal level format to reference JSON format

import { SquareBlock, BlockDirection } from '@/types/squareBlock';

// ============================================================================
// Reference Format Types
// ============================================================================

export interface ReferenceCell {
  direction: number;      // 0=empty, 1=N, 2=E, 3=S, 4=W, 5=N_S, 6=E_W
  colorHex: string;       // 8-char hex with alpha (e.g., "#06B6D4FF")
  mechanic?: number;      // 0=normal, 1=iced, 2=gate, 3=mirror
  mechanicExtras?: string;// Optional extras (e.g., gate unlock moves, ice count, ",M" for mirror combos)
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
 * Convert color to 6-char uppercase hex (no alpha)
 * Reference format uses 6-char for blocks, 8-char only for transparent empty cells
 * e.g., "#06b6d4" -> "#06B6D4"
 */
function convertColorToHex6(color: string): string {
  // Remove # if present
  const hex = color.startsWith('#') ? color.slice(1) : color;

  // If 8 chars, take first 6 (remove alpha)
  if (hex.length === 8) {
    return '#' + hex.slice(0, 6).toUpperCase();
  }

  // Already 6 chars, just uppercase
  return '#' + hex.toUpperCase();
}

/**
 * Convert a SquareBlock to ReferenceCell format
 * Mechanic codes: 0=normal, 1=iced, 2=gate, 3=mirror
 */
function blockToReferenceCell(block: SquareBlock): ReferenceCell {
  let mechanic = 0;
  let mechanicExtras = '';

  if (block.iceCount !== undefined && block.iceCount > 0) {
    // Iced block: mechanic 1
    mechanic = 1;
    mechanicExtras = String(block.iceCount);
  } else if (block.locked) {
    // Gate block: mechanic 2 (both neighbor-based and timed)
    mechanic = 2;
    if (block.unlockAfterMoves !== undefined && block.unlockAfterMoves > 0) {
      mechanicExtras = String(block.unlockAfterMoves);
    } else if (block.mechanic === 2 && block.mechanicExtras) {
      // Preserve imported raw extras such as "00" so round-trip stays faithful.
      mechanicExtras = block.mechanicExtras;
    }
  } else if (block.mirror) {
    // Mirror block: mechanic 3
    mechanic = 3;
    mechanicExtras = '';
  } else if (typeof block.mechanic === 'number') {
    // Preserve original mechanic if set
    mechanic = block.mechanic;
    mechanicExtras = block.mechanicExtras || '';
  }

  // Mirror can combine with ice or gate in reference format via extras suffix ",M".
  // Mirror-only blocks continue to use mechanic 3.
  if (block.mirror && mechanic !== 3 && !mechanicExtras.includes('M')) {
    mechanicExtras = mechanicExtras ? `${mechanicExtras},M` : 'M';
  }

  return {
    direction: DIRECTION_TO_NUMBER[block.direction],
    colorHex: convertColorToHex6(block.color),
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

function parsePositiveMechanicValue(value: string): number | undefined {
  if (value === '') return undefined;
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed <= 0) return undefined;
  return parsed;
}

export function normalizeSquareBlock(block: SquareBlock): SquareBlock {
  const mechanic = typeof block.mechanic === 'number' ? block.mechanic : 0;
  const mechanicExtras = block.mechanicExtras != null ? String(block.mechanicExtras) : '';
  const extrasWithoutMirror = mechanicExtras.replace(/,?M/g, '').trim();
  const parsedExtraValue = parsePositiveMechanicValue(extrasWithoutMirror);

  const iceCount =
    block.iceCount !== undefined && block.iceCount > 0
      ? block.iceCount
      : mechanic === 1
        ? parsedExtraValue
        : undefined;

  const unlockAfterMoves =
    block.unlockAfterMoves !== undefined && block.unlockAfterMoves > 0
      ? block.unlockAfterMoves
      : mechanic === 2
        ? parsedExtraValue
        : undefined;

  const locked = iceCount !== undefined
    ? undefined
    : (block.locked === true || mechanic === 2 ? true : undefined);

  const mirror = block.mirror === true || mechanic === 3 || mechanicExtras.includes('M')
    ? true
    : undefined;

  return {
    ...block,
    locked,
    iceCount,
    mirror,
    unlockAfterMoves,
    mechanic: typeof block.mechanic === 'number' ? block.mechanic : undefined,
    mechanicExtras: mechanicExtras || undefined,
  };
}

export function normalizeSquareBlocks(blocks: SquareBlock[]): SquareBlock[] {
  return blocks.map(normalizeSquareBlock);
}

/**
 * Export level data to reference JSON format
 * Creates a cells array with one entry per grid cell in row-major order
 */
export function exportToReferenceFormat(level: ExportableLevelData): ReferenceFormat {
  const { rows, cols, blocks } = level;
  const normalizedBlocks = normalizeSquareBlocks(blocks);

  // Create a map of blocks by coordinate for O(1) lookup
  const blockMap = new Map<string, SquareBlock>();
  for (const block of normalizedBlocks) {
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

    const direction = NUMBER_TO_DIRECTION[cell.direction];
    if (!direction) continue;

    const block: SquareBlock = {
      id: `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      coord: { row, col },
      direction,
      color: convertHex8ToColor(cell.colorHex),
      mechanic: typeof cell.mechanic === 'number' ? cell.mechanic : 0,
      mechanicExtras: cell.mechanicExtras != null ? String(cell.mechanicExtras) : '',
    };

    blocks.push(normalizeSquareBlock(block));
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
        blocks: normalizeSquareBlocks(data.blocks as SquareBlock[]),
      };
    }

    return null;
  } catch (e) {
    console.error('Failed to parse level JSON:', e);
    return null;
  }
}
