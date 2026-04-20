import type { GameAdapter } from './adapters/types';
import type {
  SessionOutcome,
  SessionRow,
  SignalEntry,
  SignalTier,
} from './types';

/**
 * Group raw SAT-export rows (one row per analytics event) into sessions.
 *
 * Conventions assumed (overridable via adapter in future):
 * - Each raw row has an `event_name` column identifying song_start /
 *   song_move / song_result / song_end / me_start / me_result.
 * - Session identity = tuple of adapter.sessionKeyColumns
 *   (typically user_id, level_id, attempt).
 * - song_start carries level design parameters + par_moves.
 * - song_move carries per-move telemetry (one row per player move).
 * - song_result or song_end carries outcome, total playtime, actual_moves.
 *
 * Rows whose event_name is not recognized are ignored quietly —
 * the importer's schema validator warns upstream.
 */

const EVENT_COL = 'event_name';
const TIMESTAMP_COL = 'event_timestamp';
const RESULT_COL = 'result';
const PLAYTIME_COL = 'playtime';

interface GroupingResult {
  sessions: SessionRow[];
  warnings: string[];
}

export function groupRowsIntoSessions(
  rawRows: Array<Record<string, unknown>>,
  adapter: GameAdapter
): GroupingResult {
  const warnings: string[] = [];
  const buckets = new Map<string, Array<Record<string, unknown>>>();

  for (const row of rawRows) {
    const key = adapter.sessionKeyColumns
      .map((col) => safeString(row[col]))
      .join('|');
    if (!key || key === adapter.sessionKeyColumns.map(() => '').join('|')) {
      continue;
    }
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(row);
  }

  const sessions: SessionRow[] = [];

  for (const [, rows] of buckets) {
    rows.sort((a, b) => {
      const ta = numericOr(a[TIMESTAMP_COL], 0);
      const tb = numericOr(b[TIMESTAMP_COL], 0);
      if (ta !== tb) return ta - tb;
      // Fallback to move_index for stable ordering within the same timestamp bucket.
      return numericOr(a['move_index'], 0) - numericOr(b['move_index'], 0);
    });

    const firstRow = rows[0];
    const userId = safeString(firstRow['user_id']);
    const levelId = safeString(firstRow['level_id']);
    const attempt = numericOr(firstRow['attempt'], 1);

    const sessionId = `${userId || 'unknown'}|${levelId}|${attempt}`;

    const startRow = rows.find(
      (r) =>
        r[EVENT_COL] === 'song_start' ||
        r[EVENT_COL] === 'me_start'
    );
    const endRow = rows.find(
      (r) =>
        r[EVENT_COL] === 'song_result' ||
        r[EVENT_COL] === 'me_result' ||
        r[EVENT_COL] === 'song_end'
    );

    const levelParameters = extractLevelParameters(startRow, adapter);
    const outcome = determineOutcome(endRow);

    const startedAtUtc = numericOr(startRow?.[TIMESTAMP_COL], 0);
    const endedAtUtc = numericOr(endRow?.[TIMESTAMP_COL], startedAtUtc);

    const signals: SignalEntry[] = [];
    let moveCounter = 0;
    let sessionTimeAnchor = startedAtUtc;
    if (!sessionTimeAnchor && rows.length > 0) {
      sessionTimeAnchor = numericOr(rows[0][TIMESTAMP_COL], 0);
    }

    for (const row of rows) {
      const eventName = safeString(row[EVENT_COL]);
      const isMoveEvent = eventName === 'song_move' || eventName === '';
      if (!isMoveEvent && eventName !== 'song_booster_success' && eventName !== 'song_booster_click' && eventName !== 'song_revive_click' && eventName !== 'song_revive_success') {
        // Non-signal-bearing event row (start, result, me_*). Skip.
        continue;
      }

      const rowMoveIndex = numericOr(row['move_index'], moveCounter + 1);
      if (eventName === 'song_move') moveCounter = Math.max(moveCounter, rowMoveIndex);

      const rowTime = numericOr(row[TIMESTAMP_COL], sessionTimeAnchor);
      const sessionTime = Math.max(0, (rowTime - sessionTimeAnchor) / 1000);

      for (const [col, mapping] of Object.entries(adapter.signalColumnMapping)) {
        const raw = row[col];
        if (raw === undefined || raw === null || raw === '') continue;
        const transformed = mapping.transform ? mapping.transform(raw) : Number(raw);
        if (!Number.isFinite(transformed)) continue;
        signals.push({
          key: mapping.cadenceKey,
          value: transformed,
          tier: mapping.tier as SignalTier,
          moveIndex: rowMoveIndex,
          sessionTime,
          frameNumber: 0,
        });
      }

      // Inactivity / pause signals from non-move events that matter for FlowDetector.
      if (eventName === 'song_booster_click') {
        signals.push({
          key: 'strategy.powerup_attempt',
          value: 1,
          tier: 2,
          moveIndex: rowMoveIndex,
          sessionTime,
          frameNumber: 0,
        });
      }
    }

    sessions.push({
      userId: userId || 'unknown',
      sessionId,
      levelId,
      levelVariant: numericOrUndefined(firstRow['level_variant']),
      attempt,
      signals,
      levelParameters,
      outcome,
      startedAtUtc,
      endedAtUtc,
    });
  }

  if (rawRows.length > 0 && sessions.length === 0) {
    warnings.push(
      `No sessions detected. Check that your export has columns: ${adapter.sessionKeyColumns.join(', ')}.`
    );
  }

  sessions.sort((a, b) => a.startedAtUtc - b.startedAtUtc);
  return { sessions, warnings };
}

function extractLevelParameters(
  startRow: Record<string, unknown> | undefined,
  adapter: GameAdapter
): Record<string, number> {
  const out: Record<string, number> = {};
  if (!startRow) return out;
  for (const lever of adapter.designLevers) {
    const raw = startRow[lever.key];
    if (raw === undefined || raw === null || raw === '') continue;
    const n = Number(raw);
    if (Number.isFinite(n)) out[lever.key] = n;
  }
  // par_moves is a universal design constant, carried on song_start.
  const par = Number(startRow['par_moves']);
  if (Number.isFinite(par)) out['par_moves'] = par;
  return out;
}

function determineOutcome(
  endRow: Record<string, unknown> | undefined
): SessionOutcome {
  if (!endRow) return 'abandoned';
  const result = safeString(endRow[RESULT_COL]).toLowerCase();
  if (result === 'win' || result === 'won' || result === '1') return 'win';
  if (result === 'lose' || result === 'lost' || result === '0') return 'lose';
  const eventName = safeString(endRow[EVENT_COL]);
  if (eventName === 'song_end' && !result) return 'abandoned';
  // Fallback: if the event has a non-zero playtime but no explicit result, treat as lose.
  const playtime = numericOr(endRow[PLAYTIME_COL], 0);
  return playtime > 0 ? 'lose' : 'abandoned';
}

function safeString(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v);
}

function numericOr(v: unknown, fallback: number): number {
  if (v === null || v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function numericOrUndefined(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
