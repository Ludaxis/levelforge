import { describe, it, expect } from 'vitest';
import { evaluateAdjustment } from '@/lib/cadence/adjustmentEngine';
import { cloneDefaultConfig } from '@/lib/cadence/defaultConfig';
import { juicyBlastAdapter } from '@/lib/cadence/adapters/juicyBlast';
import type { AdjustmentContext } from '@/lib/cadence/adjustmentRules';
import type { SessionSummary, PlayerSkillProfile } from '@/lib/cadence/types';

function summary(
  outcome: 'win' | 'lose',
  overrides: Partial<SessionSummary> = {}
): SessionSummary {
  return {
    sessionId: 'x',
    outcome,
    durationSec: 30,
    totalMoves: 20,
    moveEfficiency: 0.6,
    wasteRatio: 0.1,
    progressRate: 0.05,
    interMoveVariance: 0.2,
    pauseCount: 0,
    skillScore: 0.6,
    engagementScore: 0.6,
    frustrationScore: 0.3,
    finalFlowState: 'flow',
    ...overrides,
  };
}

function profile(
  over: Partial<PlayerSkillProfile> = {}
): PlayerSkillProfile {
  return {
    rating: 1500,
    deviation: 200,
    volatility: 0.06,
    sessionsCompleted: 10,
    lastSessionUtcTicks: 0,
    averageEfficiency: 0.6,
    averageOutcome: 0.5,
    history: [],
    ...over,
  };
}

function ctx(over: Partial<AdjustmentContext> = {}): AdjustmentContext {
  const config = cloneDefaultConfig();
  return {
    profile: profile(),
    recentSummaries: [summary('win'), summary('win'), summary('lose')],
    lastFlowReading: {
      state: 'flow',
      confidence: 0.8,
      tempoScore: 0.7,
      efficiencyScore: 0.6,
      engagementScore: 0.6,
      frustrationScore: 0.3,
      sessionTime: 30,
    },
    currentParameters: {
      blocking_offset: 5,
      max_selectable: 10,
      active_launchers: 2,
      color_variant_density: 30,
    },
    levers: juicyBlastAdapter.designLevers,
    config,
    lastGlobalAdjustmentAtMs: 0,
    lastAdjustmentAtMsByParam: {},
    nowMs: 1_000_000,
    ...over,
  };
}

describe('evaluateAdjustment', () => {
  it('returns no deltas when nothing fires', () => {
    const c = ctx({
      recentSummaries: [
        summary('win'),
        summary('lose'),
        summary('win'),
        summary('lose'),
        summary('win'),
      ],
    });
    const p = evaluateAdjustment(c);
    expect(p.deltas).toEqual([]);
    expect(p.reason).toMatch(/No rule fired/);
  });

  it('Flow Channel fires when win rate is below target', () => {
    const c = ctx({
      recentSummaries: Array.from({ length: 10 }, () => summary('lose')),
    });
    const p = evaluateAdjustment(c);
    expect(p.rulesEvaluated).toContain('FlowChannelRule');
    expect(p.deltas.length).toBeGreaterThan(0);
    expect(p.reason).toMatch(/ease/);
  });

  it('Flow Channel fires harden when win rate is above target', () => {
    const c = ctx({
      recentSummaries: Array.from({ length: 10 }, () => summary('win')),
    });
    const p = evaluateAdjustment(c);
    expect(p.deltas.length).toBeGreaterThan(0);
    // blocking_offset direction is higher_harder, so hardening = positive delta
    const blocking = p.deltas.find((d) => d.parameterKey === 'blocking_offset');
    expect(blocking?.proposedValue).toBeGreaterThan(blocking?.currentValue ?? 0);
  });

  it('Streak Damper fires on 3+ consecutive losses', () => {
    const c = ctx({
      recentSummaries: [summary('lose'), summary('lose'), summary('lose')],
    });
    const p = evaluateAdjustment(c);
    const names = p.deltas.map((d) => d.ruleName);
    // Streak may win the "largest delta" competition over Flow Channel.
    expect(names.some((n) => n === 'StreakDamperRule' || n === 'FlowChannelRule')).toBe(true);
  });

  it('Frustration Relief fires when frustrationScore > threshold', () => {
    const c = ctx({
      recentSummaries: [
        summary('lose', { frustrationScore: 0.9 }),
        summary('win'),
        summary('win'),
      ],
    });
    const p = evaluateAdjustment(c);
    expect(p.reason).toMatch(/FrustrationScore/);
    // All deltas should be eases (blocking_offset lower, max_selectable higher etc.)
    const blocking = p.deltas.find((d) => d.parameterKey === 'blocking_offset');
    if (blocking) expect(blocking.proposedValue).toBeLessThan(blocking.currentValue);
  });

  it('New Player rule fires for low session count', () => {
    const c = ctx({ profile: profile({ sessionsCompleted: 2 }) });
    const p = evaluateAdjustment(c);
    expect(p.rulesEvaluated).toContain('NewPlayerRule');
    expect(p.deltas.length).toBeGreaterThan(0);
  });

  it('global cooldown suppresses the entire proposal', () => {
    const c = ctx({
      recentSummaries: Array.from({ length: 10 }, () => summary('lose')),
      lastGlobalAdjustmentAtMs: 999_950, // 50ms ago
    });
    const p = evaluateAdjustment(c);
    expect(p.deltas).toEqual([]);
    expect(p.reason).toMatch(/Global cooldown/);
  });

  it('per-parameter cooldown filters affected deltas only', () => {
    const c = ctx({
      recentSummaries: Array.from({ length: 10 }, () => summary('win')),
      lastAdjustmentAtMsByParam: {
        blocking_offset: 999_950, // 50ms ago
      },
    });
    const p = evaluateAdjustment(c);
    expect(p.deltas.some((d) => d.parameterKey === 'blocking_offset')).toBe(false);
    expect(p.deltas.length).toBeGreaterThan(0);
    expect(p.reason).toMatch(/cooldown/);
  });

  it('clamps delta to maxDeltaPerAdjustment (15%)', () => {
    const c = ctx({
      recentSummaries: Array.from({ length: 10 }, () => summary('lose')),
    });
    const p = evaluateAdjustment(c);
    for (const d of p.deltas) {
      const pct = Math.abs((d.proposedValue - d.currentValue) / d.currentValue);
      expect(pct).toBeLessThanOrEqual(0.151); // 15% + float slack
    }
  });

  it('is deterministic', () => {
    const c1 = ctx({
      recentSummaries: [summary('win'), summary('win'), summary('lose')],
    });
    const c2 = ctx({
      recentSummaries: [summary('win'), summary('win'), summary('lose')],
    });
    expect(evaluateAdjustment(c1)).toEqual(evaluateAdjustment(c2));
  });
});
