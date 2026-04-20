import { describe, it, expect } from 'vitest';
import { analyzeSession } from '@/lib/cadence/sessionAnalyzer';
import type { SessionRow, SignalEntry } from '@/lib/cadence/types';

function sig(
  key: string,
  value: number,
  tier: 0 | 1 | 2 | 3 | 4,
  moveIndex = 0,
  sessionTime = 0
): SignalEntry {
  return { key, value, tier, moveIndex, sessionTime, frameNumber: 0 };
}

function buildSession(signals: SignalEntry[], overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    userId: 'u1',
    sessionId: 'u1|L1|1',
    levelId: 'L1',
    attempt: 1,
    signals,
    levelParameters: { par_moves: 20 },
    outcome: 'win',
    startedAtUtc: 0,
    endedAtUtc: 10_000,
    ...overrides,
  };
}

describe('analyzeSession', () => {
  it('returns zero scores for an empty session', () => {
    const out = analyzeSession(buildSession([]));
    expect(out.totalMoves).toBe(0);
    expect(out.moveEfficiency).toBe(0);
    expect(out.wasteRatio).toBe(0);
    expect(out.finalFlowState).toBe('unknown');
  });

  it('computes move efficiency as optimal / total', () => {
    const signals: SignalEntry[] = [];
    for (let i = 1; i <= 10; i++) {
      signals.push(sig('move.executed', 1, 0, i));
      signals.push(sig('move.optimal', i <= 7 ? 1 : 0, 0, i));
    }
    const out = analyzeSession(buildSession(signals));
    expect(out.totalMoves).toBe(10);
    expect(out.moveEfficiency).toBeCloseTo(0.7, 5);
  });

  it('computes waste ratio as total waste / total moves', () => {
    const signals: SignalEntry[] = [];
    for (let i = 1; i <= 4; i++) {
      signals.push(sig('move.executed', 1, 0, i));
      signals.push(sig('move.optimal', 0, 0, i));
      signals.push(sig('move.waste', 0.5, 0, i));
    }
    const out = analyzeSession(buildSession(signals));
    expect(out.wasteRatio).toBeCloseTo(0.5, 5);
  });

  it('classifies a strong, fast player as boredom', () => {
    const signals: SignalEntry[] = [];
    for (let i = 1; i <= 20; i++) {
      signals.push(sig('move.executed', 1, 0, i));
      signals.push(sig('move.optimal', 1, 0, i));
      signals.push(sig('tempo.interval', 0.8, 1, i)); // very consistent
      signals.push(sig('progress.delta', 0.1, 0, i));
    }
    const out = analyzeSession(buildSession(signals));
    expect(out.moveEfficiency).toBe(1);
    expect(out.finalFlowState).toBe('boredom');
  });

  it('classifies a struggling player as frustration when waste is high', () => {
    const signals: SignalEntry[] = [];
    for (let i = 1; i <= 20; i++) {
      signals.push(sig('move.executed', 1, 0, i));
      signals.push(sig('move.optimal', 0, 0, i));
      signals.push(sig('move.waste', 1, 0, i));
      // Wildly variable intervals → high CV → high inter-move variance.
      signals.push(sig('tempo.interval', i % 2 === 0 ? 0.3 : 4.0, 1, i));
    }
    for (let p = 0; p < 5; p++) signals.push(sig('tempo.pause', 1, 1, 0));
    const out = analyzeSession(buildSession(signals, { outcome: 'lose' }));
    expect(out.frustrationScore).toBeGreaterThan(0.7);
    expect(out.finalFlowState).toBe('frustration');
  });

  it('produces a session duration from start/end UTC', () => {
    const out = analyzeSession(buildSession([], { startedAtUtc: 1000, endedAtUtc: 4000 }));
    expect(out.durationSec).toBe(3);
  });

  it('is deterministic — same input, same output', () => {
    const signals: SignalEntry[] = [];
    for (let i = 1; i <= 10; i++) {
      signals.push(sig('move.executed', 1, 0, i));
      signals.push(sig('move.optimal', i % 2, 0, i));
      signals.push(sig('tempo.interval', 1.1, 1, i));
    }
    const a = analyzeSession(buildSession(signals));
    const b = analyzeSession(buildSession(signals));
    expect(a).toEqual(b);
  });
});
