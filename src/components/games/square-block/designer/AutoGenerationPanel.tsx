'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Wand2,
  Layers,
  Target,
  Lock,
  Snowflake,
  FlipHorizontal,
} from 'lucide-react';
import {
  SquareBlock,
  DesignedLevel,
} from '@/types/squareBlock';
import { CollectionMetadata } from '@/lib/storage/types';
import { gridKey } from '@/lib/squareGrid';
import {
  calculateMechanicTargetCounts,
  GenerationMechanics,
  GeneratedSquareBlockLevel,
  createDesignedSquareBlockLevelFromGeneration,
  generateBulkSquareBlockLevels,
  generateTargetedSquareBlockLevel,
} from '@/lib/squareBlockGenerator';
import {
  getTapMusicExpectedDifficultyScore,
  loadTapMusicSawtoothConfig,
} from '@/lib/tapMusicDifficultyCurve';

interface AutoGenerationPanelProps {
  blocks: Map<string, SquareBlock>;
  rows: number;
  cols: number;
  setRows: (rows: number) => void;
  setCols: (cols: number) => void;
  setBlocks: (blocks: Map<string, SquareBlock>) => void;
  setHoles: (holes: Set<string>) => void;
  onAddToCollection?: (level: DesignedLevel, collectionId?: string) => void;
  levelNumber: number;
  onLevelNumberChange?: (num: number) => void;
  targetCollectionId?: string;
  collections?: CollectionMetadata[];
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

type MechanicKind = 'gate' | 'ice' | 'mirror';

const DEFAULT_MECHANIC_PERCENT: Record<MechanicKind, number> = {
  gate: 5,
  ice: 5,
  mirror: 5,
};

const MECHANIC_PERCENT_KEYS: Record<MechanicKind, keyof GenerationMechanics> = {
  gate: 'gatePercent',
  ice: 'icePercent',
  mirror: 'mirrorPercent',
};

function generatedToMap(generation: GeneratedSquareBlockLevel): Map<string, SquareBlock> {
  const next = new Map<string, SquareBlock>();
  for (const block of generation.blocks) {
    next.set(gridKey(block.coord), block);
  }
  return next;
}

function getEnabledPercentTotal(mechanics: GenerationMechanics): number {
  return (
    (mechanics.gate ? mechanics.gatePercent ?? 0 : 0) +
    (mechanics.ice ? mechanics.icePercent ?? 0 : 0) +
    (mechanics.mirror ? mechanics.mirrorPercent ?? 0 : 0)
  );
}

function MechanicPercentControl({
  checked,
  percent,
  targetCount,
  onCheckedChange,
  onPercentChange,
  icon: Icon,
  label,
}: {
  checked: boolean;
  percent: number;
  targetCount: number;
  onCheckedChange: (checked: boolean) => void;
  onPercentChange: (percent: number) => void;
  icon: typeof Lock;
  label: string;
}) {
  return (
    <div className="rounded-md border bg-background/40 p-3 text-sm">
      <label className="flex items-center gap-2">
        <Checkbox checked={checked} onCheckedChange={(value) => onCheckedChange(value === true)} />
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span>{label}</span>
      </label>
      <div className="mt-3 flex items-center gap-2">
        <Input
          type="number"
          min={0}
          max={100}
          value={percent}
          disabled={!checked}
          onChange={(event) => onPercentChange(Number(event.target.value) || 0)}
          className="h-8"
        />
        <span className="w-8 text-muted-foreground">%</span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {checked ? `${targetCount} blocks` : 'Off'}
      </p>
    </div>
  );
}

export function AutoGenerationPanel({
  blocks,
  rows,
  cols,
  setRows,
  setCols,
  setBlocks,
  setHoles,
  onAddToCollection,
  levelNumber,
  onLevelNumberChange,
  targetCollectionId,
  collections,
}: AutoGenerationPanelProps) {
  const curveConfig = useMemo(() => loadTapMusicSawtoothConfig(), []);
  const defaultTargetScore = getTapMusicExpectedDifficultyScore(levelNumber, curveConfig).score;

  const [targetRows, setTargetRows] = useState(rows);
  const [targetCols, setTargetCols] = useState(cols);
  const [targetScore, setTargetScore] = useState(defaultTargetScore);
  const [mechanics, setMechanics] = useState<GenerationMechanics>({
    gate: false,
    ice: false,
    mirror: false,
    gatePercent: 0,
    icePercent: 0,
    mirrorPercent: 0,
  });
  const [bulkStart, setBulkStart] = useState(levelNumber);
  const [bulkCount, setBulkCount] = useState(10);
  const [isGeneratingSingle, setIsGeneratingSingle] = useState(false);
  const [isGeneratingBulk, setIsGeneratingBulk] = useState(false);
  const [lastResult, setLastResult] = useState<GeneratedSquareBlockLevel | null>(null);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);

  const blockArray = useMemo(() => Array.from(blocks.values()), [blocks]);
  const hasArtwork = blockArray.length > 0;
  const selectedCollectionName = collections?.find((collection) => collection.id === targetCollectionId)?.name;
  const mechanicTargetCounts = useMemo(
    () => calculateMechanicTargetCounts(blockArray.length, mechanics),
    [blockArray.length, mechanics],
  );
  const mechanicPercentTotal = getEnabledPercentTotal(mechanics);

  const updateMechanic = (key: MechanicKind, value: boolean) => {
    setMechanics((prev) => {
      const percentKey = MECHANIC_PERCENT_KEYS[key];
      if (!value) {
        return { ...prev, [key]: false, [percentKey]: 0 };
      }

      const otherPercentTotal = getEnabledPercentTotal({ ...prev, [key]: false });
      const currentPercent = Number(prev[percentKey]) || 0;
      const fallbackPercent = Math.min(DEFAULT_MECHANIC_PERCENT[key], Math.max(0, 100 - otherPercentTotal));
      const nextPercent = currentPercent > 0 ? currentPercent : fallbackPercent;

      return {
        ...prev,
        [key]: nextPercent > 0,
        [percentKey]: clampNumber(nextPercent, 0, Math.max(0, 100 - otherPercentTotal)),
      };
    });
  };

  const updateMechanicPercent = (key: MechanicKind, value: number) => {
    setMechanics((prev) => {
      const percentKey = MECHANIC_PERCENT_KEYS[key];
      const otherPercentTotal = getEnabledPercentTotal({ ...prev, [key]: false });
      const maxPercent = Math.max(0, 100 - otherPercentTotal);
      const nextPercent = Math.round(clampNumber(value, 0, maxPercent));

      return {
        ...prev,
        [key]: nextPercent > 0,
        [percentKey]: nextPercent,
      };
    });
  };

  const applyGenerationToDesigner = (generation: GeneratedSquareBlockLevel) => {
    setRows(generation.rows);
    setCols(generation.cols);
    setBlocks(generatedToMap(generation));
    setHoles(new Set());
    setLastResult(generation);
  };

  const generateSingle = async () => {
    if (!hasArtwork) return;
    setIsGeneratingSingle(true);
    setBulkMessage(null);
    await new Promise((resolve) => setTimeout(resolve, 10));

    try {
      const generation = generateTargetedSquareBlockLevel({
        sourceRows: rows,
        sourceCols: cols,
        sourceBlocks: blockArray,
        targetRows,
        targetCols,
        targetScore,
        mechanics,
      });

      if (generation) {
        applyGenerationToDesigner(generation);
      }
    } finally {
      setIsGeneratingSingle(false);
    }
  };

  const generateBulk = async () => {
    if (!hasArtwork || !onAddToCollection) return;
    setIsGeneratingBulk(true);
    setBulkMessage(null);
    await new Promise((resolve) => setTimeout(resolve, 10));

    try {
      const results = generateBulkSquareBlockLevels({
        sourceRows: rows,
        sourceCols: cols,
        sourceBlocks: blockArray,
        targetRows,
        targetCols,
        mechanics,
        tolerance: 4,
        maxAttempts: 160,
        startLevelNumber: bulkStart,
        count: bulkCount,
        getTargetScore: (num) => getTapMusicExpectedDifficultyScore(num, curveConfig).score,
      });

      for (const result of results) {
        const designedLevel = createDesignedSquareBlockLevelFromGeneration(
          result.generation,
          result.levelNumber,
          `Level ${result.levelNumber}`,
        );
        onAddToCollection(designedLevel, targetCollectionId);
      }

      if (results[0]) {
        applyGenerationToDesigner(results[0].generation);
        onLevelNumberChange?.(results[0].levelNumber);
      }

      setBulkMessage(`Generated ${results.length} of ${bulkCount} levels${selectedCollectionName ? ` into ${selectedCollectionName}` : ''}.`);
    } finally {
      setIsGeneratingBulk(false);
    }
  };

  const useCurveTarget = () => {
    setTargetScore(getTapMusicExpectedDifficultyScore(levelNumber, curveConfig).score);
  };

  return (
    <div className="rounded-lg border bg-muted/20 p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-medium">
            <Wand2 className="h-4 w-4" />
            Auto Redesign
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Start from the current colored grid, resize the artwork, then search for a solvable design near a target score.
          </p>
        </div>
        <Badge variant="outline">{blockArray.length} source blocks</Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Rows</Label>
          <Input
            type="number"
            min={3}
            max={50}
            value={targetRows}
            onChange={(event) => setTargetRows(clampNumber(Number(event.target.value) || 3, 3, 50))}
            className="h-8"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Columns</Label>
          <Input
            type="number"
            min={3}
            max={50}
            value={targetCols}
            onChange={(event) => setTargetCols(clampNumber(Number(event.target.value) || 3, 3, 50))}
            className="h-8"
          />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Difficulty Score</Label>
            <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[10px]" onClick={useCurveTarget}>
              Curve
            </Button>
          </div>
          <Input
            type="number"
            min={0}
            max={100}
            value={targetScore}
            onChange={(event) => setTargetScore(clampNumber(Number(event.target.value) || 0, 0, 100))}
            className="h-8"
          />
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <MechanicPercentControl
          checked={mechanics.gate}
          percent={mechanics.gatePercent ?? 0}
          targetCount={mechanicTargetCounts.gate}
          onCheckedChange={(value) => updateMechanic('gate', value)}
          onPercentChange={(value) => updateMechanicPercent('gate', value)}
          icon={Lock}
          label="Gate"
        />
        <MechanicPercentControl
          checked={mechanics.ice}
          percent={mechanics.icePercent ?? 0}
          targetCount={mechanicTargetCounts.ice}
          onCheckedChange={(value) => updateMechanic('ice', value)}
          onPercentChange={(value) => updateMechanicPercent('ice', value)}
          icon={Snowflake}
          label="Ice"
        />
        <MechanicPercentControl
          checked={mechanics.mirror}
          percent={mechanics.mirrorPercent ?? 0}
          targetCount={mechanicTargetCounts.mirror}
          onCheckedChange={(value) => updateMechanic('mirror', value)}
          onPercentChange={(value) => updateMechanicPercent('mirror', value)}
          icon={FlipHorizontal}
          label="Mirror"
        />
      </div>
      <div className="flex flex-wrap items-center gap-3 rounded-md bg-background/60 px-3 py-2 text-xs text-muted-foreground">
        <span>Total mechanics: <span className="font-mono text-foreground">{mechanicPercentTotal}%</span></span>
        <span>Normal: <span className="font-mono text-foreground">{mechanicTargetCounts.normal}</span></span>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          onClick={generateSingle}
          disabled={!hasArtwork || isGeneratingSingle || isGeneratingBulk}
          size="sm"
          className="flex-1"
        >
          <Target className="h-4 w-4 mr-2" />
          {isGeneratingSingle ? 'Generating...' : 'Generate This Level'}
        </Button>
      </div>

      {lastResult && (
        <div className="grid gap-2 rounded-md bg-background/60 p-3 text-xs sm:grid-cols-4">
          <div>
            <span className="text-muted-foreground">Score</span>
            <p className="font-mono font-semibold">{lastResult.difficultyBreakdown.score}/100</p>
          </div>
          <div>
            <span className="text-muted-foreground">Target Delta</span>
            <p className="font-mono font-semibold">{lastResult.scoreDelta}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Attempts</span>
            <p className="font-mono font-semibold">{lastResult.attempts}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Mechanics</span>
            <p className="font-mono font-semibold">
              {lastResult.mechanicCounts.gate}G / {lastResult.mechanicCounts.ice}I / {lastResult.mechanicCounts.mirror}M
            </p>
          </div>
        </div>
      )}

      <div className="border-t pt-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Layers className="h-4 w-4" />
          Bulk Generate From Curve
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Start Level</Label>
            <Input
              type="number"
              min={1}
              max={10000}
              value={bulkStart}
              onChange={(event) => setBulkStart(clampNumber(Number(event.target.value) || 1, 1, 10000))}
              className="h-8"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Count</Label>
            <Input
              type="number"
              min={1}
              max={500}
              value={bulkCount}
              onChange={(event) => setBulkCount(clampNumber(Number(event.target.value) || 1, 1, 500))}
              className="h-8"
            />
          </div>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={generateBulk}
          disabled={!hasArtwork || !onAddToCollection || isGeneratingBulk || isGeneratingSingle}
          className="w-full"
        >
          <Layers className="h-4 w-4 mr-2" />
          {isGeneratingBulk ? 'Generating Bulk...' : 'Generate Bulk to Collection'}
        </Button>
        {bulkMessage && <p className="text-xs text-muted-foreground">{bulkMessage}</p>}
        {!hasArtwork && <p className="text-xs text-amber-500">Import or draw a colored grid first.</p>}
      </div>
    </div>
  );
}
