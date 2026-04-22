# Cadence Analysis Flow

A short, generic guide for how to analyze DDA impact after a release. Tool-agnostic.

---

## Before launch

**1. Validate the pipeline on historical data.**
Take signal events from a previous release. Replay them through the same formula the SDK will run. Confirm flow states, skill scores, and rule outputs look reasonable. If the formula misclassifies known-good players, fix before shipping.

---

## After launch

**2. Day 1 — Check events.**
Spot-check 50 sessions per cohort. Every required field should be populated in ≥ 95% of rows. If anything is null, treat it as a release blocker.

**3. Week 1 — Capture the baseline.**
On Control cohort only, measure the reference distributions:
- Flow state percentage per level
- Skill score histogram
- Frustration score histogram
- Skill rating spread

These are the numbers every later comparison is measured against.

**4. Weeks 1–4 — Check the formula is sane.**
Look at how players move between flow states session to session. Red flags:
- Almost everyone classified the same way → thresholds too loose or tight
- Large jumps between distant states (boredom ↔ frustration) → formula too noisy
- Players flipping state every session → reacting to noise, not signal

Tune thresholds until the pattern is stable across two consecutive weeks.

**5. Weeks 2–4 — Compare Treatment vs Control.**

Two levels of comparison run in parallel:

*Aggregate:* retention (D1/D3/D7/D14), level completion rate, average attempts to pass, session length. Answers *"does DDA help overall?"*

*Deep-dive:* segment users by flow state or skill bracket inside each cohort and compare the same segments across cohorts. Answers *"who is DDA helping, and which rule is driving it?"* Particularly: does Treatment retain frustrated users better than Control?

Require 95% confidence and minimum 1,000 installs per variant before reading.

**6. Week 4 — Decide.**

- Positive retention delta + stable formula → lock thresholds, expand Treatment to 100%.
- Neutral → keep split, iterate thresholds, repeat from step 4.
- Negative → roll Treatment back, investigate which rule regressed using per-rule attribution.

---

## Invariants to hold at every phase

- Control and Treatment both emit the full analytics payload. If Control can't be segmented, the comparison is meaningless.
- No parameter should adjust twice within the cooldown window. Any oscillation is a bug, roll back.
- Record thresholds in remote config so they can be changed without a client release.
- Keep baseline distributions frozen — compare against them, don't overwrite them.

---

## When to escalate

- Formula unstable after 4 weeks of threshold tuning → the rules themselves may need revision, not just the numbers.
- Negative retention for two consecutive weeks → partial or full rollback, root-cause before relaunch.
- Deep-dive shows DDA is helping one segment but hurting another → per-segment rule tuning, not a global threshold change.
