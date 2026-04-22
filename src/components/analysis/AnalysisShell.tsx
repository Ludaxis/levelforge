'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AdapterSelector } from './AdapterSelector';
import { DataImporter, type ImportedData } from './DataImporter';
import { PipelineStrip } from './PipelineStrip';
import { StepInspector } from './StepInspector';
import { WhatIfPanel } from './WhatIfPanel';
import { ResultsOverview } from './ResultsOverview';
import { UserTimeline } from './UserTimeline';
import { FlowTransitions } from './FlowTransitions';
import { FlowSankey } from './FlowSankey';
import { ImportQaPanel } from './ImportQaPanel';
import { DdaImpactSankey } from './DdaImpactSankey';
import { AnalysisFlowPanel, HowToUsePanel } from './AnalysisGuide';
import {
  FlowParityPanel,
  SankeyHealthPanel,
  TreatmentImpactPanel,
} from './ValidationPanels';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  getAdapter,
  DEFAULT_ADAPTER_ID,
} from '@/lib/cadence/adapters';
import { cloneDefaultConfig } from '@/lib/cadence/defaultConfig';
import { runPipeline, type PipelineRunWithReports } from '@/lib/cadence/pipeline';
import type { CadenceConfig, PipelineStepId } from '@/lib/cadence/types';

const AUTO_RERUN_DEBOUNCE_MS = 250;

export function AnalysisShell() {
  const [adapterId, setAdapterId] = useState(DEFAULT_ADAPTER_ID);
  const [config, setConfig] = useState<CadenceConfig>(() => cloneDefaultConfig());
  const [data, setData] = useState<ImportedData | null>(null);
  const [run, setRun] = useState<PipelineRunWithReports | null>(null);
  const [running, setRunning] = useState(false);
  const [selectedStepId, setSelectedStepId] = useState<PipelineStepId | null>(
    null
  );
  // Bumped every time a user gesture changes config — drives the
  // auto-rerun effect below. We skip the first change so the initial
  // "Run Pipeline" click is what seeds `run`.
  const [configVersion, setConfigVersion] = useState(0);
  const hasRunOnceRef = useRef(false);

  const adapter = getAdapter(adapterId) ?? getAdapter(DEFAULT_ADAPTER_ID)!;

  const handleRun = useCallback(async () => {
    if (!data || !data.report.canRunReplay) return;
    setRunning(true);
    try {
      const result = await runPipeline({
        adapter,
        config,
        rawRows: data.rows,
      });
      setRun(result);
      setSelectedStepId((prev) => prev ?? result.steps[0]?.stepId ?? null);
      hasRunOnceRef.current = true;
    } finally {
      setRunning(false);
    }
  }, [adapter, config, data]);

  // Debounced auto-rerun whenever config changes, once we've run once.
  // Satisfies the PRD "<500ms slider-to-delta" criterion and matches
  // the expected What-If panel behavior.
  useEffect(() => {
    if (!hasRunOnceRef.current || !data || running) return;
    if (configVersion === 0) return;
    const t = setTimeout(() => {
      void handleRun();
    }, AUTO_RERUN_DEBOUNCE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configVersion, data]);

  const handleConfigChange = useCallback((next: CadenceConfig) => {
    setConfig(next);
    setConfigVersion((v) => v + 1);
  }, []);

  const handleImport = useCallback((next: ImportedData) => {
    setData(next);
    setRun(null);
    setSelectedStepId(null);
    hasRunOnceRef.current = false;
  }, []);

  const handleClear = useCallback(() => {
    setData(null);
    setRun(null);
    setSelectedStepId(null);
    hasRunOnceRef.current = false;
  }, []);

  const handleResetConfig = useCallback(() => {
    setConfig(cloneDefaultConfig());
    setConfigVersion((v) => v + 1);
  }, []);

  return (
    <div className="space-y-6">
      <Tabs defaultValue="import" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
          <TabsTrigger value="import">Import QA</TabsTrigger>
          <TabsTrigger value="replay">Replay</TabsTrigger>
          <TabsTrigger value="baseline">Baseline Sankey</TabsTrigger>
          <TabsTrigger value="impact">DDA Impact</TabsTrigger>
          <TabsTrigger value="howto">How To Use</TabsTrigger>
          <TabsTrigger value="flow">Analysis Flow</TabsTrigger>
        </TabsList>

        <TabsContent value="import" className="space-y-6">
          <AdapterSelector value={adapterId} onChange={setAdapterId} />
          <DataImporter
            adapter={adapter}
            data={data}
            running={running}
            onImport={handleImport}
            onClear={handleClear}
            onRun={handleRun}
          />
          <ImportQaPanel data={data} />
        </TabsContent>

        <TabsContent value="replay" className="space-y-6">
          {!data && (
            <EmptyState title="No import yet" body="Upload a raw signal export in Import QA first." />
          )}
          {data && !data.report.canRunReplay && (
            <EmptyState
              title="Replay unavailable"
              body="This upload is not raw user-level event data. Use Import QA to see what is missing."
            />
          )}
          {data?.report.canRunReplay && (
            <>
              {run && run.errors.length > 0 && <RunErrors run={run} />}
              <ResultsOverview run={run} />
              <FlowParityPanel run={run} data={data} />
              <PipelineStrip
                run={run}
                selectedStepId={selectedStepId}
                onSelectStep={(id) => setSelectedStepId(id as PipelineStepId)}
              />
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <StepInspector run={run} stepId={selectedStepId} />
                <WhatIfPanel
                  config={config}
                  onChange={handleConfigChange}
                  onReset={handleResetConfig}
                />
              </div>
              <UserTimeline run={run} />
            </>
          )}
        </TabsContent>

        <TabsContent value="baseline" className="space-y-6">
          {!data?.report.canDrawBaselineSankey && (
            <EmptyState
              title="Baseline Sankey unavailable"
              body="Run a raw signal export with complete sessions first."
            />
          )}
          {data?.report.canDrawBaselineSankey && !run && (
            <EmptyState
              title="Run the replay first"
              body="Baseline Sankey uses the recomputed flow states from the replay pipeline."
            />
          )}
          {run && (
            <>
              <SankeyHealthPanel run={run} />
              <FlowSankey run={run} />
              <FlowTransitions run={run} />
            </>
          )}
        </TabsContent>

        <TabsContent value="impact" className="space-y-6">
          <DdaImpactSankey data={data} />
          <TreatmentImpactPanel data={data} />
        </TabsContent>

        <TabsContent value="howto" className="space-y-6">
          <HowToUsePanel />
        </TabsContent>

        <TabsContent value="flow" className="space-y-6">
          <AnalysisFlowPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">{body}</CardContent>
    </Card>
  );
}

function RunErrors({ run }: { run: PipelineRunWithReports }) {
  return (
    <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-xs">
      <p className="mb-1 font-medium text-amber-700 dark:text-amber-400">
        Import notes ({run.errors.length})
      </p>
      <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
        {run.errors.slice(0, 5).map((e, idx) => (
          <li key={idx}>
            {e.stepId ? (
              <span className="mr-1 font-mono text-[10px] uppercase text-muted-foreground/70">
                {e.stepId}
              </span>
            ) : null}
            {e.message}
          </li>
        ))}
        {run.errors.length > 5 && (
          <li className="text-muted-foreground/70">
            +{run.errors.length - 5} more — see Step Inspector.
          </li>
        )}
      </ul>
    </div>
  );
}
