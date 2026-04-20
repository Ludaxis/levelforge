'use client';

import { TrendingUp, Users, Activity, Layers } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { PipelineRunWithReports } from '@/lib/cadence/pipeline';

interface ResultsOverviewProps {
  run: PipelineRunWithReports | null;
}

export function ResultsOverview({ run }: ResultsOverviewProps) {
  if (!run || run.sessionCount === 0) return null;

  const flowCounts: Record<string, number> = {};
  for (const r of run.perSession) {
    const state = r.finalFlowReading?.state ?? r.summary.finalFlowState;
    flowCounts[state] = (flowCounts[state] ?? 0) + 1;
  }
  const userCount = Object.keys(run.profileByUser).length;
  const avgRating =
    userCount > 0
      ? Object.values(run.profileByUser).reduce((s, p) => s + p.rating, 0) /
        userCount
      : 0;
  const winCount = run.summaries.filter((s) => s.outcome === 'win').length;
  const winRate = run.sessionCount > 0 ? winCount / run.sessionCount : 0;

  return (
    <Card>
      <CardContent className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat
          icon={<Users className="h-4 w-4" />}
          label="Players"
          value={userCount.toLocaleString()}
          sub={`${run.sessionCount.toLocaleString()} sessions`}
        />
        <Stat
          icon={<TrendingUp className="h-4 w-4" />}
          label="Win rate"
          value={`${(winRate * 100).toFixed(1)}%`}
          sub={`avg Glicko ${avgRating.toFixed(0)}`}
        />
        <Stat
          icon={<Activity className="h-4 w-4" />}
          label="Rule firings"
          value={Object.values(run.ruleFireCounts).reduce((a, b) => a + b, 0).toLocaleString()}
          sub={summarizeRules(run.ruleFireCounts)}
        />
        <Stat
          icon={<Layers className="h-4 w-4" />}
          label="Variant changes"
          value={run.variantChanges.toLocaleString()}
          sub={`${run.proposalCount} proposals · ${run.perSession.length} sessions`}
        />
      </CardContent>
    </Card>
  );
}

function Stat({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-semibold">{value}</div>
      {sub && <div className="truncate text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function summarizeRules(counts: Record<string, number>): string {
  const entries = Object.entries(counts).sort(([, a], [, b]) => b - a).slice(0, 3);
  if (entries.length === 0) return 'no rules fired';
  return entries.map(([k, v]) => `${k.replace('Rule', '')} ${v}`).join(' · ');
}
