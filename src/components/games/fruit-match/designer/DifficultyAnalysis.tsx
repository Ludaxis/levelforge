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
} from 'lucide-react';
import { StudioDifficultyResult } from '@/lib/useStudioGame';
import { StudioSimulationResult } from '@/lib/studioDifficultyEngine';
import { DIFFICULTY_COLORS } from './types';

function DifficultyComponentBar({ label, value, weight }: { label: string; value: number; weight: number }) {
  const pct = Math.round(value * 100);
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label} ({(weight * 100).toFixed(0)}%)</span>
        <span className="font-mono">{pct}/100</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function DifficultyAnalysis({
  difficultyResult,
  maxSelectableItems,
  mismatchDepth,
  waitingStandSlots,
  activeLauncherCount,
  seed,
  simulationResult,
  isTargeting,
  isSimulating,
  onMaxSelectableChange,
  onMismatchDepthChange,
  onWaitingStandSlotsChange,
  onActiveLauncherCountChange,
  onSeedChange,
  onEasier,
  onHarder,
  onAutoTarget,
  onSimulate,
}: {
  difficultyResult: StudioDifficultyResult | null;
  maxSelectableItems: number;
  mismatchDepth: number;
  waitingStandSlots: number;
  activeLauncherCount: number;
  seed: number | undefined;
  simulationResult: StudioSimulationResult | null;
  isTargeting: boolean;
  isSimulating: boolean;
  onMaxSelectableChange: (v: number) => void;
  onMismatchDepthChange: (v: number) => void;
  onWaitingStandSlotsChange: (v: number) => void;
  onActiveLauncherCountChange: (v: number) => void;
  onSeedChange: (v: number | undefined) => void;
  onEasier: () => void;
  onHarder: () => void;
  onAutoTarget: (targetScore: number) => void;
  onSimulate: () => void;
}) {
  const [targetInput, setTargetInput] = useState('50');

  if (!difficultyResult) {
    return (
      <Card>
        <CardContent className="pt-4 text-center text-xs text-muted-foreground py-8">
          Import pixel art to see difficulty analysis.
        </CardContent>
      </Card>
    );
  }

  const { score, tier, components } = difficultyResult;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Difficulty Analysis
          </div>
          <div className="flex items-center gap-1.5">
            {simulationResult && (
              <Badge variant="outline" className="text-[10px]">
                WR: {Math.round(simulationResult.winRate * 100)}%
              </Badge>
            )}
            <Badge className={DIFFICULTY_COLORS[tier] || 'bg-gray-500'}>
              {score}/100 ({tier})
            </Badge>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Progress value={score} className="h-2" />

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onEasier} className="flex-1">
            <TrendingDown className="h-4 w-4 mr-1" />
            Easier
          </Button>
          <Button variant="outline" size="sm" onClick={onHarder} className="flex-1">
            <TrendingUp className="h-4 w-4 mr-1" />
            Harder
          </Button>
        </div>

        {/* Auto Target */}
        <div className="flex items-center gap-2 pt-1 border-t border-border">
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
            {isTargeting ? (
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            ) : (
              <Target className="h-3.5 w-3.5 mr-1" />
            )}
            Auto Target
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7"
            onClick={onSimulate}
            disabled={isSimulating}
            title="Run simulation"
          >
            {isSimulating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Zap className="h-3.5 w-3.5" />
            )}
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
        <div className="space-y-2">
          <DifficultyComponentBar label="Tile Burial" value={components.tileBurial} weight={0.35} />
          <DifficultyComponentBar label="Stand Pressure" value={components.standPressure} weight={0.15} />
          <DifficultyComponentBar label="Color Complexity" value={components.colorComplexity} weight={0.10} />
          <DifficultyComponentBar label="Sequence Length" value={components.sequenceLength} weight={0.10} />
          <DifficultyComponentBar label="Layer Depth" value={components.layerDepth} weight={0.10} />
          <DifficultyComponentBar label="Grid Constraint" value={components.gridConstraint} weight={0.20} />
        </div>

        {/* Sliders */}
        <div className="space-y-2 pt-1 border-t border-border">
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Tile Burial</span>
              <span className="font-mono">{Math.round(mismatchDepth * 100)}%</span>
            </div>
            <Slider
              value={[mismatchDepth * 100]}
              min={0}
              max={100}
              step={5}
              onValueChange={([v]) => onMismatchDepthChange(v / 100)}
            />
            <p className="text-[10px] text-muted-foreground">
              0% = matching tiles on top (easy). Higher = tiles buried deeper.
            </p>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Max Selectable Items</span>
              <span className="font-mono">{maxSelectableItems}</span>
            </div>
            <Slider
              value={[maxSelectableItems]}
              min={1}
              max={20}
              step={1}
              onValueChange={([v]) => onMaxSelectableChange(v)}
            />
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Waiting Stand Slots</span>
              <span className="font-mono">{waitingStandSlots}</span>
            </div>
            <Slider
              value={[waitingStandSlots]}
              min={3}
              max={7}
              step={1}
              onValueChange={([v]) => onWaitingStandSlotsChange(v)}
            />
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Active Launchers</span>
              <span className="font-mono">{activeLauncherCount}</span>
            </div>
            <Slider
              value={[activeLauncherCount]}
              min={1}
              max={3}
              step={1}
              onValueChange={([v]) => onActiveLauncherCountChange(v)}
            />
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
                onChange={(e) => {
                  const val = e.target.value;
                  onSeedChange(val === '' ? undefined : Number(val));
                }}
                placeholder="Random"
                className="h-7 text-xs flex-1"
              />
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => onSeedChange(Math.floor(Math.random() * 2147483647))}
              >
                <Hash className="h-3 w-3 mr-1" />
                New
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
