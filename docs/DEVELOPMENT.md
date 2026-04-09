# Development Guide

## Local Setup

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Environment Modes

### Offline/local mode

Works without any environment variables.

Use this mode for:

- UI work
- gameplay iteration
- level authoring
- chart and analysis tooling

### Supabase-enabled mode

Set the variables in [.env.example](/Users/reza/Workspace/levelforge/.env.example):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Use this mode for:

- auth
- collection sync
- public sharing

## Common Commands

```bash
npm run dev
npm run lint
npm run test:run
npm run build
```

## Day-To-Day Workflow

### Working on a game module

1. Start from the route under `src/app/game/*/page.tsx`
2. Follow the UI components in `src/components/games/<game>`
3. Follow runtime/state hooks in `src/lib`
4. Update or add tests under `src/lib/__tests__`

### Working on storage or sharing

Start with:

- [src/lib/storage/useSyncedLevelCollection.ts](/Users/reza/Workspace/levelforge/src/lib/storage/useSyncedLevelCollection.ts)
- [src/lib/storage/useMultipleCollections.ts](/Users/reza/Workspace/levelforge/src/lib/storage/useMultipleCollections.ts)
- [src/lib/storage/supabase.ts](/Users/reza/Workspace/levelforge/src/lib/storage/supabase.ts)
- [src/lib/sharing/sharingService.ts](/Users/reza/Workspace/levelforge/src/lib/sharing/sharingService.ts)

### Working on auth

Start with:

- [src/lib/auth/AuthContext.tsx](/Users/reza/Workspace/levelforge/src/lib/auth/AuthContext.tsx)
- [src/lib/supabase/client.ts](/Users/reza/Workspace/levelforge/src/lib/supabase/client.ts)
- [src/app/auth/page.tsx](/Users/reza/Workspace/levelforge/src/app/auth/page.tsx)
- [src/app/auth/callback/route.ts](/Users/reza/Workspace/levelforge/src/app/auth/callback/route.ts)

## Current Verification Baseline

As of April 9, 2026:

- `npm run test:run` passes
- `npm run lint` passes with warnings

Some warning debt is historical and concentrated in older editor/chart files. Treat that as a cleanup backlog, not a fresh regression.

## Team Conventions To Preserve

- Keep offline authoring working even when Supabase is unavailable
- Prefer domain logic in `src/lib` rather than inside page components
- Keep import/export compatibility stable for stored levels and share flows
- Add tests for game logic and storage changes whenever practical

## Known Friction Points

- The largest editor files are expensive to review and easy to regress
- Some test suites emit noisy stderr from mocked failures and async hook timing
- Lint is clean on errors, but not yet clean on warnings

