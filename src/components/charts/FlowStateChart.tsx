'use client';

import { useState } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, ReferenceLine, ReferenceArea, ResponsiveContainer, Cell } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Activity, Target, RotateCcw, Plus, Trash2 } from 'lucide-react';

interface LevelPoint {
  id: string;
  level: number;
  difficulty: number;
  skill: number;
  name: string;
}

type FlowZone = 'flow' | 'boredom' | 'frustration';

const ZONE_COLORS: Record<FlowZone, { bg: string; text: string; label: string }> = {
  flow: { bg: 'hsl(142, 76%, 36%)', text: 'text-green-100', label: 'Optimum Flow' },
  boredom: { bg: 'hsl(199, 89%, 48%)', text: 'text-cyan-100', label: 'Boredom' },
  frustration: { bg: 'hsl(25, 95%, 53%)', text: 'text-orange-100', label: 'Frustration' },
};

function getFlowZone(difficulty: number, skill: number): FlowZone {
  const diff = difficulty - skill;

  // High difficulty, low skill = frustration (above the flow channel)
  if (diff > 1.5) return 'frustration';
  // Low difficulty, high skill = boredom (below the flow channel)
  if (diff < -1.5) return 'boredom';
  // Balanced = flow (in the channel)
  return 'flow';
}

const defaultLevels: LevelPoint[] = [
  { id: '1', level: 1, difficulty: 2, skill: 1, name: 'Tutorial' },
  { id: '2', level: 5, difficulty: 5, skill: 3, name: 'Hard Spike' },
  { id: '3', level: 6, difficulty: 4, skill: 4, name: 'Recovery' },
  { id: '4', level: 10, difficulty: 7, skill: 5, name: 'Boss Level' },
  { id: '5', level: 15, difficulty: 5, skill: 6, name: 'Mid Game' },
  { id: '6', level: 20, difficulty: 8, skill: 7, name: 'Challenge' },
];

export function FlowStateChart() {
  const [levels, setLevels] = useState<LevelPoint[]>(defaultLevels);
  const [selectedLevel, setSelectedLevel] = useState<string | null>(null);
  const [interactivePoint, setInteractivePoint] = useState({ difficulty: 5, skill: 5 });

  const selectedLevelData = levels.find((l) => l.id === selectedLevel);
  const interactiveZone = getFlowZone(interactivePoint.difficulty, interactivePoint.skill);

  const updateLevel = (id: string, updates: Partial<LevelPoint>) => {
    setLevels((prev) =>
      prev.map((l) => (l.id === id ? { ...l, ...updates } : l))
    );
  };

  const addLevel = () => {
    const newId = Math.random().toString(36).substring(2, 9);
    const maxLevel = Math.max(...levels.map((l) => l.level), 0);
    setLevels((prev) => [
      ...prev,
      {
        id: newId,
        level: maxLevel + 5,
        difficulty: 5,
        skill: 5,
        name: `Level ${maxLevel + 5}`,
      },
    ]);
    setSelectedLevel(newId);
  };

  const removeLevel = (id: string) => {
    setLevels((prev) => prev.filter((l) => l.id !== id));
    if (selectedLevel === id) setSelectedLevel(null);
  };

  const resetToDefaults = () => {
    setLevels(defaultLevels);
    setSelectedLevel(null);
    setInteractivePoint({ difficulty: 5, skill: 5 });
  };

  // Chart data for scatter plot (X = skill, Y = difficulty)
  const chartData = levels.map((l) => ({
    ...l,
    zone: getFlowZone(l.difficulty, l.skill),
  }));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Flow State Engagement Chart
          </CardTitle>
          <CardDescription>
            Visualize where your levels fall on the flow channel. The goal is to keep players in the
            "flow" zone - challenged enough to stay engaged, but not so much they get frustrated.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[450px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 20, right: 30, bottom: 40, left: 60 }}>
                {/* Frustration zone - top left triangle (high difficulty, low skill) */}
                <ReferenceArea x1={0} x2={10} y1={0} y2={10} fill="hsl(25, 95%, 53%)" fillOpacity={0.3} />

                {/* Boredom zone - bottom right triangle (low difficulty, high skill) */}
                <ReferenceArea x1={0} x2={10} y1={0} y2={10} fill="hsl(199, 89%, 48%)" fillOpacity={0.15} />

                {/* Flow channel - diagonal band */}
                <ReferenceArea x1={0} x2={10} y1={0} y2={10} fill="hsl(142, 76%, 36%)" fillOpacity={0.1} />

                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />

                {/* Flow channel center line */}
                <ReferenceLine
                  segment={[{ x: 0, y: 0 }, { x: 10, y: 10 }]}
                  stroke="hsl(200, 70%, 50%)"
                  strokeWidth={3}
                  label={{ value: 'Flow State Path', position: 'insideBottomRight', fill: 'hsl(200, 70%, 50%)', fontSize: 12 }}
                />

                {/* Upper boundary of flow channel */}
                <ReferenceLine
                  segment={[{ x: 0, y: 1.5 }, { x: 8.5, y: 10 }]}
                  stroke="hsl(25, 95%, 53%)"
                  strokeWidth={1}
                  strokeDasharray="5 5"
                />

                {/* Lower boundary of flow channel */}
                <ReferenceLine
                  segment={[{ x: 1.5, y: 0 }, { x: 10, y: 8.5 }]}
                  stroke="hsl(199, 89%, 48%)"
                  strokeWidth={1}
                  strokeDasharray="5 5"
                />

                <XAxis
                  type="number"
                  dataKey="skill"
                  domain={[0, 10]}
                  name="Skill"
                  tickLine={false}
                  axisLine={true}
                  tick={{ fontSize: 12 }}
                  label={{ value: 'Skill', position: 'bottom', offset: 20 }}
                />
                <YAxis
                  type="number"
                  dataKey="difficulty"
                  domain={[0, 10]}
                  name="Difficulty"
                  tickLine={false}
                  axisLine={true}
                  tick={{ fontSize: 12 }}
                  label={{ value: 'Difficulty', angle: -90, position: 'insideLeft', offset: -10 }}
                />

                {/* Level points */}
                <Scatter
                  name="Levels"
                  data={chartData}
                  cursor="pointer"
                  onClick={(data) => setSelectedLevel(data.id)}
                >
                  {chartData.map((entry) => (
                    <Cell
                      key={entry.id}
                      fill={ZONE_COLORS[entry.zone].bg}
                      stroke={selectedLevel === entry.id ? 'white' : 'transparent'}
                      strokeWidth={selectedLevel === entry.id ? 3 : 0}
                      r={selectedLevel === entry.id ? 10 : 7}
                    />
                  ))}
                </Scatter>

                {/* Interactive point */}
                <Scatter
                  name="Test Point"
                  data={[{ skill: interactivePoint.skill, difficulty: interactivePoint.difficulty }]}
                  shape="diamond"
                  fill={ZONE_COLORS[interactiveZone].bg}
                  stroke="white"
                  strokeWidth={2}
                />
              </ScatterChart>
            </ResponsiveContainer>
          </div>

          {/* Zone labels */}
          <div className="flex flex-wrap gap-2 mt-4 justify-center">
            <Badge variant="outline" className="bg-green-500/20 border-green-500">Optimum Flow</Badge>
            <Badge variant="outline" className="bg-cyan-500/20 border-cyan-500">Boredom</Badge>
            <Badge variant="outline" className="bg-orange-500/20 border-orange-500">Frustration</Badge>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Interactive Tester */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="h-4 w-4" />
              Interactive Zone Tester
            </CardTitle>
            <CardDescription>
              Adjust skill and difficulty to see which zone a level falls into
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Player Skill</label>
                <span className="text-sm text-muted-foreground">{interactivePoint.skill}</span>
              </div>
              <Slider
                value={[interactivePoint.skill]}
                onValueChange={([v]) => setInteractivePoint((prev) => ({ ...prev, skill: v }))}
                min={0}
                max={10}
                step={0.5}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Level Difficulty</label>
                <span className="text-sm text-muted-foreground">{interactivePoint.difficulty}</span>
              </div>
              <Slider
                value={[interactivePoint.difficulty]}
                onValueChange={([v]) => setInteractivePoint((prev) => ({ ...prev, difficulty: v }))}
                min={0}
                max={10}
                step={0.5}
              />
            </div>

            <div
              className="p-4 rounded-lg text-center"
              style={{ backgroundColor: ZONE_COLORS[interactiveZone].bg }}
            >
              <p className="text-white font-medium text-lg">{ZONE_COLORS[interactiveZone].label}</p>
              <p className="text-white/80 text-sm mt-1">
                {interactiveZone === 'flow' && 'Optimal engagement - difficulty matches player skill'}
                {interactiveZone === 'boredom' && 'Too easy - player skill exceeds difficulty'}
                {interactiveZone === 'frustration' && 'Too hard - difficulty exceeds player skill'}
              </p>
            </div>

            <Button variant="outline" size="sm" onClick={resetToDefaults} className="w-full">
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset All
            </Button>
          </CardContent>
        </Card>

        {/* Level Editor */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Level Points</CardTitle>
            <CardDescription>
              Click a point on the chart or select below to edit
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={addLevel}>
                <Plus className="h-4 w-4 mr-1" />
                Add Level
              </Button>
            </div>

            <div className="space-y-2 max-h-[250px] overflow-y-auto">
              {levels.map((level) => {
                const zone = getFlowZone(level.difficulty, level.skill);
                return (
                  <div
                    key={level.id}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedLevel === level.id ? 'border-primary bg-muted' : 'border-border hover:bg-muted/50'
                    }`}
                    onClick={() => setSelectedLevel(level.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: ZONE_COLORS[zone].bg }}
                        />
                        <span className="font-medium text-sm">{level.name}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeLevel(level.id);
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Skill: {level.skill} | Difficulty: {level.difficulty} | {ZONE_COLORS[zone].label}
                    </div>
                  </div>
                );
              })}
            </div>

            {selectedLevelData && (
              <div className="pt-4 border-t space-y-4">
                <p className="text-sm font-medium">Edit: {selectedLevelData.name}</p>
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">Name</label>
                  <input
                    type="text"
                    value={selectedLevelData.name}
                    onChange={(e) => updateLevel(selectedLevelData.id, { name: e.target.value })}
                    className="w-full px-3 py-1.5 rounded border bg-background text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span>Skill</span>
                    <span>{selectedLevelData.skill}</span>
                  </div>
                  <Slider
                    value={[selectedLevelData.skill]}
                    onValueChange={([v]) => updateLevel(selectedLevelData.id, { skill: v })}
                    min={0}
                    max={10}
                    step={0.5}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span>Difficulty</span>
                    <span>{selectedLevelData.difficulty}</span>
                  </div>
                  <Slider
                    value={[selectedLevelData.difficulty]}
                    onValueChange={([v]) => updateLevel(selectedLevelData.id, { difficulty: v })}
                    min={0}
                    max={10}
                    step={0.5}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Theory Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Flow Theory in Game Design</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3 text-sm">
            <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
              <p className="font-medium text-green-600 dark:text-green-400">Optimum Flow</p>
              <p className="text-muted-foreground text-xs mt-1">
                Difficulty matches skill. Player is fully immersed, loses track of time.
                This is where near-loss wins happen.
              </p>
            </div>
            <div className="p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-lg">
              <p className="font-medium text-cyan-600 dark:text-cyan-400">Boredom Zone</p>
              <p className="text-muted-foreground text-xs mt-1">
                Skill exceeds difficulty. Player disengages, may quit or rush through.
                Victory laps should be brief visits here.
              </p>
            </div>
            <div className="p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg">
              <p className="font-medium text-orange-600 dark:text-orange-400">Frustration Zone</p>
              <p className="text-muted-foreground text-xs mt-1">
                Difficulty exceeds skill. Player feels stuck, may rage-quit.
                Almost-win losses should feel close to flow, not here.
              </p>
            </div>
          </div>
          <div className="mt-4 p-3 bg-muted/50 rounded-lg">
            <p className="text-sm font-medium mb-2">Design Principle</p>
            <p className="text-xs text-muted-foreground">
              As players progress, their skill increases. Your difficulty curve should rise
              proportionally to keep them in flow. The sawtooth pattern creates controlled dips
              into boredom (recovery levels) and peaks toward frustration (hard spikes), but
              always returns to flow. This rhythm prevents both burnout and boredom.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
