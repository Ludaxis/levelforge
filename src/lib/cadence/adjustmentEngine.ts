import {
  flowChannelRule,
  streakDamperRule,
  frustrationReliefRule,
  newPlayerRule,
  sessionFatigueRule,
  isParameterOnCooldown,
  isGlobalOnCooldown,
  contextConfidence,
  type AdjustmentContext,
  type RuleFiring,
} from './adjustmentRules';
import type {
  AdjustmentProposal,
  AdjustmentTiming,
  FlowState,
  ParameterDelta,
} from './types';

/**
 * AdjustmentEngine — runs rules, merges deltas, applies cooldown + clamp,
 * returns an AdjustmentProposal. Matches the SDK pipeline in shape.
 *
 * Rule order (PRD §13 + SDK additions):
 *   1. Flow Channel
 *   2. Streak Damper
 *   3. Frustration Relief
 *   4. New Player  (SDK)
 *   5. Session Fatigue  (SDK)
 *   6. Cooldown — applied as a filter, not a proposer
 *
 * Two short-circuit gates run before rule evaluation, matching the
 * shipped SDK:
 *   - CadenceStartLevel: DDA is off below the gate (default 6).
 *   - play_type=replay: DDA is suppressed on replays of mastered levels.
 */
export function evaluateAdjustment(ctx: AdjustmentContext): AdjustmentProposal {
  const detectedStateFallback: FlowState = ctx.lastFlowReading?.state ?? 'unknown';
  const emptyConfidence = contextConfidence(ctx);

  // ── Gate 1: CadenceStartLevel ─────────────────────────────────────
  const startLevel = ctx.config.adjustmentEngine.cadenceStartLevel ?? 0;
  const lvl = parseLevelNumber(ctx.levelId);
  if (startLevel > 0 && lvl !== undefined && lvl < startLevel) {
    return {
      deltas: [],
      confidence: emptyConfidence,
      reason: `Below CadenceStartLevel (level ${lvl} < ${startLevel}) — DDA disabled.`,
      detectedState: detectedStateFallback,
      timing: 'BeforeNextLevel',
      rulesEvaluated: [],
    };
  }

  // ── Gate 2: play_type=replay ──────────────────────────────────────
  if (ctx.playType === 'replay') {
    return {
      deltas: [],
      confidence: emptyConfidence,
      reason: 'play_type=replay — DDA suppressed on replays.',
      detectedState: detectedStateFallback,
      timing: 'BeforeNextLevel',
      rulesEvaluated: [],
    };
  }

  const rules = [
    flowChannelRule,
    streakDamperRule,
    frustrationReliefRule,
    newPlayerRule,
    sessionFatigueRule,
  ];

  const firings: RuleFiring[] = [];
  const rulesEvaluated: string[] = [];

  for (const rule of rules) {
    const firing = rule(ctx);
    const name =
      rule === flowChannelRule
        ? 'FlowChannelRule'
        : rule === streakDamperRule
          ? 'StreakDamperRule'
          : rule === frustrationReliefRule
            ? 'FrustrationReliefRule'
            : rule === newPlayerRule
              ? 'NewPlayerRule'
              : 'SessionFatigueRule';
    rulesEvaluated.push(name);
    if (firing && firing.deltas.length > 0) firings.push(firing);
  }

  const confidence = contextConfidence(ctx);
  const detectedState: FlowState =
    firings.find((f) => f.detectedState)?.detectedState ??
    ctx.lastFlowReading?.state ??
    'unknown';

  if (firings.length === 0) {
    return {
      deltas: [],
      confidence,
      reason: 'No rule fired — difficulty stable.',
      detectedState,
      timing: 'BeforeNextLevel',
      rulesEvaluated,
    };
  }

  // Global cooldown — suppress entire proposal (log as skipped).
  if (isGlobalOnCooldown(ctx)) {
    return {
      deltas: [],
      confidence,
      reason: `Global cooldown active (${ctx.config.adjustmentEngine.globalCooldownSeconds}s) — proposal suppressed.`,
      detectedState,
      timing: 'BeforeNextLevel',
      rulesEvaluated,
    };
  }

  // Merge deltas per parameter: keep the largest absolute delta, tracking
  // which rule drove it. SDK's behavior matches this — "largest absolute
  // delta wins" is the approach documented in AdjustmentEngine.cs.
  const merged = new Map<string, ParameterDelta>();
  for (const firing of firings) {
    for (const delta of firing.deltas) {
      const existing = merged.get(delta.parameterKey);
      const deltaSize = Math.abs(delta.proposedValue - delta.currentValue);
      const existingSize = existing
        ? Math.abs(existing.proposedValue - existing.currentValue)
        : -1;
      if (!existing || deltaSize > existingSize) {
        merged.set(delta.parameterKey, delta);
      }
    }
  }

  // Per-parameter cooldown filter.
  const afterCooldown: ParameterDelta[] = [];
  const cooldownSkipped: string[] = [];
  for (const [key, delta] of merged) {
    if (isParameterOnCooldown(key, ctx)) {
      cooldownSkipped.push(key);
      continue;
    }
    afterCooldown.push(delta);
  }

  // Clamp to MaxDeltaPerAdjustment (% of current value).
  const maxPct = ctx.config.adjustmentEngine.maxDeltaPerAdjustment;
  const clamped = afterCooldown.map((d) => {
    const rawDelta = d.proposedValue - d.currentValue;
    const maxAllowed = Math.abs(d.currentValue) * maxPct;
    if (Math.abs(rawDelta) <= maxAllowed) return d;
    const sign = rawDelta >= 0 ? 1 : -1;
    return {
      ...d,
      proposedValue: d.currentValue + sign * maxAllowed,
    };
  });

  // Low-confidence cap: SDK caps to 1 step when confidence < threshold.
  // We express this by halving deltas under the confidence gate —
  // variant mapping (downstream) will additionally cap steps.
  if (confidence < ctx.config.adjustmentEngine.lowConfidenceThreshold) {
    for (const d of clamped) {
      const rawDelta = d.proposedValue - d.currentValue;
      d.proposedValue = d.currentValue + rawDelta * 0.5;
    }
  }

  const primary = firings[0];
  const reasons = firings.map((f) => f.reason);
  const timing: AdjustmentTiming = primary.timing;

  let reason = reasons.join(' · ');
  if (cooldownSkipped.length > 0) {
    reason += ` · ${cooldownSkipped.length} delta(s) skipped by per-parameter cooldown`;
  }

  return {
    deltas: clamped,
    confidence,
    reason,
    detectedState,
    timing,
    rulesEvaluated,
  };
}

/**
 * Extract the leading integer from a level id. Handles:
 *   - numeric ids: 15 → 15
 *   - prefixed strings: "Level15_1" → 15, "lvl_06" → 6
 *   - pure digit strings: "15" → 15
 * Returns undefined when no integer is present — the caller treats this
 * as "no gate information" and allows the proposal through.
 */
function parseLevelNumber(id: string | number | undefined): number | undefined {
  if (id === undefined || id === null) return undefined;
  if (typeof id === 'number') return Number.isFinite(id) ? id : undefined;
  const match = /(\d+)/.exec(id);
  if (!match) return undefined;
  const n = Number.parseInt(match[1], 10);
  return Number.isFinite(n) ? n : undefined;
}
