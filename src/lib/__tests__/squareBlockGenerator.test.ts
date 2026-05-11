import { describe, expect, it } from 'vitest';
import { gridKey } from '@/lib/squareGrid';
import { createTestBlock } from './helpers/squareBlockTestHelpers';
import {
  generateTargetedSquareBlockLevel,
  resizeSquareBlockArtwork,
} from '../squareBlockGenerator';

function seededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function createFilledArtwork(rows: number, cols: number) {
  const blocks = [];
  const colors = ['#06b6d4', '#f59e0b', '#a855f7'];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      blocks.push(createTestBlock(row, col, 'E', { color: colors[(row + col) % colors.length] }));
    }
  }

  return blocks;
}

describe('squareBlockGenerator', () => {
  it('reduces imported colored grids by target grid size', () => {
    const rng = seededRng(1);
    const source = createFilledArtwork(4, 4);

    const resized = resizeSquareBlockArtwork(source, 4, 4, 2, 2, rng);

    expect(resized).toHaveLength(4);
    expect(new Set(resized.map((block) => gridKey(block.coord)))).toEqual(
      new Set(['0,0', '0,1', '1,0', '1,1'])
    );
    expect(resized.every((block) => block.color.startsWith('#'))).toBe(true);
  });

  it('generates a solvable targeted level from artwork colors', () => {
    const source = createFilledArtwork(6, 6);

    const result = generateTargetedSquareBlockLevel({
      sourceRows: 6,
      sourceCols: 6,
      sourceBlocks: source,
      targetRows: 5,
      targetCols: 5,
      targetScore: 35,
      mechanics: { gate: false, ice: false, mirror: false },
      tolerance: 8,
      maxAttempts: 120,
      rng: seededRng(7),
    });

    expect(result).not.toBeNull();
    expect(result?.analysis.solvable).toBe(true);
    expect(result?.blocks.length).toBeLessThanOrEqual(25);
    expect(result?.mechanicCounts).toEqual({ gate: 0, ice: 0, mirror: 0 });
  });

  it('can include selected mechanics while still returning a solvable level', () => {
    const source = createFilledArtwork(7, 7);

    const result = generateTargetedSquareBlockLevel({
      sourceRows: 7,
      sourceCols: 7,
      sourceBlocks: source,
      targetRows: 6,
      targetCols: 6,
      targetScore: 60,
      mechanics: { gate: true, ice: true, mirror: true },
      tolerance: 12,
      maxAttempts: 160,
      rng: seededRng(12),
    });

    expect(result).not.toBeNull();
    expect(result?.analysis.solvable).toBe(true);
    expect(result?.mechanicCounts.gate).toBeGreaterThan(0);
    expect(result?.mechanicCounts.ice).toBeGreaterThan(0);
    expect(result?.mechanicCounts.mirror).toBeGreaterThan(0);
  });
});
