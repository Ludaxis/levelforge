/**
 * Central registry of Juicy Blast difficulty elements.
 *
 * Each entry exposes bounds + a human label to any surface that needs to
 * enumerate "what can a designer tune on a level" — the Bulk Variant
 * Generator being the first consumer. Add a new element here once and it
 * appears in every dropdown automatically.
 */

export type DifficultyElementKey =
  | 'maxSelectableItems'
  | 'blockingOffset'
  | 'activeLauncherCount'
  | 'waitingStandSlots'
  | 'moveLimit';

export interface DifficultyElementSpec {
  key: DifficultyElementKey;
  label: string;
  /** Shorter form for table columns / chips. */
  short: string;
  min: number;
  /** Static upper bound. Pass undefined for a dynamic cap (e.g. launcher count). */
  max?: number;
  step: number;
  /** If true, the current level value may be undefined (optional recipe field). */
  optional?: boolean;
}

export const DIFFICULTY_ELEMENTS: DifficultyElementSpec[] = [
  {
    key: 'maxSelectableItems',
    label: 'Max Selectable Items',
    short: 'MSI',
    min: 1,
    max: 20,
    step: 1,
  },
  {
    key: 'blockingOffset',
    label: 'Blocking Offset',
    short: 'BO',
    min: 0,
    max: 10,
    step: 1,
  },
  {
    key: 'activeLauncherCount',
    label: 'Active Launchers',
    short: 'AL',
    min: 1,
    step: 1,
  },
  {
    key: 'waitingStandSlots',
    label: 'Waiting Stand Slots',
    short: 'WSS',
    min: 1,
    max: 8,
    step: 1,
  },
  {
    key: 'moveLimit',
    label: 'Move Limit',
    short: 'ML',
    min: 1,
    max: 999,
    step: 1,
    optional: true,
  },
];

export function getDifficultyElement(
  key: DifficultyElementKey
): DifficultyElementSpec | undefined {
  return DIFFICULTY_ELEMENTS.find((e) => e.key === key);
}
