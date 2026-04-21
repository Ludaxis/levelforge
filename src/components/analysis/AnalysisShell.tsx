'use client';

import { useCallback, useState } from 'react';
import { AdapterSelector } from './AdapterSelector';
import { DataImporter, type ImportedData } from './DataImporter';
import { PipelineStrip } from './PipelineStrip';
import { StepInspector } from './StepInspector';
import { WhatIfPanel } from './WhatIfPanel';
import { ResultsOverview } from './ResultsOverview';
import { UserTimeline } from './UserTimeline';
import { FlowTransitions } from './FlowTransitions';
import { FlowSankey } from './FlowSankey';
import {
  getAdapter,
  DEFAULT_ADAPTER_ID,
} from '@/lib/cadence/adapters';
import { cloneDefaultConfig } from '@/lib/cadence/defaultConfig';
import { runPipeline, type PipelineRunWithReports } from '@/lib/cadence/pipeline';
import type { CadenceConfig, PipelineStepId } from '@/lib/cadence/types';

export function AnalysisShell() {
  const [adapterId, setAdapterId] = useState(DEFAULT_ADAPTER_ID);
  const [config, setConfig] = useState<CadenceConfig>(() => cloneDefaultConfig());
  const [data, setData] = useState<ImportedData | null>(null);
  const [run, setRun] = useState<PipelineRunWithReports | null>(null);
  const [running, setRunning] = useState(false);
  const [selectedStepId, setSelectedStepId] = useState<PipelineStepId | null>(
    null
  );

  const adapter = getAdapter(adapterId) ?? getAdapter(DEFAULT_ADAPTER_ID)!;

  const handleRun = useCallback(async () => {
    if (!data) return;
    setRunning(true);
    try {
      const result = await runPipeline({
        adapter,
        config,
        rawRows: data.rows,
      });
      setRun(result);
      setSelectedStepId(result.steps[0]?.stepId ?? null);
    } finally {
      setRunning(false);
    }
  }, [adapter, config, data]);

  const handleClear = useCallback(() => {
    setData(null);
    setRun(null);
    setSelectedStepId(null);
  }, []);

  const handleResetConfig = useCallback(() => {
    setConfig(cloneDefaultConfig());
  }, []);

  return (
    <div className="space-y-6">
      <AdapterSelector value={adapterId} onChange={setAdapterId} />

      <DataImporter
        adapter={adapter}
        data={data}
        running={running}
        onImport={setData}
        onClear={handleClear}
        onRun={handleRun}
      />

      <ResultsOverview run={run} />

      <PipelineStrip
        run={run}
        selectedStepId={selectedStepId}
        onSelectStep={(id) => setSelectedStepId(id as PipelineStepId)}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <StepInspector run={run} stepId={selectedStepId} />
        <WhatIfPanel
          config={config}
          onChange={setConfig}
          onReset={handleResetConfig}
        />
      </div>

      <UserTimeline run={run} />

      <FlowSankey run={run} />

      <FlowTransitions run={run} />
    </div>
  );
}
