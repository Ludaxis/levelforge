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

export const LEVEL_ARCHETYPES = [
  {
    name: 'Tutorial/Intro',
    purpose: 'Teach one thing clearly',
    description: 'Single mechanic focus, no surprises, explicit affordances',
    when: 'Every new mechanic introduction',
  },
  {
    name: 'Demonstration',
    purpose: 'Expand understanding',
    description: 'Show non-obvious uses or limitations of a mechanic',
    when: 'After players learn basics of a mechanic',
  },
  {
    name: 'Constraint',
    purpose: 'Require specific thinking',
    description: 'Force solution by limiting resources/actions',
    when: 'Testing player comprehension of mechanics',
  },
  {
    name: 'Open Puzzle',
    purpose: 'Allow player expression',
    description: 'Multiple viable strategies possible, emergent play',
    when: 'Mid-game variety, player agency moments',
  },
  {
    name: 'Sequential/Compound',
    purpose: 'Test mastery of multiple concepts',
    description: 'Require multi-step solutions chaining mechanics',
    when: 'After multiple mechanics are learned',
  },
  {
    name: 'Challenge/Speed',
    purpose: 'Test skill and efficiency',
    description: 'Add time/resource pressure or require optimal solutions',
    when: 'Hard level spikes, monetization points',
  },
  {
    name: 'Victory Lap',
    purpose: 'Celebrate achievement',
    description: 'Intentionally easy level where players almost can\'t fail',
    when: 'After hard/super-hard spikes',
  },
  {
    name: 'Surprise/Reverse',
    purpose: 'Re-engage attention',
    description: 'Subvert previous expectations, prevent autopilot',
    when: 'Periodically to break monotony',
  },
] as const;

export const DESIGN_PRINCIPLES = [
  'Make the Goal Easily Understood',
  'Make it Easy to Get Started',
  'Give a Sense of Progress',
  'Give a Sense of Solvability',
  'Increase Difficulty Gradually',
  'Use Parallelism to Prevent Bottlenecks',
  'Apply Pyramid Structure',
  'Hints Extend Interest',
  'Eventually Give the Answer',
  'Use Perceptual Shifts Cautiously',
] as const;

export const QUALITY_CHECKLIST = {
  goalClarity: [
    'Is the objective immediately obvious without text explanation?',
    'Can the player start doing something meaningful within 2 seconds?',
    'Are affordances and consequences visually communicated?',
  ],
  difficultyPacing: [
    'Does this level have a clear purpose in the learning curve?',
    'Is the difficulty tier appropriate for placement in the sawtooth cycle?',
    'Does move count create near-loss/almost-win outcomes?',
  ],
  solvabilityFairness: [
    'Is the solution discoverable without external knowledge?',
    'Is the level beatable without boosters (even if difficult)?',
    'Are there dead blocks or impossible starting states?',
    'Does win rate meet minimum threshold (20-30% for hard levels)?',
  ],
  playerExperience: [
    'Does partial progress feel visible and rewarding?',
    'Are losses "almost-wins" (1-3 objectives left) rather than crushing (10+)?',
    'Is shuffle frequency acceptable (not too many no-move states)?',
  ],
  testingValidation: [
    'Do automated test metrics match intended difficulty targets?',
    'Have you tested with novices, intermediates, AND experts?',
    'Is this level ready for live data monitoring post-release?',
  ],
} as const;
