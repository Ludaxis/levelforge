import type { CadenceConfig, FlowReading, FlowState, SessionRow } from './types';

/**
 * Port of Cadence's FlowDetector.cs.
 *
 * In production the FlowDetector is ticked every frame; for replay we
 * reconstruct readings move-by-move from a completed SessionRow.
 *
 * Windows (sizes from config):
 *   - Tempo     : last N inter-move intervals; score = 1 - CV*0.5
 *   - Efficiency: last N move.optimal values; score = mean
 *   - Engagement: last N {progress+, pause-, rejected-} events; score = mean
 *
 * Smoothing: EMA with α = config.flowDetector.exponentialAlpha.
 *
 * Classification (after warmupMoves):
 *   Frustration if frustrationScore > threshold
 *   Boredom    if efficiency ≥ 0.85 AND tempo ≥ 0.7
 *   Anxiety    if efficiency ≤ 0.3  AND tempo ≤ 0.2
 *   Flow       otherwise
 *
 * Hysteresis: transition requires hysteresisCount consecutive
 * identical classifications; otherwise hold previous state.
 */

interface EngagementEvent {
  positive: boolean;
}

export function replayFlowDetection(
  session: SessionRow,
  config: CadenceConfig
): FlowReading[] {
  const fd = config.flowDetector;
  const readings: FlowReading[] = [];

  // Ordered iteration: move rows advance the tick; other signals fold into windows.
  // Build a merged timeline keyed by sessionTime then moveIndex.
  const timeline = [...session.signals].sort((a, b) => {
    if (a.sessionTime !== b.sessionTime) return a.sessionTime - b.sessionTime;
    return a.moveIndex - b.moveIndex;
  });

  const tempoWin: number[] = [];
  const efficiencyWin: number[] = [];
  const engagementWin: EngagementEvent[] = [];

  let smoothedTempo = 0.5;
  let smoothedEfficiency = 0.5;
  let smoothedEngagement = 0.5;
  let smoothedFrustration = 0;

  let runningWaste = 0;
  let wasteCount = 0;
  let moveCount = 0;

  let currentState: FlowState = 'unknown';
  let pendingCandidate: FlowState | null = null;
  let pendingCount = 0;

  for (const sig of timeline) {
    let emitTick = false;

    switch (sig.key) {
      case 'move.executed':
        moveCount++;
        emitTick = true;
        break;
      case 'tempo.interval':
        pushWindow(tempoWin, sig.value, fd.tempoWindowSize);
        break;
      case 'move.optimal':
        pushWindow(efficiencyWin, sig.value, fd.efficiencyWindowSize);
        break;
      case 'progress.delta':
        if (sig.value > 0) pushEngagement(engagementWin, true, fd.engagementWindowSize);
        break;
      case 'tempo.pause':
      case 'input.rejected':
      case 'strategy.undo_streak':
        pushEngagement(engagementWin, false, fd.engagementWindowSize);
        break;
      case 'move.waste':
        runningWaste += sig.value;
        wasteCount++;
        break;
    }

    if (!emitTick) continue;

    // Window scores
    const tempoScoreRaw = tempoScore(tempoWin);
    const efficiencyScoreRaw =
      efficiencyWin.length === 0
        ? 0.5
        : efficiencyWin.reduce((s, x) => s + x, 0) / efficiencyWin.length;
    const engagementScoreRaw =
      engagementWin.length === 0
        ? 0.5
        : engagementWin.filter((e) => e.positive).length / engagementWin.length;

    // Frustration blend — simplified proxy vs SDK's full weighting; good enough for replay.
    const wasteAvg = wasteCount > 0 ? runningWaste / wasteCount : 0;
    const frustrationRaw = clamp01(
      0.35 * wasteAvg +
        0.35 * (1 - efficiencyScoreRaw) +
        0.3 * (1 - engagementScoreRaw)
    );

    // EMA smoothing
    smoothedTempo = ema(smoothedTempo, tempoScoreRaw, fd.exponentialAlpha);
    smoothedEfficiency = ema(smoothedEfficiency, efficiencyScoreRaw, fd.exponentialAlpha);
    smoothedEngagement = ema(smoothedEngagement, engagementScoreRaw, fd.exponentialAlpha);
    smoothedFrustration = ema(smoothedFrustration, frustrationRaw, fd.exponentialAlpha);

    // Candidate classification
    let candidate: FlowState;
    if (moveCount < fd.warmupMoves) {
      candidate = 'unknown';
    } else if (smoothedFrustration > fd.frustrationThreshold) {
      candidate = 'frustration';
    } else if (
      smoothedEfficiency >= fd.boredomEfficiencyMin &&
      smoothedTempo >= fd.boredomTempoMin
    ) {
      candidate = 'boredom';
    } else if (
      smoothedEfficiency <= fd.anxietyEfficiencyMax &&
      smoothedTempo <= fd.anxietyTempoMax
    ) {
      candidate = 'anxiety';
    } else {
      candidate = 'flow';
    }

    // Hysteresis
    if (candidate === currentState) {
      pendingCandidate = null;
      pendingCount = 0;
    } else if (candidate === pendingCandidate) {
      pendingCount++;
      if (pendingCount >= fd.hysteresisCount) {
        currentState = candidate;
        pendingCandidate = null;
        pendingCount = 0;
      }
    } else {
      pendingCandidate = candidate;
      pendingCount = 1;
    }

    readings.push({
      state: currentState,
      confidence: confidenceForState(
        currentState,
        smoothedEfficiency,
        smoothedTempo,
        smoothedFrustration
      ),
      tempoScore: smoothedTempo,
      efficiencyScore: smoothedEfficiency,
      engagementScore: smoothedEngagement,
      frustrationScore: smoothedFrustration,
      sessionTime: sig.sessionTime,
    });
  }

  return readings;
}

function pushWindow(win: number[], v: number, maxSize: number) {
  win.push(v);
  if (win.length > maxSize) win.shift();
}
function pushEngagement(win: EngagementEvent[], positive: boolean, maxSize: number) {
  win.push({ positive });
  if (win.length > maxSize) win.shift();
}

function tempoScore(intervals: number[]): number {
  if (intervals.length < 2) return 0.5;
  const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  if (mean === 0) return 0.5;
  const variance =
    intervals.reduce((s, v) => s + (v - mean) * (v - mean), 0) / intervals.length;
  const cv = Math.sqrt(variance) / mean;
  return clamp01(1 - cv * 0.5);
}

function confidenceForState(
  state: FlowState,
  efficiency: number,
  tempo: number,
  frustration: number
): number {
  switch (state) {
    case 'flow':
      return clamp01(0.6 + efficiency * 0.2 + tempo * 0.2);
    case 'boredom':
      return clamp01(efficiency * 0.6 + tempo * 0.4);
    case 'anxiety':
      return clamp01((1 - efficiency) * 0.6 + (1 - tempo) * 0.4);
    case 'frustration':
      return clamp01(frustration);
    case 'unknown':
      return 0;
  }
}

function ema(prev: number, next: number, alpha: number): number {
  return alpha * next + (1 - alpha) * prev;
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}
