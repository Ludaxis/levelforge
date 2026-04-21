import type { DesignLever } from './adapters/types';
import { confidence01 } from './glicko2';
import type {
  AdjustmentTiming,
  CadenceConfig,
  FlowReading,
  FlowState,
  ParameterDelta,
  PlayType,
  PlayerSkillProfile,
  SessionSummary,
} from './types';

/**
 * The 6 adjustment rules shipped in the Cadence SDK package.
 * PRD v1.1 documents 4 of these (FlowChannel, StreakDamper,
 * FrustrationRelief, Cooldown); the SDK adds NewPlayer and
 * SessionFatigue.
 *
 * Rules do NOT mutate state — they return proposed deltas for the
 * AdjustmentEngine to merge, cooldown-filter, and clamp.
 */

export interface AdjustmentContext {
  profile: PlayerSkillProfile;
  /** Most recent sessions first. */
  recentSummaries: SessionSummary[];
  lastFlowReading?: FlowReading;
  /** Design-lever values the next level is about to start with. */
  currentParameters: Record<string, number>;
  levers: DesignLever[];
  config: CadenceConfig;
  /** Epoch ms of last adjustment applied (any param) for this user. */
  lastGlobalAdjustmentAtMs: number;
  /** Epoch ms of last adjustment per parameter key. */
  lastAdjustmentAtMsByParam: Record<string, number>;
  /** "Now" in epoch ms — caller-provided for determinism. */
  nowMs: number;
  /**
   * Level identifier of the upcoming session. Used by the
   * CadenceStartLevel gate — DDA stays off below the threshold.
   * Accepts either a raw number or a string like "Level15_1" that
   * contains a leading integer. Optional for callers that have no
   * level context (e.g. ad-hoc unit tests).
   */
  levelId?: string | number;
  /** song_start.play_type. When `replay`, DDA adjustment is suppressed. */
  playType?: PlayType;
}

export interface RuleFiring {
  ruleName: string;
  reason: string;
  deltas: ParameterDelta[];
  detectedState?: FlowState;
  timing: AdjustmentTiming;
}

export type Direction = 'ease' | 'harden';

function dirSign(lever: DesignLever, dir: Direction): number {
  if (lever.direction === 'higher_harder') return dir === 'ease' ? -1 : 1;
  return dir === 'ease' ? 1 : -1;
}

function buildDeltas(
  levers: DesignLever[],
  params: Record<string, number>,
  magnitude: number,
  dir: Direction,
  ruleName: string
): ParameterDelta[] {
  const out: ParameterDelta[] = [];
  for (const lever of levers) {
    const cur = params[lever.key];
    if (cur === undefined || !Number.isFinite(cur)) continue;
    const signed = magnitude * dirSign(lever, dir);
    const proposed = cur + cur * signed;
    const clampedProposed = Math.max(lever.range[0], Math.min(lever.range[1], proposed));
    if (Math.abs(clampedProposed - cur) < 1e-9) continue;
    out.push({
      parameterKey: lever.key,
      currentValue: cur,
      proposedValue: clampedProposed,
      ruleName,
    });
  }
  return out;
}

// ─── Rule 1: Flow Channel ────────────────────────────────────────
export function flowChannelRule(ctx: AdjustmentContext): RuleFiring | null {
  const ae = ctx.config.adjustmentEngine;
  if (ctx.profile.sessionsCompleted < ae.minSessionsBeforeActive) return null;
  if (ctx.recentSummaries.length === 0) return null;

  const N = Math.min(ctx.recentSummaries.length, 10);
  const recent = ctx.recentSummaries.slice(0, N);
  const winRate = recent.filter((s) => s.outcome === 'win').length / recent.length;

  if (winRate >= ae.targetWinRateMin && winRate <= ae.targetWinRateMax) return null;

  let direction: Direction;
  let magnitude: number;
  if (winRate < ae.targetWinRateMin) {
    direction = 'ease';
    magnitude = (ae.targetWinRateMin - winRate) * 0.2; // 20% per full unit of gap
  } else {
    direction = 'harden';
    magnitude = (winRate - ae.targetWinRateMax) * 0.2;
  }

  const deltas = buildDeltas(
    ctx.levers,
    ctx.currentParameters,
    magnitude,
    direction,
    'FlowChannelRule'
  );
  if (deltas.length === 0) return null;

  return {
    ruleName: 'FlowChannelRule',
    reason: `Win rate ${(winRate * 100).toFixed(0)}% is outside ${(ae.targetWinRateMin * 100).toFixed(0)}–${(ae.targetWinRateMax * 100).toFixed(0)}% target band — ${direction}`,
    deltas,
    timing: 'BeforeNextLevel',
  };
}

// ─── Rule 2: Streak Damper ───────────────────────────────────────
export function streakDamperRule(ctx: AdjustmentContext): RuleFiring | null {
  const ae = ctx.config.adjustmentEngine;
  const recent = ctx.recentSummaries;
  if (recent.length === 0) return null;

  let lossStreak = 0;
  let winStreak = 0;
  for (const s of recent) {
    if (s.outcome === 'lose') {
      if (winStreak > 0) break;
      lossStreak++;
    } else if (s.outcome === 'win') {
      if (lossStreak > 0) break;
      winStreak++;
    } else {
      break;
    }
  }

  if (lossStreak >= ae.lossStreakThreshold) {
    const extra = lossStreak - ae.lossStreakThreshold;
    const magnitude = ae.lossStreakEaseAmount + 0.02 * extra;
    const deltas = buildDeltas(
      ctx.levers,
      ctx.currentParameters,
      magnitude,
      'ease',
      'StreakDamperRule'
    );
    if (deltas.length === 0) return null;
    return {
      ruleName: 'StreakDamperRule',
      reason: `${lossStreak} consecutive losses — easing`,
      deltas,
      timing: 'BeforeNextLevel',
    };
  }

  if (winStreak >= ae.winStreakThreshold) {
    const extra = winStreak - ae.winStreakThreshold;
    const magnitude = ae.winStreakHardenAmount + 0.01 * extra;
    const deltas = buildDeltas(
      ctx.levers,
      ctx.currentParameters,
      magnitude,
      'harden',
      'StreakDamperRule'
    );
    if (deltas.length === 0) return null;
    return {
      ruleName: 'StreakDamperRule',
      reason: `${winStreak} consecutive wins — hardening`,
      deltas,
      timing: 'BeforeNextLevel',
    };
  }
  return null;
}

// ─── Rule 3: Frustration Relief ──────────────────────────────────
export function frustrationReliefRule(ctx: AdjustmentContext): RuleFiring | null {
  const ae = ctx.config.adjustmentEngine;
  const last = ctx.recentSummaries[0];
  if (!last) return null;

  const frustration = last.frustrationScore;
  if (frustration <= ae.frustrationReliefThreshold) return null;

  const severity = Math.min(1, (frustration - ae.frustrationReliefThreshold) / (1 - ae.frustrationReliefThreshold));
  const magnitude =
    ae.easeMinPercent + (ae.easeMaxPercent - ae.easeMinPercent) * severity;

  const deltas = buildDeltas(
    ctx.levers,
    ctx.currentParameters,
    magnitude,
    'ease',
    'FrustrationReliefRule'
  );
  if (deltas.length === 0) return null;

  // Timing honors the adapter/config's allowMidSession, though replay
  // only ever emits BeforeNextLevel (mid-session would be live).
  const timing: AdjustmentTiming =
    ae.allowMidSession && ctx.lastFlowReading?.state === 'frustration'
      ? 'MidSession'
      : 'BeforeNextLevel';

  return {
    ruleName: 'FrustrationReliefRule',
    reason: `FrustrationScore ${frustration.toFixed(2)} > threshold ${ae.frustrationReliefThreshold} — easing (severity ${(severity * 100).toFixed(0)}%)`,
    deltas,
    detectedState: ctx.lastFlowReading?.state ?? last.finalFlowState,
    timing,
  };
}

// ─── Rule 4: New Player (SDK extra, not in PRD) ─────────────────
export function newPlayerRule(ctx: AdjustmentContext): RuleFiring | null {
  const ae = ctx.config.adjustmentEngine;
  if (ctx.profile.sessionsCompleted >= ae.newPlayerSessionGate) return null;

  // Gentle ease — grows smaller as player completes more sessions.
  const remaining = ae.newPlayerSessionGate - ctx.profile.sessionsCompleted;
  const magnitude = 0.015 * remaining; // e.g. 5 remaining = 7.5%

  const deltas = buildDeltas(
    ctx.levers,
    ctx.currentParameters,
    magnitude,
    'ease',
    'NewPlayerRule'
  );
  if (deltas.length === 0) return null;

  return {
    ruleName: 'NewPlayerRule',
    reason: `New player (${ctx.profile.sessionsCompleted}/${ae.newPlayerSessionGate} sessions) — easing`,
    deltas,
    timing: 'BeforeNextLevel',
  };
}

// ─── Rule 5: Session Fatigue (SDK extra, not in PRD) ────────────
export function sessionFatigueRule(ctx: AdjustmentContext): RuleFiring | null {
  const ae = ctx.config.adjustmentEngine;
  const recent = ctx.recentSummaries;
  // Strict > so that exactly-threshold counts don't trigger fatigue —
  // fatigue is about *more than* the threshold of recent back-to-back play.
  if (recent.length <= ae.sessionFatigueThresholdLevels) return null;

  // Magnitude is intentionally small so Flow Channel / Streak Damper
  // remain dominant when their signals are strong.
  const count = Math.min(recent.length, ae.sessionFatigueThresholdLevels + 5);
  const magnitude = 0.02 + 0.005 * (count - ae.sessionFatigueThresholdLevels);

  const deltas = buildDeltas(
    ctx.levers,
    ctx.currentParameters,
    magnitude,
    'ease',
    'SessionFatigueRule'
  );
  if (deltas.length === 0) return null;

  return {
    ruleName: 'SessionFatigueRule',
    reason: `${count}+ sessions in recent window — easing for fatigue`,
    deltas,
    timing: 'BeforeNextLevel',
  };
}

/** Rule 6 (Cooldown) is enforced by the engine as a filter, not a proposer. */
export function isParameterOnCooldown(
  paramKey: string,
  ctx: AdjustmentContext
): boolean {
  const ae = ctx.config.adjustmentEngine;
  const lastAt = ctx.lastAdjustmentAtMsByParam[paramKey];
  if (lastAt === undefined || lastAt === 0) return false;
  const sinceMs = ctx.nowMs - lastAt;
  return sinceMs < ae.perParameterCooldownSeconds * 1000;
}

export function isGlobalOnCooldown(ctx: AdjustmentContext): boolean {
  const ae = ctx.config.adjustmentEngine;
  if (!ctx.lastGlobalAdjustmentAtMs) return false;
  const sinceMs = ctx.nowMs - ctx.lastGlobalAdjustmentAtMs;
  return sinceMs < ae.globalCooldownSeconds * 1000;
}

/** Utility so the engine can pass confidence to the rule layer. */
export function contextConfidence(ctx: AdjustmentContext): number {
  return confidence01(ctx.profile.deviation, ctx.config.playerModel.maxDeviation);
}
