import { describe, expect, it } from 'vitest';
import { gridKey } from '@/lib/squareGrid';
import { createTestBlock } from './helpers/squareBlockTestHelpers';
import {
  calculateMechanicTargetCounts,
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
  it('converts mechanic percentages into block counts', () => {
    expect(calculateMechanicTargetCounts(100, {
      gate: true,
      ice: true,
      mirror: true,
      gatePercent: 20,
      icePercent: 10,
      mirrorPercent: 5,
    })).toEqual({ gate: 20, ice: 10, mirror: 5, normal: 65 });

    expect(calculateMechanicTargetCounts(89, {
      gate: true,
      ice: true,
      mirror: true,
      gatePercent: 10,
      icePercent: 20,
      mirrorPercent: 5,
    })).toEqual({ gate: 9, ice: 18, mirror: 4, normal: 58 });

    expect(calculateMechanicTargetCounts(25, {
      gate: true,
      ice: true,
      mirror: true,
      gatePercent: 5,
      icePercent: 5,
      mirrorPercent: 5,
    })).toEqual({ gate: 1, ice: 1, mirror: 1, normal: 22 });
  });

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

  it('honors explicit mechanic percentages for generated levels', () => {
    const source = createFilledArtwork(10, 10);

    const result = generateTargetedSquareBlockLevel({
      sourceRows: 10,
      sourceCols: 10,
      sourceBlocks: source,
      targetRows: 10,
      targetCols: 10,
      targetScore: 45,
      mechanics: {
        gate: true,
        ice: true,
        mirror: true,
        gatePercent: 10,
        icePercent: 20,
        mirrorPercent: 5,
      },
      tolerance: 18,
      maxAttempts: 180,
      rng: seededRng(34),
    });

    expect(result).not.toBeNull();
    expect(result?.analysis.solvable).toBe(true);
    expect(result?.blocks).toHaveLength(100);
    expect(result?.mechanicCounts).toEqual({ gate: 10, ice: 20, mirror: 5 });
  });
});
