/**
 * Variant-resolution shared between the in-editor Bulk Variant Generator
 * and the collection-wide bulk export. Keeping it here means both surfaces
 * read the same rules (persisted in localStorage) and apply the same
 * auto-clamp behaviour, so the difficulty curve stays uniform.
 */

import {
  DIFFICULTY_ELEMENTS,
  getDifficultyElement,
  type DifficultyElementKey,
} from './difficultyElements';

export interface VariantRule {
  id: string;
  variantNumber: number;
  element: DifficultyElementKey;
  delta: number;
}

export interface BaseLevelValues {
  maxSelectableItems: number;
  blockingOffset: number;
  activeLauncherCount: number;
  waitingStandSlots: number;
  moveLimit?: number;
  /** Dynamic upper cap for `activeLauncherCount`, computed from the loaded level. */
  maxActiveLaunchers?: number;
}

export interface ResolvedVariant {
  variantNumber: number;
  values: Record<DifficultyElementKey, number | undefined>;
  deltas: Array<{ element: DifficultyElementKey; delta: number }>;
  clampedKeys: Set<DifficultyElementKey>;
}

export interface VariantAdjustment {
  variantNumber: number;
  element: DifficultyElementKey;
  requested: number;
  applied: number;
  reason: string;
}

export interface VariantError {
  variantNumber: number;
  element: DifficultyElementKey;
  reason: string;
}

export interface ResolveOutput {
  variants: ResolvedVariant[];
  adjustments: VariantAdjustment[];
  errors: VariantError[];
}

export const VARIANT_RULES_STORAGE_KEY =
  'juicyblast.bulkVariantGenerator.rules.v1';

export function makeRuleId(): string {
  return `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function defaultVariantRules(): VariantRule[] {
  return [
    { id: makeRuleId(), variantNumber: 2, element: 'maxSelectableItems', delta: -2 },
    { id: makeRuleId(), variantNumber: 3, element: 'maxSelectableItems', delta: -1 },
    { id: makeRuleId(), variantNumber: 4, element: 'blockingOffset', delta: -1 },
    { id: makeRuleId(), variantNumber: 6, element: 'blockingOffset', delta: 1 },
    { id: makeRuleId(), variantNumber: 7, element: 'maxSelectableItems', delta: 1 },
    { id: makeRuleId(), variantNumber: 8, element: 'maxSelectableItems', delta: 2 },
  ];
}

export function loadVariantRules(): VariantRule[] {
  if (typeof window === 'undefined') return defaultVariantRules();
  try {
    const raw = window.localStorage.getItem(VARIANT_RULES_STORAGE_KEY);
    if (!raw) return defaultVariantRules();
    const parsed = JSON.parse(raw) as VariantRule[];
    if (!Array.isArray(parsed) || parsed.length === 0) return defaultVariantRules();
    return parsed
      .filter(
        (r) =>
          typeof r === 'object' &&
          typeof r.variantNumber === 'number' &&
          typeof r.delta === 'number' &&
          typeof r.element === 'string' &&
          !!getDifficultyElement(r.element as DifficultyElementKey)
      )
      .map((r) => ({ ...r, id: r.id || makeRuleId() }));
  } catch {
    return defaultVariantRules();
  }
}

export function saveVariantRules(rules: VariantRule[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(VARIANT_RULES_STORAGE_KEY, JSON.stringify(rules));
  } catch {
    /* storage quota / private mode — silently skip */
  }
}

export function resolveVariants(
  rules: VariantRule[],
  base: BaseLevelValues
): ResolveOutput {
  const byVariant = new Map<number, ResolvedVariant>();
  const errors: VariantError[] = [];

  for (const rule of rules) {
    if (!Number.isInteger(rule.variantNumber) || rule.variantNumber < 1) {
      errors.push({
        variantNumber: rule.variantNumber,
        element: rule.element,
        reason: `Variant number must be a positive integer.`,
      });
      continue;
    }
    let entry = byVariant.get(rule.variantNumber);
    if (!entry) {
      entry = {
        variantNumber: rule.variantNumber,
        values: {
          maxSelectableItems: base.maxSelectableItems,
          blockingOffset: base.blockingOffset,
          activeLauncherCount: base.activeLauncherCount,
          waitingStandSlots: base.waitingStandSlots,
          moveLimit: base.moveLimit,
        },
        deltas: [],
        clampedKeys: new Set(),
      };
      byVariant.set(rule.variantNumber, entry);
    }
    const spec = DIFFICULTY_ELEMENTS.find((e) => e.key === rule.element);
    if (!spec) continue;
    const current = entry.values[rule.element];
    if (current === undefined) {
      if (spec.optional) {
        errors.push({
          variantNumber: rule.variantNumber,
          element: rule.element,
          reason: `${spec.label} is not set on the base level — delta can't be applied. Set a base value or remove this row.`,
        });
      }
      continue;
    }
    entry.values[rule.element] = current + rule.delta;
    entry.deltas.push({ element: rule.element, delta: rule.delta });
  }

  const variants = [...byVariant.values()].sort(
    (a, b) => a.variantNumber - b.variantNumber
  );

  const adjustments: VariantAdjustment[] = [];
  for (const v of variants) {
    for (const spec of DIFFICULTY_ELEMENTS) {
      const value = v.values[spec.key];
      if (value === undefined) continue;
      const dynamicMax =
        spec.key === 'activeLauncherCount' ? base.maxActiveLaunchers : undefined;
      const effectiveMax = dynamicMax ?? spec.max;

      let clamped = value;
      let reason: string | null = null;

      if (value < spec.min) {
        clamped = spec.min;
        reason = `${spec.label} wanted ${value} but minimum is ${spec.min} — clamped to ${spec.min}. (Variant ${v.variantNumber} ends up matching the base on this element.)`;
      } else if (effectiveMax !== undefined && value > effectiveMax) {
        clamped = effectiveMax;
        const capSource =
          dynamicMax !== undefined ? 'the launcher count of this level' : 'the tool-wide cap';
        reason = `${spec.label} wanted ${value} but maximum is ${effectiveMax} (${capSource}) — clamped to ${effectiveMax}.`;
      }

      if (reason !== null) {
        v.values[spec.key] = clamped;
        v.clampedKeys.add(spec.key);
        adjustments.push({
          variantNumber: v.variantNumber,
          element: spec.key,
          requested: value,
          applied: clamped,
          reason,
        });
      }
    }
  }

  return { variants, adjustments, errors };
}
