import { describe, it, expect } from 'vitest';
import { mapToVariant } from '@/lib/cadence/variantMapper';
import { juicyBlastAdapter } from '@/lib/cadence/adapters/juicyBlast';
import type { AdjustmentProposal } from '@/lib/cadence/types';

function proposal(
  deltas: Array<[string, number, number]>,
  overrides: Partial<AdjustmentProposal> = {}
): AdjustmentProposal {
  return {
    deltas: deltas.map(([parameterKey, currentValue, proposedValue]) => ({
      parameterKey,
      currentValue,
      proposedValue,
      ruleName: 'Test',
    })),
    confidence: 0.7,
    reason: 'test',
    detectedState: 'flow',
    timing: 'BeforeNextLevel',
    rulesEvaluated: [],
    ...overrides,
  };
}

describe('mapToVariant', () => {
  it('1-step on small delta (<5%)', () => {
    const p = proposal([['blocking_offset', 5, 5.2]]); // +4%
    const r = mapToVariant(p, 5, juicyBlastAdapter);
    expect(Math.abs(r.stepDelta)).toBe(1);
  });

  it('2-step on medium delta (5%–10%)', () => {
    const p = proposal([['blocking_offset', 5, 5.4]]); // +8%
    const r = mapToVariant(p, 5, juicyBlastAdapter);
    expect(Math.abs(r.stepDelta)).toBe(2);
  });

  it('maxJumpStep on large delta (>10%)', () => {
    const p = proposal([['blocking_offset', 5, 5.75]]); // +15%
    const r = mapToVariant(p, 5, juicyBlastAdapter);
    expect(Math.abs(r.stepDelta)).toBe(juicyBlastAdapter.variants!.maxJumpStep);
  });

  it('negative delta on higher_harder lever → easier variant', () => {
    const p = proposal([['blocking_offset', 5, 4.5]]);
    const r = mapToVariant(p, 5, juicyBlastAdapter);
    expect(r.stepDelta).toBeLessThan(0);
  });

  it('negative delta on lower_harder lever → harder variant', () => {
    // max_selectable: lower = harder. Proposing 10 → 8 means "harder".
    const p = proposal([['max_selectable', 10, 8]]);
    const r = mapToVariant(p, 5, juicyBlastAdapter);
    expect(r.stepDelta).toBeGreaterThan(0);
  });

  it('clamps to variant bounds', () => {
    const p = proposal([['blocking_offset', 5, 10]]); // huge +
    const r = mapToVariant(p, 7, juicyBlastAdapter);
    expect(r.proposedVariant).toBe(8);
  });

  it('applies low-confidence step cap', () => {
    const p = proposal([['blocking_offset', 5, 5.75]]); // would be 3 steps
    const r = mapToVariant(p, 5, juicyBlastAdapter, {
      lowConfidenceStepCap: 1,
      confidence: 0.2,
      lowConfidenceThreshold: 0.4,
    });
    expect(Math.abs(r.stepDelta)).toBe(1);
  });

  it('returns unchanged when no deltas', () => {
    const p = proposal([]);
    const r = mapToVariant(p, 5, juicyBlastAdapter);
    expect(r.stepDelta).toBe(0);
    expect(r.skippedReason).toBeDefined();
  });
});
