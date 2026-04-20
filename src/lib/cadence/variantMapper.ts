import type { GameAdapter } from './adapters/types';
import type { AdjustmentProposal } from './types';

/**
 * Translate an AdjustmentProposal into a variant step for games that
 * use pre-built level variants (e.g., Juicy Blast 2–8, base 5).
 *
 * Matches the algorithm in juicy-blast's CadenceService.cs:
 *   1. Compute total signed percentage change across all deltas.
 *   2. magnitude < stepThresholds[0] → 1 step
 *      < stepThresholds[1]          → 2 steps
 *      else                         → maxJumpStep steps
 *   3. Direction: negative total % → easier (fewer steps), positive → harder.
 *   4. Clamp result to [min, max].
 *
 * Returns the proposed variant. If the adapter has no `variants` config,
 * returns `currentVariant` unchanged.
 */
export interface VariantMapResult {
  currentVariant: number;
  proposedVariant: number;
  stepDelta: number;
  totalDeltaPct: number;
  skippedReason?: string;
}

export function mapToVariant(
  proposal: AdjustmentProposal,
  currentVariant: number,
  adapter: GameAdapter,
  opts: { lowConfidenceStepCap?: number; confidence?: number; lowConfidenceThreshold?: number } = {}
): VariantMapResult {
  const variants = adapter.variants;
  if (!variants) {
    return {
      currentVariant,
      proposedVariant: currentVariant,
      stepDelta: 0,
      totalDeltaPct: 0,
      skippedReason: 'Adapter has no variant system configured.',
    };
  }

  if (proposal.deltas.length === 0) {
    return {
      currentVariant,
      proposedVariant: currentVariant,
      stepDelta: 0,
      totalDeltaPct: 0,
      skippedReason: 'No deltas to map.',
    };
  }

  let totalPct = 0;
  let validCount = 0;
  for (const d of proposal.deltas) {
    if (d.currentValue === 0) continue;
    const pct = (d.proposedValue - d.currentValue) / d.currentValue;
    // Normalize by design-lever direction — easing yields negative, hardening positive.
    const lever = adapter.designLevers.find((l) => l.key === d.parameterKey);
    const signedPct = lever && lever.direction === 'lower_harder' ? -pct : pct;
    totalPct += signedPct;
    validCount++;
  }
  if (validCount === 0) {
    return {
      currentVariant,
      proposedVariant: currentVariant,
      stepDelta: 0,
      totalDeltaPct: 0,
      skippedReason: 'All deltas had zero current value.',
    };
  }

  const magnitude = Math.abs(totalPct);
  let steps: number;
  if (magnitude < variants.stepThresholds[0]) {
    steps = 1;
  } else if (magnitude < variants.stepThresholds[1]) {
    steps = 2;
  } else {
    steps = variants.maxJumpStep;
  }

  if (
    opts.lowConfidenceStepCap !== undefined &&
    opts.confidence !== undefined &&
    opts.lowConfidenceThreshold !== undefined &&
    opts.confidence < opts.lowConfidenceThreshold
  ) {
    steps = Math.min(steps, opts.lowConfidenceStepCap);
  }

  const direction = totalPct < 0 ? -1 : 1;
  const rawVariant = currentVariant + direction * steps;
  const proposedVariant = Math.max(variants.min, Math.min(variants.max, rawVariant));

  return {
    currentVariant,
    proposedVariant,
    stepDelta: proposedVariant - currentVariant,
    totalDeltaPct: totalPct,
  };
}
