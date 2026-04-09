# Handover Guide

## Project Snapshot

- Project: LevelForge
- Reviewed on: April 9, 2026
- Stack: Next.js 16, React 19, TypeScript, Tailwind 4, Vitest, optional Supabase
- Primary purpose: puzzle level design, prototype gameplay, balancing, and collection sharing

## What Is In Good Shape

- Core app boots and runs locally
- All automated tests currently pass
- Lint no longer fails on errors
- Offline-first authoring remains intact
- Auth/sync/sharing degrade gracefully when Supabase is not configured

## Cleanup Completed In This Pass

- Removed all current lint errors so the repo is handover-safe to work in
- Refactored several React 19 / compiler-sensitive patterns that were triggering hook-rule failures
- Stabilized shared-import tab transitions for game pages
- Reworked some chart/tooling components to avoid render-time component creation and effect anti-patterns
- Replaced the thin top-level README with a fuller onboarding entry point
- Added dedicated architecture, development, and handover documentation
- Added `.env.example` for faster onboarding

## Verification

Commands run during handover prep:

- `npm run lint`
- `npm run test:run`

Results:

- Lint passes with warnings
- Tests pass: 20 files, 800 tests

## Known Remaining Debt

These are the main things the next team should know before taking ownership:

### Warning-level lint backlog

`npm run lint` still reports warning debt across older files. The dominant themes are:

- unused imports/variables in legacy modules
- large editor components with callback dependency warnings
- older chart files with cleanup opportunities

This is real debt, but it is not blocking day-to-day work.

### Large files

The biggest refactor candidates are:

- [src/components/games/fruit-match/LevelDesignerV2.tsx](/Users/reza/Workspace/levelforge/src/components/games/fruit-match/LevelDesignerV2.tsx)
- [src/lib/studioGameLogic.ts](/Users/reza/Workspace/levelforge/src/lib/studioGameLogic.ts)
- [src/components/games/square-block/SquareBlockLevelDesigner.tsx](/Users/reza/Workspace/levelforge/src/components/games/square-block/SquareBlockLevelDesigner.tsx)
- [src/components/games/hexa-block/HexBlockLevelDesigner.tsx](/Users/reza/Workspace/levelforge/src/components/games/hexa-block/HexBlockLevelDesigner.tsx)

### Test noise

The test suite passes, but some storage tests emit stderr noise from:

- expected invalid JSON paths
- IndexedDB unavailability in jsdom
- async hook update warnings in some test helpers

This is more of a cleanliness issue than a correctness issue.

### Naming consistency

Some older storage keys still use the legacy `echo-level-workbench` name. That does not break the app, but it can confuse people who are new to the repo.

## Access Checklist For The Dev Team

Before the team takes full ownership, confirm:

1. Who owns the Supabase project and who can manage auth providers.
2. The values for `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3. Whether Google OAuth should stay enabled and what callback URLs are registered.
4. Who owns deployment hosting and environment-variable rotation.
5. Whether shared collection URLs are already used in production-like flows.

## Recommended First-Week Plan

1. Stand up one shared team environment with Supabase enabled and verify auth/share flows end to end.
2. Pick one large editor module and start extracting smaller hooks/helpers instead of adding more logic inline.
3. Decide whether lint warnings should be burned down gradually or enforced as part of a formal cleanup sprint.
4. Add schema/RLS documentation for Supabase if it exists outside the repo today.

## Suggested Ownership Split

- Frontend/UI: `src/app`, `src/components`
- Gameplay logic: `src/lib/use*Game.ts`, analyzers, exporters
- Platform/data: `src/lib/storage`, `src/lib/supabase`, `src/lib/sharing`
- Quality: test cleanup, warning reduction, refactor program

## Final Recommendation

This repo is handover-ready for an engineering team, but not "finished." The critical path is stable and documented; the next wave of work should focus on warning reduction and breaking down the largest modules before adding major new features.
