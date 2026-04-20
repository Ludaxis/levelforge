'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Download,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DIFFICULTY_ELEMENTS } from '@/lib/juicyBlast/difficultyElements';
import {
  loadVariantRules,
  saveVariantRules,
  resolveVariants,
  type BaseLevelValues,
  type ResolvedVariant,
  type VariantRule,
} from '@/lib/juicyBlast/variantResolve';
import { VariantRuleBuilder } from './VariantRuleBuilder';

// Re-export for callers that still import from this file.
export type { ResolvedVariant, BaseLevelValues } from '@/lib/juicyBlast/variantResolve';

interface BulkVariantGeneratorProps {
  base: BaseLevelValues;
  levelNumber: number;
  onExport: (variants: ResolvedVariant[]) => void;
}

export function BulkVariantGenerator({
  base,
  levelNumber,
  onExport,
}: BulkVariantGeneratorProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [rules, setRules] = useState<VariantRule[]>(() => loadVariantRules());

  useEffect(() => {
    saveVariantRules(rules);
  }, [rules]);

  const { variants: resolved, adjustments, errors } = useMemo(
    () => resolveVariants(rules, base),
    [rules, base]
  );

  const distinctVariants = resolved.length;
  const canExport = distinctVariants > 0 && errors.length === 0;

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
            number. Multiple rows with the same variant number stack. Exports
            one JSON per distinct variant as{' '}
            <span className="font-mono">
              Level{levelNumber}_&lt;variant&gt;.json
            </span>
            .
          </p>

          <VariantRuleBuilder rules={rules} onChange={setRules} />

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
                  {resolved.map((v) => (
                    <tr
                      key={v.variantNumber}
                      className="border-t border-border/40"
                    >
                      <td className="py-1 pr-2 font-mono">v{v.variantNumber}</td>
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
                  ))}
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
