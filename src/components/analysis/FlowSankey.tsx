'use client';

import { useMemo, useState } from 'react';
import { Waves } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FlowStateBadge } from './badges';
import type { PipelineRunWithReports } from '@/lib/cadence/pipeline';
import type { FlowState } from '@/lib/cadence/types';

interface FlowSankeyProps {
  run: PipelineRunWithReports | null;
}

const STATES: FlowState[] = ['flow', 'boredom', 'anxiety', 'frustration', 'unknown'];

const STATE_COLOR: Record<FlowState, string> = {
  flow: '#22c55e',
  boredom: '#94a3b8',
  anxiety: '#f59e0b',
  frustration: '#ef4444',
  unknown: '#64748b',
};

interface LevelColumn {
  level: number;
  counts: Record<FlowState, number>;
  total: number;
}

interface Transition {
  fromLevel: number;
  toLevel: number;
  counts: Record<FlowState, Record<FlowState, number>>;
}

function parseLevel(levelId: string): number | null {
  const m = /(\d+)/.exec(levelId);
  return m ? Number(m[1]) : null;
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
  maxLevels: number
): { levels: LevelColumn[]; transitions: Transition[]; totalLevels: number } {
  if (!run) return { levels: [], transitions: [], totalLevels: 0 };

  const userLevelState = new Map<string, Map<number, FlowState>>();
  for (const r of run.perSession) {
    const ln = parseLevel(r.levelId);
    if (ln == null) continue;
    const state = r.finalFlowReading?.state ?? r.summary.finalFlowState;
    if (!userLevelState.has(r.userId)) userLevelState.set(r.userId, new Map());
    userLevelState.get(r.userId)!.set(ln, state);
  }

  const allLevels = new Set<number>();
  for (const m of userLevelState.values()) {
    for (const ln of m.keys()) allLevels.add(ln);
  }
  const sorted = [...allLevels].sort((a, b) => a - b);
  const active = sorted.slice(0, maxLevels);
  if (active.length < 2) {
    return { levels: [], transitions: [], totalLevels: sorted.length };
  }

  const colIndex = new Map(active.map((ln, i) => [ln, i]));
  const columns: LevelColumn[] = active.map((ln) => ({
    level: ln,
    counts: emptyCounts(),
    total: 0,
  }));
  const transitions: Transition[] = [];
  for (let i = 0; i < active.length - 1; i++) {
    transitions.push({
      fromLevel: active[i],
      toLevel: active[i + 1],
      counts: emptyMatrix(),
    });
  }

  for (const m of userLevelState.values()) {
    for (const [ln, state] of m) {
      const idx = colIndex.get(ln);
      if (idx == null) continue;
      columns[idx].counts[state] += 1;
      columns[idx].total += 1;
    }
    for (let i = 0; i < active.length - 1; i++) {
      const fromState = m.get(active[i]);
      const toState = m.get(active[i + 1]);
      if (fromState && toState) {
        transitions[i].counts[fromState][toState] += 1;
      }
    }
  }

  return { levels: columns, transitions, totalLevels: sorted.length };
}

export function FlowSankey({ run }: FlowSankeyProps) {
  const [maxLevels, setMaxLevels] = useState(20);
  const { levels, transitions, totalLevels } = useMemo(
    () => buildSankey(run, maxLevels),
    [run, maxLevels]
  );

  if (!run || levels.length < 2) return null;

  const colW = 18;
  const gap = 80;
  const chartH = 360;
  const padTop = 12;
  const padBottom = 32;
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
    return { x, yTop, height: h, slices, total: col.total, level: col.level };
  });

  const bands: Array<{
    path: string;
    color: string;
    fromState: FlowState;
    toState: FlowState;
    count: number;
    fromLevel: number;
    toLevel: number;
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

        const cx1 = xL + (xR - xL) * 0.5;
        const cx2 = xL + (xR - xL) * 0.5;
        const path = [
          `M ${xL} ${y1}`,
          `C ${cx1} ${y1}, ${cx2} ${y2}, ${xR} ${y2}`,
          `L ${xR} ${y2 + bhR}`,
          `C ${cx2} ${y2 + bhR}, ${cx1} ${y1 + bhL}, ${xL} ${y1 + bhL}`,
          'Z',
        ].join(' ');

        bands.push({
          path,
          color: STATE_COLOR[from],
          fromState: from,
          toState: to,
          count,
          fromLevel: t.fromLevel,
          toLevel: t.toLevel,
        });
      }
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Waves className="h-5 w-5 text-primary" />
          Flow Across Levels
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Levels shown:</span>
            <input
              type="range"
              min={2}
              max={Math.min(60, totalLevels)}
              value={Math.min(maxLevels, totalLevels)}
              onChange={(e) => setMaxLevels(Number(e.target.value))}
              className="h-1 w-40 accent-primary"
            />
            <span className="w-20 font-mono">
              {levels.length} / {totalLevels}
            </span>
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
                    L{b.fromLevel} {b.fromState} → L{b.toLevel} {b.toState}:{' '}
                    {b.count} user{b.count === 1 ? '' : 's'}
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
                      L{col.level} {s.state}: {s.count} user
                      {s.count === 1 ? '' : 's'}
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
                  y={padTop + chartH + 16}
                  textAnchor="middle"
                  className="fill-muted-foreground"
                  fontSize={11}
                  fontFamily="ui-monospace, monospace"
                >
                  L{col.level}
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
                  {col.total}
                </text>
              ))}
            </g>
          </svg>
        </div>

        <p className="text-[11px] text-muted-foreground">
          Each column is a level on the x-axis. Column height and the number
          above it reflect users who reached that level. Bands connect the
          same user&rsquo;s flow state at Level N to Level N+1 — colour =
          starting state. Hover for counts.
        </p>
      </CardContent>
    </Card>
  );
}
