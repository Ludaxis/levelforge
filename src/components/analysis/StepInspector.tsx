'use client';

import { Inspect } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type {
  PipelineRun,
  PipelineStepId,
  PipelineStepResult,
} from '@/lib/cadence/types';

interface StepInspectorProps {
  run: PipelineRun | null;
  stepId: PipelineStepId | null;
}

export function StepInspector({ run, stepId }: StepInspectorProps) {
  const step = run && stepId ? run.steps.find((s) => s.stepId === stepId) : null;

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Inspect className="h-5 w-5 text-primary" />
          Step Inspector
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!run && (
          <p className="text-sm text-muted-foreground">
            Import a file and run the pipeline to inspect each step.
          </p>
        )}
        {run && !step && (
          <p className="text-sm text-muted-foreground">
            Click any step above to see its inputs, outputs, and config.
          </p>
        )}
        {step && <StepDetail step={step} run={run!} />}
      </CardContent>
    </Card>
  );
}

function StepDetail({ step, run }: { step: PipelineStepResult; run: PipelineRun }) {
  return (
    <>
      <div>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Step</p>
        <p className="text-base font-medium">{step.stepName}</p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Metric label="Rows in" value={step.rowsIn.toLocaleString()} />
        <Metric label="Rows out" value={step.rowsOut.toLocaleString()} />
        <Metric label="Duration" value={`${step.durationMs.toFixed(1)} ms`} />
      </div>
      <div>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Summary</p>
        <p className="text-sm">{step.summary}</p>
      </div>

      <StepSamplePayload step={step} />

      {run.errors
        .filter((e) => e.stepId === step.stepId)
        .map((e, idx) => (
          <div
            key={idx}
            className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-2 text-xs"
          >
            <Badge variant="outline" className="mr-2 text-[10px]">
              note
            </Badge>
            {e.message}
          </div>
        ))}
    </>
  );
}

function StepSamplePayload({ step }: { step: PipelineStepResult }) {
  if (!step.samplePayload) return null;

  if (step.stepId === 'group_sessions') {
    const rows = step.samplePayload as Array<{
      sessionId: string;
      userId: string;
      levelId: string;
      attempt: number;
      outcome: string;
      signalCount: number;
    }>;
    return (
      <Section title="Sample sessions">
        <div className="space-y-1.5">
          {rows.map((r) => (
            <div
              key={r.sessionId}
              className="flex items-center justify-between rounded-md border px-2.5 py-1.5 text-xs"
            >
              <div className="min-w-0 flex-1">
                <span className="font-mono">{r.userId}</span>
                <span className="mx-1 text-muted-foreground">·</span>
                <span>{r.levelId}</span>
                <span className="mx-1 text-muted-foreground">#{r.attempt}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <OutcomeBadge outcome={r.outcome} />
                <Badge variant="secondary" className="text-[10px]">
                  {r.signalCount} sig
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </Section>
    );
  }

  if (step.stepId === 'session_analyze') {
    const summaries = step.samplePayload as Array<{
      sessionId: string;
      outcome: string;
      totalMoves: number;
      moveEfficiency: number;
      skillScore: number;
      engagementScore: number;
      frustrationScore: number;
      finalFlowState: string;
    }>;
    return (
      <Section title="Sample summaries">
        <div className="space-y-1.5">
          {summaries.map((s) => (
            <div
              key={s.sessionId}
              className="rounded-md border px-2.5 py-1.5 text-xs"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-muted-foreground">
                  {s.sessionId}
                </span>
                <div className="flex items-center gap-1">
                  <OutcomeBadge outcome={s.outcome} />
                  <FlowStateBadge state={s.finalFlowState} />
                </div>
              </div>
              <div className="mt-1 grid grid-cols-4 gap-1 font-mono text-[10px]">
                <ScoreCell label="moves" value={s.totalMoves.toString()} />
                <ScoreCell label="eff" value={s.moveEfficiency.toFixed(2)} />
                <ScoreCell label="skill" value={s.skillScore.toFixed(2)} />
                <ScoreCell label="frust" value={s.frustrationScore.toFixed(2)} />
              </div>
            </div>
          ))}
        </div>
      </Section>
    );
  }

  if (step.stepId === 'flow_detect') {
    const items = step.samplePayload as Array<{
      sessionId: string;
      readingCount: number;
      first?: { state: string; tempoScore: number };
      last?: { state: string; confidence: number };
    }>;
    return (
      <Section title="Sample sessions (first → last reading)">
        <div className="space-y-1.5">
          {items.map((r) => (
            <div
              key={r.sessionId}
              className="rounded-md border px-2.5 py-1.5 text-xs"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-muted-foreground">
                  {r.sessionId}
                </span>
                <Badge variant="secondary" className="text-[10px]">
                  {r.readingCount} ticks
                </Badge>
              </div>
              <div className="mt-1 flex items-center gap-2 text-[11px]">
                <FlowStateBadge state={r.first?.state ?? 'unknown'} />
                <span className="text-muted-foreground">→</span>
                <FlowStateBadge state={r.last?.state ?? 'unknown'} />
                {r.last && (
                  <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                    conf {(r.last.confidence * 100).toFixed(0)}%
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </Section>
    );
  }

  if (step.stepId === 'glicko_update') {
    const players = step.samplePayload as Array<{
      userId: string;
      rating: number;
      deviation: number;
      volatility: number;
      sessionsCompleted: number;
      confidence: number;
    }>;
    return (
      <Section title="Sample player profiles">
        <div className="space-y-1.5">
          {players.map((p) => (
            <div key={p.userId} className="rounded-md border px-2.5 py-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-mono">{p.userId}</span>
                <Badge variant="secondary" className="text-[10px]">
                  {p.sessionsCompleted} sessions
                </Badge>
              </div>
              <div className="mt-1 grid grid-cols-4 gap-1 font-mono text-[10px]">
                <ScoreCell label="rating" value={p.rating.toFixed(0)} />
                <ScoreCell label="RD" value={p.deviation.toFixed(0)} />
                <ScoreCell label="σ" value={p.volatility.toFixed(3)} />
                <ScoreCell label="conf" value={`${(p.confidence * 100).toFixed(0)}%`} />
              </div>
            </div>
          ))}
        </div>
      </Section>
    );
  }

  if (step.stepId === 'rule_eval') {
    const proposals = step.samplePayload as Array<{
      deltaCount: number;
      confidence: number;
      reason: string;
      detectedState: string;
      timing: string;
    }>;
    return (
      <Section title="Sample proposals">
        <div className="space-y-1.5">
          {proposals.map((p, idx) => (
            <div key={idx} className="rounded-md border px-2.5 py-2 text-xs">
              <div className="mb-1 flex items-center gap-1.5">
                <FlowStateBadge state={p.detectedState} />
                <Badge variant="secondary" className="text-[10px]">
                  {p.deltaCount} delta{p.deltaCount === 1 ? '' : 's'}
                </Badge>
                <Badge variant="secondary" className="text-[10px]">
                  {p.timing}
                </Badge>
                <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                  conf {(p.confidence * 100).toFixed(0)}%
                </span>
              </div>
              <p className="text-[11px] leading-tight text-muted-foreground">
                {p.reason}
              </p>
            </div>
          ))}
        </div>
      </Section>
    );
  }

  if (step.stepId === 'variant_map') {
    const items = step.samplePayload as Array<{
      sessionId: string;
      userId: string;
      variantBefore: number;
      variantAfter: number;
      reason: string;
    }>;
    return (
      <Section title="Sample variant transitions">
        <div className="space-y-1.5">
          {items.map((r) => (
            <div key={r.sessionId} className="rounded-md border px-2.5 py-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-muted-foreground">
                  {r.userId}
                </span>
                <div className="flex items-center gap-1 font-mono text-[11px]">
                  <span className="rounded bg-muted px-1.5 py-0.5">
                    v{r.variantBefore}
                  </span>
                  <span>→</span>
                  <span className="rounded bg-primary/20 px-1.5 py-0.5">
                    v{r.variantAfter}
                  </span>
                </div>
              </div>
              <p className="mt-1 line-clamp-2 text-[11px] leading-tight text-muted-foreground">
                {r.reason}
              </p>
            </div>
          ))}
        </div>
      </Section>
    );
  }

  return null;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      {children}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-medium">{value}</p>
    </div>
  );
}

function ScoreCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-start">
      <span className="text-[9px] uppercase text-muted-foreground">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

function OutcomeBadge({ outcome }: { outcome: string }) {
  const cls =
    outcome === 'win'
      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'
      : outcome === 'lose'
        ? 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30'
        : 'bg-muted text-muted-foreground';
  return (
    <span className={`inline-flex items-center rounded-md border px-1.5 py-0 text-[10px] ${cls}`}>
      {outcome}
    </span>
  );
}

function FlowStateBadge({ state }: { state: string }) {
  const palette: Record<string, string> = {
    flow: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
    boredom: 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30',
    anxiety: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
    frustration: 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30',
    unknown: 'bg-muted text-muted-foreground border-transparent',
  };
  return (
    <span
      className={`inline-flex items-center rounded-md border px-1.5 py-0 text-[10px] ${palette[state] ?? palette.unknown}`}
    >
      {state}
    </span>
  );
}
