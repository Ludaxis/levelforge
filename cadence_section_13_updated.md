# 13. Adjustment Engine

## Rule Evaluation Pipeline

AdjustmentContext (Profile + Summary + Flow + Params)
→ Flow Channel Rule (Target: 30–70% win rate)
→ Streak Damper Rule (Break 3+ loss / 5+ win streaks)
→ Frustration Relief Rule (Ease on frustration > 0.7)
→ Cooldown Rule (Filter params on cooldown)
→ Delta Clamping (Max 15% per adjustment)
→ AdjustmentProposal (Parameter deltas + confidence + reason)

## Confidence Gate Policy

There is no blanket minimum confidence threshold across all rules, by design:

| Rule | Confidence Behavior |
|---|---|
| Flow Channel Rule | Built-in 5-session gate (Profile.SessionsCompleted >= 5) |
| Frustration Relief Rule | No gate — fires from session 1 (retention risk is highest early) |
| Streak Damper Rule | Capped at 1 step when confidence < 0.4 (early session streaks are noisy) |
| Cooldown Rule | No confidence logic (filters by time only) |

Rationale: During sessions 1–4, only Frustration Relief and Streak Damper are active. This creates an intentional "reactive-only" window at the start — we respond to observed distress but don't predictively target the flow channel until we have enough data.

## Rule Details

### Flow Channel Rule

Purpose: Maintain the target win rate band (default 30–70%).

    IF winRate < 30%:
        direction = EASIER
        magnitude = DifficultyAdjustmentCurve.Evaluate(0.3 - winRate)
    ELSE IF winRate > 70%:
        direction = HARDER
        magnitude = DifficultyAdjustmentCurve.Evaluate(winRate - 0.7)
    ELSE:
        no adjustment (player is in the flow channel)

    FOR EACH level parameter:
        delta = currentValue * magnitude * direction * 0.1

Activation: Only fires when Profile.SessionsCompleted >= 5 (need sufficient data for reliable win rate).

### Streak Damper Rule

Purpose: Prevent extended win/loss streaks that indicate the difficulty is stuck too high or too low.

    IF 3+ consecutive losses:
        ease by 10% + 2% per additional loss
    ELSE IF 5+ consecutive wins:
        harden by 5% + 1% per additional win

Low-confidence cap: When Profile.Confidence01 < 0.4, the variant-step output from this rule is capped at 1 step regardless of streak length. This prevents early-session noise from causing large jumps.

### Frustration Relief Rule

Purpose: Provide immediate relief when the player is overwhelmed.

    IF FrustrationScore > 0.7 (from SessionSummary or FlowReading):
        severity = (frustration - 0.7) / 0.3
        ease by Lerp(5%, 15%, severity)

        IF triggered by FlowReading AND config.allowMidSession == true:
            timing = MidSession (can act within current session)
        ELSE:
            timing = BeforeNextLevel

No confidence gate: This rule fires from session 1. Retention risk is highest early, so we don't wait for Glicko-2 confidence to build before reacting to frustration.

Timing configuration: The Frustration Relief Rule supports two timing modes:

- BeforeNextLevel — fires from SessionSummary after EndSession()
- MidSession — fires from real-time FlowReading during gameplay

Games can disable MidSession via the allowMidSession config flag in FrustrationReliefConfig. When disabled, the rule only evaluates on session end and always returns BeforeNextLevel timing.

Default: allowMidSession = true. Games focused on between-session adjustment (e.g., Juicy Blast launch config) should set this to false.

### Cooldown Rule

Purpose: Prevent parameter oscillation by enforcing minimum intervals between adjustments.

    IF time since last global adjustment < 60s:
        reject ALL deltas

    FOR EACH proposed delta:
        IF time since this parameter was last adjusted < 120s:
            reject this delta

## Variant Selection Mapping (Game-Side)

Cadence outputs an AdjustmentProposal containing ParameterDelta entries. Games that use pre-built level variants (e.g., Juicy Blast with variants 2 to 8, base = 5) should translate the delta magnitude into variant steps rather than stepping one variant at a time.

| Delta % | Variant Steps |
|---|---|
| Less than 5% | 1 step |
| 5% to 10% | 2 steps |
| Greater than 10% | max steps (capped at variant bounds) |

Rationale: Stepping one variant at a time risks a frustrated player churning before the system lands them at the right difficulty. Cadence's Cooldown Rule (60s global, 120s per-parameter) naturally prevents oscillation, so aggressive step sizes are safe.

Example (Juicy Blast):

    // Translate Cadence's proposal into a variant selection
    int variant = currentVariant; // 5 = base
    if (proposal?.Deltas != null && proposal.Deltas.Count > 0)
    {
        // Sum the normalized delta across all parameters
        float totalDeltaPct = 0f;
        foreach (var delta in proposal.Deltas)
        {
            float pct = (delta.ProposedValue - delta.CurrentValue) / delta.CurrentValue;
            totalDeltaPct += pct;
        }

        // Map magnitude to variant step count
        int steps;
        float magnitude = Mathf.Abs(totalDeltaPct);
        if (magnitude < 0.05f) steps = 1;
        else if (magnitude < 0.10f) steps = 2;
        else steps = VariantStepThresholds.MaxSteps;

        // Apply direction (negative = easier, positive = harder)
        variant += (totalDeltaPct < 0) ? -steps : steps;
        variant = Mathf.Clamp(variant, 2, 8);
    }

    string nextLevelId = $"Level{nextLevelNumber}_{variant}";

Configurable: The step thresholds (5%, 10%) and variant bounds (2 to 8) should be exposed as tunable config values, not hardcoded. See Section 16.

## Adjustment Proposal Output

AdjustmentProposal contains:

| Field | Type | Description |
|---|---|---|
| Deltas | List of ParameterDelta | Proposed parameter changes |
| Confidence | float | Profile.Confidence01 (0.0 to 1.0) |
| Reason | string | Human-readable explanation |
| DetectedState | FlowState | State that triggered adjustment |
| Timing | AdjustmentTiming | BeforeNextLevel or MidSession |

ParameterDelta contains:

| Field | Type | Example |
|---|---|---|
| ParameterKey | string | "blocking_offset", "max_selectable" |
| CurrentValue | float | 5.0 |
| ProposedValue | float | 3.0 |
| RuleName | string | "FrustrationReliefRule" |

The game decides whether and how to apply the proposal. Cadence never modifies game state directly.
