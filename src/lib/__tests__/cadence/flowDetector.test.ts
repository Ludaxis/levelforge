import { describe, it, expect } from 'vitest';
import { replayFlowDetection } from '@/lib/cadence/flowDetector';
import { cloneDefaultConfig } from '@/lib/cadence/defaultConfig';
import type { SessionRow, SignalEntry } from '@/lib/cadence/types';

function sig(
  key: string,
  value: number,
  moveIndex: number,
  sessionTime: number
): SignalEntry {
  return { key, value, tier: 0, moveIndex, sessionTime, frameNumber: 0 };
}

function session(signals: SignalEntry[]): SessionRow {
  return {
    userId: 'u1',
    sessionId: 'u1|L1|1',
    levelId: 'L1',
    attempt: 1,
    signals,
    levelParameters: {},
    outcome: 'win',
    startedAtUtc: 0,
    endedAtUtc: 0,
  };
}

describe('FlowDetector replay', () => {
  it('returns unknown during warmup', () => {
    const signals: SignalEntry[] = [];
    for (let i = 1; i <= 3; i++) {
      signals.push(sig('move.executed', 1, i, i * 1));
      signals.push(sig('move.optimal', 1, i, i * 1));
      signals.push(sig('tempo.interval', 1.0, i, i * 1));
    }
    const readings = replayFlowDetection(session(signals), cloneDefaultConfig());
    expect(readings.every((r) => r.state === 'unknown')).toBe(true);
  });

  it('settles into flow for a balanced player after warmup+hysteresis', () => {
    const signals: SignalEntry[] = [];
    for (let i = 1; i <= 30; i++) {
      signals.push(sig('move.executed', 1, i, i));
      // 60% optimal — mid-efficiency → neither boredom nor anxiety.
      signals.push(sig('move.optimal', i % 5 < 3 ? 1 : 0, i, i));
      // Tempo with ~20% jitter.
      signals.push(sig('tempo.interval', 1 + (i % 2 === 0 ? 0.1 : -0.1), i, i));
      signals.push(sig('progress.delta', 0.03, i, i));
    }
    const readings = replayFlowDetection(session(signals), cloneDefaultConfig());
    // The final state after enough ticks should be flow.
    expect(readings.at(-1)?.state).toBe('flow');
  });

  it('classifies a perfect-efficiency, steady-tempo player as boredom', () => {
    const signals: SignalEntry[] = [];
    for (let i = 1; i <= 40; i++) {
      signals.push(sig('move.executed', 1, i, i));
      signals.push(sig('move.optimal', 1, i, i));
      signals.push(sig('tempo.interval', 1.0, i, i)); // zero variance
      signals.push(sig('progress.delta', 0.05, i, i));
    }
    const readings = replayFlowDetection(session(signals), cloneDefaultConfig());
    expect(readings.at(-1)?.state).toBe('boredom');
  });

  it('classifies a high-waste low-efficiency player as frustration', () => {
    const signals: SignalEntry[] = [];
    for (let i = 1; i <= 40; i++) {
      signals.push(sig('move.executed', 1, i, i));
      signals.push(sig('move.optimal', 0, i, i));
      signals.push(sig('move.waste', 1, i, i));
      signals.push(sig('tempo.interval', i % 2 === 0 ? 0.3 : 3.0, i, i));
      signals.push(sig('tempo.pause', 1, i, i));
    }
    const readings = replayFlowDetection(session(signals), cloneDefaultConfig());
    expect(readings.at(-1)?.state).toBe('frustration');
  });

  it('is deterministic', () => {
    const signals: SignalEntry[] = [];
    for (let i = 1; i <= 15; i++) {
      signals.push(sig('move.executed', 1, i, i));
      signals.push(sig('move.optimal', i % 2, i, i));
      signals.push(sig('tempo.interval', 1.1, i, i));
    }
    const a = replayFlowDetection(session(signals), cloneDefaultConfig());
    const b = replayFlowDetection(session(signals), cloneDefaultConfig());
    expect(a).toEqual(b);
  });

  it('honours hysteresis — short spikes do not flip state', () => {
    const cfg = cloneDefaultConfig();
    cfg.flowDetector.hysteresisCount = 3;
    const signals: SignalEntry[] = [];
    // Stable flow for 20 moves
    for (let i = 1; i <= 20; i++) {
      signals.push(sig('move.executed', 1, i, i));
      signals.push(sig('move.optimal', i % 5 < 3 ? 1 : 0, i, i));
      signals.push(sig('tempo.interval', 1.0, i, i));
    }
    // Two anomalous moves — not enough to flip.
    for (let i = 21; i <= 22; i++) {
      signals.push(sig('move.executed', 1, i, i));
      signals.push(sig('move.optimal', 0, i, i));
      signals.push(sig('tempo.interval', 4.0, i, i));
    }
    const readings = replayFlowDetection(session(signals), cfg);
    const lastState = readings.at(-1)?.state;
    // Should still be flow (or unknown if warmup long), not anxiety.
    expect(lastState).not.toBe('anxiety');
  });
});
