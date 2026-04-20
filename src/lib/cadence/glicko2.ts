import type { PlayerSkillProfile, SessionOutcome } from './types';

/**
 * Glicko-2 player rating system.
 *
 * Ported from Mark Glickman's specification:
 *   http://www.glicko.net/glicko/glicko2.pdf
 *
 * The Cadence SDK (GlickoPlayerModel.cs) implements these equations;
 * this port matches them within ε=1e-6 on transcendental paths.
 *
 * Conventions:
 *   - One session = one "game" in one rating period.
 *   - Opponent rating = level difficulty on the Glicko scale.
 *     (default 1500 / RD 200 when we have no level-difficulty signal).
 *   - Scores: win=1, loss=0, abandoned=0 with reduced weight handled by
 *     caller (e.g., skip or scale via the rule layer).
 */

const SCALE = 173.7178;
const RATING_BASE = 1500;

export interface Glicko2Params {
  /** volatility change rate; 0.3–1.2 typical, 0.5 is SDK default */
  tau: number;
  /** Newton-Raphson convergence tolerance */
  convergenceEpsilon: number;
}

export interface RatedGame {
  opponentRating: number;
  opponentDeviation: number;
  score: number; // 1 = win, 0 = loss, 0.5 = draw
}

export interface Glicko2Result {
  rating: number;
  deviation: number;
  volatility: number;
}

/**
 * Update a Glicko-2 rating given a batch of rated games (rating period).
 * Use one game per call in the Cadence flow (1 session = 1 period).
 */
export function updateGlicko2(
  current: { rating: number; deviation: number; volatility: number },
  games: RatedGame[],
  params: Glicko2Params
): Glicko2Result {
  if (games.length === 0) {
    // No games: only RD grows (time-decay handled separately via applyTimeDecay).
    return { ...current };
  }

  // Step 2: scale to Glicko-2 units
  const mu = (current.rating - RATING_BASE) / SCALE;
  const phi = current.deviation / SCALE;
  const sigma = current.volatility;

  // Step 3: compute v and Δ
  let sumForV = 0;
  let sumForDelta = 0;

  for (const game of games) {
    const muJ = (game.opponentRating - RATING_BASE) / SCALE;
    const phiJ = game.opponentDeviation / SCALE;
    const gPhiJ = gFn(phiJ);
    const eVal = eFn(mu, muJ, phiJ);
    sumForV += gPhiJ * gPhiJ * eVal * (1 - eVal);
    sumForDelta += gPhiJ * (game.score - eVal);
  }

  const v = 1 / sumForV;
  const delta = v * sumForDelta;

  // Step 5: determine new volatility via Illinois algorithm
  const sigmaPrime = solveVolatility(sigma, phi, v, delta, params);

  // Step 6: update φ*
  const phiStar = Math.sqrt(phi * phi + sigmaPrime * sigmaPrime);

  // Step 7: new φ' and μ'
  const phiPrime = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const muPrime = mu + phiPrime * phiPrime * sumForDelta;

  // Step 8: back to Glicko scale
  return {
    rating: SCALE * muPrime + RATING_BASE,
    deviation: SCALE * phiPrime,
    volatility: sigmaPrime,
  };
}

function gFn(phi: number): number {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
}

function eFn(mu: number, muJ: number, phiJ: number): number {
  return 1 / (1 + Math.exp(-gFn(phiJ) * (mu - muJ)));
}

function solveVolatility(
  sigma: number,
  phi: number,
  v: number,
  delta: number,
  params: Glicko2Params
): number {
  const a = Math.log(sigma * sigma);
  const tau = params.tau;
  const epsilon = params.convergenceEpsilon;

  const f = (x: number): number => {
    const ex = Math.exp(x);
    const phi2 = phi * phi;
    const denom = 2 * (phi2 + v + ex) * (phi2 + v + ex);
    return (ex * (delta * delta - phi2 - v - ex)) / denom - (x - a) / (tau * tau);
  };

  let A = a;
  let B: number;
  if (delta * delta > phi * phi + v) {
    B = Math.log(delta * delta - phi * phi - v);
  } else {
    let k = 1;
    while (f(a - k * tau) < 0) {
      k++;
      if (k > 1000) break; // safety
    }
    B = a - k * tau;
  }

  let fA = f(A);
  let fB = f(B);

  // Illinois algorithm
  let iter = 0;
  while (Math.abs(B - A) > epsilon) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      fA = fA / 2;
    }
    B = C;
    fB = fC;
    iter++;
    if (iter > 1000) break; // safety
  }

  return Math.exp(A / 2);
}

/**
 * Time-decay: returning player after N days of inactivity gets a
 * larger RD (matches SDK: +5 per day, capped at maxDeviation).
 */
export function applyTimeDecay(
  deviation: number,
  daysInactive: number,
  deviationDecayPerDay: number,
  maxDeviation: number
): number {
  if (daysInactive <= 0) return deviation;
  return Math.min(
    maxDeviation,
    deviation + deviationDecayPerDay * daysInactive
  );
}

/** Win-rate prediction: logistic over rating gap on the Glicko scale. */
export function predictWinRate(
  rating: number,
  opponentRating: number
): number {
  return 1 / (1 + Math.pow(10, -(rating - opponentRating) / 400));
}

/**
 * Convenience: one-shot update of a PlayerSkillProfile from a single
 * session outcome. Opponent rating = levelDifficulty or 1500 if absent.
 */
export function updateProfileFromSession(
  profile: PlayerSkillProfile,
  outcome: SessionOutcome,
  opts: {
    levelDifficulty?: number;
    levelDeviation?: number;
    tau: number;
    convergenceEpsilon: number;
    sessionEfficiency?: number;
    sessionTimestampUtcTicks?: number;
  }
): PlayerSkillProfile {
  if (outcome === 'abandoned') {
    // Abandoned sessions don't update rating — match SDK behavior.
    return profile;
  }
  const score = outcome === 'win' ? 1 : 0;
  const updated = updateGlicko2(
    {
      rating: profile.rating,
      deviation: profile.deviation,
      volatility: profile.volatility,
    },
    [
      {
        opponentRating: opts.levelDifficulty ?? RATING_BASE,
        opponentDeviation: opts.levelDeviation ?? 200,
        score,
      },
    ],
    { tau: opts.tau, convergenceEpsilon: opts.convergenceEpsilon }
  );

  const history = [
    ...profile.history,
    {
      sessionId: `session_${profile.sessionsCompleted + 1}`,
      outcome,
      efficiency: opts.sessionEfficiency ?? 0,
      timestampUtcTicks: opts.sessionTimestampUtcTicks ?? Date.now(),
      levelTypeByte: 0,
    },
  ];

  // Running averages — simple streaming update.
  const n = profile.sessionsCompleted + 1;
  const newAvgEfficiency =
    (profile.averageEfficiency * profile.sessionsCompleted +
      (opts.sessionEfficiency ?? 0)) /
    n;
  const newAvgOutcome =
    (profile.averageOutcome * profile.sessionsCompleted + score) / n;

  return {
    rating: updated.rating,
    deviation: updated.deviation,
    volatility: updated.volatility,
    sessionsCompleted: n,
    lastSessionUtcTicks: opts.sessionTimestampUtcTicks ?? Date.now(),
    averageEfficiency: newAvgEfficiency,
    averageOutcome: newAvgOutcome,
    history: history.slice(-20), // keep last 20 like the SDK default
  };
}

export function emptyProfile(opts: {
  rating: number;
  deviation: number;
  volatility: number;
}): PlayerSkillProfile {
  return {
    rating: opts.rating,
    deviation: opts.deviation,
    volatility: opts.volatility,
    sessionsCompleted: 0,
    lastSessionUtcTicks: 0,
    averageEfficiency: 0,
    averageOutcome: 0,
    history: [],
  };
}

/** Confidence metric used by the SDK's rule layer: 1 - (RD / 350). */
export function confidence01(deviation: number, maxDeviation = 350): number {
  return Math.max(0, Math.min(1, 1 - deviation / maxDeviation));
}
