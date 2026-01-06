'use client';

import { useState, useMemo } from 'react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis, ReferenceLine } from 'recharts';
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { SAWTOOTH_CYCLE, DIFFICULTY_TIERS } from '@/lib/constants';
import { TrendingUp, RotateCcw } from 'lucide-react';

interface DataPoint {
  level: number;
  difficulty: number;
  tier: string;
  label: string;
  cycle: number;
}

const chartConfig = {
  difficulty: {
    label: 'Difficulty',
    color: 'hsl(262, 83%, 58%)',
  },
} satisfies ChartConfig;

const tierColors: Record<string, string> = {
  easy: DIFFICULTY_TIERS.easy.color,
  medium: DIFFICULTY_TIERS.medium.color,
  hard: DIFFICULTY_TIERS.hard.color,
  superHard: DIFFICULTY_TIERS.superHard.color,
};

export function SawtoothCurve() {
  const [totalLevels, setTotalLevels] = useState(100);
  const [baselineIncrease, setBaselineIncrease] = useState(0.3);

  const numCycles = Math.ceil(totalLevels / 10);

  const data: DataPoint[] = useMemo(() => {
    const points: DataPoint[] = [];
    for (let cycle = 0; cycle < numCycles; cycle++) {
      SAWTOOTH_CYCLE.forEach((point) => {
        const level = cycle * 10 + point.position;
        if (level > totalLevels) return;
        const baselineOffset = cycle * baselineIncrease;
        points.push({
          level,
          difficulty: point.difficulty + baselineOffset,
          tier: point.tier,
          label: point.label,
          cycle: cycle + 1,
        });
      });
    }
    return points;
  }, [numCycles, baselineIncrease, totalLevels]);

  const hardSpikeLevels = data.filter((d) => d.tier === 'hard' && d.label === 'Hard spike').map((d) => d.level);
  const superHardLevels = data.filter((d) => d.tier === 'superHard').map((d) => d.level);

  const resetToDefaults = () => {
    setTotalLevels(100);
    setBaselineIncrease(0.3);
  };

  // Calculate tick interval based on total levels
  const tickInterval = totalLevels <= 50 ? 5 : totalLevels <= 100 ? 10 : totalLevels <= 200 ? 20 : 50;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Sawtooth Difficulty Curve
          </CardTitle>
          <CardDescription>
            The 10-level cycle pattern used by top puzzle games. Each cycle has easy recovery,
            rising tension, a hard spike at level 5, and a super-hard peak at level 10.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer id="sawtooth-curve" config={chartConfig} className="h-[400px] w-full">
            <AreaChart
              data={data}
              margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
            >
              <defs>
                <linearGradient id="difficultyGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(262, 83%, 58%)" stopOpacity={0.5} />
                  <stop offset="50%" stopColor="hsl(262, 83%, 58%)" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="hsl(262, 83%, 58%)" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="level"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                interval={tickInterval - 1}
                tick={{ fontSize: 12 }}
              />
              <YAxis
                domain={[0, Math.max(12, Math.ceil(data[data.length - 1]?.difficulty || 12) + 2)]}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tick={{ fontSize: 12 }}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value, name, item) => {
                      const d = item.payload as DataPoint;
                      return (
                        <div className="space-y-1">
                          <div className="font-medium">Level {d.level}</div>
                          <div className="text-muted-foreground text-xs">{d.label}</div>
                          <div className="flex items-center gap-2">
                            <Badge
                              style={{ backgroundColor: tierColors[d.tier] }}
                              className="text-white text-xs"
                            >
                              {d.tier}
                            </Badge>
                            <span className="text-xs">Difficulty: {d.difficulty.toFixed(1)}</span>
                          </div>
                          <div className="text-xs text-muted-foreground">Cycle {d.cycle}</div>
                        </div>
                      );
                    }}
                  />
                }
              />

              {/* Hard spike markers */}
              {hardSpikeLevels.map((level) => (
                <ReferenceLine
                  key={`hard-${level}`}
                  x={level}
                  stroke={tierColors.hard}
                  strokeDasharray="3 3"
                  strokeWidth={1.5}
                />
              ))}

              {/* Super Hard peak markers */}
              {superHardLevels.map((level) => (
                <ReferenceLine
                  key={`superhard-${level}`}
                  x={level}
                  stroke={tierColors.superHard}
                  strokeDasharray="3 3"
                  strokeWidth={1.5}
                />
              ))}

              <Area
                type="monotone"
                dataKey="difficulty"
                stroke="hsl(262, 83%, 58%)"
                fill="url(#difficultyGradient)"
                strokeWidth={2}
                dot={(props) => {
                  const { cx, cy, payload } = props;
                  const d = payload as DataPoint;
                  const color = tierColors[d.tier] || tierColors.medium;
                  const size = d.tier === 'superHard' ? 6 : d.tier === 'hard' ? 5 : 3;
                  return (
                    <circle
                      key={d.level}
                      cx={cx}
                      cy={cy}
                      r={size}
                      fill={color}
                      stroke="white"
                      strokeWidth={1.5}
                    />
                  );
                }}
              />
            </AreaChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Level Range</CardTitle>
            <CardDescription>Configure total levels and difficulty scaling</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Total Levels</label>
                <span className="text-sm text-muted-foreground">
                  {totalLevels} levels ({numCycles} cycles)
                </span>
              </div>
              <Slider
                value={[totalLevels]}
                onValueChange={([v]) => setTotalLevels(v)}
                min={10}
                max={500}
                step={10}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>10</span>
                <span>100</span>
                <span>200</span>
                <span>300</span>
                <span>400</span>
                <span>500</span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Baseline Increase per Cycle</label>
                <span className="text-sm text-muted-foreground">+{baselineIncrease.toFixed(1)}</span>
              </div>
              <Slider
                value={[baselineIncrease * 10]}
                onValueChange={([v]) => setBaselineIncrease(v / 10)}
                min={0}
                max={10}
                step={1}
              />
              <p className="text-xs text-muted-foreground">
                Higher values make later cycles progressively harder
              </p>
            </div>

            <Button variant="outline" size="sm" onClick={resetToDefaults} className="w-full">
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset to Defaults
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cycle Structure (10 Levels)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: tierColors.easy }} />
                <span className="text-muted-foreground">1-2:</span>
                <span>Easy recovery / victory lap</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: tierColors.medium }} />
                <span className="text-muted-foreground">3-4:</span>
                <span>Medium, testing learned skills</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: tierColors.hard }} />
                <span className="text-muted-foreground">5:</span>
                <span>Hard spike (marked)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: tierColors.medium }} />
                <span className="text-muted-foreground">6-7:</span>
                <span>Brief dip in difficulty</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: tierColors.hard }} />
                <span className="text-muted-foreground">8-9:</span>
                <span>Rising tension</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: tierColors.superHard }} />
                <span className="text-muted-foreground">10:</span>
                <span>Super Hard peak (marked)</span>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t">
              <p className="text-sm font-medium mb-2">Statistics</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 bg-muted/50 rounded">
                  <span className="text-muted-foreground">Hard Spikes:</span>
                  <span className="ml-1 font-medium">{hardSpikeLevels.length}</span>
                </div>
                <div className="p-2 bg-muted/50 rounded">
                  <span className="text-muted-foreground">Super Hard:</span>
                  <span className="ml-1 font-medium">{superHardLevels.length}</span>
                </div>
                <div className="p-2 bg-muted/50 rounded col-span-2">
                  <span className="text-muted-foreground">Peak Difficulty:</span>
                  <span className="ml-1 font-medium">
                    {data.length > 0 ? data[data.length - 1].difficulty.toFixed(1) : '0'}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Industry Reference (Royal Match)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4 text-sm">
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="font-medium">Hard Levels</p>
              <p className="text-muted-foreground text-xs">~8 total in first 100</p>
              <p className="text-muted-foreground text-xs">Placed at level 5, 15, 25...</p>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="font-medium">Super Hard</p>
              <p className="text-muted-foreground text-xs">~5 total in first 100</p>
              <p className="text-muted-foreground text-xs">At levels 39, 49, 59, 69...</p>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="font-medium">New Obstacles</p>
              <p className="text-muted-foreground text-xs">~1 per 10 levels</p>
              <p className="text-muted-foreground text-xs">All blockers by level 90</p>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="font-medium">Move Counts</p>
              <p className="text-muted-foreground text-xs">30-38 (L1-60)</p>
              <p className="text-muted-foreground text-xs">23-27 (L60-100)</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
