'use client';

import { useMemo } from 'react';
import { Waves, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FlowStateBadge } from './badges';
import type { PipelineRunWithReports } from '@/lib/cadence/pipeline';
import type { FlowState } from '@/lib/cadence/types';

interface FlowTransitionsProps {
  run: PipelineRunWithReports | null;
}

const STATES: FlowState[] = ['unknown', 'flow', 'boredom', 'anxiety', 'frustration'];

export function FlowTransitions({ run }: FlowTransitionsProps) {
  const { sessionTransitions, firstStateHistogram, lastStateHistogram } =
    useMemo(() => buildTransitions(run), [run]);

  if (!run || run.perSession.length === 0) return null;

  const maxCount = Math.max(
    1,
    ...Object.values(sessionTransitions).flatMap((m) => Object.values(m))
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Waves className="h-5 w-5 text-primary" />
          Flow-State Transitions
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
            Session → Session transitions (per user)
          </p>
          <TransitionGrid matrix={sessionTransitions} maxCount={maxCount} />
          <p className="mt-2 text-[11px] text-muted-foreground">
            Rows = state at end of session N. Columns = state at end of session
            N+1 (same user). Darker cells = more transitions.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <StateHistogram
            title="First-session final state"
            counts={firstStateHistogram}
          />
          <StateHistogram
            title="Last-session final state"
            counts={lastStateHistogram}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function TransitionGrid({
  matrix,
  maxCount,
}: {
  matrix: Record<FlowState, Record<FlowState, number>>;
  maxCount: number;
}) {
  return (
    <div className="inline-block overflow-hidden rounded-lg border">
      <table className="text-xs">
        <thead>
          <tr className="bg-muted/30">
            <th className="px-2 py-1 text-left font-normal text-muted-foreground">
              <div className="flex items-center gap-1">
                from <ArrowRight className="h-3 w-3" />
              </div>
            </th>
            {STATES.map((s) => (
              <th key={s} className="px-2 py-1 text-center font-normal">
                <FlowStateBadge state={s} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {STATES.map((from) => (
            <tr key={from}>
              <td className="border-t px-2 py-1">
                <FlowStateBadge state={from} />
              </td>
              {STATES.map((to) => {
                const count = matrix[from]?.[to] ?? 0;
                const intensity = count === 0 ? 0 : count / maxCount;
                return (
                  <td
                    key={to}
                    className="border-l border-t px-2 py-1 text-center font-mono"
                    style={{
                      backgroundColor:
                        count === 0
                          ? 'transparent'
                          : `color-mix(in oklab, var(--color-primary) ${(
                              intensity * 60
                            ).toFixed(0)}%, transparent)`,
                    }}
                  >
                    {count || '·'}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StateHistogram({
  title,
  counts,
}: {
  title: string;
  counts: Record<FlowState, number>;
}) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return (
    <div className="rounded-lg border p-3">
      <p className="mb-3 text-xs uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      <div className="space-y-1.5">
        {STATES.map((s) => {
          const n = counts[s] ?? 0;
          const pct = total > 0 ? (n / total) * 100 : 0;
          return (
            <div key={s} className="flex items-center gap-2">
              <div className="w-20">
                <FlowStateBadge state={s} />
              </div>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="w-14 text-right font-mono text-[11px] text-muted-foreground">
                {n} ({pct.toFixed(0)}%)
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function buildTransitions(run: PipelineRunWithReports | null) {
  const matrix = emptyMatrix();
  const firstHist = emptyCounts();
  const lastHist = emptyCounts();
  if (!run) {
    return {
      sessionTransitions: matrix,
      firstStateHistogram: firstHist,
      lastStateHistogram: lastHist,
    };
  }

  const reportsByUser = new Map<string, typeof run.perSession>();
  for (const r of run.perSession) {
    if (!reportsByUser.has(r.userId)) reportsByUser.set(r.userId, []);
    reportsByUser.get(r.userId)!.push(r);
  }

  for (const [, reports] of reportsByUser) {
    if (reports.length === 0) continue;
    const firstState =
      reports[0].finalFlowReading?.state ?? reports[0].summary.finalFlowState;
    const lastState =
      reports[reports.length - 1].finalFlowReading?.state ??
      reports[reports.length - 1].summary.finalFlowState;
    firstHist[firstState] = (firstHist[firstState] ?? 0) + 1;
    lastHist[lastState] = (lastHist[lastState] ?? 0) + 1;

    for (let i = 0; i < reports.length - 1; i++) {
      const from =
        reports[i].finalFlowReading?.state ?? reports[i].summary.finalFlowState;
      const to =
        reports[i + 1].finalFlowReading?.state ??
        reports[i + 1].summary.finalFlowState;
      matrix[from][to] = (matrix[from][to] ?? 0) + 1;
    }
  }

  return {
    sessionTransitions: matrix,
    firstStateHistogram: firstHist,
    lastStateHistogram: lastHist,
  };
}

function emptyMatrix(): Record<FlowState, Record<FlowState, number>> {
  const m = {} as Record<FlowState, Record<FlowState, number>>;
  for (const a of STATES) {
    m[a] = {} as Record<FlowState, number>;
    for (const b of STATES) m[a][b] = 0;
  }
  return m;
}

function emptyCounts(): Record<FlowState, number> {
  return STATES.reduce(
    (acc, s) => {
      acc[s] = 0;
      return acc;
    },
    {} as Record<FlowState, number>
  );
}
