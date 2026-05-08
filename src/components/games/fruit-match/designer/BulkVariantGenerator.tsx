'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Download,
  AlertTriangle,
  Info,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DIFFICULTY_ELEMENTS } from '@/lib/juicyBlast/difficultyElements';
import {
  loadVariantRules,
  saveVariantRules,
  resolveVariants,
  type BaseLevelValues,
  type ResolvedVariant,
  type VariantRule,
} from '@/lib/juicyBlast/variantResolve';
import {
  calculateBlockingAwareLauncherOrderDifficulty,
  StudioGameConfig,
} from '@/lib/studioGameLogic';
import {
  ValidatedVariant,
  ValidatedVariantSet,
  generateValidatedVariants,
} from '@/lib/juicyBlast/variantOptimizer';
import { VariantRuleBuilder } from './VariantRuleBuilder';

// Re-export for callers that still import from this file.
export type { ResolvedVariant, BaseLevelValues } from '@/lib/juicyBlast/variantResolve';

interface BulkVariantGeneratorProps {
  base: BaseLevelValues;
  baseConfig?: StudioGameConfig | null;
  levelNumber: number;
  onExport: (variants: ResolvedVariant[]) => void;
  onExportValidated?: (variants: ValidatedVariant[]) => void;
}

export function BulkVariantGenerator({
  base,
  baseConfig,
  levelNumber,
  onExport,
  onExportValidated,
}: BulkVariantGeneratorProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [rules, setRules] = useState<VariantRule[]>(() => loadVariantRules());
  const [validatedSet, setValidatedSet] = useState<ValidatedVariantSet | null>(null);
  const [isGeneratingValidated, setIsGeneratingValidated] = useState(false);
  const [useContentAwareValidation, setUseContentAwareValidation] = useState(true);

  useEffect(() => {
    saveVariantRules(rules);
  }, [rules]);

  const { variants: resolved, adjustments, errors } = useMemo(
    () => resolveVariants(rules, base),
    [rules, base]
  );
  const launcherOrderPreview = useMemo(() => {
    if (!baseConfig) return new Map<number, number>();
    const launchers = baseConfig.launchers.map((launcher) => ({
      colorType: launcher.colorType,
      order: launcher.order,
    }));
    const selectableItems = baseConfig.selectableItems.map((item) => ({
      colorType: item.colorType,
      variant: item.variant,
      layer: item.layer,
      order: item.order,
    }));
    return new Map(
      resolved.map((variant) => {
        const score = calculateBlockingAwareLauncherOrderDifficulty({
          selectableItems,
          launchers,
          maxSelectableItems:
            variant.values.maxSelectableItems ?? base.maxSelectableItems,
          activeLauncherCount:
            variant.values.activeLauncherCount ?? base.activeLauncherCount,
          blockingOffset:
            variant.values.blockingOffset ?? base.blockingOffset,
        });
        return [variant.variantNumber, Math.round(score * 100)];
      }),
    );
  }, [base, baseConfig, resolved]);

  const distinctVariants = resolved.length;
  const canExport = distinctVariants > 0 && errors.length === 0;

  const handleExport = useCallback(() => {
    if (!canExport) return;
    onExport(resolved);
  }, [canExport, onExport, resolved]);

  const handleGenerateValidated = useCallback(() => {
    if (!baseConfig) return;
    setIsGeneratingValidated(true);
    window.setTimeout(() => {
      setValidatedSet(generateValidatedVariants(baseConfig, {
        runsPerProfile: 12,
        allowRisky: true,
        contentMode: useContentAwareValidation ? 'contentAware' : 'leversOnly',
        enforceSeparation: true,
      }));
      setIsGeneratingValidated(false);
    }, 0);
  }, [baseConfig, useContentAwareValidation]);

  const handleExportValidated = useCallback(() => {
    if (!validatedSet?.canExport || !onExportValidated) return;
    onExportValidated(validatedSet.variants);
  }, [onExportValidated, validatedSet]);

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
                    <th className="pr-2 pb-1 font-normal" title="LauncherOrderScore">
                      Order
                    </th>
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
                      <td className="py-1 pr-2 font-mono text-primary">
                        {launcherOrderPreview.get(v.variantNumber) ?? '—'}
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

          <div className="space-y-2 border-t border-border pt-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-medium">Validated 2-8</p>
                <p className="text-[10px] text-muted-foreground">
                  v5 base · solver-gated variants · separation checked
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                onClick={handleGenerateValidated}
                disabled={!baseConfig || isGeneratingValidated}
              >
                {isGeneratingValidated ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                )}
                Generate Validated 2-8
              </Button>
            </div>

            <label className="flex items-start gap-2 rounded-md border border-border/60 bg-muted/20 p-2 text-xs">
              <Checkbox
                checked={useContentAwareValidation}
                onCheckedChange={(checked) => setUseContentAwareValidation(checked === true)}
                className="mt-0.5"
              />
              <span>
                <span className="block font-medium">Content separation</span>
                <span className="block text-[10px] text-muted-foreground">
                  Hard variants may add early decoys, new fruit colors, and same-color variant ambiguity before solver validation.
                </span>
              </span>
            </label>

            {validatedSet && (
              <div className="rounded-md border border-border/60 bg-muted/20 p-2">
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Solver Preview
                  </p>
                  <span className={`text-[10px] font-mono ${validatedSet.canExport ? 'text-green-600' : 'text-red-600'}`}>
                    {validatedSet.canExport ? 'export ready' : 'blocked'}
                  </span>
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-muted-foreground">
                      <th className="pr-2 pb-1 font-normal">Variant</th>
                      <th className="pr-2 pb-1 font-normal">Solver</th>
                      <th className="pr-2 pb-1 font-normal">Verdict</th>
                      <th className="pr-2 pb-1 font-normal">Items</th>
                      <th className="pr-2 pb-1 font-normal">Amb</th>
                      <th className="pr-2 pb-1 font-normal">New</th>
                      <th className="pr-2 pb-1 font-normal">MSI</th>
                      <th className="pr-2 pb-1 font-normal">BO</th>
                      <th className="pr-2 pb-1 font-normal">Win</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validatedSet.variants.map((variant) => (
                      <tr key={variant.variantNumber} className="border-t border-border/40">
                        <td className="py-1 pr-2 font-mono">v{variant.variantNumber}</td>
                        <td className="py-1 pr-2 font-mono">{variant.report.solverScore}</td>
                        <td className={`py-1 pr-2 ${variant.accepted ? 'text-green-600' : 'text-red-600'}`}>
                          {variant.report.verdict}
                        </td>
                        <td className="py-1 pr-2 font-mono">{variant.contentChanges.totalItems}</td>
                        <td className="py-1 pr-2 font-mono">{variant.contentChanges.ambiguityItems}</td>
                        <td className="py-1 pr-2 font-mono">{variant.contentChanges.newColorItems}</td>
                        <td className="py-1 pr-2 font-mono">{variant.values.maxSelectableItems}</td>
                        <td className="py-1 pr-2 font-mono">{variant.values.blockingOffset}</td>
                        <td className="py-1 pr-2 font-mono">
                          {Math.round(variant.report.winRates.average * 100)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className={`mt-2 rounded-md border p-2 text-[11px] ${
                  validatedSet.separation.passed
                    ? 'border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-300'
                    : 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300'
                }`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">
                      Variant separation {validatedSet.separation.passed ? 'passed' : 'blocked'}
                    </span>
                    <span className="font-mono">
                      v2-&gt;v5 +{validatedSet.separation.v2ToV5ScoreDelta} · v5-&gt;v8 +{validatedSet.separation.v5ToV8ScoreDelta}
                    </span>
                  </div>
                  {validatedSet.separation.issues.length > 0 && (
                    <ul className="mt-1 space-y-0.5">
                      {validatedSet.separation.issues.slice(0, 4).map((issue, index) => (
                        <li key={`${issue.variantNumber}-${issue.comparedTo}-${index}`}>
                          <span className="font-mono">v{issue.variantNumber}</span> vs{' '}
                          <span className="font-mono">v{issue.comparedTo}</span>:{' '}
                          {issue.reason}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="mt-2 flex justify-end">
                  <Button
                    size="sm"
                    className="h-8"
                    onClick={handleExportValidated}
                    disabled={!validatedSet.canExport || !onExportValidated}
                  >
                    <Download className="mr-1.5 h-3.5 w-3.5" />
                    Export validated variants
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
