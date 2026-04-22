'use client';

import { useMemo } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Gauge,
  GitCompare,
  TrendingUp,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ImportedData } from './DataImporter';
import { FlowStateBadge } from './badges';
import type { PipelineRunWithReports } from '@/lib/cadence/pipeline';
import {
  computeFlowParity,
  computeSankeyHealth,
  computeTreatmentImpact,
  type ProportionInterval,
  type SankeyHealthFlag,
  type TreatmentCohortStats,
} from '@/lib/cadence/validationAnalysis';
import type { FlowState } from '@/lib/cadence/types';

const STATES: FlowState[] = [
  'flow',
  'boredom',
  'anxiety',
  'frustration',
  'unknown',
];

export function FlowParityPanel({
  run,
  data,
}: {
  run: PipelineRunWithReports | null;
  data: ImportedData | null;
}) {
  const report = useMemo(
    () => computeFlowParity(run, data?.rows ?? null),
    [run, data]
  );

  if (!run) return null;

  const status =
    report.compared === 0
      ? 'missing'
      : report.matchRate >= 0.95
        ? 'healthy'
        : 'needs_review';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GitCompare className="h-5 w-5 text-primary" />
          Logged vs Recomputed Flow
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!report.hasLoggedFlowState ? (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
            No logged flow_state was found in the export. Replay can validate
            the formula internally, but it cannot yet prove that SDK output
            matches the analysis tool.
          </div>
        ) : (
          <div
            className={`rounded-lg border p-3 text-xs ${
              status === 'healthy'
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                : 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
            }`}
          >
            {status === 'healthy'
              ? 'Logged flow_state closely matches the replayed formula.'
              : 'Review mismatches before using the Sankey as a validation sign-off.'}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Metric label="Compared" value={report.compared.toLocaleString()} />
          <Metric label="Match Rate" value={pct(report.matchRate)} />
          <Metric label="Mismatches" value={report.mismatches.toLocaleString()} />
          <Metric
            label="Missing Logged"
            value={report.missingLogged.toLocaleString()}
          />
          <Metric
            label="Missing Replay"
            value={report.missingReplay.toLocaleString()}
          />
        </div>

        {report.sampleMismatches.length > 0 && (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2">User</th>
                  <th className="px-3 py-2">Level</th>
                  <th className="px-3 py-2 text-right">Attempt</th>
                  <th className="px-3 py-2">Logged</th>
                  <th className="px-3 py-2">Recomputed</th>
                </tr>
              </thead>
              <tbody>
                {report.sampleMismatches.map((row) => (
                  <tr
                    key={`${row.userId}-${row.levelId}-${row.attempt}`}
                    className="border-b last:border-0"
                  >
                    <td className="px-3 py-2 font-mono text-xs">{row.userId}</td>
                    <td className="px-3 py-2 font-mono text-xs">{row.levelId}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {row.attempt}
                    </td>
                    <td className="px-3 py-2">
                      <FlowStateBadge state={row.loggedFlowState} />
                    </td>
                    <td className="px-3 py-2">
                      <FlowStateBadge state={row.recomputedFlowState} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function SankeyHealthPanel({
  run,
}: {
  run: PipelineRunWithReports | null;
}) {
  const report = useMemo(() => computeSankeyHealth(run), [run]);
  if (!run) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gauge className="h-5 w-5 text-primary" />
          Sankey Health Checks
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Metric label="Flow Share" value={pct(report.flowShare)} />
          <Metric
            label="Boredom/Frustration"
            value={pct(report.boredomFrustrationTransitionRate)}
          />
          <Metric label="State Switch Rate" value={pct(report.switchRate)} />
          <Metric
            label="Unknown After S5"
            value={report.unknownPastSessionFive.toLocaleString()}
          />
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
          {STATES.map((state) => (
            <div key={state} className="rounded-lg border p-3">
              <FlowStateBadge state={state} />
              <p className="mt-2 font-mono text-lg">
                {pct(report.stateShare[state])}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {report.stateCounts[state].toLocaleString()} sessions
              </p>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          {report.flags.map((flag) => (
            <HealthFlagRow key={`${flag.title}-${flag.severity}`} flag={flag} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function TreatmentImpactPanel({
  data,
}: {
  data: ImportedData | null;
}) {
  const report = useMemo(
    () => computeTreatmentImpact(data?.rows ?? null),
    [data]
  );

  if (!data?.report.canValidateDdaImpact) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          Treatment vs Control Impact
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!report.hasBothCohorts && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
            The export has DDA output fields, but it does not contain both
            Control and Treatment cohorts. Cohort impact cannot be validated
            until dda_enabled has both 0 and 1 values.
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <CohortCard stats={report.control} />
          <CohortCard stats={report.treatment} />
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Metric label="Win Rate Delta" value={signedPct(report.deltas.winRate)} />
          <Metric
            label="Next-Session Delta"
            value={signedPct(report.deltas.nextSessionRate)}
          />
          <Metric
            label="High-Frustration Delta"
            value={signedPct(report.deltas.highFrustrationWinRate)}
          />
        </div>

        <RuleImpactTable rows={report.ruleStats} />
      </CardContent>
    </Card>
  );
}

function CohortCard({ stats }: { stats: TreatmentCohortStats }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="font-medium capitalize">{stats.cohort}</p>
        <Badge variant="secondary" className="font-mono text-[10px]">
          {stats.users.toLocaleString()} users
        </Badge>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Metric label="Sessions" value={stats.sessions.toLocaleString()} />
        <Metric label="Wins" value={stats.wins.toLocaleString()} />
        <IntervalMetric label="Win Rate" interval={stats.winRate} />
        <IntervalMetric
          label="Next Session"
          interval={stats.nextSessionRate}
        />
        <Metric
          label="High Frustration"
          value={stats.highFrustrationSessions.toLocaleString()}
        />
        <IntervalMetric
          label="HF Win Rate"
          interval={stats.highFrustrationWinRate}
        />
      </div>
    </div>
  );
}

function RuleImpactTable({
  rows,
}: {
  rows: ReturnType<typeof computeTreatmentImpact>['ruleStats'];
}) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No DDA rule rows were found in this export.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="px-3 py-2">Cohort</th>
            <th className="px-3 py-2">Rule</th>
            <th className="px-3 py-2 text-right">Sessions</th>
            <th className="px-3 py-2 text-right">Win Rate</th>
            <th className="px-3 py-2 text-right">Next Session</th>
            <th className="px-3 py-2 text-right">Avg Delta</th>
            <th className="px-3 py-2 text-right">Eased</th>
            <th className="px-3 py-2 text-right">Hardened</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 12).map((row) => (
            <tr
              key={`${row.cohort}-${row.rule}`}
              className="border-b last:border-0"
            >
              <td className="px-3 py-2 capitalize">{row.cohort}</td>
              <td className="px-3 py-2 font-mono text-xs">{row.rule}</td>
              <td className="px-3 py-2 text-right font-mono text-xs">
                {row.sessions.toLocaleString()}
              </td>
              <td className="px-3 py-2 text-right font-mono text-xs">
                {pct(row.winRate.value)}
              </td>
              <td className="px-3 py-2 text-right font-mono text-xs">
                {pct(row.nextSessionRate.value)}
              </td>
              <td className="px-3 py-2 text-right font-mono text-xs">
                {row.avgVariantDelta.toFixed(2)}
              </td>
              <td className="px-3 py-2 text-right font-mono text-xs">
                {row.eased.toLocaleString()}
              </td>
              <td className="px-3 py-2 text-right font-mono text-xs">
                {row.hardened.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HealthFlagRow({ flag }: { flag: SankeyHealthFlag }) {
  const Icon =
    flag.severity === 'pass'
      ? CheckCircle2
      : flag.severity === 'fail'
        ? AlertTriangle
        : Activity;
  const tone =
    flag.severity === 'pass'
      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
      : flag.severity === 'fail'
        ? 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300'
        : 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300';
  return (
    <div className={`flex items-start gap-3 rounded-lg border p-3 ${tone}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <p className="font-medium">{flag.title}</p>
        <p className="text-xs opacity-90">{flag.detail}</p>
      </div>
    </div>
  );
}

function IntervalMetric({
  label,
  interval,
}: {
  label: string;
  interval: ProportionInterval;
}) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="font-mono text-lg">{pct(interval.value)}</p>
      <p className="text-[11px] text-muted-foreground">
        95% CI {pct(interval.low)}-{pct(interval.high)}
      </p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="font-mono text-lg">{value}</p>
    </div>
  );
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function signedPct(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${pct(value)}`;
}
