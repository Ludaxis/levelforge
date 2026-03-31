'use client';

import React, { useState, useCallback, useRef, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Upload, Play, Download, ChevronDown, ChevronRight, ArrowUp, ArrowDown,
  Layers, Route, Gamepad2, ScrollText, BarChart3, RotateCcw, Lightbulb,
  Copy, Trash2, CheckCircle2, XCircle, AlertTriangle,
} from 'lucide-react';
import {
  analyzeBatch,
  analyzeSingleLevel,
  LevelReport,
  BatchReport,
  AnalyzeOptions,
  MoveAnalysis,
  SolverInput,
  SolverItem,
  configToSolverInput,
  studioExportToGameConfig,
  analyzeMoves,
} from '@/lib/solvabilityChecker';
import { StudioExportLevel, COLOR_TYPE_TO_HEX, COLOR_TYPE_TO_NAME } from '@/lib/juicyBlastExport';

// ============================================================================
// Color Mapping
// ============================================================================

const CM: Record<number, { name: string; hex: string; text: string }> = {
  0: { name: 'Blue', hex: '#4C9EF2', text: '#fff' },
  1: { name: 'Orange', hex: '#F99D00', text: '#fff' },
  2: { name: 'Red', hex: '#DF4624', text: '#fff' },
  3: { name: 'Pink', hex: '#DE4C7E', text: '#fff' },
  4: { name: 'Yellow', hex: '#F3DE00', text: '#000' },
  5: { name: 'Green', hex: '#90CA00', text: '#000' },
  6: { name: 'Purple', hex: '#8E68E0', text: '#fff' },
  7: { name: 'White', hex: '#E8E4DF', text: '#000' },
  8: { name: 'Black', hex: '#4C4343', text: '#fff' },
};

function getColor(ct: number) {
  return CM[ct] || { name: '?', hex: '#666', text: '#fff' };
}

// ============================================================================
// Shared UI helpers
// ============================================================================

function ItemCell({
  item,
  golden,
  step,
  onClick,
  dim,
  highlight,
  hintBadge,
}: {
  item: { ColorType: number; Variant: number; idx: number };
  golden?: boolean;
  step?: number;
  onClick?: () => void;
  dim?: boolean;
  highlight?: boolean;
  hintBadge?: boolean;
}) {
  const c = getColor(item.ColorType);
  return (
    <div
      onClick={onClick}
      className={`
        relative flex flex-col items-center justify-center rounded font-mono text-[10px]
        transition-all duration-150 select-none
        ${onClick ? 'cursor-pointer hover:scale-110 hover:z-10' : ''}
        ${dim ? 'opacity-40' : ''}
        ${highlight ? 'ring-2 ring-green-400' : ''}
        ${golden ? 'ring-2 ring-yellow-400 shadow-[0_0_8px_rgba(255,215,0,0.4)]' : ''}
      `}
      style={{
        width: 44, height: 44,
        backgroundColor: c.hex,
        color: c.text,
      }}
      title={`CT=${item.ColorType} V=${item.Variant} #${item.idx}`}
    >
      <span className="text-[8px] font-medium opacity-70">#{item.idx}</span>
      <span className="text-[10px] font-bold">{c.name.substring(0, 3)}</span>
      <span className="text-[7px] opacity-60">v{item.Variant}</span>
      {step != null && (
        <span className="absolute -top-1.5 -right-1.5 bg-yellow-400 text-black text-[8px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
          {step}
        </span>
      )}
      {hintBadge && (
        <span className="absolute -top-1 -left-1 text-yellow-400 text-xs">★</span>
      )}
    </div>
  );
}

function VerdictBadge({ verdict }: { verdict: LevelReport['verdict'] }) {
  const styles = {
    solvable: 'bg-green-500/20 text-green-400 border-green-500/50',
    risky: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
    stuck: 'bg-red-500/20 text-red-400 border-red-500/50',
  };
  const labels = { solvable: 'Solvable', risky: 'Risky', stuck: 'Stuck' };
  return <Badge variant="outline" className={styles[verdict]}>{labels[verdict]}</Badge>;
}

// ============================================================================
// Simulator State & Logic (self-contained, matches reference tool)
// ============================================================================

interface SimSlot {
  reqIdx: number;
  ct: number;
  items: SolverItem[];
  variantLock: number | null;
}

interface SimState {
  positions: { visible: SolverItem | null; behind: SolverItem | null }[];
  l2q: SolverItem[];
  l2i: number;
  nextReqIdx: number;
  slots: (SimSlot | null)[];
  waitQueue: SolverItem[];
  log: { text: string; type: 'ok' | 'warn' | 'err' }[];
  done: boolean;
  lost: boolean;
  completedReqs: number;
  picks: { step: number; itemIdx: number; ct: number; variant: number; posIdx: number; action: string; queueLen: number; reqsDone: number }[];
}

function createSimState(input: SolverInput, reqs: { ColorType: number }[]): SimState {
  const { L0, L1, L2, maxWait, slotCount } = input;
  const positions = L0.map((it, i) => ({
    visible: { ...it },
    behind: i < L1.length ? { ...L1[i] } : null,
  }));
  const state: SimState = {
    positions,
    l2q: L2.map((it) => ({ ...it })),
    l2i: 0,
    nextReqIdx: 0,
    slots: new Array(slotCount).fill(null),
    waitQueue: [],
    log: [],
    done: false,
    lost: false,
    completedReqs: 0,
    picks: [],
  };
  for (let si = 0; si < slotCount; si++) simLoadSlot(state, si, reqs, maxWait);
  return state;
}

function simLoadSlot(state: SimState, si: number, reqs: { ColorType: number }[], maxWait: number) {
  if (state.nextReqIdx >= reqs.length) {
    state.slots[si] = null;
    if (state.slots.every((s) => s === null) && state.completedReqs >= reqs.length) {
      state.done = true;
      state.log.push({ text: 'Level complete!', type: 'ok' });
    }
    return;
  }
  const ri = state.nextReqIdx++;
  state.slots[si] = { reqIdx: ri, ct: reqs[ri].ColorType, items: [], variantLock: null };
  state.log.push({ text: `Loaded R${ri} (${getColor(reqs[ri].ColorType).name}) → slot ${si + 1}`, type: 'warn' });

  // Auto-fill from queue
  let changed = true;
  while (changed && state.slots[si] && state.slots[si]!.items.length < 3) {
    changed = false;
    for (let wi = 0; wi < state.waitQueue.length; wi++) {
      const w = state.waitQueue[wi];
      const sl = state.slots[si]!;
      if (w.ColorType !== sl.ct) continue;
      if (sl.variantLock !== null && w.Variant !== sl.variantLock) continue;
      state.waitQueue.splice(wi, 1);
      if (sl.items.length === 0) sl.variantLock = w.Variant;
      sl.items.push(w);
      state.log.push({ text: `Auto-filled #${w.idx} from queue → R${sl.reqIdx}`, type: 'ok' });
      changed = true;
      break;
    }
  }
  if (state.slots[si] && state.slots[si]!.items.length >= 3) {
    state.log.push({ text: `R${state.slots[si]!.reqIdx} complete!`, type: 'ok' });
    state.completedReqs++;
    simLoadSlot(state, si, reqs, maxWait);
  }
}

function simPick(state: SimState, posIdx: number, reqs: { ColorType: number }[], maxWait: number): SimState {
  const ns = structuredClone(state);
  if (ns.done || ns.lost) return ns;
  const item = ns.positions[posIdx].visible;
  if (!item) return ns;

  const picked = { ...item };

  // Reveal next
  if (ns.positions[posIdx].behind) {
    ns.positions[posIdx].visible = { ...ns.positions[posIdx].behind! };
    if (ns.l2i < ns.l2q.length) {
      ns.positions[posIdx].behind = { ...ns.l2q[ns.l2i++] };
    } else {
      ns.positions[posIdx].behind = null;
    }
  } else {
    ns.positions[posIdx].visible = null;
  }

  // Place in matching slot
  const matchSlots: number[] = [];
  for (let si = 0; si < ns.slots.length; si++) {
    const sl = ns.slots[si];
    if (!sl || picked.ColorType !== sl.ct) continue;
    if (sl.variantLock !== null && picked.Variant !== sl.variantLock) continue;
    matchSlots.push(si);
  }
  matchSlots.sort((a, b) => (ns.slots[b]?.items.length ?? 0) - (ns.slots[a]?.items.length ?? 0));

  let action = '';
  if (matchSlots.length > 0) {
    const si = matchSlots[0];
    const sl = ns.slots[si]!;
    if (sl.items.length === 0) sl.variantLock = picked.Variant;
    sl.items.push(picked);
    action = `slot ${si + 1} → R${sl.reqIdx}`;
    ns.log.push({ text: `#${picked.idx} (${getColor(picked.ColorType).name} v${picked.Variant}) → R${sl.reqIdx}`, type: 'ok' });
    if (sl.items.length >= 3) {
      ns.log.push({ text: `R${sl.reqIdx} complete!`, type: 'ok' });
      ns.completedReqs++;
      simLoadSlot(ns, si, reqs, maxWait);
    }
  } else {
    ns.waitQueue.push(picked);
    action = 'queue';
    ns.log.push({ text: `#${picked.idx} → queue [${ns.waitQueue.length}/${maxWait}]`, type: 'warn' });
    if (ns.waitQueue.length >= maxWait) {
      ns.lost = true;
      ns.log.push({ text: 'Game over!', type: 'err' });
    }
  }

  ns.picks.push({
    step: ns.picks.length + 1,
    itemIdx: picked.idx,
    ct: picked.ColorType,
    variant: picked.Variant,
    posIdx,
    action,
    queueLen: ns.waitQueue.length,
    reqsDone: ns.completedReqs,
  });

  return ns;
}

// ============================================================================
// Hint solver (mini DFS from current state)
// ============================================================================

function computeHint(state: SimState, reqs: { ColorType: number }[], maxWait: number): number {
  interface HintSlot { ct: number; items: number; vl: number | null }
  interface HintState {
    pos: { vis: SolverItem | null; beh: SolverItem | null }[];
    l2i: number; nri: number;
    slots: (HintSlot | null)[];
    wq: SolverItem[];
    cr: number; picks: number[];
  }

  const l2q = state.l2q;
  const totalReqs = reqs.length;

  function snap(): HintState {
    return {
      pos: state.positions.map((p) => ({
        vis: p.visible ? { ...p.visible } : null,
        beh: p.behind ? { ...p.behind } : null,
      })),
      l2i: state.l2i, nri: state.nextReqIdx,
      slots: state.slots.map((sl) => sl ? { ct: sl.ct, items: sl.items.length, vl: sl.variantLock } : null),
      wq: [...state.waitQueue],
      cr: state.completedReqs, picks: [],
    };
  }

  function clone(s: HintState): HintState {
    return {
      pos: s.pos.map((p) => ({ vis: p.vis ? { ...p.vis } : null, beh: p.beh ? { ...p.beh } : null })),
      l2i: s.l2i, nri: s.nri,
      slots: s.slots.map((sl) => sl ? { ...sl } : null),
      wq: s.wq.map((w) => ({ ...w })),
      cr: s.cr, picks: [...s.picks],
    };
  }

  function hLoadSlot(s: HintState, si: number) {
    if (s.nri >= totalReqs) { s.slots[si] = null; return; }
    const ri = s.nri++;
    s.slots[si] = { ct: reqs[ri].ColorType, items: 0, vl: null };
    let ch = true;
    while (ch && s.slots[si] && s.slots[si]!.items < 3) {
      ch = false;
      for (let wi = 0; wi < s.wq.length; wi++) {
        const w = s.wq[wi];
        const sl = s.slots[si]!;
        if (w.ColorType !== sl.ct) continue;
        if (sl.vl !== null && w.Variant !== sl.vl) continue;
        s.wq.splice(wi, 1);
        if (sl.items === 0) sl.vl = w.Variant;
        sl.items++;
        ch = true; break;
      }
    }
    if (s.slots[si] && s.slots[si]!.items >= 3) { s.cr++; hLoadSlot(s, si); }
  }

  const result: { solution: number[] | null } = { solution: null };
  let explored = 0;
  const MAX_HINT_EXPLORE = 500000;

  function dfs(s: HintState) {
    if (explored++ > MAX_HINT_EXPLORE || result.solution) return;
    if (s.cr >= totalReqs) { result.solution = [...s.picks]; return; }
    const avail: number[] = [];
    for (let i = 0; i < s.pos.length; i++) if (s.pos[i].vis) avail.push(i);
    if (!avail.length) return;

    const seen = new Set<string>();
    const deduped: number[] = [];
    for (const pi of avail) {
      const v = s.pos[pi].vis!; const b = s.pos[pi].beh;
      const k = `${v.ColorType}_${v.Variant}_${b ? `${b.ColorType}_${b.Variant}` : 'x'}`;
      if (!seen.has(k)) { seen.add(k); deduped.push(pi); }
    }

    deduped.sort((a, b) => {
      let sA = 0, sB = 0;
      for (const sl of s.slots) {
        if (!sl) continue;
        const ia = s.pos[a].vis!, ib = s.pos[b].vis!;
        if (ia.ColorType === sl.ct && (sl.vl === null || ia.Variant === sl.vl)) sA = 3;
        if (ib.ColorType === sl.ct && (sl.vl === null || ib.Variant === sl.vl)) sB = 3;
      }
      if (sA < 3) { const beh = s.pos[a].beh; if (beh) for (const sl of s.slots) { if (sl && beh.ColorType === sl.ct && (sl.vl === null || beh.Variant === sl.vl)) { sA = 2; break; } } }
      if (sB < 3) { const beh = s.pos[b].beh; if (beh) for (const sl of s.slots) { if (sl && beh.ColorType === sl.ct && (sl.vl === null || beh.Variant === sl.vl)) { sB = 2; break; } } }
      return sB - sA;
    });

    for (const pi of deduped) {
      if (result.solution) return;
      const item = s.pos[pi].vis!;
      const ms: number[] = [];
      for (let si = 0; si < s.slots.length; si++) {
        const sl = s.slots[si]; if (!sl || item.ColorType !== sl.ct) continue;
        if (sl.vl !== null && item.Variant !== sl.vl) continue; ms.push(si);
      }
      ms.sort((a, b) => (s.slots[b]?.items ?? 0) - (s.slots[a]?.items ?? 0));
      const targets: number[] = [];
      if (ms.length > 0) targets.push(...ms);
      if (s.wq.length < maxWait - 1) {
        if (ms.length === 0) targets.push(-1);
        else {
          const beh = s.pos[pi].beh;
          if (beh) { const bm = s.slots.some((sl) => sl && beh.ColorType === sl.ct && (sl.vl === null || beh.Variant === sl.vl)); if (bm) targets.push(-1); }
        }
      } else if (ms.length === 0 && s.wq.length < maxWait) targets.push(-1);

      for (const tgt of targets) {
        if (result.solution) return;
        const ns = clone(s);
        const p = { ...ns.pos[pi].vis! };
        if (ns.pos[pi].beh) { ns.pos[pi].vis = { ...ns.pos[pi].beh! }; ns.pos[pi].beh = ns.l2i < l2q.length ? { ...l2q[ns.l2i++] } : null; } else { ns.pos[pi].vis = null; }
        if (tgt >= 0) {
          const sl = ns.slots[tgt]!;
          if (sl.items === 0) sl.vl = p.Variant;
          sl.items++;
          if (sl.items >= 3) { ns.cr++; hLoadSlot(ns, tgt); }
        } else { ns.wq.push(p); if (ns.wq.length >= maxWait) continue; }
        ns.picks.push(pi);
        dfs(ns);
      }
    }
  }

  dfs(snap());
  if (result.solution && result.solution.length > 0) {
    const firstPos = result.solution[0];
    const item = state.positions[firstPos]?.visible;
    return item ? item.idx : -1;
  }
  return -1;
}

// ============================================================================
// Sort helpers
// ============================================================================

type SortKey = 'levelId' | 'totalItems' | 'blockingOffset' | 'greedy' | 'winRate' | 'verdict';
type SortDir = 'asc' | 'desc';

function extractLevelNum(id: string): number {
  const m = id.match(/Level(\d+)/i);
  return m ? parseInt(m[1], 10) : 0;
}

function sortLevels(levels: LevelReport[], key: SortKey, dir: SortDir): LevelReport[] {
  const sorted = [...levels];
  sorted.sort((a, b) => {
    let cmp = 0;
    switch (key) {
      case 'levelId': cmp = extractLevelNum(a.levelId) - extractLevelNum(b.levelId); break;
      case 'totalItems': cmp = a.totalItems - b.totalItems; break;
      case 'blockingOffset': cmp = a.blockingOffset - b.blockingOffset; break;
      case 'greedy': cmp = (a.greedy.solved ? 1 : 0) - (b.greedy.solved ? 1 : 0); break;
      case 'winRate': cmp = a.monteCarlo.winRate - b.monteCarlo.winRate; break;
      case 'verdict': {
        const order = { solvable: 0, risky: 1, stuck: 2 };
        cmp = order[a.verdict] - order[b.verdict]; break;
      }
    }
    return dir === 'asc' ? cmp : -cmp;
  });
  return sorted;
}

// ============================================================================
// Difficulty adjustment
// ============================================================================

function applyDifficultyDeltas(
  originals: StudioExportLevel[],
  deltas: Map<string, number>,
): StudioExportLevel[] {
  if (deltas.size === 0) return originals;
  return originals.map((level) => {
    const delta = deltas.get(level.LevelId || '') ?? 0;
    if (delta === 0) return level;
    const curBlocking = typeof level.BlockingOffset === 'number' ? level.BlockingOffset : 0;
    const newBlocking = Math.max(0, Math.min(10, curBlocking + delta));
    const curMax = level.MaxSelectableItems || 12;
    const newMax = Math.max(8, Math.min(20, curMax - delta));

    let items = level.SelectableItems;
    if (delta < 0) {
      const absDelta = Math.abs(delta);
      if (absDelta >= 3) {
        items = items.map((item) => ({ ...item, Variant: 0 }));
      } else {
        const mergeThreshold = absDelta * 3;
        const ctVariantCounts = new Map<number, Map<number, number>>();
        for (const item of items) {
          if (!ctVariantCounts.has(item.ColorType)) ctVariantCounts.set(item.ColorType, new Map());
          const vc = ctVariantCounts.get(item.ColorType)!;
          vc.set(item.Variant, (vc.get(item.Variant) || 0) + 1);
        }
        const variantRemap = new Map<string, number>();
        ctVariantCounts.forEach((variants, ct) => {
          if (variants.size <= 1) return;
          let maxV = 0, maxCount = 0;
          variants.forEach((count, v) => { if (count > maxCount) { maxCount = count; maxV = v; } });
          variants.forEach((count, v) => { if (v !== maxV && count <= mergeThreshold) variantRemap.set(`${ct}:${v}`, maxV); });
        });
        if (variantRemap.size > 0) {
          items = items.map((item) => {
            const newV = variantRemap.get(`${item.ColorType}:${item.Variant}`);
            return newV !== undefined ? { ...item, Variant: newV } : item;
          });
        }
      }
    }
    return { ...level, BlockingOffset: newBlocking, MismatchDepth: newBlocking / 10, MaxSelectableItems: newMax, SelectableItems: items };
  });
}

// ============================================================================
// LAYERS TAB
// ============================================================================

function LayersPanel({ level, report, solverInput }: { level: StudioExportLevel; report: LevelReport | null; solverInput: SolverInput }) {
  const { L0, L1, L2, reqs } = solverInput;
  const goldenSet = new Set(report?.solutionPath ?? []);
  const goldenOrder = new Map<number, number>();
  (report?.solutionPath ?? []).forEach((idx, i) => goldenOrder.set(idx, i + 1));

  // Color legend
  const usedColors = new Set<number>();
  [...L0, ...L1, ...L2].forEach((it) => usedColors.add(it.ColorType));
  reqs.forEach((r) => usedColors.add(r.ColorType));

  return (
    <div className="space-y-4">
      {/* Status */}
      {report && (
        <div className={`p-3 rounded-lg border ${report.verdict === 'solvable' ? 'border-green-500/50 bg-green-500/10' : report.verdict === 'risky' ? 'border-yellow-500/50 bg-yellow-500/10' : 'border-red-500/50 bg-red-500/10'}`}>
          <div className="flex items-center gap-2 text-sm font-mono">
            {report.verdict === 'solvable' ? <CheckCircle2 className="h-4 w-4 text-green-400" /> : report.verdict === 'risky' ? <AlertTriangle className="h-4 w-4 text-yellow-400" /> : <XCircle className="h-4 w-4 text-red-400" />}
            <span className="font-bold">{report.levelId}</span>
            <span className="text-muted-foreground">
              {report.verdict === 'solvable'
                ? `solvable — ${report.solutionPath?.length ?? '?'} picks`
                : report.verdict === 'risky'
                  ? `risky — MC ${(report.monteCarlo.winRate * 100).toFixed(0)}% win rate`
                  : 'stuck'}
            </span>
            {report.moveAnalysis && (
              <span className="text-muted-foreground ml-auto">
                {report.moveAnalysis.directMoves} direct + {report.moveAnalysis.queueMoves} queue
              </span>
            )}
          </div>
        </div>
      )}

      {/* Color legend */}
      <div className="flex flex-wrap gap-1.5">
        {[...usedColors].sort().map((ct) => {
          const c = getColor(ct);
          return (
            <span key={ct} className="flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 bg-muted/50 rounded-full">
              <span className="w-3 h-3 rounded-full border border-white/10" style={{ backgroundColor: c.hex }} />
              {c.name}
            </span>
          );
        })}
      </div>

      {/* Stats */}
      <div className="flex gap-3 flex-wrap text-xs font-mono text-muted-foreground">
        <span>Reqs: {reqs.length}</span>
        <span>Items: {L0.length + L1.length + L2.length}</span>
        <span>Needed: {reqs.length * 3}</span>
        <span>L0: {L0.length} / L1: {L1.length} / L2: {L2.length}</span>
      </div>

      {/* Requirements */}
      <div>
        <h4 className="text-[11px] font-mono font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Requirements <Badge variant="secondary" className="text-[9px] ml-1">{reqs.length}</Badge>
        </h4>
        <div className="flex flex-wrap gap-1">
          {reqs.map((r, i) => {
            const c = getColor(r.ColorType);
            return (
              <div key={i} className="flex items-center justify-center rounded text-[9px] font-mono font-bold" style={{ width: 32, height: 24, backgroundColor: c.hex, color: c.text }}>
                R{i}
              </div>
            );
          })}
        </div>
      </div>

      {/* Layer 0 (Surface) */}
      <div>
        <h4 className="text-[11px] font-mono font-semibold text-muted-foreground uppercase tracking-wider mb-2">Layer 0 — Surface</h4>
        <div className="flex flex-wrap gap-1.5">
          {L0.map((it) => (
            <ItemCell key={it.idx} item={it} golden={goldenSet.has(it.idx)} step={goldenOrder.get(it.idx)} />
          ))}
        </div>
      </div>

      {/* Arrow */}
      <div className="flex items-center gap-2 text-muted-foreground text-xs font-mono">
        <ChevronDown className="h-3 w-3" /> Behind
      </div>

      {/* Layer 1 */}
      <div>
        <h4 className="text-[11px] font-mono font-semibold text-muted-foreground uppercase tracking-wider mb-2">Layer 1 — Behind</h4>
        <div className="flex flex-wrap gap-1.5">
          {L1.map((it) => (
            <ItemCell key={it.idx} item={it} golden={goldenSet.has(it.idx)} step={goldenOrder.get(it.idx)} dim />
          ))}
        </div>
      </div>

      {/* Arrow */}
      <div className="flex items-center gap-2 text-muted-foreground text-xs font-mono">
        <ChevronDown className="h-3 w-3" /> Queue
      </div>

      {/* Layer 2 */}
      <div>
        <h4 className="text-[11px] font-mono font-semibold text-muted-foreground uppercase tracking-wider mb-2">Layer 2 — Queue <Badge variant="secondary" className="text-[9px] ml-1">{L2.length}</Badge></h4>
        <div className="flex flex-wrap gap-1">
          {L2.map((it, i) => (
            <div key={it.idx} className="flex flex-col items-center">
              <ItemCell item={it} golden={goldenSet.has(it.idx)} step={goldenOrder.get(it.idx)} dim />
              <span className="text-[7px] text-muted-foreground font-mono">{i}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// SOLUTION TAB
// ============================================================================

function SolutionPanel({ report }: { report: LevelReport | null }) {
  if (!report) return <p className="text-sm text-muted-foreground">Run analysis first</p>;

  return (
    <div className="space-y-4">
      <div className={`p-3 rounded-lg border ${report.solutionPath ? 'border-green-500/50 bg-green-500/10' : 'border-red-500/50 bg-red-500/10'}`}>
        <div className="flex items-center gap-2 text-sm font-mono">
          {report.solutionPath ? <CheckCircle2 className="h-4 w-4 text-green-400" /> : <XCircle className="h-4 w-4 text-red-400" />}
          {report.solutionPath
            ? `Solution: ${report.solutionPath.length} picks`
            : `Solver stuck`}
        </div>
      </div>

      {report.moveAnalysis && (
        <div className="flex gap-4 text-xs font-mono">
          <span>Total: {report.moveAnalysis.totalMoves}</span>
          <span className="text-green-400">Direct: {report.moveAnalysis.directMoves}</span>
          <span className={report.moveAnalysis.queueMoves > 3 ? 'text-red-400' : report.moveAnalysis.queueMoves > 0 ? 'text-yellow-400' : 'text-green-400'}>
            Queue: {report.moveAnalysis.queueMoves}
          </span>
        </div>
      )}

      {report.solutionPath && (
        <div className="flex flex-wrap gap-1">
          {report.solutionPath.map((idx, i) => (
            <span key={i} className="inline-flex items-center justify-center rounded text-[9px] font-mono font-bold px-1.5 py-0.5" style={{ backgroundColor: getColor(0).hex + '30', color: 'var(--foreground)' }}>
              #{idx}
            </span>
          ))}
        </div>
      )}

      {/* Solver details */}
      <div className="text-xs space-y-1 text-muted-foreground font-mono">
        <div>Greedy: {report.greedy.solved ? `PASS in ${report.greedy.moves} moves` : `FAIL (${report.greedy.deadEndReason})`}</div>
        <div>MC: {(report.monteCarlo.winRate * 100).toFixed(1)}% ({report.monteCarlo.wins}/{report.monteCarlo.runs})</div>
        {report.dfs && <div>DFS: {report.dfs.verdict} — {report.dfs.solutionCount} solutions, {report.dfs.exploredStates} states{report.dfs.timedOut ? ' (timed out)' : ''}</div>}
      </div>
    </div>
  );
}

// ============================================================================
// SIMULATOR TAB
// ============================================================================

function SimulatorPanel({
  level, solverInput, report,
  onSaveLog,
}: {
  level: StudioExportLevel;
  solverInput: SolverInput;
  report: LevelReport | null;
  onSaveLog: (log: string) => void;
}) {
  const reqs = (level.Requirements ?? []).map((r) => ({ ColorType: r.ColorType }));
  const [sim, setSim] = useState<SimState>(() => createSimState(solverInput, reqs));
  const [hintIdx, setHintIdx] = useState(-1);

  const reset = useCallback(() => {
    setSim(createSimState(solverInput, reqs));
    setHintIdx(-1);
  }, [solverInput, reqs]);

  const handlePick = useCallback((posIdx: number) => {
    setSim((prev) => {
      const next = simPick(prev, posIdx, reqs, solverInput.maxWait);
      return next;
    });
    setHintIdx(-1);
  }, [reqs, solverInput.maxWait]);

  const handleHint = useCallback(() => {
    const idx = computeHint(sim, reqs, solverInput.maxWait);
    setHintIdx(idx);
  }, [sim, reqs, solverInput.maxWait]);

  const handleSaveLog = useCallback(() => {
    if (sim.picks.length === 0) return;
    let txt = `=== LEVEL PLAYLOG ===\n`;
    txt += `Level: ${level.LevelId}\n`;
    txt += `Result: ${sim.done ? 'complete' : sim.lost ? 'gameover' : 'manual'}\n`;
    txt += `Picks: ${sim.picks.length}\n`;
    txt += `Requirements: ${sim.completedReqs}/${reqs.length}\n\n`;
    txt += `Step | Item# | Color        | Var | Pos | Action           | Queue | Reqs\n`;
    txt += `-----+-------+--------------+-----+-----+------------------+-------+-----\n`;
    sim.picks.forEach((d) => {
      txt += `${String(d.step).padStart(4)} | #${String(d.itemIdx).padStart(4)} | ${getColor(d.ct).name.padEnd(12)} | v${d.variant}  | ${String(d.posIdx).padStart(3)} | ${d.action.padEnd(16)} | ${d.queueLen}/${solverInput.maxWait}   | ${d.reqsDone}\n`;
    });
    txt += `\nCompact: [${sim.picks.map((d) => d.itemIdx).join(',')}]\n`;
    onSaveLog(txt);
  }, [sim, level.LevelId, reqs.length, solverInput.maxWait, onSaveLog]);

  // Golden path for highlighting
  const goldenSet = new Set(report?.solutionPath ?? []);

  return (
    <div className="space-y-4">
      {/* Game over / complete overlay */}
      {(sim.done || sim.lost) && (
        <div className={`p-4 rounded-lg border text-center ${sim.done ? 'border-green-500/50 bg-green-500/10' : 'border-red-500/50 bg-red-500/10'}`}>
          <p className="font-bold text-sm">{sim.done ? 'Level Complete!' : `Game Over — Queue full. ${sim.completedReqs}/${reqs.length} done`}</p>
          <div className="flex gap-2 justify-center mt-2">
            <Button size="sm" variant="outline" onClick={reset}><RotateCcw className="h-3 w-3 mr-1" /> Try Again</Button>
            <Button size="sm" variant="outline" onClick={handleSaveLog} disabled={sim.picks.length === 0}><ScrollText className="h-3 w-3 mr-1" /> Save Log</Button>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button size="sm" variant="outline" onClick={reset}><RotateCcw className="h-3 w-3 mr-1" /> Reset</Button>
        <Button size="sm" variant="outline" onClick={handleHint}><Lightbulb className="h-3 w-3 mr-1" /> Hint</Button>
        <Button size="sm" variant="outline" onClick={handleSaveLog} disabled={sim.picks.length === 0}>
          <ScrollText className="h-3 w-3 mr-1" /> Save Log ({sim.picks.length})
        </Button>
        <span className="text-xs text-muted-foreground font-mono ml-auto">
          Reqs: {sim.completedReqs}/{reqs.length}
        </span>
      </div>

      {/* Active Slots */}
      <div className="flex gap-3 flex-wrap">
        {sim.slots.map((slot, si) => {
          if (!slot) return (
            <div key={si} className="flex-1 min-w-[140px] p-2 rounded border border-dashed border-muted bg-muted/20 text-center text-xs text-muted-foreground">
              Slot {si + 1} — empty
            </div>
          );
          const c = getColor(slot.ct);
          return (
            <div key={si} className="flex-1 min-w-[140px] p-2 rounded border" style={{ borderColor: c.hex + '80', backgroundColor: c.hex + '15' }}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-mono text-muted-foreground">Slot {si + 1}</span>
                <span className="text-xs font-bold" style={{ color: c.hex }}>{c.name}</span>
                <span className="text-[9px] font-mono text-muted-foreground">R{slot.reqIdx}</span>
                {slot.variantLock !== null && <span className="text-[9px] font-mono text-yellow-400">v{slot.variantLock}</span>}
              </div>
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="w-5 h-5 rounded-full border" style={{
                    backgroundColor: i < slot.items.length ? c.hex : 'transparent',
                    borderColor: c.hex + '80',
                  }} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Waiting Queue */}
      <div className={`p-2 rounded border ${sim.waitQueue.length >= solverInput.maxWait - 1 ? 'border-red-500/50 bg-red-500/10' : 'border-muted bg-muted/20'}`}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-mono text-muted-foreground">Queue</span>
          <span className={`text-[10px] font-mono font-bold ${sim.waitQueue.length >= solverInput.maxWait - 1 ? 'text-red-400' : 'text-muted-foreground'}`}>
            {sim.waitQueue.length}/{solverInput.maxWait}
          </span>
        </div>
        <div className="flex gap-1 min-h-[36px]">
          {sim.waitQueue.map((it, i) => (
            <ItemCell key={i} item={it} />
          ))}
          {Array.from({ length: solverInput.maxWait - sim.waitQueue.length }).map((_, i) => (
            <div key={`e-${i}`} className="w-[44px] h-[44px] rounded border border-dashed border-muted" />
          ))}
        </div>
      </div>

      {/* Surface (Layer 0) — clickable */}
      <div>
        <h4 className="text-[11px] font-mono font-semibold text-muted-foreground uppercase tracking-wider mb-2">Surface — click to pick</h4>
        <div className="flex flex-wrap gap-1.5">
          {sim.positions.map((pos, pi) => {
            if (!pos.visible) return (
              <div key={pi} className="w-[44px] h-[44px] rounded border border-dashed border-muted opacity-30" />
            );
            const isHint = pos.visible.idx === hintIdx;
            const isGolden = goldenSet.has(pos.visible.idx);
            // Highlight if matches any active slot
            const highlight = sim.slots.some((sl) => {
              if (!sl || pos.visible!.ColorType !== sl.ct) return false;
              if (sl.variantLock !== null && pos.visible!.Variant !== sl.variantLock) return false;
              return true;
            });
            return (
              <div key={pi} className="flex flex-col items-center gap-0.5">
                <ItemCell
                  item={pos.visible}
                  onClick={!sim.done && !sim.lost ? () => handlePick(pi) : undefined}
                  highlight={highlight}
                  golden={isGolden}
                  hintBadge={isHint}
                />
                {pos.behind && (
                  <ItemCell item={pos.behind} dim />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* L2 remaining */}
      {sim.l2i < sim.l2q.length && (
        <div>
          <h4 className="text-[11px] font-mono font-semibold text-muted-foreground uppercase tracking-wider mb-1">
            Queue remaining <Badge variant="secondary" className="text-[9px]">{sim.l2q.length - sim.l2i}</Badge>
          </h4>
          <div className="flex flex-wrap gap-1">
            {sim.l2q.slice(sim.l2i).map((it, i) => (
              <ItemCell key={it.idx} item={it} dim />
            ))}
          </div>
        </div>
      )}

      {/* Log */}
      <div className="max-h-[200px] overflow-y-auto text-[11px] font-mono space-y-0.5 p-2 bg-muted/20 rounded border border-muted">
        {sim.log.slice(-25).map((entry, i) => (
          <div key={i} className={entry.type === 'ok' ? 'text-green-400' : entry.type === 'warn' ? 'text-yellow-400' : 'text-red-400'}>
            {entry.text}
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// LOGS TAB
// ============================================================================

function LogsPanel({ logs, onClear }: { logs: string[]; onClear: () => void }) {
  const [expanded, setExpanded] = useState<number | null>(null);

  const copyAll = useCallback(() => {
    const text = logs.join('\n\n========================================\n\n');
    navigator.clipboard.writeText(text);
  }, [logs]);

  if (logs.length === 0) return <p className="text-sm text-muted-foreground">No play logs saved yet. Use the Simulator to play and save logs.</p>;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground font-mono">{logs.length} log(s)</span>
        <Button size="sm" variant="outline" onClick={copyAll}><Copy className="h-3 w-3 mr-1" /> Copy all</Button>
        <Button size="sm" variant="outline" onClick={onClear}><Trash2 className="h-3 w-3 mr-1" /> Clear</Button>
      </div>
      {logs.map((log, i) => {
        const lines = log.split('\n');
        const levelLine = lines.find((l) => l.startsWith('Level:')) ?? '';
        const resultLine = lines.find((l) => l.startsWith('Result:')) ?? '';
        const picksLine = lines.find((l) => l.startsWith('Picks:')) ?? '';
        return (
          <Card key={i}>
            <CardContent className="p-3">
              <div className="flex items-center gap-2 cursor-pointer" onClick={() => setExpanded(expanded === i ? null : i)}>
                <span className={`text-sm ${resultLine.includes('complete') ? 'text-green-400' : resultLine.includes('gameover') ? 'text-red-400' : 'text-yellow-400'}`}>
                  {resultLine.includes('complete') ? '✓' : resultLine.includes('gameover') ? '✗' : '◉'}
                </span>
                <span className="text-xs font-mono">{levelLine.replace('Level: ', '')}</span>
                <span className="text-xs text-muted-foreground">{picksLine}</span>
                <Button size="sm" variant="ghost" className="ml-auto h-6 text-xs" onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(log); }}>
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
              {expanded === i && (
                <pre className="mt-2 text-[10px] font-mono text-muted-foreground whitespace-pre-wrap bg-muted/30 p-2 rounded max-h-[300px] overflow-y-auto">
                  {log}
                </pre>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

type AdjustTarget = 'all' | 'solvable' | 'risky' | 'stuck';

export function SolvabilityChecker() {
  const [originalFiles, setOriginalFiles] = useState<StudioExportLevel[]>([]);
  const [levelDeltas, setLevelDeltas] = useState<Map<string, number>>(new Map());
  const [report, setReport] = useState<BatchReport | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [mcRuns, setMcRuns] = useState(200);
  const [enableDFS, setEnableDFS] = useState(false);
  const [dfsLimit, setDfsLimit] = useState(500000);
  const [sortKey, setSortKey] = useState<SortKey>('levelId');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [adjustTarget, setAdjustTarget] = useState<AdjustTarget>('all');
  const [selectedLevelId, setSelectedLevelId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState('layers');
  const [playLogs, setPlayLogs] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const files = useMemo(
    () => applyDifficultyDeltas(originalFiles, levelDeltas),
    [originalFiles, levelDeltas],
  );

  const deltaInfo = useMemo(() => {
    if (levelDeltas.size === 0) return null;
    const vals = Array.from(levelDeltas.values());
    return { count: levelDeltas.size, min: Math.min(...vals), max: Math.max(...vals) };
  }, [levelDeltas]);

  // Selected level data
  const selectedLevel = useMemo(() => {
    if (!selectedLevelId) return null;
    return files.find((f) => (f.LevelId || '') === selectedLevelId) ?? null;
  }, [files, selectedLevelId]);

  const selectedReport = useMemo(() => {
    if (!selectedLevelId || !report) return null;
    return report.levels.find((r) => r.levelId === selectedLevelId) ?? null;
  }, [report, selectedLevelId]);

  const selectedSolverInput = useMemo(() => {
    if (!selectedLevel) return null;
    const config = studioExportToGameConfig(selectedLevel);
    return configToSolverInput(config);
  }, [selectedLevel]);

  // File upload
  const handleFiles = useCallback(async (fileList: FileList) => {
    const levels: StudioExportLevel[] = [];
    for (const file of Array.from(fileList)) {
      if (!file.name.endsWith('.json')) continue;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (data.Artwork && (data.SelectableItems || data.Requirements)) levels.push(data as StudioExportLevel);
      } catch { /* skip invalid */ }
    }
    levels.sort((a, b) => extractLevelNum(a.LevelId || '') - extractLevelNum(b.LevelId || ''));
    setOriginalFiles(levels);
    setLevelDeltas(new Map());
    setReport(null);
    setSelectedLevelId(null);
  }, []);

  // Run analysis
  const handleRun = useCallback(async () => {
    if (files.length === 0) return;
    setRunning(true);
    setProgress({ done: 0, total: files.length });
    setReport(null);
    const options: AnalyzeOptions = {
      runMonteCarlo: true,
      monteCarloRuns: mcRuns,
      runDFS: enableDFS,
      dfsStateLimit: dfsLimit,
      onProgress: (done, total) => setProgress({ done, total }),
    };
    try {
      const result = await analyzeBatch(files, options);
      setReport(result);
      if (!selectedLevelId && files.length > 0) setSelectedLevelId(files[0].LevelId || '');
    } finally {
      setRunning(false);
    }
  }, [files, mcRuns, enableDFS, dfsLimit, selectedLevelId]);

  // Export CSV
  const handleExportCSV = useCallback(() => {
    if (!report) return;
    const header = 'Level,Items,Launchers,Colors,MaxSel,Blocking,Stand,Active,Greedy,MC WinRate,Moves,Direct,Queue,Verdict';
    const rows = report.levels.map((r) =>
      [r.levelId, r.totalItems, r.totalLaunchers, r.uniqueColors, r.maxSelectableItems, r.blockingOffset, r.waitingStandSlots, r.activeLauncherCount,
        r.greedy.solved ? 'PASS' : 'FAIL', `${(r.monteCarlo.winRate * 100).toFixed(1)}%`,
        r.moveAnalysis?.totalMoves ?? '', r.moveAnalysis?.directMoves ?? '', r.moveAnalysis?.queueMoves ?? '', r.verdict,
      ].join(',')
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'solvability-report.csv'; a.click();
    URL.revokeObjectURL(url);
  }, [report]);

  // Adjust difficulty
  const adjustDifficulty = useCallback(async (step: number) => {
    if (originalFiles.length === 0) return;
    const targetIds = new Set<string>();
    if (adjustTarget === 'all') {
      originalFiles.forEach((l) => targetIds.add(l.LevelId || ''));
    } else if (report) {
      report.levels.filter((r) => r.verdict === adjustTarget).forEach((r) => targetIds.add(r.levelId));
    } else {
      originalFiles.forEach((l) => targetIds.add(l.LevelId || ''));
    }
    const newDeltas = new Map(levelDeltas);
    targetIds.forEach((id) => { newDeltas.set(id, (newDeltas.get(id) ?? 0) + step); });
    newDeltas.forEach((v, k) => { if (v === 0) newDeltas.delete(k); });
    setLevelDeltas(newDeltas);
    setReport(null);
    const adjusted = applyDifficultyDeltas(originalFiles, newDeltas);
    setRunning(true);
    setProgress({ done: 0, total: adjusted.length });
    try {
      const result = await analyzeBatch(adjusted, { runMonteCarlo: true, monteCarloRuns: mcRuns, runDFS: enableDFS, dfsStateLimit: dfsLimit, onProgress: (done, total) => setProgress({ done, total }) });
      setReport(result);
    } finally {
      setRunning(false);
    }
  }, [originalFiles, levelDeltas, adjustTarget, report, mcRuns, enableDFS, dfsLimit]);

  const handleExportAllJSON = useCallback(() => {
    for (const level of files) {
      const name = level.LevelId || 'level';
      const blob = new Blob([JSON.stringify(level, null, 4)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${name}.json`; a.click();
      URL.revokeObjectURL(url);
    }
  }, [files]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  const displayLevels = report ? sortLevels(report.levels, sortKey, sortDir) : [];

  return (
    <div className="space-y-4">
      {/* Upload */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Upload Level JSONs</CardTitle></CardHeader>
        <CardContent>
          <input ref={fileRef} type="file" multiple accept=".json" className="hidden" onChange={(e) => e.target.files && handleFiles(e.target.files)} />
          <div
            className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={(e) => { e.preventDefault(); e.stopPropagation(); if (e.dataTransfer.files) handleFiles(e.dataTransfer.files); }}
          >
            <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {files.length > 0 ? `${files.length} level${files.length !== 1 ? 's' : ''} loaded` : 'Drop .json files here or click to browse'}
            </p>
          </div>
          {files.length > 0 && (
            <div className="mt-4 flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground">MC Runs:</label>
                <Input type="number" min={10} max={2000} value={mcRuns} onChange={(e) => setMcRuns(Number(e.target.value) || 200)} className="h-7 w-20 text-xs" />
              </div>
              <label className="flex items-center gap-1.5 text-xs">
                <input type="checkbox" checked={enableDFS} onChange={(e) => setEnableDFS(e.target.checked)} className="rounded" />
                DFS
              </label>
              {enableDFS && (
                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted-foreground">Limit:</label>
                  <Input type="number" min={1000} max={5000000} value={dfsLimit} onChange={(e) => setDfsLimit(Number(e.target.value) || 500000)} className="h-7 w-24 text-xs" />
                </div>
              )}
              <Button size="sm" onClick={handleRun} disabled={running} className="h-7">
                <Play className="h-3 w-3 mr-1" />
                {running ? `${progress.done}/${progress.total}` : 'Run Analysis'}
              </Button>
            </div>
          )}
          {running && (
            <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%` }} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary + Difficulty Controls */}
      {report && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between">
              <span>Summary</span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-7" onClick={handleExportCSV}><Download className="h-3 w-3 mr-1" /> CSV</Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-4 text-sm">
              <span>{report.summary.total} total</span>
              <span className="text-green-400">{report.summary.solvable} solvable</span>
              <span className="text-yellow-400">{report.summary.risky} risky</span>
              <span className="text-red-400">{report.summary.stuck} stuck</span>
              <span className="text-muted-foreground">avg win rate: {(report.summary.avgWinRate * 100).toFixed(1)}%</span>
            </div>
            <div className="flex items-center gap-2 pt-2 border-t border-border/50 flex-wrap">
              <span className="text-xs text-muted-foreground">Adjust:</span>
              <select value={adjustTarget} onChange={(e) => setAdjustTarget(e.target.value as AdjustTarget)} className="h-7 text-xs bg-background border rounded px-2">
                <option value="all">All levels</option>
                <option value="solvable">Solvable only</option>
                <option value="risky">Risky only</option>
                <option value="stuck">Stuck only</option>
              </select>
              <Button variant="outline" size="sm" className="h-7 text-green-400 border-green-500/50 hover:bg-green-500/10" onClick={() => adjustDifficulty(-1)} disabled={running}>
                <ArrowDown className="h-3 w-3 mr-1" /> Easier
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-red-400 border-red-500/50 hover:bg-red-500/10" onClick={() => adjustDifficulty(+1)} disabled={running}>
                <ArrowUp className="h-3 w-3 mr-1" /> Harder
              </Button>
              {deltaInfo && (
                <>
                  <Badge variant="outline" className="text-muted-foreground">
                    {deltaInfo.count} adjusted ({deltaInfo.min > 0 ? '+' : ''}{deltaInfo.min}{deltaInfo.min !== deltaInfo.max ? ` to ${deltaInfo.max > 0 ? '+' : ''}${deltaInfo.max}` : ''})
                  </Badge>
                  <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => { setLevelDeltas(new Map()); setReport(null); }} disabled={running}>Reset</Button>
                </>
              )}
              <div className="flex-1" />
              <Button variant="outline" size="sm" className="h-7" onClick={handleExportAllJSON} disabled={running}><Download className="h-3 w-3 mr-1" /> Export All JSONs</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Level selector + Detail tabs */}
      {report && files.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-3">
              <span>Level Detail</span>
              <select
                value={selectedLevelId || ''}
                onChange={(e) => { setSelectedLevelId(e.target.value); setDetailTab('layers'); }}
                className="h-7 text-xs bg-background border rounded px-2 font-mono min-w-[160px]"
              >
                {files.map((f) => {
                  const r = report.levels.find((lr) => lr.levelId === (f.LevelId || ''));
                  const icon = r ? (r.verdict === 'solvable' ? '✓' : r.verdict === 'risky' ? '~' : '✗') : '?';
                  return (
                    <option key={f.LevelId} value={f.LevelId || ''}>
                      {icon} {f.LevelId}
                    </option>
                  );
                })}
              </select>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selectedLevel && selectedSolverInput && (
              <Tabs value={detailTab} onValueChange={setDetailTab}>
                <TabsList className="grid w-full grid-cols-4 mb-4">
                  <TabsTrigger value="layers" className="text-xs gap-1"><Layers className="h-3 w-3" /> Layers</TabsTrigger>
                  <TabsTrigger value="solution" className="text-xs gap-1"><Route className="h-3 w-3" /> Solution</TabsTrigger>
                  <TabsTrigger value="sim" className="text-xs gap-1"><Gamepad2 className="h-3 w-3" /> Simulator</TabsTrigger>
                  <TabsTrigger value="logs" className="text-xs gap-1"><ScrollText className="h-3 w-3" /> Logs</TabsTrigger>
                </TabsList>
                <TabsContent value="layers">
                  <LayersPanel level={selectedLevel} report={selectedReport} solverInput={selectedSolverInput} />
                </TabsContent>
                <TabsContent value="solution">
                  <SolutionPanel report={selectedReport} />
                </TabsContent>
                <TabsContent value="sim">
                  <SimulatorPanel
                    level={selectedLevel}
                    solverInput={selectedSolverInput}
                    report={selectedReport}
                    onSaveLog={(log) => setPlayLogs((prev) => [...prev, log])}
                  />
                </TabsContent>
                <TabsContent value="logs">
                  <LogsPanel logs={playLogs} onClear={() => setPlayLogs([])} />
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      )}

      {/* Batch Results table */}
      {report && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Batch Report</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground uppercase text-[11px] tracking-wider font-mono">
                    <th className="px-3 py-2 cursor-pointer hover:text-foreground select-none" onClick={() => toggleSort('levelId')}>
                      Level {sortKey === 'levelId' ? (sortDir === 'asc' ? '\u2191' : '\u2193') : ''}
                    </th>
                    <th className="px-3 py-2 cursor-pointer hover:text-foreground select-none" onClick={() => toggleSort('verdict')}>
                      Status {sortKey === 'verdict' ? (sortDir === 'asc' ? '\u2191' : '\u2193') : ''}
                    </th>
                    <th className="px-3 py-2 text-center">Paths</th>
                    <th className="px-3 py-2 text-center">Reqs</th>
                    <th className="px-3 py-2 text-center cursor-pointer hover:text-foreground select-none" onClick={() => toggleSort('totalItems')}>
                      Items {sortKey === 'totalItems' ? (sortDir === 'asc' ? '\u2191' : '\u2193') : ''}
                    </th>
                    <th className="px-3 py-2 text-center">Moves</th>
                    <th className="px-3 py-2 text-center">Direct</th>
                    <th className="px-3 py-2 text-center">Queue</th>
                    <th className="px-3 py-2 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {displayLevels.map((r) => {
                    const isExpanded = expandedId === r.levelId;
                    const qm = r.moveAnalysis?.queueMoves ?? 0;
                    const paths = r.dfs?.solutionCount ?? (r.greedy.solved ? 1 : 0);
                    return (
                      <React.Fragment key={r.levelId}>
                        <tr
                          className="border-b border-border/50 cursor-pointer hover:bg-accent/50 transition-colors"
                          onClick={() => setExpandedId(isExpanded ? null : r.levelId)}
                        >
                          <td className="px-3 py-2 font-mono cursor-pointer hover:text-primary" onClick={(e) => { e.stopPropagation(); setSelectedLevelId(r.levelId); setDetailTab('layers'); }}>
                            {r.levelId}
                          </td>
                          <td className="px-3 py-2">
                            {r.verdict === 'solvable'
                              ? <span className="text-green-400 font-medium">&#10003;</span>
                              : r.verdict === 'risky'
                                ? <span className="text-yellow-400 font-medium">~</span>
                                : <span className="text-red-400 font-medium">&#10007;</span>}
                          </td>
                          <td className="px-3 py-2 text-center font-mono text-xs">{paths || '-'}</td>
                          <td className="px-3 py-2 text-center font-mono text-xs">{r.totalLaunchers}</td>
                          <td className="px-3 py-2 text-center font-mono text-xs">{r.totalItems}</td>
                          <td className="px-3 py-2 text-center font-mono text-xs">{r.moveAnalysis?.totalMoves ?? '-'}</td>
                          <td className="px-3 py-2 text-center font-mono text-xs text-green-400">{r.moveAnalysis?.directMoves ?? '-'}</td>
                          <td className={`px-3 py-2 text-center font-mono text-xs ${qm > 3 ? 'text-red-400' : qm > 0 ? 'text-yellow-400' : 'text-green-400'}`}>
                            {r.moveAnalysis ? qm : '-'}
                          </td>
                          <td className="px-3 py-2 w-8 text-muted-foreground">
                            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="border-b border-border/50">
                            <td colSpan={9} className="px-6 py-3 bg-muted/30 text-xs space-y-1">
                              <div className="flex gap-6">
                                <span>Colors: {r.uniqueColors}</span>
                                <span>MaxSel: {r.maxSelectableItems}</span>
                                <span>Blocking: {r.blockingOffset}</span>
                                <span>Stand: {r.waitingStandSlots}</span>
                                <span>Active: {r.activeLauncherCount}</span>
                              </div>
                              <div>Greedy: {r.greedy.solved ? `PASS in ${r.greedy.moves} moves` : `FAIL (${r.greedy.deadEndReason})`}{r.greedy.peakStandUsage > 0 && ` | peak stand ${r.greedy.peakStandUsage}/${r.waitingStandSlots}`}</div>
                              <div>MC: {(r.monteCarlo.winRate * 100).toFixed(1)}% win ({r.monteCarlo.wins}/{r.monteCarlo.runs}){r.monteCarlo.wins > 0 && ` | avg ${r.monteCarlo.avgMoves.toFixed(0)} moves`}</div>
                              {r.dfs && <div>DFS: {r.dfs.verdict} | {r.dfs.solutionCount} solutions, {r.dfs.exploredStates} states{r.dfs.timedOut && ' (timed out)'}</div>}
                              <Button size="sm" variant="outline" className="h-6 text-xs mt-1" onClick={() => { setSelectedLevelId(r.levelId); setDetailTab('layers'); }}>
                                View Detail
                              </Button>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
