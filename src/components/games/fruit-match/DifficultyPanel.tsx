'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  FruitMatchLevel,
  FRUIT_EMOJI,
  FRUIT_COLORS,
  DifficultyTier,
} from '@/types/fruitMatch';
import {
  calculateDifficultyMetrics,
  DifficultyMetrics,
  estimateCompletionTime,
  getRecommendedSettings,
} from '@/lib/fruitMatchDifficulty';
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Target,
  Layers,
  Grid3X3,
  BarChart3,
} from 'lucide-react';

interface DifficultyPanelProps {
  level: FruitMatchLevel | null;
}

const DIFFICULTY_COLORS: Record<DifficultyTier, string> = {
  trivial: 'bg-gray-500',
  easy: 'bg-green-500',
  medium: 'bg-yellow-500',
  hard: 'bg-orange-500',
  expert: 'bg-red-500',
  nightmare: 'bg-purple-500',
};

const DIFFICULTY_TEXT_COLORS: Record<DifficultyTier, string> = {
  trivial: 'text-gray-500',
  easy: 'text-green-500',
  medium: 'text-yellow-500',
  hard: 'text-orange-500',
  expert: 'text-red-500',
  nightmare: 'text-purple-500',
};

export function DifficultyPanel({ level }: DifficultyPanelProps) {
  const metrics = useMemo(() => {
    if (!level) return null;
    return calculateDifficultyMetrics(level);
  }, [level]);

  const timeEstimate = useMemo(() => {
    if (!metrics) return null;
    return estimateCompletionTime(metrics);
  }, [metrics]);

  if (!level || !metrics) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Difficulty Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            Generate a level to see difficulty analysis
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <BarChart3 className="w-4 h-4" />
          Difficulty Analysis
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Difficulty Score & Tier */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge className={DIFFICULTY_COLORS[metrics.difficultyTier]}>
              {metrics.difficultyTier.toUpperCase()}
            </Badge>
            <span className={`text-2xl font-bold ${DIFFICULTY_TEXT_COLORS[metrics.difficultyTier]}`}>
              {metrics.difficultyScore}
            </span>
            <span className="text-xs text-muted-foreground">/100</span>
          </div>
        </div>

        {/* Difficulty Bar */}
        <div className="space-y-1">
          <Progress value={metrics.difficultyScore} className="h-2" />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>Trivial</span>
            <span>Easy</span>
            <span>Medium</span>
            <span>Hard</span>
            <span>Expert</span>
            <span>Nightmare</span>
          </div>
        </div>

        {/* Solvability Status */}
        <div className={`flex items-center gap-2 p-2 rounded-lg ${
          metrics.isSolvable ? 'bg-green-500/10' : 'bg-red-500/10'
        }`}>
          {metrics.isSolvable ? (
            <>
              <CheckCircle className="w-4 h-4 text-green-500" />
              <span className="text-xs text-green-500 font-medium">
                Guaranteed Solvable
              </span>
            </>
          ) : (
            <>
              <AlertTriangle className="w-4 h-4 text-red-500" />
              <span className="text-xs text-red-500 font-medium">
                Solvability Issues
              </span>
            </>
          )}
        </div>

        {/* Issues List */}
        {metrics.solvabilityIssues.length > 0 && (
          <div className="space-y-1">
            {metrics.solvabilityIssues.map((issue, idx) => (
              <p key={idx} className="text-[10px] text-yellow-500 flex items-start gap-1">
                <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                {issue}
              </p>
            ))}
          </div>
        )}

        {/* Time Estimate */}
        {timeEstimate && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="w-3 h-3" />
            <span>Est. {timeEstimate.minMinutes}-{timeEstimate.maxMinutes} min</span>
          </div>
        )}

        {/* Key Metrics */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center gap-1">
            <Target className="w-3 h-3 text-muted-foreground" />
            <span className="text-muted-foreground">Pixels:</span>
            <span className="font-medium">{metrics.totalPixels}</span>
          </div>

          <div className="flex items-center gap-1">
            <Layers className="w-3 h-3 text-muted-foreground" />
            <span className="text-muted-foreground">Tiles:</span>
            <span className="font-medium">{metrics.totalTilesInSink}</span>
          </div>

          <div className="flex items-center gap-1">
            <Grid3X3 className="w-3 h-3 text-muted-foreground" />
            <span className="text-muted-foreground">Launchers:</span>
            <span className="font-medium">{metrics.totalLaunchers}</span>
          </div>

          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">Buffer:</span>
            <span className="font-medium">{metrics.waitingStandSlots} slots</span>
          </div>
        </div>

        {/* Fruit Distribution */}
        <div className="space-y-1">
          <p className="text-[10px] text-muted-foreground">Fruit Distribution</p>
          <div className="flex flex-wrap gap-1">
            {Object.entries(metrics.fruitDistribution)
              .filter(([_, count]) => count > 0)
              .map(([fruit, count]) => (
                <div
                  key={fruit}
                  className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px]"
                  style={{ backgroundColor: `${FRUIT_COLORS[fruit as keyof typeof FRUIT_COLORS]}20` }}
                >
                  <span>{FRUIT_EMOJI[fruit as keyof typeof FRUIT_EMOJI]}</span>
                  <span>{count}px</span>
                  <span className="text-muted-foreground">
                    ({metrics.launchersPerFruit[fruit as keyof typeof metrics.launchersPerFruit]}L)
                  </span>
                </div>
              ))}
          </div>
        </div>

        {/* Factor Breakdown */}
        <div className="space-y-1">
          <p className="text-[10px] text-muted-foreground">Difficulty Factors</p>
          <div className="space-y-1">
            <FactorBar
              label="Visibility"
              value={metrics.visibilityScore * 100}
              inverted
              description="Less visible = harder"
            />
            <FactorBar
              label="Distribution"
              value={metrics.distributionEvenness * 100}
              inverted
              description="Uneven = harder"
            />
            <FactorBar
              label="Buffer Space"
              value={Math.min(100, metrics.bufferRatio * 50)}
              inverted
              description="Less buffer = harder"
            />
            <FactorBar
              label="Complexity"
              value={metrics.decisionComplexity * 100}
              description="More choices = harder"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FactorBar({
  label,
  value,
  inverted = false,
  description,
}: {
  label: string;
  value: number;
  inverted?: boolean;
  description?: string;
}) {
  // If inverted, high value = easy (green), low value = hard (red)
  // If not inverted, high value = hard (red), low value = easy (green)
  const displayValue = inverted ? value : 100 - value;
  const difficulty = inverted ? 100 - value : value;

  const getColor = (diff: number) => {
    if (diff < 30) return 'bg-green-500';
    if (diff < 60) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className="space-y-0.5">
      <div className="flex justify-between items-center">
        <span className="text-[10px]">{label}</span>
        <span className="text-[10px] text-muted-foreground">{Math.round(displayValue)}%</span>
      </div>
      <div className="h-1 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full ${getColor(difficulty)} transition-all`}
          style={{ width: `${displayValue}%` }}
        />
      </div>
      {description && (
        <p className="text-[8px] text-muted-foreground">{description}</p>
      )}
    </div>
  );
}
