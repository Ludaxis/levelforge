export type TileColor = 'red' | 'blue' | 'green' | 'yellow' | 'purple' | 'orange';

export interface Tile {
  id: string;
  color: TileColor;
  row: number;
  col: number;
  isMatched: boolean;
  isNew: boolean;
}

export interface Position {
  row: number;
  col: number;
}

export interface Objective {
  color: TileColor;
  target: number;
  collected: number;
}

export interface LevelConfig {
  boardSize: number;
  moveLimit: number;
  objectives: Objective[];
  difficultyTier: 'easy' | 'medium' | 'hard' | 'superHard';
  colorCount: number; // 4-6 colors (fewer = easier)
}

// Difficulty preset configurations
export const DIFFICULTY_PRESETS: Record<LevelConfig['difficultyTier'], {
  boardSize: number;
  moveLimit: number;
  colorCount: number;
  objectiveMultiplier: number;
  description: string;
}> = {
  easy: {
    boardSize: 7,
    moveLimit: 35,
    colorCount: 4,
    objectiveMultiplier: 0.8,
    description: 'Fewer colors, generous moves, lower targets',
  },
  medium: {
    boardSize: 7,
    moveLimit: 28,
    colorCount: 5,
    objectiveMultiplier: 1.0,
    description: 'Balanced challenge with moderate targets',
  },
  hard: {
    boardSize: 8,
    moveLimit: 22,
    colorCount: 5,
    objectiveMultiplier: 1.2,
    description: 'Tighter moves, higher targets',
  },
  superHard: {
    boardSize: 8,
    moveLimit: 18,
    colorCount: 6,
    objectiveMultiplier: 1.4,
    description: 'All colors, strict moves, demanding targets',
  },
};

export interface GameState {
  board: (Tile | null)[][];
  movesRemaining: number;
  objectives: Objective[];
  isComplete: boolean;
  isWon: boolean;
  selectedTile: Position | null;
  score: number;
  cascadeCount: number;
}

export type GameOutcome =
  | 'playing'
  | 'easyWin'      // Won with 10+ moves left
  | 'nearLossWin'  // Won with 1-3 moves left
  | 'almostWinLoss' // Lost with 1-3 objectives left
  | 'crushingLoss'; // Lost with 10+ objectives left

export const TILE_COLORS: TileColor[] = ['red', 'blue', 'green', 'yellow', 'purple', 'orange'];

export const COLOR_HEX: Record<TileColor, string> = {
  red: '#ef4444',
  blue: '#3b82f6',
  green: '#22c55e',
  yellow: '#eab308',
  purple: '#a855f7',
  orange: '#f97316',
};
