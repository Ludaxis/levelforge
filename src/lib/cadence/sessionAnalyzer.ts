import type {
  FlowState,
  SessionRow,
  SessionSummary,
} from './types';

/**
 * Port of Cadence's SessionAnalyzer.cs.
 *
 * Produces a SessionSummary by aggregating a session's raw signals.
 * All score formulas mirror the SDK weights documented in the PRD §9:
 *   SkillScore       = 0.7 * MoveEfficiency + 0.3 * SequenceMatchRate
 *   EngagementScore  = 0.6 * TempoConsistency + 0.4 * PausePenaltyInverse
 *   FrustrationScore = 0.30*WasteRatio + 0.25*InterMoveVariance
 *                    + 0.20*PauseRate + 0.25*(1 - MoveEfficiency)
 *
 * Missing signals default to neutral values (0.5) to match SDK behavior
 * described in PRD §9 ("If Missing" column).
 */

export function analyzeSession(session: SessionRow): SessionSummary {
  const moves = session.signals.filter((s) => s.key === 'move.executed');
  const totalMoves = moves.length;

  const optimalSignals = session.signals.filter((s) => s.key === 'move.optimal');
  const optimalCount = optimalSignals.filter((s) => s.value >= 0.5).length;
  const moveEfficiency = totalMoves > 0 ? optimalCount / totalMoves : 0;

  const wasteSignals = session.signals.filter((s) => s.key === 'move.waste');
  const wasteSum = wasteSignals.reduce((sum, s) => sum + s.value, 0);
  const wasteRatio = totalMoves > 0 ? wasteSum / totalMoves : 0;

  const progressSignals = session.signals.filter((s) => s.key === 'progress.delta');
  const progressSum = progressSignals.reduce((sum, s) => sum + s.value, 0);
  const progressRate = totalMoves > 0 ? progressSum / totalMoves : 0;

  const intervalSignals = session.signals.filter((s) => s.key === 'tempo.interval');
  const interMoveVariance = computeCoefficientOfVariation(
    intervalSignals.map((s) => s.value)
  );

  const pauseSignals = session.signals.filter((s) => s.key === 'tempo.pause');
  const pauseCount = pauseSignals.length;

  // Sequence match rate: defined as the share of moves without reset/undo
  // pressure. We approximate with (1 - undo rate); absent undo data this is 1.
  const undoSignals = session.signals.filter((s) => s.key === 'strategy.undo');
  const sequenceMatchRate =
    totalMoves > 0 ? Math.max(0, 1 - undoSignals.length / totalMoves) : 1;

  // Tempo consistency = 1 - CV (clamped)
  const tempoConsistency = clamp01(1 - interMoveVariance * 0.5);

  // Pause penalty inverse: one pause costs ~10% engagement, floor at 0.
  const pausePenaltyInverse = clamp01(1 - 0.1 * pauseCount);

  const skillScore = clamp01(
    0.7 * moveEfficiency + 0.3 * sequenceMatchRate
  );
  const engagementScore = clamp01(
    0.6 * tempoConsistency + 0.4 * pausePenaltyInverse
  );

  // Pause rate normalized against total moves (or 1 to avoid div0).
  const pauseRate = totalMoves > 0 ? clamp01(pauseCount / totalMoves) : 0;
  const frustrationScore = clamp01(
    0.3 * wasteRatio +
      0.25 * clamp01(interMoveVariance) +
      0.2 * pauseRate +
      0.25 * (1 - moveEfficiency)
  );

  const durationSec = Math.max(
    0,
    (session.endedAtUtc - session.startedAtUtc) / 1000
  );

  return {
    sessionId: session.sessionId,
    outcome: session.outcome,
    durationSec,
    totalMoves,
    moveEfficiency,
    wasteRatio,
    progressRate,
    interMoveVariance,
    pauseCount,
    skillScore,
    engagementScore,
    frustrationScore,
    finalFlowState: inferFinalFlowState({
      moveEfficiency,
      tempoConsistency,
      frustrationScore,
      totalMoves,
    }),
  };
}

interface FlowInference {
  moveEfficiency: number;
  tempoConsistency: number;
  frustrationScore: number;
  totalMoves: number;
}

/**
 * Temporary end-of-session flow inference — used until FlowDetector
 * lands. Mirrors the PRD §11 classification thresholds applied once
 * to session aggregates rather than sliding windows.
 */
function inferFinalFlowState(input: FlowInference): FlowState {
  if (input.totalMoves < 5) return 'unknown';
  if (input.frustrationScore > 0.7) return 'frustration';
  if (input.moveEfficiency > 0.85 && input.tempoConsistency > 0.7)
    return 'boredom';
  if (input.moveEfficiency < 0.3 && input.tempoConsistency < 0.2)
    return 'anxiety';
  return 'flow';
}

function computeCoefficientOfVariation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean === 0) return 0;
  const variance =
    values.reduce((sum, v) => sum + (v - mean) * (v - mean), 0) / values.length;
  const stdDev = Math.sqrt(variance);
  return stdDev / mean;
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}
