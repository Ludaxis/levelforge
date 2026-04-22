'use client';

import { useMemo, useState } from 'react';
import { Waves } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FlowStateBadge } from './badges';
import type { PipelineRunWithReports, PerSessionReport } from '@/lib/cadence/pipeline';
import type { FlowState } from '@/lib/cadence/types';

interface FlowSankeyProps {
  run: PipelineRunWithReports | null;
}

type CountMode = 'users' | 'sessions';
type DisplayMode = 'count' | 'percent';
type AttemptFilter = 'first' | 'all';

const STATES: FlowState[] = ['flow', 'boredom', 'anxiety', 'frustration', 'unknown'];

const STATE_COLOR: Record<FlowState, string> = {
  flow: '#22c55e',
  boredom: '#94a3b8',
  anxiety: '#f59e0b',
  frustration: '#ef4444',
  unknown: '#64748b',
};

interface LevelColumn {
  levelId: string;
  counts: Record<FlowState, number>;
  total: number;
}

interface Transition {
  fromLevelId: string;
  toLevelId: string;
  counts: Record<FlowState, Record<FlowState, number>>;
}

interface SankeyOptions {
  maxLevels: number;
  countMode: CountMode;
  attemptFilter: AttemptFilter;
  excludeReplay: boolean;
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

function emptyMatrix(): Record<FlowState, Record<FlowState, number>> {
  const m = {} as Record<FlowState, Record<FlowState, number>>;
  for (const a of STATES) {
    m[a] = emptyCounts();
  }
  return m;
}

function buildSankey(
  run: PipelineRunWithReports | null,
  options: SankeyOptions
): { levels: LevelColumn[]; transitions: Transition[]; totalLevels: number } {
  if (!run) return { levels: [], transitions: [], totalLevels: 0 };

  const reports = run.perSession
    .filter((r) => (options.attemptFilter === 'first' ? r.attempt === 1 : true))
    .filter((r) => (options.excludeReplay ? r.playType !== 'replay' : true))
    .sort((a, b) => a.startedAtUtc - b.startedAtUtc);

  const sortedLevels = Array.from(new Set(reports.map((r) => r.levelId))).sort(
    compareLevelIds
  );
  const active = sortedLevels.slice(0, options.maxLevels);
  if (active.length < 2) {
    return { levels: [], transitions: [], totalLevels: sortedLevels.length };
  }

  const colIndex = new Map(active.map((levelId, i) => [levelId, i]));
  const columns: LevelColumn[] = active.map((levelId) => ({
    levelId,
    counts: emptyCounts(),
    total: 0,
  }));
  const transitions: Transition[] = [];
  for (let i = 0; i < active.length - 1; i++) {
    transitions.push({
      fromLevelId: active[i],
      toLevelId: active[i + 1],
      counts: emptyMatrix(),
    });
  }

  if (options.countMode === 'users') {
    buildUserCounts(reports, active, colIndex, columns, transitions);
  } else {
    buildSessionCounts(reports, active, colIndex, columns, transitions);
  }

  return { levels: columns, transitions, totalLevels: sortedLevels.length };
}

function buildUserCounts(
  reports: PerSessionReport[],
  active: string[],
  colIndex: Map<string, number>,
  columns: LevelColumn[],
  transitions: Transition[]
) {
  const byUser = new Map<string, Map<string, PerSessionReport>>();
  for (const r of reports) {
    if (!byUser.has(r.userId)) byUser.set(r.userId, new Map());
    byUser.get(r.userId)!.set(r.levelId, r);
  }

  for (const levelMap of byUser.values()) {
    for (const [levelId, report] of levelMap) {
      const idx = colIndex.get(levelId);
      if (idx == null) continue;
      const state = stateFor(report);
      columns[idx].counts[state] += 1;
      columns[idx].total += 1;
    }
    for (let i = 0; i < active.length - 1; i++) {
      const from = levelMap.get(active[i]);
      const to = levelMap.get(active[i + 1]);
      if (!from || !to) continue;
      transitions[i].counts[stateFor(from)][stateFor(to)] += 1;
    }
  }
}

function buildSessionCounts(
  reports: PerSessionReport[],
  active: string[],
  colIndex: Map<string, number>,
  columns: LevelColumn[],
  transitions: Transition[]
) {
  for (const r of reports) {
    const idx = colIndex.get(r.levelId);
    if (idx == null) continue;
    const state = stateFor(r);
    columns[idx].counts[state] += 1;
    columns[idx].total += 1;
  }

  const byUser = new Map<string, PerSessionReport[]>();
  for (const r of reports) {
    if (!byUser.has(r.userId)) byUser.set(r.userId, []);
    byUser.get(r.userId)!.push(r);
  }
  for (const userReports of byUser.values()) {
    userReports.sort((a, b) => a.startedAtUtc - b.startedAtUtc);
    for (let i = 0; i < userReports.length - 1; i++) {
      const from = userReports[i];
      const to = userReports[i + 1];
      const idx = active.indexOf(from.levelId);
      if (idx < 0 || active[idx + 1] !== to.levelId) continue;
      transitions[idx].counts[stateFor(from)][stateFor(to)] += 1;
    }
  }
}

function stateFor(report: PerSessionReport): FlowState {
  return report.finalFlowReading?.state ?? report.summary.finalFlowState;
}

export function FlowSankey({ run }: FlowSankeyProps) {
  const [maxLevels, setMaxLevels] = useState(20);
  const [countMode, setCountMode] = useState<CountMode>('users');
  const [displayMode, setDisplayMode] = useState<DisplayMode>('count');
  const [attemptFilter, setAttemptFilter] = useState<AttemptFilter>('first');
  const [excludeReplay, setExcludeReplay] = useState(true);
  const { levels, transitions, totalLevels } = useMemo(
    () =>
      buildSankey(run, {
        maxLevels,
        countMode,
        attemptFilter,
        excludeReplay,
      }),
    [run, maxLevels, countMode, attemptFilter, excludeReplay]
  );

  if (!run) return null;

  if (levels.length < 2) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Waves className="h-5 w-5 text-primary" />
            Baseline Signal Sankey
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Not enough consecutive levels to draw a baseline Sankey.
        </CardContent>
      </Card>
    );
  }

  const colW = 18;
  const gap = 112;
  const chartH = 360;
  const padTop = 16;
  const padBottom = 64;
  const padLeft = 24;
  const svgH = padTop + chartH + padBottom;
  const svgW = padLeft * 2 + levels.length * colW + (levels.length - 1) * gap;
  const maxTotal = Math.max(1, ...levels.map((c) => c.total));

  const colLayout = levels.map((col, i) => {
    const x = padLeft + i * (colW + gap);
    const h = (col.total / maxTotal) * chartH;
    const yTop = padTop + (chartH - h);
    const slices: Array<{
      state: FlowState;
      yTop: number;
      height: number;
      count: number;
    }> = [];
    let acc = yTop;
    for (const s of STATES) {
      const c = col.counts[s];
      if (c === 0) continue;
      const sh = (c / col.total) * h;
      slices.push({ state: s, yTop: acc, height: sh, count: c });
      acc += sh;
    }
    return { x, yTop, height: h, slices, total: col.total, levelId: col.levelId };
  });

  const bands: Array<{
    path: string;
    color: string;
    fromState: FlowState;
    toState: FlowState;
    count: number;
    fromLevelId: string;
    toLevelId: string;
    percent: number;
  }> = [];

  for (let i = 0; i < transitions.length; i++) {
    const t = transitions[i];
    const left = colLayout[i];
    const right = colLayout[i + 1];
    const xL = left.x + colW;
    const xR = right.x;
    const outOffset: Record<FlowState, number> = emptyCounts();
    const inOffset: Record<FlowState, number> = emptyCounts();

    for (const from of STATES) {
      const leftSlice = left.slices.find((s) => s.state === from);
      if (!leftSlice) continue;
      for (const to of STATES) {
        const count = t.counts[from][to];
        if (count === 0) continue;
        const rightSlice = right.slices.find((s) => s.state === to);
        if (!rightSlice) continue;

        const bhL = (count / left.total) * left.height;
        const bhR = (count / right.total) * right.height;
        const y1 = leftSlice.yTop + outOffset[from];
        const y2 = rightSlice.yTop + inOffset[to];
        outOffset[from] += bhL;
        inOffset[to] += bhR;

        const cx = xL + (xR - xL) * 0.5;
        const path = [
          `M ${xL} ${y1}`,
          `C ${cx} ${y1}, ${cx} ${y2}, ${xR} ${y2}`,
          `L ${xR} ${y2 + bhR}`,
          `C ${cx} ${y2 + bhR}, ${cx} ${y1 + bhL}, ${xL} ${y1 + bhL}`,
          'Z',
        ].join(' ');

        bands.push({
          path,
          color: STATE_COLOR[from],
          fromState: from,
          toState: to,
          count,
          fromLevelId: t.fromLevelId,
          toLevelId: t.toLevelId,
          percent: left.total > 0 ? count / left.total : 0,
        });
      }
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Waves className="h-5 w-5 text-primary" />
          Baseline Signal Sankey
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
          This validates raw signal classification only. It does not prove DDA
          impact unless the DDA output fields exist.
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <ControlGroup
            label="Count"
            value={countMode}
            onChange={(v) => setCountMode(v as CountMode)}
            options={[
              ['users', 'Users'],
              ['sessions', 'Sessions'],
            ]}
          />
          <ControlGroup
            label="Display"
            value={displayMode}
            onChange={(v) => setDisplayMode(v as DisplayMode)}
            options={[
              ['count', 'Count'],
              ['percent', '%'],
            ]}
          />
          <ControlGroup
            label="Attempts"
            value={attemptFilter}
            onChange={(v) => setAttemptFilter(v as AttemptFilter)}
            options={[
              ['first', 'Attempt 1'],
              ['all', 'All'],
            ]}
          />
          <label className="flex items-center gap-2 rounded-md border px-2 py-1 text-xs">
            <input
              type="checkbox"
              checked={excludeReplay}
              onChange={(e) => setExcludeReplay(e.target.checked)}
              className="accent-primary"
            />
            Exclude replay
          </label>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Levels shown:</span>
            <input
              type="range"
              min={2}
              max={Math.min(60, totalLevels)}
              value={Math.min(maxLevels, totalLevels)}
              onChange={(e) => setMaxLevels(Number(e.target.value))}
              className="h-1 w-32 accent-primary"
            />
            <span className="w-16 font-mono">
              {levels.length} / {totalLevels}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {STATES.map((s) => (
            <div key={s} className="flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: STATE_COLOR[s] }}
              />
              <FlowStateBadge state={s} />
            </div>
          ))}
        </div>

        <div className="overflow-x-auto">
          <svg
            width={svgW}
            height={svgH}
            viewBox={`0 0 ${svgW} ${svgH}`}
            className="block"
          >
            <g>
              {bands.map((b, i) => (
                <path
                  key={i}
                  d={b.path}
                  fill={b.color}
                  fillOpacity={0.22}
                  stroke="none"
                >
                  <title>
                    {b.fromLevelId} {b.fromState} → {b.toLevelId} {b.toState}:{' '}
                    {displayValue(b.count, b.percent, displayMode)}
                  </title>
                </path>
              ))}
            </g>
            <g>
              {colLayout.map((col, i) =>
                col.slices.map((s, j) => (
                  <rect
                    key={`${i}-${j}`}
                    x={col.x}
                    y={s.yTop}
                    width={colW}
                    height={s.height}
                    fill={STATE_COLOR[s.state]}
                    fillOpacity={0.85}
                  >
                    <title>
                      {col.levelId} {s.state}:{' '}
                      {displayValue(s.count, s.count / col.total, displayMode)}
                    </title>
                  </rect>
                ))
              )}
            </g>
            <g>
              {colLayout.map((col, i) => (
                <text
                  key={i}
                  x={col.x + colW / 2}
                  y={padTop + chartH + 18}
                  textAnchor="start"
                  transform={`rotate(35 ${col.x + colW / 2} ${padTop + chartH + 18})`}
                  className="fill-muted-foreground"
                  fontSize={10}
                  fontFamily="ui-monospace, monospace"
                >
                  {col.levelId}
                </text>
              ))}
              {colLayout.map((col, i) => (
                <text
                  key={`n-${i}`}
                  x={col.x + colW / 2}
                  y={col.yTop - 4}
                  textAnchor="middle"
                  className="fill-muted-foreground"
                  fontSize={10}
                  fontFamily="ui-monospace, monospace"
                >
                  {displayValue(col.total, 1, displayMode)}
                </text>
              ))}
            </g>
          </svg>
        </div>

        <p className="text-[11px] text-muted-foreground">
          X-axis uses full level_id. Bands connect the same user/session from
          one individual level to the next selected level; colour = starting
          state. Hover for counts.
        </p>
      </CardContent>
    </Card>
  );
}

function ControlGroup({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-md border p-1">
      <span className="px-1 text-[11px] text-muted-foreground">{label}</span>
      {options.map(([key, text]) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={`rounded px-2 py-1 text-xs ${
            value === key ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
          }`}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

function displayValue(count: number, percent: number, mode: DisplayMode): string {
  if (mode === 'percent') return `${(percent * 100).toFixed(0)}%`;
  return count.toLocaleString();
}

function compareLevelIds(a: string, b: string): number {
  const an = levelNumber(a);
  const bn = levelNumber(b);
  if (an !== bn) return an - bn;
  return a.localeCompare(b);
}

function levelNumber(levelId: string): number {
  const m = /(\d+)/.exec(levelId);
  return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
}
