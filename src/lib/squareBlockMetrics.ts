import type { DifficultyTier, FlowZone } from '@/types/shared';
import { getExpectedDifficulty } from '@/types/shared';

// ============================================================================
// Flow Zone Calculation
// ============================================================================

export function calculateFlowZone(
  actualDifficulty: DifficultyTier,
  levelNumber: number
): FlowZone {
  const expected = getExpectedDifficulty(levelNumber);

  if (actualDifficulty === expected) return 'flow';

  const difficultyRank: Record<DifficultyTier, number> = {
    easy: 1,
    medium: 2,
    hard: 3,
    superHard: 4,
  };

  const actualRank = difficultyRank[actualDifficulty];
  const expectedRank = difficultyRank[expected];

  if (actualRank > expectedRank) return 'frustration';
  return 'boredom';
}

// ============================================================================
// Time & Attempt Estimation
// ============================================================================

const SECONDS_PER_MOVE: Record<DifficultyTier, [number, number]> = {
  easy: [3, 4],
  medium: [4, 5],
  hard: [5, 7],
  superHard: [6, 8],
};

const ATTEMPT_RANGES: Record<DifficultyTier, [number, number]> = {
  easy: [1, 3],
  medium: [4, 8],
  hard: [9, 20],
  superHard: [20, 35],
};

const WIN_RATES: Record<DifficultyTier, [number, number]> = {
  easy: [70, 90],
  medium: [40, 60],
  hard: [25, 40],
  superHard: [20, 30],
};

export interface LevelEstimation {
  minTimePerAttempt: number;
  maxTimePerAttempt: number;
  avgTimePerAttempt: number;
  minTotalTime: number;
  maxTotalTime: number;
  avgTotalTime: number;
  minAttempts: number;
  maxAttempts: number;
  avgAttempts: number;
  targetWinRate: [number, number];
  timePerAttemptDisplay: string;
  totalTimeDisplay: string;
  attemptsDisplay: string;
}

export function estimateLevel(
  difficulty: DifficultyTier,
  cellCount: number
): LevelEstimation {
  const [minSecPerMove, maxSecPerMove] = SECONDS_PER_MOVE[difficulty];
  const [minAttempts, maxAttempts] = ATTEMPT_RANGES[difficulty];
  const targetWinRate = WIN_RATES[difficulty];

  const complexityMod = cellCount > 30 ? 1.2 : cellCount > 20 ? 1.1 : 1.0;

  const minTimePerAttempt = Math.round(cellCount * minSecPerMove * complexityMod);
  const maxTimePerAttempt = Math.round(cellCount * maxSecPerMove * complexityMod);
  const avgTimePerAttempt = Math.round((minTimePerAttempt + maxTimePerAttempt) / 2);

  const avgAttempts = Math.round(Math.sqrt(minAttempts * maxAttempts));

  const retryMultiplier = 0.6;
  const minTotalTime = Math.round(minTimePerAttempt * (1 + (minAttempts - 1) * retryMultiplier));
  const maxTotalTime = Math.round(maxTimePerAttempt * (1 + (maxAttempts - 1) * retryMultiplier));
  const avgTotalTime = Math.round(avgTimePerAttempt * (1 + (avgAttempts - 1) * retryMultiplier));

  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  };

  return {
    minTimePerAttempt,
    maxTimePerAttempt,
    avgTimePerAttempt,
    minTotalTime,
    maxTotalTime,
    avgTotalTime,
    minAttempts,
    maxAttempts,
    avgAttempts,
    targetWinRate,
    timePerAttemptDisplay: `${formatTime(minTimePerAttempt)} - ${formatTime(maxTimePerAttempt)}`,
    totalTimeDisplay: `${formatTime(minTotalTime)} - ${formatTime(maxTotalTime)}`,
    attemptsDisplay: minAttempts === maxAttempts ? `${minAttempts}` : `${minAttempts}-${maxAttempts}`,
  };
}

// ============================================================================
// Difficulty Calculation
// ============================================================================

export function calculateDifficulty(
  clearability: number,
  cellCount: number
): DifficultyTier {
  const tiers: DifficultyTier[] = ['easy', 'medium', 'hard', 'superHard'];

  let baseTierIndex: number;
  if (clearability >= 0.5) baseTierIndex = 0;
  else if (clearability >= 0.2) baseTierIndex = 1;
  else if (clearability >= 0.05) baseTierIndex = 2;
  else baseTierIndex = 3;

  const sizeAdjustment = cellCount >= 40 ? 1 : cellCount >= 25 ? 0.5 : 0;

  const finalTierIndex = Math.min(3, Math.round(baseTierIndex + sizeAdjustment));
  return tiers[finalTierIndex];
}
