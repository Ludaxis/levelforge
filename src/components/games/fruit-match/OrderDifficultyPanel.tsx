'use client';

import { useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  FruitType,
  PixelCell,
  SinkTile,
  LauncherOrderConfig,
  FRUIT_COLORS,
} from '@/types/fruitMatch';
import {
  calculateOrderDifficulty,
  optimizeTileOrder,
  OrderDifficultyMetrics,
  DifficultyFactorBreakdown,
} from '@/lib/fruitMatchOrderDifficulty';
import { LauncherConfig, generateLauncherQueue } from '@/lib/fruitMatchUtils';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Minus,
  HelpCircle,
  RefreshCw,
  Sparkles,
  Target,
  Shuffle,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  Info,
  Zap,
  Layers,
  GitBranch,
  Activity,
  Box,
  Percent,
} from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

interface OrderDifficultyPanelProps {
  pixelArt: PixelCell[];
  sinkStacks: SinkTile[][];
  waitingStandSlots: number;
  launcherOrderConfig: LauncherOrderConfig | null;
  onSinkStacksChange?: (stacks: SinkTile[][]) => void;
}

// ============================================================================
// Factor Icons
// ============================================================================

const FACTOR_ICONS: Record<string, React.ReactNode> = {
  'Triplet Accessibility': <Layers className="h-3.5 w-3.5" />,
  'Blocking Pattern': <GitBranch className="h-3.5 w-3.5" />,
  'Color Scattering': <Shuffle className="h-3.5 w-3.5" />,
  'Launcher Alignment': <Target className="h-3.5 w-3.5" />,
  'Decision Complexity': <Activity className="h-3.5 w-3.5" />,
  'Buffer Pressure': <Box className="h-3.5 w-3.5" />,
  'Simulated Win Rate': <Percent className="h-3.5 w-3.5" />,
};

// ============================================================================
// Helper Components
// ============================================================================

function ImpactBadge({ impact }: { impact: 'easy' | 'medium' | 'hard' }) {
  const styles = {
    easy: 'bg-green-500/20 text-green-400 border-green-500/30',
    medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    hard: 'bg-red-500/20 text-red-400 border-red-500/30',
  };

  const icons = {
    easy: <CheckCircle2 className="h-3 w-3" />,
    medium: <Minus className="h-3 w-3" />,
    hard: <XCircle className="h-3 w-3" />,
  };

  return (
    <Badge variant="outline" className={`text-[10px] gap-1 ${styles[impact]}`}>
      {icons[impact]}
      {impact}
    </Badge>
  );
}

function ScoreGauge({ score, label }: { score: number; label: string }) {
  const getColor = (s: number) => {
    if (s < 30) return 'bg-green-500';
    if (s < 50) return 'bg-yellow-500';
    if (s < 70) return 'bg-orange-500';
    return 'bg-red-500';
  };

  const getLabel = (s: number) => {
    if (s < 20) return 'Very Easy';
    if (s < 35) return 'Easy';
    if (s < 50) return 'Medium';
    if (s < 65) return 'Hard';
    if (s < 80) return 'Expert';
    return 'Nightmare';
  };

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-bold">{score}/100</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-500 ${getColor(score)}`}
          style={{ width: `${score}%` }}
        />
      </div>
      <div className="text-[10px] text-muted-foreground text-right">
        {getLabel(score)}
      </div>
    </div>
  );
}

function FactorBar({ factor }: { factor: DifficultyFactorBreakdown }) {
  const barColor =
    factor.impact === 'easy'
      ? 'bg-green-500'
      : factor.impact === 'medium'
      ? 'bg-yellow-500'
      : 'bg-red-500';

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="space-y-1 cursor-help">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-muted-foreground shrink-0">
                  {FACTOR_ICONS[factor.name] || <HelpCircle className="h-3.5 w-3.5" />}
                </span>
                <span className="text-xs truncate">{factor.name}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs font-mono w-8 text-right">
                  {(factor.score * 100).toFixed(0)}%
                </span>
                <ImpactBadge impact={factor.impact} />
              </div>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${barColor}`}
                style={{ width: `${factor.score * 100}%` }}
              />
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-[280px]">
          <div className="space-y-1">
            <p className="font-medium">{factor.name}</p>
            <p className="text-xs text-muted-foreground">{factor.description}</p>
            <p className="text-xs">{factor.explanation}</p>
            <p className="text-[10px] text-muted-foreground">
              Weight: {(factor.weight * 100).toFixed(0)}% | Contribution: +{(factor.contribution * 100).toFixed(1)} pts
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function SimulationStats({ metrics }: { metrics: OrderDifficultyMetrics }) {
  const winRateColor =
    metrics.simulatedWinRate > 0.7
      ? 'text-green-400'
      : metrics.simulatedWinRate > 0.4
      ? 'text-yellow-400'
      : 'text-red-400';

  return (
    <div className="grid grid-cols-3 gap-2 p-2 bg-muted/30 rounded-lg">
      <div className="text-center">
        <div className={`text-lg font-bold ${winRateColor}`}>
          {(metrics.simulatedWinRate * 100).toFixed(0)}%
        </div>
        <div className="text-[10px] text-muted-foreground">Win Rate</div>
      </div>
      <div className="text-center">
        <div className="text-lg font-bold">
          {metrics.simulatedAveragePeakUsage.toFixed(1)}
        </div>
        <div className="text-[10px] text-muted-foreground">Avg Peak Buffer</div>
      </div>
      <div className="text-center">
        <div className="text-lg font-bold">
          {(metrics.simulatedFailureRate * 100).toFixed(0)}%
        </div>
        <div className="text-[10px] text-muted-foreground">Failure Rate</div>
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function OrderDifficultyPanel({
  pixelArt,
  sinkStacks,
  waitingStandSlots,
  launcherOrderConfig,
  onSinkStacksChange,
}: OrderDifficultyPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isSimulating, setIsSimulating] = useState(false);
  const [showFactorDetails, setShowFactorDetails] = useState(false);

  // Count unique fruits
  const uniqueFruits = useMemo(() => {
    const fruits = new Set<FruitType>();
    for (const cell of pixelArt) {
      fruits.add(cell.fruitType);
    }
    return fruits.size;
  }, [pixelArt]);

  // Generate launcher queue
  const launcherQueue = useMemo(() => {
    if (pixelArt.length === 0) return [];
    return generateLauncherQueue(pixelArt, launcherOrderConfig || undefined);
  }, [pixelArt, launcherOrderConfig]);

  // Calculate difficulty metrics
  const metrics = useMemo(() => {
    if (sinkStacks.length === 0 || sinkStacks.every(s => s.length === 0)) {
      return null;
    }
    return calculateOrderDifficulty(
      sinkStacks,
      launcherQueue,
      waitingStandSlots,
      uniqueFruits,
      true // Run simulation
    );
  }, [sinkStacks, launcherQueue, waitingStandSlots, uniqueFruits]);

  // Handle optimization
  const handleOptimize = useCallback(
    (target: 'easy' | 'medium' | 'hard') => {
      if (!onSinkStacksChange || sinkStacks.length === 0) return;

      setIsSimulating(true);

      // Use setTimeout to allow UI to update
      setTimeout(() => {
        const result = optimizeTileOrder(
          sinkStacks,
          launcherQueue,
          waitingStandSlots,
          uniqueFruits,
          target
        );

        onSinkStacksChange(result.optimizedStacks);
        setIsSimulating(false);
      }, 100);
    },
    [sinkStacks, launcherQueue, waitingStandSlots, uniqueFruits, onSinkStacksChange]
  );

  // Handle shuffle (randomize)
  const handleShuffle = useCallback(() => {
    if (!onSinkStacksChange || sinkStacks.length === 0) return;

    setIsSimulating(true);

    setTimeout(() => {
      // Flatten and shuffle
      const allTiles = sinkStacks.flat();

      // Fisher-Yates shuffle
      for (let i = allTiles.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allTiles[i], allTiles[j]] = [allTiles[j], allTiles[i]];
      }

      // Redistribute to stacks
      const sinkWidth = sinkStacks.length;
      const newStacks: SinkTile[][] = Array.from({ length: sinkWidth }, () => []);

      allTiles.forEach((tile, idx) => {
        const col = idx % sinkWidth;
        newStacks[col].push({
          ...tile,
          stackIndex: newStacks[col].length,
          position: col,
        });
      });

      onSinkStacksChange(newStacks);
      setIsSimulating(false);
    }, 100);
  }, [sinkStacks, onSinkStacksChange]);

  if (!metrics) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-6 text-center text-muted-foreground text-sm">
          <Info className="h-8 w-8 mx-auto mb-2 opacity-50" />
          Generate sink tiles to see order difficulty analysis
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        className="pb-2 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <CardTitle className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Order Difficulty Analysis
            <Badge
              variant={
                metrics.orderDifficultyScore < 35
                  ? 'default'
                  : metrics.orderDifficultyScore < 60
                  ? 'secondary'
                  : 'destructive'
              }
              className="text-[10px]"
            >
              {metrics.orderDifficultyScore}/100
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            {metrics.simulatedWinRate < 0.3 && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <AlertTriangle className="h-4 w-4 text-yellow-500" />
                  </TooltipTrigger>
                  <TooltipContent>
                    Low win rate - consider making easier
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </div>
        </CardTitle>
      </CardHeader>

      {isExpanded && (
        <CardContent className="space-y-4">
          {/* Main Score */}
          <ScoreGauge
            score={metrics.orderDifficultyScore}
            label="Tile Order Difficulty"
          />

          {/* Simulation Stats */}
          <SimulationStats metrics={metrics} />

          {/* Factor Breakdown Toggle */}
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-between"
            onClick={() => setShowFactorDetails(!showFactorDetails)}
          >
            <span className="flex items-center gap-2">
              <Zap className="h-3.5 w-3.5" />
              Difficulty Factors
            </span>
            {showFactorDetails ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>

          {/* Factor Details */}
          {showFactorDetails && (
            <div className="space-y-3 p-3 bg-muted/20 rounded-lg">
              {metrics.factorBreakdown.map((factor) => (
                <FactorBar key={factor.name} factor={factor} />
              ))}

              {/* Legend */}
              <div className="flex items-center justify-center gap-4 pt-2 border-t border-border">
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <div className="w-2 h-2 bg-green-500 rounded-full" />
                  Easy (0-30%)
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <div className="w-2 h-2 bg-yellow-500 rounded-full" />
                  Medium (30-60%)
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <div className="w-2 h-2 bg-red-500 rounded-full" />
                  Hard (60-100%)
                </div>
              </div>
            </div>
          )}

          {/* Optimization Controls */}
          {onSinkStacksChange && (
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">
                Optimize tile order for target difficulty:
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => handleOptimize('easy')}
                  disabled={isSimulating}
                >
                  <TrendingDown className="h-3 w-3 mr-1 text-green-500" />
                  Easier
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => handleOptimize('medium')}
                  disabled={isSimulating}
                >
                  <Target className="h-3 w-3 mr-1 text-yellow-500" />
                  Balanced
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => handleOptimize('hard')}
                  disabled={isSimulating}
                >
                  <TrendingUp className="h-3 w-3 mr-1 text-red-500" />
                  Harder
                </Button>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={handleShuffle}
                disabled={isSimulating}
              >
                <Shuffle className="h-3 w-3 mr-1" />
                {isSimulating ? 'Calculating...' : 'Randomize Order'}
              </Button>
            </div>
          )}

          {/* Explanation */}
          <div className="text-[10px] text-muted-foreground p-2 bg-muted/20 rounded">
            <p className="font-medium mb-1">How tile order affects difficulty:</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>
                <strong>Triplet Accessibility:</strong> How deep are matching tiles buried
              </li>
              <li>
                <strong>Blocking:</strong> Do tiles block other tiles needed sooner
              </li>
              <li>
                <strong>Scattering:</strong> Are same-color tiles clustered or spread out
              </li>
              <li>
                <strong>Launcher Alignment:</strong> Do tiles appear when launchers need them
              </li>
            </ul>
            <p className="mt-1">
              Research shows tile order can cause <strong>5x variation</strong> in win
              rates for the same level!
            </p>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
