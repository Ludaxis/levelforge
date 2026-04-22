'use client';

import { useMemo } from 'react';
import { GitBranch, Lock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { ImportedData } from './DataImporter';
import {
  extractDdaSessions,
  type DdaSession,
} from '@/lib/cadence/validationAnalysis';

interface Journey {
  cohort: DdaSession['cohort'];
  fromFlow: string;
  rule: string;
  variant: string;
  next: string;
}

export function DdaImpactSankey({ data }: { data: ImportedData | null }) {
  const model = useMemo(() => buildModel(data), [data]);

  if (!data) {
    return (
      <BlockedCard message="Upload a DDA output export to validate Treatment-vs-Control impact." />
    );
  }

  if (!data.report.canValidateDdaImpact) {
    return (
      <BlockedCard
        message="DDA Impact Sankey is disabled until the export includes DDA output fields."
        missing={data.report.fieldCoverage.dda.missing}
      />
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-primary" />
            DDA Impact Sankey
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-700 dark:text-emerald-300">
            This view uses logged DDA output fields. It answers whether a flow
            state plus DDA rule and variant decision is followed by better next
            flow/result.
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <JourneyPanel title="Control" journeys={model.control} />
            <JourneyPanel title="Treatment" journeys={model.treatment} />
          </div>
        </CardContent>
      </Card>

      <RuleAttribution sessions={model.sessions} />
    </div>
  );
}

function BlockedCard({
  message,
  missing = [],
}: {
  message: string;
  missing?: string[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lock className="h-5 w-5 text-amber-500" />
          DDA Impact
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{message}</p>
        {missing.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {missing.map((m) => (
              <Badge key={m} variant="secondary" className="font-mono text-[10px]">
                {m}
              </Badge>
            ))}
          </div>
        )}
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Validation concern unresolved: without SDK output fields in Control,
          the cohorts cannot be segmented cleanly.
        </p>
      </CardContent>
    </Card>
  );
}

function JourneyPanel({
  title,
  journeys,
}: {
  title: string;
  journeys: Journey[];
}) {
  const total = journeys.length;
  const top = topJourneyRows(journeys);
  return (
    <div className="rounded-lg border p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="font-medium">{title}</p>
        <Badge variant="secondary" className="font-mono text-[10px]">
          {total.toLocaleString()} linked session{total === 1 ? '' : 's'}
        </Badge>
      </div>
      {total === 0 ? (
        <p className="text-sm text-muted-foreground">
          No linked next-session journeys found for this cohort.
        </p>
      ) : (
        <div className="space-y-2">
          {top.map((row) => (
            <div key={row.key} className="rounded-md border bg-muted/20 p-2">
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <Badge variant="secondary">{row.fromFlow}</Badge>
                <span className="text-muted-foreground">→</span>
                <Badge variant="secondary">{row.rule}</Badge>
                <span className="text-muted-foreground">→</span>
                <Badge variant="secondary">{row.variant}</Badge>
                <span className="text-muted-foreground">→</span>
                <Badge variant="secondary">{row.next}</Badge>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${(row.count / total) * 100}%` }}
                  />
                </div>
                <span className="w-24 text-right font-mono text-[11px] text-muted-foreground">
                  {row.count} ({((row.count / total) * 100).toFixed(0)}%)
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RuleAttribution({ sessions }: { sessions: DdaSession[] }) {
  const rows = Array.from(
    sessions.reduce((map, s) => {
      const key = `${s.cohort}|${s.rule}`;
      const cur = map.get(key) ?? {
        cohort: s.cohort,
        rule: s.rule,
        sessions: 0,
        wins: 0,
        eased: 0,
        hardened: 0,
      };
      cur.sessions++;
      if (s.result === 'win') cur.wins++;
      if (s.variantDelta < 0) cur.eased++;
      if (s.variantDelta > 0) cur.hardened++;
      map.set(key, cur);
      return map;
    }, new Map<string, { cohort: string; rule: string; sessions: number; wins: number; eased: number; hardened: number }>())
      .values()
  ).sort((a, b) => b.sessions - a.sessions);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Rule Attribution</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-3 py-2">Cohort</th>
                <th className="px-3 py-2">Rule</th>
                <th className="px-3 py-2 text-right">Sessions</th>
                <th className="px-3 py-2 text-right">Win rate</th>
                <th className="px-3 py-2 text-right">Eased</th>
                <th className="px-3 py-2 text-right">Hardened</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.cohort}-${r.rule}`} className="border-b last:border-0">
                  <td className="px-3 py-2 capitalize">{r.cohort}</td>
                  <td className="px-3 py-2 font-mono text-xs">{r.rule}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">
                    {r.sessions.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs">
                    {r.sessions > 0 ? `${((r.wins / r.sessions) * 100).toFixed(1)}%` : '—'}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs">
                    {r.eased.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs">
                    {r.hardened.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function buildModel(data: ImportedData | null) {
  const sessions = data ? extractDdaSessions(data.rows) : [];
  const byUser = new Map<string, DdaSession[]>();
  for (const s of sessions) {
    if (!byUser.has(s.userId)) byUser.set(s.userId, []);
    byUser.get(s.userId)!.push(s);
  }

  const journeys: Journey[] = [];
  for (const userSessions of byUser.values()) {
    userSessions.sort((a, b) => a.timestamp - b.timestamp);
    for (let i = 0; i < userSessions.length - 1; i++) {
      const cur = userSessions[i];
      const next = userSessions[i + 1];
      journeys.push({
        cohort: cur.cohort,
        fromFlow: cur.flowState,
        rule: cur.rule,
        variant: variantLabel(cur.variantDelta, cur.variantServed),
        next: `${next.flowState}/${next.result || 'unknown'}`,
      });
    }
  }

  return {
    sessions,
    control: journeys.filter((j) => j.cohort === 'control'),
    treatment: journeys.filter((j) => j.cohort === 'treatment'),
  };
}

function topJourneyRows(journeys: Journey[]) {
  const counts = new Map<string, Journey & { key: string; count: number }>();
  for (const j of journeys) {
    const key = [j.fromFlow, j.rule, j.variant, j.next].join('|');
    const cur = counts.get(key) ?? { ...j, key, count: 0 };
    cur.count++;
    counts.set(key, cur);
  }
  return Array.from(counts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

function variantLabel(delta: number, variant: number | null): string {
  if (delta < 0) return `ease ${delta}${variant ? ` / v${variant}` : ''}`;
  if (delta > 0) return `harden +${delta}${variant ? ` / v${variant}` : ''}`;
  return `no change${variant ? ` / v${variant}` : ''}`;
}
