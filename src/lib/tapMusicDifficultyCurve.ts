export type DisplayTier = 'trivial' | 'easy' | 'medium' | 'hard' | 'superHard';

export const DISPLAY_TIER_ORDER: DisplayTier[] = ['trivial', 'easy', 'medium', 'hard', 'superHard'];

export interface TierThresholds {
  trivialMax: number;
  easyMax: number;
  mediumMax: number;
  hardMax: number;
}

export interface SawtoothPhase {
  cycleLength: number;
  difficulties: number[];
}

export interface SawtoothConfig {
  onboardingLength: number;
  onboarding: SawtoothPhase;
  main: SawtoothPhase;
  baselineIncrease: number;
  skillGrowthRate: number;
  tierThresholds: TierThresholds;
}

export const TAP_MUSIC_SAWTOOTH_STORAGE_KEY = 'tap-music-sawtooth-config';

export const DEFAULT_TIER_THRESHOLDS: TierThresholds = {
  trivialMax: 15,
  easyMax: 30,
  mediumMax: 55,
  hardMax: 75,
};

export const DEFAULT_SAWTOOTH_CONFIG: SawtoothConfig = {
  onboardingLength: 10,
  onboarding: {
    cycleLength: 5,
    difficulties: [5, 10, 18, 25, 35],
  },
  main: {
    cycleLength: 10,
    difficulties: [10, 15, 25, 35, 50, 30, 35, 45, 55, 70],
  },
  baselineIncrease: 1,
  skillGrowthRate: 0.4,
  tierThresholds: DEFAULT_TIER_THRESHOLDS,
};

export function scoreToTierWithThresholds(score: number, t: TierThresholds): DisplayTier {
  if (score < t.trivialMax) return 'trivial';
  if (score < t.easyMax) return 'easy';
  if (score < t.mediumMax) return 'medium';
  if (score < t.hardMax) return 'hard';
  return 'superHard';
}

export function getTapMusicExpectedDifficultyScore(
  levelNumber: number,
  config: SawtoothConfig = DEFAULT_SAWTOOTH_CONFIG,
): { score: number; isOnboarding: boolean } {
  if (levelNumber <= config.onboardingLength) {
    const phase = config.onboarding;
    const pos = (levelNumber - 1) % phase.cycleLength;
    const cycleIndex = Math.floor((levelNumber - 1) / phase.cycleLength);
    const base = phase.difficulties[pos] ?? 20;
    return { score: Math.min(100, base + cycleIndex * config.baselineIncrease), isOnboarding: true };
  }

  const phase = config.main;
  const offset = levelNumber - config.onboardingLength - 1;
  const pos = offset % phase.cycleLength;
  const cycleIndex = Math.floor(offset / phase.cycleLength);
  const base = phase.difficulties[pos] ?? 40;
  return { score: Math.min(100, base + cycleIndex * config.baselineIncrease), isOnboarding: false };
}

export function loadTapMusicSawtoothConfig(): SawtoothConfig {
  if (typeof window === 'undefined') return DEFAULT_SAWTOOTH_CONFIG;

  try {
    const raw = localStorage.getItem(TAP_MUSIC_SAWTOOTH_STORAGE_KEY);
    if (!raw) return DEFAULT_SAWTOOTH_CONFIG;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_SAWTOOTH_CONFIG,
      ...parsed,
      onboarding: { ...DEFAULT_SAWTOOTH_CONFIG.onboarding, ...parsed.onboarding },
      main: { ...DEFAULT_SAWTOOTH_CONFIG.main, ...parsed.main },
      tierThresholds: { ...DEFAULT_TIER_THRESHOLDS, ...parsed.tierThresholds },
    };
  } catch {
    return DEFAULT_SAWTOOTH_CONFIG;
  }
}
