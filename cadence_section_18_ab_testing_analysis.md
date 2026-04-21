# 18. A/B Testing & Post-Launch Analysis

## 18.1 Cohort Design

| Variant | SDK | Signals | Flow Classification | Variant Adjustment |
|---|---|---|---|---|
| **A — Control** | ON | ON | ON | **OFF** |
| **B — Treatment** | ON | ON | ON | **ON** |

In Control, the SDK runs end-to-end but the variant-translation step is suppressed (`maxDeltaPerAdjustment = 0`, or a remote flag blocks it). `flow_state`, `skill_score`, and related scores are still computed and logged. Disabling the SDK in Control would strip these fields and collapse the analysis to aggregate retention only — the design here preserves within-cohort segmentation so users can be compared by skill bracket and flow state in both variants.

Split: 50/50 by `user_id % 2` at first install, sticky across sessions. Minimum cohort: 1,000 installs per variant before retention reads.

## 18.2 Event Prerequisites

Signal events (per-move telemetry driving the flow and skill computation) are assumed live from earlier releases. The analysis flow below enriches **existing events** with the following fields rather than adding parallel ones.

**On `song_start`**: `dda_enabled`, `variant_default`, `variant_served`, `dda_rule`, `dda_confidence`, `par_moves`, plus the design levers exposed to the adjustment engine.

**On `song_result`**: `attempt`, `dda_applied`, `flow_state`, `skill_score`, `engagement_score`, `frustration_score`, `glicko_rating`, `glicko_deviation`, `sessions_completed`.

Any prerequisite field missing in > 5% of sessions is treated as a release blocker.

## 18.3 Two-Tier Framework

Analysis runs at two tiers in parallel post-launch:

- **Tier 1 — Aggregate.** Analytics platform's native A/B analyzer and level-funnel export. Compares retention (D1/D3/D7/D14), level completion rate, and session length between cohorts. Does not require Section 18.2 fields. Answers *"does DDA move the headline?"*
- **Tier 2 — Deep-dive.** LevelForge `/analysis` plus cohort-level segmentation from the `song_result` fields. Answers *"why did DDA help, for whom, and which rule drove it?"* Requires all Section 18.2 prerequisites.

## 18.4 Phased Loop

| Phase | Tier | Scope | Cadence |
|---|---|---|---|
| **P-1 — Pre-launch validation** | — | Replay historical signal events through LevelForge `/analysis`. Confirm flow states, Glicko convergence, and rule-engine behaviour on real data before Treatment rolls out. | Once, before launch |
| **P0 — Event integrity** | 1+2 | Null/coverage spot check on every prerequisite field | Day 1 post-release, weekly |
| **P1 — Baseline distribution** | 2 | Control-only: flow state % per level, skill-score histogram, frustration histogram, Glicko spread | End of week 1 |
| **P2 — Flow-state validity** | 2 | Replay Control signals through LevelForge `/analysis` → transition matrix; tune thresholds against the red flags below | Weekly, weeks 1–4 |
| **P3 — Journey visualization** | 2 | LevelForge per-user timeline, flow-transition matrix, and Sankey view across the Control cohort | Weekly, weeks 1–4 |
| **P4 — Treatment impact** | 1+2 | Tier 1: retention + level completion via analytics platform. Tier 2: frustration-segment retention + per-rule attribution via LevelForge. Both at 95% confidence. | Weekly, weeks 2–4 |
| **P5 — Lock or iterate** | — | Promote Treatment to 100% on positive retention delta; otherwise iterate thresholds and re-enter P2 | Week 4 checkpoint |

### P2 — Red Flags

- \> 85% of sessions classified as Flow → thresholds too loose
- < 30% of sessions classified as Flow → thresholds too tight
- Boredom ↔ Frustration transitions > 5% → formula too noisy
- Per-user state switch rate > 70% → reacting to signal noise

### P4 — Per-Rule Attribution

Using `dda_rule` on `song_start`:

- **Flow Channel Rule** — did win rate stay in the 30–70% band more often in Treatment?
- **Frustration Relief Rule** — did D1 churn drop at high-frustration levels?
- **Streak Damper** — did 5+ win streaks and 3+ loss streaks become rarer?
- **Cooldown Rule** — zero-oscillation invariant: no parameter adjusted twice within 60s (reject if violated)

## 18.5 Tooling

- **LevelForge `/analysis`** — browser-based replay of the Cadence pipeline against raw event exports. CSV/JSON in, same five-stage pipeline as the SDK. Surfaces per-user timelines, flow-transition matrices, Sankey journeys, and live What-If threshold tuning with pipeline re-run. Used for P-1, P1–P3, and P4 deep-dives.
- **Analytics platform** — primary source for P0 integrity and Tier 1 aggregate metrics. Native A/B analyzer + level-funnel export. Cohort splits via `dda_enabled`.

## 18.6 Open Questions

1. Lock the first game's P5 (threshold lock) before starting the next game's P-1, or run in parallel?
2. Lock threshold bar — any positive retention delta at 95% confidence, or a hard floor (e.g. D7 ≥ +2pp)?
3. Does the analytics platform's query range cover the full 4-week P4 window?
4. When thresholds lock, where do they live — remote config key, SDK defaults, or both?
