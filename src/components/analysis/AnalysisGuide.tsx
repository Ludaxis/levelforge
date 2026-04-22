'use client';

import type React from 'react';
import { BookOpen, ListChecks } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export function HowToUsePanel() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <GuideCard title="Data Table Logic" icon="raw" wide>
        <div className="space-y-3">
          <p>
            The needed export is raw event-level data: one table row equals one
            analytics event for one user. Aggregated counts can support funnel
            summaries, but they cannot replay sessions or validate journeys.
          </p>
          <LogicTable
            rows={[
              ['Row grain', 'one row = one event, not one level total'],
              ['Session key', 'user_id + level_id + attempt'],
              ['Start row', 'song_start/me_start opens the level attempt'],
              ['Move rows', 'song_move rows carry signal values for replay'],
              ['Result row', 'song_result/me_result carries outcome and SDK output'],
              ['Sankey x-axis', 'full individual level_id such as Level15_1'],
            ]}
          />
          <div className="rounded-lg border bg-muted/20 p-3">
            <p className="mb-2 font-medium text-foreground">Session example</p>
            <p className="font-mono text-xs">
              user_id=U1 + level_id=Level15_1 + attempt=1 → one rebuilt
              session
            </p>
          </div>
        </div>
      </GuideCard>

      <GuideCard title="Correct Export" icon="raw">
        <p>
          Upload raw event rows, not metric aggregates. The replay needs one row
          per analytics event so it can rebuild each user session.
        </p>
        <CodeList
          items={[
            'song_start',
            'song_move',
            'song_first_move',
            'song_result',
            'me_start',
            'me_result',
            'song_booster_success',
            'song_booster_click',
            'level_streak_update',
            'song_end',
          ]}
        />
      </GuideCard>

      <GuideCard title="Required Raw Columns" icon="raw">
        <CodeList
          items={[
            'event_name',
            'event_timestamp',
            'user_id',
            'level_id',
            'attempt',
            'play_type or source',
            'result',
            'progress',
            'playtime',
            'par_moves',
            'actual_moves',
            'move_index',
            'move_interval_ms',
            'is_optimal',
            'waste_value',
            'input_rejected_count',
            'hesitation_ms',
            'progress_delta',
          ]}
        />
      </GuideCard>

      <GuideCard title="DDA Impact Columns" icon="dda">
        <p>
          These fields are required before the Treatment-vs-Control story is
          valid. Without them, the tool can only validate the signal formula.
        </p>
        <CodeList
          items={[
            'dda_enabled',
            'variant_default',
            'variant_served',
            'variant_delta',
            'dda_rule',
            'dda_confidence',
            'flow_state',
            'skill_score',
            'engagement_score',
            'frustration_score',
            'glicko_rating',
            'glicko_deviation',
            'sessions_completed',
          ]}
        />
      </GuideCard>

      <GuideCard title="Control vs Treatment Logic" icon="dda" wide>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-lg border p-3">
            <p className="mb-2 font-medium text-foreground">Control</p>
            <p>
              SDK should still run and log segmentation output, but difficulty
              adjustment is suppressed.
            </p>
            <CodeList
              items={[
                'dda_enabled = 0',
                'flow_state exists',
                'skill_score exists',
                'variant_served = variant_default',
                'variant_delta = 0',
              ]}
            />
          </div>
          <div className="rounded-lg border p-3">
            <p className="mb-2 font-medium text-foreground">Treatment</p>
            <p>
              SDK runs fully, logs the selected rule, and may serve an easier or
              harder variant.
            </p>
            <CodeList
              items={[
                'dda_enabled = 1',
                'flow_state exists',
                'dda_rule exists',
                'variant_served may differ',
                'variant_delta can be -1/0/+1',
              ]}
            />
          </div>
        </div>
      </GuideCard>

      <GuideCard title="What Not To Upload" icon="warn">
        <p>
          Aggregated SAT tables such as Song Result User Count are useful for
          funnel checks, but they do not contain user timelines.
        </p>
        <CodeList
          items={[
            'song_result_user_count without user_id',
            'level_id/result/date only',
            'exports without event_timestamp',
            'exports without song_move rows',
          ]}
        />
      </GuideCard>

      <GuideCard title="Sankey Validation Logic" icon="raw">
        <p>
          The tool first creates one completed-session row per user, level, and
          attempt, then connects the same user across consecutive individual
          levels.
        </p>
        <div className="rounded-lg border bg-muted/20 p-3 font-mono text-xs">
          U1: Level15_1 flow → Level23_1 frustration → Level31_1 flow
        </div>
        <p>
          The x-axis must remain the full level_id. Short labels such as L15
          hide level variants and make validation ambiguous.
        </p>
      </GuideCard>
    </div>
  );
}

export function AnalysisFlowPanel() {
  const phases = [
    {
      phase: '0',
      title: 'Event Integrity Gate',
      detail:
        'Pull a small sample across both cohorts. Confirm required fields are populated, move_index is sequential, and missing-field rate stays under 5%.',
    },
    {
      phase: '1',
      title: 'Control Baseline',
      detail:
        'Use Control where SDK runs fully but adjustment is suppressed. Build natural flow-state and skill/frustration distributions.',
    },
    {
      phase: '2',
      title: 'Formula Validity',
      detail:
        'Replay raw signals with production thresholds. Logged flow_state should match recomputed flow_state before trusting impact analysis.',
    },
    {
      phase: '3',
      title: 'Sankey Review',
      detail:
        'Review flow movement across individual levels. Healthy means dominant Flow to Flow, recovery after spikes, and little chaotic oscillation.',
    },
    {
      phase: '4',
      title: 'Treatment Impact',
      detail:
        'Compare Treatment vs Control by rule, variant_delta, skill bracket, and high-frustration cohorts. Do this only after Control Sankey is healthy.',
    },
    {
      phase: '5',
      title: 'Lock Or Iterate',
      detail:
        'At week 4, combine Sankey health with D1/D7/D14 deltas and rule attribution. Lock, hold, or roll back Treatment.',
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ListChecks className="h-5 w-5 text-primary" />
          Analysis Flow
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
          Control must be SDK-on with adjustment suppressed. SDK-off Control
          cannot be segmented by flow state or skill score.
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {phases.map((p) => (
            <div key={p.phase} className="rounded-lg border p-4">
              <div className="mb-2 flex items-center gap-2">
                <Badge variant="secondary" className="font-mono">
                  Phase {p.phase}
                </Badge>
                <p className="font-medium">{p.title}</p>
              </div>
              <p className="text-sm text-muted-foreground">{p.detail}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function GuideCard({
  title,
  icon,
  wide = false,
  children,
}: {
  title: string;
  icon: 'raw' | 'dda' | 'warn';
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card className={wide ? 'lg:col-span-2' : undefined}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookOpen
            className={
              icon === 'warn'
                ? 'h-5 w-5 text-amber-500'
                : 'h-5 w-5 text-primary'
            }
          />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        {children}
      </CardContent>
    </Card>
  );
}

function LogicTable({ rows }: { rows: Array<[string, string]> }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label} className="border-b last:border-0">
              <td className="w-36 px-3 py-2 font-medium text-foreground">
                {label}
              </td>
              <td className="px-3 py-2 font-mono text-xs">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CodeList({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <Badge key={item} variant="secondary" className="font-mono text-[10px]">
          {item}
        </Badge>
      ))}
    </div>
  );
}
