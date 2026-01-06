# LevelForge

**Puzzle Level Design Workbench**

An interactive toolkit for designing engaging puzzle game levels based on industry best practices from King, Dream Games, Peak Games, and Rovio.

![Next.js](https://img.shields.io/badge/Next.js-15-black?style=flat-square&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=flat-square&logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-38B2AC?style=flat-square&logo=tailwind-css)
![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)

---

## Features

### Interactive Visualizations

- **Sawtooth Difficulty Curve** - Visualize and design the 10-level difficulty cycle pattern used by top puzzle games. Supports 10-500 levels with adjustable baseline progression.

- **Flow State Chart** - Interactive visualization of the Flow State theory showing the balance between player skill and challenge difficulty. Understand the zones of boredom, frustration, and optimal engagement.

- **Flow-Sawtooth Bridge** - See how Flow State theory connects to practical difficulty curves with side-by-side animated visualizations.

- **Cognitive Balance** - Balance System 1 (automatic/intuitive) vs System 2 (deliberate/analytical) thinking across different game phases.

- **Emotional Spectrum** - Engineer player emotions through outcome design: near-loss wins, almost-win losses, and the psychology of engagement.

### Design Tools

- **Level Duration Calculator** - Industry benchmarks for level timing across genres (Match-3, Merge, Solitaire, Word games). Calculate optimal move counts based on level progression.

- **Move Calculator** - Determine recommended move limits by level range with visual progression charts.

- **Playable Match-3 Demo** - Test framework concepts with a fully playable game. Configure board size, move limits, color count, and objectives in real-time.

### Reference Materials

- **Comprehensive Glossary** - 40+ game design terms with definitions, search, and category filtering. Topics include flow state, sawtooth curve, cognitive modes, difficulty tiers, and more.

- **Industry Benchmarks** - Data-driven insights from Royal Match, Candy Crush, Merge Mansion, and other top-performing titles.

---

## Screenshots

| Dashboard | Sawtooth Curve | Flow State |
|:---------:|:--------------:|:----------:|
| Overview of all tools | 10-level difficulty cycles | Skill vs Challenge zones |

| Game Demo | Glossary | Calculator |
|:---------:|:--------:|:----------:|
| Playable Match-3 | 40+ terms | Level duration tools |

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

| Technology | Purpose |
|------------|---------|
| **Next.js 15** | React framework with App Router |
| **TypeScript** | Type-safe development |
| **Tailwind CSS 4** | Utility-first styling |
| **shadcn/ui** | Accessible UI components |
| **Recharts** | Composable chart library |
| **next-themes** | Dark/light mode support |
| **Lucide React** | Beautiful icons |

---

## Project Structure

```
src/
├── app/
│   ├── page.tsx           # Dashboard
│   ├── sawtooth/          # Sawtooth curve visualizer
│   ├── cognitive/         # Cognitive balance tool
│   ├── emotional/         # Emotional design charts
│   ├── calculator/        # Level duration calculator
│   ├── game/              # Match-3 demo
│   └── glossary/          # Terminology reference
├── components/
│   ├── ui/                # shadcn/ui components
│   ├── charts/            # Visualization components
│   ├── game/              # Game demo components
│   └── layout/            # App shell & navigation
├── lib/
│   ├── constants.ts       # Framework data & benchmarks
│   ├── calculations.ts    # Design formulas
│   └── utils.ts           # Utility functions
└── types/
    └── game.ts            # TypeScript definitions
```

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

### Difficulty Tiers

| Tier | Win Rate | Attempts |
|------|----------|----------|
| Easy | 70-90% | 1-3 |
| Medium | 40-60% | 4-8 |
| Hard | 25-40% | 9-20 |
| Super Hard | 20-30% | 20-35+ |

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
