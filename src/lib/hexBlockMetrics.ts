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
  const difficultyRank: Record<DifficultyTier, number> = {
    easy: 1,
    medium: 2,
    hard: 3,
    superHard: 4,
  };

  const actualRank = difficultyRank[actualDifficulty];
  const expectedRank = difficultyRank[expected];
  const diff = actualRank - expectedRank;

  if (diff > 1) return 'frustration';  // Much harder than expected
  if (diff < -1) return 'boredom';     // Much easier than expected
  return 'flow';                        // Matches expectation (+/- 1)
}

// ============================================================================
// Time & Attempt Estimation (based on industry benchmarks)
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
  moveLimit: number,
  difficulty: DifficultyTier,
  cellCount: number
): LevelEstimation {
  const [minSecPerMove, maxSecPerMove] = SECONDS_PER_MOVE[difficulty];
  const [minAttempts, maxAttempts] = ATTEMPT_RANGES[difficulty];
  const targetWinRate = WIN_RATES[difficulty];

  const complexityMod = cellCount > 30 ? 1.2 : cellCount > 20 ? 1.1 : 1.0;

  const minTimePerAttempt = Math.round(moveLimit * minSecPerMove * complexityMod);
  const maxTimePerAttempt = Math.round(moveLimit * maxSecPerMove * complexityMod);
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
  cellCount: number,
  moveBufferPercent: number
): DifficultyTier {
  const tiers: DifficultyTier[] = ['easy', 'medium', 'hard', 'superHard'];
  let baseTierIndex: number;

  if (clearability >= 0.5) baseTierIndex = 0;
  else if (clearability >= 0.2) baseTierIndex = 1;
  else if (clearability >= 0.05) baseTierIndex = 2;
  else baseTierIndex = 3;

  let bufferAdjustment = 0;
  const sizeModifier = cellCount >= 30 ? 1 : cellCount >= 15 ? 0.5 : 0;

  if (moveBufferPercent >= 100) {
    bufferAdjustment = -2;
  } else if (moveBufferPercent >= 60) {
    bufferAdjustment = -1;
  } else if (moveBufferPercent >= 40) {
    bufferAdjustment = 0;
  } else if (moveBufferPercent >= 25) {
    bufferAdjustment = 1;
  } else if (moveBufferPercent >= 15) {
    bufferAdjustment = 2;
  } else if (moveBufferPercent >= 5) {
    bufferAdjustment = 2 + Math.round(sizeModifier);
  } else {
    bufferAdjustment = 3 + Math.round(sizeModifier);
  }

  const finalTierIndex = Math.max(0, Math.min(3, baseTierIndex + bufferAdjustment));
  return tiers[finalTierIndex];
}
