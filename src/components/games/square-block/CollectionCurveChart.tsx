'use client';

import { useMemo } from 'react';
import {
  ComposedChart,
  ScatterChart,
  Area,
  Line,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
  Tooltip,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, Info } from 'lucide-react';
import {
  DesignedLevel,
  DifficultyTier,
  FlowZone,
  SAWTOOTH_EXPECTED,
  calculateFlowZone,
} from '@/types/squareBlock';
import { SAWTOOTH_CYCLE, DIFFICULTY_TIERS } from '@/lib/constants';

// ============================================================================
// Types
// ============================================================================

export interface SawtoothConfig {
  easyMax: number;
  mediumMax: number;
  hardMax: number;
  expectedPattern: DifficultyTier[];
  totalLevels: number;
  skillGrowthRate: number;
  baselineIncrease: number;
}

export const DEFAULT_SAWTOOTH_CONFIG: SawtoothConfig = {
  easyMax: 24,
  mediumMax: 49,
  hardMax: 74,
  expectedPattern: ['easy', 'easy', 'medium', 'medium', 'hard', 'medium', 'medium', 'hard', 'hard', 'superHard'],
  totalLevels: 100,
  skillGrowthRate: 0.15,
  baselineIncrease: 0.3,
};

interface CollectionCurveChartProps {
  levels: DesignedLevel[];
  onLevelClick?: (levelNumber: number) => void;
  config?: SawtoothConfig;
}

interface ChartDataPoint {
  level: number;
  idealDifficulty: number | null;
  skillLevel: number;
  actualDifficulty: number | null;
  actualLevel?: DesignedLevel;
  tier: DifficultyTier;
  flowZone?: FlowZone;
}

// ============================================================================
// Constants
// ============================================================================

// Map difficulty tiers to chart values (for ideal curve)
const DIFFICULTY_TO_VALUE: Record<DifficultyTier, number> = {
  easy: 2.5,
  medium: 5,
  hard: 7.5,
  superHard: 9,
};

// Scale actual difficulty score (0-100) to chart range (0-12)
const scoreToChartValue = (score: number): number => {
  return (score / 100) * 12;
};

const TIER_COLORS: Record<string, string> = {
  easy: DIFFICULTY_TIERS.easy.color,
  medium: DIFFICULTY_TIERS.medium.color,
  hard: DIFFICULTY_TIERS.hard.color,
  superHard: DIFFICULTY_TIERS.superHard.color,
};

const FLOW_ZONE_COLORS: Record<FlowZone, string> = {
  flow: '#22c55e',
  boredom: '#06b6d4',
  frustration: '#f97316',
};

// ============================================================================
// Component
// ============================================================================

export function CollectionCurveChart({
  levels,
  onLevelClick,
  config = DEFAULT_SAWTOOTH_CONFIG,
}: CollectionCurveChartProps) {
  const maxLevels = config.totalLevels;

  // Helper to get tier from score using config
  const getTierFromScore = (score: number): DifficultyTier => {
    if (score <= config.easyMax) return 'easy';
    if (score <= config.mediumMax) return 'medium';
    if (score <= config.hardMax) return 'hard';
    return 'superHard';
  };

  // Helper to get expected difficulty from position using config
  const getExpectedFromPosition = (levelNumber: number): DifficultyTier => {
    const position = ((levelNumber - 1) % 10);
    return config.expectedPattern[position];
  };

  // Calculate flow zone using config
  const getFlowZoneFromConfig = (score: number, levelNumber: number): FlowZone => {
    const actual = getTierFromScore(score);
    const expected = getExpectedFromPosition(levelNumber);

    if (actual === expected) return 'flow';

    const rank: Record<DifficultyTier, number> = { easy: 1, medium: 2, hard: 3, superHard: 4 };
    return rank[actual] > rank[expected] ? 'frustration' : 'boredom';
  };

  // Generate chart data
  const chartData = useMemo((): ChartDataPoint[] => {
    const data: ChartDataPoint[] = [];
    const numCycles = Math.ceil(maxLevels / 10);

    // Create level lookup
    const levelMap = new Map<number, DesignedLevel>();
    levels.forEach((l) => levelMap.set(l.levelNumber, l));

    for (let cycle = 0; cycle < numCycles; cycle++) {
      SAWTOOTH_CYCLE.forEach((point) => {
        const levelNum = cycle * 10 + point.position;
        if (levelNum > maxLevels) return;

        const baselineOffset = cycle * config.baselineIncrease;
        const idealDifficulty = point.difficulty + baselineOffset;

        const actualLevel = levelMap.get(levelNum);
        let actualDifficulty: number | null = null;
        let flowZone: FlowZone | undefined;

        if (actualLevel) {
          // Use actual difficulty score (0-100) scaled to chart range (0-12)
          actualDifficulty = scoreToChartValue(actualLevel.metrics.difficultyScore) + baselineOffset;
          // Recalculate flow zone using config thresholds
          flowZone = getFlowZoneFromConfig(actualLevel.metrics.difficultyScore, levelNum);
        }

        // Skill grows linearly with level
        const skillLevel = 1 + (levelNum - 1) * config.skillGrowthRate;

        data.push({
          level: levelNum,
          idealDifficulty,
          skillLevel,
          actualDifficulty,
          actualLevel,
          tier: getExpectedFromPosition(levelNum),
          flowZone,
        });
      });
    }

    return data;
  }, [levels, maxLevels, config]);

  // Stats - recalculate flow zones based on config thresholds
  const stats = useMemo(() => {
    let inFlow = 0;
    let inBoredom = 0;
    let inFrustration = 0;

    levels.forEach((l) => {
      const flowZone = getFlowZoneFromConfig(l.metrics.difficultyScore, l.levelNumber);
      if (flowZone === 'flow') inFlow++;
      else if (flowZone === 'boredom') inBoredom++;
      else inFrustration++;
    });

    const coverage = (levels.length / maxLevels) * 100;

    return { inFlow, inBoredom, inFrustration, coverage };
  }, [levels, maxLevels, config]);

  // Tick interval for X axis
  const tickInterval = maxLevels <= 50 ? 5 : maxLevels <= 100 ? 10 : 20;

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length > 0) {
      const data = payload[0].payload as ChartDataPoint;
      return (
        <div className="bg-popover border rounded-lg p-3 shadow-lg">
          <p className="font-medium">Level {data.level}</p>
          <p className="text-sm text-muted-foreground">
            Expected: <Badge className={`ml-1 ${TIER_COLORS[data.tier]}`}>{data.tier}</Badge>
          </p>
          {data.actualLevel && (
            <>
              <p className="text-sm text-muted-foreground mt-1">
                Actual: <Badge className={`ml-1 ${TIER_COLORS[data.actualLevel.metrics.difficulty]}`}>
                  {data.actualLevel.metrics.difficulty}
                </Badge>
                <span className="ml-2 font-mono text-xs">
                  ({data.actualLevel.metrics.difficultyScore}/100)
                </span>
              </p>
              <p className="text-sm mt-1">
                <span className={`font-medium`} style={{ color: FLOW_ZONE_COLORS[data.flowZone!] }}>
                  {data.flowZone === 'flow' && 'In Flow'}
                  {data.flowZone === 'boredom' && 'Too Easy'}
                  {data.flowZone === 'frustration' && 'Too Hard'}
                </span>
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {data.actualLevel.metrics.cellCount} blocks, {data.actualLevel.metrics.holeCount} holes
              </p>
            </>
          )}
          {!data.actualLevel && (
            <p className="text-xs text-muted-foreground mt-1">Not yet designed</p>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Difficulty Curve Analysis
          </CardTitle>
          <CardDescription>
            Compare your designed levels against the ideal sawtooth pattern
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chartData}
                margin={{ top: 10, right: 20, bottom: 30, left: 20 }}
                onClick={(e) => {
                  if (e && e.activePayload && e.activePayload[0]) {
                    const data = e.activePayload[0].payload as ChartDataPoint;
                    if (data.actualLevel && onLevelClick) {
                      onLevelClick(data.level);
                    }
                  }
                }}
              >
                <defs>
                  <linearGradient id="squareIdealGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(262, 83%, 58%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(262, 83%, 58%)" stopOpacity={0.05} />
                  </linearGradient>
                </defs>

                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />

                <XAxis
                  dataKey="level"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  interval={tickInterval - 1}
                  label={{ value: 'Level Number', position: 'bottom', offset: 15, fontSize: 12 }}
                />

                <YAxis
                  domain={[0, 'auto']}
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  label={{ value: 'Difficulty / Skill', angle: -90, position: 'insideLeft', offset: 5, fontSize: 12 }}
                />

                <Tooltip content={<CustomTooltip />} />

                {/* Hard spike reference lines */}
                {[5, 15, 25, 35, 45, 55, 65, 75, 85, 95].filter((l) => l <= maxLevels).map((level) => (
                  <ReferenceLine
                    key={`spike-${level}`}
                    x={level}
                    stroke={TIER_COLORS.hard}
                    strokeDasharray="3 3"
                    strokeOpacity={0.5}
                  />
                ))}

                {/* Super hard peak reference lines */}
                {[10, 20, 30, 40, 50, 60, 70, 80, 90, 100].filter((l) => l <= maxLevels).map((level) => (
                  <ReferenceLine
                    key={`peak-${level}`}
                    x={level}
                    stroke={TIER_COLORS.superHard}
                    strokeDasharray="3 3"
                    strokeOpacity={0.5}
                  />
                ))}

                {/* Ideal sawtooth curve */}
                <Area
                  type="monotone"
                  dataKey="idealDifficulty"
                  stroke="hsl(262, 83%, 58%)"
                  fill="url(#squareIdealGradient)"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  name="Ideal Curve"
                />

                {/* Skill growth line */}
                <Line
                  type="monotone"
                  dataKey="skillLevel"
                  stroke="#06b6d4"
                  strokeWidth={2}
                  dot={false}
                  name="Player Skill"
                />

                {/* Actual difficulty line */}
                <Line
                  type="monotone"
                  dataKey="actualDifficulty"
                  stroke="#ffffff"
                  strokeWidth={2}
                  dot={false}
                  connectNulls={false}
                  name="Your Levels"
                />

                {/* Scatter points for designed levels */}
                <Scatter
                  dataKey="actualDifficulty"
                  name="Designed Levels"
                >
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.flowZone ? FLOW_ZONE_COLORS[entry.flowZone] : 'transparent'}
                      stroke={entry.actualLevel ? '#ffffff' : 'transparent'}
                      strokeWidth={entry.actualLevel ? 2 : 0}
                      cursor={entry.actualLevel ? 'pointer' : 'default'}
                    />
                  ))}
                </Scatter>
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-4 justify-center mt-4 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-0.5 bg-purple-500" style={{ borderStyle: 'dashed' }} />
              <span>Ideal Sawtooth</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-0.5 bg-cyan-500" />
              <span>Player Skill</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <span>Flow State</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-cyan-400" />
              <span>Too Easy</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-orange-500" />
              <span>Too Hard</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold">{stats.coverage.toFixed(0)}%</p>
            <p className="text-xs text-muted-foreground">Collection Coverage</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-green-400">{stats.inFlow}</p>
            <p className="text-xs text-muted-foreground">In Flow State</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-cyan-400">{stats.inBoredom}</p>
            <p className="text-xs text-muted-foreground">Too Easy</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-orange-400">{stats.inFrustration}</p>
            <p className="text-xs text-muted-foreground">Too Hard</p>
          </CardContent>
        </Card>
      </div>

      {/* Flow State Diagram & Best Practices */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Mini Flow State Diagram */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              Flow State Diagram
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 10, right: 20, bottom: 30, left: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />

                  {/* Flow channel (diagonal) */}
                  <ReferenceLine
                    segment={[{ x: 0, y: 0 }, { x: 12, y: 12 }]}
                    stroke="#22c55e"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                  />

                  {/* Frustration boundary */}
                  <ReferenceLine
                    segment={[{ x: 0, y: 2 }, { x: 10, y: 12 }]}
                    stroke="#f97316"
                    strokeWidth={1}
                    strokeOpacity={0.5}
                  />

                  {/* Boredom boundary */}
                  <ReferenceLine
                    segment={[{ x: 2, y: 0 }, { x: 12, y: 10 }]}
                    stroke="#06b6d4"
                    strokeWidth={1}
                    strokeOpacity={0.5}
                  />

                  <XAxis
                    type="number"
                    dataKey="skill"
                    domain={[0, 'auto']}
                    tick={{ fontSize: 10 }}
                    label={{ value: 'Player Skill', position: 'bottom', offset: 15, fontSize: 11 }}
                  />
                  <YAxis
                    type="number"
                    dataKey="difficulty"
                    domain={[0, 'auto']}
                    tick={{ fontSize: 10 }}
                    label={{ value: 'Difficulty', angle: -90, position: 'insideLeft', offset: 5, fontSize: 11 }}
                  />

                  {/* Plot actual levels on flow diagram */}
                  <Scatter
                    data={chartData.filter(d => d.actualLevel).map(d => ({
                      skill: d.skillLevel,
                      difficulty: scoreToChartValue(d.actualLevel!.metrics.difficultyScore),
                      flowZone: d.flowZone,
                      level: d.level,
                    }))}
                  >
                    {chartData.filter(d => d.actualLevel).map((entry, index) => (
                      <Cell
                        key={`flow-cell-${index}`}
                        fill={FLOW_ZONE_COLORS[entry.flowZone!]}
                        stroke="#ffffff"
                        strokeWidth={1}
                      />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
            <div className="flex gap-4 justify-center mt-2 text-xs">
              <span className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-green-500" />
                Flow
              </span>
              <span className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-cyan-500" />
                Boredom
              </span>
              <span className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-orange-500" />
                Frustration
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Best Practices */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Info className="h-4 w-4" />
              Configuration Best Practices
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Balance Assessment */}
            <div className="p-3 rounded-lg bg-muted/50">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Balance Assessment</span>
                {stats.inFlow / Math.max(levels.length, 1) >= 0.6 ? (
                  <Badge className="bg-green-500">Well Balanced</Badge>
                ) : stats.inFrustration / Math.max(levels.length, 1) > 0.3 ? (
                  <Badge className="bg-orange-500">Too Frustrating</Badge>
                ) : stats.inBoredom / Math.max(levels.length, 1) > 0.3 ? (
                  <Badge className="bg-cyan-500">Too Easy</Badge>
                ) : levels.length === 0 ? (
                  <Badge variant="outline">No Levels</Badge>
                ) : (
                  <Badge className="bg-yellow-500">Needs Tuning</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Target: 60%+ in flow, brief dips into boredom (recovery), peaks into frustration (challenge).
              </p>
            </div>

            {/* Parameter Guidelines */}
            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <p className="font-medium text-foreground">Skill Growth Rate</p>
                <p className="text-muted-foreground">
                  <span className="text-cyan-400">0.10-0.15:</span> Casual players, longer games (100+ levels)<br/>
                  <span className="text-cyan-400">0.15-0.20:</span> Standard progression (recommended)<br/>
                  <span className="text-cyan-400">0.20-0.30:</span> Fast learners, shorter games (30-50 levels)
                </p>
              </div>

              <div className="space-y-1">
                <p className="font-medium text-foreground">Baseline Increase</p>
                <p className="text-muted-foreground">
                  <span className="text-purple-400">0.1-0.2:</span> Gentle progression, casual feel<br/>
                  <span className="text-purple-400">0.2-0.4:</span> Standard difficulty ramp (recommended)<br/>
                  <span className="text-purple-400">0.4-0.6:</span> Aggressive ramp, hardcore feel
                </p>
              </div>

              <div className="space-y-1">
                <p className="font-medium text-foreground">Key Principle</p>
                <p className="text-muted-foreground">
                  The skill line should weave through the sawtooth peaks and valleys. If skill stays below difficulty → frustration. If skill stays above → boredom.
                </p>
              </div>
            </div>

            {/* Quick Tips */}
            <div className="pt-2 border-t border-muted space-y-1 text-xs text-muted-foreground">
              <p><strong>Tips:</strong></p>
              <p>• Hard spikes (5, 15, 25...) create achievement moments</p>
              <p>• Recovery levels (1, 2, 11, 12...) let players feel skilled</p>
              <p>• Super hard peaks (10, 20, 30...) test mastery before next cycle</p>
              <p>• Click dots on the curve to edit specific levels</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
