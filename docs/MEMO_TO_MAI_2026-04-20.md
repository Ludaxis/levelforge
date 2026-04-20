# Memo — DDA event coverage for the Juicy Blast A/B test

**To:** Mai
**From:** Reza
**Date:** 2026-04-20
**Re:** Weekly catch-up today — DDA result/segmentation events

Mai — good call today on the A/B design. A few findings after I went through the mastersheet and the SDK package in detail. Short version: most of what you flagged is already solved in v2, but there are two real gaps worth adding before the release.

## TL;DR

1. **Control vs variant design is right.** SDK on + adjustment OFF for control, SDK on + full DDA for variant. I'll keep it that way. Lucy's "SDK off" idea is out because it kills segmentation events, as you said.
2. **The result/segmentation events you wanted already exist in v2 of the mastersheet.** `flow_state`, `skill_score`, `glicko_rating`, `variant_served`, `variant_delta`, etc. They're on the DDA tab as extensions to `song_start` and `song_result`, plus a new `dda_adjustment` event. v1 did not have them — I think that's the version you were looking at.
3. **Two events in the PRD are missing from every tab of v2:** `level_streak_update` and `song_undo`. We need these before release or two of the DDA rules can't fire correctly.
4. **One existing event group is fired in code but never reaches Cadence:** booster click/success. I've put the engineering fix into Phase 2.
5. **I'm building an analysis tool in LevelForge** (new `/analysis` section) that replays signal exports from SAT through a TypeScript port of the Cadence pipeline so we can both deep-dive per user without waiting on SDK rebuilds.

## 1. v2 DDA tab — what's actually there

When I pulled `NCJB_Event_Mastersheet_v2.xlsx` today (updated 11:01), the DDA tab has 7 events across 41 rows. The 4 base signal events (`song_start`, `song_result`, `song_move`, `song_first_move`) are what we had before. The new ones are the segmentation payload you asked for:

- **`song_start` DDA extension** — adds `dda_enabled`, `dda_active_for_level`, `variant_default`, `variant_served`, `variant_delta`, `dda_rule`, `dda_confidence`. This fires *before* the level, so we know what the SDK decided.
- **`song_result` DDA extension** — adds `flow_state`, `skill_score`, `engagement_score`, `frustration_score`, `glicko_rating`, `glicko_deviation`, `win_rate_recent`, `sessions_completed`, `dda_enabled`, `variant_played`. This fires on the result screen. Everything you need for per-user segmentation is here.
- **`me_start` / `me_result` DDA extension** — the same extension fields applied to the ≥15s dedup channels.
- **`dda_adjustment`** — brand-new event. Fires between levels. Carries `from_level_id`, `to_level_id`, `rule_fired`, `variant_before`, `variant_after`, `delta_pct`, `trigger_reason`, `cooldown_remaining_s`. This is what lets you chart "when did Frustration Relief fire for this user?" etc.

So on the segmentation side we're in good shape. Flagging this so we don't end up specifying duplicate events.

## 2. Real gaps I want to add

Two PRD events are absent from v2 entirely:

| Event | Why we need it |
|---|---|
| `level_streak_update` | StreakDamperRule needs it. Without it, the rule can't detect "player just broke a 5-win streak" or "player is on their 3rd loss." We lose one of four rules the SDK evaluates. |
| `song_undo` | PRD defines Tier 2 `strategy.undo` and `strategy.undo_streak`. In juicy-blast we probably don't have an undo button — if true, we skip with a comment. But the event should exist in the schema so future games inherit it. |

Can we add both to v3 of the mastersheet before release? I'll open a ticket on my side and tag you to confirm parameter types.

## 3. Engineering-side check

I first thought Tier 2 booster signals weren't hooked up. After a deeper code audit today they are — `RecordBoosterAttempt()` fires from the `LogBoosterClick` chokepoint and `RecordBoosterUsed()` fires from the `UseBooster` chokepoint. Both booster UI entry points (free/coin and from-stock) route through these, so every `song_booster_click` and `song_booster_success` analytic is paired with a Cadence signal.

If Tier 2 still looks empty on dashboards we should look downstream — SDK session-active gate, sink config, or a telemetry drop — not at missing hooks in gameplay code.

## 4. Shared analysis tool — the new thing

To answer the "how do we analyze the effectiveness of DDA" question you raised, I'm adding a new section to LevelForge (`/analysis`) that:

- Takes a CSV/JSON export from SAT (any user cohort, any date range).
- Replays every session through a faithful TypeScript port of the Cadence pipeline (the same 6 rules the SDK uses — the PRD documents only 4; two more are in the actual package).
- Shows the pipeline step-by-step: signals → session summary → flow state → Glicko rating → which rule fired → variant chosen.
- Lets us move sliders on the thresholds (win-rate band, frustration trigger, variant step %) and see how outputs change on real data.
- Renders per-user timelines, Sankey of flow-state transitions, and A/B cohort compare with stratification by skill bracket (Simpson's-paradox guard).
- Deterministic, client-side only, no backend. Golden-tested against fixtures exported from Unity so we know the TS port matches the shipped SDK within 1e-6.

That means post-release we can:
- Pick any user ID, see exactly what DDA did and why.
- Re-run the same trace with a different config ("what if win-rate band was 25–75?") to plan future tuning.
- Validate segmentation coverage before you dig into SAT.

Will share a walkthrough as soon as the MVP lands.

## 5. Things to confirm with you

1. **v3 mastersheet timing** — can we fit `level_streak_update` + `song_undo` before Juicy Blast next release?
2. **DDA extension ownership** — are the v2 extension events (rows 14–17 on DDA tab) final, or still draft? The analysis tool will parse them as the canonical source.
3. **`dda_adjustment` event firing** — is it fired from Unity or derived from other events? If derived, I don't need to wait for the game build; I can derive it in LevelForge.
4. **Minimum cohort sizes** — what's your rule of thumb for the smallest skill bracket × variant cell you'd trust? I'm defaulting to n≥1000 with a warning pill otherwise; tell me if you'd rather see a different floor.

Ping me in Slack with anything; I'll have the MVP of `/analysis` ready to show within the week.

— Reza
