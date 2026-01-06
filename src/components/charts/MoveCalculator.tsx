'use client';

import { useState, useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MOVE_LIMITS, DIFFICULTY_TIERS } from '@/lib/constants';
import { Calculator, Info } from 'lucide-react';

interface ChartDataPoint {
  level: number;
  minMoves: number;
  maxMoves: number;
  avgMoves: number;
  experience: string;
}

function getMoveRange(level: number): { min: number; max: number; experience: string } {
  for (const range of MOVE_LIMITS) {
    if (level >= range.range[0] && level <= range.range[1]) {
      return {
        min: range.moves[0],
        max: range.moves[1],
        experience: range.experience,
      };
    }
  }
  return { min: 20, max: 27, experience: 'Crunchy' };
}

export function MoveCalculator() {
  const [inputLevel, setInputLevel] = useState(50);

  const chartData: ChartDataPoint[] = useMemo(() => {
    const data: ChartDataPoint[] = [];
    for (let level = 1; level <= 150; level += 1) {
      const { min, max, experience } = getMoveRange(level);
      data.push({
        level,
        minMoves: min,
        maxMoves: max,
        avgMoves: (min + max) / 2,
        experience,
      });
    }
    return data;
  }, []);

  const currentRange = getMoveRange(inputLevel);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Move Limit Progression</CardTitle>
          <CardDescription>
            Recommended move counts by level range. Move limits gradually tighten to raise tension
            without feeling unfair. Based on Royal Match analysis.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="level"
                  label={{ value: 'Level', position: 'insideBottom', offset: -10 }}
                  className="text-xs"
                />
                <YAxis
                  domain={[15, 45]}
                  label={{ value: 'Moves', angle: -90, position: 'insideLeft' }}
                  className="text-xs"
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const d = payload[0].payload as ChartDataPoint;
                      return (
                        <div className="bg-popover border rounded-lg p-3 shadow-lg">
                          <p className="font-medium">Level {d.level}</p>
                          <p className="text-sm">
                            Moves: {d.minMoves} - {d.maxMoves}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">{d.experience}</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <defs>
                  <linearGradient id="moveGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="stepAfter"
                  dataKey="maxMoves"
                  stroke="#3b82f6"
                  fill="url(#moveGradient)"
                  name="Max Moves"
                />
                <Area
                  type="stepAfter"
                  dataKey="minMoves"
                  stroke="#3b82f6"
                  fill="white"
                  name="Min Moves"
                />
                <ReferenceLine
                  x={inputLevel}
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              Move Calculator
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Enter Level Number</label>
              <input
                type="number"
                min="1"
                max="500"
                value={inputLevel}
                onChange={(e) => setInputLevel(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full px-3 py-2 border rounded-md bg-background"
              />
            </div>

            <div className="p-4 bg-primary/5 rounded-lg border border-primary/20">
              <p className="text-sm text-muted-foreground mb-2">Recommended Move Count</p>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold text-primary">
                  {currentRange.min} - {currentRange.max}
                </span>
                <span className="text-sm text-muted-foreground">moves</span>
              </div>
              <p className="text-sm text-muted-foreground mt-2">{currentRange.experience}</p>
            </div>

            <div className="flex items-start gap-2 p-3 bg-muted/50 rounded-lg">
              <Info className="h-4 w-4 mt-0.5 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                Aim for near-loss finishes (1-3 moves remaining). If playtesters consistently
                finish with 10+ moves left, reduce the count.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Move Ranges by Phase</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {MOVE_LIMITS.map((range, i) => (
                <div
                  key={i}
                  className={`p-3 rounded-lg border ${
                    inputLevel >= range.range[0] && inputLevel <= range.range[1]
                      ? 'border-primary bg-primary/5'
                      : 'border-border'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-sm">
                      Levels {range.range[0]} - {range.range[1] === Infinity ? '100+' : range.range[1]}
                    </span>
                    <Badge variant="secondary">
                      {range.moves[0]}-{range.moves[1]} moves
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{range.experience}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Win Rate by Difficulty Tier</CardTitle>
          <CardDescription>
            King targets minimum 20-30% win rate without boosters. Lower triggers a nerf.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-4">
            {(Object.entries(DIFFICULTY_TIERS) as [string, typeof DIFFICULTY_TIERS.easy][]).map(
              ([key, tier]) => (
                <div
                  key={key}
                  className="p-3 rounded-lg border"
                  style={{ borderColor: tier.color }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: tier.color }}
                    />
                    <span className="font-medium text-sm capitalize">{key}</span>
                  </div>
                  <p className="text-lg font-bold">{tier.winRate[0]}-{tier.winRate[1]}%</p>
                  <p className="text-xs text-muted-foreground">{tier.attempts} attempts</p>
                  <p className="text-xs text-muted-foreground mt-1">{tier.goal}</p>
                </div>
              )
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
