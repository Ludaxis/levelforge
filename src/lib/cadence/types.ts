/**
 * Cadence pipeline types.
 *
 * Shapes mirror the Unity SDK at com.ludaxis.cadence v1.1 (a57c16ddf83b).
 * The TypeScript port in Phase 3b will produce these types byte-faithfully
 * within ε=1e-6 for transcendental paths (Glicko-2 pow/log/exp).
 */

export type SignalTier = 0 | 1 | 2 | 3 | 4;

export type FlowState =
  | 'unknown'
  | 'flow'
  | 'boredom'
  | 'anxiety'
  | 'frustration';

export type SessionOutcome = 'win' | 'lose' | 'abandoned';

export interface SignalEntry {
  key: string;
  value: number;
  tier: SignalTier;
  moveIndex: number;
  sessionTime: number;
  frameNumber: number;
}

export interface SessionRow {
  userId: string;
  sessionId: string;
  levelId: string;
  levelVariant?: number;
  attempt: number;
  signals: SignalEntry[];
  levelParameters: Record<string, number>;
  outcome: SessionOutcome;
  startedAtUtc: number;
  endedAtUtc: number;
}

export interface FlowReading {
  state: FlowState;
  confidence: number;
  tempoScore: number;
  efficiencyScore: number;
  engagementScore: number;
  frustrationScore: number;
  sessionTime: number;
}

export interface SessionSummary {
  sessionId: string;
  outcome: SessionOutcome;
  durationSec: number;
  totalMoves: number;
  moveEfficiency: number;
  wasteRatio: number;
  progressRate: number;
  interMoveVariance: number;
  pauseCount: number;
  skillScore: number;
  engagementScore: number;
  frustrationScore: number;
  finalFlowState: FlowState;
}

export interface SessionHistoryEntry {
  sessionId: string;
  outcome: SessionOutcome;
  efficiency: number;
  timestampUtcTicks: number;
  levelTypeByte: number;
}

export interface PlayerSkillProfile {
  rating: number;
  deviation: number;
  volatility: number;
  sessionsCompleted: number;
  lastSessionUtcTicks: number;
  averageEfficiency: number;
  averageOutcome: number;
  history: SessionHistoryEntry[];
}

export interface ParameterDelta {
  parameterKey: string;
  currentValue: number;
  proposedValue: number;
  ruleName: string;
}

export type AdjustmentTiming = 'BeforeNextLevel' | 'MidSession';

export interface AdjustmentProposal {
  deltas: ParameterDelta[];
  confidence: number;
  reason: string;
  detectedState: FlowState;
  timing: AdjustmentTiming;
  rulesEvaluated: string[];
  variantBefore?: number;
  variantAfter?: number;
}

export interface CadenceConfig {
  playerModel: {
    initialRating: number;
    initialDeviation: number;
    initialVolatility: number;
    tau: number;
    deviationDecayPerDay: number;
    maxDeviation: number;
    convergenceEpsilon: number;
    maxHistoryEntries: number;
  };
  flowDetector: {
    tempoWindowSize: number;
    efficiencyWindowSize: number;
    engagementWindowSize: number;
    boredomEfficiencyMin: number;
    boredomTempoMin: number;
    anxietyEfficiencyMax: number;
    anxietyTempoMax: number;
    frustrationThreshold: number;
    hysteresisCount: number;
    warmupMoves: number;
    exponentialAlpha: number;
  };
  adjustmentEngine: {
    targetWinRateMin: number;
    targetWinRateMax: number;
    minSessionsBeforeActive: number;
    lossStreakThreshold: number;
    winStreakThreshold: number;
    lossStreakEaseAmount: number;
    winStreakHardenAmount: number;
    frustrationReliefThreshold: number;
    easeMinPercent: number;
    easeMaxPercent: number;
    allowMidSession: boolean;
    globalCooldownSeconds: number;
    perParameterCooldownSeconds: number;
    maxDeltaPerAdjustment: number;
    lowConfidenceThreshold: number;
    lowConfidenceStepCap: number;
    newPlayerSessionGate: number;
    sessionFatigueThresholdLevels: number;
    sessionFatigueResetMinutes: number;
  };
}

export type PipelineStepId =
  | 'parse'
  | 'group_sessions'
  | 'session_analyze'
  | 'flow_detect'
  | 'glicko_update'
  | 'rule_eval'
  | 'variant_map';

export interface PipelineStepResult {
  stepId: PipelineStepId;
  stepName: string;
  rowsIn: number;
  rowsOut: number;
  durationMs: number;
  summary: string;
  samplePayload?: unknown;
}

export interface PipelineError {
  sessionId?: string;
  stepId?: PipelineStepId;
  message: string;
}

export interface PipelineRun {
  runId: string;
  adapterId: string;
  completedAtUtc: number;
  signalCount: number;
  sessionCount: number;
  proposalCount: number;
  steps: PipelineStepResult[];
  proposals: AdjustmentProposal[];
  summaries: SessionSummary[];
  flowReadings: Record<string, FlowReading[]>;
  profileByUser: Record<string, PlayerSkillProfile>;
  errors: PipelineError[];
  config: CadenceConfig;
}
