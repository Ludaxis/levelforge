'use client';

import React from 'react';
import type { HelpTopic } from '../types';
import { Bullets, K, Note, P, Section, Steps, Verdict } from './shared';

// ─────────────────────────────────────────────────────────────────────────────
// analyze (root)
// ─────────────────────────────────────────────────────────────────────────────
const Intro: HelpTopic = {
  id: 'analyze',
  title: 'Analyze tab guide',
  order: 0,
  summary: 'A solvability lab for studio-format level JSONs. Drop levels, run solvers, classify each level, then bulk-tune difficulty.',
  body: (
    <>
      <Section title="What is the Analyze tab for?">
        <P>
          It is a standalone offline lab for verifying levels exported from the Design tab. You drop one or more level
          JSONs, the lab runs three different solvers on each, and you get a quick verdict — <K>solvable</K>, <K>risky</K>,
          or <K>stuck</K> — plus tools to inspect, simulate, and re-tune problem levels in bulk.
        </P>
      </Section>

      <Section title="Quick workflow">
        <Steps>
          <li>Drop level <K>.json</K> files into the Upload card (or click to browse).</li>
          <li>Tune solver knobs: Monte Carlo runs, optionally enable DFS and its state limit.</li>
          <li>Click <K>Run Analysis</K>.</li>
          <li>Read the Summary card — see how many are solvable / risky / stuck.</li>
          <li>Pick any level in <strong>Level Detail</strong> to inspect its layers, solution path, simulator, and logs.</li>
          <li>Use <K>±Easier / ±Harder</K> in Summary to bulk-adjust risky or stuck levels and re-run.</li>
          <li>Export adjusted JSONs back into the game pipeline.</li>
        </Steps>
      </Section>

      <Section title="The three verdicts">
        <Verdict kind="solvable">Greedy or DFS found a path AND Monte Carlo win-rate is 100%. Safe to ship.</Verdict>
        <Verdict kind="risky">A solution exists but is not robust under random play — DFS solved but explored many states, or Monte Carlo win-rate &lt; 100%. Most players might fail.</Verdict>
        <Verdict kind="stuck">Greedy failed AND DFS found no solution within the state limit. Almost certainly unwinnable as authored.</Verdict>
      </Section>

      <Note tone="tip">
        Use the sidebar on the left to jump to any section of this guide. Every section in the Analyze tab also has its own
        small <K>?</K> icon that takes you straight to the relevant page.
      </Note>
    </>
  ),
};

// ─────────────────────────────────────────────────────────────────────────────
// analyze.solvers
// ─────────────────────────────────────────────────────────────────────────────
const Solvers: HelpTopic = {
  id: 'analyze.solvers',
  parentId: 'analyze',
  title: 'Solvers & verdicts',
  order: 10,
  summary: 'How Greedy, Monte Carlo, and DFS combine into the final verdict.',
  body: (
    <>
      <Section title="Greedy solver">
        <P>
          A single deterministic playthrough. Always picks a directly-matching surface item if one exists, otherwise the
          item whose <em>behind</em> tile matches an open slot, otherwise the cheapest queue pick. Fast — runs in milliseconds.
        </P>
        <P>If Greedy solves the level, the level is definitely solvable. If it fails, Monte Carlo and DFS take over.</P>
      </Section>

      <Section title="Monte Carlo (MC)">
        <P>
          Plays the level <K>N</K> times with randomized but plausible move selection (default <K>200</K> runs, configurable in the Upload card).
          Returns a win-rate. This is the only solver that captures &quot;solvable but the player will fail&quot; — i.e., the <K>risky</K> band.
        </P>
        <Bullets>
          <li><strong>Win-rate 100%</strong> → robust, even random-ish play succeeds.</li>
          <li><strong>0% &lt; Win-rate &lt; 100%</strong> → flag as <K>risky</K>.</li>
          <li><strong>Win-rate 0%</strong> → no random play succeeded; likely <K>stuck</K> unless DFS finds a path.</li>
        </Bullets>
      </Section>

      <Section title="DFS (Depth-First Search)">
        <P>
          Optional, opt-in via the <K>DFS</K> checkbox. Exhaustively searches the move tree up to a configurable state cap
          (default <K>500,000</K>). If DFS finds a path, the level is technically solvable. If it explores a lot before finding
          one, that is treated as a risk signal.
        </P>
        <Note tone="warn">
          DFS can be slow for large levels. Start small (50k–500k) and only raise the limit if you need to disprove
          unsolvability for a specific level.
        </Note>
      </Section>

      <Section title="How verdicts combine">
        <Bullets>
          <li><K>solvable</K> = Greedy solved OR (DFS solved AND it was not slow) AND MC win-rate is 100%.</li>
          <li><K>risky</K> = a solution exists but DFS was slow OR MC win-rate &lt; 100%.</li>
          <li><K>stuck</K> = Greedy failed AND DFS found nothing within the state limit.</li>
        </Bullets>
      </Section>
    </>
  ),
};

// ─────────────────────────────────────────────────────────────────────────────
// analyze.upload
// ─────────────────────────────────────────────────────────────────────────────
const Upload: HelpTopic = {
  id: 'analyze.upload',
  parentId: 'analyze',
  title: 'Upload card',
  order: 20,
  summary: 'Drop level JSONs and configure solver knobs before running analysis.',
  body: (
    <>
      <Section title="Loading levels">
        <Bullets>
          <li>Drag and drop one or more <K>.json</K> files onto the dashed area.</li>
          <li>Or click the area to open a file picker (multi-select supported).</li>
          <li>Files must be in studio export format — same shape that the Design tab&apos;s <em>Add to Collection</em> button produces (with <K>SelectableItems</K>, <K>Requirements</K>, <K>WaitingStandSlots</K>, etc.).</li>
        </Bullets>
      </Section>

      <Section title="MC Runs">
        <P>
          Number of Monte Carlo playthroughs per level. Default <K>200</K>. Higher = more confidence in the win-rate, but slower.
        </P>
        <Bullets>
          <li><K>50–100</K> — quick spot-check while iterating.</li>
          <li><K>200–500</K> — default, good for batch QA.</li>
          <li><K>1000+</K> — final pre-ship sweep.</li>
        </Bullets>
      </Section>

      <Section title="DFS toggle + Limit">
        <P>
          DFS is off by default — Greedy + MC catch most issues much faster. Enable DFS when you need a definitive
          solvable / unsolvable verdict for a level the other two are uncertain about.
        </P>
        <Bullets>
          <li><K>50,000</K> — quick truth check.</li>
          <li><K>500,000</K> — default, fine for most levels.</li>
          <li><K>2,000,000+</K> — only for levels you suspect are tight but solvable.</li>
        </Bullets>
      </Section>

      <Section title="Run Analysis">
        <P>Kicks off all three solvers across every loaded file. Progress is shown as <K>done/total</K> and a thin progress bar appears under the controls.</P>
      </Section>
    </>
  ),
};

// ─────────────────────────────────────────────────────────────────────────────
// analyze.summary
// ─────────────────────────────────────────────────────────────────────────────
const Summary: HelpTopic = {
  id: 'analyze.summary',
  parentId: 'analyze',
  title: 'Summary card',
  order: 30,
  summary: 'Read the verdict counts and bulk-adjust difficulty.',
  body: (
    <>
      <Section title="The counts row">
        <Bullets>
          <li><K>X total</K> — number of levels analyzed.</li>
          <li><span className="text-green-400">X solvable</span> — robust, ship-ready.</li>
          <li><span className="text-yellow-400">X risky</span> — solvable in theory but with low MC win-rate; consider easing.</li>
          <li><span className="text-red-400">X stuck</span> — no solution found; must be re-tuned.</li>
          <li><K>avg win rate</K> — averaged Monte Carlo win-rate across all levels.</li>
        </Bullets>
      </Section>

      <Section title="Bulk difficulty adjustment">
        <P>
          Pick a target group with the dropdown (<K>All</K>, <K>Solvable only</K>, <K>Risky only</K>, <K>Stuck only</K>) and press
          <K>Easier</K> or <K>Harder</K>. The lab nudges <K>BlockingOffset</K> by ±1 (clamped 0–10) and inversely tweaks <K>MaxSelectableItems</K>.
          Item order is re-canonicalized (L0 → L1 → L2 by <K>order</K>) so the blocking algorithm produces deterministic results.
        </P>
        <Note tone="info">
          The badge next to the buttons shows how many levels were adjusted and the delta range. Press <K>Reset</K> to discard
          all bulk adjustments and start again.
        </Note>
      </Section>

      <Section title="Export">
        <Bullets>
          <li><K>CSV</K> — flat report (level id, verdict, win-rate, moves, etc.) for spreadsheet review.</li>
          <li><K>Export All JSONs</K> — re-emits the (possibly adjusted) studio-format JSONs back into the game pipeline.</li>
        </Bullets>
      </Section>
    </>
  ),
};

// ─────────────────────────────────────────────────────────────────────────────
// analyze.detail (parent of the 4 sub-tabs)
// ─────────────────────────────────────────────────────────────────────────────
const Detail: HelpTopic = {
  id: 'analyze.detail',
  parentId: 'analyze',
  title: 'Level Detail',
  order: 40,
  summary: 'Inspect, replay, or simulate a single level.',
  body: (
    <>
      <Section title="The level selector">
        <P>
          The dropdown next to the title lists every loaded level prefixed with a verdict glyph: <K>✓</K> solvable,
          <K>~</K> risky, <K>✗</K> stuck. You can also click a level id directly in the Batch Report table to jump here.
        </P>
      </Section>
      <Section title="Four sub-tabs">
        <Bullets>
          <li><K>Layers</K> — visualize L0 / L1 / L2 with the golden-path overlay.</li>
          <li><K>Solution</K> — the solver&apos;s actual move sequence with direct/queue counts.</li>
          <li><K>Simulator</K> — interactive click-to-play with a live next-move hint.</li>
          <li><K>Logs</K> — saved play sessions from the simulator.</li>
        </Bullets>
      </Section>
    </>
  ),
};

// ─────────────────────────────────────────────────────────────────────────────
// analyze.detail.layers
// ─────────────────────────────────────────────────────────────────────────────
const Layers: HelpTopic = {
  id: 'analyze.detail.layers',
  parentId: 'analyze.detail',
  title: 'Layers sub-tab',
  order: 1,
  summary: 'Static map of every item in the level, grouped by layer.',
  body: (
    <>
      <Section title="What you see">
        <Bullets>
          <li><strong>Color legend</strong> — every <K>ColorType</K> used in this level with its display name.</li>
          <li><strong>Verdict banner</strong> — solvable + path count, or stuck with partial reqs done.</li>
          <li><strong>Stats row</strong> — requirements count, total items, items needed (reqs × 3), L0/L1/L2 split.</li>
          <li><strong>Requirements</strong> (collapsible) — list of <K>R0…Rn</K> launchers in load order.</li>
          <li><strong>Layer 0 — Surface</strong> — what the player sees first.</li>
          <li><strong>Layer 1 — Behind</strong> — revealed when the L0 in front is picked.</li>
          <li><strong>Layer 2 — Queue</strong> — pulled in to refill positions as L0 + L1 are emptied.</li>
        </Bullets>
      </Section>

      <Section title="Golden path overlay">
        <P>
          Items the solver actually picked are highlighted with a golden ring and a step number. This lets you trace the
          intended solution at a glance — and spot which items are never used.
        </P>
        <Note tone="tip">
          Hover any cell to see <K>ColorType</K>, <K>Variant</K>, and <K>idx</K>. The badge in the bottom-right is the original
          item index in the JSON.
        </Note>
      </Section>
    </>
  ),
};

// ─────────────────────────────────────────────────────────────────────────────
// analyze.detail.solution
// ─────────────────────────────────────────────────────────────────────────────
const Solution: HelpTopic = {
  id: 'analyze.detail.solution',
  parentId: 'analyze.detail',
  title: 'Solution sub-tab',
  order: 2,
  summary: 'The solver&apos;s move list with direct-vs-queue analysis.',
  body: (
    <>
      <Section title="What the numbers mean">
        <Bullets>
          <li><K>Total moves</K> — total picks the solver made to clear the level.</li>
          <li><span className="text-green-400"><K>Direct</K></span> — picks that went straight into a matching launcher slot.</li>
          <li>
            <span className="text-yellow-400"><K>Queue</K></span> — picks that had to wait in the waiting stand. Color-coded:
            <span className="text-green-400"> 0 = green</span>,
            <span className="text-yellow-400"> 1–3 = yellow</span>,
            <span className="text-red-400"> &gt;3 = red</span>.
          </li>
        </Bullets>
      </Section>

      <Section title="How to read it">
        <P>
          A clean level has very few queue picks — items are placed straight into their slot. High queue counts mean the
          player must hold items, juggling stand capacity, which is the main source of difficulty and frustration.
        </P>
        <Note tone="warn">
          More than 3 queue moves is a red flag for typical players. Either ease blocking, raise stand size, or simplify variants.
        </Note>
      </Section>

      <Section title="Move list">
        <P>
          Below the headline numbers, the full pick sequence is shown as colored item indices. You can cross-reference each
          index back to the Layers tab to understand how the solution unfolds.
        </P>
      </Section>
    </>
  ),
};

// ─────────────────────────────────────────────────────────────────────────────
// analyze.detail.simulator
// ─────────────────────────────────────────────────────────────────────────────
const Simulator: HelpTopic = {
  id: 'analyze.detail.simulator',
  parentId: 'analyze.detail',
  title: 'Simulator sub-tab',
  order: 3,
  summary: 'Play the level by hand, with a live hint engine running in the background.',
  body: (
    <>
      <Section title="Controls">
        <Bullets>
          <li><strong>Active requirements</strong> — the two launcher slots currently waiting to be filled.</li>
          <li><strong>Queue (waiting stand)</strong> — items you have picked but couldn&apos;t place yet. The bar turns red as it nears its cap.</li>
          <li><strong>Surface</strong> — click any visible L0 item to pick it. Matches highlight green; the suggested next pick has a gold star.</li>
          <li><strong>Behind</strong> — read-only view of the L1 items waiting to be revealed.</li>
          <li><strong>Queue (L2 remaining)</strong> — what is left to flow in from above.</li>
        </Bullets>
      </Section>

      <Section title="Live hint">
        <P>
          A mini-DFS runs from your current state on every action. The next suggested pick is marked with a gold star.
          If the engine cannot find a continuing path from where you are, the star disappears — that means you have already
          painted yourself into a corner.
        </P>
      </Section>

      <Section title="Saving a session">
        <Bullets>
          <li><K>Save log (n)</K> — saves the current pick sequence into the Logs sub-tab.</li>
          <li><K>Reset</K> — restart this level from scratch.</li>
          <li>If you finish or fill the queue, you&apos;ll see a Game-over / Complete banner with quick Save / Try again actions.</li>
        </Bullets>
      </Section>
    </>
  ),
};

// ─────────────────────────────────────────────────────────────────────────────
// analyze.detail.logs
// ─────────────────────────────────────────────────────────────────────────────
const Logs: HelpTopic = {
  id: 'analyze.detail.logs',
  parentId: 'analyze.detail',
  title: 'Logs sub-tab',
  order: 4,
  summary: 'Saved playthroughs from the Simulator, copyable for sharing.',
  body: (
    <>
      <Section title="What is logged">
        <Bullets>
          <li>Level id, timestamp, outcome (complete / gameover / manual), duration.</li>
          <li>Total picks, requirements completed.</li>
          <li>Whether the solver said it was solvable, and how many paths.</li>
          <li>L0 / L1 / L2 sizes.</li>
          <li>Full pick sequence with step, item idx, color, variant, position, action, queue state.</li>
        </Bullets>
      </Section>

      <Section title="Sharing">
        <Bullets>
          <li><K>Copy</K> on a single log → clipboard.</li>
          <li><K>Copy all</K> → all logs concatenated.</li>
          <li><K>Clear</K> wipes the log history (in-memory only — no persistence).</li>
        </Bullets>
        <Note tone="tip">
          Logs are kept only in-memory for the current session. Copy them out before refreshing.
        </Note>
      </Section>
    </>
  ),
};

// ─────────────────────────────────────────────────────────────────────────────
// analyze.batchReport
// ─────────────────────────────────────────────────────────────────────────────
const BatchReport: HelpTopic = {
  id: 'analyze.batchReport',
  parentId: 'analyze',
  title: 'Batch Report table',
  order: 50,
  summary: 'Sortable table of every level, click a row to expand details.',
  body: (
    <>
      <Section title="Columns">
        <Bullets>
          <li><K>Level</K> — file id; click to jump to its detail panel.</li>
          <li><K>Status</K> — verdict glyph (✓ / ~ / ✗).</li>
          <li><K>Paths</K> — number of distinct DFS solutions found (1 if only Greedy solved).</li>
          <li><K>Reqs</K> — number of launcher requirements.</li>
          <li><K>Items</K> — total selectable items (L0 + L1 + L2).</li>
          <li><K>Moves</K> — total picks in the solver path.</li>
          <li><span className="text-green-400"><K>Direct</K></span> — picks placed straight into a slot.</li>
          <li><span className="text-yellow-400"><K>Queue</K></span> — picks routed via the waiting stand. Colored green/yellow/red by count.</li>
        </Bullets>
      </Section>
      <Section title="Sorting">
        <P>
          Click <K>Level</K>, <K>Status</K>, or <K>Items</K> headers to sort. Click again to flip direction. The current sort
          shows an up/down arrow.
        </P>
      </Section>
      <Section title="Expanded row">
        <P>
          Click any row (anywhere except the level id) to expand a per-level breakdown — unique colors, MaxSel, BlockingOffset,
          stand size, active launchers, etc. Useful for spotting why a specific level lands in <K>risky</K>.
        </P>
      </Section>
    </>
  ),
};

// ─────────────────────────────────────────────────────────────────────────────
// analyze.adjust
// ─────────────────────────────────────────────────────────────────────────────
const Adjust: HelpTopic = {
  id: 'analyze.adjust',
  parentId: 'analyze',
  title: 'Difficulty adjustment',
  order: 60,
  summary: 'How the bulk Easier/Harder buttons actually change a level.',
  body: (
    <>
      <Section title="What gets changed">
        <Bullets>
          <li><K>BlockingOffset</K> — nudged by ±1, clamped to 0–10. Higher means more layered blocking, harder to read ahead.</li>
          <li><K>MaxSelectableItems</K> — adjusted inversely (more blocking → fewer items, and vice-versa) so the level stays winnable.</li>
          <li><K>Item order</K> — re-canonicalized to L0 → L1 → L2 by <K>order</K> so the deterministic builder produces stable output.</li>
          <li>(Optional) variant merging — collapses near-duplicate variants on Easier passes.</li>
        </Bullets>
      </Section>

      <Section title="Workflow">
        <Steps>
          <li>Run analysis once on a fresh batch.</li>
          <li>Filter the adjustment target to <K>Risky only</K> or <K>Stuck only</K>.</li>
          <li>Press <K>Easier</K>; watch the badge confirm how many were adjusted.</li>
          <li>Re-run analysis. Repeat until the risky/stuck buckets are empty.</li>
          <li>Export all JSONs back into the design pipeline.</li>
        </Steps>
        <Note tone="warn">
          Reset clears the in-memory deltas — the source files on disk are not modified until you Export All JSONs.
        </Note>
      </Section>
    </>
  ),
};

export const analyzeTopics: HelpTopic[] = [
  Intro,
  Solvers,
  Upload,
  Summary,
  Detail,
  Layers,
  Solution,
  Simulator,
  Logs,
  BatchReport,
  Adjust,
];
