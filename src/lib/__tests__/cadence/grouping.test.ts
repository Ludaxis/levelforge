import { describe, it, expect } from 'vitest';
import { groupRowsIntoSessions } from '@/lib/cadence/grouping';
import { juicyBlastAdapter } from '@/lib/cadence/adapters/juicyBlast';

function startRow(opts: {
  user: string;
  level: string;
  attempt: number;
  ts: number;
  parMoves: number;
  blockingOffset?: number;
}) {
  return {
    event_name: 'song_start',
    user_id: opts.user,
    level_id: opts.level,
    attempt: opts.attempt,
    event_timestamp: opts.ts,
    par_moves: opts.parMoves,
    blocking_offset: opts.blockingOffset ?? 5,
    max_selectable: 10,
    active_launchers: 2,
    color_variant_density: 30,
  };
}

function moveRow(opts: {
  user: string;
  level: string;
  attempt: number;
  ts: number;
  moveIndex: number;
  isOptimal: number;
  waste?: number;
  progress?: number;
  intervalMs?: number;
  hesitationMs?: number;
  rejected?: number;
}) {
  return {
    event_name: 'song_move',
    user_id: opts.user,
    level_id: opts.level,
    attempt: opts.attempt,
    event_timestamp: opts.ts,
    move_index: opts.moveIndex,
    is_optimal: opts.isOptimal,
    waste_value: opts.waste ?? 0,
    progress_delta: opts.progress ?? 0.05,
    move_interval_ms: opts.intervalMs ?? 1200,
    hesitation_ms: opts.hesitationMs ?? 0,
    input_rejected_count: opts.rejected ?? 0,
  };
}

function resultRow(opts: {
  user: string;
  level: string;
  attempt: number;
  ts: number;
  result: 'win' | 'lose';
  playtime: number;
  actualMoves: number;
  parMoves: number;
}) {
  return {
    event_name: 'song_result',
    user_id: opts.user,
    level_id: opts.level,
    attempt: opts.attempt,
    event_timestamp: opts.ts,
    result: opts.result,
    playtime: opts.playtime,
    actual_moves: opts.actualMoves,
    par_moves: opts.parMoves,
  };
}

describe('groupRowsIntoSessions', () => {
  it('returns empty result on empty input', () => {
    const out = groupRowsIntoSessions([], juicyBlastAdapter);
    expect(out.sessions).toEqual([]);
    expect(out.warnings).toEqual([]);
  });

  it('groups rows sharing user+level+attempt into one session', () => {
    const rows = [
      startRow({ user: 'u1', level: 'L5', attempt: 1, ts: 1000, parMoves: 20 }),
      moveRow({ user: 'u1', level: 'L5', attempt: 1, ts: 2000, moveIndex: 1, isOptimal: 1 }),
      moveRow({ user: 'u1', level: 'L5', attempt: 1, ts: 3200, moveIndex: 2, isOptimal: 0, waste: 0.5 }),
      resultRow({ user: 'u1', level: 'L5', attempt: 1, ts: 5000, result: 'win', playtime: 4.0, actualMoves: 2, parMoves: 20 }),
    ];
    const out = groupRowsIntoSessions(rows, juicyBlastAdapter);
    expect(out.sessions).toHaveLength(1);
    const s = out.sessions[0];
    expect(s.userId).toBe('u1');
    expect(s.levelId).toBe('L5');
    expect(s.attempt).toBe(1);
    expect(s.outcome).toBe('win');
    expect(s.startedAtUtc).toBe(1000);
    expect(s.endedAtUtc).toBe(5000);
    expect(s.levelParameters.par_moves).toBe(20);
    expect(s.levelParameters.blocking_offset).toBe(5);
  });

  it('splits different (user, level, attempt) tuples', () => {
    const rows = [
      startRow({ user: 'u1', level: 'L5', attempt: 1, ts: 1000, parMoves: 20 }),
      startRow({ user: 'u1', level: 'L5', attempt: 2, ts: 2000, parMoves: 20 }),
      startRow({ user: 'u2', level: 'L5', attempt: 1, ts: 3000, parMoves: 20 }),
    ];
    const out = groupRowsIntoSessions(rows, juicyBlastAdapter);
    expect(out.sessions).toHaveLength(3);
  });

  it('normalizes numeric-looking attempt values before grouping', () => {
    const rows = [
      { ...startRow({ user: 'u1', level: 'L5', attempt: 1, ts: 1000, parMoves: 20 }), attempt: '1.0' },
      { ...moveRow({ user: 'u1', level: 'L5', attempt: 1, ts: 2000, moveIndex: 1, isOptimal: 1 }), attempt: '1' },
      { ...resultRow({ user: 'u1', level: 'L5', attempt: 1, ts: 5000, result: 'win', playtime: 4.0, actualMoves: 1, parMoves: 20 }), attempt: 1 },
    ];
    const out = groupRowsIntoSessions(rows, juicyBlastAdapter);
    expect(out.sessions).toHaveLength(1);
    expect(out.sessions[0].attempt).toBe(1);
    expect(out.sessions[0].outcome).toBe('win');
  });

  it('uses source as a play-type fallback for NCJB/NCDR exports', () => {
    const rows = [
      {
        ...startRow({ user: 'u1', level: 'L5', attempt: 1, ts: 1000, parMoves: 20 }),
        source: 'replay',
      },
      resultRow({ user: 'u1', level: 'L5', attempt: 1, ts: 5000, result: 'win', playtime: 4.0, actualMoves: 1, parMoves: 20 }),
    ];
    const out = groupRowsIntoSessions(rows, juicyBlastAdapter);
    expect(out.sessions[0].playType).toBe('replay');
  });

  it('emits move.executed and move.optimal signals from song_move rows', () => {
    const rows = [
      startRow({ user: 'u1', level: 'L5', attempt: 1, ts: 1000, parMoves: 20 }),
      moveRow({ user: 'u1', level: 'L5', attempt: 1, ts: 2000, moveIndex: 1, isOptimal: 1 }),
      moveRow({ user: 'u1', level: 'L5', attempt: 1, ts: 3200, moveIndex: 2, isOptimal: 0, waste: 0.8 }),
      resultRow({ user: 'u1', level: 'L5', attempt: 1, ts: 5000, result: 'win', playtime: 4.0, actualMoves: 2, parMoves: 20 }),
    ];
    const [session] = groupRowsIntoSessions(rows, juicyBlastAdapter).sessions;
    const executed = session.signals.filter((s) => s.key === 'move.executed');
    const optimal = session.signals.filter((s) => s.key === 'move.optimal');
    const waste = session.signals.filter((s) => s.key === 'move.waste');
    expect(executed).toHaveLength(2);
    expect(optimal).toHaveLength(2);
    expect(optimal[0].value).toBe(1);
    expect(optimal[1].value).toBe(0);
    expect(waste).toHaveLength(2);
    expect(waste[1].value).toBeCloseTo(0.8);
  });

  it('transforms intervals from ms to seconds', () => {
    const rows = [
      startRow({ user: 'u1', level: 'L5', attempt: 1, ts: 1000, parMoves: 20 }),
      moveRow({ user: 'u1', level: 'L5', attempt: 1, ts: 2000, moveIndex: 1, isOptimal: 1, intervalMs: 1500 }),
      resultRow({ user: 'u1', level: 'L5', attempt: 1, ts: 5000, result: 'win', playtime: 4.0, actualMoves: 1, parMoves: 20 }),
    ];
    const [session] = groupRowsIntoSessions(rows, juicyBlastAdapter).sessions;
    const interval = session.signals.find((s) => s.key === 'tempo.interval');
    expect(interval?.value).toBeCloseTo(1.5);
  });

  it('marks sessions with no result row as abandoned', () => {
    const rows = [
      startRow({ user: 'u1', level: 'L5', attempt: 1, ts: 1000, parMoves: 20 }),
      moveRow({ user: 'u1', level: 'L5', attempt: 1, ts: 2000, moveIndex: 1, isOptimal: 1 }),
    ];
    const [session] = groupRowsIntoSessions(rows, juicyBlastAdapter).sessions;
    expect(session.outcome).toBe('abandoned');
  });

  it('warns when rows have no session keys', () => {
    const rows = [
      { event_name: 'song_move', move_index: 1, is_optimal: 1 },
    ];
    const out = groupRowsIntoSessions(rows, juicyBlastAdapter);
    expect(out.sessions).toHaveLength(0);
    expect(out.warnings.length).toBeGreaterThan(0);
  });
});
