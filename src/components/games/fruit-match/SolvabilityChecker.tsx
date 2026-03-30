'use client';

import { useState, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Upload, Play, Download, ChevronDown, ChevronRight } from 'lucide-react';
import {
  analyzeBatch,
  LevelReport,
  BatchReport,
  AnalyzeOptions,
} from '@/lib/solvabilityChecker';
import { StudioExportLevel } from '@/lib/juicyBlastExport';

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
// Verdict badge
// ============================================================================

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
// Main Component
// ============================================================================

export function SolvabilityChecker() {
  const [files, setFiles] = useState<StudioExportLevel[]>([]);
  const [report, setReport] = useState<BatchReport | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [mcRuns, setMcRuns] = useState(200);
  const [enableDFS, setEnableDFS] = useState(false);
  const [dfsLimit, setDfsLimit] = useState(10000);
  const [sortKey, setSortKey] = useState<SortKey>('levelId');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // File upload
  const handleFiles = useCallback(async (fileList: FileList) => {
    const levels: StudioExportLevel[] = [];
    for (const file of Array.from(fileList)) {
      if (!file.name.endsWith('.json')) continue;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (data.Artwork && data.SelectableItems) {
          levels.push(data as StudioExportLevel);
        }
      } catch { /* skip invalid */ }
    }
    levels.sort((a, b) => extractLevelNum(a.LevelId || '') - extractLevelNum(b.LevelId || ''));
    setFiles(levels);
    setReport(null);
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
    } finally {
      setRunning(false);
    }
  }, [files, mcRuns, enableDFS, dfsLimit]);

  // Export CSV
  const handleExportCSV = useCallback(() => {
    if (!report) return;
    const header = 'Level,Items,Launchers,Colors,MaxSel,Blocking,Greedy,MC WinRate,MC AvgMoves,Verdict';
    const rows = report.levels.map((r) =>
      [
        r.levelId, r.totalItems, r.totalLaunchers, r.uniqueColors, r.maxSelectableItems,
        r.blockingOffset, r.greedy.solved ? 'PASS' : 'FAIL',
        `${(r.monteCarlo.winRate * 100).toFixed(1)}%`, r.monteCarlo.avgMoves.toFixed(0), r.verdict,
      ].join(',')
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'solvability-report.csv'; a.click();
    URL.revokeObjectURL(url);
  }, [report]);

  // Sort toggle
  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  const displayLevels = report ? sortLevels(report.levels, sortKey, sortDir) : [];

  return (
    <div className="space-y-4">
      {/* Upload */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Upload Level JSONs</CardTitle>
        </CardHeader>
        <CardContent>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".json"
            className="hidden"
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
          />
          <div
            className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={(e) => { e.preventDefault(); e.stopPropagation(); if (e.dataTransfer.files) handleFiles(e.dataTransfer.files); }}
          >
            <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {files.length > 0
                ? `${files.length} level${files.length !== 1 ? 's' : ''} loaded`
                : 'Drop .json files here or click to browse'}
            </p>
          </div>

          {/* Config */}
          {files.length > 0 && (
            <div className="mt-4 flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground">MC Runs:</label>
                <Input type="number" min={10} max={2000} value={mcRuns} onChange={(e) => setMcRuns(Number(e.target.value) || 200)} className="h-7 w-20 text-xs" />
              </div>
              <label className="flex items-center gap-1.5 text-xs">
                <input type="checkbox" checked={enableDFS} onChange={(e) => setEnableDFS(e.target.checked)} className="rounded" />
                DFS (slow)
              </label>
              {enableDFS && (
                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted-foreground">State limit:</label>
                  <Input type="number" min={1000} max={100000} value={dfsLimit} onChange={(e) => setDfsLimit(Number(e.target.value) || 10000)} className="h-7 w-24 text-xs" />
                </div>
              )}
              <Button size="sm" onClick={handleRun} disabled={running} className="h-7">
                <Play className="h-3 w-3 mr-1" />
                {running ? `${progress.done}/${progress.total}` : 'Run Analysis'}
              </Button>
            </div>
          )}

          {/* Progress bar */}
          {running && (
            <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%` }}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary */}
      {report && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between">
              <span>Summary</span>
              <Button variant="outline" size="sm" className="h-7" onClick={handleExportCSV}>
                <Download className="h-3 w-3 mr-1" /> CSV
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4 text-sm">
              <span>{report.summary.total} total</span>
              <span className="text-green-400">{report.summary.solvable} solvable</span>
              <span className="text-yellow-400">{report.summary.risky} risky</span>
              <span className="text-red-400">{report.summary.stuck} stuck</span>
              <span className="text-muted-foreground">avg win rate: {(report.summary.avgWinRate * 100).toFixed(1)}%</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results table */}
      {report && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    {([
                      ['levelId', 'Level'],
                      ['totalItems', 'Items'],
                      ['blockingOffset', 'Blk'],
                      ['greedy', 'Greedy'],
                      ['winRate', 'MC Win%'],
                      ['verdict', 'Verdict'],
                    ] as [SortKey, string][]).map(([key, label]) => (
                      <th
                        key={key}
                        className="px-3 py-2 cursor-pointer hover:text-foreground select-none"
                        onClick={() => toggleSort(key)}
                      >
                        {label} {sortKey === key ? (sortDir === 'asc' ? '\u2191' : '\u2193') : ''}
                      </th>
                    ))}
                    <th className="px-3 py-2 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {displayLevels.map((r) => {
                    const isExpanded = expandedId === r.levelId;
                    return (
                      <tr key={r.levelId} className="group">
                        <td colSpan={7} className="p-0">
                          <div
                            className="flex items-center px-3 py-2 cursor-pointer hover:bg-accent/50 transition-colors border-b border-border/50"
                            onClick={() => setExpandedId(isExpanded ? null : r.levelId)}
                          >
                            <span className="w-24 font-mono">{r.levelId}</span>
                            <span className="w-16 text-center">{r.totalItems}</span>
                            <span className="w-12 text-center">{r.blockingOffset}</span>
                            <span className="w-16 text-center">{r.greedy.solved ? <span className="text-green-400">PASS</span> : <span className="text-red-400">FAIL</span>}</span>
                            <span className={`w-20 text-center font-medium ${r.monteCarlo.winRate >= 0.5 ? 'text-green-400' : r.monteCarlo.winRate > 0 ? 'text-yellow-400' : 'text-red-400'}`}>
                              {(r.monteCarlo.winRate * 100).toFixed(1)}%
                            </span>
                            <span className="w-20"><VerdictBadge verdict={r.verdict} /></span>
                            <span className="w-8 text-muted-foreground">
                              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </span>
                          </div>

                          {/* Detail panel */}
                          {isExpanded && (
                            <div className="px-6 py-3 bg-muted/30 border-b border-border/50 text-xs space-y-1">
                              <div className="flex gap-6">
                                <span>Items: {r.totalItems}</span>
                                <span>Launchers: {r.totalLaunchers}</span>
                                <span>Colors: {r.uniqueColors}</span>
                                <span>MaxSel: {r.maxSelectableItems}</span>
                                <span>Stand: {r.waitingStandSlots}</span>
                                <span>Active: {r.activeLauncherCount}</span>
                              </div>
                              <div className="flex gap-6">
                                <span>
                                  Greedy: {r.greedy.solved ? `PASS in ${r.greedy.moves} moves` : `FAIL (${r.greedy.deadEndReason})`}
                                  {r.greedy.peakStandUsage > 0 && ` | peak stand ${r.greedy.peakStandUsage}/${r.waitingStandSlots}`}
                                </span>
                              </div>
                              <div className="flex gap-6">
                                <span>
                                  MC: {(r.monteCarlo.winRate * 100).toFixed(1)}% win
                                  ({r.monteCarlo.wins}/{r.monteCarlo.runs})
                                  {r.monteCarlo.wins > 0 && ` | avg ${r.monteCarlo.avgMoves.toFixed(0)} moves`}
                                  | 95% CI: [{(r.monteCarlo.confidenceInterval[0] * 100).toFixed(1)}, {(r.monteCarlo.confidenceInterval[1] * 100).toFixed(1)}]%
                                </span>
                              </div>
                              {r.dfs && (
                                <div className="flex gap-6">
                                  <span>
                                    DFS: {r.dfs.verdict}
                                    | {r.dfs.solutionCount} solutions, {r.dfs.deadEndCount} dead-ends
                                    | explored {r.dfs.exploredStates} states
                                    {r.dfs.timedOut && ' (timed out)'}
                                    {r.dfs.solvable && ` | moves: ${r.dfs.minMoves}-${r.dfs.maxMoves}`}
                                  </span>
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
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
