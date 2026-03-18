import { useState, useCallback, useMemo } from 'react';
import {
  StudioGameConfig,
  StudioGameState,
  initializeState,
  pickTileLogic,
} from './studioGameLogic';

// Re-export all types and functions for backward compatibility
export type {
  StudioDifficultyParams,
  StudioDifficultyResult,
  DifficultyComponent,
  StudioTile,
  StudioLauncherState,
  StudioGameConfig,
  StudioGameState,
} from './studioGameLogic';

export {
  MAX_BLOCKING_OFFSET,
  blockingOffsetToDepth,
  resolveBlockingOffset,
  calculateStudioDifficulty,
  computeParMoves,
  findMaxSolvableBlockingOffset,
  findMaxSolvableDepth,
  mulberry32,
  seededShuffle,
  buildDeterministicSequence,
  getDeterministicMaxSwap,
  buildSolvableSequenceSeeded,
  buildChallengingSequenceSeeded,
  initializeState,
  initializeStateSeeded,
  fireLauncher,
  findMatchingLauncher,
  postFireCascade,
  pickTileLogic,
} from './studioGameLogic';

// ============================================================================
// Hook
// ============================================================================

export function useStudioGame(config: StudioGameConfig | null) {
  const [state, setState] = useState<StudioGameState | null>(null);

  const reset = useCallback(() => {
    if (!config) return;
    setState(initializeState(config));
  }, [config]);

  const configKey = useMemo(() => {
    if (!config) return '';
    return `${config.pixelArt.length}-${config.selectableItems.length}-${config.maxSelectableItems}-${config.launchers.length}-${config.activeLauncherCount ?? 2}-${config.blockingOffset ?? config.mismatchDepth ?? 0}-${config.seed ?? 'random'}`;
  }, [config]);

  const pickTile = useCallback(
    (slotIndex: number) => {
      setState((prev) => {
        if (!prev) return prev;
        return pickTileLogic(prev, slotIndex);
      });
    },
    [],
  );

  const progress = useMemo(() => {
    if (!state) return { filled: 0, total: 0, percent: 0 };
    const filled = state.pixelArt.filter((c) => c.filled).length;
    const total = state.pixelArt.length;
    return { filled, total, percent: total > 0 ? Math.round((filled / total) * 100) : 0 };
  }, [state]);

  return { state, reset, pickTile, progress, configKey };
}
