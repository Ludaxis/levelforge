'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Download,
  Layers,
  Loader2,
  FolderTree,
  AlertTriangle,
  Info,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { DesignedFruitMatchLevel } from '@/types/fruitMatch';
import {
  loadVariantRules,
  saveVariantRules,
  type VariantRule,
} from '@/lib/juicyBlast/variantResolve';
import {
  generateCollectionBulkZip,
  type CollectionBulkResult,
} from '@/lib/juicyBlast/collectionBulkExport';
import { VariantRuleBuilder } from './designer/VariantRuleBuilder';

interface CollectionBulkVariantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  levels: DesignedFruitMatchLevel[];
}

export function CollectionBulkVariantDialog({
  open,
  onOpenChange,
  levels,
}: CollectionBulkVariantDialogProps) {
  const [rules, setRules] = useState<VariantRule[]>(() => loadVariantRules());
  const [nested, setNested] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [lastResult, setLastResult] = useState<CollectionBulkResult | null>(null);

  // Re-hydrate rules from localStorage every time the dialog opens so changes
  // made in the in-editor panel show up here too.
  useEffect(() => {
    if (open) {
      setRules(loadVariantRules());
      setLastResult(null);
    }
  }, [open]);

  // Persist rules as the user edits so the in-editor panel stays in sync.
  useEffect(() => {
    saveVariantRules(rules);
  }, [rules]);

  const distinctVariantCount = useMemo(
    () => new Set(rules.map((r) => r.variantNumber)).size,
    [rules]
  );

  const projectedFileCount = distinctVariantCount * levels.length;

  const handleGenerate = useCallback(async () => {
    if (levels.length === 0 || rules.length === 0) return;
    setGenerating(true);
    try {
      const result = await generateCollectionBulkZip(levels, rules, { nested });
      setLastResult(result);

      const url = URL.createObjectURL(result.zipBlob);
      const a = document.createElement('a');
      const date = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `juicyblast_variants_${date}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setGenerating(false);
    }
  }, [levels, rules, nested]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5" />
            Bulk Generate Variants
          </DialogTitle>
          <DialogDescription>
            Runs the variant curve across every level in your collection and
            packages the output as a single ZIP. Rules are shared with the
            in-editor generator — changes here persist everywhere.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border bg-muted/20 p-3">
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Levels in collection
                </div>
                <div className="font-mono text-lg">{levels.length}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Variants per level
                </div>
                <div className="font-mono text-lg">{distinctVariantCount}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Files to generate
                </div>
                <div className="font-mono text-lg">{projectedFileCount.toLocaleString()}</div>
              </div>
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-medium">Variant rules</h3>
            <VariantRuleBuilder rules={rules} onChange={setRules} />
          </div>

          <div className="flex items-center gap-2 rounded-md border border-border/60 p-3">
            <Checkbox
              id="bulk-nested"
              checked={nested}
              onCheckedChange={(checked) => setNested(checked === true)}
            />
            <Label
              htmlFor="bulk-nested"
              className="flex items-center gap-1.5 text-sm font-normal"
            >
              <FolderTree className="h-3.5 w-3.5" />
              Nest files in <span className="font-mono">Level{'{N}'}/</span>{' '}
              folders
            </Label>
            <span className="ml-auto text-[11px] text-muted-foreground">
              {nested
                ? 'ZIP will contain Level15/Level15_2.json, …'
                : 'ZIP will contain Level15_2.json side-by-side, …'}
            </span>
          </div>

          {lastResult && (
            <div className="space-y-2">
              <div className="rounded-md border border-primary/40 bg-primary/10 p-3 text-sm">
                <div className="font-medium">
                  Generated {lastResult.totalFiles.toLocaleString()} files across{' '}
                  {lastResult.totalLevels - lastResult.levelsWithErrors} of{' '}
                  {lastResult.totalLevels} levels.
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {lastResult.totalAdjustments} auto-clamp
                  {lastResult.totalAdjustments === 1 ? '' : 's'} applied,{' '}
                  {lastResult.totalErrors} hard error
                  {lastResult.totalErrors === 1 ? '' : 's'} blocking.
                </div>
              </div>

              {lastResult.reports.some(
                (r) => r.errors.length > 0 || r.adjustments.length > 0
              ) && (
                <div className="max-h-64 overflow-y-auto rounded-md border text-xs">
                  <table className="w-full">
                    <thead className="bg-muted/30 sticky top-0">
                      <tr className="text-left">
                        <th className="px-2 py-1 font-normal">Level</th>
                        <th className="px-2 py-1 font-normal">Status</th>
                        <th className="px-2 py-1 font-normal">Detail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lastResult.reports
                        .filter(
                          (r) => r.errors.length > 0 || r.adjustments.length > 0
                        )
                        .map((r) => (
                          <tr
                            key={r.levelNumber}
                            className="border-t border-border/40 align-top"
                          >
                            <td className="px-2 py-1 font-mono">{r.levelName}</td>
                            <td className="px-2 py-1">
                              {r.errors.length > 0 ? (
                                <span className="inline-flex items-center gap-1 text-destructive">
                                  <AlertTriangle className="h-3 w-3" />
                                  skipped
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-amber-500">
                                  <Info className="h-3 w-3" />
                                  clamped
                                </span>
                              )}
                            </td>
                            <td className="px-2 py-1">
                              {r.errors.map((e, i) => (
                                <div
                                  key={`e${i}`}
                                  className="text-destructive"
                                >
                                  {e.reason}
                                </div>
                              ))}
                              {r.adjustments.slice(0, 3).map((a, i) => (
                                <div key={`a${i}`} className="text-amber-600 dark:text-amber-400">
                                  v{a.variantNumber}: {a.reason}
                                </div>
                              ))}
                              {r.adjustments.length > 3 && (
                                <div className="text-muted-foreground">
                                  … +{r.adjustments.length - 3} more clamp
                                  {r.adjustments.length - 3 === 1 ? '' : 's'}
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={generating}
          >
            Close
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={
              generating || levels.length === 0 || rules.length === 0
            }
          >
            {generating ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Generate {projectedFileCount.toLocaleString()} files
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
