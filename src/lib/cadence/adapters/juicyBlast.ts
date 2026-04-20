import type { GameAdapter } from './types';

/**
 * Juicy Blast adapter — first production target.
 *
 * Source of truth: juicy-blast's CadenceService.cs and NCJB Event Mastersheet v2
 * (DDA tab). The four design levers are the exact keys passed to BeginSession().
 */
export const juicyBlastAdapter: GameAdapter = {
  id: 'juicy_blast',
  displayName: 'Juicy Blast',
  notes:
    'Match-3-adjacent blast game. DDA activates from level 6+. Variant system 2–8 with base 5.',

  designLevers: [
    {
      key: 'blocking_offset',
      label: 'Blocking Offset',
      range: [0, 10],
      direction: 'higher_harder',
      description: 'Depth at which tiles are buried in Layer C.',
    },
    {
      key: 'max_selectable',
      label: 'Max Selectable',
      range: [6, 15],
      direction: 'lower_harder',
      description: 'Waiting stand slot count (visible planning surface).',
    },
    {
      key: 'active_launchers',
      label: 'Active Launchers',
      range: [1, 3],
      direction: 'lower_harder',
      description: 'Number of simultaneously active blenders.',
    },
    {
      key: 'color_variant_density',
      label: 'Color Variant Density',
      range: [0, 100],
      direction: 'higher_harder',
      description:
        'Proximity of same-color fruit variants. Higher = more cognitive load.',
    },
  ],

  variants: {
    min: 2,
    base: 5,
    max: 8,
    stepThresholds: [0.05, 0.1],
    maxJumpStep: 3,
  },

  sessionKeyColumns: ['user_id', 'level_id', 'attempt'],

  signalColumnMapping: {
    // Per-move fields from song_move
    move_index: { cadenceKey: 'move.executed', tier: 0 },
    is_optimal: {
      cadenceKey: 'move.optimal',
      tier: 0,
      transform: (raw: unknown) => (raw === true || raw === 1 || raw === '1' ? 1 : 0),
    },
    waste_value: { cadenceKey: 'move.waste', tier: 0 },
    progress_delta: { cadenceKey: 'progress.delta', tier: 0 },
    move_interval_ms: {
      cadenceKey: 'tempo.interval',
      tier: 1,
      transform: (raw: unknown) => Number(raw) / 1000,
    },
    hesitation_ms: {
      cadenceKey: 'tempo.hesitation',
      tier: 1,
      transform: (raw: unknown) => Number(raw) / 1000,
    },
    input_rejected_count: { cadenceKey: 'input.rejected', tier: 4 },
    // Booster / revive metadata
    booster_used: { cadenceKey: 'strategy.powerup', tier: 2 },
    booster_click: { cadenceKey: 'strategy.powerup_attempt', tier: 2 },
    revive_attempt: { cadenceKey: 'meta.revive_attempt', tier: 3 },
    revive_success: { cadenceKey: 'meta.revive_success', tier: 3 },
    // Session meta
    attempt: { cadenceKey: 'meta.attempt', tier: 3 },
  },

  ddaOutputEventName: 'song_result',
};
