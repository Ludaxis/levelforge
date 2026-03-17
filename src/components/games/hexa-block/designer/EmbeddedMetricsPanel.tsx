'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  calculateDifficulty,
  calculateFlowZone,
  getSawtoothPosition,
  getExpectedDifficulty,
  estimateLevel,
} from '@/types/hexaBlock';
import { BarChart3, Target, Activity, TrendingUp, Clock, Percent, Lightbulb } from 'lucide-react';
import { FLOW_ZONE_COLORS, DIFFICULTY_BADGE_COLORS, SAWTOOTH_EXPECTED_DISPLAY } from '@/lib/designerConstants';
import { EmbeddedMetricsPanelProps } from './types';

export function EmbeddedMetricsPanel({
  stacks,
  holes,
  levelNumber,
  solvable,
  initialClearability,
  gridRadius,
  extraMoves,
  optimalMoves,
  onExtraMovesChange,
}: EmbeddedMetricsPanelProps) {
  const cellCount = stacks.size;
  const holeCount = holes.size;
  const moveLimit = optimalMoves + extraMoves;
  const moveBufferPercent = optimalMoves > 0 ? (extraMoves / optimalMoves) * 100 : 0;
  const difficulty = calculateDifficulty(initialClearability, cellCount, moveBufferPercent);
  const sawtoothPosition = getSawtoothPosition(levelNumber);
  const expectedDiff = getExpectedDifficulty(levelNumber);
  const flowZone = calculateFlowZone(difficulty, levelNumber);

  // Level time and attempt estimation
  const estimation = cellCount > 0 ? estimateLevel(moveLimit, difficulty, cellCount) : null;

  const flowColors = FLOW_ZONE_COLORS[flowZone];
  const diffColors = DIFFICULTY_BADGE_COLORS[difficulty];
  const expectedColors = DIFFICULTY_BADGE_COLORS[expectedDiff];

  // Design tip based on current state
  let designTip = '';
  if (!solvable) {
    designTip = 'Level is not solvable. Ensure at least one cell has a clear exit path.';
  } else if (cellCount === 0) {
    designTip = 'Add cells to the grid to create a puzzle.';
  } else if (flowZone === 'boredom') {
    designTip = 'Level is easier than expected. Add more blocking cells or change arrow directions toward the center.';
  } else if (flowZone === 'frustration') {
    designTip = 'Level is harder than expected. Add more cells pointing to edges or use bidirectional arrows.';
  } else if (difficulty === expectedDiff) {
    designTip = 'Great! Level difficulty matches the sawtooth pattern for this position.';
  } else {
    designTip = 'Level is in the flow zone. Good balance between challenge and accessibility.';
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <BarChart3 className="h-4 w-4" />
          Level {levelNumber} Metrics
        </CardTitle>
        <CardDescription>
          Position {sawtoothPosition} in 10-level cycle
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Basic Stats */}
        <div className="grid grid-cols-4 gap-2 text-center">
          <div className="p-2 bg-muted/50 rounded-lg">
            <p className="text-2xl font-bold">{cellCount}</p>
            <p className="text-xs text-muted-foreground">Cells</p>
          </div>
          <div className="p-2 bg-muted/50 rounded-lg">
            <p className="text-2xl font-bold">{holeCount}</p>
            <p className="text-xs text-muted-foreground">Holes</p>
          </div>
          <div className="p-2 bg-muted/50 rounded-lg">
            <p className="text-2xl font-bold">{optimalMoves}</p>
            <p className="text-xs text-muted-foreground">Min Moves</p>
          </div>
          <div className="p-2 bg-muted/50 rounded-lg">
            <p className="text-2xl font-bold text-primary">{moveLimit}</p>
            <p className="text-xs text-muted-foreground">Move Limit</p>
          </div>
        </div>

        {/* Move Limit Slider */}
        <div className="space-y-2 p-3 bg-muted/30 rounded-lg">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Extra Moves Buffer</label>
            <span className="text-sm">
              +{extraMoves} ({moveBufferPercent.toFixed(0)}%)
            </span>
          </div>
          <Slider
            value={[extraMoves]}
            onValueChange={([v]) => onExtraMovesChange(v)}
            min={0}
            max={Math.max(20, optimalMoves)}
            step={1}
          />
          <p className="text-xs text-muted-foreground">
            More buffer = easier level. {optimalMoves} minimum + {extraMoves} extra = {moveLimit} total moves allowed.
          </p>
        </div>

        {/* Clearability Progress */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Initial Clearability</span>
            <span className="font-medium">{(initialClearability * 100).toFixed(0)}%</span>
          </div>
          <Progress value={initialClearability * 100} className="h-2" />
          <p className="text-xs text-muted-foreground">
            {Math.round(initialClearability * cellCount)} of {cellCount} cells clearable at start
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
                  {difficulty === 'superHard' ? 'Super Hard' : difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Expected (Sawtooth)</span>
                <Badge variant="outline" className={expectedColors.text}>
                  {expectedDiff === 'superHard' ? 'Super Hard' : expectedDiff.charAt(0).toUpperCase() + expectedDiff.slice(1)}
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
              {flowZone === 'flow' ? 'Flow State' : flowZone === 'boredom' ? 'Too Easy' : 'Too Hard'}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {flowZone === 'flow' && 'Difficulty matches player progression expectation'}
            {flowZone === 'boredom' && 'Easier than expected - players may disengage'}
            {flowZone === 'frustration' && 'Harder than expected - players may get stuck'}
          </p>
        </div>

        {/* Level Estimation */}
        {estimation && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Player Estimation</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 bg-muted/50 rounded-lg">
                <p className="text-sm font-bold">{estimation.timePerAttemptDisplay}</p>
                <p className="text-xs text-muted-foreground">Per Attempt</p>
              </div>
              <div className="p-2 bg-muted/50 rounded-lg">
                <p className="text-sm font-bold">{estimation.attemptsDisplay}</p>
                <p className="text-xs text-muted-foreground">Attempts</p>
              </div>
              <div className="p-2 bg-muted/50 rounded-lg">
                <p className="text-sm font-bold">{estimation.totalTimeDisplay}</p>
                <p className="text-xs text-muted-foreground">Total Time</p>
              </div>
            </div>
            <div className="flex items-center justify-between p-2 bg-muted/30 rounded-lg text-xs">
              <div className="flex items-center gap-1.5">
                <Percent className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Target Win Rate:</span>
              </div>
              <span className="font-medium">{estimation.targetWinRate[0]}% - {estimation.targetWinRate[1]}%</span>
            </div>
          </div>
        )}

        {/* Sawtooth Position Visual */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Sawtooth Position</span>
          </div>
          <div className="flex gap-0.5">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((pos) => {
              const expected = SAWTOOTH_EXPECTED_DISPLAY[pos as keyof typeof SAWTOOTH_EXPECTED_DISPLAY];
              const colors = DIFFICULTY_BADGE_COLORS[expected];
              const isActive = pos === sawtoothPosition;
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

        {/* Difficulty Calculation Explanation */}
        <div className="p-3 bg-muted/20 rounded-lg text-xs text-muted-foreground">
          <p className="font-medium text-foreground mb-1">How Difficulty is Calculated:</p>
          <p className="mb-2"><strong>Move Buffer</strong> is the primary factor. Clearability sets the base.</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="font-medium text-foreground/80">Clearability (base):</p>
              <ul className="mt-0.5 space-y-0">
                <li>≥50% = Easy</li>
                <li>20-50% = Medium</li>
                <li>5-20% = Hard</li>
                <li>&lt;5% = Super Hard</li>
              </ul>
            </div>
            <div>
              <p className="font-medium text-foreground/80">Buffer (major impact):</p>
              <ul className="mt-0.5 space-y-0">
                <li>≥100% = much easier (-2)</li>
                <li>60-100% = easier (-1)</li>
                <li>40-60% = normal</li>
                <li>25-40% = harder (+1)</li>
                <li>15-25% = hard (+2)</li>
                <li>&lt;15% = very hard (+3)</li>
              </ul>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
