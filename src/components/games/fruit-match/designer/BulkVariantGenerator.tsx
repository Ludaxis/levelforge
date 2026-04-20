'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type DragEvent,
} from 'react';
import {
  ChevronDown,
  ChevronRight,
  Download,
  GripVertical,
  Plus,
  Trash2,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DIFFICULTY_ELEMENTS,
  getDifficultyElement,
  type DifficultyElementKey,
} from '@/lib/juicyBlast/difficultyElements';

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
  /** Cells the auto-clamp touched, for highlighting in the preview. */
  clampedKeys: Set<DifficultyElementKey>;
}

export interface VariantAdjustment {
  variantNumber: number;
  element: DifficultyElementKey;
  /** What the delta math produced before bounds were applied. */
  requested: number;
  /** What actually ends up exported. */
  applied: number;
  /** User-facing one-line explanation. */
  reason: string;
}

export interface VariantError {
  variantNumber: number;
  element: DifficultyElementKey;
  reason: string;
}

interface BulkVariantGeneratorProps {
  base: BaseLevelValues;
  levelNumber: number;
  onExport: (variants: ResolvedVariant[]) => void;
}

const STORAGE_KEY = 'juicyblast.bulkVariantGenerator.rules.v1';

function makeId(): string {
  return `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function defaultRules(): VariantRule[] {
  return [
    { id: makeId(), variantNumber: 2, element: 'maxSelectableItems', delta: -2 },
    { id: makeId(), variantNumber: 3, element: 'maxSelectableItems', delta: -1 },
    { id: makeId(), variantNumber: 4, element: 'blockingOffset', delta: -1 },
    { id: makeId(), variantNumber: 6, element: 'blockingOffset', delta: 1 },
    { id: makeId(), variantNumber: 7, element: 'maxSelectableItems', delta: 1 },
    { id: makeId(), variantNumber: 8, element: 'maxSelectableItems', delta: 2 },
  ];
}

function loadRules(): VariantRule[] {
  if (typeof window === 'undefined') return defaultRules();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultRules();
    const parsed = JSON.parse(raw) as VariantRule[];
    if (!Array.isArray(parsed) || parsed.length === 0) return defaultRules();
    return parsed
      .filter(
        (r) =>
          typeof r === 'object' &&
          typeof r.variantNumber === 'number' &&
          typeof r.delta === 'number' &&
          typeof r.element === 'string' &&
          !!getDifficultyElement(r.element as DifficultyElementKey)
      )
      .map((r) => ({ ...r, id: r.id || makeId() }));
  } catch {
    return defaultRules();
  }
}

function saveRules(rules: VariantRule[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
  } catch {
    /* storage quota / private mode — silently skip */
  }
}

interface ResolveOutput {
  variants: ResolvedVariant[];
  adjustments: VariantAdjustment[];
  errors: VariantError[];
}

function resolveVariants(
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
      // Optional field with no base (e.g. moveLimit). Can't apply delta.
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

  // Second pass: clamp to bounds and record explanations.
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

export function BulkVariantGenerator({
  base,
  levelNumber,
  onExport,
}: BulkVariantGeneratorProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [rules, setRules] = useState<VariantRule[]>(() => loadRules());
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  useEffect(() => {
    saveRules(rules);
  }, [rules]);

  const { variants: resolved, adjustments, errors } = useMemo(
    () => resolveVariants(rules, base),
    [rules, base]
  );

  const distinctVariants = resolved.length;
  const canExport = distinctVariants > 0 && errors.length === 0;

  const addRow = useCallback(() => {
    setRules((prev) => {
      const usedNumbers = new Set(prev.map((r) => r.variantNumber));
      let next = 2;
      while (usedNumbers.has(next)) next += 1;
      return [
        ...prev,
        {
          id: makeId(),
          variantNumber: next,
          element: 'maxSelectableItems',
          delta: 0,
        },
      ];
    });
  }, []);

  const updateRow = useCallback(
    (id: string, patch: Partial<VariantRule>) => {
      setRules((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    },
    []
  );

  const removeRow = useCallback((id: string) => {
    setRules((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const onDragStart = (idx: number) => (e: DragEvent<HTMLDivElement>) => {
    setDragIndex(idx);
    e.dataTransfer.effectAllowed = 'move';
  };
  const onDragOver = (idx: number) => (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === idx) return;
    setRules((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(idx, 0, moved);
      return next;
    });
    setDragIndex(idx);
  };
  const onDragEnd = () => setDragIndex(null);

  const handleExport = useCallback(() => {
    if (!canExport) return;
    onExport(resolved);
  }, [canExport, onExport, resolved]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle
          className="flex cursor-pointer items-center justify-between text-sm"
          onClick={() => setIsExpanded((v) => !v)}
        >
          <span className="flex items-center gap-2">
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            Bulk Variant Generator
          </span>
          <span className="text-[10px] font-normal text-muted-foreground">
            {distinctVariants} variant{distinctVariants === 1 ? '' : 's'} ·{' '}
            {rules.length} rule{rules.length === 1 ? '' : 's'}
          </span>
        </CardTitle>
      </CardHeader>
      {isExpanded && (
        <CardContent className="space-y-3">
          <p className="text-[11px] text-muted-foreground">
            Each row adds a delta to a difficulty element for a given variant
            number. Multiple rows with the same variant number stack. Exports one
            JSON per distinct variant as{' '}
            <span className="font-mono">
              Level{levelNumber}_&lt;variant&gt;.json
            </span>
            .
          </p>

          <div className="grid grid-cols-[auto_80px_1fr_80px_auto] items-center gap-x-2 text-[10px] uppercase tracking-wider text-muted-foreground">
            <span />
            <span>Variant #</span>
            <span>Element</span>
            <span>Amount</span>
            <span />
          </div>

          <div className="space-y-1.5">
            {rules.map((rule, idx) => {
              const spec = getDifficultyElement(rule.element);
              const dragging = dragIndex === idx;
              return (
                <div
                  key={rule.id}
                  draggable
                  onDragStart={onDragStart(idx)}
                  onDragOver={onDragOver(idx)}
                  onDragEnd={onDragEnd}
                  className={`grid grid-cols-[auto_80px_1fr_80px_auto] items-center gap-x-2 rounded-md border bg-background/40 px-1.5 py-1 ${
                    dragging ? 'opacity-50' : ''
                  }`}
                >
                  <GripVertical className="h-3.5 w-3.5 cursor-grab text-muted-foreground" />
                  <Input
                    type="number"
                    min={1}
                    value={rule.variantNumber}
                    onChange={(e) =>
                      updateRow(rule.id, {
                        variantNumber: Math.max(
                          1,
                          Math.floor(Number(e.target.value) || 1)
                        ),
                      })
                    }
                    className="h-7 px-2 text-xs"
                  />
                  <select
                    value={rule.element}
                    onChange={(e) =>
                      updateRow(rule.id, {
                        element: e.target.value as DifficultyElementKey,
                      })
                    }
                    className="h-7 rounded-md border border-input bg-background px-2 text-xs"
                  >
                    {DIFFICULTY_ELEMENTS.map((el) => (
                      <option key={el.key} value={el.key}>
                        {el.label}
                      </option>
                    ))}
                  </select>
                  <Input
                    type="number"
                    step={spec?.step ?? 1}
                    value={rule.delta}
                    onChange={(e) =>
                      updateRow(rule.id, {
                        delta: Math.floor(Number(e.target.value) || 0),
                      })
                    }
                    className="h-7 px-2 text-xs"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => removeRow(rule.id)}
                    aria-label="Remove row"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              );
            })}
          </div>

          <Button variant="outline" size="sm" onClick={addRow} className="h-7">
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add row
          </Button>

          {resolved.length > 0 && (
            <div className="rounded-md border border-border/60 bg-muted/20 p-2">
              <p className="mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                Preview
              </p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="pr-2 pb-1 font-normal">Variant</th>
                    {DIFFICULTY_ELEMENTS.map((el) => (
                      <th key={el.key} className="pr-2 pb-1 font-normal">
                        {el.short}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {resolved.map((v) => {
                    return (
                      <tr key={v.variantNumber} className="border-t border-border/40">
                        <td className="py-1 pr-2 font-mono">
                          v{v.variantNumber}
                        </td>
                        {DIFFICULTY_ELEMENTS.map((el) => {
                          const value = v.values[el.key];
                          const baseVal =
                            el.key === 'maxSelectableItems'
                              ? base.maxSelectableItems
                              : el.key === 'blockingOffset'
                                ? base.blockingOffset
                                : el.key === 'activeLauncherCount'
                                  ? base.activeLauncherCount
                                  : el.key === 'waitingStandSlots'
                                    ? base.waitingStandSlots
                                    : base.moveLimit;
                          const changed = value !== baseVal;
                          const clamped = v.clampedKeys.has(el.key);
                          return (
                            <td
                              key={el.key}
                              className={`py-1 pr-2 font-mono ${
                                clamped
                                  ? 'text-amber-500 font-semibold'
                                  : changed
                                    ? 'text-primary'
                                    : 'text-muted-foreground'
                              }`}
                              title={
                                clamped
                                  ? 'Auto-clamped to fit bounds — see banner below'
                                  : undefined
                              }
                            >
                              {value ?? '—'}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {adjustments.length > 0 && (
            <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-2">
              <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                <Info className="h-3.5 w-3.5" />
                Auto-adjusted to fit bounds ({adjustments.length})
              </p>
              <ul className="space-y-0.5 text-[11px] text-amber-700 dark:text-amber-300">
                {adjustments.map((a, i) => (
                  <li key={i}>
                    <span className="font-mono">v{a.variantNumber}</span>:{' '}
                    {a.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {errors.length > 0 && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-2">
              <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-destructive">
                <AlertTriangle className="h-3.5 w-3.5" />
                Fix before exporting ({errors.length})
              </p>
              <ul className="space-y-0.5 text-[11px] text-destructive">
                {errors.map((e, i) => (
                  <li key={i}>
                    <span className="font-mono">v{e.variantNumber}</span>:{' '}
                    {e.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex justify-end">
            <Button
              onClick={handleExport}
              disabled={!canExport}
              size="sm"
              className="h-8"
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Export {distinctVariants} variant
              {distinctVariants === 1 ? '' : 's'}
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
