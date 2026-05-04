'use client';

import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { StudioGameConfig } from '@/lib/studioGameLogic';
import {
  BotProfileId,
  JuicyDifficultyReport,
  UserPlaythroughReport,
  analyzeJuicyLevel,
  simulateUserPlaythrough,
} from '@/lib/juicyBlast/analysis';
import { DIFFICULTY_COLORS } from './types';
import { Activity, Bot, Gauge, Play, RotateCcw, ShieldAlert, ShieldCheck } from 'lucide-react';

const PROFILES: { id: BotProfileId; label: string }[] = [
  { id: 'novice', label: 'Novice' },
  { id: 'average', label: 'Average' },
  { id: 'expert', label: 'Expert' },
  { id: 'greedy', label: 'Greedy' },
  { id: 'stress', label: 'Stress' },
];

const ACTION_LABELS: Record<UserPlaythroughReport['steps'][number]['action'], string> = {
  launcher: 'Launcher',
  queue: 'Queue',
  autoFill: 'Auto-fill',
  complete: 'Complete',
  fail: 'Fail',
};

function verdictClass(verdict: JuicyDifficultyReport['verdict']): string {
  if (verdict === 'solvable') return 'bg-green-600';
  if (verdict === 'risky') return 'bg-amber-500 text-black';
  return 'bg-red-700';
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function colorHex(config: StudioGameConfig, colorType: number): string {
  return config.colorTypeToHex?.[colorType] ?? '888888';
}

export function SimulatorPanel({
  studioGameConfig,
  legacyScore,
}: {
  studioGameConfig: StudioGameConfig | null;
  legacyScore: number | null;
}) {
  const [profile, setProfile] = useState<BotProfileId>('average');
  const [seedInput, setSeedInput] = useState('42');
  const [playthrough, setPlaythrough] = useState<UserPlaythroughReport | null>(null);
  const [analysis, setAnalysis] = useState<JuicyDifficultyReport | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const seed = useMemo(() => {
    const parsed = Number(seedInput);
    return Number.isFinite(parsed) ? parsed : 42;
  }, [seedInput]);

  if (!studioGameConfig) {
    return (
      <div className="rounded-md border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
        Simulator unavailable until artwork, launchers, and item pool are ready.
      </div>
    );
  }

  const runReplay = () => {
    setPlaythrough(simulateUserPlaythrough(studioGameConfig, profile, seed));
  };

  const runAnalysis = () => {
    setIsAnalyzing(true);
    window.setTimeout(() => {
      setAnalysis(analyzeJuicyLevel(studioGameConfig, { monteCarloRuns: 24 }));
      setIsAnalyzing(false);
    }, 0);
  };

  const reset = () => {
    setPlaythrough(null);
    setAnalysis(null);
  };

  const visibleAnalysis = analysis;

  return (
    <div className="space-y-3">
      <div className="grid gap-3 lg:grid-cols-[1fr_1.1fr]">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Bot className="h-4 w-4" />
              Bot Replay
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-5 gap-1">
              {PROFILES.map((option) => (
                <Button
                  key={option.id}
                  type="button"
                  size="sm"
                  variant={profile === option.id ? 'default' : 'outline'}
                  className="h-7 px-1 text-[10px]"
                  onClick={() => setProfile(option.id)}
                >
                  {option.label}
                </Button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={seedInput}
                onChange={(event) => setSeedInput(event.target.value)}
                className="h-8 text-xs"
                aria-label="Replay seed"
              />
              <Button size="sm" className="h-8" onClick={runReplay}>
                <Play className="mr-1.5 h-3.5 w-3.5" />
                Run Replay
              </Button>
              <Button size="sm" variant="outline" className="h-8" onClick={reset}>
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            </div>

            {playthrough && (
              <div className="grid grid-cols-4 gap-2 rounded-md border border-border/60 bg-muted/20 p-2 text-xs">
                <div>
                  <div className="text-[10px] text-muted-foreground">Result</div>
                  <Badge className={playthrough.won ? 'bg-green-600' : 'bg-red-700'}>
                    {playthrough.won ? 'Win' : 'Loss'}
                  </Badge>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground">Moves</div>
                  <div className="font-mono">{playthrough.moves}</div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground">Peak</div>
                  <div className="font-mono">{playthrough.peakStandUsage}</div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground">Near Loss</div>
                  <div className="font-mono">{playthrough.nearLoss ? 'yes' : 'no'}</div>
                </div>
              </div>
            )}

            {playthrough?.failureReason && (
              <div className="flex items-center gap-1.5 rounded-md border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-600 dark:text-red-300">
                <ShieldAlert className="h-3.5 w-3.5" />
                {playthrough.failureReason}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <Gauge className="h-4 w-4" />
                Solver Report
              </span>
              <Button size="sm" className="h-7" onClick={runAnalysis} disabled={isAnalyzing}>
                <Activity className="mr-1.5 h-3.5 w-3.5" />
                {isAnalyzing ? 'Analyzing' : 'Analyze'}
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {visibleAnalysis ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={verdictClass(visibleAnalysis.verdict)}>
                    {visibleAnalysis.verdict}
                  </Badge>
                  <Badge className={DIFFICULTY_COLORS[visibleAnalysis.tier] || 'bg-gray-500'}>
                    {visibleAnalysis.solverScore} ({visibleAnalysis.tier})
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    Legacy {legacyScore ?? visibleAnalysis.legacyScore ?? '--'}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Par {visibleAnalysis.parMoves ?? '--'}
                  </span>
                </div>

                <Progress value={visibleAnalysis.solverScore} className="h-2" />

                <div className="grid grid-cols-3 gap-2 text-xs">
                  <Metric label="Avg Moves" value={visibleAnalysis.avgMoves ? Math.round(visibleAnalysis.avgMoves).toString() : '--'} />
                  <Metric label="Peak Stand" value={visibleAnalysis.peakStandUsage.toString()} />
                  <Metric label="Near Loss" value={percent(visibleAnalysis.nearLossRate)} />
                  <Metric label="Queue" value={percent(visibleAnalysis.queueMoveRate)} />
                  <Metric label="Direct" value={percent(visibleAnalysis.directMoveRate)} />
                  <Metric label="Path" value={visibleAnalysis.solutionPath?.length.toString() ?? '--'} />
                </div>

                <div className="grid grid-cols-5 gap-1 text-[10px]">
                  {PROFILES.map((option) => (
                    <div key={option.id} className="rounded-md bg-muted/30 p-1.5">
                      <div className="truncate text-muted-foreground">{option.label}</div>
                      <div className="font-mono">{percent(visibleAnalysis.winRates[option.id])}</div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5" />
                Solver report ready to run.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Replay Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          {playthrough ? (
            <div className="max-h-72 overflow-y-auto rounded-md border border-border/60">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-card text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1 font-normal">Move</th>
                    <th className="px-2 py-1 font-normal">Pick</th>
                    <th className="px-2 py-1 font-normal">Action</th>
                    <th className="px-2 py-1 font-normal">Stand</th>
                    <th className="px-2 py-1 font-normal">Done</th>
                  </tr>
                </thead>
                <tbody>
                  {playthrough.steps.map((step) => (
                    <tr key={`${step.move}-${step.pickedPosition}`} className="border-t border-border/40">
                      <td className="px-2 py-1 font-mono">{step.move}</td>
                      <td className="px-2 py-1">
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className="h-3 w-3 rounded-sm border border-white/20"
                            style={{ backgroundColor: `#${colorHex(studioGameConfig, step.colorType)}` }}
                          />
                          <span className="font-mono">
                            p{step.pickedPosition} v{step.variant}
                          </span>
                        </span>
                      </td>
                      <td className="px-2 py-1">{ACTION_LABELS[step.action]}</td>
                      <td className="px-2 py-1 font-mono">{step.waitingStandSize}</td>
                      <td className="px-2 py-1 font-mono">{step.completedLaunchers}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-md border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
              No replay yet.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/30 p-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="font-mono">{value}</div>
    </div>
  );
}
