# LevelForge -- Comprehensive Refactoring Plan

> Generated: 2026-03-13 | Analyzed by: Tech Lead, Full-Stack React Engineer, Solution Architect, UI Developer

---

## Executive Summary

LevelForge is a ~54,400-line Next.js 16 / React 19 puzzle game level design workbench supporting four game types (Match-3, Hexa Block, Square Block, Juicy Blast/Fruit Match). The codebase is functional but has accumulated significant technical debt across architecture, code quality, accessibility, and testing. This plan addresses **~3,200 lines of dead code**, **~750+ lines of duplicated code**, **zero test coverage on components**, **zero accessibility on game boards**, and **monolithic components exceeding 2,800 lines**.

---

## Table of Contents

1. [Dead Code Inventory](#1-dead-code-inventory)
2. [Duplicated Code Inventory](#2-duplicated-code-inventory)
3. [Architecture Issues](#3-architecture-issues)
4. [UI/UX Issues](#4-uiux-issues)
5. [Security Concerns](#5-security-concerns)
6. [Refactoring Phases](#6-refactoring-phases)
7. [Testing Strategy](#7-testing-strategy)
8. [Documentation Plan](#8-documentation-plan)

---

## 1. Dead Code Inventory

### 1.1 Entire Dead Files (~2,100 lines)

| File | Lines | Reason |
|------|-------|--------|
| `src/components/game/GameBoard.tsx` | 78 | Legacy duplicate of `games/match-3/GameBoard.tsx` |
| `src/components/game/GameStatus.tsx` | 162 | Legacy duplicate of `games/match-3/GameStatus.tsx` |
| `src/components/game/LevelConfigurator.tsx` | 260 | Legacy duplicate of `games/match-3/LevelConfigurator.tsx` |
| `src/components/hex/HexGrid.tsx` | ~200 | Superseded by `games/hexa-block/HexBlockBoard.tsx` |
| `src/components/games/fruit-match/FruitMatchLevelDesigner.tsx` | 1,488 | V1 designer, replaced by `LevelDesignerV2.tsx` |
| `src/types/level.ts` | ~50 | Original Match-3 types, now unused |

### 1.2 Dead Exports & Functions

| File | Export | Reason |
|------|--------|--------|
| `src/lib/constants.ts` | Multiple constants | Referenced nowhere in codebase |
| `src/types/hexaBlock.ts` | `hexLevelTemplates` exports | Never imported |
| `src/lib/fruitMatchUtils.ts` | Unused utility functions | Dead after V2 rewrite |
| `src/lib/migration.ts` | Migration helpers | One-time migration already completed |

### 1.3 Unused NPM Packages

| Package | Reason |
|---------|--------|
| `@twemoji/api` | Verify usage -- may be tree-shaken out but still in bundle |
| `pixelit` | Last published 3+ years ago, verify if actively used |

### 1.4 Console Logs in Production (85 occurrences)

- 18 `console.log/warn/error` calls in component render code
- `FruitMatchBoard.tsx:228` logs on **every render** during gameplay
- `ShootingAnimationPortal.tsx:33,47,61` logs during gameplay
- Remaining ~67 scattered across lib files

**Action:** Remove all or replace with structured logger with log levels.

---

## 2. Duplicated Code Inventory

### 2.1 Type Definitions (~250+ lines)

| Duplication | Files | Lines Saved |
|-------------|-------|-------------|
| `DifficultyTier` type | Defined in 4 files (`level.ts`, `hexaBlock.ts`, `squareBlock.ts`, `fruitMatch.ts`) | ~20 |
| `FlowZone`, `LevelMetrics`, `DesignedLevel` | Identical in `hexaBlock.ts` and `squareBlock.ts` | ~80 |
| `SAWTOOTH_EXPECTED` + 5 difficulty functions | Copy-pasted between `hexaBlock.ts` and `squareBlock.ts` | ~150 |
| `estimateLevel()` | Two implementations with different signatures | ~30 |

### 2.2 Component Duplications (~500+ lines)

| Duplication | Files | Lines Saved |
|-------------|-------|-------------|
| `components/game/*` vs `components/games/match-3/*` | 3 files identical or 1-line diff | ~500 |
| `toGrayscale()` function | `SquareBlockBoard.tsx:47` and `SquareBlockLevelDesigner.tsx:99` | ~15 |
| `FLOW_ZONE_COLORS`, `DIFFICULTY_BADGE_COLORS` | Identical in `HexBlockLevelDesigner.tsx` and `SquareBlockLevelDesigner.tsx` | ~30 |
| `DIRECTION_ANGLES`, `AXIS_ANGLES` | Duplicated in `HexBlockBoard.tsx` and `HexBlockLevelDesigner.tsx` | ~20 |
| `hexToRgb()` | Two different implementations in two files | ~15 |
| `breakdownIntoCapacities()` | Duplicated in `juicyBlastExport.ts` | ~20 |
| `FRUIT_COLORS` | Full version in `fruitMatch.ts`, subset in `shared/[code]/page.tsx` | ~10 |
| Page header pattern | `<h1>` + description repeated in 8+ page files | ~80 |

### 2.3 Styling Duplications

| Duplication | Location |
|-------------|----------|
| `hex-bounce` and `square-bounce` keyframes | `globals.css` lines 130-173 -- identical logic |
| Hardcoded HSL chart colors | Duplicated across 5+ chart components |
| 98 template literal classNames | Should use `cn()` utility instead |

---

## 3. Architecture Issues

### 3.1 Critical

| Issue | Impact |
|-------|--------|
| **Monolithic components** (2,578-2,888 lines each) | Unmaintainable, untestable, unreviewable |
| **setTimeout-based animation** (53 occurrences) | Race conditions, sync issues, untestable |
| **No error boundaries** | Single runtime error crashes entire app |
| **No React Server Components used** | All pages client-rendered despite Next.js 16 |
| **Circular dependency** `types/squareBlock.ts` <-> `lib/puzzleAnalyzer.ts` | Build fragility |

### 3.2 High

| Issue | Impact |
|-------|--------|
| **Package name mismatch** (`echo-level-workbench` vs `levelforge`) | Confusion |
| **No schema validation on JSON imports** | Security risk, runtime crashes |
| **Supabase delete-all-then-insert writes** | Data loss risk on crash |
| **No code splitting for game modules** | All 4 games loaded for any page visit |
| **`useStudioGame.ts` at 1,437 lines** | Hook monolith |
| **Business logic in type definition files** | Blurred module boundaries |
| **Types files re-export runtime code** | Type/runtime boundary violation |

### 3.3 Medium

| Issue | Impact |
|-------|--------|
| **`Math.random()` for IDs** (6+ files) | Not cryptographically safe |
| **localStorage used without try/catch** | Silent failures when storage full |
| **JSON.stringify for data comparison** | Fragile, O(n) |
| **No `.env.example`** | Onboarding friction |
| **`as any` casts** (6 occurrences) | Type safety holes |
| **3 `eslint-disable` suppressions** | Hidden potential bugs |
| **tsconfig target ES2017** | Should be ES2022 |
| **Game hooks store full history as Map[]** | Memory pressure |

---

## 4. UI/UX Issues

### 4.1 Accessibility (CRITICAL)

| Issue | Scope |
|-------|-------|
| **Zero ARIA attributes** on game boards | All 6 game board components |
| **Zero keyboard navigation** | No `tabIndex`, no `onKeyDown` on game elements |
| **Zero screen reader support** | Game tiles, win/loss overlays inaccessible |
| **Color as sole differentiator** | No shape/pattern alternative for tile types |
| **Unlabeled form controls** | Missing `htmlFor`/`id` pairing in charts |
| **Charts inaccessible** | SVG charts with no text alternatives |
| **`prefers-reduced-motion` not respected** | All animations run unconditionally |
| Only 2 `sr-only` instances in entire codebase | Critical gap |

### 4.2 Styling Inconsistencies

| Issue | Count |
|-------|-------|
| Inline `style={}` where Tailwind would work | 126 occurrences |
| Template literal classNames bypassing `cn()` | 98 occurrences |
| Hardcoded color classes outside token system | 119 occurrences |
| Mixed component API patterns (forwardRef vs plain) | ~50/50 split |
| Native `<input>` instead of `<Input>` component | 3+ locations |
| Missing toast/notification system | Async ops have no feedback |
| No confirmation dialogs for destructive actions | Delete, revoke |

### 4.3 Responsive Design Gaps

| Issue | Location |
|-------|----------|
| Fixed pixel sizes on game boards | HexGrid, SquareBlockBoard, FruitMatchBoard |
| Touch targets below 44px minimum | TileSink (36px), filter badges |
| 5-column TabsList squeezed on mobile | LevelDurationFramework |
| No container queries for adaptive layouts | Game panels |

### 4.4 Dark Mode Bugs

| Issue | Location |
|-------|----------|
| `fill="white"` hardcoded in chart | `MoveCalculator.tsx:119` |
| Direct color references outside token system | Multiple chart components |

---

## 5. Security Concerns

| Severity | Issue | Location |
|----------|-------|----------|
| **Critical** | `npm audit`: 2 critical vulns (rollup path traversal) | `package-lock.json` |
| **High** | No schema validation on JSON import | `juicyBlastExport.ts`, `squareBlockExport.ts` |
| **High** | Share codes use `Math.random()` (6-char, 55-char alphabet) | `sharingService.ts` |
| **Medium** | No rate limiting on shared collection endpoint | `shared/[code]/page.tsx` |
| **Medium** | Client-side ownership check (should be RLS) | `sharingService.ts` |
| **Medium** | Device ID uses `Date.now() + Math.random()` | `supabase/client.ts` |
| **Low** | 85 console.log calls leak internal state | Throughout |

---

## 6. Refactoring Phases

### Phase 0: Immediate Security Fixes (Day 1)

- [ ] Run `npm audit fix` to patch rollup vulnerability
- [ ] Add `zod` for JSON import validation at all external boundaries
- [ ] Replace `Math.random()` with `crypto.randomUUID()` in share code generation and device ID
- [ ] Remove all 85 `console.log/warn/error` calls from production code

### Phase 1: Dead Code & Duplication Cleanup (Week 1)

**Goal:** Remove ~3,200 lines of dead code and ~750 lines of duplicated code.

- [ ] Delete `src/components/game/` directory (legacy Match-3 duplicates)
- [ ] Delete `src/components/hex/HexGrid.tsx` (superseded)
- [ ] Delete `src/components/games/fruit-match/FruitMatchLevelDesigner.tsx` (V1)
- [ ] Delete `src/types/level.ts` (unused)
- [ ] Audit and remove dead exports in `constants.ts`, `hexLevelTemplates.ts`, `fruitMatchUtils.ts`, `migration.ts`
- [ ] Remove or verify `@twemoji/api` and `pixelit` dependencies
- [ ] Create `src/types/shared.ts` with common `DifficultyTier`, `FlowZone`, `LevelMetrics`
- [ ] Extract shared difficulty functions (`SAWTOOTH_EXPECTED`, `getExpectedDifficulty`, etc.) to `src/lib/difficulty.ts`
- [ ] Consolidate `toGrayscale()` to `src/lib/utils.ts`
- [ ] Consolidate `FLOW_ZONE_COLORS`, `DIFFICULTY_BADGE_COLORS` to `src/lib/constants.ts`
- [ ] Consolidate `DIRECTION_ANGLES`, `AXIS_ANGLES` to hexa-block shared constants
- [ ] Merge `hex-bounce` and `square-bounce` keyframes in `globals.css`
- [ ] Fix package name from `echo-level-workbench` to `levelforge`
- [ ] Fix circular dependency: `types/squareBlock.ts` <-> `lib/puzzleAnalyzer.ts`
- [ ] Move business logic out of type files into proper `lib/` modules

### Phase 2: Architecture Improvements (Week 2-3)

**Goal:** Decompose monoliths, establish proper module boundaries, optimize data flow.

#### Component Decomposition

Each 2,500+ line designer should be split into ~8-10 focused components (<300 lines each):

```
games/fruit-match/
  LevelDesignerV2.tsx (2,888 lines) ->
    designer/
      DesignerContainer.tsx      # Orchestrator, state management
      CanvasEditor.tsx           # Pixel art canvas with tools
      ToolPanel.tsx              # Drawing tools, colors, brushes
      LauncherEditor.tsx         # Launcher configuration
      SequenceBuilder.tsx        # Sequence editing
      ExportPanel.tsx            # Import/export controls
      MetricsPanel.tsx           # Difficulty metrics display
      PreviewPanel.tsx           # Game preview
      useDesignerState.ts        # State hook
      useImportExport.ts         # Import/export logic

games/hexa-block/
  HexBlockLevelDesigner.tsx (2,578 lines) ->
    designer/
      DesignerContainer.tsx
      HexGridEditor.tsx
      BlockPalette.tsx
      PropertyPanel.tsx
      CurvePanel.tsx
      PreviewPanel.tsx
      useDesignerState.ts

games/square-block/
  SquareBlockLevelDesigner.tsx (2,760 lines) ->
    designer/
      DesignerContainer.tsx
      GridEditor.tsx
      BlockPalette.tsx
      PropertyPanel.tsx
      CurvePanel.tsx
      PreviewPanel.tsx
      useDesignerState.ts
```

#### Hook Decomposition

```
useStudioGame.ts (1,437 lines) ->
  useStudioGameState.ts         # Core state management
  useStudioGameAnimations.ts    # Animation orchestration
  useStudioGameLaunchers.ts     # Launcher logic
  useStudioGameMatching.ts      # Match detection and resolution
```

#### Layout Components

- [ ] Create `src/components/layout/PageHeader.tsx` (extract from 8+ pages)
- [ ] Create `src/components/layout/GameLayout.tsx` (shared game page layout)
- [ ] Create `src/components/layout/TwoColumnLayout.tsx` (designer layout)

#### Data Flow Improvements

- [ ] Replace `setTimeout`-based animation with GSAP timelines or `requestAnimationFrame`
- [ ] Add React Error Boundaries around each game container and storage operations
- [ ] Make Supabase writes atomic (upsert with `onConflict` instead of delete-all-then-insert)
- [ ] Add `localStorage` try/catch wrappers
- [ ] Replace `JSON.stringify` comparison with proper deep equality or hash-based approach
- [ ] Move puzzle analysis to Web Worker to prevent UI thread blocking

#### Server Component Optimization

- [ ] Move `ThemeProvider` and `AuthProvider` into a `ClientProviders` wrapper
- [ ] Convert static pages to Server Components: `/`, `/game`, `/glossary`, theory tabs
- [ ] Add `dynamic()` imports for each game's component tree (code splitting)

### Phase 3: UI/UX & Accessibility (Week 3-4)

**Goal:** WCAG AA compliance, design system consistency, responsive design.

#### Accessibility

- [ ] Add `role="grid"`, `role="gridcell"`, `aria-label` to all game boards
- [ ] Add keyboard navigation (`tabIndex`, `onKeyDown`) to game tiles
- [ ] Add screen reader announcements for game events (match, win, loss)
- [ ] Add shape/pattern alternatives to color-coded tiles
- [ ] Fix all unlabeled form controls with proper `htmlFor`/`id` pairing
- [ ] Add data tables as alternatives to SVG charts
- [ ] Add `@media (prefers-reduced-motion: reduce)` to all animations
- [ ] Add `sr-only` text to all icon-only buttons

#### Design System Consistency

- [ ] Replace all 98 template literal classNames with `cn()` utility
- [ ] Replace all 3+ native `<input>` elements with `<Input>` component
- [ ] Centralize hardcoded HSL chart colors into CSS custom properties
- [ ] Update older shadcn/ui components from `forwardRef` to plain function pattern
- [ ] Add `Select/Combobox` component from shadcn/ui
- [ ] Add `Toast` component from shadcn/ui for async operation feedback
- [ ] Add `Skeleton` loading components
- [ ] Add confirmation dialogs for destructive actions
- [ ] Create and document z-index scale
- [ ] Fix `MoveCalculator.tsx:119` dark mode bug (`fill="white"`)

#### Responsive Design

- [ ] Make game boards responsive with container queries
- [ ] Ensure all touch targets meet 48px minimum
- [ ] Add responsive breakpoints to TabsList components
- [ ] Test and fix overflow on mobile viewports

### Phase 4: Code Quality & TypeScript (Week 4-5)

**Goal:** Strict typing, consistent patterns, modern standards.

- [ ] Remove all 6 `as any` casts -- replace with proper types
- [ ] Remove all 3 `eslint-disable` suppressions -- fix root causes
- [ ] Replace all `Math.random()` ID generation with `crypto.randomUUID()`
- [ ] Upgrade tsconfig target from `ES2017` to `ES2022`
- [ ] Add `zod` schemas for all external data boundaries (JSON import, localStorage, Supabase responses)
- [ ] Replace module-level mutable counter (`_idCounter` in LevelDesignerV2) with proper ID generation
- [ ] Wrap `AuthContext` value in `useMemo`
- [ ] Add `React.memo` with custom comparators to board components receiving `Map`/`Set` props
- [ ] Optimize game state history (command pattern with deltas instead of full copies)
- [ ] Add structured logging facade replacing `console.*`
- [ ] Add `.env.example` with all required environment variables documented

### Phase 5: Testing (Week 5-7)

**Goal:** Comprehensive test coverage across all layers.

#### Current State
- 18 test files covering `src/lib/` only
- **Zero** component tests across ~50 components
- `useStudioGame.ts` (1,437 lines) has zero test coverage
- Game simulation logic is untested

#### Testing Plan

```
Layer 1: Unit Tests (lib/)
  - [ ] Difficulty calculation functions (shared, hexa, square, fruit-match)
  - [ ] Export/import functions (juicyBlastExport, squareBlockExport)
  - [ ] Grid utilities (hexGrid, squareGrid)
  - [ ] Puzzle analyzer (puzzleAnalyzer)
  - [ ] Storage providers (localStorage, Supabase)
  - [ ] Sharing service
  - [ ] Auth utilities
  Target: 90%+ coverage on src/lib/

Layer 2: Hook Tests
  - [ ] useMatch3Game -- move execution, cascade, game over detection
  - [ ] useHexaBlockGame -- placement, clearing, scoring
  - [ ] useSquareBlockGame -- placement, clearing, deadlock
  - [ ] useFruitMatchGame -- launcher execution, matching, animations
  - [ ] useStudioGame -- state management, animation orchestration
  - [ ] useSyncedLevelCollection -- sync logic, conflict resolution
  Target: 80%+ coverage on custom hooks

Layer 3: Component Tests
  - [ ] Level designers -- form interactions, import/export
  - [ ] Game boards -- rendering, user interactions
  - [ ] Collection management -- CRUD operations
  - [ ] Chart components -- data rendering
  - [ ] Auth modal -- login/signup flows
  - [ ] Share modal -- sharing workflow
  Target: 70%+ coverage on components

Layer 4: Integration Tests
  - [ ] Full game simulation (place piece -> match -> cascade -> score)
  - [ ] Level import -> edit -> export roundtrip
  - [ ] Collection sync (local <-> Supabase)
  - [ ] Share workflow (create -> view -> import)

Layer 5: E2E Tests (Playwright)
  - [ ] Landing page loads
  - [ ] Navigate to each game page
  - [ ] Play a basic game
  - [ ] Create and edit a level
  - [ ] Import/export collection
  - [ ] Auth flow (login, signup, logout)
```

### Phase 6: Documentation (Week 7-8)

**Goal:** Comprehensive inline and project documentation.

- [ ] Add JSDoc to all public API functions in `src/lib/`
- [ ] Add JSDoc to all exported component props interfaces
- [ ] Document all game type hierarchies
- [ ] Create `README.md` with:
  - Project overview and architecture diagram
  - Getting started guide
  - Environment variable documentation
  - Game type descriptions
  - Development workflow
  - Testing guide
  - Deployment guide
- [ ] Create `.env.example` with all required/optional env vars
- [ ] Add inline comments for complex algorithms (puzzle analyzer, difficulty curves, sawtooth)
- [ ] Document the storage provider pattern and sync strategy
- [ ] Document the export format specifications

---

## 7. File Impact Summary

### Files to DELETE (Phase 1)

```
src/components/game/GameBoard.tsx
src/components/game/GameStatus.tsx
src/components/game/LevelConfigurator.tsx
src/components/hex/HexGrid.tsx
src/components/games/fruit-match/FruitMatchLevelDesigner.tsx
src/types/level.ts
```

### Files to CREATE (Phase 1-2)

```
src/types/shared.ts                              # Common types
src/lib/difficulty.ts                            # Shared difficulty functions
src/components/layout/PageHeader.tsx             # Reusable page header
src/components/layout/GameLayout.tsx             # Game page layout
src/components/games/fruit-match/designer/       # Decomposed designer
src/components/games/hexa-block/designer/        # Decomposed designer
src/components/games/square-block/designer/      # Decomposed designer
.env.example                                     # Environment template
```

### Files to HEAVILY MODIFY (Phase 1-4)

```
src/types/hexaBlock.ts           # Remove duplicated types/functions
src/types/squareBlock.ts         # Remove duplicated types/functions, fix circular dep
src/types/fruitMatch.ts          # Reference shared types
src/lib/constants.ts             # Consolidate shared constants
src/lib/utils.ts                 # Add consolidated utilities
src/app/globals.css              # Merge duplicate keyframes
package.json                     # Fix name, audit deps
tsconfig.json                    # Upgrade target
```

---

## 8. Estimated Impact

| Metric | Before | After |
|--------|--------|-------|
| Total Lines | ~54,400 | ~45,000 (est.) |
| Dead Code | ~3,200 lines | 0 |
| Duplicated Code | ~750+ lines | <50 lines |
| Max Component Size | 2,888 lines | <300 lines |
| Test Files | 18 | ~80+ |
| Test Coverage (lib/) | ~40% | 90%+ |
| Test Coverage (components) | 0% | 70%+ |
| Accessibility Score | ~20/100 | 85+/100 |
| `console.log` in prod | 85 | 0 |
| `as any` casts | 6 | 0 |
| Security Vulnerabilities | 2 critical, 3 high | 0 |
| Error Boundaries | 0 | 6+ |
| ARIA attributes (custom) | 0 | 100+ |

---

## 9. Dependencies to Add

| Package | Purpose | Phase |
|---------|---------|-------|
| `zod` | Schema validation for all external data | 0 |
| `@playwright/test` | E2E testing | 5 |
| `sonner` or `@radix-ui/react-toast` | Toast notifications | 3 |

## 10. Dependencies to Remove (verify first)

| Package | Reason |
|---------|--------|
| `@twemoji/api` | Verify usage |
| `pixelit` | Stale, possibly unused |

---

*This plan should be executed incrementally. Each phase builds on the previous. Phase 0 (security) is urgent. Phases 1-2 provide the foundation for everything else. Phases 3-6 can be parallelized across team members.*
