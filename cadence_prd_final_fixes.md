# Cadence PRD — Final Fixes

Four targeted fixes to apply in Confluence. Each fix tells you exactly where to go and what to paste.

---

## Fix 1: Move "13. Adjustment Engine" heading up

**Problem:** The rule content (Rule Evaluation Pipeline, Confidence Gate Policy, Rule Details, Variant Selection Mapping) currently appears between Section 12 and the "13. Adjustment Engine" heading — so it visually belongs to Section 12 (Player Skill Model).

**Fix:** This is a structural move, not a text paste. In Confluence:

1. Find the `13. Adjustment Engine` heading in the doc (currently sitting above "Adjustment Proposal Output")
2. Cut it
3. Paste it immediately after Section 12 ends, so it sits **above** "Rule Evaluation Pipeline"

Correct final structure:

    12. Player Skill Model (Glicko-2)
        Win Rate Prediction
        (Glicko-2 content ends here)

    13. Adjustment Engine                        ← HEADING GOES HERE
        Rule Evaluation Pipeline
        Confidence Gate Policy
        Rule Details
            Flow Channel Rule
            Streak Damper Rule
            Frustration Relief Rule
            Cooldown Rule
        Variant Selection Mapping (Game-Side)
        Adjustment Proposal Output

    14. Public API Surface

---

## Fix 2: Re-add [NEW] tag to song_move header in Section 10

**Location:** Section 10, P0 — Session Lifecycle subsection, `song_move` header.

**Current:** `song_move`

**Replace with:** `song_move [NEW]`

Small consistency fix — other `[NEW]` events in the same section have the tag.

---

## Fix 3: Update Section 15 Phase 1 + add Common Pitfalls to Phase 2

### Fix 3a: Replace Phase 1 example

**Location:** Section 15, Phase 1: Minimal Integration subsection.

**Current code sample uses generic `"difficulty"` key.** Replace the entire `MyGameDDA` class example with this Juicy Blast version:

    using Cadence;
    using UnityEngine;
    using System.Collections.Generic;

    public class MyGameDDA : MonoBehaviour
    {
        [SerializeField] private DDAConfig _config;
        private IDDAService _dda;

        void Start()
        {
            _dda = new DDAService(_config);

            // Load saved profile
            string saved = PlayerPrefs.GetString("cadence_profile", "");
            if (!string.IsNullOrEmpty(saved))
                ((DDAService)_dda).LoadProfile(saved);
        }

        public void OnLevelStart(JuicyBlastLevel level, int attemptNumber)
        {
            _dda.BeginSession(level.LevelId, new Dictionary<string, float>
            {
                { "blocking_offset", level.BlockingOffset },
                { "max_selectable", level.MaxSelectableItems },
                { "active_launchers", level.ActiveLauncherCount },
                { "difficulty_score", level.DifficultyScore },
                { "par_moves", level.ParMoves },
                { "attempt", attemptNumber },
            }, LevelType.Level);
        }

        void Update()
        {
            if (_dda.IsSessionActive)
                _dda.Tick(Time.deltaTime);
        }

        public void OnLevelEnd(bool won)
        {
            _dda.EndSession(won ? SessionOutcome.Win : SessionOutcome.Lose);

            // Save profile
            PlayerPrefs.SetString("cadence_profile", ((DDAService)_dda).SaveProfile());
        }

        public JuicyBlastLevel GetNextLevel(JuicyBlastLevel currentLevel)
        {
            var proposal = _dda.GetProposal(new Dictionary<string, float>
            {
                { "blocking_offset", currentLevel.BlockingOffset },
                { "max_selectable", currentLevel.MaxSelectableItems },
                { "active_launchers", currentLevel.ActiveLauncherCount },
                { "difficulty_score", currentLevel.DifficultyScore },
                { "par_moves", currentLevel.ParMoves },
            }, LevelType.Level);

            // Translate proposal deltas into a variant selection
            // See Section 13 (Variant Selection Mapping) for full implementation
            return SelectVariant(currentLevel, proposal);
        }
    }

### Fix 3b: Add Common Pitfalls at end of Phase 2

**Location:** Section 15, at the end of "Phase 2: Add In-Session Signals" subsection (after the booster/pause code sample, before Phase 3 begins).

**Paste this new subsection:**

Common Pitfalls

Do not try to record `InterMoveInterval` manually — Cadence auto-derives it from `MoveExecuted` timestamps.

Do not record `strategy.booster_total` — it is auto-derived from `strategy.powerup` signals at session end.

Do not fire `tempo.session_duration` — it is derived from `BeginSession` / `EndSession` timing.

Do not pass all `song_start` analytics fields to `BeginSession()` — only pass level design parameters (see Section 10 for the full list).

Do fire the 6 core signals (`move.executed`, `move.optimal`, `move.waste`, `progress.delta`, `tempo.pause`, `input.rejected`) plus `strategy.powerup` on booster use. Everything else is computed from them.

---

## Fix 4: Update Section 16 AdjustmentEngineConfig table + align naming

### Fix 4a: Add 6 new fields to AdjustmentEngineConfig table

**Location:** Section 16, AdjustmentEngineConfig table (the last structural table in Section 16, just before Section 17 Glossary).

**Add these 6 new rows to the existing table.** Place them in the order shown below — group them near the related existing fields:

Add after `TargetWinRateMax`:

| Field | Type | Default | Purpose |
|---|---|---|---|
| MinSessionsBeforeActive | int | 5 | Flow Channel Rule activation gate — rule only fires after this many completed sessions |

Add after `WinStreakHardenAmount`:

| Field | Type | Default | Purpose |
|---|---|---|---|
| LowConfidenceThreshold | float | 0.4 | Below this Profile.Confidence01, Streak Damper caps output at LowConfidenceStepCap |
| LowConfidenceStepCap | int | 1 | Max variant steps allowed when confidence is below threshold |

Add after `FrustrationReliefThreshold`:

| Field | Type | Default | Purpose |
|---|---|---|---|
| EaseMinPercent | float | 0.05 | Minimum ease applied by Frustration Relief Rule (severity = 0) |
| EaseMaxPercent | float | 0.15 | Maximum ease applied by Frustration Relief Rule (severity = 1) |
| AllowMidSession | bool | true | When false, Frustration Relief Rule always returns BeforeNextLevel timing. Set to false for Juicy Blast launch config. |

### Fix 4b: Align naming between Tunable Parameters summary and AdjustmentEngineConfig table

**Location:** Section 16, "Tunable Parameters" summary at the top.

**Problem:** Two fields have different names in the summary vs the config table.

**Fix in the Tunable Parameters summary:**

Change `frustrationThreshold: 0.7` to `FrustrationReliefThreshold: 0.7`

Change `maxDeltaPercent: 0.15` to `MaxDeltaPerAdjustment: 0.15`

Also update the Streak Damper entries:

Change `lowConfidenceThreshold: 0.4` to `LowConfidenceThreshold: 0.4`

Change `lowConfidenceStepCap: 1` to `LowConfidenceStepCap: 1`

And the Flow Channel entry:

Change `minSessionsBeforeActive: 5` to `MinSessionsBeforeActive: 5`

And the Frustration Relief entries:

Change `easeMinPercent: 0.05` to `EaseMinPercent: 0.05`

Change `easeMaxPercent: 0.15` to `EaseMaxPercent: 0.15`

Change `allowMidSession: true` to `AllowMidSession: true`

And the Cooldown Rule entries:

Change `globalCooldownSeconds: 60` to `GlobalCooldownSeconds: 60`

Change `perParameterCooldownSeconds: 120` to `PerParameterCooldownSeconds: 120`

**Why:** Engineers and designers should see the exact same field names in both places — the summary and the structural config table. This is the actual ScriptableObject field name they will see in the Unity Inspector.

The `variantStepThresholds` and `variantMaxStep` entries under "Variant Selection" can stay lowercase because they are game-side (not part of Cadence's AdjustmentEngineConfig) — add a note next to them:

Variant Selection (game-side, not in AdjustmentEngineConfig):

- variantStepThresholds: [0.05, 0.10]
- variantMaxStep

---

## Priority order

1. **Fix 1 first** — this is the most visible structural issue and affects how readers navigate the doc
2. **Fix 4 second** — aligns the config reference so engineers and designers use the same vocabulary
3. **Fix 3 third** — completes the integration guide with concrete Juicy Blast example and pitfalls callout
4. **Fix 2 last** — trivial one-character header fix
