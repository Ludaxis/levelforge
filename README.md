# LevelForge

**Puzzle Level Design Workbench**

An interactive toolkit for designing engaging puzzle game levels based on industry best practices from King, Dream Games, Peak Games, and Rovio.

![Next.js](https://img.shields.io/badge/Next.js-16.1.1-black?style=flat-square&logo=next.js)
![React](https://img.shields.io/badge/React-19.2.3-61DAFB?style=flat-square&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=flat-square&logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-38B2AC?style=flat-square&logo=tailwind-css)
![Vitest](https://img.shields.io/badge/Vitest-3.2.4-6E9F18?style=flat-square&logo=vitest)
![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)

---

## Features

### Playable Game Demos

Three fully playable puzzle games with configurable mechanics and level design tools:

| Game | Route | Key Features |
|------|-------|--------------|
| **Match-3 Puzzle** | `/game/match-3/` | Configurable board size, color count, move limits, and objectives |
| **Hexa Block Away** | `/game/hexa-block/` | Holes, pauses, carousels, bidirectional arrows, level designer |
| **Square Block Away** | `/game/square-block/` | Ice, locked, mirror mechanics, holes, puzzle analyzer |

### Interactive Visualizations

- **Sawtooth Difficulty Curve** - Visualize and design the 10-level difficulty cycle pattern used by top puzzle games. Supports 10-500 levels with adjustable baseline progression.

- **Flow State Chart** - Interactive visualization of the Flow State theory showing the balance between player skill and challenge difficulty. Understand the zones of boredom, frustration, and optimal engagement.

- **Flow-Sawtooth Bridge** - See how Flow State theory connects to practical difficulty curves with side-by-side animated visualizations.

- **Cognitive Balance** - Balance System 1 (automatic/intuitive) vs System 2 (deliberate/analytical) thinking across different game phases.

- **Emotional Spectrum** - Engineer player emotions through outcome design: near-loss wins, almost-win losses, and the psychology of engagement.

### Design Tools

- **Level Designer** - Interactive level creation with real-time metrics for Hexa Block and Square Block games.

- **Puzzle Analyzer** - Solvability analysis, branching factor calculation, and difficulty scoring for puzzle levels.

- **Level Collections** - Save, manage, and export level packs with difficulty curve visualization.

- **Level Duration Calculator** - Industry benchmarks for level timing across genres (Match-3, Merge, Solitaire, Word games). Calculate optimal move counts based on level progression.

- **Move Calculator** - Determine recommended move limits by level range with visual progression charts.

### Reference Materials

- **Comprehensive Glossary** - 40+ game design terms with definitions, search, and category filtering. Topics include flow state, sawtooth curve, cognitive modes, difficulty tiers, and more.

- **Industry Benchmarks** - Data-driven insights from Royal Match, Candy Crush, Merge Mansion, and other top-performing titles.

---

## Game Mechanics

### Hexa Block Away

| Mechanic | Description |
|----------|-------------|
| **Holes** | Stacks fall through and disappear from the board |
| **Pauses** | Blocks stop here, require second tap to continue |
| **Carousels** | Rotate adjacent tiles clockwise when triggered |
| **Bidirectional Arrows** | Two exit direction options for the player |

### Square Block Away

| Mechanic | Code | Description |
|----------|------|-------------|
| **Ice** | 2+N | Block frozen for N moves before it can act |
| **Locked** | 3 | Requires adjacent neighbors to be cleared first |
| **Mirror** | 4 | Moves in the opposite direction from input |
| **Holes** | - | Blocks fall through and are removed |

---

## Screenshots

| Dashboard | Sawtooth Curve | Flow State |
|:---------:|:--------------:|:----------:|
| Overview of all tools | 10-level difficulty cycles | Skill vs Challenge zones |

| Match-3 Demo | Hexa Block Demo | Square Block Demo |
|:------------:|:---------------:|:-----------------:|
| Classic match-3 gameplay | Hex grid with special mechanics | Square grid with ice/mirror |

| Level Designer | Puzzle Analyzer |
|:--------------:|:---------------:|
| Interactive level creation | Solvability and difficulty metrics |

---

## Quick Start

### Prerequisites

- Node.js 18.17 or later
- npm, yarn, pnpm, or bun

### Installation

```bash
# Clone the repository
git clone git@github.com:Ludaxis/levelforge.git
cd levelforge

# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

---

## Tech Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| **Next.js** | 16.1.1 | React framework with App Router |
| **React** | 19.2.3 | UI library |
| **TypeScript** | 5 | Type-safe development |
| **Tailwind CSS** | 4 | Utility-first styling |
| **Vitest** | 3.2.4 | Unit testing framework |
| **Recharts** | 2.15.4 | Composable chart library |
| **shadcn/ui** | - | Accessible UI components |
| **next-themes** | - | Dark/light mode support |
| **Lucide React** | - | Beautiful icons |

---

## Project Structure

```
src/
├── app/
│   ├── page.tsx               # Dashboard
│   ├── game/
│   │   ├── page.tsx           # Game index
│   │   ├── match-3/           # Match-3 puzzle game
│   │   ├── hexa-block/        # Hexa Block Away game
│   │   └── square-block/      # Square Block Away game
│   ├── sawtooth/              # Sawtooth curve visualizer
│   ├── cognitive/             # Cognitive balance tool
│   ├── emotional/             # Emotional design charts
│   ├── calculator/            # Level duration calculator
│   └── glossary/              # Terminology reference
├── components/
│   ├── ui/                    # shadcn/ui components
│   ├── charts/                # Visualization components (7 charts)
│   ├── games/
│   │   ├── match-3/           # Match-3 game components
│   │   ├── hexa-block/        # Hexa Block game components
│   │   └── square-block/      # Square Block game components
│   ├── hex/                   # Hex grid rendering
│   └── layout/                # App shell & navigation
├── lib/
│   ├── useMatch3Game.ts       # Match-3 game logic hook
│   ├── useHexaBlockGame.ts    # Hexa Block game logic hook
│   ├── useSquareBlockGame.ts  # Square Block game logic hook
│   ├── puzzleAnalyzer.ts      # Solvability & difficulty analysis
│   ├── hexGrid.ts             # Hex grid utilities
│   ├── squareGrid.ts          # Square grid utilities
│   ├── levelCodec.ts          # Level encoding/decoding
│   ├── constants.ts           # Framework data & benchmarks
│   └── utils.ts               # Utility functions
└── types/
    ├── game.ts                # Match-3 type definitions
    ├── level.ts               # Level framework types
    ├── hexaBlock.ts           # Hexa Block types
    └── squareBlock.ts         # Square Block types
```

---

## Level Design Features

### Level Designer

Create levels interactively with:
- Click-to-place tile mechanics
- Real-time difficulty metrics
- Export to level code format
- Zoom and pan controls (Ctrl+Wheel to zoom)

### Puzzle Analyzer

Automatic analysis including:
- **Solvability**: Can the puzzle be solved?
- **Branching Factor**: Average choices per move
- **Difficulty Score**: Composite difficulty rating
- **Move Sequence**: Optimal solution path

### Level Collections

Manage level packs with:
- Import/export level sets
- Difficulty curve visualization
- Bulk editing capabilities

---

## Core Concepts

### The Sawtooth Pattern

A 10-level difficulty cycle proven effective in top puzzle games:

| Position | Difficulty | Purpose |
|----------|------------|---------|
| 1-2 | Easy | Victory lap / Recovery |
| 3-4 | Medium | Testing learned skills |
| 5 | Hard | Mid-cycle spike |
| 6-7 | Medium | Brief dip / Relief |
| 8-9 | Hard | Rising tension |
| 10 | Super Hard | Cycle peak |

### Level Archetypes

| Archetype | Purpose | Example |
|-----------|---------|---------|
| **Tutorial** | Teach a single mechanic | First ice block level |
| **Demonstration** | Show mechanic combinations | Ice + mirrors together |
| **Constraint** | Limit available moves | Tight move count |
| **Sandbox** | Free exploration | Large board, many moves |
| **Precision** | Require exact sequences | Single solution path |
| **Recovery** | Easy win after hard level | Simple layout |
| **Gatekeeper** | Test mastery before progression | Cycle peak level |
| **Showcase** | Highlight unique board shapes | Special formations |

### Difficulty Tiers

| Tier | Win Rate | Attempts |
|------|----------|----------|
| Easy | 70-90% | 1-3 |
| Medium | 40-60% | 4-8 |
| Hard | 25-40% | 9-20 |
| Super Hard | 20-30% | 20-35+ |

### Quality Checklist

When designing levels, verify:

| Category | Checkpoints |
|----------|-------------|
| **Goal Clarity** | Objective is immediately obvious |
| **Difficulty Pacing** | Matches position in sawtooth cycle |
| **Mechanic Introduction** | New mechanics taught before testing |
| **Visual Clarity** | Board state easy to parse |
| **Solution Variety** | Multiple valid approaches (usually) |
| **Feedback Quality** | Clear success/failure signals |

### Cognitive Modes

| Phase | System 1 | System 2 | Levels |
|-------|----------|----------|--------|
| Onboarding | 90% | 10% | 1-20 |
| Early Game | 70% | 30% | 21-50 |
| Mid Game | 60% | 40% | 51-100 |
| Hard Levels | 40% | 60% | Spikes |
| Super Hard | 20% | 80% | Peaks |

---

## Development

```bash
# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run linting
npm run lint

# Run tests in watch mode
npm test

# Run tests once
npm run test:run
```

---

## Deployment

Deploy easily on [Vercel](https://vercel.com):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Ludaxis/levelforge)

Or build and deploy anywhere that supports Node.js:

```bash
npm run build
npm start
```

---

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## Acknowledgments

- Framework concepts derived from industry research on King, Dream Games, Peak Games, and Rovio
- UI components from [shadcn/ui](https://ui.shadcn.com/)
- Charts powered by [Recharts](https://recharts.org/)

---

**Built with care for game designers who craft delightful puzzle experiences.**
