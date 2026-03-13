// ============================================================================
// Shared Types & Functions
// Used across Hexa Block and Square Block (4-tier difficulty system)
// Fruit Match uses its own 6-tier DifficultyTier in fruitMatch.ts
// ============================================================================

export type FlowZone = 'flow' | 'boredom' | 'frustration';

export type DifficultyTier = 'easy' | 'medium' | 'hard' | 'superHard';

// Sawtooth cycle expected difficulty for each position (1-10)
export const SAWTOOTH_EXPECTED: Record<number, DifficultyTier> = {
  1: 'easy',
  2: 'easy',
  3: 'medium',
  4: 'medium',
  5: 'hard',
  6: 'medium',
  7: 'medium',
  8: 'hard',
  9: 'hard',
  10: 'superHard',
};

export function getExpectedDifficulty(levelNumber: number): DifficultyTier {
  const position = ((levelNumber - 1) % 10) + 1;
  return SAWTOOTH_EXPECTED[position];
}

export function getSawtoothPosition(levelNumber: number): number {
  return ((levelNumber - 1) % 10) + 1;
}

export function getDifficultyFromClearability(clearability: number): DifficultyTier {
  if (clearability >= 0.5) return 'easy';
  if (clearability >= 0.2) return 'medium';
  if (clearability >= 0.05) return 'hard';
  return 'superHard';
}
