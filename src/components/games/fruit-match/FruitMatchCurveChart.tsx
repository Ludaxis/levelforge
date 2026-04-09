'use client';

import { useMemo, useState, useCallback } from 'react';
import {
  ComposedChart,
  ScatterChart,
  Line,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
  Tooltip,
  Area,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { TrendingUp, Settings2, RotateCcw } from 'lucide-react';
import {
  DesignedFruitMatchLevel,
  DifficultyTier,
} from '@/types/fruitMatch';

// ============================================================================
// Types
// ============================================================================

/**
 * A sawtooth phase defines a repeating cycle of difficulty values.
 * Each value is a difficulty score (0-100) for that position in the cycle.
 *
 * The classic 10-level cycle follows the industry pattern:
 *   gradual rise → mid-cycle spike (pos 5) → dip → second rise → peak (pos 10)
 * Then the next cycle starts with a sharp drop back to easy (the "victory lap").
 */
export interface SawtoothPhase {
  cycleLength: number;       // how many levels in one cycle
  difficulties: number[];    // difficulty score (0-100) for each position
}

export interface SawtoothConfig {
  onboardingLength: number;
  onboarding: SawtoothPhase;
  main: SawtoothPhase;
  /** How much difficulty increases per cycle (added to the base pattern). */
  baselineIncrease: number;
  /** Skill growth rate per level for flow state analysis. */
  skillGrowthRate: number;
}

// Research-based defaults:
// Onboarding (5-level gentle ramp): trivial → easy → easy → easy-medium → medium
// Main (10-level sawtooth per Toon Blast / Royal Match pattern):
//   Pos 1: 15 (victory lap after previous peak)
//   Pos 2: 22 (recovery)
//   Pos 3: 32 (rising)
//   Pos 4: 42 (testing)
//   Pos 5: 60 (mid-cycle hard spike)
//   Pos 6: 35 (brief dip — relief)
//   Pos 7: 40 (continued relief)
//   Pos 8: 52 (rising tension)
//   Pos 9: 62 (hard — sustained pressure)
//   Pos 10: 75 (cycle peak — super hard)
export const DEFAULT_SAWTOOTH_CONFIG: SawtoothConfig = {
  onboardingLength: 10,
  onboarding: {
    cycleLength: 5,
    difficulties: [5, 10, 18, 25, 35],
  },
  main: {
    cycleLength: 10,
    difficulties: [15, 22, 32, 42, 60, 35, 40, 52, 62, 75],
  },
  baselineIncrease: 2,
  skillGrowthRate: 0.6,
};

interface FruitMatchCurveChartProps {
  levels: DesignedFruitMatchLevel[];
  onLevelClick?: (levelNumber: number) => void;
  config?: SawtoothConfig;
}

type FlowZone = 'flow' | 'boredom' | 'frustration';

type TargetMatch = 'on-target' | 'too-easy' | 'too-hard';

interface ChartDataPoint {
  level: number;
  difficulty: number | null;       // actual designed difficulty (0-100)
  expected: number;                // expected difficulty from sawtooth + envelope
  skillLevel: number;
  actualTier?: DifficultyTier;
  actualLevel?: DesignedFruitMatchLevel;
  isOnboarding: boolean;
  targetMatch?: TargetMatch;       // actual vs expected sawtooth (for main chart)
  flowZone?: FlowZone;            // actual vs skill (for scatter plot only)
}

// ============================================================================
// Constants
// ============================================================================

const TIER_COLORS: Record<DifficultyTier, string> = {
  trivial: 'bg-gray-500/20 text-gray-400',
  easy: 'bg-green-500/20 text-green-400',
  medium: 'bg-yellow-500/20 text-yellow-400',
  hard: 'bg-orange-500/20 text-orange-400',
  expert: 'bg-red-500/20 text-red-400',
  nightmare: 'bg-purple-500/20 text-purple-400',
};

const TIER_DOT_COLORS: Record<DifficultyTier, string> = {
  trivial: '#6b7280',
  easy: '#22c55e',
  medium: '#eab308',
  hard: '#f97316',
  expert: '#ef4444',
  nightmare: '#a855f7',
};

const FLOW_ZONE_COLORS: Record<FlowZone, string> = {
  flow: '#22c55e',
  boredom: '#06b6d4',
  frustration: '#f97316',
};

// ============================================================================
// Helpers
// ============================================================================

function scoreToTier(score: number): DifficultyTier {
  if (score < 20) return 'trivial';
  if (score < 35) return 'easy';
  if (score < 50) return 'medium';
  if (score < 65) return 'hard';
  if (score < 80) return 'expert';
  return 'nightmare';
}

/** Compare actual difficulty vs expected sawtooth — for main chart tooltip/dots. */
function getTargetMatch(actual: number, expected: number): TargetMatch {
  const diff = actual - expected;
  if (diff > 10) return 'too-hard';
  if (diff < -10) return 'too-easy';
  return 'on-target';
}

/** Compare difficulty vs skill — for flow state scatter plot only. */
function getFlowZone(difficulty: number, skill: number): FlowZone {
  const diff = difficulty - skill;
  if (diff > 15) return 'frustration';
  if (diff < -15) return 'boredom';
  return 'flow';
}

/** Get expected difficulty score for a level number from sawtooth + envelope. */
function getExpectedDifficulty(levelNumber: number, config: SawtoothConfig): { score: number; isOnboarding: boolean } {
  if (levelNumber <= config.onboardingLength) {
    const phase = config.onboarding;
    const pos = (levelNumber - 1) % phase.cycleLength;
    const cycleIndex = Math.floor((levelNumber - 1) / phase.cycleLength);
    const base = phase.difficulties[pos] ?? 20;
    return { score: Math.min(100, base + cycleIndex * config.baselineIncrease), isOnboarding: true };
  }
  const phase = config.main;
  const offset = levelNumber - config.onboardingLength - 1;
  const pos = offset % phase.cycleLength;
  const cycleIndex = Math.floor(offset / phase.cycleLength);
  // Envelope: shift the whole pattern up by baselineIncrease per cycle
  const base = phase.difficulties[pos] ?? 40;
  return { score: Math.min(100, base + cycleIndex * config.baselineIncrease), isOnboarding: false };
}

// ============================================================================
// localStorage
// ============================================================================

const STORAGE_KEY = 'fruit-match-sawtooth-config';

function loadSavedConfig(): SawtoothConfig {
  if (typeof window === 'undefined') return DEFAULT_SAWTOOTH_CONFIG;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SAWTOOTH_CONFIG;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_SAWTOOTH_CONFIG,
      ...parsed,
      onboarding: { ...DEFAULT_SAWTOOTH_CONFIG.onboarding, ...parsed.onboarding },
      main: { ...DEFAULT_SAWTOOTH_CONFIG.main, ...parsed.main },
    };
  } catch {
    return DEFAULT_SAWTOOTH_CONFIG;
  }
}

// ============================================================================
// Config Editor
// ============================================================================

function PhaseEditor({
  label,
  phase,
  onChange,
}: {
  label: string;
  phase: SawtoothPhase;
  onChange: (phase: SawtoothPhase) => void;
}) {
  const setCycleLength = (len: number) => {
    const clamped = Math.max(2, Math.min(20, len));
    let diffs = [...phase.difficulties];
    if (clamped > diffs.length) {
      const last = diffs[diffs.length - 1] ?? 40;
      while (diffs.length < clamped) diffs.push(last);
    } else {
      diffs = diffs.slice(0, clamped);
    }
    onChange({ cycleLength: clamped, difficulties: diffs });
  };

  const updateDifficulty = (index: number, value: number) => {
    const newDiffs = [...phase.difficulties];
    newDiffs[index] = Math.max(0, Math.min(100, value));
    onChange({ ...phase, difficulties: newDiffs });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium">{label}</span>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground">Cycle:</span>
          <Input
            type="number"
            min={2}
            max={20}
            value={phase.cycleLength}
            onChange={(e) => setCycleLength(Number(e.target.value) || 5)}
            className="h-6 w-14 text-[10px] px-1 text-center"
          />
          <span className="text-[10px] text-muted-foreground">levels</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        {phase.difficulties.map((diff, i) => (
          <div key={i} className="space-y-0.5">
            <span className="text-[8px] text-muted-foreground text-center block">{i + 1}</span>
            <Input
              type="number"
              min={0}
              max={100}
              value={diff}
              onChange={(e) => updateDifficulty(i, Number(e.target.value) || 0)}
              className="h-6 w-10 text-[9px] px-0.5 text-center"
            />
          </div>
        ))}
      </div>
      {/* Mini sparkline preview of the cycle shape */}
      <div className="flex items-end gap-px h-6">
        {phase.difficulties.map((diff, i) => (
          <div
            key={i}
            className="flex-1 rounded-t-sm"
            style={{
              height: `${Math.max(4, (diff / 100) * 24)}px`,
              backgroundColor: TIER_DOT_COLORS[scoreToTier(diff)],
              opacity: 0.7,
            }}
          />
        ))}
      </div>
    </div>
  );
}

interface CurveTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: ChartDataPoint }>;
}

function FruitMatchCurveTooltip({ active, payload }: CurveTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const dataPoint = payload[0].payload;
  const expectedTier = scoreToTier(dataPoint.expected);

  return (
    <div className="bg-popover border rounded-lg p-3 shadow-lg text-sm">
      <p className="font-medium">Level {dataPoint.level}</p>
      <p className="text-muted-foreground text-xs">
        {dataPoint.isOnboarding ? 'Onboarding' : 'Main'} — Expected: {dataPoint.expected.toFixed(0)}{' '}
        <Badge className={`ml-1 scale-90 ${TIER_COLORS[expectedTier]}`}>{expectedTier}</Badge>
      </p>
      {dataPoint.actualLevel && (
        <>
          <p className="text-muted-foreground text-xs mt-1">
            Actual: <span className="font-mono">{dataPoint.difficulty}/100</span>
            <Badge className={`ml-1 scale-90 ${TIER_COLORS[dataPoint.actualTier!]}`}>{dataPoint.actualTier}</Badge>
          </p>
          {dataPoint.targetMatch && (
            <p
              className="text-xs mt-1 font-medium"
              style={{
                color:
                  dataPoint.targetMatch === 'on-target'
                    ? '#22c55e'
                    : dataPoint.targetMatch === 'too-easy'
                      ? '#06b6d4'
                      : '#f97316',
              }}
            >
              {dataPoint.targetMatch === 'on-target' && 'On Target'}
              {dataPoint.targetMatch === 'too-easy' && 'Below Expected'}
              {dataPoint.targetMatch === 'too-hard' && 'Above Expected'}
            </p>
          )}
        </>
      )}
      {!dataPoint.actualLevel && <p className="text-xs text-muted-foreground mt-1">Not yet designed</p>}
    </div>
  );
}

function SawtoothConfigEditor({
  config,
  onChange,
  onReset,
}: {
  config: SawtoothConfig;
  onChange: (config: SawtoothConfig) => void;
  onReset: () => void;
}) {
  return (
    <div className="space-y-4 p-3 bg-muted/30 rounded-lg border border-border">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">Sawtooth Configuration</span>
        <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={onReset}>
          <RotateCcw className="h-3 w-3 mr-1" />
          Reset
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground whitespace-nowrap">Onboarding ends at level:</span>
        <Input
          type="number"
          min={0}
          max={500}
          value={config.onboardingLength}
          onChange={(e) => onChange({ ...config, onboardingLength: Math.max(0, Number(e.target.value) || 0) })}
          className="h-6 w-16 text-[10px] px-1 text-center"
        />
      </div>

      {config.onboardingLength > 0 && (
        <PhaseEditor
          label="Onboarding Pattern (difficulty scores 0-100)"
          phase={config.onboarding}
          onChange={(onboarding) => onChange({ ...config, onboarding })}
        />
      )}

      <PhaseEditor
        label="Main Pattern (difficulty scores 0-100)"
        phase={config.main}
        onChange={(main) => onChange({ ...config, main })}
      />

      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground whitespace-nowrap">Baseline +/cycle:</span>
          <Input
            type="number"
            min={0}
            max={10}
            step={0.5}
            value={config.baselineIncrease}
            onChange={(e) => onChange({ ...config, baselineIncrease: Math.max(0, Math.min(10, Number(e.target.value) || 0)) })}
            className="h-6 w-14 text-[10px] px-1 text-center"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground whitespace-nowrap">Skill growth:</span>
          <Input
            type="number"
            min={0.1}
            max={3}
            step={0.1}
            value={config.skillGrowthRate}
            onChange={(e) => onChange({ ...config, skillGrowthRate: Math.max(0.1, Math.min(3, Number(e.target.value) || 0.6)) })}
            className="h-6 w-14 text-[10px] px-1 text-center"
          />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function FruitMatchCurveChart({
  levels,
  onLevelClick,
  config: externalConfig,
}: FruitMatchCurveChartProps) {
  const [savedConfig, setSavedConfig] = useState<SawtoothConfig>(() => loadSavedConfig());
  const [showSettings, setShowSettings] = useState(false);

  const config = externalConfig ?? savedConfig;

  const handleConfigChange = useCallback((newConfig: SawtoothConfig) => {
    setSavedConfig(newConfig);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newConfig));
    } catch { /* ignore quota errors */ }
  }, []);

  const handleReset = useCallback(() => {
    setSavedConfig(DEFAULT_SAWTOOTH_CONFIG);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  // Level lookup
  const levelMap = useMemo(() => {
    const map = new Map<number, DesignedFruitMatchLevel>();
    levels.forEach((l) => map.set(l.levelNumber, l));
    return map;
  }, [levels]);

  const globalMax = useMemo(() => {
    if (levels.length === 0) return 20;
    return Math.max(...levels.map((l) => l.levelNumber));
  }, [levels]);

  // Range selector
  const [rangeStart, setRangeStart] = useState(1);
  const [rangeEnd, setRangeEnd] = useState(100);
  const effectiveRangeEnd = Math.max(rangeEnd, Math.min(globalMax + 10, 10000));

  const visibleStart = Math.max(1, rangeStart);
  const visibleEnd = Math.max(visibleStart + 1, effectiveRangeEnd);
  const visibleCount = visibleEnd - visibleStart + 1;

  // Chart data — windowed + sampled for large ranges
  const chartData = useMemo((): ChartDataPoint[] => {
    const data: ChartDataPoint[] = [];
    const step = visibleCount > 500 ? Math.ceil(visibleCount / 500) : 1;

    for (let levelNum = visibleStart; levelNum <= visibleEnd; levelNum += step) {
      const { score: expected, isOnboarding } = getExpectedDifficulty(levelNum, config);
      const actualLevel = levelMap.get(levelNum);
      const difficulty = actualLevel ? actualLevel.metrics.difficultyScore : null;
      const actualTier = difficulty !== null ? scoreToTier(difficulty) : undefined;
      const skillLevel = 10 + (levelNum - 1) * config.skillGrowthRate;
      const targetMatch = difficulty !== null ? getTargetMatch(difficulty, expected) : undefined;
      const flowZone = difficulty !== null ? getFlowZone(difficulty, skillLevel) : undefined;

      data.push({ level: levelNum, difficulty, expected, skillLevel, actualTier, actualLevel, isOnboarding, targetMatch, flowZone });
    }

    // Ensure all designed levels in range are included even when sampling
    if (step > 1) {
      const sampled = new Set(data.map((d) => d.level));
      for (const level of levels) {
        if (level.levelNumber >= visibleStart && level.levelNumber <= visibleEnd && !sampled.has(level.levelNumber)) {
          const { score: expected, isOnboarding } = getExpectedDifficulty(level.levelNumber, config);
          const skillLevel = 10 + (level.levelNumber - 1) * config.skillGrowthRate;
          data.push({
            level: level.levelNumber,
            difficulty: level.metrics.difficultyScore,
            expected,
            skillLevel,
            actualTier: scoreToTier(level.metrics.difficultyScore),
            actualLevel: level,
            isOnboarding,
            targetMatch: getTargetMatch(level.metrics.difficultyScore, expected),
            flowZone: getFlowZone(level.metrics.difficultyScore, skillLevel),
          });
        }
      }
      data.sort((a, b) => a.level - b.level);
    }

    return data;
  }, [visibleStart, visibleEnd, visibleCount, config, levelMap, levels]);

  // Stats (all levels, not just visible)
  const stats = useMemo(() => {
    let matching = 0, tooEasy = 0, tooHard = 0;
    for (const l of levels) {
      const { score: expected } = getExpectedDifficulty(l.levelNumber, config);
      const diff = l.metrics.difficultyScore - expected;
      if (Math.abs(diff) <= 10) matching++;
      else if (diff < -10) tooEasy++;
      else tooHard++;
    }
    return { matching, tooEasy, tooHard, total: levels.length };
  }, [levels, config]);

  const tickInterval = visibleCount <= 30 ? 1 : visibleCount <= 60 ? 5 : visibleCount <= 200 ? 10 : visibleCount <= 500 ? 20 : 50;

  // Tier bands
  const tierBands = [
    { label: 'trivial', y: 20, color: TIER_DOT_COLORS.trivial },
    { label: 'easy', y: 35, color: TIER_DOT_COLORS.easy },
    { label: 'medium', y: 50, color: TIER_DOT_COLORS.medium },
    { label: 'hard', y: 65, color: TIER_DOT_COLORS.hard },
    { label: 'expert', y: 80, color: TIER_DOT_COLORS.expert },
  ];

  const onboardingEnd = config.onboardingLength;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Difficulty Curve
            </CardTitle>
            {!externalConfig && (
              <Button
                variant={showSettings ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 text-xs"
                onClick={() => setShowSettings(!showSettings)}
              >
                <Settings2 className="h-3.5 w-3.5 mr-1" />
                Settings
              </Button>
            )}
          </div>
          <CardDescription>
            Sawtooth difficulty curve with flow state analysis
          </CardDescription>
        </CardHeader>
        <CardContent>
          {showSettings && !externalConfig && (
            <div className="mb-4">
              <SawtoothConfigEditor config={config} onChange={handleConfigChange} onReset={handleReset} />
            </div>
          )}

          {/* Range selector */}
          <div className="flex items-center gap-3 mb-3 text-xs">
            <span className="text-muted-foreground whitespace-nowrap">Levels</span>
            <Input
              type="number" min={1} max={10000} value={rangeStart}
              onChange={(e) => setRangeStart(Math.max(1, Math.min(effectiveRangeEnd - 1, Number(e.target.value) || 1)))}
              className="h-7 w-20 text-xs text-center"
            />
            <div className="flex-1">
              <Slider
                value={[rangeStart, effectiveRangeEnd]}
                onValueChange={([s, e]) => { setRangeStart(s); setRangeEnd(e); }}
                min={1} max={Math.max(globalMax + 50, effectiveRangeEnd, 100)} step={1} minStepsBetweenThumbs={5}
              />
            </div>
            <Input
              type="number" min={1} max={10000} value={effectiveRangeEnd}
              onChange={(e) => setRangeEnd(Math.max(rangeStart + 1, Math.min(10000, Number(e.target.value) || 100)))}
              className="h-7 w-20 text-xs text-center"
            />
            <span className="text-muted-foreground whitespace-nowrap">({visibleCount})</span>
          </div>

          <div className="h-[400px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chartData}
                margin={{ top: 10, right: 20, bottom: 30, left: 20 }}
                onClick={(e) => {
                  if (e?.activePayload?.[0] && onLevelClick) {
                    const d = e.activePayload[0].payload as ChartDataPoint;
                    if (d.actualLevel) onLevelClick(d.level);
                  }
                }}
              >
                <defs>
                  <linearGradient id="expectedGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(262, 83%, 58%)" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="hsl(262, 83%, 58%)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>

                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="level" tick={{ fontSize: 11 }} tickLine={false} interval={tickInterval - 1}
                  label={{ value: 'Level', position: 'bottom', offset: 15, fontSize: 12 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} tickLine={false}
                  label={{ value: 'Difficulty', angle: -90, position: 'insideLeft', offset: 5, fontSize: 12 }} />
                <Tooltip content={<FruitMatchCurveTooltip />} />

                {/* Tier boundary lines */}
                {tierBands.map((band) => (
                  <ReferenceLine key={band.label} y={band.y} stroke={band.color}
                    strokeDasharray="4 4" strokeOpacity={0.3}
                    label={{ value: band.label, position: 'right', fill: band.color, fontSize: 9, opacity: 0.6 }} />
                ))}

                {/* Onboarding boundary */}
                {onboardingEnd > 0 && onboardingEnd >= visibleStart && onboardingEnd < visibleEnd && (
                  <ReferenceLine x={onboardingEnd} stroke="#6b7280" strokeDasharray="6 3" strokeWidth={1.5}
                    label={{ value: 'Onboarding', position: 'insideTopLeft', fill: '#6b7280', fontSize: 10 }} />
                )}

                {/* Expected sawtooth curve (smooth) */}
                <Area type="monotone" dataKey="expected" stroke="hsl(262, 83%, 58%)"
                  fill="url(#expectedGradient)" strokeWidth={2} strokeDasharray="5 3" name="Expected" dot={false} />

                {/* Skill growth line */}
                <Line type="monotone" dataKey="skillLevel" stroke="#06b6d4"
                  strokeWidth={1.5} strokeDasharray="3 3" dot={false} name="Skill" />

                {/* Actual difficulty line */}
                <Line type="monotone" dataKey="difficulty" stroke="#ffffff"
                  strokeWidth={2} dot={false} connectNulls name="Actual" />

                {/* Dots for designed levels — fill = tier color, stroke = target match */}
                <Scatter dataKey="difficulty" name="Levels">
                  {chartData.map((entry, index) => {
                    const matchColor = entry.targetMatch === 'on-target' ? '#22c55e'
                      : entry.targetMatch === 'too-easy' ? '#06b6d4'
                      : entry.targetMatch === 'too-hard' ? '#f97316'
                      : 'transparent';
                    return (
                      <Cell key={`cell-${index}`}
                        fill={entry.actualTier ? TIER_DOT_COLORS[entry.actualTier] : 'transparent'}
                        stroke={entry.actualLevel ? matchColor : 'transparent'}
                        strokeWidth={entry.actualLevel ? 2.5 : 0}
                        r={entry.actualLevel ? 5 : 0}
                        cursor={entry.actualLevel ? 'pointer' : 'default'} />
                    );
                  })}
                </Scatter>
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-3 justify-center mt-3 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-0.5 bg-purple-500 opacity-60" style={{ borderTop: '2px dashed' }} />
              <span className="text-muted-foreground">Expected Sawtooth</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-0.5 bg-white" />
              <span className="text-muted-foreground">Actual</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-0.5 bg-cyan-500 opacity-60" style={{ borderTop: '2px dashed' }} />
              <span className="text-muted-foreground">Skill</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Flow State Analysis */}
      {(() => {
        const designed = chartData.filter((d) => d.actualLevel && d.flowZone);
        if (designed.length === 0) return null;

        const flowCount = designed.filter((d) => d.flowZone === 'flow').length;
        const boredomCount = designed.filter((d) => d.flowZone === 'boredom').length;
        const frustrationCount = designed.filter((d) => d.flowZone === 'frustration').length;
        const total = designed.length;

        const scatterData = designed.map((d) => ({
          skill: d.skillLevel, difficulty: d.difficulty!, flowZone: d.flowZone!, level: d.level, tier: d.actualTier!,
        }));

        const allVals = [...scatterData.map((d) => d.skill), ...scatterData.map((d) => d.difficulty)];
        const minVal = Math.max(0, Math.floor(Math.min(...allVals) - 5));
        const maxVal = Math.min(100, Math.ceil(Math.max(...allVals) + 5));

        return (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Flow State</CardTitle>
                <CardDescription className="text-xs">
                  Skill vs Difficulty. Diagonal = flow. Above = frustration.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 10, right: 20, bottom: 30, left: 40 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <ReferenceLine segment={[{ x: minVal, y: minVal }, { x: maxVal, y: maxVal }]}
                        stroke={FLOW_ZONE_COLORS.flow} strokeWidth={2} strokeDasharray="5 5" />
                      <ReferenceLine segment={[{ x: minVal, y: minVal + 15 }, { x: maxVal - 15, y: maxVal }]}
                        stroke={FLOW_ZONE_COLORS.frustration} strokeWidth={1} strokeOpacity={0.5} strokeDasharray="3 3" />
                      <ReferenceLine segment={[{ x: minVal + 15, y: minVal }, { x: maxVal, y: maxVal - 15 }]}
                        stroke={FLOW_ZONE_COLORS.boredom} strokeWidth={1} strokeOpacity={0.5} strokeDasharray="3 3" />
                      <XAxis type="number" dataKey="skill" domain={[minVal, maxVal]} tick={{ fontSize: 10 }}
                        label={{ value: 'Player Skill', position: 'bottom', offset: 15, fontSize: 11 }} />
                      <YAxis type="number" dataKey="difficulty" domain={[minVal, maxVal]} tick={{ fontSize: 10 }}
                        label={{ value: 'Difficulty', angle: -90, position: 'insideLeft', offset: 5, fontSize: 11 }} />
                      <Tooltip content={({ active, payload }) => {
                        if (!active || !payload?.[0]) return null;
                        const d = payload[0].payload;
                        return (
                          <div className="bg-popover border rounded-lg p-2 shadow-lg text-xs">
                            <p className="font-medium">Level {d.level}</p>
                            <p>Skill: {d.skill.toFixed(0)} — Difficulty: {d.difficulty}</p>
                            <p className="font-medium" style={{ color: FLOW_ZONE_COLORS[d.flowZone as FlowZone] }}>
                              {d.flowZone === 'flow' ? 'In Flow' : d.flowZone === 'boredom' ? 'Too Easy' : 'Too Hard'}
                            </p>
                          </div>
                        );
                      }} />
                      <Scatter data={scatterData}>
                        {scatterData.map((entry, i) => (
                          <Cell key={i} fill={FLOW_ZONE_COLORS[entry.flowZone]} stroke="#fff" strokeWidth={1.5} r={5} />
                        ))}
                      </Scatter>
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Zone Distribution</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {([
                  { zone: 'flow' as FlowZone, label: 'Flow', count: flowCount },
                  { zone: 'boredom' as FlowZone, label: 'Too Easy', count: boredomCount },
                  { zone: 'frustration' as FlowZone, label: 'Too Hard', count: frustrationCount },
                ]).map(({ zone, label, count }) => (
                  <div key={zone} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded" style={{ backgroundColor: FLOW_ZONE_COLORS[zone] }} />
                        <span>{label}</span>
                      </div>
                      <span className="font-medium">{count} ({total > 0 ? ((count / total) * 100).toFixed(0) : 0}%)</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div className="h-2 rounded-full" style={{ width: `${total > 0 ? (count / total) * 100 : 0}%`, backgroundColor: FLOW_ZONE_COLORS[zone] }} />
                    </div>
                  </div>
                ))}

                <div className="pt-3 border-t">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Balance</span>
                    {flowCount / Math.max(total, 1) >= 0.6 ? (
                      <Badge className="bg-green-500">Well Balanced</Badge>
                    ) : frustrationCount / Math.max(total, 1) > 0.3 ? (
                      <Badge className="bg-orange-500">Too Frustrating</Badge>
                    ) : boredomCount / Math.max(total, 1) > 0.3 ? (
                      <Badge className="bg-cyan-500">Too Easy</Badge>
                    ) : (
                      <Badge className="bg-yellow-500">Needs Tuning</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Target: 60%+ in flow. Recovery dips into boredom zone, spikes push toward frustration.
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-2">
                  <div className="p-2 bg-muted/50 rounded text-center">
                    <p className="text-lg font-bold">{stats.total}</p>
                    <p className="text-[10px] text-muted-foreground">Levels</p>
                  </div>
                  <div className="p-2 bg-muted/50 rounded text-center">
                    <p className="text-lg font-bold text-green-400">{stats.matching}</p>
                    <p className="text-[10px] text-muted-foreground">On Target</p>
                  </div>
                  <div className="p-2 bg-muted/50 rounded text-center">
                    <p className="text-lg font-bold text-orange-400">{stats.tooHard + stats.tooEasy}</p>
                    <p className="text-[10px] text-muted-foreground">Off Target</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        );
      })()}
    </div>
  );
}
