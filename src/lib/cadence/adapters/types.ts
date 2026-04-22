import type { SignalTier } from '../types';

export interface DesignLever {
  key: string;
  label: string;
  range: [number, number];
  direction: 'higher_harder' | 'lower_harder';
  description?: string;
}

export interface VariantSystem {
  min: number;
  base: number;
  max: number;
  stepThresholds: [number, number];
  maxJumpStep: number;
}

export interface SignalColumnMapping {
  cadenceKey: string;
  tier: SignalTier;
  transform?: (raw: unknown) => number;
}

export interface GameAdapter {
  id: string;
  displayName: string;

  designLevers: DesignLever[];
  variants?: VariantSystem;

  /**
   * Columns in the SAT export that carry session identity.
   * Used to group signal rows into sessions.
   */
  sessionKeyColumns: string[];

  /**
   * Map raw SAT export columns to Cadence signal keys.
   * Key = source column name; value = mapping.
   */
  signalColumnMapping: Record<string, SignalColumnMapping>;

  /**
   * Optional: the analytics event that carries DDA output
   * (flow state, skill score, variant served). Used for validation.
   */
  ddaOutputEventName?: string;

  /**
   * Fallback values for design levers when the SAT export does not
   * carry them yet (pre-DDA-extension telemetry). The replay pipeline
   * fills in missing lever values from here so rules can still
   * produce proposals on historical data. The importer surfaces a
   * warning when this fallback is used.
   */
  defaultLevelParameters?: Record<string, number>;

  /**
   * Human-readable notes shown in the adapter selector UI.
   */
  notes?: string;
}
