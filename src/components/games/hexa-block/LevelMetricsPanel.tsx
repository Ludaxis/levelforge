'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  HexStack,
  LevelMetrics,
  FlowZone,
  DifficultyTier,
  getExpectedDifficulty,
  getSawtoothPosition,
  calculateFlowZone,
  calculateDifficulty,
  SAWTOOTH_EXPECTED,
} from '@/types/hexaBlock';
import { AxialCoord } from '@/lib/hexGrid';
import { BarChart3, Target, Lightbulb, TrendingUp, Activity } from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

interface LevelMetricsPanelProps {
  stacks: Map<string, HexStack>;
  holes: Set<string>;
  levelNumber: number;
  solvable: boolean;
  initialClearability: number;
}

// ============================================================================
// Constants
// ============================================================================

const FLOW_ZONE_COLORS: Record<FlowZone, { bg: string; text: string; border: string }> = {
  flow: { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/50' },
  boredom: { bg: 'bg-cyan-500/20', text: 'text-cyan-400', border: 'border-cyan-500/50' },
  frustration: { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/50' },
};

const DIFFICULTY_COLORS: Record<DifficultyTier, { bg: string; text: string }> = {
  easy: { bg: 'bg-green-500', text: 'text-white' },
  medium: { bg: 'bg-yellow-500', text: 'text-black' },
  hard: { bg: 'bg-orange-500', text: 'text-white' },
  superHard: { bg: 'bg-red-500', text: 'text-white' },
};

const DIFFICULTY_LABELS: Record<DifficultyTier, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  superHard: 'Super Hard',
};

const FLOW_ZONE_LABELS: Record<FlowZone, string> = {
  flow: 'Flow State',
  boredom: 'Too Easy',
  frustration: 'Too Hard',
};

// ============================================================================
// Component
// ============================================================================

export function LevelMetricsPanel({
  stacks,
  holes,
  levelNumber,
  solvable,
  initialClearability,
}: LevelMetricsPanelProps) {
  // Calculate metrics
  const metrics = useMemo((): LevelMetrics => {
    const cellCount = stacks.size;
    const holeCount = holes.size;
    const optimalMoves = cellCount; // Greedy simulation
    const moveBuffer = 5; // Default buffer
    const moveLimit = optimalMoves + moveBuffer;
    const moveBufferPercent = optimalMoves > 0 ? (moveBuffer / optimalMoves) * 100 : 0;
    const difficulty = calculateDifficulty(initialClearability, cellCount, moveBufferPercent);
    const sawtoothPosition = getSawtoothPosition(levelNumber);
    const flowZone = calculateFlowZone(difficulty, levelNumber);

    return {
      cellCount,
      holeCount,
      optimalMoves,
      moveLimit,
      moveBuffer,
      moveBufferPercent,
      initialClearability,
      difficulty,
      flowZone,
      sawtoothPosition,
    };
  }, [stacks, holes, levelNumber, initialClearability]);

  const expectedDifficulty = getExpectedDifficulty(levelNumber);
  const flowColors = FLOW_ZONE_COLORS[metrics.flowZone];
  const diffColors = DIFFICULTY_COLORS[metrics.difficulty];
  const expectedColors = DIFFICULTY_COLORS[expectedDifficulty];

  // Design tips based on metrics
  const designTip = useMemo(() => {
    if (!solvable) {
      return 'Level is not solvable. Ensure at least one cell has a clear exit path.';
    }
    if (metrics.cellCount === 0) {
      return 'Add cells to the grid to create a puzzle.';
    }
    if (metrics.flowZone === 'boredom') {
      return 'Level is easier than expected. Add more blocking cells or change arrow directions toward the center.';
    }
    if (metrics.flowZone === 'frustration') {
      return 'Level is harder than expected. Add more cells pointing to edges or use bidirectional arrows.';
    }
    if (metrics.difficulty === expectedDifficulty) {
      return 'Great! Level difficulty matches the sawtooth pattern for this position.';
    }
    return 'Level is in the flow zone. Good balance between challenge and accessibility.';
  }, [metrics, solvable, expectedDifficulty]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <BarChart3 className="h-4 w-4" />
          Level {levelNumber} Metrics
        </CardTitle>
        <CardDescription>
          Position {metrics.sawtoothPosition} in 10-level cycle
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Basic Stats */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2 bg-muted/50 rounded-lg">
            <p className="text-2xl font-bold">{metrics.cellCount}</p>
            <p className="text-xs text-muted-foreground">Cells</p>
          </div>
          <div className="p-2 bg-muted/50 rounded-lg">
            <p className="text-2xl font-bold">{metrics.holeCount}</p>
            <p className="text-xs text-muted-foreground">Holes</p>
          </div>
          <div className="p-2 bg-muted/50 rounded-lg">
            <p className="text-2xl font-bold">{metrics.optimalMoves}</p>
            <p className="text-xs text-muted-foreground">Moves</p>
          </div>
        </div>

        {/* Clearability Progress */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Initial Clearability</span>
            <span className="font-medium">{(metrics.initialClearability * 100).toFixed(0)}%</span>
          </div>
          <Progress value={metrics.initialClearability * 100} className="h-2" />
          <p className="text-xs text-muted-foreground">
            {Math.round(metrics.initialClearability * metrics.cellCount)} of {metrics.cellCount} cells clearable at start
          </p>
        </div>

        {/* Difficulty Comparison */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <Target className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Difficulty</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Actual</span>
                <Badge className={`${diffColors.bg} ${diffColors.text}`}>
                  {DIFFICULTY_LABELS[metrics.difficulty]}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Expected (Sawtooth)</span>
                <Badge variant="outline" className={expectedColors.text}>
                  {DIFFICULTY_LABELS[expectedDifficulty]}
                </Badge>
              </div>
            </div>
          </div>
        </div>

        {/* Flow Zone */}
        <div className={`p-3 rounded-lg border ${flowColors.bg} ${flowColors.border}`}>
          <div className="flex items-center gap-2">
            <Activity className={`h-4 w-4 ${flowColors.text}`} />
            <span className={`font-medium ${flowColors.text}`}>
              {FLOW_ZONE_LABELS[metrics.flowZone]}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {metrics.flowZone === 'flow' && 'Difficulty matches player progression expectation'}
            {metrics.flowZone === 'boredom' && 'Easier than expected - players may disengage'}
            {metrics.flowZone === 'frustration' && 'Harder than expected - players may get stuck'}
          </p>
        </div>

        {/* Sawtooth Position Visual */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Sawtooth Position</span>
          </div>
          <div className="flex gap-0.5">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((pos) => {
              const expected = SAWTOOTH_EXPECTED[pos];
              const colors = DIFFICULTY_COLORS[expected];
              const isActive = pos === metrics.sawtoothPosition;
              return (
                <div
                  key={pos}
                  className={`flex-1 h-8 rounded-sm flex items-center justify-center text-xs font-medium transition-all ${
                    isActive
                      ? `${colors.bg} ${colors.text} ring-2 ring-white`
                      : 'bg-muted/30 text-muted-foreground'
                  }`}
                >
                  {pos}
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Recovery</span>
            <span>Spike</span>
            <span>Peak</span>
          </div>
        </div>

        {/* Design Tip */}
        <div className="p-3 bg-muted/30 rounded-lg">
          <div className="flex items-start gap-2">
            <Lightbulb className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">{designTip}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
