# LevelForge

LevelForge is a Next.js workbench for designing, testing, and tuning puzzle-game levels. It combines playable prototypes, level editors, difficulty-analysis tools, and optional Supabase-backed sharing so designers and engineers can iterate on puzzle content in one place.

Last reviewed: April 9, 2026

## What This Repo Includes

| Area | Route | Purpose |
| --- | --- | --- |
| Dashboard | `/` | Entry point and tool directory |
| Match-3 demo | `/game/match-3` | Lightweight playable prototype |
| Hexa Block Away | `/game/hexa-block` | Hex-grid puzzle editor, player, and collection tools |
| Tap Music / Square Block | `/game/square-block` | Square-grid puzzle editor, player, and collection tools |
| Juicy Blast / Fruit Match | `/game/fruit-match` | Pixel-art puzzle designer, analyzer, and collection tools |
| Shared collections | `/shared/[code]` | Public collection preview and import flow |
| Design tools | `/sawtooth`, `/calculator`, `/cognitive`, `/emotional`, `/glossary` | Reference and balancing utilities |

## Stack

- Next.js 16 with App Router
- React 19 + TypeScript
- Tailwind CSS 4
- Recharts for charts and analysis views
- Vitest + Testing Library for automated tests
- Optional Supabase for auth, sync, and shared links

## Quick Start

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

### Useful Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run test:run
```

## Environment

The app runs without Supabase in offline/local mode. To enable auth, sync, and sharing, add:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

See [.env.example](./.env.example).

## Current Quality Snapshot

As of April 9, 2026:

- `npm run test:run` passes: 20 test files, 800 tests
- `npm run lint` passes with warnings
- The app supports offline-first local authoring even when Supabase is not configured

The main remaining cleanup area is warning-level lint debt in older modules, especially large editor files and legacy chart/components.

## Architecture At A Glance

- `src/app`: App Router pages and route entry points
- `src/components/games`: Game-specific UI, designers, boards, collections
- `src/lib`: Gameplay hooks, storage, exporters, analyzers, auth/sharing logic
- `src/types`: Domain models for each game

The storage model is intentionally layered:

1. IndexedDB/local persistence for fast offline authoring
2. localStorage fallback where needed
3. optional Supabase sync and public share links

## Docs

- [Architecture](./docs/ARCHITECTURE.md)
- [Development Guide](./docs/DEVELOPMENT.md)
- [Handover Guide](./docs/HANDOVER.md)

## Notes For The Incoming Team

- Some older storage keys and identifiers still use the historic `echo-level-workbench` naming. This is legacy client-side naming, not a separate product.
- Square Block currently has the most advanced multi-collection workflow.
- Supabase tables referenced by the client are `level_collections`, `levels`, and `shared_collections`.

