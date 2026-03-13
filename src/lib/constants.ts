// LevelForge - Puzzle Level Design Framework Constants
// Based on industry best practices from King, Dream Games, Peak Games & Rovio

export const COGNITIVE_MODES = {
  onboarding: {
    s1: 90,
    s2: 10,
    levels: '1-20',
    approach: 'Intuitive, automatic, build confidence'
  },
  earlyGame: {
    s1: 70,
    s2: 30,
    levels: '21-50',
    approach: 'Introduce light strategy, first challenges'
  },
  midGame: {
    s1: 60,
    s2: 40,
    levels: '51-100',
    approach: 'Combine mechanics, strategic depth'
  },
  hard: {
    s1: 40,
    s2: 60,
    levels: 'Hard Levels',
    approach: 'Require planning, drive monetization'
  },
  superHard: {
    s1: 20,
    s2: 80,
    levels: 'Super Hard',
    approach: 'Deep analysis required, major paywalls'
  },
} as const;

export const MOVE_LIMITS = [
  { range: [1, 30], moves: [35, 40], experience: 'Generous, exploration OK' },
  { range: [31, 60], moves: [30, 35], experience: 'Comfortable, some planning' },
  { range: [61, 100], moves: [25, 30], experience: 'Tight, efficiency matters' },
  { range: [101, Infinity], moves: [20, 27], experience: 'Crunchy, little room for error' },
] as const;

export const DIFFICULTY_TIERS = {
  easy: {
    attempts: '1-3',
    winRate: [70, 90],
    goal: 'Flow state, progression',
    color: '#22c55e' // green
  },
  medium: {
    attempts: '4-8',
    winRate: [40, 60],
    goal: 'Light challenge, learning',
    color: '#eab308' // yellow
  },
  hard: {
    attempts: '9-20',
    winRate: [25, 40],
    goal: 'Test mastery, light paywall',
    color: '#f97316' // orange
  },
  superHard: {
    attempts: '20-35+',
    winRate: [20, 30],
    goal: 'Major paywall, achievement',
    color: '#ef4444' // red
  },
} as const;

export const SAWTOOTH_CYCLE = [
  { position: 1, difficulty: 2, tier: 'easy', label: 'Victory lap' },
  { position: 2, difficulty: 2.5, tier: 'easy', label: 'Recovery' },
  { position: 3, difficulty: 4, tier: 'medium', label: 'Rising' },
  { position: 4, difficulty: 5, tier: 'medium', label: 'Testing' },
  { position: 5, difficulty: 7, tier: 'hard', label: 'Hard spike' },
  { position: 6, difficulty: 5, tier: 'medium', label: 'Brief dip' },
  { position: 7, difficulty: 5.5, tier: 'medium', label: 'Brief dip' },
  { position: 8, difficulty: 6.5, tier: 'medium', label: 'Rising tension' },
  { position: 9, difficulty: 7.5, tier: 'hard', label: 'Rising tension' },
  { position: 10, difficulty: 9, tier: 'superHard', label: 'Super Hard peak' },
] as const;

export const EMOTIONAL_OUTCOMES = [
  {
    type: 'Easy Win',
    condition: '10+ moves left',
    emotion: 'Bored, unchallenged',
    impact: 'Low engagement, churn risk',
    color: '#94a3b8', // gray
    target: false,
  },
  {
    type: 'Near-Loss Win',
    condition: '1-3 moves left',
    emotion: 'Thrilled, accomplished',
    impact: 'High retention, positive memory',
    color: '#22c55e', // green
    target: true,
  },
  {
    type: 'Almost-Win Loss',
    condition: '1-3 objectives left',
    emotion: 'Frustrated but motivated',
    impact: 'High monetization, retry intent',
    color: '#f97316', // orange
    target: true,
  },
  {
    type: 'Crushing Loss',
    condition: '10+ objectives left',
    emotion: 'Hopeless, angry at game',
    impact: 'High churn, blame game',
    color: '#ef4444', // red
    target: false,
  },
] as const;

