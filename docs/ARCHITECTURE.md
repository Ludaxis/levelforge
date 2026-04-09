# Architecture

## Overview

LevelForge is a client-heavy Next.js application with an offline-first editing workflow. Most product logic lives in React components and domain hooks under `src/lib`, while Supabase acts as an optional persistence and sharing layer rather than a hard runtime dependency.

## Main Building Blocks

### App Router

`src/app` contains the route entry points:

- `/`: dashboard
- `/game`: game selector
- `/game/match-3`: simple playable match-3 prototype
- `/game/hexa-block`: hex puzzle editor, collection management, play view, theory tab
- `/game/square-block`: square puzzle editor, play view, multi-collection management
- `/game/fruit-match`: fruit-match designer, collection tools, solvability analysis
- `/shared/[code]`: public shared collection viewer/importer
- `/auth` and `/auth/callback`: optional authentication flow
- `/calculator`, `/cognitive`, `/emotional`, `/glossary`, `/sawtooth`: analysis/reference tools

### UI Layer

`src/components` is split by concern:

- `components/ui`: shared primitives
- `components/layout`: shell and error boundary
- `components/charts`: framework and balancing visualizations
- `components/games/*`: game-specific boards, designers, collection UIs, and helpers
- `components/sharing`: share modal flow

### Domain Logic

`src/lib` contains most business logic:

- `useMatch3Game.ts`
- `useHexaBlockGame.ts`
- `useSquareBlockGame.ts`
- `useFruitMatchGame.ts`
- `studioGameLogic.ts`
- `puzzleAnalyzer.ts`
- `fruitMatchDifficulty.ts`
- `fruitMatchOrderDifficulty.ts`
- exporters/importers such as `juicyBlastExport.ts` and `squareBlockExport.ts`

### Types

`src/types` provides game-specific shapes for levels, metrics, tiles, and runtime state. The type modules are widely reused across boards, designers, collections, and tests.

## Storage And Sync

The app is designed to keep authoring usable without a backend.

### Local-first path

- IndexedDB is the primary local persistence layer for synced collections.
- localStorage is used as a fallback and for smaller pieces of UI/session data.
- Several screens can function fully without authentication.

### Supabase path

When `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are present:

- auth becomes available
- collections can sync to Supabase
- share links become available

Client-side table usage is modeled in [src/lib/supabase/types.ts](/Users/reza/Workspace/levelforge/src/lib/supabase/types.ts):

- `level_collections`
- `levels`
- `shared_collections`

### Important nuance

There is legacy local naming such as `echo-level-workbench-device-id` in [src/lib/supabase/client.ts](/Users/reza/Workspace/levelforge/src/lib/supabase/client.ts). It is safe, but worth standardizing later if the team wants naming consistency.

## Auth And Sharing

- Auth state is provided by [src/lib/auth/AuthContext.tsx](/Users/reza/Workspace/levelforge/src/lib/auth/AuthContext.tsx)
- Supabase client/bootstrap lives in [src/lib/supabase/client.ts](/Users/reza/Workspace/levelforge/src/lib/supabase/client.ts)
- Share link creation and lookup live in [src/lib/sharing/sharingService.ts](/Users/reza/Workspace/levelforge/src/lib/sharing/sharingService.ts)

If Supabase is not configured, the app degrades gracefully to local-only mode.

## Testing

- Unit and hook tests live under `src/lib/__tests__`
- The repo currently has strong logic coverage around game hooks, exporters, analyzers, and storage adapters
- Tests pass, but some suites still emit expected stderr noise from mocked failure paths and async state timing

## Current Hotspots

The biggest maintainability hotspots are still the large editor and logic modules:

- [src/components/games/fruit-match/LevelDesignerV2.tsx](/Users/reza/Workspace/levelforge/src/components/games/fruit-match/LevelDesignerV2.tsx)
- [src/lib/studioGameLogic.ts](/Users/reza/Workspace/levelforge/src/lib/studioGameLogic.ts)
- [src/components/games/square-block/SquareBlockLevelDesigner.tsx](/Users/reza/Workspace/levelforge/src/components/games/square-block/SquareBlockLevelDesigner.tsx)
- [src/components/games/hexa-block/HexBlockLevelDesigner.tsx](/Users/reza/Workspace/levelforge/src/components/games/hexa-block/HexBlockLevelDesigner.tsx)

These files are good candidates for future extraction into smaller hooks/helpers.

## Recommended Next Architecture Steps

1. Reduce warning-level lint debt in legacy modules.
2. Break large designer files into smaller hooks and presentational subcomponents.
3. Document or version the Supabase schema and RLS expectations alongside the app.
4. Normalize old storage naming so the product identity is consistent everywhere.

