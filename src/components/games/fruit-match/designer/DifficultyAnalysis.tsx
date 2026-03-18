'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Progress } from '@/components/ui/progress';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Target,
  Zap,
  Hash,
  Loader2,
  ChevronDown,
  ChevronRight,
  Lock,
  LockOpen,
} from 'lucide-react';
import { StudioDifficultyResult, StudioDifficultyParams, DifficultyComponent } from '@/lib/useStudioGame';
import { StudioSimulationResult } from '@/lib/studioDifficultyEngine';
import { DIFFICULTY_COLORS } from './types';

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

const IMPACT_COLORS: Record<string, string> = {
  easy: 'text-green-600 bg-green-500/10',
  medium: 'text-yellow-600 bg-yellow-500/10',
  hard: 'text-red-600 bg-red-500/10',
};

type ParameterLockKey = 'blocking' | 'surfaceSize' | 'activeLaunchers';

function blockingLabel(blockingOffset: number): string {
  if (blockingOffset <= 0) return 'Easy';
  if (blockingOffset <= 2) return 'Light';
  if (blockingOffset <= 4) return 'Medium';
  if (blockingOffset <= 6) return 'Hard';
  if (blockingOffset <= 8) return 'Very Hard';
  return 'Nightmare';
}

function LockToggle({
  locked,
  onToggle,
  label,
}: {
  locked: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground"
      onClick={onToggle}
      title={locked ? `Unlock ${label}` : `Lock ${label}`}
      aria-label={locked ? `Unlock ${label}` : `Lock ${label}`}
    >
      {locked ? <Lock className="h-3 w-3" /> : <LockOpen className="h-3 w-3" />}
    </Button>
  );
}

function SliderHeading({
  label,
  value,
  locked,
  onToggleLock,
}: {
  label: string;
  value: string;
  locked?: boolean;
  onToggleLock?: () => void;
}) {
  return (
    <div className="flex items-center justify-between text-xs">
      <div className="flex items-center gap-1">
        <span className="text-muted-foreground">{label}</span>
        {typeof locked === 'boolean' && onToggleLock && (
          <LockToggle locked={locked} onToggle={onToggleLock} label={label} />
        )}
      </div>
      <span className="font-mono">{value}</span>
    </div>
  );
}

function DifficultyComponentRow({ component, isExpanded, onToggle }: {
  component: DifficultyComponent;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const pct = Math.round(component.score * 100);
  const weightPct = (component.weight * 100).toFixed(0);

  return (
    <div className="space-y-1">
      <button
        onClick={onToggle}
        className="w-full text-left flex items-center gap-1 group"
      >
        {isExpanded ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground group-hover:text-foreground transition-colors">
              {component.name}
              <span className="text-[10px] ml-1 opacity-60">({weightPct}%)</span>
            </span>
            <div className="flex items-center gap-1.5">
              <Badge
                variant="outline"
                className={`text-[9px] px-1 py-0 h-4 border-0 ${IMPACT_COLORS[component.impact]}`}
              >
                {component.impact}
              </Badge>
              <span className="font-mono text-[11px]">{pct}</span>
            </div>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-0.5">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </button>
      {isExpanded && (
        <div className="ml-4 space-y-1">
          <p className="text-[10px] text-muted-foreground leading-tight">
            {component.description}
          </p>
          <p className="text-[11px] leading-tight border-l-2 border-primary/30 pl-2">
            {component.explanation}
          </p>
        </div>
      )}
    </div>
  );
}

function FormulaBreakdown({ params, score }: { params: StudioDifficultyParams; score: number }) {
  const [isOpen, setIsOpen] = useState(false);

  const { uniqueColors, launcherCount, maxSelectableItems, totalTiles } = params;
  const blockingOffset = params.blockingOffset ?? Math.round((params.mismatchDepth ?? 0) * 10);

  const blockingFactor = clamp01(blockingOffset / 10);
  const colorVariety = clamp01((uniqueColors - 2) / 5);
  const surfaceSize = clamp01(1 - (maxSelectableItems - 1) / 19);
  const hiddenRatio = totalTiles > 0 ? clamp01((totalTiles - maxSelectableItems) / totalTiles) : 0;
  const launcherSequence = clamp01((launcherCount - 4) / 12);
  const unlockDistance = maxSelectableItems * 2 + blockingOffset;

  const rows: { label: string; formula: string; raw: string; weight: string; contribution: string }[] = [
    {
      label: 'Blocking',
      formula: `clamp01(${blockingOffset} / 10)`,
      raw: blockingFactor.toFixed(2),
      weight: '0.40',
      contribution: (blockingFactor * 0.40).toFixed(3),
    },
    {
      label: 'Surface Size',
      formula: `clamp01(1 - (${maxSelectableItems} - 1) / 19)`,
      raw: surfaceSize.toFixed(2),
      weight: '0.25',
      contribution: (surfaceSize * 0.25).toFixed(3),
    },
    {
      label: 'Hidden Ratio',
      formula: `(${totalTiles} - ${maxSelectableItems}) / ${totalTiles}`,
      raw: hiddenRatio.toFixed(2),
      weight: '0.15',
      contribution: (hiddenRatio * 0.15).toFixed(3),
    },
    {
      label: 'Color Variety',
      formula: `clamp01((${uniqueColors} - 2) / 5)`,
      raw: colorVariety.toFixed(2),
      weight: '0.10',
      contribution: (colorVariety * 0.10).toFixed(3),
    },
    {
      label: 'Blender Count',
      formula: `clamp01((${launcherCount} - 4) / 12)`,
      raw: launcherSequence.toFixed(2),
      weight: '0.10',
      contribution: (launcherSequence * 0.10).toFixed(3),
    },
  ];

  const rawTotal = blockingFactor * 0.40 + colorVariety * 0.10 + surfaceSize * 0.25 + hiddenRatio * 0.15 + launcherSequence * 0.10;

  return (
    <div className="pt-1 border-t border-border">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full text-left flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {isOpen ? (
          <ChevronDown className="h-3 w-3 flex-shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 flex-shrink-0" />
        )}
        <span>Formula</span>
        <span className="font-mono ml-auto text-[10px]">
          round({rawTotal.toFixed(3)} x 100) = {score}
        </span>
      </button>
      {isOpen && (
        <div className="mt-1.5 space-y-1">
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 text-[10px] font-mono">
            <div className="text-muted-foreground font-sans text-[9px] uppercase tracking-wider">Factor</div>
            <div className="text-muted-foreground text-right font-sans text-[9px] uppercase tracking-wider">Raw</div>
            <div className="text-muted-foreground text-right font-sans text-[9px] uppercase tracking-wider">Wt</div>
            <div className="text-muted-foreground text-right font-sans text-[9px] uppercase tracking-wider">Contrib</div>
            {rows.map((row) => (
              <div key={row.label} className="contents">
                <div className="text-foreground/80 font-sans text-[10px] truncate" title={row.formula}>{row.label}</div>
                <div className="text-right">{row.raw}</div>
                <div className="text-right text-muted-foreground">{row.weight}</div>
                <div className="text-right">{row.contribution}</div>
              </div>
            ))}
            <div className="contents border-t border-border">
              <div className="text-foreground font-sans text-[10px] font-medium pt-0.5 border-t border-border">Total</div>
              <div className="text-right pt-0.5 border-t border-border">{rawTotal.toFixed(3)}</div>
              <div className="text-right pt-0.5 border-t border-border text-muted-foreground">x100</div>
              <div className="text-right pt-0.5 border-t border-border font-medium">{score}</div>
            </div>
          </div>
          <div className="text-[9px] text-muted-foreground space-y-0.5 mt-1">
            <div className="font-mono truncate">UnlockDistance = {maxSelectableItems} x 2 + {blockingOffset} = {unlockDistance}</div>
            {rows.map((row) => (
              <div key={row.label} className="font-mono truncate" title={row.formula}>
                {row.label}: {row.formula}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function DifficultyAnalysis({
  difficultyResult,
  difficultyParams,
  maxSelectableItems,
  blockingOffset,
  waitingStandSlots,
  activeLauncherCount,
  maxActiveLaunchers,
  seed,
  parameterLocks,
  simulationResult,
  isTargeting,
  isSimulating,
  onMaxSelectableChange,
  onBlockingOffsetChange,
  onWaitingStandSlotsChange,
  onActiveLauncherCountChange,
  onSeedChange,
  onToggleParameterLock,
  onEasier,
  onHarder,
  onAutoTarget,
  onSimulate,
}: {
  difficultyResult: StudioDifficultyResult | null;
  difficultyParams: StudioDifficultyParams | null;
  maxSelectableItems: number;
  blockingOffset: number;
  waitingStandSlots: number;
  activeLauncherCount: number;
  maxActiveLaunchers: number;
  seed: number | undefined;
  parameterLocks: Record<ParameterLockKey, boolean>;
  simulationResult: StudioSimulationResult | null;
  isTargeting: boolean;
  isSimulating: boolean;
  onMaxSelectableChange: (v: number) => void;
  onBlockingOffsetChange: (v: number) => void;
  onWaitingStandSlotsChange: (v: number) => void;
  onActiveLauncherCountChange: (v: number) => void;
  onSeedChange: (v: number | undefined) => void;
  onToggleParameterLock: (key: ParameterLockKey) => void;
  onEasier: () => void;
  onHarder: () => void;
  onAutoTarget: (targetScore: number) => void;
  onSimulate: () => void;
}) {
  const [targetInput, setTargetInput] = useState('50');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const unlockDistance = maxSelectableItems * 2 + blockingOffset;

  const [isExpanded, setIsExpanded] = useState(false);

  if (!difficultyResult) {
    return null;
  }

  const { score, tier, breakdown } = difficultyResult;

  return (
    <div className="rounded-lg border border-border bg-card">
      {/* Always-visible compact bar: score + sliders + Easier/Harder */}
      <div className="space-y-2 p-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            <BarChart3 className="h-3.5 w-3.5" />
          </button>
          <Badge className={`${DIFFICULTY_COLORS[tier] || 'bg-gray-500'} h-5 text-[10px]`}>
            {score} ({tier})
          </Badge>
          <span className="text-[10px] text-muted-foreground">Unlock {unlockDistance}</span>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={onEasier} className="h-6 px-2 text-[10px]">
              <TrendingDown className="h-3 w-3 mr-0.5" />
              Easier
            </Button>
            <Button variant="outline" size="sm" onClick={onHarder} className="h-6 px-2 text-[10px]">
              <TrendingUp className="h-3 w-3 mr-0.5" />
              Harder
            </Button>
          </div>
        </div>

        {/* Compact sliders — commit on release to avoid expensive recomputation during drag */}
        <div className="grid gap-x-4 gap-y-1 sm:grid-cols-3">
          <div className="space-y-0.5">
            <SliderHeading
              label="Blocking"
              value={`${blockingOffset}`}
              locked={parameterLocks.blocking}
              onToggleLock={() => onToggleParameterLock('blocking')}
            />
            <Slider value={[blockingOffset]} min={0} max={10} step={1} onValueCommit={([v]) => onBlockingOffsetChange(v)} />
          </div>
          <div className="space-y-0.5">
            <SliderHeading
              label="Surface"
              value={`${maxSelectableItems}`}
              locked={parameterLocks.surfaceSize}
              onToggleLock={() => onToggleParameterLock('surfaceSize')}
            />
            <Slider value={[maxSelectableItems]} min={1} max={20} step={1} onValueCommit={([v]) => onMaxSelectableChange(v)} />
          </div>
          <div className="space-y-0.5">
            <SliderHeading
              label="Active"
              value={`${activeLauncherCount}`}
              locked={parameterLocks.activeLaunchers}
              onToggleLock={() => onToggleParameterLock('activeLaunchers')}
            />
            <Slider value={[activeLauncherCount]} min={1} max={maxActiveLaunchers} step={1} onValueCommit={([v]) => onActiveLauncherCountChange(v)} />
          </div>
        </div>
      </div>

      {/* Expanded: full analysis */}
      {isExpanded && (
        <div className="border-t border-border p-3 space-y-3">
          <Progress value={score} className="h-2" />

          {/* Auto Target */}
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={0}
              max={100}
              value={targetInput}
              onChange={(e) => setTargetInput(e.target.value)}
              className="h-7 w-20 text-xs"
              placeholder="Score"
            />
            <Button
              variant="default"
              size="sm"
              className="flex-1 h-7"
              onClick={() => onAutoTarget(Math.max(0, Math.min(100, Number(targetInput) || 50)))}
              disabled={isTargeting}
            >
              {isTargeting ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Target className="h-3.5 w-3.5 mr-1" />}
              Auto Target
            </Button>
            <Button variant="outline" size="sm" className="h-7" onClick={onSimulate} disabled={isSimulating} title="Run simulation">
              {isSimulating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
            </Button>
          </div>

          {/* Simulation Results */}
          {simulationResult && (
            <div className="p-2 bg-muted/30 rounded-lg space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Win Rate</span>
                <span className="font-mono">{Math.round(simulationResult.winRate * 100)}% ({Math.round(simulationResult.confidenceInterval[0] * 100)}-{Math.round(simulationResult.confidenceInterval[1] * 100)}%)</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Avg Moves</span>
                <span className="font-mono">{Math.round(simulationResult.avgMoves)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Peak Stand</span>
                <span className="font-mono">{simulationResult.peakStandUsage}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Near-Loss Rate</span>
                <span className="font-mono">{Math.round(simulationResult.nearLossRate * 100)}%</span>
              </div>
              <div className="text-[10px] text-muted-foreground text-right">{simulationResult.runs} runs</div>
            </div>
          )}

          {/* Component breakdown */}
          <div className="space-y-1.5">
            <div className="text-[10px] text-muted-foreground">Tap a factor to see explanation</div>
            {breakdown.map((component) => (
              <DifficultyComponentRow
                key={component.id}
                component={component}
                isExpanded={expandedId === component.id}
                onToggle={() => setExpandedId(expandedId === component.id ? null : component.id)}
              />
            ))}
          </div>

          {/* Live Formula */}
          {difficultyParams && <FormulaBreakdown params={difficultyParams} score={score} />}

          {/* Extra controls */}
          <div className="space-y-2 pt-1 border-t border-border">
            <div className="space-y-1">
              <SliderHeading label="Backup Slots" value={`${waitingStandSlots} (fixed)`} />
              <Slider value={[waitingStandSlots]} min={3} max={7} step={1} disabled onValueChange={([v]) => onWaitingStandSlotsChange(v)} />
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Seed</span>
                <span className="font-mono">{seed ?? 'random'}</span>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={seed ?? ''}
                  onChange={(e) => { const val = e.target.value; onSeedChange(val === '' ? undefined : Number(val)); }}
                  placeholder="Random"
                  className="h-7 text-xs flex-1"
                />
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onSeedChange(Math.floor(Math.random() * 2147483647))}>
                  <Hash className="h-3 w-3 mr-1" />
                  New
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
