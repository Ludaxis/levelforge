import { describe, it, expect } from 'vitest';
import {
  exportToReferenceFormat,
  importFromReferenceFormat,
  parseAndImportLevel,
  isReferenceFormat,
  ReferenceFormat,
  ReferenceCell,
} from '../squareBlockExport';
import { SquareBlock, BlockDirection } from '@/types/squareBlock';
import { createTestBlock, createTestLevel } from './helpers/squareBlockTestHelpers';

// ============================================================================
// Direction Mapping
// ============================================================================

describe('Direction Mapping', () => {
  describe('Direction to number conversion', () => {
    it('should map N to 1', () => {
      const blocks = [createTestBlock(0, 0, 'N')];
      const exported = exportToReferenceFormat({ rows: 1, cols: 1, blocks });
      expect(exported.cells[0].direction).toBe(1);
    });

    it('should map E to 2', () => {
      const blocks = [createTestBlock(0, 0, 'E')];
      const exported = exportToReferenceFormat({ rows: 1, cols: 1, blocks });
      expect(exported.cells[0].direction).toBe(2);
    });

    it('should map S to 3', () => {
      const blocks = [createTestBlock(0, 0, 'S')];
      const exported = exportToReferenceFormat({ rows: 1, cols: 1, blocks });
      expect(exported.cells[0].direction).toBe(3);
    });

    it('should map W to 4', () => {
      const blocks = [createTestBlock(0, 0, 'W')];
      const exported = exportToReferenceFormat({ rows: 1, cols: 1, blocks });
      expect(exported.cells[0].direction).toBe(4);
    });

    it('should map N_S to 5', () => {
      const blocks = [createTestBlock(0, 0, 'N_S')];
      const exported = exportToReferenceFormat({ rows: 1, cols: 1, blocks });
      expect(exported.cells[0].direction).toBe(5);
    });

    it('should map E_W to 6', () => {
      const blocks = [createTestBlock(0, 0, 'E_W')];
      const exported = exportToReferenceFormat({ rows: 1, cols: 1, blocks });
      expect(exported.cells[0].direction).toBe(6);
    });
  });

  describe('Number to direction conversion on import', () => {
    it('should map 1 to N', () => {
      const refFormat: ReferenceFormat = {
        rows: 1,
        cols: 1,
        cells: [{ direction: 1, colorHex: '#06B6D4FF' }],
      };
      const imported = importFromReferenceFormat(refFormat);
      expect(imported.blocks[0].direction).toBe('N');
    });

    it('should map 2 to E', () => {
      const refFormat: ReferenceFormat = {
        rows: 1,
        cols: 1,
        cells: [{ direction: 2, colorHex: '#06B6D4FF' }],
      };
      const imported = importFromReferenceFormat(refFormat);
      expect(imported.blocks[0].direction).toBe('E');
    });

    it('should map 5 to N_S', () => {
      const refFormat: ReferenceFormat = {
        rows: 1,
        cols: 1,
        cells: [{ direction: 5, colorHex: '#06B6D4FF' }],
      };
      const imported = importFromReferenceFormat(refFormat);
      expect(imported.blocks[0].direction).toBe('N_S');
    });

    it('should map 6 to E_W', () => {
      const refFormat: ReferenceFormat = {
        rows: 1,
        cols: 1,
        cells: [{ direction: 6, colorHex: '#06B6D4FF' }],
      };
      const imported = importFromReferenceFormat(refFormat);
      expect(imported.blocks[0].direction).toBe('E_W');
    });
  });
});

// ============================================================================
// Color Conversion
// ============================================================================

describe('Color Conversion', () => {
  describe('Export color formatting', () => {
    it('should convert lowercase hex to uppercase 6-char', () => {
      const blocks = [createTestBlock(0, 0, 'N', { color: '#06b6d4' })];
      const exported = exportToReferenceFormat({ rows: 1, cols: 1, blocks });
      expect(exported.cells[0].colorHex).toBe('#06B6D4');
    });

    it('should strip alpha from 8-char hex', () => {
      const blocks = [createTestBlock(0, 0, 'N', { color: '#06b6d4ff' })];
      const exported = exportToReferenceFormat({ rows: 1, cols: 1, blocks });
      expect(exported.cells[0].colorHex).toBe('#06B6D4');
    });

    it('should handle colors without hash', () => {
      const blocks = [createTestBlock(0, 0, 'N', { color: 'ff0000' })];
      const exported = exportToReferenceFormat({ rows: 1, cols: 1, blocks });
      expect(exported.cells[0].colorHex).toBe('#FF0000');
    });
  });

  describe('Import color formatting', () => {
    it('should convert uppercase 8-char to lowercase 6-char', () => {
      const refFormat: ReferenceFormat = {
        rows: 1,
        cols: 1,
        cells: [{ direction: 1, colorHex: '#06B6D4FF' }],
      };
      const imported = importFromReferenceFormat(refFormat);
      expect(imported.blocks[0].color).toBe('#06b6d4');
    });

    it('should handle 6-char colors', () => {
      const refFormat: ReferenceFormat = {
        rows: 1,
        cols: 1,
        cells: [{ direction: 1, colorHex: '#FF0000' }],
      };
      const imported = importFromReferenceFormat(refFormat);
      expect(imported.blocks[0].color).toBe('#ff0000');
    });
  });
});

// ============================================================================
// Mechanic Encoding
// ============================================================================

describe('Mechanic Encoding', () => {
  describe('Normal blocks (mechanic 0)', () => {
    it('should encode normal block as mechanic 0', () => {
      const blocks = [createTestBlock(0, 0, 'N')];
      const exported = exportToReferenceFormat({ rows: 1, cols: 1, blocks });
      expect(exported.cells[0].mechanic).toBe(0);
    });
  });

  describe('Neighbor gate blocks (mechanic 1)', () => {
    it('should encode locked block as mechanic 1', () => {
      const blocks = [createTestBlock(0, 0, 'N', { locked: true })];
      const exported = exportToReferenceFormat({ rows: 1, cols: 1, blocks });
      expect(exported.cells[0].mechanic).toBe(1);
    });

    it('should import mechanic 1 as locked', () => {
      const refFormat: ReferenceFormat = {
        rows: 1,
        cols: 1,
        cells: [{ direction: 1, colorHex: '#FF0000', mechanic: 1 }],
      };
      const imported = importFromReferenceFormat(refFormat);
      expect(imported.blocks[0].locked).toBe(true);
    });
  });

  describe('Timed gate blocks (mechanic 2)', () => {
    it('should encode timed gate with unlock moves', () => {
      const blocks = [createTestBlock(0, 0, 'N', { locked: true, unlockAfterMoves: 5 })];
      const exported = exportToReferenceFormat({ rows: 1, cols: 1, blocks });
      expect(exported.cells[0].mechanic).toBe(2);
      expect(exported.cells[0].mechanicExtras).toBe('5');
    });

    it('should import mechanic 2 with extras as timed gate', () => {
      const refFormat: ReferenceFormat = {
        rows: 1,
        cols: 1,
        cells: [{ direction: 1, colorHex: '#FF0000', mechanic: 2, mechanicExtras: '10' }],
      };
      const imported = importFromReferenceFormat(refFormat);
      expect(imported.blocks[0].locked).toBe(true);
      expect(imported.blocks[0].unlockAfterMoves).toBe(10);
    });
  });

  describe('Mirror blocks (mechanic 3)', () => {
    it('should encode mirror block as mechanic 3', () => {
      const blocks = [createTestBlock(0, 0, 'N', { mirror: true })];
      const exported = exportToReferenceFormat({ rows: 1, cols: 1, blocks });
      expect(exported.cells[0].mechanic).toBe(3);
    });

    it('should import mechanic 3 as mirror', () => {
      const refFormat: ReferenceFormat = {
        rows: 1,
        cols: 1,
        cells: [{ direction: 1, colorHex: '#FF0000', mechanic: 3 }],
      };
      const imported = importFromReferenceFormat(refFormat);
      expect(imported.blocks[0].mirror).toBe(true);
    });
  });

  describe('Iced blocks (mechanic 4)', () => {
    it('should encode iced block as mechanic 4', () => {
      const blocks = [createTestBlock(0, 0, 'N', { iceCount: 3 })];
      const exported = exportToReferenceFormat({ rows: 1, cols: 1, blocks });
      expect(exported.cells[0].mechanic).toBe(4);
      expect(exported.cells[0].mechanicExtras).toBe('3');
    });

    it('should import mechanic 4 with ice count', () => {
      const refFormat: ReferenceFormat = {
        rows: 1,
        cols: 1,
        cells: [{ direction: 1, colorHex: '#FF0000', mechanic: 4, mechanicExtras: '5' }],
      };
      const imported = importFromReferenceFormat(refFormat);
      expect(imported.blocks[0].iceCount).toBe(5);
    });
  });

  describe('mechanicExtras as number (dev export format)', () => {
    it('should handle mechanicExtras as number', () => {
      const refFormat: ReferenceFormat = {
        rows: 1,
        cols: 1,
        cells: [{ direction: 1, colorHex: '#FF0000', mechanic: 4, mechanicExtras: 7 as any }],
      };
      const imported = importFromReferenceFormat(refFormat);
      expect(imported.blocks[0].iceCount).toBe(7);
    });
  });
});

// ============================================================================
// Empty Cells
// ============================================================================

describe('Empty Cells', () => {
  describe('Export', () => {
    it('should fill empty cells with direction 0', () => {
      const blocks = [createTestBlock(0, 0, 'N')]; // Only one block
      const exported = exportToReferenceFormat({ rows: 2, cols: 2, blocks });

      // First cell has block, others are empty
      expect(exported.cells[0].direction).toBe(1);
      expect(exported.cells[1].direction).toBe(0);
      expect(exported.cells[2].direction).toBe(0);
      expect(exported.cells[3].direction).toBe(0);
    });

    it('should use transparent color for empty cells', () => {
      const blocks: SquareBlock[] = [];
      const exported = exportToReferenceFormat({ rows: 1, cols: 1, blocks });
      expect(exported.cells[0].colorHex).toBe('#00000000');
    });
  });

  describe('Import', () => {
    it('should skip cells with direction 0', () => {
      const refFormat: ReferenceFormat = {
        rows: 2,
        cols: 2,
        cells: [
          { direction: 1, colorHex: '#FF0000' },
          { direction: 0, colorHex: '#00000000' },
          { direction: 0, colorHex: '#00000000' },
          { direction: 2, colorHex: '#00FF00' },
        ],
      };
      const imported = importFromReferenceFormat(refFormat);
      expect(imported.blocks).toHaveLength(2);
    });

    it('should skip cells with transparent color', () => {
      const refFormat: ReferenceFormat = {
        rows: 1,
        cols: 2,
        cells: [
          { direction: 1, colorHex: '#FF0000' },
          { direction: 1, colorHex: '#00000000' }, // Transparent = empty
        ],
      };
      const imported = importFromReferenceFormat(refFormat);
      expect(imported.blocks).toHaveLength(1);
    });
  });
});

// ============================================================================
// Grid Layout
// ============================================================================

describe('Grid Layout', () => {
  describe('Row-major ordering', () => {
    it('should export cells in row-major order', () => {
      const blocks = [
        createTestBlock(0, 0, 'N'),
        createTestBlock(0, 1, 'E'),
        createTestBlock(1, 0, 'S'),
        createTestBlock(1, 1, 'W'),
      ];
      const exported = exportToReferenceFormat({ rows: 2, cols: 2, blocks });

      expect(exported.cells[0].direction).toBe(1); // N at (0,0)
      expect(exported.cells[1].direction).toBe(2); // E at (0,1)
      expect(exported.cells[2].direction).toBe(3); // S at (1,0)
      expect(exported.cells[3].direction).toBe(4); // W at (1,1)
    });

    it('should import cells in row-major order', () => {
      const refFormat: ReferenceFormat = {
        rows: 2,
        cols: 2,
        cells: [
          { direction: 1, colorHex: '#FF0000' },
          { direction: 2, colorHex: '#00FF00' },
          { direction: 3, colorHex: '#0000FF' },
          { direction: 4, colorHex: '#FFFF00' },
        ],
      };
      const imported = importFromReferenceFormat(refFormat);

      const blockAt00 = imported.blocks.find(b => b.coord.row === 0 && b.coord.col === 0);
      const blockAt01 = imported.blocks.find(b => b.coord.row === 0 && b.coord.col === 1);
      const blockAt10 = imported.blocks.find(b => b.coord.row === 1 && b.coord.col === 0);
      const blockAt11 = imported.blocks.find(b => b.coord.row === 1 && b.coord.col === 1);

      expect(blockAt00?.direction).toBe('N');
      expect(blockAt01?.direction).toBe('E');
      expect(blockAt10?.direction).toBe('S');
      expect(blockAt11?.direction).toBe('W');
    });
  });

  describe('Grid dimensions', () => {
    it('should preserve rows and cols on export', () => {
      const exported = exportToReferenceFormat({ rows: 5, cols: 7, blocks: [] });
      expect(exported.rows).toBe(5);
      expect(exported.cols).toBe(7);
    });

    it('should preserve rows and cols on import', () => {
      const refFormat: ReferenceFormat = {
        rows: 8,
        cols: 6,
        cells: [],
      };
      const imported = importFromReferenceFormat(refFormat);
      expect(imported.rows).toBe(8);
      expect(imported.cols).toBe(6);
    });
  });
});

// ============================================================================
// Import Round-trip
// ============================================================================

describe('Import Round-trip', () => {
  it('should round-trip simple blocks', () => {
    const original = [
      createTestBlock(0, 0, 'N'),
      createTestBlock(0, 1, 'E'),
      createTestBlock(1, 0, 'S'),
    ];
    const exported = exportToReferenceFormat({ rows: 2, cols: 2, blocks: original });
    const imported = importFromReferenceFormat(exported);

    expect(imported.blocks).toHaveLength(3);

    for (const origBlock of original) {
      const importedBlock = imported.blocks.find(
        b => b.coord.row === origBlock.coord.row && b.coord.col === origBlock.coord.col
      );
      expect(importedBlock).toBeDefined();
      expect(importedBlock!.direction).toBe(origBlock.direction);
    }
  });

  it('should round-trip locked blocks', () => {
    const original = [createTestBlock(0, 0, 'N', { locked: true })];
    const exported = exportToReferenceFormat({ rows: 1, cols: 1, blocks: original });
    const imported = importFromReferenceFormat(exported);

    expect(imported.blocks[0].locked).toBe(true);
  });

  it('should round-trip iced blocks', () => {
    const original = [createTestBlock(0, 0, 'N', { iceCount: 5 })];
    const exported = exportToReferenceFormat({ rows: 1, cols: 1, blocks: original });
    const imported = importFromReferenceFormat(exported);

    expect(imported.blocks[0].iceCount).toBe(5);
  });

  it('should round-trip mirror blocks', () => {
    const original = [createTestBlock(0, 0, 'E', { mirror: true })];
    const exported = exportToReferenceFormat({ rows: 1, cols: 1, blocks: original });
    const imported = importFromReferenceFormat(exported);

    expect(imported.blocks[0].mirror).toBe(true);
  });
});

// ============================================================================
// Format Detection
// ============================================================================

describe('Format Detection', () => {
  describe('isReferenceFormat', () => {
    it('should return true for valid reference format', () => {
      const data = { rows: 5, cols: 5, cells: [] };
      expect(isReferenceFormat(data)).toBe(true);
    });

    it('should return false for null', () => {
      expect(isReferenceFormat(null)).toBe(false);
    });

    it('should return false for non-object', () => {
      expect(isReferenceFormat('string')).toBe(false);
      expect(isReferenceFormat(123)).toBe(false);
    });

    it('should return false without rows', () => {
      expect(isReferenceFormat({ cols: 5, cells: [] })).toBe(false);
    });

    it('should return false without cols', () => {
      expect(isReferenceFormat({ rows: 5, cells: [] })).toBe(false);
    });

    it('should return false without cells array', () => {
      expect(isReferenceFormat({ rows: 5, cols: 5 })).toBe(false);
    });
  });
});

// ============================================================================
// parseAndImportLevel
// ============================================================================

describe('parseAndImportLevel', () => {
  it('should parse reference format JSON', () => {
    const json = JSON.stringify({
      rows: 2,
      cols: 2,
      cells: [
        { direction: 1, colorHex: '#FF0000' },
        { direction: 0, colorHex: '#00000000' },
        { direction: 0, colorHex: '#00000000' },
        { direction: 2, colorHex: '#00FF00' },
      ],
    });
    const result = parseAndImportLevel(json);

    expect(result).not.toBeNull();
    expect(result!.rows).toBe(2);
    expect(result!.blocks).toHaveLength(2);
  });

  it('should parse internal format JSON', () => {
    const json = JSON.stringify({
      rows: 3,
      cols: 3,
      blocks: [
        { id: 'b1', coord: { row: 0, col: 0 }, direction: 'N', color: '#ff0000' },
      ],
    });
    const result = parseAndImportLevel(json);

    expect(result).not.toBeNull();
    expect(result!.rows).toBe(3);
    expect(result!.blocks).toHaveLength(1);
  });

  it('should return null for invalid JSON', () => {
    expect(parseAndImportLevel('not json')).toBeNull();
  });

  it('should return null for unrecognized format', () => {
    expect(parseAndImportLevel('{}')).toBeNull();
    expect(parseAndImportLevel('{"foo": "bar"}')).toBeNull();
  });

  it('should use default dimensions for internal format without them', () => {
    const json = JSON.stringify({
      blocks: [{ id: 'b1', coord: { row: 0, col: 0 }, direction: 'N', color: '#ff0000' }],
    });
    const result = parseAndImportLevel(json);

    expect(result).not.toBeNull();
    expect(result!.rows).toBe(5); // Default
    expect(result!.cols).toBe(5); // Default
  });
});

// ============================================================================
// Error Handling
// ============================================================================

describe('Error Handling', () => {
  it('should handle malformed JSON gracefully', () => {
    expect(parseAndImportLevel('{')).toBeNull();
  });

  it('should skip invalid direction numbers', () => {
    const refFormat: ReferenceFormat = {
      rows: 1,
      cols: 3,
      cells: [
        { direction: 1, colorHex: '#FF0000' },
        { direction: 99, colorHex: '#00FF00' }, // Invalid direction
        { direction: 2, colorHex: '#0000FF' },
      ],
    };
    const imported = importFromReferenceFormat(refFormat);
    expect(imported.blocks).toHaveLength(2); // Only valid directions
  });
});
