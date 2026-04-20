'use client';

import { useMemo, useState } from 'react';
import { User } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { PipelineRunWithReports, PerSessionReport } from '@/lib/cadence/pipeline';
import { FlowStateBadge, OutcomeBadge } from './badges';

interface UserTimelineProps {
  run: PipelineRunWithReports | null;
}

export function UserTimeline({ run }: UserTimelineProps) {
  const userIds = useMemo(() => {
    if (!run) return [];
    return Array.from(new Set(run.perSession.map((r) => r.userId))).sort();
  }, [run]);

  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const activeUser = selectedUser ?? userIds[0] ?? null;

  if (!run || run.perSession.length === 0) return null;

  const reports = activeUser
    ? run.perSession.filter((r) => r.userId === activeUser)
    : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="h-5 w-5 text-primary" />
          Per-User Timeline
          <Badge variant="secondary" className="ml-2 text-[10px]">
            {userIds.length} player{userIds.length === 1 ? '' : 's'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-1.5">
          {userIds.slice(0, 20).map((uid) => (
            <button
              key={uid}
              onClick={() => setSelectedUser(uid)}
              className={`rounded-md border px-2 py-1 font-mono text-xs transition-colors ${
                uid === activeUser
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'hover:bg-accent'
              }`}
            >
              {uid}
            </button>
          ))}
          {userIds.length > 20 && (
            <span className="text-xs text-muted-foreground">
              … +{userIds.length - 20} more
            </span>
          )}
        </div>

        {reports.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-3">Session</th>
                  <th className="pb-2 pr-3">Result</th>
                  <th className="pb-2 pr-3">Flow</th>
                  <th className="pb-2 pr-3">Efficiency</th>
                  <th className="pb-2 pr-3">Frustration</th>
                  <th className="pb-2 pr-3">Rating</th>
                  <th className="pb-2 pr-3">RD</th>
                  <th className="pb-2 pr-3">Variant</th>
                  <th className="pb-2">Proposal</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <TimelineRow key={r.sessionId} report={r} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TimelineRow({ report }: { report: PerSessionReport }) {
  const ratingDelta = report.profileAfter.rating - report.profileBefore.rating;
  const variantDelta = (report.variantAfter ?? 0) - (report.variantBefore ?? 0);
  const state = report.finalFlowReading?.state ?? report.summary.finalFlowState;

  return (
    <tr className="border-b last:border-0">
      <td className="py-2 pr-3 font-mono text-xs text-muted-foreground">
        {report.levelId}
        <span className="ml-1 text-muted-foreground/60">#{report.attempt}</span>
      </td>
      <td className="py-2 pr-3">
        <OutcomeBadge outcome={report.summary.outcome} />
      </td>
      <td className="py-2 pr-3">
        <FlowStateBadge state={state} />
      </td>
      <td className="py-2 pr-3 font-mono text-xs">
        {report.summary.moveEfficiency.toFixed(2)}
      </td>
      <td className="py-2 pr-3 font-mono text-xs">
        {report.summary.frustrationScore.toFixed(2)}
      </td>
      <td className="py-2 pr-3 font-mono text-xs">
        {report.profileAfter.rating.toFixed(0)}
        {Math.abs(ratingDelta) >= 0.5 && (
          <span
            className={`ml-1 ${ratingDelta > 0 ? 'text-emerald-500' : 'text-red-500'}`}
          >
            {ratingDelta > 0 ? '+' : ''}{ratingDelta.toFixed(0)}
          </span>
        )}
      </td>
      <td className="py-2 pr-3 font-mono text-xs">
        {report.profileAfter.deviation.toFixed(0)}
      </td>
      <td className="py-2 pr-3 font-mono text-xs">
        {report.variantBefore !== undefined ? `v${report.variantBefore}` : '—'}
        {variantDelta !== 0 && (
          <>
            <span className="mx-1 text-muted-foreground">→</span>
            <span
              className={variantDelta > 0 ? 'text-red-500' : 'text-emerald-500'}
            >
              v{report.variantAfter}
            </span>
          </>
        )}
      </td>
      <td className="max-w-[260px] truncate py-2 text-xs text-muted-foreground">
        {report.proposal.deltas.length === 0
          ? '—'
          : report.proposal.reason}
      </td>
    </tr>
  );
}
