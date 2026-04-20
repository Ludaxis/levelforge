'use client';

import { ArrowRight, Circle, CheckCircle2, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { PipelineRun, PipelineStepResult } from '@/lib/cadence/types';

interface PipelineStripProps {
  run: PipelineRun | null;
  selectedStepId: string | null;
  onSelectStep: (id: string) => void;
}

export function PipelineStrip({
  run,
  selectedStepId,
  onSelectStep,
}: PipelineStripProps) {
  const steps = run?.steps ?? placeholderSteps();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Pipeline</span>
          {run && (
            <span className="text-xs font-normal text-muted-foreground">
              {run.sessionCount.toLocaleString()} sessions ·{' '}
              {run.proposalCount.toLocaleString()} proposals
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {steps.map((step, idx) => (
            <div key={step.stepId} className="flex items-center gap-2">
              <StepCard
                step={step}
                active={step.stepId === selectedStepId}
                hasRun={!!run}
                onClick={() => onSelectStep(step.stepId)}
              />
              {idx < steps.length - 1 && (
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function StepCard({
  step,
  active,
  hasRun,
  onClick,
}: {
  step: PipelineStepResult;
  active: boolean;
  hasRun: boolean;
  onClick: () => void;
}) {
  const StatusIcon = !hasRun
    ? Circle
    : step.rowsOut === 0
      ? AlertCircle
      : CheckCircle2;
  const statusColor = !hasRun
    ? 'text-muted-foreground'
    : step.rowsOut === 0
      ? 'text-amber-500'
      : 'text-emerald-500';

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex min-w-[180px] flex-col gap-2 rounded-lg border p-3 text-left transition-colors',
        active
          ? 'border-primary bg-primary/5'
          : 'hover:border-accent-foreground/30 hover:bg-accent/50'
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{step.stepName}</span>
        <StatusIcon className={cn('h-4 w-4', statusColor)} />
      </div>
      <div className="flex items-center gap-1">
        <Badge variant="secondary" className="text-[10px]">
          in {step.rowsIn.toLocaleString()}
        </Badge>
        <Badge variant="secondary" className="text-[10px]">
          out {step.rowsOut.toLocaleString()}
        </Badge>
      </div>
    </button>
  );
}

function placeholderSteps(): PipelineStepResult[] {
  return [
    { stepId: 'parse', stepName: 'Parse + Validate', rowsIn: 0, rowsOut: 0, durationMs: 0, summary: 'Awaiting data' },
    { stepId: 'group_sessions', stepName: 'Group by Session', rowsIn: 0, rowsOut: 0, durationMs: 0, summary: 'Awaiting data' },
    { stepId: 'session_analyze', stepName: 'Session Analyzer', rowsIn: 0, rowsOut: 0, durationMs: 0, summary: 'Awaiting data' },
    { stepId: 'flow_detect', stepName: 'Flow Detector', rowsIn: 0, rowsOut: 0, durationMs: 0, summary: 'Awaiting data' },
    { stepId: 'glicko_update', stepName: 'Glicko-2 Update', rowsIn: 0, rowsOut: 0, durationMs: 0, summary: 'Awaiting data' },
    { stepId: 'rule_eval', stepName: 'Rule Engine (6 rules)', rowsIn: 0, rowsOut: 0, durationMs: 0, summary: 'Awaiting data' },
    { stepId: 'variant_map', stepName: 'Variant Mapper', rowsIn: 0, rowsOut: 0, durationMs: 0, summary: 'Awaiting data' },
  ];
}
