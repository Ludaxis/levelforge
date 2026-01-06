'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { GameState, GameOutcome, Objective, COLOR_HEX } from '@/types/game';
import { EMOTIONAL_OUTCOMES } from '@/lib/constants';
import { Trophy, Target, Footprints, Zap } from 'lucide-react';

interface GameStatusProps {
  gameState: GameState;
  outcome: GameOutcome;
  initialMoves: number;
}

const outcomeInfo: Record<GameOutcome, { label: string; color: string; description: string }> = {
  playing: { label: 'Playing', color: '#3b82f6', description: 'Game in progress' },
  easyWin: { label: 'Easy Win', color: '#94a3b8', description: 'Too easy! Player may feel unchallenged.' },
  nearLossWin: { label: 'Near-Loss Win!', color: '#22c55e', description: 'Perfect! Thrilling victory with 1-3 moves left.' },
  almostWinLoss: { label: 'Almost-Win Loss', color: '#f97316', description: 'Good! Frustrating but motivating - drives retry.' },
  crushingLoss: { label: 'Crushing Loss', color: '#ef4444', description: 'Too hard! Player may blame game and churn.' },
};

export function GameStatus({ gameState, outcome, initialMoves }: GameStatusProps) {
  const info = outcomeInfo[outcome];
  const isTarget = outcome === 'nearLossWin' || outcome === 'almostWinLoss';

  return (
    <div className="space-y-4">
      {/* Moves and Score */}
      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 text-muted-foreground mb-1">
                <Footprints className="h-4 w-4" />
                <span className="text-sm">Moves</span>
              </div>
              <span className="text-3xl font-bold">{gameState.movesRemaining}</span>
              <span className="text-sm text-muted-foreground">/{initialMoves}</span>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 text-muted-foreground mb-1">
                <Zap className="h-4 w-4" />
                <span className="text-sm">Score</span>
              </div>
              <span className="text-3xl font-bold">{gameState.score}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Objectives */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-4 w-4" />
            Objectives
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {gameState.objectives.map((obj, i) => {
            const progress = Math.min(100, (obj.collected / obj.target) * 100);
            const isComplete = obj.collected >= obj.target;

            return (
              <div key={i} className="space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: COLOR_HEX[obj.color] }}
                    />
                    <span className="text-sm capitalize">{obj.color}</span>
                  </div>
                  <span className={`text-sm font-medium ${isComplete ? 'text-green-500' : ''}`}>
                    {obj.collected}/{obj.target}
                    {isComplete && ' ✓'}
                  </span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Outcome (when game is complete) */}
      {gameState.isComplete && (
        <Card style={{ borderColor: info.color, borderWidth: 2 }}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Trophy className="h-4 w-4" />
              Result
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge
                  style={{ backgroundColor: info.color }}
                  className="text-white"
                >
                  {info.label}
                </Badge>
                {isTarget && (
                  <Badge variant="outline" className="border-green-500 text-green-600">
                    Target Outcome
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">{info.description}</p>

              {gameState.isWon ? (
                <div className="p-3 bg-green-500/10 rounded-lg">
                  <p className="text-sm">
                    <span className="font-medium">Moves remaining:</span> {gameState.movesRemaining}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {gameState.movesRemaining >= 10
                      ? 'Consider reducing move limit for better tension.'
                      : 'Good balance - creates exciting finish!'}
                  </p>
                </div>
              ) : (
                <div className="p-3 bg-red-500/10 rounded-lg">
                  <p className="text-sm">
                    <span className="font-medium">Objectives remaining:</span>{' '}
                    {gameState.objectives.reduce(
                      (sum, obj) => sum + Math.max(0, obj.target - obj.collected),
                      0
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {outcome === 'almostWinLoss'
                      ? 'Good! Player will want to retry.'
                      : 'Too far from goal - consider adding moves or reducing targets.'}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Framework Tips */}
      {!gameState.isComplete && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Framework Tip</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground italic">
              &quot;Tune move counts precisely: If average completion takes ~15 moves, give exactly 15-16 moves
              for near-loss wins.&quot;
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
