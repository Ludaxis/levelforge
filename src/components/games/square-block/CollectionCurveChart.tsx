'use client';

import { useMemo } from 'react';
import {
  ComposedChart,
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
} from '@/types/squareBlock';
import { SAWTOOTH_CYCLE, DIFFICULTY_TIERS } from '@/lib/constants';

// ============================================================================
// Types
// ============================================================================

interface CollectionCurveChartProps {
  levels: DesignedLevel[];
  onLevelClick?: (levelNumber: number) => void;
  maxLevels?: number;
}

interface ChartDataPoint {
  level: number;
  idealDifficulty: number | null;
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
  maxLevels = 100,
}: CollectionCurveChartProps) {
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

        const baselineOffset = cycle * 0.3; // Gradual increase
        const idealDifficulty = point.difficulty + baselineOffset;

        const actualLevel = levelMap.get(levelNum);
        let actualDifficulty: number | null = null;
        let flowZone: FlowZone | undefined;

        if (actualLevel) {
          // Use actual difficulty score (0-100) scaled to chart range (0-12)
          actualDifficulty = scoreToChartValue(actualLevel.metrics.difficultyScore) + baselineOffset;
          flowZone = actualLevel.metrics.flowZone;
        }

        data.push({
          level: levelNum,
          idealDifficulty,
          actualDifficulty,
          actualLevel,
          tier: point.tier as DifficultyTier,
          flowZone,
        });
      });
    }

    return data;
  }, [levels, maxLevels]);

  // Stats
  const stats = useMemo(() => {
    const inFlow = levels.filter((l) => l.metrics.flowZone === 'flow').length;
    const inBoredom = levels.filter((l) => l.metrics.flowZone === 'boredom').length;
    const inFrustration = levels.filter((l) => l.metrics.flowZone === 'frustration').length;
    const coverage = (levels.length / maxLevels) * 100;

    return { inFlow, inBoredom, inFrustration, coverage };
  }, [levels, maxLevels]);

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
                  domain={[0, 12]}
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  label={{ value: 'Difficulty', angle: -90, position: 'insideLeft', offset: 5, fontSize: 12 }}
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
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <span>Flow State</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-cyan-500" />
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

      {/* Guidance */}
      {levels.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div className="text-xs text-muted-foreground space-y-1">
                <p>
                  <strong>Goal:</strong> Keep most levels in the flow zone (green dots) while following the sawtooth pattern.
                </p>
                <p>
                  <strong>Hard spikes</strong> (levels 5, 15, 25...) should be harder than average.
                  <strong> Super hard peaks</strong> (levels 10, 20, 30...) should be the hardest in each cycle.
                </p>
                <p>
                  Click on a dot to jump to that level in the editor.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
