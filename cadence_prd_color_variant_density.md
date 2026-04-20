# PRD Addendum — color_variant_density Factor

Two changes to add to the Confluence PRD to document the new difficulty factor Nam requested.

---

## Change 1: Section 10 — Update the song_start BeginSession example

**Location:** Section 10, P0 — Session Lifecycle, `song_start` event, inside the "Note on BeginSession() levelParameters" block.

**Update the Juicy Blast example to include `color_variant_density`.** Replace the existing example code with:

    _dda.BeginSession(levelId, new Dictionary<string, float>
    {
        { "blocking_offset", level.BlockingOffset },
        { "max_selectable", level.MaxSelectableItems },
        { "active_launchers", level.ActiveLauncherCount },
        { "color_variant_density", level.ColorVariantDensity },
        { "difficulty_score", level.DifficultyScore },
        { "par_moves", level.ParMoves },
        { "attempt", attemptNumber },
    }, LevelType.Level);

**Also update the "Required keys" bullet list** above the code block. Replace:

- Design levers (game-specific, e.g., blocking_offset, max_selectable, active_launchers)

with:

- Design levers (game-specific, e.g., blocking_offset, max_selectable, active_launchers, color_variant_density)

---

## Change 2: Section 16 — Add a new "Juicy Blast Difficulty Factors" subsection

**Location:** Section 16, at the end — just after the AdjustmentEngineConfig table and before Section 17 Glossary.

**Paste this new subsection:**

Juicy Blast Difficulty Factors

Juicy Blast exposes four design levers that Cadence can adjust between sessions. These are passed in the BeginSession() / GetProposal() levelParameters dictionary as float values.

| Parameter | Range | Description | Adjustment Direction |
|---|---|---|---|
| blocking_offset | 0 to 10 | How deeply tiles are buried in Layer C. Higher = harder to reach. | Lower = easier, higher = harder |
| max_selectable | 6 to 15 | Surface layer size (visible waiting stand slots). More visible tiles = easier to plan ahead. | Higher = easier, lower = harder |
| active_launchers | 1 to 3 | Number of blenders active simultaneously. More active launchers = more options. | Higher = easier, lower = harder |
| color_variant_density | 0 to 100 | Proximity metric for same-color fruit variants. When fruit variants of the same color cluster together, visual similarity increases cognitive load and difficulty rises. Computed by LevelForge from the artwork layout. | Lower = easier, higher = harder |

color_variant_density explained

LevelForge computes this metric by scanning the placed tiles and counting how often same-color-different-variant tiles coexist within visual proximity. A level where all orange fruits are the same variant scores low (easy to distinguish). A level with all three orange variants clustered together scores high (confusing — the player has to think harder about which tile is which).

The metric contributes roughly ±2 to 3 points to the composite difficulty_score, weighted alongside blocking_offset, max_selectable, and active_launchers.

LevelForge auto-computes this value for every imported level. The game passes it to Cadence as-is — no runtime calculation needed on the game side.

Variant selection (game-side)

In addition to the Cadence-tracked parameters above, the game uses pre-built level variants for fast difficulty adaptation:

- variantStepThresholds: [0.05, 0.10] — delta % breakpoints for step mapping
- variantMaxStep — cap on variant jumps
- Variants range from 2 (easiest) through 5 (base) to 8 (hardest)

These are game-side only and not part of Cadence's AdjustmentEngineConfig. See Section 13 "Variant Selection Mapping" for the full implementation.

---

## Summary of changes

| Where | Change |
|---|---|
| Section 10, song_start BeginSession example | Add color_variant_density to the Juicy Blast example dictionary |
| Section 10, "Required keys" bullet | Add color_variant_density to the design levers list |
| Section 16, new subsection at the end | "Juicy Blast Difficulty Factors" table + color_variant_density explanation |
