'use client';

import { useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { COGNITIVE_MODES } from '@/lib/constants';
import { Brain, Zap } from 'lucide-react';

type PhaseKey = keyof typeof COGNITIVE_MODES;

interface PhaseData {
  key: PhaseKey;
  name: string;
  s1: number;
  s2: number;
  levels: string;
  approach: string;
}

const phaseNames: Record<PhaseKey, string> = {
  onboarding: 'Onboarding',
  earlyGame: 'Early Game',
  midGame: 'Mid Game',
  hard: 'Hard Levels',
  superHard: 'Super Hard',
};

const initialPhases: PhaseData[] = (Object.keys(COGNITIVE_MODES) as PhaseKey[]).map((key) => ({
  key,
  name: phaseNames[key],
  s1: COGNITIVE_MODES[key].s1,
  s2: COGNITIVE_MODES[key].s2,
  levels: COGNITIVE_MODES[key].levels,
  approach: COGNITIVE_MODES[key].approach,
}));

export function CognitiveBalance() {
  const [phases, setPhases] = useState<PhaseData[]>(initialPhases);
  const [selectedPhase, setSelectedPhase] = useState<PhaseKey>('onboarding');

  const updatePhaseBalance = (key: PhaseKey, s1: number) => {
    setPhases((prev) =>
      prev.map((phase) =>
        phase.key === key ? { ...phase, s1, s2: 100 - s1 } : phase
      )
    );
  };

  const resetToDefault = () => {
    setPhases(initialPhases);
  };

  const selectedData = phases.find((p) => p.key === selectedPhase)!;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>System 1 vs System 2 Cognitive Balance</CardTitle>
          <CardDescription>
            Balance between automatic (System 1) and deliberate (System 2) thinking across game phases.
            System 1 creates flow and accessibility; System 2 creates challenge and monetization opportunities.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={phases} layout="vertical" margin={{ left: 80, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                <YAxis dataKey="name" type="category" width={80} className="text-xs" />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload as PhaseData;
                      return (
                        <div className="bg-popover border rounded-lg p-3 shadow-lg">
                          <p className="font-medium">{data.name}</p>
                          <p className="text-xs text-muted-foreground mb-2">Levels: {data.levels}</p>
                          <div className="flex gap-4">
                            <div className="flex items-center gap-1">
                              <div className="w-3 h-3 rounded bg-blue-500" />
                              <span className="text-sm">S1: {data.s1}%</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <div className="w-3 h-3 rounded bg-orange-500" />
                              <span className="text-sm">S2: {data.s2}%</span>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend />
                <Bar
                  dataKey="s1"
                  stackId="a"
                  fill="#3b82f6"
                  name="System 1 (Automatic)"
                  onClick={(data) => {
                    const phaseData = data as unknown as PhaseData;
                    if (phaseData?.key) setSelectedPhase(phaseData.key);
                  }}
                  cursor="pointer"
                />
                <Bar
                  dataKey="s2"
                  stackId="a"
                  fill="#f97316"
                  name="System 2 (Deliberate)"
                  onClick={(data) => {
                    const phaseData = data as unknown as PhaseData;
                    if (phaseData?.key) setSelectedPhase(phaseData.key);
                  }}
                  cursor="pointer"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Adjust Balance</CardTitle>
            <CardDescription>Click a phase in the chart or select below</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-wrap gap-2">
              {phases.map((phase) => (
                <Badge
                  key={phase.key}
                  variant={selectedPhase === phase.key ? 'default' : 'outline'}
                  className="cursor-pointer"
                  onClick={() => setSelectedPhase(phase.key)}
                >
                  {phase.name}
                </Badge>
              ))}
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-blue-500" />
                  <span className="text-sm font-medium">System 1</span>
                </div>
                <span className="text-2xl font-bold text-blue-500">{selectedData.s1}%</span>
              </div>

              <Slider
                value={[selectedData.s1]}
                onValueChange={([v]) => updatePhaseBalance(selectedPhase, v)}
                min={0}
                max={100}
                step={5}
                className="[&>span:first-child]:bg-gradient-to-r [&>span:first-child]:from-blue-500 [&>span:first-child]:to-orange-500"
              />

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Brain className="h-4 w-4 text-orange-500" />
                  <span className="text-sm font-medium">System 2</span>
                </div>
                <span className="text-2xl font-bold text-orange-500">{selectedData.s2}%</span>
              </div>
            </div>

            <button
              onClick={resetToDefault}
              className="text-sm text-muted-foreground hover:text-foreground underline"
            >
              Reset to defaults
            </button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{selectedData.name}</CardTitle>
            <CardDescription>Levels: {selectedData.levels}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-muted/50 rounded-lg">
              <p className="text-sm font-medium mb-2">Design Approach</p>
              <p className="text-sm text-muted-foreground">{selectedData.approach}</p>
            </div>

            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <Zap className="h-5 w-5 text-blue-500 mt-0.5" />
                <div>
                  <p className="text-sm font-medium">System 1 (Fast, Automatic)</p>
                  <p className="text-xs text-muted-foreground">
                    Pattern recognition, gut feelings, familiar actions. Creates flow state and relaxation.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Brain className="h-5 w-5 text-orange-500 mt-0.5" />
                <div>
                  <p className="text-sm font-medium">System 2 (Slow, Deliberate)</p>
                  <p className="text-xs text-muted-foreground">
                    Complex computations, planning, strategic decisions. Creates &quot;aha moments&quot; and satisfaction.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Key Insight</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground italic">
            &quot;Easy to begin, hard to master.&quot; Use System 1 for broad appeal and onboarding,
            System 2 for challenge and monetization paywalls.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
