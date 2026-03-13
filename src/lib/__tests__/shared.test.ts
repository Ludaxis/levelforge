import { describe, it, expect } from 'vitest';
import {
  SAWTOOTH_EXPECTED,
  getExpectedDifficulty,
  getSawtoothPosition,
  getDifficultyFromClearability,
} from '@/types/shared';

// ============================================================================
// SAWTOOTH_EXPECTED constant
// ============================================================================

describe('SAWTOOTH_EXPECTED', () => {
  it('should have entries for all 10 positions', () => {
    for (let i = 1; i <= 10; i++) {
      expect(SAWTOOTH_EXPECTED[i]).toBeDefined();
    }
  });

  it('should only contain valid DifficultyTier values', () => {
    const validTiers = ['easy', 'medium', 'hard', 'superHard'];
    for (let i = 1; i <= 10; i++) {
      expect(validTiers).toContain(SAWTOOTH_EXPECTED[i]);
    }
  });

  it('should match the expected sawtooth pattern', () => {
    expect(SAWTOOTH_EXPECTED[1]).toBe('easy');
    expect(SAWTOOTH_EXPECTED[2]).toBe('easy');
    expect(SAWTOOTH_EXPECTED[3]).toBe('medium');
    expect(SAWTOOTH_EXPECTED[4]).toBe('medium');
    expect(SAWTOOTH_EXPECTED[5]).toBe('hard');
    expect(SAWTOOTH_EXPECTED[6]).toBe('medium');
    expect(SAWTOOTH_EXPECTED[7]).toBe('medium');
    expect(SAWTOOTH_EXPECTED[8]).toBe('hard');
    expect(SAWTOOTH_EXPECTED[9]).toBe('hard');
    expect(SAWTOOTH_EXPECTED[10]).toBe('superHard');
  });
});

// ============================================================================
// getSawtoothPosition
// ============================================================================

describe('getSawtoothPosition', () => {
  it('should return 1-10 for levels 1-10', () => {
    for (let i = 1; i <= 10; i++) {
      expect(getSawtoothPosition(i)).toBe(i);
    }
  });

  it('should wrap around for levels beyond 10', () => {
    expect(getSawtoothPosition(11)).toBe(1);
    expect(getSawtoothPosition(12)).toBe(2);
    expect(getSawtoothPosition(20)).toBe(10);
  });

  it('should wrap correctly for large level numbers', () => {
    expect(getSawtoothPosition(101)).toBe(1);
    expect(getSawtoothPosition(105)).toBe(5);
    expect(getSawtoothPosition(110)).toBe(10);
  });

  it('should handle second cycle (levels 11-20)', () => {
    for (let i = 1; i <= 10; i++) {
      expect(getSawtoothPosition(i + 10)).toBe(i);
    }
  });

  it('should handle third cycle (levels 21-30)', () => {
    for (let i = 1; i <= 10; i++) {
      expect(getSawtoothPosition(i + 20)).toBe(i);
    }
  });
});

// ============================================================================
// getExpectedDifficulty
// ============================================================================

describe('getExpectedDifficulty', () => {
  it('should return correct difficulty for positions 1-10', () => {
    expect(getExpectedDifficulty(1)).toBe('easy');
    expect(getExpectedDifficulty(2)).toBe('easy');
    expect(getExpectedDifficulty(3)).toBe('medium');
    expect(getExpectedDifficulty(4)).toBe('medium');
    expect(getExpectedDifficulty(5)).toBe('hard');
    expect(getExpectedDifficulty(6)).toBe('medium');
    expect(getExpectedDifficulty(7)).toBe('medium');
    expect(getExpectedDifficulty(8)).toBe('hard');
    expect(getExpectedDifficulty(9)).toBe('hard');
    expect(getExpectedDifficulty(10)).toBe('superHard');
  });

  it('should wrap around: level 11 = position 1 (easy)', () => {
    expect(getExpectedDifficulty(11)).toBe('easy');
  });

  it('should wrap around: level 20 = position 10 (superHard)', () => {
    expect(getExpectedDifficulty(20)).toBe('superHard');
  });

  it('should produce the same pattern for every cycle', () => {
    for (let cycle = 0; cycle < 5; cycle++) {
      for (let pos = 1; pos <= 10; pos++) {
        const level = cycle * 10 + pos;
        expect(getExpectedDifficulty(level)).toBe(SAWTOOTH_EXPECTED[pos]);
      }
    }
  });

  it('should return easy for level 1 of every cycle', () => {
    expect(getExpectedDifficulty(1)).toBe('easy');
    expect(getExpectedDifficulty(11)).toBe('easy');
    expect(getExpectedDifficulty(21)).toBe('easy');
    expect(getExpectedDifficulty(31)).toBe('easy');
  });

  it('should return superHard for level 10 of every cycle', () => {
    expect(getExpectedDifficulty(10)).toBe('superHard');
    expect(getExpectedDifficulty(20)).toBe('superHard');
    expect(getExpectedDifficulty(30)).toBe('superHard');
    expect(getExpectedDifficulty(40)).toBe('superHard');
  });
});

// ============================================================================
// getDifficultyFromClearability
// ============================================================================

describe('getDifficultyFromClearability', () => {
  describe('easy tier (clearability >= 0.5)', () => {
    it('should return easy for clearability of 0.5', () => {
      expect(getDifficultyFromClearability(0.5)).toBe('easy');
    });

    it('should return easy for clearability of 1.0', () => {
      expect(getDifficultyFromClearability(1.0)).toBe('easy');
    });

    it('should return easy for clearability of 0.75', () => {
      expect(getDifficultyFromClearability(0.75)).toBe('easy');
    });
  });

  describe('medium tier (0.2 <= clearability < 0.5)', () => {
    it('should return medium for clearability of 0.2', () => {
      expect(getDifficultyFromClearability(0.2)).toBe('medium');
    });

    it('should return medium for clearability of 0.49', () => {
      expect(getDifficultyFromClearability(0.49)).toBe('medium');
    });

    it('should return medium for clearability of 0.35', () => {
      expect(getDifficultyFromClearability(0.35)).toBe('medium');
    });
  });

  describe('hard tier (0.05 <= clearability < 0.2)', () => {
    it('should return hard for clearability of 0.05', () => {
      expect(getDifficultyFromClearability(0.05)).toBe('hard');
    });

    it('should return hard for clearability of 0.19', () => {
      expect(getDifficultyFromClearability(0.19)).toBe('hard');
    });

    it('should return hard for clearability of 0.1', () => {
      expect(getDifficultyFromClearability(0.1)).toBe('hard');
    });
  });

  describe('superHard tier (clearability < 0.05)', () => {
    it('should return superHard for clearability of 0.04', () => {
      expect(getDifficultyFromClearability(0.04)).toBe('superHard');
    });

    it('should return superHard for clearability of 0', () => {
      expect(getDifficultyFromClearability(0)).toBe('superHard');
    });

    it('should return superHard for clearability of 0.01', () => {
      expect(getDifficultyFromClearability(0.01)).toBe('superHard');
    });
  });

  describe('boundary precision', () => {
    it('should distinguish 0.5 (easy) from 0.4999 (medium)', () => {
      expect(getDifficultyFromClearability(0.5)).toBe('easy');
      expect(getDifficultyFromClearability(0.4999)).toBe('medium');
    });

    it('should distinguish 0.2 (medium) from 0.1999 (hard)', () => {
      expect(getDifficultyFromClearability(0.2)).toBe('medium');
      expect(getDifficultyFromClearability(0.1999)).toBe('hard');
    });

    it('should distinguish 0.05 (hard) from 0.0499 (superHard)', () => {
      expect(getDifficultyFromClearability(0.05)).toBe('hard');
      expect(getDifficultyFromClearability(0.0499)).toBe('superHard');
    });
  });
});
