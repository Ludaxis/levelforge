'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { HexaBlockState } from '@/types/hexaBlock';
import { Undo2, RotateCcw, Trophy, Lightbulb, Target, XCircle } from 'lucide-react';

interface HexBlockStatusProps {
  state: HexaBlockState;
  onUndo: () => void;
  onReset: () => void;
  isSolvable: boolean;
}

const difficultyColors: Record<string, string> = {
  tutorial: '#22c55e',
  easy: '#3b82f6',
  medium: '#f59e0b',
  hard: '#ef4444',
};

export function HexBlockStatus({ state, onUndo, onReset, isSolvable }: HexBlockStatusProps) {
  const { level, moveCount, moveLimit, isComplete, isLost, stacks, history } = state;
  const stacksRemaining = stacks.size;
  const canUndo = history.length > 0 && !state.animatingStack;

  // Calculate remaining moves
  const hasLimit = moveLimit > 0;
  const movesRemaining = hasLimit ? Math.max(0, moveLimit - moveCount) : null;
  const moveProgress = hasLimit ? (moveCount / moveLimit) * 100 : 0;

  // Determine move status color
  const getMoveStatusColor = () => {
    if (!hasLimit) return 'text-foreground';
    const ratio = moveCount / moveLimit;
    if (ratio >= 1) return 'text-red-500';
    if (ratio >= 0.8) return 'text-orange-500';
    if (ratio >= 0.6) return 'text-yellow-500';
    return 'text-foreground';
  };

  return (
    <div className="space-y-4">
      {/* Level Info */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">{level.name}</CardTitle>
            <Badge
              style={{ backgroundColor: difficultyColors[level.difficulty] }}
              className="text-white text-xs"
            >
              {level.difficulty}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              {hasLimit ? (
                <>
                  <div className={`text-2xl font-bold ${getMoveStatusColor()}`}>
                    {movesRemaining}
                  </div>
                  <div className="text-xs text-muted-foreground">Moves Left</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {moveCount} / {moveLimit}
                  </div>
                </>
              ) : (
                <>
                  <div className="text-2xl font-bold">{moveCount}</div>
                  <div className="text-xs text-muted-foreground">Moves</div>
                </>
              )}
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold">{stacksRemaining}</div>
              <div className="text-xs text-muted-foreground">Tiles Left</div>
            </div>
          </div>

          {/* Move Progress Bar */}
          {hasLimit && !isComplete && !isLost && (
            <div className="space-y-1">
              <Progress
                value={moveProgress}
                className={`h-2 ${moveProgress >= 80 ? '[&>div]:bg-orange-500' : moveProgress >= 60 ? '[&>div]:bg-yellow-500' : ''}`}
              />
              <p className="text-xs text-muted-foreground text-center">
                {movesRemaining === 0 ? 'No moves remaining!' :
                 movesRemaining === 1 ? '1 move remaining' :
                 `${movesRemaining} moves remaining`}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onUndo}
              disabled={!canUndo}
              className="flex-1"
            >
              <Undo2 className="h-4 w-4 mr-2" />
              Undo
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onReset}
              className="flex-1"
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Hint (if available) */}
      {level.hint && !isComplete && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Lightbulb className="h-4 w-4" />
              Hint
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{level.hint}</p>
          </CardContent>
        </Card>
      )}

      {/* Solvability warning */}
      {!isSolvable && !isComplete && !isLost && (
        <Card className="border-amber-500/50">
          <CardContent className="pt-4">
            <div className="flex items-start gap-2 text-amber-500">
              <Target className="h-4 w-4 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium">No clear moves!</p>
                <p className="text-xs text-muted-foreground mt-1">
                  All stacks are blocked. Use Undo or Reset.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lose state */}
      {isLost && (
        <Card className="border-red-500 border-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-red-500">
              <XCircle className="h-5 w-5" />
              Out of Moves!
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p className="text-sm">
                Used all <span className="font-bold">{moveLimit}</span> moves with{' '}
                <span className="font-bold">{stacksRemaining}</span> tiles remaining.
              </p>
              <p className="text-xs text-muted-foreground">
                Use Undo to try different moves, or Reset to start over.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Win state */}
      {isComplete && (
        <Card className="border-green-500 border-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-green-500">
              <Trophy className="h-5 w-5" />
              Level Complete!
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p className="text-sm">
                Cleared in <span className="font-bold">{moveCount}</span> moves
                {level.parMoves && (
                  <span className="text-muted-foreground">
                    {' '}(Par: {level.parMoves})
                  </span>
                )}
              </p>
              {level.parMoves && moveCount <= level.parMoves && (
                <Badge className="bg-green-500">
                  {moveCount < level.parMoves ? 'Under Par!' : 'On Par!'}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Framework tip */}
      {!isComplete && !isLost && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Design Note</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground italic">
              Logic puzzles like this test pure System 2 thinking - deliberate analysis
              with no random elements. Perfect for &quot;hard spike&quot; levels in a
              sawtooth curve.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
