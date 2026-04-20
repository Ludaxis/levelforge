'use client';

import { useRef, useState } from 'react';
import { Sliders, RotateCcw, Download, Upload } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { DEFAULT_CADENCE_CONFIG } from '@/lib/cadence/defaultConfig';
import type { CadenceConfig } from '@/lib/cadence/types';

interface WhatIfPanelProps {
  config: CadenceConfig;
  onChange: (config: CadenceConfig) => void;
  onReset: () => void;
}

export function WhatIfPanel({ config, onChange, onReset }: WhatIfPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const set = <K extends keyof CadenceConfig['adjustmentEngine']>(
    key: K,
    value: CadenceConfig['adjustmentEngine'][K]
  ) => {
    onChange({
      ...config,
      adjustmentEngine: { ...config.adjustmentEngine, [key]: value },
    });
  };

  const setFlow = <K extends keyof CadenceConfig['flowDetector']>(
    key: K,
    value: CadenceConfig['flowDetector'][K]
  ) => {
    onChange({
      ...config,
      flowDetector: { ...config.flowDetector, [key]: value },
    });
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(config, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cadence-config-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImport = async (file: File) => {
    setLoadError(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Partial<CadenceConfig>;
      if (
        !parsed.adjustmentEngine ||
        !parsed.flowDetector ||
        !parsed.playerModel
      ) {
        throw new Error(
          'Config missing required sections (playerModel / flowDetector / adjustmentEngine).'
        );
      }
      onChange({
        playerModel: {
          ...DEFAULT_CADENCE_CONFIG.playerModel,
          ...parsed.playerModel,
        },
        flowDetector: {
          ...DEFAULT_CADENCE_CONFIG.flowDetector,
          ...parsed.flowDetector,
        },
        adjustmentEngine: {
          ...DEFAULT_CADENCE_CONFIG.adjustmentEngine,
          ...parsed.adjustmentEngine,
        },
      });
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Invalid JSON');
    }
  };

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Sliders className="h-5 w-5 text-primary" />
            What-If Tuning
          </span>
          <div className="flex items-center gap-1">
            <input
              ref={inputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleImport(file);
                if (inputRef.current) inputRef.current.value = '';
              }}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => inputRef.current?.click()}
              title="Load config from JSON"
            >
              <Upload className="mr-1 h-3.5 w-3.5" />
              Load
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleExport}
              title="Save config to JSON"
            >
              <Download className="mr-1 h-3.5 w-3.5" />
              Save
            </Button>
            <Button variant="ghost" size="sm" onClick={onReset}>
              <RotateCcw className="mr-1 h-3.5 w-3.5" />
              Defaults
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {loadError && (
          <p className="rounded border border-destructive/50 bg-destructive/10 px-2 py-1 text-xs text-destructive">
            {loadError}
          </p>
        )}
        <SliderRow
          label="Target win rate (low)"
          value={config.adjustmentEngine.targetWinRateMin}
          min={0.1}
          max={0.5}
          step={0.01}
          onChange={(v) => set('targetWinRateMin', v)}
          format={(v) => `${(v * 100).toFixed(0)}%`}
          hint={`Default ${fmtPct(DEFAULT_CADENCE_CONFIG.adjustmentEngine.targetWinRateMin)}`}
        />
        <SliderRow
          label="Target win rate (high)"
          value={config.adjustmentEngine.targetWinRateMax}
          min={0.5}
          max={0.9}
          step={0.01}
          onChange={(v) => set('targetWinRateMax', v)}
          format={(v) => `${(v * 100).toFixed(0)}%`}
          hint={`Default ${fmtPct(DEFAULT_CADENCE_CONFIG.adjustmentEngine.targetWinRateMax)}`}
        />
        <SliderRow
          label="Frustration relief threshold"
          value={config.adjustmentEngine.frustrationReliefThreshold}
          min={0.3}
          max={0.95}
          step={0.01}
          onChange={(v) => set('frustrationReliefThreshold', v)}
          format={(v) => v.toFixed(2)}
          hint={`Default ${DEFAULT_CADENCE_CONFIG.adjustmentEngine.frustrationReliefThreshold}`}
        />
        <SliderRow
          label="Loss streak threshold"
          value={config.adjustmentEngine.lossStreakThreshold}
          min={2}
          max={8}
          step={1}
          onChange={(v) => set('lossStreakThreshold', v)}
          format={(v) => `${v}`}
          hint={`Default ${DEFAULT_CADENCE_CONFIG.adjustmentEngine.lossStreakThreshold}`}
        />
        <SliderRow
          label="Win streak threshold"
          value={config.adjustmentEngine.winStreakThreshold}
          min={3}
          max={10}
          step={1}
          onChange={(v) => set('winStreakThreshold', v)}
          format={(v) => `${v}`}
          hint={`Default ${DEFAULT_CADENCE_CONFIG.adjustmentEngine.winStreakThreshold}`}
        />
        <SliderRow
          label="Min sessions before active"
          value={config.adjustmentEngine.minSessionsBeforeActive}
          min={0}
          max={15}
          step={1}
          onChange={(v) => set('minSessionsBeforeActive', v)}
          format={(v) => `${v}`}
          hint={`Default ${DEFAULT_CADENCE_CONFIG.adjustmentEngine.minSessionsBeforeActive}`}
        />
        <SliderRow
          label="Max delta per adjustment"
          value={config.adjustmentEngine.maxDeltaPerAdjustment}
          min={0.05}
          max={0.3}
          step={0.01}
          onChange={(v) => set('maxDeltaPerAdjustment', v)}
          format={(v) => `${(v * 100).toFixed(0)}%`}
          hint={`Default ${fmtPct(DEFAULT_CADENCE_CONFIG.adjustmentEngine.maxDeltaPerAdjustment)}`}
        />

        <div className="h-px bg-border" />

        <SliderRow
          label="Hysteresis (ticks to confirm)"
          value={config.flowDetector.hysteresisCount}
          min={1}
          max={6}
          step={1}
          onChange={(v) => setFlow('hysteresisCount', v)}
          format={(v) => `${v}`}
          hint={`Default ${DEFAULT_CADENCE_CONFIG.flowDetector.hysteresisCount}`}
        />
        <SliderRow
          label="EMA smoothing α"
          value={config.flowDetector.exponentialAlpha}
          min={0.1}
          max={0.7}
          step={0.01}
          onChange={(v) => setFlow('exponentialAlpha', v)}
          format={(v) => v.toFixed(2)}
          hint={`Default ${DEFAULT_CADENCE_CONFIG.flowDetector.exponentialAlpha}`}
        />
      </CardContent>
    </Card>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
  hint?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm">{label}</Label>
        <span className="font-mono text-xs">{format(value)}</span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v[0])}
      />
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function fmtPct(v: number): string {
  return `${(v * 100).toFixed(0)}%`;
}
