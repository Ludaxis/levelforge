import type { GameAdapter } from './adapters/types';
import { groupRowsIntoSessions } from './grouping';
import { analyzeSession } from './sessionAnalyzer';
import { replayFlowDetection } from './flowDetector';
import {
  updateProfileFromSession,
  emptyProfile,
  confidence01,
} from './glicko2';
import { evaluateAdjustment } from './adjustmentEngine';
import { mapToVariant, type VariantMapResult } from './variantMapper';
import type {
  AdjustmentProposal,
  CadenceConfig,
  FlowReading,
  PipelineRun,
  PipelineStepResult,
  PlayerSkillProfile,
  SessionRow,
  SessionSummary,
} from './types';

export interface PipelineInput {
  adapter: GameAdapter;
  config: CadenceConfig;
  rawRows: Array<Record<string, unknown>>;
}

/**
 * Per-session artefact produced by the full pipeline — exposed for the UI
 * so the per-user timeline view can render every decision Cadence made.
 */
export interface PerSessionReport {
  sessionId: string;
  userId: string;
  levelId: string;
  attempt: number;
  summary: SessionSummary;
  finalFlowReading?: FlowReading;
  profileBefore: PlayerSkillProfile;
  profileAfter: PlayerSkillProfile;
  proposal: AdjustmentProposal;
  variantBefore?: number;
  variantAfter?: number;
}

export interface PipelineRunWithReports extends PipelineRun {
  perSession: PerSessionReport[];
  variantChanges: number;
  ruleFireCounts: Record<string, number>;
}

export async function runPipeline(
  input: PipelineInput
): Promise<PipelineRunWithReports> {
  const { adapter, config, rawRows } = input;
  const steps: PipelineStepResult[] = [];
  const errors: PipelineRun['errors'] = [];
  const summaries: SessionSummary[] = [];
  const flowReadings: Record<string, FlowReading[]> = {};
  const profileByUser: Record<string, PlayerSkillProfile> = {};
  const proposals: AdjustmentProposal[] = [];
  const perSession: PerSessionReport[] = [];
  const ruleFireCounts: Record<string, number> = {};
  let variantChanges = 0;

  // ─── Step 1: Parse + Validate ──────────────────────────────────
  const t1 = performance.now();
  const validRows = rawRows.filter((r) => r && typeof r === 'object');
  steps.push({
    stepId: 'parse',
    stepName: 'Parse + Validate',
    rowsIn: rawRows.length,
    rowsOut: validRows.length,
    durationMs: performance.now() - t1,
    summary:
      rawRows.length === 0
        ? 'No rows imported.'
        : `Accepted ${validRows.length.toLocaleString()} of ${rawRows.length.toLocaleString()} rows.`,
  });

  // ─── Step 2: Group by Session ──────────────────────────────────
  const t2 = performance.now();
  const grouping = groupRowsIntoSessions(validRows, adapter);
  for (const w of grouping.warnings) errors.push({ stepId: 'group_sessions', message: w });
  const sessions: SessionRow[] = grouping.sessions;
  steps.push({
    stepId: 'group_sessions',
    stepName: 'Group by Session',
    rowsIn: validRows.length,
    rowsOut: sessions.length,
    durationMs: performance.now() - t2,
    summary:
      sessions.length === 0
        ? 'No sessions detected.'
        : `Grouped into ${sessions.length.toLocaleString()} session${sessions.length === 1 ? '' : 's'}.`,
    samplePayload: sessions.slice(0, 3).map((s) => ({
      sessionId: s.sessionId,
      userId: s.userId,
      levelId: s.levelId,
      attempt: s.attempt,
      outcome: s.outcome,
      signalCount: s.signals.length,
    })),
  });

  // ─── Step 3: Session Analyzer ──────────────────────────────────
  const t3 = performance.now();
  let sumSignals = 0;
  const summaryById = new Map<string, SessionSummary>();
  for (const session of sessions) {
    try {
      const s = analyzeSession(session);
      summaries.push(s);
      summaryById.set(session.sessionId, s);
      sumSignals += session.signals.length;
    } catch (e) {
      errors.push({
        sessionId: session.sessionId,
        stepId: 'session_analyze',
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
  const winCount = summaries.filter((s) => s.outcome === 'win').length;
  const avgEfficiency =
    summaries.length > 0
      ? summaries.reduce((s, x) => s + x.moveEfficiency, 0) / summaries.length
      : 0;
  steps.push({
    stepId: 'session_analyze',
    stepName: 'Session Analyzer',
    rowsIn: sumSignals,
    rowsOut: summaries.length,
    durationMs: performance.now() - t3,
    summary:
      summaries.length === 0
        ? 'No sessions to analyze.'
        : `${summaries.length} summaries · win rate ${pct(winCount / summaries.length)} · avg efficiency ${avgEfficiency.toFixed(2)}`,
    samplePayload: summaries.slice(0, 3),
  });

  // ─── Step 4: Flow Detector ─────────────────────────────────────
  const t4 = performance.now();
  const stateCounts: Record<string, number> = {};
  let totalReadings = 0;
  for (const session of sessions) {
    try {
      const readings = replayFlowDetection(session, config);
      flowReadings[session.sessionId] = readings;
      totalReadings += readings.length;
      const final = readings.at(-1)?.state ?? 'unknown';
      stateCounts[final] = (stateCounts[final] ?? 0) + 1;
    } catch (e) {
      errors.push({
        sessionId: session.sessionId,
        stepId: 'flow_detect',
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
  const stateBreakdown = Object.entries(stateCounts)
    .map(([k, v]) => `${k} ${v}`)
    .join(' · ');
  steps.push({
    stepId: 'flow_detect',
    stepName: 'Flow Detector',
    rowsIn: summaries.length,
    rowsOut: totalReadings,
    durationMs: performance.now() - t4,
    summary:
      totalReadings === 0
        ? 'No readings produced.'
        : `${totalReadings.toLocaleString()} readings · ${stateBreakdown || 'no transitions'}`,
    samplePayload: Object.entries(flowReadings)
      .slice(0, 2)
      .map(([sid, rs]) => ({
        sessionId: sid,
        readingCount: rs.length,
        first: rs[0],
        last: rs.at(-1),
      })),
  });

  // ─── Steps 5–7 run in a single per-user loop but are reported separately. ─
  const t5 = performance.now();
  const sessionsByUser = new Map<string, SessionRow[]>();
  for (const s of sessions) {
    if (!sessionsByUser.has(s.userId)) sessionsByUser.set(s.userId, []);
    sessionsByUser.get(s.userId)!.push(s);
  }
  for (const [, arr] of sessionsByUser) {
    arr.sort((a, b) => a.startedAtUtc - b.startedAtUtc);
  }

  let glickoUpdates = 0;
  for (const [userId, userSessions] of sessionsByUser) {
    let profile: PlayerSkillProfile = emptyProfile({
      rating: config.playerModel.initialRating,
      deviation: config.playerModel.initialDeviation,
      volatility: config.playerModel.initialVolatility,
    });
    let lastGlobalAdjustmentAtMs = 0;
    const lastAdjustmentAtMsByParam: Record<string, number> = {};

    for (const session of userSessions) {
      const summary = summaryById.get(session.sessionId);
      if (!summary) continue;

      const profileBefore: PlayerSkillProfile = JSON.parse(JSON.stringify(profile));
      profile = updateProfileFromSession(profile, session.outcome, {
        levelDifficulty: session.levelParameters['difficulty_score'] ?? 1500,
        levelDeviation: 200,
        tau: config.playerModel.tau,
        convergenceEpsilon: config.playerModel.convergenceEpsilon,
        sessionEfficiency: summary.moveEfficiency,
        sessionTimestampUtcTicks: session.endedAtUtc || session.startedAtUtc,
      });
      glickoUpdates++;

      // Build reverse-chronological recent summaries for this user.
      const recentForUser = userSessions
        .filter((s) => s.startedAtUtc <= session.startedAtUtc)
        .map((s) => summaryById.get(s.sessionId))
        .filter((x): x is SessionSummary => !!x)
        .reverse()
        .slice(0, 15);

      const finalReading = flowReadings[session.sessionId]?.at(-1);
      const nowMs = session.endedAtUtc || session.startedAtUtc || Date.now();

      const proposal = evaluateAdjustment({
        profile,
        recentSummaries: recentForUser,
        lastFlowReading: finalReading,
        currentParameters: session.levelParameters,
        levers: adapter.designLevers,
        config,
        lastGlobalAdjustmentAtMs,
        lastAdjustmentAtMsByParam,
        nowMs,
        levelId: session.levelId,
        playType: session.playType,
      });

      proposals.push(proposal);
      if (proposal.deltas.length > 0) {
        lastGlobalAdjustmentAtMs = nowMs;
        for (const d of proposal.deltas) {
          lastAdjustmentAtMsByParam[d.parameterKey] = nowMs;
        }
        // Count each rule firing once per session, not once per ParameterDelta.
        // Without the dedupe this counter is inflated by #levers (×4 on JB).
        const firedRules = new Set<string>();
        for (const d of proposal.deltas) firedRules.add(d.ruleName);
        for (const name of firedRules) {
          ruleFireCounts[name] = (ruleFireCounts[name] ?? 0) + 1;
        }
      }

      const currentVariant = session.levelVariant ?? adapter.variants?.base ?? 5;
      const variantResult: VariantMapResult = mapToVariant(
        proposal,
        currentVariant,
        adapter,
        {
          lowConfidenceStepCap: config.adjustmentEngine.lowConfidenceStepCap,
          confidence: confidence01(profile.deviation, config.playerModel.maxDeviation),
          lowConfidenceThreshold: config.adjustmentEngine.lowConfidenceThreshold,
        }
      );

      if (variantResult.stepDelta !== 0) variantChanges++;

      perSession.push({
        sessionId: session.sessionId,
        userId,
        levelId: session.levelId,
        attempt: session.attempt,
        summary,
        finalFlowReading: finalReading,
        profileBefore,
        profileAfter: JSON.parse(JSON.stringify(profile)),
        proposal: {
          ...proposal,
          variantBefore: variantResult.currentVariant,
          variantAfter: variantResult.proposedVariant,
        },
        variantBefore: variantResult.currentVariant,
        variantAfter: variantResult.proposedVariant,
      });
    }
    profileByUser[userId] = profile;
  }

  const avgRating =
    Object.values(profileByUser).length > 0
      ? Object.values(profileByUser).reduce((s, p) => s + p.rating, 0) /
        Object.values(profileByUser).length
      : 0;
  const avgConfidence =
    Object.values(profileByUser).length > 0
      ? Object.values(profileByUser).reduce(
          (s, p) => s + confidence01(p.deviation),
          0
        ) / Object.values(profileByUser).length
      : 0;
  const totalDuration = performance.now() - t5;

  steps.push({
    stepId: 'glicko_update',
    stepName: 'Glicko-2 Update',
    rowsIn: summaries.length,
    rowsOut: Object.keys(profileByUser).length,
    durationMs: totalDuration / 3,
    summary:
      glickoUpdates === 0
        ? 'No player updates.'
        : `${glickoUpdates} updates · ${Object.keys(profileByUser).length} players · avg rating ${avgRating.toFixed(0)} · avg confidence ${pct(avgConfidence)}`,
    samplePayload: Object.entries(profileByUser)
      .slice(0, 3)
      .map(([uid, p]) => ({
        userId: uid,
        rating: p.rating,
        deviation: p.deviation,
        volatility: p.volatility,
        sessionsCompleted: p.sessionsCompleted,
        confidence: confidence01(p.deviation),
      })),
  });

  const firingProposals = proposals.filter((p) => p.deltas.length > 0);
  const firedBy = Object.entries(ruleFireCounts)
    .map(([k, v]) => `${shortRule(k)} ${v}`)
    .join(' · ');
  steps.push({
    stepId: 'rule_eval',
    stepName: 'Rule Engine (6 rules)',
    rowsIn: summaries.length,
    rowsOut: firingProposals.length,
    durationMs: totalDuration / 3,
    summary:
      firingProposals.length === 0
        ? 'No rule fired across sessions.'
        : `${firingProposals.length} / ${summaries.length} sessions produced proposals · ${firedBy || 'mixed rules'}`,
    samplePayload: firingProposals.slice(0, 3).map((p) => ({
      deltaCount: p.deltas.length,
      confidence: p.confidence,
      reason: p.reason,
      detectedState: p.detectedState,
      timing: p.timing,
    })),
  });

  steps.push({
    stepId: 'variant_map',
    stepName: 'Variant Mapper',
    rowsIn: firingProposals.length,
    rowsOut: variantChanges,
    durationMs: totalDuration / 3,
    summary:
      variantChanges === 0
        ? 'No variant changes proposed.'
        : `${variantChanges} variant step(s) proposed across ${firingProposals.length} proposals.`,
    samplePayload: perSession
      .filter((r) => (r.variantAfter ?? 0) !== (r.variantBefore ?? 0))
      .slice(0, 5)
      .map((r) => ({
        sessionId: r.sessionId,
        userId: r.userId,
        variantBefore: r.variantBefore,
        variantAfter: r.variantAfter,
        reason: r.proposal.reason,
      })),
  });

  return {
    runId: `run_${Date.now()}`,
    adapterId: adapter.id,
    completedAtUtc: Date.now(),
    signalCount: sumSignals,
    sessionCount: summaries.length,
    proposalCount: firingProposals.length,
    steps,
    proposals,
    summaries,
    flowReadings,
    profileByUser,
    errors,
    config,
    perSession,
    variantChanges,
    ruleFireCounts,
  };
}

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

function shortRule(r: string): string {
  return r
    .replace('Rule', '')
    .replace('FlowChannel', 'Flow')
    .replace('StreakDamper', 'Streak')
    .replace('FrustrationRelief', 'Frust')
    .replace('NewPlayer', 'New')
    .replace('SessionFatigue', 'Fatigue');
}
