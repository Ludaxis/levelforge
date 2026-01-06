export type DifficultyTier = 'easy' | 'medium' | 'hard' | 'superHard';

export type CognitivePhase = 'onboarding' | 'earlyGame' | 'midGame' | 'hard' | 'superHard';

export interface LevelConfig {
  levelNumber: number;
  moveLimit: number;
  difficultyTier: DifficultyTier;
  archetype: string;
  mechanics: string[];
  obstacles: string[];
}

export interface SawtoothPoint {
  level: number;
  difficulty: number;
  tier: DifficultyTier;
  label: string;
  isHardSpike?: boolean;
  isSuperHardPeak?: boolean;
}

export interface CognitiveBalance {
  system1: number;
  system2: number;
}

export interface EmotionalOutcome {
  type: string;
  condition: string;
  emotion: string;
  impact: string;
  color: string;
  target: boolean;
}

export interface QualityCheckItem {
  id: string;
  category: string;
  question: string;
  checked: boolean;
}
