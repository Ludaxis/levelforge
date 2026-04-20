# LevelForge /analysis — Cadence DDA Replay & Analysis Module

**Status:** Draft v0.1
**Author:** Reza (with Claude Code)
**Date:** 2026-04-20
**Anchors:** Cadence PRD v1.1 (2026-03-02), NCJB Event Mastersheet v2 (2026-04-20), Mai/Reza weekly 2026-04-20

---

## 1. Why this module exists

Juicy Blast's next release turns on the Cadence DDA SDK behind an A/B test. Today we can only read aggregate KPIs from SAT (retention, completion rate, ARPDAU). We cannot:

- Replay a real user's session through the Cadence pipeline step-by-step to see *why* a variant was chosen.
- Answer "does the SDK behave correctly on field data?" before the release actually ships.
- Segment users by detected flow state or skill bracket during post-release analysis.
- Iterate on thresholds (win-rate band, frustration trigger, variant step %) without a Unity build.
- Onboard future Cadence-enabled games without repeating all of the above.

`/analysis` is a **client-side replay & counterfactual inspector** that runs a deterministic TypeScript port of the Cadence pipeline against production signal exports. It is the reference implementation both A/B test groups are validated against.

## 2. Non-goals

- Not a production event pipeline (no Supabase writes, no server jobs).
- Not a full analytics dashboard (SAT already does that; we link out).
- Not an ML model or auto-tuner (the PRD explicitly rules ML out; this module stays rule-faithful).
- Not a Unity editor integration (the engineering team validates inside Unity; designers validate here).
- Not shipping multi-user collaboration (v1 is single-user, file in / file out).

## 3. Users and jobs-to-be-done

| User | Job |
|---|---|
| Reza (game designer / lead) | "Tweak PRD thresholds on real data, see how variant selection would change, convince PM/data team a rollout is safe." |
| Mai (data analyst) | "Segment A/B users by detected flow state and skill bracket post-release; validate signal quality." |
| Mohammad (engineer) | "Confirm the shipped SDK produces the same adjustment as LevelForge on a fixed trace. Debug SDK regressions." |
| Future game leads | "Plug in their game via an adapter and reuse the whole pipeline." |

## 4. A/B test design (agreed with Mai, 2026-04-20)

- **Control:** SDK on, adjustment OFF. Needed so segmentation events keep flowing.
- **Variant:** SDK on, full DDA adjustment.
- **Why not SDK-off control:** Without the SDK running, we lose flow-state and skill-score segmentation — we can only compare aggregate KPIs. Rejected.

`/analysis` must render both cohorts side-by-side with stratification by skill bracket (Simpson's-paradox firewall).

## 5. Scope (MVP → nice-to-have)

### MVP (ship first)

1. **Data import**
   - Drag-and-drop CSV or JSON export from SAT.
   - Schema detection + validation against the adapter for the selected game (Juicy Blast).
   - Warnings when required columns are missing or values are out of range.
   - Up to ~500k signal rows without main-thread jank.

2. **Pipeline inspector (Dagster-style)**
   - Horizontal step strip: **Parse → Group by session → SessionAnalyzer → FlowDetector → Glicko-2 update → AdjustmentEngine (6 rules) → Variant mapping**.
   - Each step shows rows in / rows out + a confidence pill.
   - Click a step → right-side drawer with:
     - Config applied at that step.
     - Sample of 10 rows before / after.
     - Per-step mini-chart (histogram, pie, or timeline as appropriate).

3. **What-if sliders**
   - All PRD tunables exposed (win-rate band, frustration threshold, streak thresholds, cooldowns, variant step thresholds, hysteresis, EMA alpha, etc.).
   - "Reload from PRD defaults" and "Load production config" buttons.
   - Live re-run on slider change (debounced).

4. **Per-user timeline view**
   - Pick a user → full session history.
   - Show for each session: detected flow state, Glicko rating/deviation/volatility, variant served, rule fired, win/lose.
   - Useful for designer sanity checks and bug triage.

5. **Cohort compare (A/B)**
   - Side-by-side control vs variant.
   - Hero metric (completion rate delta + 95% CI).
   - Stratified by skill bracket (new / mid / veteran).
   - Explicit minimum-n guard ("segments < 1000 users are advisory").

6. **Sankey: flow-state transitions**
   - Nodes = flow states (Unknown / Flow / Boredom / Anxiety / Frustration).
   - Links = user transitions between sessions, weighted by count.
   - Separate Sankeys for control vs variant to visualize DDA's intended effect.

### V1.1 (after MVP lands)

- **Counterfactual replay:** run the same trace against a second config and diff the two outputs (per-user, per-session).
- **Saved runs:** persist imported file + config in localStorage so you can reopen without re-uploading.
- **Export validated subset:** CSV of the segmentation columns ready to paste back into SAT.

### Future / nice-to-have

- Multi-game tabs (when a second adapter ships).
- Shared run links (move to Supabase).
- Designer-authored custom rules (matches PRD extension point `IAdjustmentRule`).

## 6. Architecture

```
src/
  app/
    analysis/
      page.tsx                   ← server component wrapper
      layout.tsx                 ← optional, for /analysis-scoped chrome
  components/
    analysis/
      DataImporter.tsx           ← drag-drop + schema validate
      PipelineStrip.tsx          ← Dagster-style horizontal step cards
      StepInspectorDrawer.tsx    ← per-step detail panel
      WhatIfPanel.tsx            ← PRD threshold sliders
      UserTimeline.tsx           ← per-user session chronology
      CohortCompare.tsx          ← A/B hero + stratification table
      FlowSankey.tsx             ← d3-sankey inside visx
  lib/
    cadence/
      types.ts                   ← Signal, SessionSummary, FlowReading, Proposal, Config
      signalCollector.ts         ← ring buffer + batch log
      sessionAnalyzer.ts         ← aggregation + derived scores
      flowDetector.ts            ← 3 windows + EMA + hysteresis
      glicko2.ts                 ← Glickman's spec, ported line by line
      rules/
        flowChannel.ts
        streakDamper.ts
        frustrationRelief.ts
        newPlayer.ts             ← NOTE: in SDK, not in PRD v1.1
        sessionFatigue.ts        ← NOTE: in SDK, not in PRD v1.1
        cooldown.ts
      adjustmentEngine.ts        ← orchestrates the 6 rules + clamps
      variantMapper.ts           ← adapter-provided δ% → step mapping
      pipeline.ts                ← run(signals, config, adapter) → PipelineResult
    cadence/adapters/
      index.ts                   ← adapter registry
      juicyBlast.ts              ← first adapter
      types.ts                   ← GameAdapter interface
    duckdb/
      client.ts                  ← DuckDB-WASM init + COOP/COEP check
      queries.ts                 ← SQL helpers over imported data
  lib/__tests__/cadence/
    glicko2.test.ts              ← against Glickman reference values
    pipeline.golden.test.ts      ← against Unity-exported fixtures
    rules/*.test.ts              ← per-rule unit tests
    fixtures/
      juicy_blast_50_sessions.json
      expected_proposals.json
```

## 7. Game-agnostic adapter contract

```ts
// src/lib/cadence/adapters/types.ts
export interface GameAdapter {
  id: string;                                // "juicy_blast"
  displayName: string;

  // Design levers that the pipeline can propose deltas on.
  designLevers: Array<{
    key: string;                             // "blocking_offset"
    label: string;
    range: [number, number];                 // [0, 10]
    direction: "higher_harder" | "lower_harder";
  }>;

  // Variant system (games without variants can omit).
  variants?: {
    min: number;                             // 2
    base: number;                            // 5
    max: number;                             // 8
    stepThresholds: [number, number];        // [0.05, 0.10]
    maxJumpStep: number;                     // 3
  };

  // How SAT-export columns map to Cadence signal keys.
  signalColumnMapping: Record<string, {
    cadenceKey: string;                      // e.g. "move.executed"
    tier: 0 | 1 | 2 | 3 | 4;
    transform?: (raw: unknown) => number;    // optional (e.g. ms → s)
  }>;

  // Columns that carry session identity.
  sessionKeyColumns: string[];               // ["user_id", "level_id", "attempt"]

  // Which events carry DDA output (for validation against live SDK).
  ddaOutputEventName?: string;               // e.g. "song_result" with DDA extension
}
```

Juicy Blast is adapter #1. Future games (Fruit Match, Hex Block, Square Block, etc.) register by adding a file under `src/lib/cadence/adapters/` and exporting from `index.ts`.

## 8. Pipeline fidelity policy

- **Source of truth:** the actual Cadence SDK source at `Library/PackageCache/com.ludaxis.cadence@…/Runtime/`, not the PRD. The PRD lags the SDK (e.g., SDK ships 6 rules, PRD documents 4).
- **Determinism:** seeded RNG via `prando`; float ε-tolerance 1e-6 for transcendental paths (Glicko-2's `exp`/`log`/`pow`).
- **Golden fixtures:** exported from a Unity Editor test run on juicy-blast covering:
  - 50 sessions across all flow states.
  - Each rule firing at least twice.
  - Cooldown hit at least once.
  - Time-decay case (returning player).
- **Drift detection:** CI test fails if any TS output diverges from fixture by > ε. On SDK upgrade, re-export fixtures and review diffs explicitly.

## 9. Events owed back to juicy-blast (discovered in Phase 0)

Before the A/B release:

1. **`level_streak_update`** — in PRD, absent from every mastersheet tab. StreakDamperRule cannot function without it.
2. **`song_undo`** — in PRD, absent from mastersheet. Juicy Blast has no undo UI (confirmed in code), so this is schema-only for future games. Skip in juicy-blast.
3. ~~Wire Tier 2 signals~~ **Already wired.** `RecordBoosterAttempt()` is called from `PlayState.Analytics.cs:93` (inside `LogBoosterClick` chokepoint); `RecordBoosterUsed()` is called from `PlayState.GameplayView.cs:554` (inside `UseBooster` chokepoint). Earlier audit was stale. If Tier 2 signals look empty in telemetry, the bug is downstream (SDK `IsAvailable` gate, session state, or sink config) — investigate separately.
4. **Clarify v2 mastersheet with Mai:** confirm the new DDA extension events (event IDs 14–17 on the DDA tab) are the canonical carrier for post-session segmentation so LevelForge imports them directly.

## 10. What-if defaults (from actual SDK, not PRD)

These are the production defaults our TS port must match:

| Config | PRD value | SDK value | Notes |
|---|---|---|---|
| CadenceStartLevel | (not in PRD) | **6** | DDA disabled for levels < 6 |
| DefaultVariant | (not in PRD) | **5** | Base variant |
| VariantCap | 2–8 | 2–8 | Match |
| MaxJumpStep | ≈3 (capped) | **3** | Match |
| Step thresholds | 5% / 10% | 5% / 10% | Match |
| TargetWinRate | 30–70% | 30–70% | Match |
| MinSessionsBeforeActive | 5 | 5 | Match |
| Win/Loss streak | 5 / 3 | 5 / 3 | Match |
| FrustrationThreshold | 0.7 | 0.7 | Match |
| Global cooldown | 60s | 60s | Match |
| Per-parameter cooldown | 120s | 120s | Match |
| MaxDeltaPerAdjustment | 15% | 15% | Match |
| **Number of rules** | **4** | **6** | **Add NewPlayer + SessionFatigue** |

## 11. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Float parity between C# and V8 | Fixture-based ε-tolerance, not strict equality; isolate transcendentals. |
| Mastersheet drift during implementation | Snapshot v2 as fixture; flag any field the importer sees that wasn't in the snapshot. |
| 500k rows freeze the browser | PapaParse worker + DuckDB-WASM; stream into Arrow table, never build JS arrays. |
| Designer can't interpret results | Sankey for flow transitions + hero metric with CI; never show a DAG without labels. |
| SDK upgrade invalidates TS port | CI golden tests fail loud; PR template requires re-exporting fixtures. |

## 12. Success criteria

- Reza can import a real SAT export, replay it, and change a slider in < 500ms to see the variant-selection delta.
- Mohammad can produce a fixture in Unity + run it here and show < 1e-6 divergence on all proposals.
- Mai can pull the A/B cohort compare view and screenshot it into Slack without additional editing.
- A new game can register an adapter and reuse the pipeline with **zero changes** to `src/lib/cadence/`.

## 13. Open questions

1. Do we want Phase 2c fixture export to be a Unity EditMode test, or a standalone CLI tool? (EditMode test is cleaner; CLI is easier to run in CI.)
2. Should `/analysis` live behind the existing optional Supabase auth, or be fully anonymous? (Leaning anonymous for v1.)
3. Do we snapshot the v2 mastersheet into the repo, or treat it as external input? (Snapshot, versioned, with a diff tool.)

---

*End of PRD. Proceed to Phase 2 execution on approval.*
