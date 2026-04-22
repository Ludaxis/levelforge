import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FlowSankey } from './FlowSankey';
import { DdaImpactSankey } from './DdaImpactSankey';
import { profileImportRows } from '@/lib/cadence/importProfile';
import type { ImportedData } from './DataImporter';
import type { PipelineRunWithReports } from '@/lib/cadence/pipeline';

describe('analysis Sankey views', () => {
  it('renders full level_id labels on the baseline Sankey axis', () => {
    render(<FlowSankey run={mockRun()} />);
    expect(screen.getByText('Level15_1')).toBeInTheDocument();
    expect(screen.getByText('Level23_1')).toBeInTheDocument();
    expect(screen.queryByText('L15')).not.toBeInTheDocument();
  });

  it('keeps DDA Impact disabled without DDA output fields', () => {
    const rows = [
      {
        event_name: 'song_start',
        event_timestamp: 1000,
        user_id: 'u1',
        level_id: 'Level15_1',
        attempt: 1,
      },
      {
        event_name: 'song_move',
        event_timestamp: 2000,
        user_id: 'u1',
        level_id: 'Level15_1',
        attempt: 1,
        move_index: 1,
        is_optimal: 1,
        waste_value: 0,
        progress_delta: 0.1,
        move_interval_ms: 1000,
        hesitation_ms: 0,
        input_rejected_count: 0,
      },
      {
        event_name: 'song_result',
        event_timestamp: 5000,
        user_id: 'u1',
        level_id: 'Level15_1',
        attempt: 1,
        result: 'win',
      },
    ];
    const profiled = profileImportRows(rows, Object.keys(rows[0]));
    const data: ImportedData = {
      fileName: 'raw.csv',
      sizeBytes: 100,
      rowCount: profiled.rows.length,
      columns: profiled.columns,
      rows: profiled.rows,
      format: 'csv',
      report: profiled.report,
    };
    render(<DdaImpactSankey data={data} />);
    expect(screen.getByText(/DDA Impact Sankey is disabled/)).toBeInTheDocument();
  });
});

function mockRun(): PipelineRunWithReports {
  const perSession = [
    report('u1', 'Level15_1', 'flow', 1000),
    report('u1', 'Level23_1', 'boredom', 2000),
    report('u2', 'Level15_1', 'flow', 1100),
    report('u2', 'Level23_1', 'flow', 2100),
  ];
  return {
    runId: 'run_test',
    adapterId: 'juicy_blast',
    completedAtUtc: 1,
    signalCount: 0,
    sessionCount: perSession.length,
    proposalCount: 0,
    steps: [],
    proposals: [],
    summaries: perSession.map((r) => r.summary),
    flowReadings: {},
    profileByUser: {},
    errors: [],
    config: {} as PipelineRunWithReports['config'],
    perSession,
    variantChanges: 0,
    ruleFireCounts: {},
  };
}

function report(
  userId: string,
  levelId: string,
  state: 'flow' | 'boredom',
  startedAtUtc: number
): PipelineRunWithReports['perSession'][number] {
  return {
    sessionId: `${userId}|${levelId}|1`,
    userId,
    levelId,
    attempt: 1,
    playType: 'start',
    startedAtUtc,
    endedAtUtc: startedAtUtc + 1000,
    summary: {
      sessionId: `${userId}|${levelId}|1`,
      outcome: 'win',
      durationSec: 1,
      totalMoves: 1,
      moveEfficiency: 1,
      wasteRatio: 0,
      progressRate: 1,
      interMoveVariance: 0,
      pauseCount: 0,
      skillScore: 1,
      engagementScore: 1,
      frustrationScore: 0,
      finalFlowState: state,
    },
    profileBefore: {} as PipelineRunWithReports['perSession'][number]['profileBefore'],
    profileAfter: {} as PipelineRunWithReports['perSession'][number]['profileAfter'],
    proposal: {
      deltas: [],
      confidence: 0,
      reason: '',
      detectedState: state,
      timing: 'BeforeNextLevel',
      rulesEvaluated: [],
    },
    variantBefore: 5,
    variantAfter: 5,
  };
}
