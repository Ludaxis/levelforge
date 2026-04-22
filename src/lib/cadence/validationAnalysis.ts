import { normalizeAttemptValue } from './importProfile';
import type { PipelineRunWithReports, PerSessionReport } from './pipeline';
import type { FlowState } from './types';

const FLOW_STATES: FlowState[] = [
  'flow',
  'boredom',
  'anxiety',
  'frustration',
  'unknown',
];

export interface FlowParityMismatch {
  userId: string;
  levelId: string;
  attempt: number;
  loggedFlowState: FlowState;
  recomputedFlowState: FlowState;
}

export interface FlowParityReport {
  hasLoggedFlowState: boolean;
  replayedSessions: number;
  loggedSessions: number;
  compared: number;
  matches: number;
  mismatches: number;
  missingLogged: number;
  missingReplay: number;
  matchRate: number;
  sampleMismatches: FlowParityMismatch[];
}

export interface SankeyHealthFlag {
  severity: 'pass' | 'warn' | 'fail';
  title: string;
  detail: string;
}

export interface SankeyHealthReport {
  sessionCount: number;
  userCount: number;
  transitionCount: number;
  stateCounts: Record<FlowState, number>;
  stateShare: Record<FlowState, number>;
  flowShare: number;
  boredomFrustrationTransitionRate: number;
  switchRate: number;
  unknownPastSessionFive: number;
  flags: SankeyHealthFlag[];
}

export type DdaCohort = 'control' | 'treatment';

export interface DdaSession {
  userId: string;
  levelId: string;
  attempt: number;
  timestamp: number;
  cohort: DdaCohort;
  flowState: string;
  rule: string;
  variantServed: number | null;
  variantDelta: number;
  result: string;
  isWin: boolean;
  frustrationScore: number | null;
  sessionsCompleted: number | null;
}

export interface ProportionInterval {
  value: number;
  low: number;
  high: number;
}

export interface TreatmentCohortStats {
  cohort: DdaCohort;
  users: number;
  sessions: number;
  wins: number;
  winRate: ProportionInterval;
  linkedNextSessions: number;
  nextSessionRate: ProportionInterval;
  highFrustrationSessions: number;
  highFrustrationWinRate: ProportionInterval;
}

export interface TreatmentRuleStats {
  cohort: DdaCohort;
  rule: string;
  users: number;
  sessions: number;
  winRate: ProportionInterval;
  nextSessionRate: ProportionInterval;
  avgVariantDelta: number;
  eased: number;
  hardened: number;
}

export interface TreatmentImpactReport {
  sessions: DdaSession[];
  hasBothCohorts: boolean;
  control: TreatmentCohortStats;
  treatment: TreatmentCohortStats;
  deltas: {
    winRate: number;
    nextSessionRate: number;
    highFrustrationWinRate: number;
  };
  ruleStats: TreatmentRuleStats[];
}

export function computeFlowParity(
  run: PipelineRunWithReports | null,
  rows: Array<Record<string, unknown>> | null
): FlowParityReport {
  const empty = emptyFlowParity(run?.perSession.length ?? 0);
  if (!run || !rows) return empty;

  const logged = loggedFlowBySession(rows);
  const replayedKeys = new Set<string>();
  let matches = 0;
  let mismatches = 0;
  let missingLogged = 0;
  const sampleMismatches: FlowParityMismatch[] = [];

  for (const report of run.perSession) {
    const key = sessionKey(report.userId, report.levelId, report.attempt);
    replayedKeys.add(key);
    const loggedState = logged.get(key)?.state;
    if (!loggedState) {
      missingLogged++;
      continue;
    }

    const recomputedState = stateFor(report);
    if (loggedState === recomputedState) {
      matches++;
    } else {
      mismatches++;
      if (sampleMismatches.length < 8) {
        sampleMismatches.push({
          userId: report.userId,
          levelId: report.levelId,
          attempt: report.attempt,
          loggedFlowState: loggedState,
          recomputedFlowState: recomputedState,
        });
      }
    }
  }

  let missingReplay = 0;
  for (const key of logged.keys()) {
    if (!replayedKeys.has(key)) missingReplay++;
  }

  const compared = matches + mismatches;
  return {
    hasLoggedFlowState: logged.size > 0,
    replayedSessions: run.perSession.length,
    loggedSessions: logged.size,
    compared,
    matches,
    mismatches,
    missingLogged,
    missingReplay,
    matchRate: compared > 0 ? matches / compared : 0,
    sampleMismatches,
  };
}

export function computeSankeyHealth(
  run: PipelineRunWithReports | null
): SankeyHealthReport {
  const stateCounts = emptyFlowStateCounts();
  if (!run) {
    return {
      sessionCount: 0,
      userCount: 0,
      transitionCount: 0,
      stateCounts,
      stateShare: emptyFlowStateCounts(),
      flowShare: 0,
      boredomFrustrationTransitionRate: 0,
      switchRate: 0,
      unknownPastSessionFive: 0,
      flags: [
        {
          severity: 'warn',
          title: 'Run replay first',
          detail: 'Health checks need recomputed per-session flow states.',
        },
      ],
    };
  }

  const reports = run.perSession
    .filter((report) => report.attempt === 1)
    .filter((report) => report.playType !== 'replay')
    .sort((a, b) => a.startedAtUtc - b.startedAtUtc);

  const users = new Set<string>();
  const byUser = new Map<string, PerSessionReport[]>();
  for (const report of reports) {
    const state = stateFor(report);
    stateCounts[state]++;
    users.add(report.userId);
    if (!byUser.has(report.userId)) byUser.set(report.userId, []);
    byUser.get(report.userId)!.push(report);
  }

  let transitionCount = 0;
  let switchedTransitions = 0;
  let boredomFrustrationTransitions = 0;
  let unknownPastSessionFive = 0;
  for (const userReports of byUser.values()) {
    userReports.sort((a, b) => a.startedAtUtc - b.startedAtUtc);
    for (let i = 0; i < userReports.length; i++) {
      if (i >= 5 && stateFor(userReports[i]) === 'unknown') {
        unknownPastSessionFive++;
      }
      if (i === userReports.length - 1) continue;
      const from = stateFor(userReports[i]);
      const to = stateFor(userReports[i + 1]);
      transitionCount++;
      if (from !== to) switchedTransitions++;
      if (isBoredomFrustrationJump(from, to)) boredomFrustrationTransitions++;
    }
  }

  const sessionCount = reports.length;
  const stateShare = emptyFlowStateCounts();
  for (const state of FLOW_STATES) {
    stateShare[state] = sessionCount > 0 ? stateCounts[state] / sessionCount : 0;
  }

  const flowShare = stateShare.flow;
  const boredomFrustrationTransitionRate =
    transitionCount > 0 ? boredomFrustrationTransitions / transitionCount : 0;
  const switchRate =
    transitionCount > 0 ? switchedTransitions / transitionCount : 0;
  const flags = buildSankeyFlags({
    sessionCount,
    flowShare,
    boredomFrustrationTransitionRate,
    switchRate,
    unknownPastSessionFive,
  });

  return {
    sessionCount,
    userCount: users.size,
    transitionCount,
    stateCounts,
    stateShare,
    flowShare,
    boredomFrustrationTransitionRate,
    switchRate,
    unknownPastSessionFive,
    flags,
  };
}

export function computeTreatmentImpact(
  rows: Array<Record<string, unknown>> | null
): TreatmentImpactReport {
  const sessions = rows ? extractDdaSessions(rows) : [];
  const nextKeys = nextSessionKeys(sessions);
  const control = cohortStats('control', sessions, nextKeys);
  const treatment = cohortStats('treatment', sessions, nextKeys);

  return {
    sessions,
    hasBothCohorts: control.sessions > 0 && treatment.sessions > 0,
    control,
    treatment,
    deltas: {
      winRate: treatment.winRate.value - control.winRate.value,
      nextSessionRate:
        treatment.nextSessionRate.value - control.nextSessionRate.value,
      highFrustrationWinRate:
        treatment.highFrustrationWinRate.value -
        control.highFrustrationWinRate.value,
    },
    ruleStats: ruleStats(sessions, nextKeys),
  };
}

export function extractDdaSessions(
  rows: Array<Record<string, unknown>>
): DdaSession[] {
  const buckets = new Map<string, Array<Record<string, unknown>>>();
  for (const row of rows) {
    const user = safeString(row.user_id);
    const level = safeString(row.level_id);
    if (!user || !level) continue;
    const attempt = normalizeAttemptNumber(row.attempt ?? 1);
    const key = sessionKey(user, level, attempt);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(row);
  }

  const out: DdaSession[] = [];
  for (const sessionRows of buckets.values()) {
    sessionRows.sort((a, b) => numberOr(a.event_timestamp, 0) - numberOr(b.event_timestamp, 0));
    const resultRow =
      sessionRows.find((r) => isResultEvent(r.event_name)) ?? sessionRows.at(-1);
    const startRow =
      sessionRows.find((r) => isStartEvent(r.event_name)) ?? sessionRows[0];
    if (!resultRow || !startRow) continue;

    const flowState =
      safeString(resultRow.flow_state) || safeString(startRow.flow_state);
    const cohort = cohortFromValue(startRow.dda_enabled ?? resultRow.dda_enabled);
    if (!flowState || !cohort) continue;

    const variantServed = nullableNumber(
      startRow.variant_served ??
        resultRow.variant_served ??
        startRow.variant_played ??
        resultRow.variant_played
    );
    const variantDefault = nullableNumber(
      startRow.variant_default ?? resultRow.variant_default
    );
    const loggedDelta = nullableNumber(
      startRow.variant_delta ?? resultRow.variant_delta
    );
    const variantDelta =
      loggedDelta ??
      (variantServed !== null && variantDefault !== null
        ? variantServed - variantDefault
        : 0);

    const result = normalizeResult(resultRow.result);
    out.push({
      userId: safeString(startRow.user_id),
      levelId: safeString(startRow.level_id),
      attempt: normalizeAttemptNumber(startRow.attempt ?? resultRow.attempt ?? 1),
      timestamp: numberOr(startRow.event_timestamp ?? resultRow.event_timestamp, 0),
      cohort,
      flowState,
      rule:
        safeString(startRow.dda_rule ?? resultRow.dda_rule) ||
        (variantDelta === 0 ? 'none' : 'unlabeled'),
      variantServed,
      variantDelta,
      result,
      isWin: result === 'win',
      frustrationScore: nullableNumber(
        resultRow.frustration_score ?? startRow.frustration_score
      ),
      sessionsCompleted: nullableNumber(
        resultRow.sessions_completed ?? startRow.sessions_completed
      ),
    });
  }

  return out.sort((a, b) => a.timestamp - b.timestamp);
}

function emptyFlowParity(replayedSessions: number): FlowParityReport {
  return {
    hasLoggedFlowState: false,
    replayedSessions,
    loggedSessions: 0,
    compared: 0,
    matches: 0,
    mismatches: 0,
    missingLogged: replayedSessions,
    missingReplay: 0,
    matchRate: 0,
    sampleMismatches: [],
  };
}

function loggedFlowBySession(rows: Array<Record<string, unknown>>) {
  const logged = new Map<string, { state: FlowState; rank: number }>();
  for (const row of rows) {
    const user = safeString(row.user_id);
    const level = safeString(row.level_id);
    const state = parseFlowState(row.flow_state);
    if (!user || !level || !state) continue;
    const key = sessionKey(user, level, normalizeAttemptNumber(row.attempt ?? 1));
    const rank = isResultEvent(row.event_name) ? 2 : isStartEvent(row.event_name) ? 1 : 0;
    const existing = logged.get(key);
    if (!existing || rank >= existing.rank) {
      logged.set(key, { state, rank });
    }
  }
  return logged;
}

function stateFor(report: PerSessionReport): FlowState {
  return report.finalFlowReading?.state ?? report.summary.finalFlowState;
}

function buildSankeyFlags(input: {
  sessionCount: number;
  flowShare: number;
  boredomFrustrationTransitionRate: number;
  switchRate: number;
  unknownPastSessionFive: number;
}): SankeyHealthFlag[] {
  const flags: SankeyHealthFlag[] = [];
  if (input.sessionCount === 0) {
    flags.push({
      severity: 'warn',
      title: 'No eligible sessions',
      detail: 'Attempt-1, non-replay sessions are required for baseline Sankey health.',
    });
    return flags;
  }
  if (input.flowShare > 0.85) {
    flags.push({
      severity: 'fail',
      title: 'Flow share is very high',
      detail:
        'More than 85% of sessions are in flow. Thresholds may be too loose or logged signals may be missing variance.',
    });
  }
  if (input.flowShare < 0.3) {
    flags.push({
      severity: 'warn',
      title: 'Flow share is low',
      detail:
        'Less than 30% of sessions are in flow. Thresholds may be too tight or levels may be heavily mistuned.',
    });
  }
  if (input.boredomFrustrationTransitionRate > 0.05) {
    flags.push({
      severity: 'warn',
      title: 'Boredom/frustration jumps are high',
      detail:
        'More than 5% of transitions jump directly between opposite failure modes, which can mean noisy classification.',
    });
  }
  if (input.switchRate > 0.7) {
    flags.push({
      severity: 'warn',
      title: 'Users switch states too often',
      detail:
        'More than 70% of user transitions change state. Check hysteresis and warmup settings before trusting the journey.',
    });
  }
  if (input.unknownPastSessionFive > 0) {
    flags.push({
      severity: 'warn',
      title: 'Unknown persists after warmup',
      detail:
        'Some users still have unknown state after their fifth observed session. Confirm signal events are firing consistently.',
    });
  }
  if (flags.length === 0) {
    flags.push({
      severity: 'pass',
      title: 'No Sankey red flags',
      detail:
        'The baseline journey is healthy enough to use for formula validation and tuning review.',
    });
  }
  return flags;
}

function cohortStats(
  cohort: DdaCohort,
  sessions: DdaSession[],
  nextKeys: Set<string>
): TreatmentCohortStats {
  const cohortSessions = sessions.filter((s) => s.cohort === cohort);
  const users = new Set(cohortSessions.map((s) => s.userId));
  const wins = cohortSessions.filter((s) => s.isWin).length;
  const linkedNextSessions = cohortSessions.filter((s) =>
    nextKeys.has(ddaSessionKey(s))
  ).length;
  const highFrustration = cohortSessions.filter(
    (s) => (s.frustrationScore ?? -Infinity) >= 0.7
  );
  const highFrustrationWins = highFrustration.filter((s) => s.isWin).length;

  return {
    cohort,
    users: users.size,
    sessions: cohortSessions.length,
    wins,
    winRate: wilsonInterval(wins, cohortSessions.length),
    linkedNextSessions,
    nextSessionRate: wilsonInterval(linkedNextSessions, cohortSessions.length),
    highFrustrationSessions: highFrustration.length,
    highFrustrationWinRate: wilsonInterval(
      highFrustrationWins,
      highFrustration.length
    ),
  };
}

function ruleStats(
  sessions: DdaSession[],
  nextKeys: Set<string>
): TreatmentRuleStats[] {
  const groups = new Map<string, DdaSession[]>();
  for (const session of sessions) {
    const key = `${session.cohort}|${session.rule}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(session);
  }

  return Array.from(groups.entries())
    .map(([key, group]) => {
      const [cohort, rule] = key.split('|') as [DdaCohort, string];
      const users = new Set(group.map((s) => s.userId));
      const wins = group.filter((s) => s.isWin).length;
      const linkedNextSessions = group.filter((s) =>
        nextKeys.has(ddaSessionKey(s))
      ).length;
      const deltaSum = group.reduce((sum, s) => sum + s.variantDelta, 0);
      return {
        cohort,
        rule,
        users: users.size,
        sessions: group.length,
        winRate: wilsonInterval(wins, group.length),
        nextSessionRate: wilsonInterval(linkedNextSessions, group.length),
        avgVariantDelta: group.length > 0 ? deltaSum / group.length : 0,
        eased: group.filter((s) => s.variantDelta < 0).length,
        hardened: group.filter((s) => s.variantDelta > 0).length,
      };
    })
    .sort((a, b) => b.sessions - a.sessions);
}

function nextSessionKeys(sessions: DdaSession[]): Set<string> {
  const nextKeys = new Set<string>();
  const byUser = new Map<string, DdaSession[]>();
  for (const session of sessions) {
    if (!byUser.has(session.userId)) byUser.set(session.userId, []);
    byUser.get(session.userId)!.push(session);
  }
  for (const userSessions of byUser.values()) {
    userSessions.sort((a, b) => a.timestamp - b.timestamp);
    for (let i = 0; i < userSessions.length - 1; i++) {
      nextKeys.add(ddaSessionKey(userSessions[i]));
    }
  }
  return nextKeys;
}

function wilsonInterval(successes: number, total: number): ProportionInterval {
  if (total <= 0) return { value: 0, low: 0, high: 0 };
  const z = 1.96;
  const p = successes / total;
  const z2 = z * z;
  const denominator = 1 + z2 / total;
  const center = (p + z2 / (2 * total)) / denominator;
  const margin =
    (z / denominator) *
    Math.sqrt((p * (1 - p)) / total + z2 / (4 * total * total));
  return {
    value: p,
    low: Math.max(0, center - margin),
    high: Math.min(1, center + margin),
  };
}

function emptyFlowStateCounts(): Record<FlowState, number> {
  return FLOW_STATES.reduce(
    (acc, state) => {
      acc[state] = 0;
      return acc;
    },
    {} as Record<FlowState, number>
  );
}

function isBoredomFrustrationJump(from: FlowState, to: FlowState): boolean {
  return (
    (from === 'boredom' && to === 'frustration') ||
    (from === 'frustration' && to === 'boredom')
  );
}

function sessionKey(userId: string, levelId: string, attempt: unknown): string {
  return [userId, levelId, String(normalizeAttemptNumber(attempt))].join('|');
}

function ddaSessionKey(session: DdaSession): string {
  return sessionKey(session.userId, session.levelId, session.attempt);
}

function normalizeAttemptNumber(value: unknown): number {
  const normalized = normalizeAttemptValue(value);
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 1;
}

function parseFlowState(value: unknown): FlowState | null {
  const raw = safeString(value).trim().toLowerCase();
  if (!raw) return null;
  if ((FLOW_STATES as string[]).includes(raw)) return raw as FlowState;
  if (raw === 'in_flow') return 'flow';
  if (raw === 'bored') return 'boredom';
  if (raw === 'anxious') return 'anxiety';
  if (raw === 'frustrated') return 'frustration';
  return null;
}

function cohortFromValue(value: unknown): DdaCohort | null {
  const raw = safeString(value).trim().toLowerCase();
  if (raw === '1' || raw === 'true' || raw === 'treatment' || raw === 'on') {
    return 'treatment';
  }
  if (raw === '0' || raw === 'false' || raw === 'control' || raw === 'off') {
    return 'control';
  }
  return null;
}

function normalizeResult(value: unknown): string {
  const raw = safeString(value).trim().toLowerCase();
  if (raw === 'won' || raw === '1') return 'win';
  if (raw === 'lost' || raw === '0') return 'lose';
  return raw || 'unknown';
}

function isStartEvent(value: unknown): boolean {
  const event = safeString(value);
  return event === 'song_start' || event === 'me_start';
}

function isResultEvent(value: unknown): boolean {
  const event = safeString(value);
  return event === 'song_result' || event === 'me_result' || event === 'song_end';
}

function safeString(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function numberOr(value: unknown, fallback: number): number {
  const n = nullableNumber(value);
  return n ?? fallback;
}
