import type { StudioSelectableItem } from '@/components/games/fruit-match/designer/types';

export type VariantComplexityStop = 0 | 1 | 2;

export const VARIANT_COMPLEXITY_STOPS: VariantComplexityStop[] = [0, 1, 2];

/**
 * Given the current stop for a color and the number of items in that color
 * group, return the variant assigned to the item at `index` (0-based, sorted
 * by `order`).
 *
 * Rule: fills passes of 3 items, starting from the highest variant `S` and
 * cycling down to 0 — then wrapping back to `S`. So for stop 2 with 12 items:
 * first 3 get v2, next 3 get v1, next 3 get v0, next 3 get v2 again.
 *
 * The fruit count per color is normally a multiple of 3; we still handle
 * partials gracefully (they share the current pass's variant).
 */
export function variantForIndex(stop: VariantComplexityStop, index: number): number {
  const pass = Math.floor(index / 3);
  const numVariants = stop + 1;
  return stop - (pass % numVariants);
}

/**
 * Rewrites the `variant` field on each item according to the per-color
 * complexity map. Items that belong to a color with no entry in the map are
 * left untouched.
 *
 * Ordering within a color group is by `order` (ascending) — earlier positions
 * receive higher variants.
 */
export function redistributeVariants(
  items: StudioSelectableItem[],
  complexityByColor: Record<number, VariantComplexityStop>
): StudioSelectableItem[] {
  const byColor = new Map<number, StudioSelectableItem[]>();
  for (const item of items) {
    if (!byColor.has(item.colorType)) byColor.set(item.colorType, []);
    byColor.get(item.colorType)!.push(item);
  }
  for (const group of byColor.values()) {
    group.sort((a, b) => a.order - b.order);
  }

  const nextVariantById = new Map<string, number>();
  for (const [colorType, group] of byColor) {
    const stop = complexityByColor[colorType];
    if (stop === undefined) continue;
    group.forEach((item, idx) => {
      nextVariantById.set(item.id, variantForIndex(stop, idx));
    });
  }

  return items.map((item) => {
    const v = nextVariantById.get(item.id);
    return v === undefined ? item : { ...item, variant: v };
  });
}

/**
 * If every color in the level shares the same complexity stop, return it;
 * otherwise return `'mixed'`. Returns `null` when no colors are present.
 */
export function summarizeGlobalComplexity(
  complexityByColor: Record<number, VariantComplexityStop>,
  colorTypes: number[]
): VariantComplexityStop | 'mixed' | null {
  if (colorTypes.length === 0) return null;
  const values = colorTypes.map((ct) => complexityByColor[ct] ?? 0);
  const first = values[0];
  return values.every((v) => v === first) ? first : 'mixed';
}
