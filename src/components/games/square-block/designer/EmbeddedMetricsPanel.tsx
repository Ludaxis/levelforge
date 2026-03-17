'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  calculateFlowZone,
  getSawtoothPosition,
  getExpectedDifficulty,
  estimateLevel,
} from '@/types/squareBlock';
import { analyzePuzzle, calculateDifficultyScore } from '@/lib/puzzleAnalyzer';
import {
  BarChart3, Target, Activity,
  TrendingUp, Clock, Percent,
} from 'lucide-react';
import { FLOW_ZONE_COLORS, DIFFICULTY_BADGE_COLORS, SAWTOOTH_EXPECTED_DISPLAY } from '@/lib/designerConstants';
import type { EmbeddedMetricsPanelProps } from './types';

export function EmbeddedMetricsPanel({
  blocks,
  holes,
  rows,
  cols,
  levelNumber,
  solvable,
}: EmbeddedMetricsPanelProps) {
  const cellCount = blocks.size;
  const holeCount = holes.size;
  const lockedCount = Array.from(blocks.values()).filter(b => b.locked).length;
  const icedCount = Array.from(blocks.values()).filter(b => b.iceCount && b.iceCount > 0).length;
  const mirrorCount = Array.from(blocks.values()).filter(b => b.mirror).length;

  // Use new analyzer
  const analysis = useMemo(() => {
    if (cellCount === 0) return null;
    return analyzePuzzle(blocks, holes, rows, cols);
  }, [blocks, holes, rows, cols, cellCount]);

  const breakdown = useMemo(() => {
    if (!analysis || !analysis.solvable) return null;
    return calculateDifficultyScore(analysis);
  }, [analysis]);

  const difficulty = breakdown?.tier ?? 'easy';
  const sawtoothPosition = getSawtoothPosition(levelNumber);
  const expectedDiff = getExpectedDifficulty(levelNumber);
  const flowZone = calculateFlowZone(difficulty, levelNumber);
  const estimation = cellCount > 0 ? estimateLevel(difficulty, cellCount) : null;

  const flowColors = FLOW_ZONE_COLORS[flowZone];
  const diffColors = DIFFICULTY_BADGE_COLORS[difficulty];
  const expectedColors = DIFFICULTY_BADGE_COLORS[expectedDiff];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <BarChart3 className="h-4 w-4" />
          Level {levelNumber} Metrics
        </CardTitle>
        <CardDescription>Position {sawtoothPosition} in 10-level cycle</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Basic Stats */}
        <div className="grid grid-cols-5 gap-2 text-center">
          <div className="p-2 bg-muted/50 rounded-lg">
            <p className="text-2xl font-bold">{cellCount}</p>
            <p className="text-xs text-muted-foreground">Blocks</p>
          </div>
          <div className="p-2 bg-muted/50 rounded-lg">
            <p className="text-2xl font-bold">{holeCount}</p>
            <p className="text-xs text-muted-foreground">Holes</p>
          </div>
          <div className="p-2 bg-muted/50 rounded-lg">
            <p className="text-2xl font-bold text-amber-400">{lockedCount}</p>
            <p className="text-xs text-muted-foreground">Gate</p>
          </div>
          <div className="p-2 bg-muted/50 rounded-lg">
            <p className="text-2xl font-bold text-cyan-400">{icedCount}</p>
            <p className="text-xs text-muted-foreground">Iced</p>
          </div>
          <div className="p-2 bg-muted/50 rounded-lg">
            <p className="text-2xl font-bold text-purple-400">{mirrorCount}</p>
            <p className="text-xs text-muted-foreground">Mirror</p>
          </div>
        </div>

        {/* Mistake Mechanic Info */}
        <div className="p-3 bg-muted/30 rounded-lg text-center">
          <p className="text-sm text-muted-foreground">
            Players have <span className="font-bold text-red-500">3 chances</span> (&#10084;&#65039;&#10084;&#65039;&#10084;&#65039;)
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Tapping a blocked block = lose a heart
          </p>
        </div>

        {/* Difficulty Score */}
        {breakdown && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Difficulty Score</span>
              <span className={`font-bold ${
                breakdown.tier === 'easy' ? 'text-green-500' :
                breakdown.tier === 'medium' ? 'text-yellow-500' :
                breakdown.tier === 'hard' ? 'text-orange-500' :
                'text-red-500'
              }`}>{breakdown.score}/100</span>
            </div>
            <Progress value={breakdown.score} className="h-2" />

            {/* Breakdown Components */}
            <div className="text-xs space-y-1 mt-2 p-2 bg-muted/30 rounded">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Avg Blockers ({breakdown.components.avgBlockers.toFixed(1)}×4.5)</span>
                <span>+{(breakdown.components.avgBlockers * 4.5).toFixed(1)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Clearability ({(breakdown.components.clearability * 100).toFixed(0)}%)</span>
                <span>+{((1 - breakdown.components.clearability) * 20).toFixed(1)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Blocks ({breakdown.components.blockCount})</span>
                <span>+{Math.min(breakdown.components.blockCount / 40, 10).toFixed(1)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Gate ({breakdown.components.lockedCount})</span>
                <span>+{Math.min(breakdown.components.lockedCount, 5)}</span>
              </div>
              {breakdown.components.sizeBonus > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Size Bonus (400+)</span>
                  <span>+{breakdown.components.sizeBonus.toFixed(1)}</span>
                </div>
              )}
              <div className="flex justify-between pt-1 border-t border-muted font-medium">
                <span>Score</span>
                <span>{breakdown.score}/100</span>
              </div>
            </div>
          </div>
        )}

        {/* Difficulty Tier */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <Target className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Difficulty Tier</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Actual</span>
            <Badge className={`${diffColors.bg} ${diffColors.text}`}>
              {difficulty === 'superHard' ? 'Super Hard' : difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Expected</span>
            <Badge variant="outline" className={expectedColors.text}>
              {expectedDiff === 'superHard' ? 'Super Hard' : expectedDiff.charAt(0).toUpperCase() + expectedDiff.slice(1)}
            </Badge>
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
        </div>

        {/* Estimation */}
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

        {/* Sawtooth */}
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
                    isActive ? `${colors.bg} ${colors.text} ring-2 ring-white` : 'bg-muted/30 text-muted-foreground'
                  }`}
                >
                  {pos}
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
