# Cadence DDA — A/B Test Plan

Short, game-agnostic. Use as a template; fill in the bracketed values per game.

---

## 1. Hypothesis

Enabling Cadence's difficulty adjustment improves retention and engagement for players who would otherwise churn on hard levels, without harming players who are already in flow.

**Primary KPI:** D3 and D7 retention, Treatment vs Control.
**Guardrail:** no negative delta on D1 retention or session length.

---

## 2. Cohort Design

| Variant | SDK | Signals | Flow Classification | Variant Adjustment |
|---|---|---|---|---|
| **A — Control** | ON | ON | ON | **OFF** |
| **B — Treatment** | ON | ON | ON | **ON** |

Both cohorts emit the full analytics payload. Control suppresses only the variant-translation step (`maxDeltaPerAdjustment = 0` or a remote flag). This keeps within-cohort segmentation by skill and flow state possible in both variants, which is what enables deep-dive analysis.

Split: **50/50** by `user_id % 2` at first install. Sticky across sessions. Bucket at install time, not per session.

---

## 3. Sample Size & Duration

- **Minimum:** 1,000 installs per variant before any retention read.
- **Target duration:** 4 weeks minimum from the point both cohorts cross the 1,000 threshold.
- **Extend if:** weekly Treatment-vs-Control delta is noisy (confidence interval crosses zero) at week 4.

---

## 4. Metrics

### Primary (decision metrics)
- D1, D3, D7, D14 retention
- Level completion rate per level across the DDA-active band
- Average attempts per level

### Secondary (diagnostic)
- Session length and sessions per day
- Frustration-segment retention (users with `frustration_score > 0.7` on early sessions)
- Per-rule attribution using `dda_rule`:
  - Flow Channel — win rate holds inside the 30–70% band
  - Frustration Relief — D1 churn at high-frustration levels
  - Streak Damper — incidence of long win / loss streaks
  - Cooldown — zero adjustments within the cooldown window

### Guardrails (hard stops)
- D1 retention negative at 95% confidence → partial rollback
- Any cooldown-window violation → immediate rollback, fix, relaunch
- Monetization metrics (ARPDAU, IAP conversion) neutral-or-better

---

## 5. Decision Rules

Evaluated at the week-4 checkpoint, then weekly.

| Outcome | Action |
|---|---|
| Positive D3 + D7 at 95% confidence, no guardrail breach | Lock thresholds, expand Treatment to 100% |
| Neutral / inside noise | Hold split, iterate thresholds, extend 2 weeks, re-evaluate |
| Negative on any primary metric | Roll Treatment to 0%, root-cause via per-rule attribution |
| Guardrail breach | Immediate rollback regardless of other metrics |

---

## 6. Pre-Launch Checklist

- [ ] All Section 18.2 prerequisite fields shipping and populated ≥ 95%
- [ ] Both cohorts emit segmentation payload (verified by null-check query)
- [ ] `dda_enabled` flag reliably identifies the cohort on every event
- [ ] Remote-config keys exist for thresholds and for the on/off kill switch
- [ ] Baseline distributions captured from the last pre-DDA release (P1 inputs)
- [ ] Pre-launch pipeline validation (P-1) complete on historical signal data
- [ ] Analytics platform A/B analyzer confirmed working with `dda_enabled` as the group dimension
- [ ] Rollback path tested — can flip Treatment to 0% via remote config within 30 minutes

---

## 7. Launch & Monitoring Cadence

**Day 0 — Launch.** Push Treatment build. Confirm both cohorts receive traffic.

**Day 1 — Event integrity.** Spot-check 50 sessions per cohort. All prerequisite fields ≥ 95% populated. If not, pause reads until fixed.

**Week 1 — Baseline + formula sanity.**
- Capture Control baseline distributions (flow state %, skill, frustration, Glicko spread).
- Replay Control signals and validate the flow-state transition matrix against red flags.

**Weeks 2–4 — Weekly impact read.**
- Aggregate comparison on primary metrics
- Per-rule attribution on secondary metrics
- Report every Monday, flag any metric moving the wrong way immediately

**Week 4 — Lock decision.** Apply the Section 5 decision rules.

---

## 8. Roles

Fill in per game before launch:

| Area | Owner |
|---|---|
| Cohort assignment + remote config | |
| Event instrumentation QA (Day 1) | |
| Baseline + formula validity | |
| Weekly impact read | |
| Lock / rollback decision | |
| Product sign-off | |

---

## 9. Open Calls (decide before launch)

1. Threshold for the "lock" decision — any positive retention delta at 95%, or a hard floor (e.g. D7 ≥ +2pp)?
2. If Treatment is neutral at week 4, how many iteration cycles are budgeted before the test is closed inconclusive?
3. Where do locked thresholds live — remote config only, or also baked into SDK defaults for the next release?
4. Does the first locked formula carry to the next game verbatim, or is a fresh P-1 + P1 required per game?
