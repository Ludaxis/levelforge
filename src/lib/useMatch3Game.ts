'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  Tile,
  TileColor,
  Position,
  Objective,
  LevelConfig,
  GameState,
  GameOutcome,
  TILE_COLORS,
} from '@/types/game';

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

function getRandomColor(colors: TileColor[]): TileColor {
  return colors[Math.floor(Math.random() * colors.length)];
}

function createTile(row: number, col: number, colors: TileColor[]): Tile {
  return {
    id: generateId(),
    color: getRandomColor(colors),
    row,
    col,
    isMatched: false,
    isNew: false,
  };
}

function createBoard(size: number, colors: TileColor[]): Tile[][] {
  const board: Tile[][] = [];

  for (let row = 0; row < size; row++) {
    board[row] = [];
    for (let col = 0; col < size; col++) {
      // Avoid creating initial matches
      let tile = createTile(row, col, colors);
      let attempts = 0;

      while (attempts < 10) {
        // Check horizontal match
        if (col >= 2) {
          const left1 = board[row][col - 1];
          const left2 = board[row][col - 2];
          if (left1 && left2 && left1.color === tile.color && left2.color === tile.color) {
            tile = createTile(row, col, colors);
            attempts++;
            continue;
          }
        }
        // Check vertical match
        if (row >= 2) {
          const up1 = board[row - 1][col];
          const up2 = board[row - 2][col];
          if (up1 && up2 && up1.color === tile.color && up2.color === tile.color) {
            tile = createTile(row, col, colors);
            attempts++;
            continue;
          }
        }
        break;
      }

      board[row][col] = tile;
    }
  }

  return board;
}

function findMatches(board: (Tile | null)[][]): Position[] {
  const size = board.length;
  const matches: Set<string> = new Set();

  // Check horizontal matches
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size - 2; col++) {
      const tile1 = board[row][col];
      const tile2 = board[row][col + 1];
      const tile3 = board[row][col + 2];

      if (tile1 && tile2 && tile3 &&
          tile1.color === tile2.color && tile2.color === tile3.color) {
        matches.add(`${row},${col}`);
        matches.add(`${row},${col + 1}`);
        matches.add(`${row},${col + 2}`);

        // Check for 4+ matches
        let c = col + 3;
        while (c < size && board[row][c]?.color === tile1.color) {
          matches.add(`${row},${c}`);
          c++;
        }
      }
    }
  }

  // Check vertical matches
  for (let col = 0; col < size; col++) {
    for (let row = 0; row < size - 2; row++) {
      const tile1 = board[row][col];
      const tile2 = board[row + 1][col];
      const tile3 = board[row + 2][col];

      if (tile1 && tile2 && tile3 &&
          tile1.color === tile2.color && tile2.color === tile3.color) {
        matches.add(`${row},${col}`);
        matches.add(`${row + 1},${col}`);
        matches.add(`${row + 2},${col}`);

        // Check for 4+ matches
        let r = row + 3;
        while (r < size && board[r][col]?.color === tile1.color) {
          matches.add(`${r},${col}`);
          r++;
        }
      }
    }
  }

  return Array.from(matches).map((pos) => {
    const [row, col] = pos.split(',').map(Number);
    return { row, col };
  });
}

function isAdjacent(pos1: Position, pos2: Position): boolean {
  const rowDiff = Math.abs(pos1.row - pos2.row);
  const colDiff = Math.abs(pos1.col - pos2.col);
  return (rowDiff === 1 && colDiff === 0) || (rowDiff === 0 && colDiff === 1);
}

export function useMatch3Game(config: LevelConfig) {
  const colors = TILE_COLORS.slice(0, config.colorCount || 5);

  const [gameState, setGameState] = useState<GameState>(() => ({
    board: createBoard(config.boardSize, colors),
    movesRemaining: config.moveLimit,
    objectives: config.objectives.map((obj) => ({ ...obj, collected: 0 })),
    isComplete: false,
    isWon: false,
    selectedTile: null,
    score: 0,
    cascadeCount: 0,
  }));

  const [isProcessing, setIsProcessing] = useState(false);

  const getOutcome = useCallback((): GameOutcome => {
    if (!gameState.isComplete) return 'playing';

    if (gameState.isWon) {
      if (gameState.movesRemaining >= 10) return 'easyWin';
      return 'nearLossWin';
    } else {
      const totalRemaining = gameState.objectives.reduce(
        (sum, obj) => sum + Math.max(0, obj.target - obj.collected),
        0
      );
      if (totalRemaining <= 3) return 'almostWinLoss';
      return 'crushingLoss';
    }
  }, [gameState.isComplete, gameState.isWon, gameState.movesRemaining, gameState.objectives]);

  const checkWinCondition = useCallback((objectives: Objective[]): boolean => {
    return objectives.every((obj) => obj.collected >= obj.target);
  }, []);

  const processMatches = useCallback(async () => {
    setIsProcessing(true);

    setGameState((prev) => {
      let board = prev.board.map((row) => row.map((tile) => tile ? { ...tile } : null));
      let objectives = prev.objectives.map((obj) => ({ ...obj }));
      let score = prev.score;
      let cascadeCount = 0;

      // Process cascades
      let hasMatches = true;
      while (hasMatches) {
        const matches = findMatches(board);

        if (matches.length === 0) {
          hasMatches = false;
          break;
        }

        cascadeCount++;

        // Count matched colors for objectives
        matches.forEach(({ row, col }) => {
          const tile = board[row][col];
          if (tile) {
            const objIndex = objectives.findIndex((obj) => obj.color === tile.color);
            if (objIndex !== -1) {
              objectives[objIndex].collected++;
            }
            score += 10 * cascadeCount;
          }
        });

        // Remove matched tiles
        matches.forEach(({ row, col }) => {
          board[row][col] = null;
        });

        // Apply gravity
        for (let col = 0; col < board.length; col++) {
          let writeRow = board.length - 1;
          for (let row = board.length - 1; row >= 0; row--) {
            if (board[row][col] !== null) {
              if (row !== writeRow) {
                board[writeRow][col] = board[row][col];
                board[writeRow][col]!.row = writeRow;
                board[row][col] = null;
              }
              writeRow--;
            }
          }

          // Fill empty spaces with new tiles
          for (let row = writeRow; row >= 0; row--) {
            board[row][col] = {
              id: generateId(),
              color: getRandomColor(colors),
              row,
              col,
              isMatched: false,
              isNew: true,
            };
          }
        }
      }

      const isWon = checkWinCondition(objectives);
      const isComplete = isWon || prev.movesRemaining <= 0;

      return {
        ...prev,
        board,
        objectives,
        score,
        cascadeCount: prev.cascadeCount + cascadeCount,
        isWon,
        isComplete,
      };
    });

    setTimeout(() => setIsProcessing(false), 300);
  }, [colors, checkWinCondition]);

  const handleTileClick = useCallback((row: number, col: number) => {
    if (isProcessing || gameState.isComplete) return;

    const clickedPos: Position = { row, col };

    if (!gameState.selectedTile) {
      setGameState((prev) => ({ ...prev, selectedTile: clickedPos }));
      return;
    }

    if (gameState.selectedTile.row === row && gameState.selectedTile.col === col) {
      setGameState((prev) => ({ ...prev, selectedTile: null }));
      return;
    }

    if (!isAdjacent(gameState.selectedTile, clickedPos)) {
      setGameState((prev) => ({ ...prev, selectedTile: clickedPos }));
      return;
    }

    // Swap tiles
    setGameState((prev) => {
      const newBoard = prev.board.map((r) => r.map((t) => t ? { ...t } : null));
      const { row: r1, col: c1 } = prev.selectedTile!;
      const { row: r2, col: c2 } = clickedPos;

      const temp = newBoard[r1][c1];
      newBoard[r1][c1] = newBoard[r2][c2];
      newBoard[r2][c2] = temp;

      if (newBoard[r1][c1]) {
        newBoard[r1][c1]!.row = r1;
        newBoard[r1][c1]!.col = c1;
      }
      if (newBoard[r2][c2]) {
        newBoard[r2][c2]!.row = r2;
        newBoard[r2][c2]!.col = c2;
      }

      // Check if swap creates a match
      const matches = findMatches(newBoard);

      if (matches.length === 0) {
        // Swap back - invalid move
        const temp2 = newBoard[r1][c1];
        newBoard[r1][c1] = newBoard[r2][c2];
        newBoard[r2][c2] = temp2;

        if (newBoard[r1][c1]) {
          newBoard[r1][c1]!.row = r1;
          newBoard[r1][c1]!.col = c1;
        }
        if (newBoard[r2][c2]) {
          newBoard[r2][c2]!.row = r2;
          newBoard[r2][c2]!.col = c2;
        }

        return { ...prev, selectedTile: null };
      }

      return {
        ...prev,
        board: newBoard,
        selectedTile: null,
        movesRemaining: prev.movesRemaining - 1,
      };
    });

    // Process matches after state update
    setTimeout(() => processMatches(), 100);
  }, [gameState.selectedTile, gameState.isComplete, isProcessing, processMatches]);

  const resetGame = useCallback(() => {
    setGameState({
      board: createBoard(config.boardSize, colors),
      movesRemaining: config.moveLimit,
      objectives: config.objectives.map((obj) => ({ ...obj, collected: 0 })),
      isComplete: false,
      isWon: false,
      selectedTile: null,
      score: 0,
      cascadeCount: 0,
    });
  }, [config, colors]);

  // Check for game over when moves run out
  useEffect(() => {
    if (gameState.movesRemaining <= 0 && !gameState.isComplete && !gameState.isWon) {
      setGameState((prev) => ({ ...prev, isComplete: true }));
    }
  }, [gameState.movesRemaining, gameState.isComplete, gameState.isWon]);

  return {
    gameState,
    handleTileClick,
    resetGame,
    isProcessing,
    outcome: getOutcome(),
  };
}
