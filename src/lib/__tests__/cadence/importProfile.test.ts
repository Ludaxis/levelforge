import { describe, expect, it } from 'vitest';
import { profileImportRows } from '@/lib/cadence/importProfile';

describe('profileImportRows', () => {
  it('detects aggregated SAT funnel exports and blocks replay', () => {
    const rows = [
      {
        ep__result: 'win',
        ep__level_id: 'Level1_1',
        ep__attempt: '1',
        date_tzutc: '2026-04-21',
        song_result_user_count: 100,
      },
    ];
    const out = profileImportRows(rows, Object.keys(rows[0]));
    expect(out.report.kind).toBe('aggregated_funnel');
    expect(out.report.canRunReplay).toBe(false);
    expect(out.report.canDrawBaselineSankey).toBe(false);
    expect(out.rows[0].level_id).toBe('Level1_1');
    expect(out.rows[0].attempt).toBe(1);
    expect(out.report.aggregatedFunnelRows[0].userCount).toBe(100);
  });

  it('detects raw signal exports and enables baseline replay only', () => {
    const rows = [
      rawStart({ attempt: '1.0' }),
      rawMove({ move_index: 1 }),
      rawResult({ result: 'win' }),
    ];
    const out = profileImportRows(rows, Object.keys(rows[0]));
    expect(out.report.kind).toBe('raw_signal');
    expect(out.report.canRunReplay).toBe(true);
    expect(out.report.canDrawBaselineSankey).toBe(true);
    expect(out.report.canValidateDdaImpact).toBe(false);
    expect(out.rows[0].attempt).toBe(1);
  });

  it('detects DDA output exports and enables impact validation', () => {
    const rows = [
      {
        ...rawStart({ attempt: 1 }),
        dda_enabled: 1,
        variant_default: 5,
        variant_served: 4,
        variant_delta: -1,
        dda_rule: 'frustration_relief',
        dda_confidence: 0.7,
      },
      rawMove({ move_index: 1 }),
      {
        ...rawResult({ result: 'win' }),
        dda_enabled: 1,
        flow_state: 'flow',
        skill_score: 0.7,
        engagement_score: 0.8,
        frustration_score: 0.2,
        glicko_rating: 1510,
        glicko_deviation: 330,
        win_rate_recent: 0.5,
        sessions_completed: 6,
        variant_played: 4,
      },
    ];
    const columns = Array.from(
      rows.reduce((set, row) => {
        Object.keys(row).forEach((k) => set.add(k));
        return set;
      }, new Set<string>())
    );
    const out = profileImportRows(rows, columns);
    expect(out.report.kind).toBe('dda_output');
    expect(out.report.canRunReplay).toBe(true);
    expect(out.report.canValidateDdaImpact).toBe(true);
  });

  it('reports data-quality issues for gaps, duplicates, missing result, and outliers', () => {
    const rows = [
      rawStart({ attempt: 1 }),
      rawMove({ move_index: 1 }),
      rawMove({ move_index: 1 }),
      rawMove({ move_index: 3, move_interval_ms: 70000 }),
    ];
    const out = profileImportRows(rows, Object.keys(rows[0]));
    expect(out.report.dataQuality.sessionsMissingResult).toBe(1);
    expect(out.report.dataQuality.moveIndexGapSessions).toBe(1);
    expect(out.report.dataQuality.moveIndexDuplicateSessions).toBe(1);
    expect(out.report.dataQuality.intervalOver60s).toBe(1);
  });

  it('marks unknown exports as non-replayable', () => {
    const out = profileImportRows([{ level: '1', users: 10 }], ['level', 'users']);
    expect(out.report.kind).toBe('unknown');
    expect(out.report.canRunReplay).toBe(false);
  });
});

function rawStart(overrides: Record<string, unknown>) {
  return {
    event_name: 'song_start',
    event_timestamp: 1000,
    user_id: 'u1',
    level_id: 'Level6_1',
    attempt: 1,
    play_type: 'start',
    par_moves: 20,
    ...overrides,
  };
}

function rawMove(overrides: Record<string, unknown>) {
  return {
    event_name: 'song_move',
    event_timestamp: 2000,
    user_id: 'u1',
    level_id: 'Level6_1',
    attempt: 1,
    move_index: 1,
    is_optimal: 1,
    waste_value: 0,
    progress_delta: 0.1,
    move_interval_ms: 1000,
    hesitation_ms: 0,
    input_rejected_count: 0,
    ...overrides,
  };
}

function rawResult(overrides: Record<string, unknown>) {
  return {
    event_name: 'song_result',
    event_timestamp: 5000,
    user_id: 'u1',
    level_id: 'Level6_1',
    attempt: 1,
    result: 'win',
    playtime: 4,
    actual_moves: 1,
    ...overrides,
  };
}
