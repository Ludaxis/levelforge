import { describe, expect, it } from 'vitest';
import type { PipelineRunWithReports, PerSessionReport } from '@/lib/cadence/pipeline';
import {
  computeFlowParity,
  computeSankeyHealth,
  computeTreatmentImpact,
  extractDdaSessions,
} from '@/lib/cadence/validationAnalysis';
import type { FlowState } from '@/lib/cadence/types';

describe('validationAnalysis', () => {
  it('compares logged flow_state with recomputed replay output', () => {
    const run = mockRun([
      report('u1', 'Level15_1', 1, 'flow', 1000),
      report('u1', 'Level23_1', 1, 'boredom', 2000),
      report('u2', 'Level15_1', 1, 'flow', 1100),
    ]);
    const rows = [
      loggedResult('u1', 'Level15_1', 1, 'flow'),
      loggedResult('u1', 'Level23_1', 1, 'anxiety'),
      loggedResult('u3', 'Level15_1', 1, 'flow'),
    ];

    const parity = computeFlowParity(run, rows);

    expect(parity.hasLoggedFlowState).toBe(true);
    expect(parity.compared).toBe(2);
    expect(parity.matches).toBe(1);
    expect(parity.mismatches).toBe(1);
    expect(parity.missingLogged).toBe(1);
    expect(parity.missingReplay).toBe(1);
    expect(parity.sampleMismatches[0]).toMatchObject({
      levelId: 'Level23_1',
      loggedFlowState: 'anxiety',
      recomputedFlowState: 'boredom',
    });
  });

  it('flags Sankey health issues when almost everything is classified as flow', () => {
    const sessions = Array.from({ length: 10 }, (_, i) =>
      report(`u${i}`, `Level${i + 1}_1`, 1, 'flow', 1000 + i)
    );
    const health = computeSankeyHealth(mockRun(sessions));

    expect(health.flowShare).toBe(1);
    expect(health.flags.some((f) => f.title === 'Flow share is very high')).toBe(
      true
    );
  });

  it('extracts DDA sessions and computes treatment-control impact with CIs', () => {
    const rows = [
      ...ddaSession('c1', 'Level15_1', 1, 1000, 0, 'lose', 'frustration', -1),
      ...ddaSession('c1', 'Level23_1', 1, 2000, 0, 'win', 'flow', 0),
      ...ddaSession('t1', 'Level15_1', 1, 1100, 1, 'win', 'flow', -1),
      ...ddaSession('t1', 'Level23_1', 1, 2100, 1, 'win', 'flow', 0),
    ];

    const sessions = extractDdaSessions(rows);
    const impact = computeTreatmentImpact(rows);

    expect(sessions).toHaveLength(4);
    expect(impact.hasBothCohorts).toBe(true);
    expect(impact.control.winRate.value).toBe(0.5);
    expect(impact.treatment.winRate.value).toBe(1);
    expect(impact.deltas.winRate).toBe(0.5);
    expect(impact.treatment.winRate.high).toBeGreaterThan(
      impact.treatment.winRate.low
    );
    expect(impact.ruleStats[0].sessions).toBeGreaterThan(0);
  });
});

function mockRun(perSession: PerSessionReport[]): PipelineRunWithReports {
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
  attempt: number,
  state: FlowState,
  startedAtUtc: number
): PerSessionReport {
  return {
    sessionId: `${userId}|${levelId}|${attempt}`,
    userId,
    levelId,
    attempt,
    playType: 'start',
    startedAtUtc,
    endedAtUtc: startedAtUtc + 1000,
    summary: {
      sessionId: `${userId}|${levelId}|${attempt}`,
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
      frustrationScore: state === 'frustration' ? 1 : 0,
      finalFlowState: state,
    },
    profileBefore: {} as PerSessionReport['profileBefore'],
    profileAfter: {} as PerSessionReport['profileAfter'],
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

function loggedResult(
  userId: string,
  levelId: string,
  attempt: number,
  flowState: FlowState
) {
  return {
    event_name: 'song_result',
    event_timestamp: 5000,
    user_id: userId,
    level_id: levelId,
    attempt,
    result: 'win',
    flow_state: flowState,
  };
}

function ddaSession(
  userId: string,
  levelId: string,
  attempt: number,
  timestamp: number,
  ddaEnabled: 0 | 1,
  result: 'win' | 'lose',
  flowState: FlowState,
  variantDelta: number
) {
  return [
    {
      event_name: 'song_start',
      event_timestamp: timestamp,
      user_id: userId,
      level_id: levelId,
      attempt,
      dda_enabled: ddaEnabled,
      variant_default: 5,
      variant_served: 5 + variantDelta,
      variant_delta: variantDelta,
      dda_rule: variantDelta < 0 ? 'frustration_relief' : 'none',
      flow_state: flowState,
    },
    {
      event_name: 'song_result',
      event_timestamp: timestamp + 500,
      user_id: userId,
      level_id: levelId,
      attempt,
      result,
      dda_enabled: ddaEnabled,
      flow_state: flowState,
      frustration_score: flowState === 'frustration' ? 0.9 : 0.1,
      sessions_completed: 6,
      variant_played: 5 + variantDelta,
    },
  ];
}
