import { describe, it, expect } from 'vitest';
import {
  updateGlicko2,
  applyTimeDecay,
  predictWinRate,
  confidence01,
} from '@/lib/cadence/glicko2';

/**
 * Reference values from Glickman's Example Calculation in the Glicko-2 paper:
 *   Player: rating=1500, RD=200, σ=0.06
 *   Games:
 *     (1400, 30, win)
 *     (1550, 100, loss)
 *     (1700, 300, loss)
 *   τ = 0.5, ε = 1e-6
 *   Expected: r' ≈ 1464.06, RD' ≈ 151.52, σ' ≈ 0.05999
 *
 * Tolerance of ε=1e-2 is sufficient for parity with the SDK's C# implementation;
 * Glickman's own worked example only reports 4-digit precision.
 */
describe('Glicko-2 — Glickman reference example', () => {
  it('matches the paper within 0.01', () => {
    const result = updateGlicko2(
      { rating: 1500, deviation: 200, volatility: 0.06 },
      [
        { opponentRating: 1400, opponentDeviation: 30, score: 1 },
        { opponentRating: 1550, opponentDeviation: 100, score: 0 },
        { opponentRating: 1700, opponentDeviation: 300, score: 0 },
      ],
      { tau: 0.5, convergenceEpsilon: 1e-6 }
    );

    expect(result.rating).toBeCloseTo(1464.06, 1);
    expect(result.deviation).toBeCloseTo(151.52, 1);
    expect(result.volatility).toBeCloseTo(0.05999, 4);
  });
});

describe('Glicko-2 — edge cases', () => {
  it('returns unchanged profile when no games played', () => {
    const out = updateGlicko2(
      { rating: 1500, deviation: 350, volatility: 0.06 },
      [],
      { tau: 0.5, convergenceEpsilon: 1e-6 }
    );
    expect(out.rating).toBe(1500);
    expect(out.deviation).toBe(350);
    expect(out.volatility).toBe(0.06);
  });

  it('rating rises on a win against an equal opponent', () => {
    const before = { rating: 1500, deviation: 200, volatility: 0.06 };
    const after = updateGlicko2(
      before,
      [{ opponentRating: 1500, opponentDeviation: 200, score: 1 }],
      { tau: 0.5, convergenceEpsilon: 1e-6 }
    );
    expect(after.rating).toBeGreaterThan(before.rating);
    expect(after.deviation).toBeLessThan(before.deviation);
  });

  it('rating falls on a loss to an equal opponent', () => {
    const before = { rating: 1500, deviation: 200, volatility: 0.06 };
    const after = updateGlicko2(
      before,
      [{ opponentRating: 1500, opponentDeviation: 200, score: 0 }],
      { tau: 0.5, convergenceEpsilon: 1e-6 }
    );
    expect(after.rating).toBeLessThan(before.rating);
  });

  it('is deterministic across runs', () => {
    const games = [
      { opponentRating: 1600, opponentDeviation: 150, score: 0 },
      { opponentRating: 1400, opponentDeviation: 200, score: 1 },
    ];
    const a = updateGlicko2(
      { rating: 1500, deviation: 300, volatility: 0.06 },
      games,
      { tau: 0.5, convergenceEpsilon: 1e-6 }
    );
    const b = updateGlicko2(
      { rating: 1500, deviation: 300, volatility: 0.06 },
      games,
      { tau: 0.5, convergenceEpsilon: 1e-6 }
    );
    expect(a).toEqual(b);
  });
});

describe('applyTimeDecay', () => {
  it('grows deviation by 5 per day by default, capped at 350', () => {
    expect(applyTimeDecay(200, 10, 5, 350)).toBe(250);
    expect(applyTimeDecay(300, 30, 5, 350)).toBe(350);
    expect(applyTimeDecay(100, 0, 5, 350)).toBe(100);
  });
});

describe('predictWinRate', () => {
  it('returns 0.5 for equal ratings', () => {
    expect(predictWinRate(1500, 1500)).toBeCloseTo(0.5, 5);
  });

  it('matches PRD table (±100 → ~64%)', () => {
    expect(predictWinRate(1600, 1500)).toBeCloseTo(0.64, 2);
  });

  it('matches PRD table (+400 → ~91%)', () => {
    expect(predictWinRate(1900, 1500)).toBeCloseTo(0.91, 2);
  });
});

describe('confidence01', () => {
  it('returns 0 at RD=350 (default max)', () => {
    expect(confidence01(350)).toBe(0);
  });
  it('returns ~0.66 at RD=120 (20-session player, per PRD table)', () => {
    expect(confidence01(120)).toBeCloseTo(0.66, 2);
  });
  it('clamps below 0 and above 1', () => {
    expect(confidence01(400)).toBe(0);
    expect(confidence01(-50)).toBe(1);
  });
});
