'use client';

import { useState, useMemo } from 'react';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
  LineChart,
  Line,
  ComposedChart,
  Area,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { GitBranch, RotateCcw, Play, Pause } from 'lucide-react';
import { SAWTOOTH_CYCLE, DIFFICULTY_TIERS } from '@/lib/constants';

interface LevelFlowPoint {
  level: number;
  difficulty: number;
  skill: number;
  tier: string;
  label: string;
  zone: 'flow' | 'boredom' | 'frustration';
}

const tierColors: Record<string, string> = {
  easy: DIFFICULTY_TIERS.easy.color,
  medium: DIFFICULTY_TIERS.medium.color,
  hard: DIFFICULTY_TIERS.hard.color,
  superHard: DIFFICULTY_TIERS.superHard.color,
};

const ZONE_COLORS = {
  flow: 'hsl(142, 76%, 36%)',
  boredom: 'hsl(199, 89%, 48%)',
  frustration: 'hsl(25, 95%, 53%)',
};

function getFlowZone(difficulty: number, skill: number): 'flow' | 'boredom' | 'frustration' {
  const diff = difficulty - skill;
  if (diff > 1.5) return 'frustration';
  if (diff < -1.5) return 'boredom';
  return 'flow';
}

export function FlowSawtoothBridge() {
  const [totalLevels, setTotalLevels] = useState(50);
  const [skillGrowthRate, setSkillGrowthRate] = useState(0.15); // How fast skill grows per level
  const [baselineIncrease, setBaselineIncrease] = useState(0.2); // How much difficulty increases per cycle
  const [highlightedLevel, setHighlightedLevel] = useState<number | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);

  const numCycles = Math.ceil(totalLevels / 10);

  // Generate data combining sawtooth difficulty with skill progression
  const data: LevelFlowPoint[] = useMemo(() => {
    const points: LevelFlowPoint[] = [];

    for (let cycle = 0; cycle < numCycles; cycle++) {
      SAWTOOTH_CYCLE.forEach((point) => {
        const level = cycle * 10 + point.position;
        if (level > totalLevels) return;

        // Difficulty from sawtooth + baseline increase
        const baselineOffset = cycle * baselineIncrease;
        const difficulty = point.difficulty + baselineOffset;

        // Skill grows with level (with some curve)
        // Using a slightly slower growth to create tension
        const skill = 1 + (level - 1) * skillGrowthRate;

        const zone = getFlowZone(difficulty, skill);

        points.push({
          level,
          difficulty,
          skill,
          tier: point.tier,
          label: point.label,
          zone,
        });
      });
    }

    return points;
  }, [numCycles, baselineIncrease, totalLevels, skillGrowthRate]);

  // Calculate zone distribution
  const zoneStats = useMemo(() => {
    const stats = { flow: 0, boredom: 0, frustration: 0 };
    data.forEach((d) => stats[d.zone]++);
    return stats;
  }, [data]);

  const resetToDefaults = () => {
    setTotalLevels(50);
    setSkillGrowthRate(0.15);
    setBaselineIncrease(0.2);
    setHighlightedLevel(null);
  };

  // Animation effect
  const animateLevels = () => {
    setIsAnimating(true);
    let currentLevel = 1;
    const interval = setInterval(() => {
      setHighlightedLevel(currentLevel);
      currentLevel++;
      if (currentLevel > totalLevels) {
        clearInterval(interval);
        setIsAnimating(false);
        setTimeout(() => setHighlightedLevel(null), 1000);
      }
    }, 150);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5" />
            Flow State + Sawtooth Bridge
          </CardTitle>
          <CardDescription>
            See how the sawtooth difficulty curve maps onto the flow state diagram. As players
            progress through levels, their skill grows while difficulty follows the sawtooth pattern.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Sawtooth Curve (Difficulty over Levels) */}
            <div>
              <p className="text-sm font-medium mb-2">Sawtooth Curve (Level → Difficulty)</p>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={data} margin={{ top: 10, right: 20, bottom: 30, left: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                      dataKey="level"
                      tick={{ fontSize: 11 }}
                      label={{ value: 'Level', position: 'bottom', offset: 15, fontSize: 12 }}
                    />
                    <YAxis
                      domain={[0, 'auto']}
                      tick={{ fontSize: 11 }}
                      label={{ value: 'Difficulty / Skill', angle: -90, position: 'insideLeft', offset: 5, fontSize: 12 }}
                    />

                    {/* Skill growth line */}
                    <Line
                      type="monotone"
                      dataKey="skill"
                      stroke="hsl(199, 89%, 48%)"
                      strokeWidth={2}
                      dot={false}
                      name="Player Skill"
                    />

                    {/* Difficulty area */}
                    <Area
                      type="monotone"
                      dataKey="difficulty"
                      fill="hsl(25, 95%, 53%)"
                      fillOpacity={0.2}
                      stroke="hsl(25, 95%, 53%)"
                      strokeWidth={2}
                      name="Difficulty"
                    />

                    {/* Highlighted level marker */}
                    {highlightedLevel && (
                      <ReferenceLine
                        x={highlightedLevel}
                        stroke="hsl(142, 76%, 36%)"
                        strokeWidth={2}
                      />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div className="flex gap-4 justify-center mt-2 text-xs">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-0.5 bg-orange-500" />
                  <span>Difficulty</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-0.5 bg-cyan-500" />
                  <span>Player Skill</span>
                </div>
              </div>
            </div>

            {/* Flow State Diagram */}
            <div>
              <p className="text-sm font-medium mb-2">Flow State (Skill → Difficulty)</p>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 10, right: 20, bottom: 30, left: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />

                    {/* Flow channel line */}
                    <ReferenceLine
                      segment={[{ x: 0, y: 0 }, { x: 10, y: 10 }]}
                      stroke="hsl(142, 76%, 36%)"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                    />

                    {/* Upper boundary (frustration) */}
                    <ReferenceLine
                      segment={[{ x: 0, y: 1.5 }, { x: 8.5, y: 10 }]}
                      stroke="hsl(25, 95%, 53%)"
                      strokeWidth={1}
                      strokeOpacity={0.5}
                    />

                    {/* Lower boundary (boredom) */}
                    <ReferenceLine
                      segment={[{ x: 1.5, y: 0 }, { x: 10, y: 8.5 }]}
                      stroke="hsl(199, 89%, 48%)"
                      strokeWidth={1}
                      strokeOpacity={0.5}
                    />

                    <XAxis
                      type="number"
                      dataKey="skill"
                      domain={[0, Math.max(10, ...data.map((d) => d.skill)) + 1]}
                      tick={{ fontSize: 11 }}
                      label={{ value: 'Skill', position: 'bottom', offset: 15, fontSize: 12 }}
                    />
                    <YAxis
                      type="number"
                      dataKey="difficulty"
                      domain={[0, Math.max(10, ...data.map((d) => d.difficulty)) + 1]}
                      tick={{ fontSize: 11 }}
                      label={{ value: 'Difficulty', angle: -90, position: 'insideLeft', offset: 5, fontSize: 12 }}
                    />

                    {/* All level points */}
                    <Scatter name="Levels" data={data}>
                      {data.map((entry, index) => (
                        <Cell
                          key={index}
                          fill={highlightedLevel === entry.level ? 'white' : ZONE_COLORS[entry.zone]}
                          stroke={highlightedLevel === entry.level ? ZONE_COLORS[entry.zone] : 'transparent'}
                          strokeWidth={highlightedLevel === entry.level ? 3 : 0}
                          r={highlightedLevel === entry.level ? 8 : 5}
                        />
                      ))}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
              <div className="flex gap-4 justify-center mt-2 text-xs">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                  <span>Flow</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-full bg-cyan-500" />
                  <span>Boredom</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-full bg-orange-500" />
                  <span>Frustration</span>
                </div>
              </div>
            </div>
          </div>

          {/* Animation Button */}
          <div className="flex justify-center mt-4">
            <Button
              onClick={animateLevels}
              disabled={isAnimating}
              variant="outline"
            >
              {isAnimating ? (
                <>
                  <Pause className="h-4 w-4 mr-2" />
                  Animating Level {highlightedLevel}...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Animate Progression
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Controls */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Parameters</CardTitle>
            <CardDescription>Adjust to see how different curves affect flow state</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Total Levels</label>
                <span className="text-sm text-muted-foreground">{totalLevels}</span>
              </div>
              <Slider
                value={[totalLevels]}
                onValueChange={([v]) => setTotalLevels(v)}
                min={10}
                max={100}
                step={10}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Skill Growth Rate</label>
                <span className="text-sm text-muted-foreground">{skillGrowthRate.toFixed(2)}/level</span>
              </div>
              <Slider
                value={[skillGrowthRate * 100]}
                onValueChange={([v]) => setSkillGrowthRate(v / 100)}
                min={5}
                max={30}
                step={1}
              />
              <p className="text-xs text-muted-foreground">
                How quickly players improve. Lower = steeper learning curve.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Difficulty Baseline Increase</label>
                <span className="text-sm text-muted-foreground">+{baselineIncrease.toFixed(1)}/cycle</span>
              </div>
              <Slider
                value={[baselineIncrease * 10]}
                onValueChange={([v]) => setBaselineIncrease(v / 10)}
                min={0}
                max={10}
                step={1}
              />
              <p className="text-xs text-muted-foreground">
                How much harder each 10-level cycle becomes.
              </p>
            </div>

            <Button variant="outline" size="sm" onClick={resetToDefaults} className="w-full">
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset to Defaults
            </Button>
          </CardContent>
        </Card>

        {/* Zone Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Zone Distribution</CardTitle>
            <CardDescription>How many levels fall into each zone</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: ZONE_COLORS.flow }} />
                  <span className="text-sm">Flow (Optimal)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{zoneStats.flow}</span>
                  <span className="text-xs text-muted-foreground">
                    ({((zoneStats.flow / data.length) * 100).toFixed(0)}%)
                  </span>
                </div>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className="h-2 rounded-full"
                  style={{
                    width: `${(zoneStats.flow / data.length) * 100}%`,
                    backgroundColor: ZONE_COLORS.flow,
                  }}
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: ZONE_COLORS.boredom }} />
                  <span className="text-sm">Boredom</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{zoneStats.boredom}</span>
                  <span className="text-xs text-muted-foreground">
                    ({((zoneStats.boredom / data.length) * 100).toFixed(0)}%)
                  </span>
                </div>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className="h-2 rounded-full"
                  style={{
                    width: `${(zoneStats.boredom / data.length) * 100}%`,
                    backgroundColor: ZONE_COLORS.boredom,
                  }}
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: ZONE_COLORS.frustration }} />
                  <span className="text-sm">Frustration</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{zoneStats.frustration}</span>
                  <span className="text-xs text-muted-foreground">
                    ({((zoneStats.frustration / data.length) * 100).toFixed(0)}%)
                  </span>
                </div>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className="h-2 rounded-full"
                  style={{
                    width: `${(zoneStats.frustration / data.length) * 100}%`,
                    backgroundColor: ZONE_COLORS.frustration,
                  }}
                />
              </div>
            </div>

            <div className="pt-4 border-t">
              <p className="text-sm font-medium mb-2">Balance Assessment</p>
              {zoneStats.flow / data.length >= 0.6 ? (
                <Badge className="bg-green-500">Well Balanced</Badge>
              ) : zoneStats.frustration / data.length > 0.3 ? (
                <Badge className="bg-orange-500">Too Frustrating</Badge>
              ) : zoneStats.boredom / data.length > 0.3 ? (
                <Badge className="bg-cyan-500">Too Easy</Badge>
              ) : (
                <Badge className="bg-yellow-500">Needs Tuning</Badge>
              )}
              <p className="text-xs text-muted-foreground mt-2">
                Aim for 60%+ in flow, with brief dips into boredom (recovery) and
                peaks into frustration (hard spikes).
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Explanation Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">How They Connect</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 text-sm">
            <div className="space-y-2">
              <p className="font-medium">Sawtooth → Flow Mapping</p>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• <strong>Easy levels</strong> (positions 1-2) → Dip into boredom zone</li>
                <li>• <strong>Medium levels</strong> (positions 3-4, 6-7) → Stay in flow channel</li>
                <li>• <strong>Hard spikes</strong> (position 5) → Push toward frustration</li>
                <li>• <strong>Super hard peaks</strong> (position 10) → Brief frustration peak</li>
              </ul>
            </div>
            <div className="space-y-2">
              <p className="font-medium">The Key Insight</p>
              <p className="text-xs text-muted-foreground">
                The sawtooth pattern isn't just about varying difficulty—it's about creating a
                controlled path through the flow state space. Recovery levels let players feel
                skilled, hard spikes create achievement moments, and the overall trajectory
                keeps players in flow as both their skill and the difficulty increase together.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
