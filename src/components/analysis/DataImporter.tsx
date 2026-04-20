'use client';

import { useCallback, useRef, useState } from 'react';
import { Upload, FileText, Play, X, Sparkles } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { GameAdapter } from '@/lib/cadence/adapters';
import {
  generateSampleAbDataset,
  generateSampleJuicyBlastRows,
} from '@/lib/cadence/sampleData';

export interface ImportedData {
  fileName: string;
  sizeBytes: number;
  rowCount: number;
  columns: string[];
  rows: Array<Record<string, unknown>>;
  format: 'csv' | 'json';
}

interface DataImporterProps {
  adapter: GameAdapter;
  data: ImportedData | null;
  running: boolean;
  onImport: (data: ImportedData) => void;
  onClear: () => void;
  onRun: () => void;
}

export function DataImporter({
  adapter,
  data,
  running,
  onImport,
  onClear,
  onRun,
}: DataImporterProps) {
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      try {
        const text = await file.text();
        const isJson =
          file.name.toLowerCase().endsWith('.json') ||
          text.trimStart().startsWith('[') ||
          text.trimStart().startsWith('{');
        const parsed = isJson ? parseJson(text) : parseCsv(text);
        onImport({
          fileName: file.name,
          sizeBytes: file.size,
          format: isJson ? 'json' : 'csv',
          ...parsed,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to parse file');
      }
    },
    [onImport]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer.files?.[0];
      if (file) void handleFile(file);
    },
    [handleFile]
  );

  const loadSample = useCallback(
    (mode: 'single' | 'ab') => {
      setError(null);
      const rows =
        mode === 'ab'
          ? generateSampleAbDataset({ seed: 1 })
          : generateSampleJuicyBlastRows({ seed: 1 });
      const columns = Array.from(
        rows.reduce((set, row) => {
          Object.keys(row).forEach((k) => set.add(k));
          return set;
        }, new Set<string>())
      );
      const bytes = new Blob([JSON.stringify(rows)]).size;
      onImport({
        fileName:
          mode === 'ab'
            ? 'sample_juicy_blast_ab.json'
            : 'sample_juicy_blast.json',
        sizeBytes: bytes,
        format: 'json',
        rowCount: rows.length,
        columns,
        rows,
      });
    },
    [onImport]
  );

  const missingColumns = data
    ? adapter.sessionKeyColumns.filter((col) => !data.columns.includes(col))
    : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5 text-primary" />
          Import Signal Data
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!data ? (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={onDrop}
            className={cn(
              'flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 text-center transition-colors',
              dragActive
                ? 'border-primary bg-primary/5'
                : 'border-muted-foreground/25'
            )}
          >
            <FileText className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="font-medium">Drop a CSV or JSON export here</p>
              <p className="text-xs text-muted-foreground">
                Exported from SAT, BigQuery, or similar analytics tools.
              </p>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.json,.tsv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => inputRef.current?.click()}
              >
                Choose file
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => loadSample('single')}
              >
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                Load sample data
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => loadSample('ab')}
              >
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                Load A/B sample
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Sample data is synthetic Juicy Blast telemetry (seeded, deterministic) — useful for demos without a real SAT export.
            </p>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{data.fileName}</p>
                <div className="mt-1 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                  <Badge variant="secondary" className="text-[10px]">
                    {data.format.toUpperCase()}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px]">
                    {data.rowCount.toLocaleString()} rows
                  </Badge>
                  <Badge variant="secondary" className="text-[10px]">
                    {data.columns.length} cols
                  </Badge>
                  <Badge variant="secondary" className="text-[10px]">
                    {formatBytes(data.sizeBytes)}
                  </Badge>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClear}
                aria-label="Clear"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {missingColumns.length > 0 && (
              <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-xs">
                <p className="font-medium text-amber-600 dark:text-amber-400">
                  Schema warning
                </p>
                <p className="mt-1 text-muted-foreground">
                  Adapter expects session keys:{' '}
                  <span className="font-mono">
                    {adapter.sessionKeyColumns.join(', ')}
                  </span>
                  . Missing:{' '}
                  <span className="font-mono text-amber-600 dark:text-amber-400">
                    {missingColumns.join(', ')}
                  </span>
                  .
                </p>
              </div>
            )}

            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={onClear} disabled={running}>
                Reset
              </Button>
              <Button onClick={onRun} disabled={running}>
                <Play className="mr-2 h-4 w-4" />
                {running ? 'Running…' : 'Run Pipeline'}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

interface ParsedRows {
  rowCount: number;
  columns: string[];
  rows: Array<Record<string, unknown>>;
}

function parseJson(text: string): ParsedRows {
  const data = JSON.parse(text);
  const rows: Array<Record<string, unknown>> = Array.isArray(data)
    ? data
    : Array.isArray((data as { rows?: unknown[] }).rows)
      ? ((data as { rows: Array<Record<string, unknown>> }).rows)
      : [data as Record<string, unknown>];

  const columns = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row).forEach((k) => set.add(k));
      return set;
    }, new Set<string>())
  );

  return { rowCount: rows.length, columns, rows };
}

/** Minimal CSV parser — RFC4180-ish; Phase 3b swaps to PapaParse in a worker. */
function parseCsv(text: string): ParsedRows {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return { rowCount: 0, columns: [], rows: [] };
  const columns = splitCsvLine(lines[0]);
  const rows: Array<Record<string, unknown>> = [];
  for (let i = 1; i < lines.length; i++) {
    const values = splitCsvLine(lines[i]);
    const row: Record<string, unknown> = {};
    for (let j = 0; j < columns.length; j++) {
      row[columns[j]] = coerce(values[j] ?? '');
    }
    rows.push(row);
  }
  return { rowCount: rows.length, columns, rows };
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuote) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQuote = false;
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuote = true;
    } else if (c === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

function coerce(raw: string): unknown {
  if (raw === '') return null;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  const n = Number(raw);
  if (!Number.isNaN(n) && raw.trim() !== '') return n;
  return raw;
}
