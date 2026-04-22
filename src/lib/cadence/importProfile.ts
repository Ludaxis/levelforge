export type ImportKind =
  | 'aggregated_funnel'
  | 'raw_signal'
  | 'dda_output'
  | 'unknown';

export interface FieldCoverage {
  required: string[];
  present: string[];
  missing: string[];
}

export interface MissingFieldStat {
  field: string;
  missingRows: number;
  checkedRows: number;
}

export interface AggregatedFunnelRow {
  levelId: string;
  result: string;
  attempt: number | null;
  playType?: string;
  date?: string;
  userCount: number;
}

export interface DataQualityReport {
  rowCount: number;
  eventCounts: Record<string, number>;
  userCount: number;
  levelCount: number;
  sessionCount: number;
  completeSessions: number;
  sessionsMissingStart: number;
  sessionsMissingResult: number;
  moveIndexGapSessions: number;
  moveIndexDuplicateSessions: number;
  intervalOver30s: number;
  intervalOver60s: number;
  rawSignalRows: number;
  startRows: number;
  resultRows: number;
  missingRawSignalFields: MissingFieldStat[];
  missingDdaOutputFields: string[];
}

export interface ImportReadinessReport {
  kind: ImportKind;
  canRunReplay: boolean;
  canDrawBaselineSankey: boolean;
  canValidateDdaImpact: boolean;
  blockers: string[];
  warnings: string[];
  fieldCoverage: {
    raw: FieldCoverage;
    dda: FieldCoverage;
  };
  dataQuality: DataQualityReport;
  aggregatedFunnelRows: AggregatedFunnelRow[];
}

export interface ProfiledImport {
  columns: string[];
  rows: Array<Record<string, unknown>>;
  report: ImportReadinessReport;
}

const RAW_REQUIRED_COLUMNS = [
  'event_name',
  'event_timestamp',
  'user_id',
  'level_id',
  'attempt',
];

const RAW_SIGNAL_FIELDS = [
  'move_index',
  'is_optimal',
  'waste_value',
  'progress_delta',
  'move_interval_ms',
  'hesitation_ms',
  'input_rejected_count',
];

const DDA_OUTPUT_FIELDS = [
  'dda_enabled',
  'variant_default',
  'variant_served',
  'variant_delta',
  'dda_rule',
  'dda_confidence',
  'flow_state',
  'skill_score',
  'engagement_score',
  'frustration_score',
  'glicko_rating',
  'glicko_deviation',
  'win_rate_recent',
  'sessions_completed',
  'variant_played',
];

const DDA_IMPACT_REQUIRED_COLUMNS = [
  'event_timestamp',
  'user_id',
  'level_id',
  'attempt',
  'result',
  'dda_enabled',
  'variant_served',
  'variant_delta',
  'dda_rule',
  'flow_state',
];

const START_EVENTS = new Set(['song_start', 'me_start']);
const RESULT_EVENTS = new Set(['song_result', 'me_result', 'song_end']);

const COLUMN_ALIASES: Record<string, string> = {
  ep__level_id: 'level_id',
  ep__attempt: 'attempt',
  ep__result: 'result',
  song_play_type: 'play_type',
};

export function profileImportRows(
  rows: Array<Record<string, unknown>>,
  columns: string[]
): ProfiledImport {
  const normalizedRows = rows.map(normalizeRow);
  const normalizedColumns = normalizeColumns(columns, normalizedRows);
  const report = buildReadinessReport(normalizedRows, normalizedColumns);
  return { rows: normalizedRows, columns: normalizedColumns, report };
}

export function normalizeAttemptValue(value: unknown): unknown {
  if (value === null || value === undefined || value === '') return value;
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  if (!Number.isInteger(n)) return value;
  return n;
}

function normalizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row };
  for (const [from, to] of Object.entries(COLUMN_ALIASES)) {
    if (out[to] === undefined && out[from] !== undefined) out[to] = out[from];
  }
  if (out.play_type === undefined && out.source !== undefined) {
    out.play_type = out.source;
  }
  if (out.attempt !== undefined) out.attempt = normalizeAttemptValue(out.attempt);
  return out;
}

function normalizeColumns(
  columns: string[],
  rows: Array<Record<string, unknown>>
): string[] {
  const set = new Set<string>();
  for (const col of columns) {
    set.add(COLUMN_ALIASES[col] ?? col);
  }
  for (const row of rows) {
    for (const col of Object.keys(row)) set.add(col);
  }
  return Array.from(set);
}

function buildReadinessReport(
  rows: Array<Record<string, unknown>>,
  columns: string[]
): ImportReadinessReport {
  const columnSet = new Set(columns);
  const eventCounts = countEvents(rows);
  const dataQuality = buildDataQuality(rows, eventCounts);
  const rawCoverage = coverage(RAW_REQUIRED_COLUMNS, columnSet);
  const ddaCoverage = coverage(DDA_OUTPUT_FIELDS, columnSet);
  const impactCoverage = coverage(DDA_IMPACT_REQUIRED_COLUMNS, columnSet);
  const aggregatedFunnelRows = buildAggregatedFunnelRows(rows, columnSet);

  const hasAggregatedShape =
    columnSet.has('song_result_user_count') &&
    columnSet.has('level_id') &&
    columnSet.has('result');
  const hasRawShape = rawCoverage.missing.length === 0;
  const hasMoveEvents = (eventCounts.song_move ?? 0) > 0;
  const hasDdaOutputs =
    impactCoverage.missing.length === 0 &&
    (rows.some((r) => !isBlank(r.flow_state)) ||
      rows.some((r) => !isBlank(r.variant_served)));

  let kind: ImportKind = 'unknown';
  if (hasAggregatedShape && !hasRawShape) {
    kind = 'aggregated_funnel';
  } else if (hasRawShape && hasMoveEvents && hasDdaOutputs) {
    kind = 'dda_output';
  } else if (hasRawShape && hasMoveEvents) {
    kind = 'raw_signal';
  }

  const blockers: string[] = [];
  const warnings: string[] = [];
  if (kind === 'aggregated_funnel') {
    blockers.push(
      'This is an aggregated SAT metric export. It can show funnel summaries but cannot replay sessions or draw user journeys.'
    );
  }
  if (kind === 'unknown') {
    blockers.push(
      `Missing raw event structure: ${rawCoverage.missing.join(', ') || 'song_move rows'}.`
    );
  }
  if (hasRawShape && !hasMoveEvents) {
    blockers.push('No song_move rows found. Baseline flow replay needs per-move signals.');
  }
  if (dataQuality.sessionsMissingStart > 0) {
    warnings.push(`${dataQuality.sessionsMissingStart} session(s) are missing song_start/me_start.`);
  }
  if (dataQuality.sessionsMissingResult > 0) {
    warnings.push(`${dataQuality.sessionsMissingResult} session(s) are missing song_result/me_result/song_end.`);
  }
  if (dataQuality.moveIndexGapSessions > 0) {
    warnings.push(`${dataQuality.moveIndexGapSessions} session(s) have move_index gaps.`);
  }
  if (dataQuality.intervalOver60s > 0) {
    warnings.push(`${dataQuality.intervalOver60s} move interval(s) are over 60 seconds.`);
  }
  if (kind === 'raw_signal') {
    warnings.push(
      'DDA output fields are missing. This validates signal formula only, not DDA impact.'
    );
  }
  if (hasDdaOutputs) {
    const controlRows = rows.filter((r) => toNumber(r.dda_enabled) === 0);
    const treatmentRows = rows.filter((r) => toNumber(r.dda_enabled) === 1);
    if (controlRows.length === 0 || treatmentRows.length === 0) {
      warnings.push(
        'Cannot compare A/B cohorts: dda_enabled does not include both Control (0) and Treatment (1).'
      );
    }
  }

  const canRunReplay = kind === 'raw_signal' || kind === 'dda_output';
  const canDrawBaselineSankey = canRunReplay && dataQuality.completeSessions > 0;
  const canValidateDdaImpact = kind === 'dda_output' && impactCoverage.missing.length === 0;

  return {
    kind,
    canRunReplay,
    canDrawBaselineSankey,
    canValidateDdaImpact,
    blockers,
    warnings,
    fieldCoverage: {
      raw: rawCoverage,
      dda: ddaCoverage,
    },
    dataQuality,
    aggregatedFunnelRows,
  };
}

function coverage(required: string[], columnSet: Set<string>): FieldCoverage {
  const present = required.filter((f) => columnSet.has(f));
  const missing = required.filter((f) => !columnSet.has(f));
  return { required, present, missing };
}

function countEvents(rows: Array<Record<string, unknown>>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const event = safeString(row.event_name);
    if (!event) continue;
    counts[event] = (counts[event] ?? 0) + 1;
  }
  return counts;
}

function buildDataQuality(
  rows: Array<Record<string, unknown>>,
  eventCounts: Record<string, number>
): DataQualityReport {
  const users = new Set<string>();
  const levels = new Set<string>();
  const sessions = new Map<string, Array<Record<string, unknown>>>();
  const moveRows = rows.filter((r) => safeString(r.event_name) === 'song_move');

  for (const row of rows) {
    const user = safeString(row.user_id);
    const level = safeString(row.level_id);
    if (user) users.add(user);
    if (level) levels.add(level);
    if (!user && !level) continue;
    const key = sessionKey(row);
    if (!sessions.has(key)) sessions.set(key, []);
    sessions.get(key)!.push(row);
  }

  let completeSessions = 0;
  let sessionsMissingStart = 0;
  let sessionsMissingResult = 0;
  let moveIndexGapSessions = 0;
  let moveIndexDuplicateSessions = 0;

  for (const sessionRows of sessions.values()) {
    const hasStart = sessionRows.some((r) => START_EVENTS.has(safeString(r.event_name)));
    const hasResult = sessionRows.some((r) => RESULT_EVENTS.has(safeString(r.event_name)));
    if (hasStart && hasResult) completeSessions++;
    if (!hasStart) sessionsMissingStart++;
    if (!hasResult) sessionsMissingResult++;

    const moveIndexes = sessionRows
      .filter((r) => safeString(r.event_name) === 'song_move')
      .map((r) => toNumber(r.move_index))
      .filter((n): n is number => n !== null)
      .map((n) => Math.trunc(n));
    if (moveIndexes.length > 0) {
      const unique = Array.from(new Set(moveIndexes)).sort((a, b) => a - b);
      if (unique.length !== moveIndexes.length) moveIndexDuplicateSessions++;
      const max = unique.at(-1) ?? 0;
      const expected = Array.from({ length: max }, (_, i) => i + 1);
      if (unique[0] !== 1 || unique.length !== expected.length || unique.some((v, i) => v !== expected[i])) {
        moveIndexGapSessions++;
      }
    }
  }

  const intervalValues = moveRows
    .map((r) => toNumber(r.move_interval_ms))
    .filter((n): n is number => n !== null);

  return {
    rowCount: rows.length,
    eventCounts,
    userCount: users.size,
    levelCount: levels.size,
    sessionCount: sessions.size,
    completeSessions,
    sessionsMissingStart,
    sessionsMissingResult,
    moveIndexGapSessions,
    moveIndexDuplicateSessions,
    intervalOver30s: intervalValues.filter((v) => v > 30000).length,
    intervalOver60s: intervalValues.filter((v) => v > 60000).length,
    rawSignalRows: moveRows.length,
    startRows: (eventCounts.song_start ?? 0) + (eventCounts.me_start ?? 0),
    resultRows:
      (eventCounts.song_result ?? 0) +
      (eventCounts.me_result ?? 0) +
      (eventCounts.song_end ?? 0),
    missingRawSignalFields: missingFieldStats(moveRows, RAW_SIGNAL_FIELDS),
    missingDdaOutputFields: DDA_OUTPUT_FIELDS.filter((f) =>
      rows.every((r) => isBlank(r[f]))
    ),
  };
}

function missingFieldStats(
  rows: Array<Record<string, unknown>>,
  fields: string[]
): MissingFieldStat[] {
  return fields.map((field) => ({
    field,
    checkedRows: rows.length,
    missingRows: rows.filter((r) => isBlank(r[field])).length,
  }));
}

function buildAggregatedFunnelRows(
  rows: Array<Record<string, unknown>>,
  columnSet: Set<string>
): AggregatedFunnelRow[] {
  if (!columnSet.has('song_result_user_count')) return [];
  return rows
    .map((r) => ({
      levelId: safeString(r.level_id),
      result: safeString(r.result),
      attempt: toNumber(r.attempt),
      playType: safeString(r.play_type) || undefined,
      date: safeString(r.date_tzutc) || undefined,
      userCount: toNumber(r.song_result_user_count) ?? 0,
    }))
    .filter((r) => r.levelId && r.result);
}

function sessionKey(row: Record<string, unknown>): string {
  return [
    safeString(row.user_id) || 'unknown',
    safeString(row.level_id),
    String(normalizeAttemptValue(row.attempt ?? 1)),
  ].join('|');
}

function safeString(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v);
}

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function isBlank(v: unknown): boolean {
  return v === null || v === undefined || v === '';
}
