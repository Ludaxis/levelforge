/**
 * Synthetic Juicy Blast analytics data generator.
 *
 * Produces a flat row list that matches the NCJB Event Mastersheet v2
 * schema for the four event types the importer understands:
 *   song_start  — per session, carries level parameters + par_moves
 *   song_move   — per player move, carries per-move telemetry
 *   song_result — per session, carries outcome/progress/playtime/actual_moves
 *   song_booster_success — occasional booster uses
 *
 * Determinism is seeded (prando-style xmur3 → mulberry32) so the same
 * seed always yields the same rows — good for demos, replays, and
 * golden tests.
 *
 * Three archetypes drive session-level behavior:
 *   casual     : variable efficiency, frequent losses early, mid-game flow
 *   improver   : starts rough, climbs steadily → DDA should back off
 *   veteran    : high efficiency, fast tempo → likely to trigger boredom
 */

export interface SampleDataOptions {
  seed?: number;
  userCount?: number; // default 30
  sessionsPerUserMin?: number; // default 4
  sessionsPerUserMax?: number; // default 12
  levelCount?: number; // default 20
  startEpochMs?: number; // default 2026-03-01
  /** If true, simulate DDA being OFF (no improvement from level tuning). */
  forceControlCohort?: boolean;
  /** Tag rows with this cohort label on a `cohort` column. */
  cohortLabel?: string;
}

type Archetype = 'casual' | 'improver' | 'veteran';

function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

interface Rng {
  float(): number;
  int(min: number, max: number): number;
  pick<T>(arr: readonly T[]): T;
  bern(p: number): boolean;
}

function makeRng(seed: number): Rng {
  const r = mulberry32(seed);
  return {
    float: () => r(),
    int: (min, max) => Math.floor(r() * (max - min + 1)) + min,
    pick: (arr) => arr[Math.floor(r() * arr.length)],
    bern: (p) => r() < p,
  };
}

export function generateSampleJuicyBlastRows(
  opts: SampleDataOptions = {}
): Array<Record<string, unknown>> {
  const seed = opts.seed ?? xmur3('juicy-blast-sample-v1')();
  const rng = makeRng(seed);
  const userCount = opts.userCount ?? 30;
  const minSessions = opts.sessionsPerUserMin ?? 4;
  const maxSessions = opts.sessionsPerUserMax ?? 12;
  const levelCount = opts.levelCount ?? 20;
  const cohort = opts.cohortLabel ?? null;
  const startEpoch = opts.startEpochMs ?? Date.parse('2026-03-01T08:00:00Z');

  const rows: Array<Record<string, unknown>> = [];
  let clock = startEpoch;

  for (let u = 0; u < userCount; u++) {
    const userId = `u${String(u + 1).padStart(3, '0')}`;
    const archetype = pickArchetype(rng, u);
    const sessionCount = rng.int(minSessions, maxSessions);

    let currentLevel = 1;
    let currentVariant = 5;
    const attemptsByLevel: Record<number, number> = {};

    for (let s = 0; s < sessionCount; s++) {
      // Progress through levels, occasionally replaying on loss.
      const levelId = `L${currentLevel}`;
      attemptsByLevel[currentLevel] = (attemptsByLevel[currentLevel] ?? 0) + 1;
      const attempt = attemptsByLevel[currentLevel];

      // Design parameters (derived loosely from variant index).
      const blockingOffset = Math.max(0, Math.min(10, 3 + (currentVariant - 5) * 0.8));
      const maxSelectable = Math.max(6, Math.min(15, 12 - (currentVariant - 5) * 0.5));
      const activeLaunchers = Math.max(1, Math.min(3, 2 + (currentVariant >= 7 ? -1 : 0)));
      const colorVariantDensity = Math.min(100, 20 + (currentVariant - 5) * 12);
      const parMoves = 15 + currentLevel;

      // Simulate session outcome + scores from archetype + variant.
      const sess = simulateSession({
        rng,
        archetype,
        sessionIndex: s,
        variant: currentVariant,
        parMoves,
        dda: !opts.forceControlCohort,
      });

      const sessionStartMs = clock;
      const sessionEndMs = sessionStartMs + sess.totalDurationMs;

      // song_start row
      rows.push({
        event_name: 'song_start',
        event_timestamp: sessionStartMs,
        user_id: userId,
        level_id: levelId,
        attempt,
        par_moves: parMoves,
        play_type: attempt === 1 ? 'start' : 'restart',
        blocking_offset: blockingOffset,
        max_selectable: maxSelectable,
        active_launchers: activeLaunchers,
        color_variant_density: colorVariantDensity,
        level_variant: currentVariant,
        ...(cohort ? { cohort } : {}),
      });

      // song_move rows
      let moveClock = sessionStartMs + sess.firstMoveDelayMs;
      for (let m = 0; m < sess.moves.length; m++) {
        const mv = sess.moves[m];
        rows.push({
          event_name: 'song_move',
          event_timestamp: moveClock,
          user_id: userId,
          level_id: levelId,
          attempt,
          move_index: m + 1,
          is_optimal: mv.optimal ? 1 : 0,
          waste_value: mv.waste,
          progress_delta: mv.progressDelta,
          move_interval_ms: mv.intervalMs,
          hesitation_ms: mv.hesitationMs,
          input_rejected_count: mv.rejected,
          ...(cohort ? { cohort } : {}),
        });
        moveClock += mv.intervalMs;

        // Occasional booster during play.
        if (mv.usedBooster) {
          rows.push({
            event_name: 'song_booster_success',
            event_timestamp: moveClock,
            user_id: userId,
            level_id: levelId,
            attempt,
            booster_name: rng.pick(['hint', 'bomb', 'magnet']),
            booster_used: 1,
            ...(cohort ? { cohort } : {}),
          });
        }
      }

      // song_result row
      rows.push({
        event_name: 'song_result',
        event_timestamp: sessionEndMs,
        user_id: userId,
        level_id: levelId,
        attempt,
        result: sess.won ? 'win' : 'lose',
        progress: Math.round(sess.finalProgress * 100),
        playtime: sess.totalDurationMs / 1000,
        actual_moves: sess.moves.length,
        par_moves: parMoves,
        perfect_percentage: Math.round(sess.efficiency * 100),
        ...(cohort ? { cohort } : {}),
      });

      clock = sessionEndMs + rng.int(30_000, 30 * 60_000); // 30s–30min between sessions

      // Level / variant progression.
      if (sess.won) {
        currentLevel = Math.min(levelCount, currentLevel + 1);
        // With DDA on, variant drifts mildly toward player skill.
        if (!opts.forceControlCohort) {
          if (archetype === 'veteran') currentVariant = Math.min(8, currentVariant + 1);
          if (archetype === 'casual') currentVariant = Math.max(2, currentVariant - 1);
        }
      } else if (attempt >= 3 && !opts.forceControlCohort) {
        // Frustrated player: DDA eases.
        currentVariant = Math.max(2, currentVariant - 1);
      }
    }
  }

  return rows;
}

function pickArchetype(rng: Rng, userIndex: number): Archetype {
  // Deterministic but spread across archetypes.
  const roll = (userIndex * 37 + rng.int(0, 2)) % 3;
  if (roll === 0) return 'casual';
  if (roll === 1) return 'improver';
  return 'veteran';
}

interface SimulatedSession {
  won: boolean;
  moves: Array<{
    optimal: boolean;
    waste: number;
    progressDelta: number;
    intervalMs: number;
    hesitationMs: number;
    rejected: number;
    usedBooster: boolean;
  }>;
  firstMoveDelayMs: number;
  totalDurationMs: number;
  finalProgress: number;
  efficiency: number;
}

function simulateSession(args: {
  rng: Rng;
  archetype: Archetype;
  sessionIndex: number;
  variant: number;
  parMoves: number;
  dda: boolean;
}): SimulatedSession {
  const { rng, archetype, sessionIndex, variant, parMoves } = args;

  // Archetype-driven skill baseline.
  let skill =
    archetype === 'veteran'
      ? 0.85
      : archetype === 'improver'
        ? 0.3 + Math.min(0.5, sessionIndex * 0.05)
        : 0.5 + (rng.float() - 0.5) * 0.3;

  // Variant pressure: harder variants hurt skill proportionally.
  skill -= (variant - 5) * 0.04;
  skill = Math.max(0.05, Math.min(0.98, skill));

  const winProbability = skill;
  const won = rng.bern(winProbability);

  // Move count: winners near par, losers usually overshoot and fail.
  const moveCount = won
    ? Math.max(parMoves - 3, parMoves + rng.int(-2, 5))
    : rng.int(Math.floor(parMoves * 0.4), Math.floor(parMoves * 1.5));

  const moves: SimulatedSession['moves'] = [];
  let progressAccum = 0;
  let optimalMoves = 0;
  for (let i = 0; i < moveCount; i++) {
    const optimal = rng.bern(skill);
    if (optimal) optimalMoves++;
    const waste = optimal ? 0 : rng.float() * 0.8;
    const progressStep = optimal
      ? 1 / parMoves
      : Math.max(0, 0.4 / parMoves - waste * 0.2);
    progressAccum += progressStep;
    const baseInterval = archetype === 'veteran' ? 900 : archetype === 'casual' ? 1400 : 1200;
    const jitter = archetype === 'veteran' ? 0.1 : 0.35;
    const intervalMs = Math.max(300, baseInterval * (1 + (rng.float() - 0.5) * jitter * 2));
    moves.push({
      optimal,
      waste,
      progressDelta: Math.max(0, progressStep),
      intervalMs: Math.round(intervalMs),
      hesitationMs:
        !optimal && rng.bern(0.25)
          ? rng.int(600, 2500)
          : rng.bern(0.05)
            ? rng.int(400, 1200)
            : 0,
      rejected: rng.bern(0.05 + (1 - skill) * 0.15) ? 1 : 0,
      usedBooster: won && rng.bern(0.02) ? true : !won && rng.bern(0.08),
    });
  }
  const finalProgress = won ? 1 : Math.min(0.99, progressAccum);
  const efficiency = moveCount > 0 ? optimalMoves / moveCount : 0;
  const totalDurationMs = moves.reduce((s, m) => s + m.intervalMs + m.hesitationMs, 0);
  const firstMoveDelayMs = archetype === 'veteran' ? rng.int(800, 2500) : rng.int(2000, 7000);

  return {
    won,
    moves,
    firstMoveDelayMs,
    totalDurationMs: totalDurationMs + firstMoveDelayMs,
    finalProgress,
    efficiency,
  };
}

/**
 * Convenience: two cohorts for A/B demo — control has forceControlCohort=true.
 * Each cohort gets half the user count.
 */
export function generateSampleAbDataset(
  opts: SampleDataOptions = {}
): Array<Record<string, unknown>> {
  const userCount = opts.userCount ?? 60;
  const control = generateSampleJuicyBlastRows({
    ...opts,
    userCount: Math.floor(userCount / 2),
    forceControlCohort: true,
    cohortLabel: 'control',
    seed: (opts.seed ?? 1) * 7,
  });
  const variant = generateSampleJuicyBlastRows({
    ...opts,
    userCount: Math.ceil(userCount / 2),
    forceControlCohort: false,
    cohortLabel: 'variant',
    seed: (opts.seed ?? 1) * 11,
  });
  return [...control, ...variant];
}
