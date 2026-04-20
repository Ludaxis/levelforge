# LevelForge /analysis — Usage Guide

The `/analysis` route is a **client-side** replay tool for the Cadence DDA
pipeline. It ingests raw analytics rows (SAT export, BigQuery dump, or the
built-in sample generator), runs the same Glicko-2 + flow-detection +
adjustment-rule pipeline that ships in the Unity SDK, and surfaces the
per-session decisions so designers can *see* what the pipeline would have
done to their players.

Nothing leaves the browser. No server upload, no DB writes. Drop a file,
run, tune sliders, re-run.

---

## 1. Opening the tool

Start the dev server and visit the Analysis entry in the app shell:

```
npm run dev
# open http://localhost:3000/analysis
```

You'll see four regions:

1. **Adapter selector** — picks the game adapter (currently Juicy Blast).
   Determines which columns are expected and which design levers the
   variant mapper can turn.
2. **Data importer** — drop zone + sample-data shortcuts.
3. **Results** — overview, pipeline strip, step inspector, per-user
   timeline, flow-transition matrix.
4. **What-If tuning** — live-editable Cadence config with save/load.

---

## 2. Getting data in

### Option A: SAT / BigQuery export (real data)

Export the four NCJB Event Mastersheet v2 events for the user cohort you
want to replay:

- `song_start` — one row per session, carries level parameters + `par_moves`
- `song_move` — one row per player move, carries telemetry
- `song_result` — one row per session, carries outcome / playtime / actual_moves
- `song_booster_success` — optional, one row per booster use

Required columns (Juicy Blast adapter):

| Column | Source event | Purpose |
|---|---|---|
| `event_name` | all | dispatches the row into start/move/result |
| `event_timestamp` | all | orders rows within a session (ms epoch) |
| `user_id`, `level_id`, `attempt` | all | session key |
| `par_moves` | `song_start` | baseline for move efficiency |
| `blocking_offset`, `max_selectable`, `active_launchers`, `color_variant_density` | `song_start` | design levers the variant mapper reads/writes |
| `level_variant` | `song_start` | starting variant index |
| `is_optimal`, `waste_value`, `progress_delta`, `move_interval_ms`, `hesitation_ms`, `input_rejected_count` | `song_move` | per-move signals feeding FlowDetector |
| `result`, `progress`, `playtime`, `actual_moves`, `perfect_percentage` | `song_result` | session outcome + summary |

CSV and JSON are both fine. Drop the file onto the importer, or click
*Choose file*. The importer will warn if session-key columns are missing.

### Option B: Sample data (no export needed)

Click **Load sample data** or **Load A/B sample** in the importer:

- **Load sample data** — 30 synthetic users across 3 archetypes (casual,
  improver, veteran), seeded and deterministic. Good for a single-cohort
  demo.
- **Load A/B sample** — 60 users split 50/50 into a `cohort=control` half
  (DDA off) and a `cohort=variant` half (DDA on). Use this to demo
  variant-vs-control comparisons.

The generator lives at `src/lib/cadence/sampleData.ts` and is pure
deterministic TS — same seed, same rows, every time.

---

## 3. Running the pipeline

Click **Run Pipeline**. The pipeline runs client-side in ~100–500ms for
the default sample; real exports of ~10k rows finish in under a second on
a laptop.

What runs, in order:

1. **parse** — schema sniff (column presence, type coercion)
2. **group_sessions** — bucket rows by `(user_id, level_id, attempt)`
3. **session_analyze** — derive summary (efficiency, waste, pauses, …)
4. **flow_detect** — EMA + hysteresis over per-move signals → FlowReading
5. **glicko_update** — apply Glicko-2 update using the session's outcome
6. **rule_eval** — six adjustment rules vote on `{ease, harden, hold}`
7. **variant_map** — translate the winning proposal into `level_variant`
   deltas and concrete design-lever changes

Each step is clickable in the **Pipeline strip** to see row counts,
duration, and a sample payload.

---

## 4. Reading the result views

- **Results overview** — session count, win rate, proposal mix (how
  often the pipeline wanted to ease / harden / hold).
- **Per-user timeline** — pick any user, see every session they played
  with flow state, efficiency, Glicko rating delta, variant before/after,
  and the proposal reason. This is the ground truth for "what would
  Cadence have done to this player?"
- **Flow-state transitions** — session-to-session state matrix per user,
  plus first-session and last-session histograms. Diagonals = stable
  states; off-diagonals = where players moved between flow / boredom /
  anxiety / frustration.

---

## 5. What-If tuning

The **What-If Tuning** card exposes live sliders over the
`adjustmentEngine` and `flowDetector` sections of the Cadence config.
Changes don't re-run the pipeline automatically — hit **Run Pipeline**
again to see the effect.

### Save / Load config

- **Save** — downloads the current config as
  `cadence-config-YYYY-MM-DD.json`.
- **Load** — imports a previously saved JSON. Missing keys fall back to
  defaults, so you can save a partial snippet and merge it into the
  baseline. Invalid JSON or missing required sections
  (`playerModel`, `flowDetector`, `adjustmentEngine`) shows a red error.
- **Defaults** — restores the production-matching config shipped in
  `src/lib/cadence/defaultConfig.ts`.

Typical workflow:

1. Load the sample dataset, run once with defaults.
2. Tune sliders (e.g. lower `targetWinRateMax` to 0.55).
3. Re-run, compare the proposal mix and variant deltas in the timeline.
4. **Save** the config if the outcome looks better than defaults.
5. Paste the JSON into a Jira ticket for the Unity team to A/B test
   in-client.

---

## 6. Troubleshooting

- **"No sessions detected"** — your export is missing one of
  `user_id`, `level_id`, `attempt`. The adapter warning banner will
  tell you which column is missing.
- **Every session is `outcome=abandoned`** — the importer couldn't find a
  `song_result` / `me_result` / `song_end` row per session. Check that
  result rows are in the same export.
- **Flow state is always `unknown`** — move events have no signals the
  adapter recognises. Verify that at least `is_optimal` and
  `move_interval_ms` are present on `song_move` rows.
- **Variant stays flat across the timeline** — the pipeline works as
  intended: you're probably hitting `minSessionsBeforeActive` (default 5)
  or `lowConfidenceThreshold`. Drop both in the What-If panel to see the
  engine engage sooner.

---

## 7. What this is *not*

- **Not authoritative.** The client-side port is byte-faithful to the
  Unity SDK v1.1 within `ε=1e-6` on transcendental paths, but the
  production numbers are whatever the game client computes. Use this to
  *reason* about tuning, then A/B test in-client.
- **Not a dashboard.** There's no auto-refresh, no backend, no history.
  Each page load is a blank slate.
- **Not game-specific.** The adapter layer (`src/lib/cadence/adapters/`)
  is the only Juicy Blast–specific code. Adding another game means
  adding another adapter, not forking the pipeline.
