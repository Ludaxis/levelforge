'use client';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BarChart3, TrendingUp, TrendingDown } from 'lucide-react';
import type { DifficultyPanelProps } from './types';

export function DifficultyPanel({
  blocks,
  puzzleAnalysis,
  difficultyBreakdown,
  solvability,
  isAdjusting,
  lastAdjustmentResult,
  canIncreaseDifficulty,
  canDecreaseDifficulty,
  increaseDifficulty,
  decreaseDifficulty,
}: DifficultyPanelProps) {
  return (
    <>
      {/* Difficulty Adjustment Buttons */}
      {blocks.size > 0 && solvability.solvable && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={decreaseDifficulty}
              disabled={isAdjusting || !canDecreaseDifficulty}
              className="flex-1"
            >
              <TrendingDown className="h-4 w-4 mr-2" />
              Easier
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={increaseDifficulty}
              disabled={isAdjusting || !canIncreaseDifficulty}
              className="flex-1"
            >
              <TrendingUp className="h-4 w-4 mr-2" />
              Harder
            </Button>
          </div>

          {/* Adjustment Feedback Toast */}
          {lastAdjustmentResult && (
            <div className={`p-2 rounded-lg text-sm ${
              lastAdjustmentResult.success
                ? 'bg-green-500/10 border border-green-500/30 text-green-400'
                : 'bg-amber-500/10 border border-amber-500/30 text-amber-400'
            }`}>
              <p className="font-medium">{lastAdjustmentResult.action}</p>
              {lastAdjustmentResult.success && (
                <p className="text-xs">
                  Score: {lastAdjustmentResult.scoreBefore} &rarr; {lastAdjustmentResult.scoreAfter}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Difficulty Breakdown */}
      {blocks.size > 0 && puzzleAnalysis && (
        <div className="p-3 bg-muted/30 rounded-lg space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Difficulty Analysis
            </span>
            {difficultyBreakdown && (
              <Badge className={`${
                difficultyBreakdown.tier === 'easy' ? 'bg-green-500' :
                difficultyBreakdown.tier === 'medium' ? 'bg-yellow-500 text-black' :
                difficultyBreakdown.tier === 'hard' ? 'bg-orange-500' :
                'bg-red-500'
              }`}>
                {difficultyBreakdown.score}/100 ({difficultyBreakdown.tier})
              </Badge>
            )}
          </div>

          {difficultyBreakdown && (
            <div className="space-y-2">
              {/* Progress bar */}
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    difficultyBreakdown.tier === 'easy' ? 'bg-green-500' :
                    difficultyBreakdown.tier === 'medium' ? 'bg-yellow-500' :
                    difficultyBreakdown.tier === 'hard' ? 'bg-orange-500' :
                    'bg-red-500'
                  }`}
                  style={{ width: `${difficultyBreakdown.score}%` }}
                />
              </div>

              {/* Score breakdown */}
              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Avg Blockers ({difficultyBreakdown.components.avgBlockers.toFixed(2)} × 4.5)</span>
                  <span className="font-mono">+{(difficultyBreakdown.components.avgBlockers * 4.5).toFixed(1)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Clearability ({(difficultyBreakdown.components.clearability * 100).toFixed(1)}%)</span>
                  <span className="font-mono">+{((1 - difficultyBreakdown.components.clearability) * 20).toFixed(1)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Block Count ({difficultyBreakdown.components.blockCount})</span>
                  <span className="font-mono">+{Math.min(difficultyBreakdown.components.blockCount / 40, 10).toFixed(1)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Gate Blocks ({difficultyBreakdown.components.lockedCount})</span>
                  <span className="font-mono">+{Math.min(difficultyBreakdown.components.lockedCount, 5)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Ice Blocks ({difficultyBreakdown.components.icedCount}{difficultyBreakdown.components.icedCount > 0 ? `, avg ${difficultyBreakdown.components.avgIceCount.toFixed(1)}` : ''})</span>
                  <span className="font-mono">+{(Math.min(difficultyBreakdown.components.icedCount, 5) + Math.min(difficultyBreakdown.components.avgIceCount * 0.5, 5)).toFixed(1)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Mirror Blocks ({difficultyBreakdown.components.mirrorCount})</span>
                  <span className="font-mono">+{Math.min(difficultyBreakdown.components.mirrorCount, 5)}</span>
                </div>
                {difficultyBreakdown.components.sizeBonus > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Size Bonus (400+ blocks)</span>
                    <span className="font-mono">+{difficultyBreakdown.components.sizeBonus.toFixed(1)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center pt-2 border-t border-muted font-medium">
                  <span>Total Score</span>
                  <span className="font-mono">{difficultyBreakdown.score}/100</span>
                </div>
              </div>

              {/* Formula */}
              <div className="pt-2 border-t border-muted text-xs space-y-1.5">
                <p className="font-medium text-foreground">Difficulty Formula:</p>
                <div className="font-mono text-muted-foreground bg-muted/50 p-2 rounded space-y-1">
                  <p>avgBlockers × 4.5 (primary)</p>
                  <p>+ (1 - clearability) × 20</p>
                  <p>+ min(blocks/40, 10)</p>
                  <p>+ min(gate, 5)</p>
                  <p>+ min(ice, 5) + min(avgIce × 0.5, 5)</p>
                  <p>+ min(mirror, 5)</p>
                  <p>+ sizeBonus (400+ blocks: up to +20)</p>
                </div>
                <p className="text-muted-foreground">0-24 = Easy, 25-49 = Medium, 50-74 = Hard, 75+ = Super Hard</p>
              </div>

              {/* Generation algorithm explanation */}
              <div className="pt-2 border-t border-muted text-xs space-y-2">
                <p className="font-medium text-foreground">How &quot;Fill Grid Randomly&quot; works:</p>
                <div className="space-y-1.5 text-muted-foreground">
                  <p>1. Fills every cell with a block pointing toward nearest edge</p>
                  <p>2. Randomly flips ~50% of directions while keeping solvable</p>
                  <p>3. Adds random gate blocks while keeping solvable</p>
                  <p>4. Calculates difficulty based on blockers, gate %, and clearability</p>
                </div>
                <p className="text-muted-foreground italic">Click multiple times to get different configurations.</p>
              </div>
            </div>
          )}

          {!puzzleAnalysis.solvable && (
            <p className="text-xs text-amber-500">Level is not solvable - metrics unavailable</p>
          )}
        </div>
      )}
    </>
  );
}
