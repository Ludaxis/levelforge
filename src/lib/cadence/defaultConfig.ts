import type { CadenceConfig } from './types';

/**
 * Production-matching defaults from the Cadence SDK package
 * (com.ludaxis.cadence v1.1, fingerprint a57c16ddf83b).
 *
 * Notes:
 * - Six rules ship in the SDK; PRD v1.1 documents only four.
 *   NewPlayerRule and SessionFatigueRule are real and tunable.
 * - Variant mapping thresholds (step %, caps) are owned per-game by adapters,
 *   not by this config — see src/lib/cadence/adapters/*.
 */
export const DEFAULT_CADENCE_CONFIG: CadenceConfig = {
  playerModel: {
    initialRating: 1500,
    initialDeviation: 350,
    initialVolatility: 0.06,
    tau: 0.5,
    deviationDecayPerDay: 5.0,
    maxDeviation: 350,
    convergenceEpsilon: 1e-6,
    maxHistoryEntries: 20,
  },
  flowDetector: {
    tempoWindowSize: 8,
    efficiencyWindowSize: 12,
    engagementWindowSize: 20,
    boredomEfficiencyMin: 0.85,
    boredomTempoMin: 0.7,
    anxietyEfficiencyMax: 0.3,
    anxietyTempoMax: 0.2,
    frustrationThreshold: 0.7,
    hysteresisCount: 3,
    warmupMoves: 5,
    exponentialAlpha: 0.3,
  },
  adjustmentEngine: {
    cadenceStartLevel: 6,
    targetWinRateMin: 0.3,
    targetWinRateMax: 0.7,
    minSessionsBeforeActive: 5,
    lossStreakThreshold: 3,
    winStreakThreshold: 5,
    lossStreakEaseAmount: 0.1,
    winStreakHardenAmount: 0.05,
    frustrationReliefThreshold: 0.7,
    easeMinPercent: 0.05,
    easeMaxPercent: 0.15,
    allowMidSession: false,
    globalCooldownSeconds: 60,
    perParameterCooldownSeconds: 120,
    maxDeltaPerAdjustment: 0.15,
    lowConfidenceThreshold: 0.4,
    lowConfidenceStepCap: 1,
    newPlayerSessionGate: 5,
    sessionFatigueThresholdLevels: 5,
    sessionFatigueResetMinutes: 30,
  },
};

export function cloneDefaultConfig(): CadenceConfig {
  return JSON.parse(JSON.stringify(DEFAULT_CADENCE_CONFIG));
}
