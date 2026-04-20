# Cadence PRD — Targeted Updates

Updates based on Q&A with Nam, Ngan, and Mai. Paste each section into the corresponding location in the Confluence doc.

---

## Section 9 — Player Performance Measurement

### ➕ Add new subsection: "Auto-Derived Metrics (Do Not Fire Manually)"

> **Auto-Derived Metrics (Do Not Fire Manually)**
>
> Several metrics are computed internally by the `SessionAnalyzer` and `FlowDetector` from the 6 core signals. Do NOT try to record these as signals — Cadence derives them automatically.
>
> | Metric | Derived From | Computed By |
> |---|---|---|
> | `InterMoveInterval` (min/max/avg/variance) | `move.executed` timestamps | FlowDetector Tempo Window |
> | `tempo.session_duration` | `BeginSession` / `EndSession` timing | SessionAnalyzer |
> | `strategy.booster_total` | Sum of `strategy.powerup` signals | SessionAnalyzer |
> | `MoveEfficiency` | `move.optimal` / `move.executed` count | SessionAnalyzer |
> | `WasteRatio` | `move.waste` sum / `move.executed` count | SessionAnalyzer |
> | `PauseCount` | `tempo.pause` signal count | SessionAnalyzer |
>
> **Rule of thumb:** Fire the 6 core signals (`move.executed`, `move.optimal`, `move.waste`, `progress.delta`, `tempo.pause`, `input.rejected`). Everything else is computed from them.

---

## Section 10 — DDA Event Catalog

### ✏️ Update `song_start` — clarify BeginSession parameters

Under the `song_start` event, add this note:

> **Note on `BeginSession()` `levelParameters`:**
>
> The `Dictionary<string, float>` passed to `BeginSession()` should contain **level design parameters that define difficulty** — NOT all analytics fields from `song_start`.
>
> **Required keys:**
> - Design levers (game-specific, e.g., `blocking_offset`, `max_selectable`, `active_launchers`)
> - `difficulty_score` (0-100)
> - `par_moves`
> - `attempt` (from `song_start.attempt`)
>
> Other `song_start` analytics fields (`song_id`, `graphic_id`, `level_id` string, etc.) are for the analytics pipeline — not for Cadence. `levelId` is passed as the first argument to `BeginSession()`, not inside the dictionary.
>
> **Example (Juicy Blast):**
> ```csharp
> _dda.BeginSession(levelId, new Dictionary<string, float>
> {
>     { "blocking_offset", level.BlockingOffset },
>     { "max_selectable", level.MaxSelectableItems },
>     { "active_launchers", level.ActiveLauncherCount },
>     { "difficulty_score", level.DifficultyScore },
>     { "par_moves", level.ParMoves },
>     { "attempt", attemptNumber },
> }, LevelType.Level);
> ```
>
> Pass the **same keys** to `GetProposal()` for the next level. Cadence returns `ParameterDelta` entries for whichever keys its rules want to adjust.

### ✏️ Update `strategy.booster_total` — mark as derived

Replace the existing row with:

> **`strategy.booster_total`** — ⚠️ **DERIVED METRIC — do not record manually.**
>
> Auto-computed by the `SessionAnalyzer` from `strategy.powerup` signals. Fire `SignalKeys.PowerUpUsed` (= `strategy.powerup`) once per booster use; Cadence sums them at `EndSession()`.

### ✏️ Update `song_end` — clarify when it fires and `perfect_percentage` definition

Add a note under the `song_end` event:

> **Note on `song_end` timing:**
>
> `song_end` was originally specified as a fallback for abandoned sessions (when `song_result` never fires). However, if the game fires `song_end` on every session boundary (win, lose, AND abandon), the mapping works identically — the fallback path just always runs.
>
> **`perfect_percentage` definition:**
>
> A session-level quality score, conceptually opposite to `waste_value`.
>
> ```
> perfect_percentage = (count of perfect moves / total moves) × 100
> ```
>
> A "perfect move" is game-specific. A practical definition using existing signals: count moves where `move.optimal >= 0.9`.
>
> **Comparison:**
>
> | Signal | Formula | Range | Meaning |
> |---|---|---|---|
> | `move.waste` | wasted / total | 0.0-1.0 | higher = worse |
> | `perfect_percentage` | perfect / total × 100 | 0-100 | higher = better |
>
> They are correlated but not strict opposites (a non-wasted move isn't necessarily "perfect").
>
> **Mapping to `input.accuracy`:**
>
> ```csharp
> float perfectPct = perfectMoves / (float)totalMoves; // 0.0-1.0
> _dda.RecordSignal(SignalKeys.InputAccuracy, perfectPct, SignalTier.RawInput);
> ```
>
> Fire once per session on `song_end`. Feeds the FlowDetector's Engagement Window and provides a reliable quality signal even for partial sessions where per-move `move.optimal` data is sparse.

### ➕ Add subsection: "Mini-Events (`me_start` / `me_result`)"

> **Mini-Events (`me_start` / `me_result`)**
>
> Mini-events use the **same `BeginSession()` / `EndSession()` API** as regular levels, with `LevelType.MiniEvent` instead of `LevelType.Level`. Cadence weights mini-events differently in the skill model.
>
> ```csharp
> // Mini-event start
> _dda.BeginSession(meLevelId, meParameters, LevelType.MiniEvent);
>
> // Mini-event end
> _dda.EndSession(won ? SessionOutcome.Win : SessionOutcome.Lose);
> ```
>
> Pass mini-event design parameters in the `meParameters` dictionary following the same convention as regular levels.

---

## Section 13 — Adjustment Engine

### ➕ Add subsection: "Variant Selection Mapping"

After the Rule Evaluation Pipeline description, add:

> **Variant Selection Mapping (Game-Side)**
>
> Cadence outputs an `AdjustmentProposal` containing `ParameterDelta` entries. Games that use pre-built level variants (e.g., Juicy Blast with variants 2-8, base = 5) should translate the delta magnitude into variant steps:
>
> | Delta % | Variant Steps |
> |---|---|
> | < 5% | 1 step |
> | 5% – 10% | 2 steps |
> | > 10% | max steps (capped at variant bounds) |
>
> **Rationale:** Stepping one variant at a time risks a frustrated player churning before the system lands them at the right difficulty. Cadence's Cooldown Rule (60s global, 120s per-parameter) naturally prevents oscillation, so aggressive step sizes are safe.
>
> **Configurable:** The step thresholds (5%, 10%) should be exposed as tunable config values, not hardcoded. See Section 16.

### ➕ Add subsection: "Confidence Gate Policy"

> **Confidence Gate Policy**
>
> There is no blanket minimum confidence threshold across all rules, by design:
>
> | Rule | Confidence Behavior |
> |---|---|
> | **Flow Channel Rule** | Built-in 5-session gate (`Profile.SessionsCompleted >= 5`) |
> | **Frustration Relief Rule** | **No gate** — fires from session 1 (retention risk is highest early) |
> | **Streak Damper Rule** | **Capped at 1 step when `confidence < 0.4`** (early session streaks are noisy) |
> | **Cooldown Rule** | No confidence logic (filters by time only) |
>
> **Rationale:** During sessions 1-4, only Frustration Relief and Streak Damper are active. This creates an intentional "reactive-only" window at the start — we respond to observed distress but don't predictively target the flow channel until we have enough data.

### ✏️ Update Frustration Relief Rule — add timing toggle

Under the Frustration Relief Rule pseudocode, add:

> **Timing Configuration:**
>
> The Frustration Relief Rule supports two timing modes:
>
> - `BeforeNextLevel` — fires from `SessionSummary` after `EndSession()`
> - `MidSession` — fires from real-time `FlowReading` during gameplay
>
> Games can disable `MidSession` via the `allowMidSession` config flag in `FrustrationReliefConfig`. When disabled, the rule only evaluates on session end and always returns `BeforeNextLevel` timing.
>
> **Default:** `allowMidSession = true`. Games focused on between-session adjustment (e.g., Juicy Blast launch config) should set this to `false`.

---

## Section 15 — Integration Guide

### ✏️ Update Phase 1: Minimal Integration — add concrete example

Replace the generic `OnLevelStart` example with a concrete game example:

> ```csharp
> // Example: Juicy Blast level start
> public void OnLevelStart(JuicyBlastLevel level, int attemptNumber)
> {
>     _dda.BeginSession(level.LevelId, new Dictionary<string, float>
>     {
>         { "blocking_offset", level.BlockingOffset },
>         { "max_selectable", level.MaxSelectableItems },
>         { "active_launchers", level.ActiveLauncherCount },
>         { "difficulty_score", level.DifficultyScore },
>         { "par_moves", level.ParMoves },
>         { "attempt", attemptNumber },
>     }, LevelType.Level);
> }
> ```

### ➕ Add subsection: "Common Pitfalls" (at end of Phase 2)

> **Common Pitfalls**
>
> - ❌ Don't try to record `InterMoveInterval` manually — just fire `MoveExecuted` and Cadence computes intervals from timestamps.
> - ❌ Don't record `strategy.booster_total` — it's auto-derived from `strategy.powerup` signals.
> - ❌ Don't fire `tempo.session_duration` — it's derived from `BeginSession` / `EndSession` timing.
> - ❌ Don't pass all `song_start` analytics fields to `BeginSession()` — only pass level design parameters (see Section 10).
> - ✅ Fire the 6 core signals and let Cadence aggregate everything else.

---

## Section 16 — Configuration Reference

### ➕ Add subsection: "Tunable Parameters"

> **Tunable Parameters**
>
> These weights and thresholds are exposed as configurable values (ScriptableObject fields) so designers can tune them without code changes:
>
> **Variant Selection:**
> - `variantStepThresholds: [0.05, 0.10]` — delta % breakpoints for step mapping
> - `variantMaxStep` — cap on variant jumps
>
> **Flow Channel Rule:**
> - `targetWinRateMin: 0.30`
> - `targetWinRateMax: 0.70`
> - `minSessionsBeforeActive: 5`
>
> **Streak Damper Rule:**
> - `lossStreakThreshold: 3`
> - `winStreakThreshold: 5`
> - `lowConfidenceThreshold: 0.4` — cap step to 1 below this
> - `lowConfidenceStepCap: 1`
>
> **Frustration Relief Rule:**
> - `frustrationThreshold: 0.7`
> - `easeMinPercent: 0.05`
> - `easeMaxPercent: 0.15`
> - `allowMidSession: true` — set to `false` to force `BeforeNextLevel` timing only
>
> **Cooldown Rule:**
> - `globalCooldownSeconds: 60`
> - `perParameterCooldownSeconds: 120`
>
> **Adjustment Engine:**
> - `maxDeltaPercent: 0.15` — max 15% change per adjustment
>
> **Production Tuning:**
>
> For live-ops tuning without builds, games can add a JSON override that loads from `StreamingAssets` at runtime. Designers edit a Google Sheet, export to JSON, and drop the file in. Cadence reads the JSON on startup and overrides the ScriptableObject defaults.

---

## Summary of Changes

| Section | Change Type | Topic |
|---|---|---|
| 9 | ➕ Add | Auto-derived metrics subsection |
| 10 | ✏️ Update | `song_start` → `BeginSession` param clarification |
| 10 | ✏️ Update | `strategy.booster_total` marked as derived |
| 10 | ✏️ Update | `song_end` timing + `perfect_percentage` definition |
| 10 | ➕ Add | Mini-events (`me_start` / `me_result`) subsection |
| 13 | ➕ Add | Variant selection mapping |
| 13 | ➕ Add | Confidence gate policy |
| 13 | ✏️ Update | Frustration Relief timing toggle |
| 15 | ✏️ Update | Phase 1 concrete Juicy Blast example |
| 15 | ➕ Add | Common Pitfalls subsection |
| 16 | ➕ Add | Tunable Parameters subsection |
