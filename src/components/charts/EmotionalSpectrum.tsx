'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { EMOTIONAL_OUTCOMES } from '@/lib/constants';
import { Target, AlertTriangle, TrendingUp, TrendingDown, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

type OutcomeType = typeof EMOTIONAL_OUTCOMES[number];

export function EmotionalSpectrum() {
  const [selectedOutcome, setSelectedOutcome] = useState<OutcomeType>(EMOTIONAL_OUTCOMES[1]);
  const [movesLeft, setMovesLeft] = useState(2);
  const [objectivesLeft, setObjectivesLeft] = useState(2);

  const getOutcomeFromState = (): OutcomeType => {
    // Win scenario
    if (objectivesLeft === 0) {
      if (movesLeft >= 10) return EMOTIONAL_OUTCOMES[0]; // Easy Win
      return EMOTIONAL_OUTCOMES[1]; // Near-Loss Win
    }
    // Loss scenario
    if (objectivesLeft >= 10) return EMOTIONAL_OUTCOMES[3]; // Crushing Loss
    return EMOTIONAL_OUTCOMES[2]; // Almost-Win Loss
  };

  const currentOutcome = getOutcomeFromState();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Emotional Outcome Spectrum</CardTitle>
          <CardDescription>
            The four emotional outcomes in puzzle games. Target the middle two (green zone) for
            optimal player retention and monetization.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative">
            {/* Spectrum bar */}
            <div className="flex h-20 rounded-lg overflow-hidden">
              {EMOTIONAL_OUTCOMES.map((outcome, i) => (
                <button
                  key={outcome.type}
                  onClick={() => setSelectedOutcome(outcome)}
                  className={cn(
                    'flex-1 flex flex-col items-center justify-center transition-all relative',
                    selectedOutcome.type === outcome.type && 'ring-2 ring-white ring-offset-2 z-10',
                    outcome.target && 'ring-1 ring-green-400/50'
                  )}
                  style={{ backgroundColor: outcome.color }}
                >
                  <span className="text-white font-medium text-sm">{outcome.type}</span>
                  <span className="text-white/80 text-xs">{outcome.condition}</span>
                  {outcome.target && (
                    <Target className="absolute top-1 right-1 h-4 w-4 text-white/80" />
                  )}
                </button>
              ))}
            </div>

            {/* Target zone indicator */}
            <div className="mt-2 flex">
              <div className="flex-1 text-center text-xs text-muted-foreground">Avoid</div>
              <div className="flex-2 text-center">
                <Badge variant="outline" className="border-green-500 text-green-600">
                  Target Zone
                </Badge>
              </div>
              <div className="flex-1 text-center text-xs text-muted-foreground">Avoid</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Outcome Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              className="p-4 rounded-lg"
              style={{ backgroundColor: `${selectedOutcome.color}20` }}
            >
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: selectedOutcome.color }}
                />
                <span className="font-medium">{selectedOutcome.type}</span>
                {selectedOutcome.target && (
                  <Badge variant="outline" className="border-green-500 text-green-600 text-xs">
                    Target
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground mb-2">
                <span className="font-medium">Condition:</span> {selectedOutcome.condition}
              </p>
              <p className="text-sm text-muted-foreground mb-2">
                <span className="font-medium">Player Emotion:</span> {selectedOutcome.emotion}
              </p>
              <p className="text-sm text-muted-foreground">
                <span className="font-medium">Business Impact:</span> {selectedOutcome.impact}
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                {selectedOutcome.target ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-500" />
                )}
                <span className="text-sm">
                  {selectedOutcome.target
                    ? 'This outcome is desirable for your game'
                    : 'Try to minimize this outcome'}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Outcome Simulator</CardTitle>
            <CardDescription>Adjust to see which outcome results</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Moves Remaining</label>
                <span className="text-sm text-muted-foreground">{movesLeft}</span>
              </div>
              <input
                type="range"
                min="0"
                max="15"
                value={movesLeft}
                onChange={(e) => setMovesLeft(parseInt(e.target.value))}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Objectives Remaining</label>
                <span className="text-sm text-muted-foreground">{objectivesLeft}</span>
              </div>
              <input
                type="range"
                min="0"
                max="15"
                value={objectivesLeft}
                onChange={(e) => setObjectivesLeft(parseInt(e.target.value))}
                className="w-full"
              />
            </div>

            <div
              className="p-4 rounded-lg border-2"
              style={{
                borderColor: currentOutcome.color,
                backgroundColor: `${currentOutcome.color}10`,
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: currentOutcome.color }}
                />
                <span className="font-medium">{currentOutcome.type}</span>
              </div>
              <p className="text-sm text-muted-foreground">{currentOutcome.emotion}</p>
              {currentOutcome.target ? (
                <Badge className="mt-2 bg-green-500">Good Outcome</Badge>
              ) : (
                <Badge className="mt-2 bg-red-500">Avoid This</Badge>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">How to Engineer Close Calls</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <TrendingUp className="h-5 w-5 text-green-500 mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Near-Loss Wins</p>
                  <p className="text-xs text-muted-foreground">
                    Tune move counts precisely: If average completion takes ~15 moves, give exactly 15-16 moves
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <TrendingDown className="h-5 w-5 text-orange-500 mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Almost-Win Losses</p>
                  <p className="text-xs text-muted-foreground">
                    Structure so last 1-2 objectives require final moves. Track failure patterns.
                  </p>
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-500 mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Avoid Large Margins</p>
                  <p className="text-xs text-muted-foreground">
                    If playtesters finish with 10+ moves left, reduce move count
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Target className="h-5 w-5 text-blue-500 mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Failure Targets</p>
                  <p className="text-xs text-muted-foreground">
                    Aim for 1-3 objectives remaining on failure, not 10+
                  </p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Industry Data</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground italic">
            Analysis of 500 levels found Royal Match creates ~2x more &apos;near-loss wins&apos; than Candy
            Crush Saga, and ~2x more &apos;almost-win losses&apos; than Homescapes. This is by design—it
            heightens engagement and drives monetization.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
