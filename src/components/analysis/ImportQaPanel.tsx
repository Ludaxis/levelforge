'use client';

import { AlertTriangle, CheckCircle2, FileWarning, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { ImportedData } from './DataImporter';

interface ImportQaPanelProps {
  data: ImportedData | null;
}

export function ImportQaPanel({ data }: ImportQaPanelProps) {
  if (!data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5 text-primary" />
            Import Readiness
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Upload a SAT export to check whether it can run replay, draw a baseline
          Sankey, or validate DDA impact.
        </CardContent>
      </Card>
    );
  }

  const report = data.report;
  const q = report.dataQuality;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileWarning className="h-5 w-5 text-primary" />
            Import Readiness
            <Badge variant="secondary" className="ml-2 text-[10px]">
              {report.kind.replace('_', ' ')}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <ReadinessPill label="Can run replay" ok={report.canRunReplay} />
            <ReadinessPill
              label="Can draw baseline Sankey"
              ok={report.canDrawBaselineSankey}
            />
            <ReadinessPill
              label="Can validate DDA impact"
              ok={report.canValidateDdaImpact}
            />
          </div>

          {(report.blockers.length > 0 || report.warnings.length > 0) && (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {report.blockers.length > 0 && (
                <MessageList
                  title="Blockers"
                  tone="bad"
                  items={report.blockers}
                />
              )}
              {report.warnings.length > 0 && (
                <MessageList
                  title="Warnings"
                  tone="warn"
                  items={report.warnings}
                />
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {report.kind === 'aggregated_funnel' && (
        <AggregatedFunnelSummary data={data} />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Data Quality</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Metric label="Rows" value={q.rowCount.toLocaleString()} />
            <Metric label="Users" value={q.userCount.toLocaleString()} />
            <Metric label="Levels" value={q.levelCount.toLocaleString()} />
            <Metric label="Sessions" value={q.sessionCount.toLocaleString()} />
            <Metric
              label="Complete sessions"
              value={q.completeSessions.toLocaleString()}
            />
            <Metric
              label="Missing start"
              value={q.sessionsMissingStart.toLocaleString()}
            />
            <Metric
              label="Missing result"
              value={q.sessionsMissingResult.toLocaleString()}
            />
            <Metric
              label="Move rows"
              value={q.rawSignalRows.toLocaleString()}
            />
            <Metric
              label="Move gaps"
              value={q.moveIndexGapSessions.toLocaleString()}
            />
            <Metric
              label="Move duplicates"
              value={q.moveIndexDuplicateSessions.toLocaleString()}
            />
            <Metric
              label="Intervals >30s"
              value={q.intervalOver30s.toLocaleString()}
            />
            <Metric
              label="Intervals >60s"
              value={q.intervalOver60s.toLocaleString()}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <CoverageList
              title="Missing raw signal fields"
              items={q.missingRawSignalFields
                .filter((f) => f.missingRows > 0)
                .map(
                  (f) =>
                    `${f.field}: ${f.missingRows.toLocaleString()} / ${f.checkedRows.toLocaleString()} move rows`
                )}
              empty="All raw move fields are populated on song_move rows."
            />
            <CoverageList
              title="Missing DDA output fields"
              items={q.missingDdaOutputFields}
              empty="All tracked DDA output fields are present somewhere in the export."
            />
          </div>

          <EventCountTable data={data} />
        </CardContent>
      </Card>
    </div>
  );
}

function ReadinessPill({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border p-3 text-sm">
      {ok ? (
        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
      ) : (
        <AlertTriangle className="h-4 w-4 text-amber-500" />
      )}
      <span>{label}</span>
    </div>
  );
}

function MessageList({
  title,
  tone,
  items,
}: {
  title: string;
  tone: 'bad' | 'warn';
  items: string[];
}) {
  const classes =
    tone === 'bad'
      ? 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300'
      : 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300';
  return (
    <div className={`rounded-lg border p-3 text-xs ${classes}`}>
      <p className="mb-1 font-medium">{title}</p>
      <ul className="list-disc space-y-1 pl-4">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-mono text-lg">{value}</p>
    </div>
  );
}

function CoverageList({
  title,
  items,
  empty,
}: {
  title: string;
  items: string[];
  empty: string;
}) {
  return (
    <div className="rounded-lg border p-3">
      <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{empty}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {items.map((item) => (
            <Badge key={item} variant="secondary" className="font-mono text-[10px]">
              {item}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function EventCountTable({ data }: { data: ImportedData }) {
  const events = Object.entries(data.report.dataQuality.eventCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);
  if (events.length === 0) return null;
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="px-3 py-2">Event</th>
            <th className="px-3 py-2 text-right">Rows</th>
          </tr>
        </thead>
        <tbody>
          {events.map(([event, count]) => (
            <tr key={event} className="border-b last:border-0">
              <td className="px-3 py-2 font-mono text-xs">{event}</td>
              <td className="px-3 py-2 text-right font-mono text-xs">
                {count.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AggregatedFunnelSummary({ data }: { data: ImportedData }) {
  const rows = aggregateFunnel(data);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Aggregated Funnel Summary</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
          This upload is useful for level win/loss funnel checks only. It has
          no per-user event timeline, so replay and Sankey validation are
          intentionally disabled.
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-3 py-2">Level</th>
                <th className="px-3 py-2 text-right">Users</th>
                <th className="px-3 py-2 text-right">Wins</th>
                <th className="px-3 py-2 text-right">Losses</th>
                <th className="px-3 py-2 text-right">Win rate</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 24).map((row) => (
                <tr key={row.levelId} className="border-b last:border-0">
                  <td className="px-3 py-2 font-mono text-xs">{row.levelId}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">
                    {row.total.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs">
                    {row.win.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs">
                    {row.lose.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs">
                    {row.total > 0 ? `${((row.win / row.total) * 100).toFixed(1)}%` : '—'}
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

function aggregateFunnel(data: ImportedData) {
  const byLevel = new Map<string, { levelId: string; win: number; lose: number; total: number }>();
  for (const row of data.report.aggregatedFunnelRows) {
    if (row.attempt !== null && row.attempt !== 1) continue;
    const cur = byLevel.get(row.levelId) ?? {
      levelId: row.levelId,
      win: 0,
      lose: 0,
      total: 0,
    };
    if (row.result === 'win') cur.win += row.userCount;
    if (row.result === 'lose') cur.lose += row.userCount;
    cur.total += row.userCount;
    byLevel.set(row.levelId, cur);
  }
  return Array.from(byLevel.values()).sort(
    (a, b) => levelOrder(a.levelId) - levelOrder(b.levelId)
  );
}

function levelOrder(levelId: string): number {
  const m = /(\d+)/.exec(levelId);
  return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
}
