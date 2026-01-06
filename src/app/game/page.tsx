import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Gamepad2, Hexagon, Square } from 'lucide-react';
import Link from 'next/link';

const games = [
  {
    id: 'match-3',
    title: 'Match-3 Demo',
    description: 'Classic tile-matching puzzle. Swap adjacent tiles to create matches of 3 or more.',
    href: '/game/match-3',
    icon: Gamepad2,
    status: 'ready' as const,
    color: 'from-purple-500/20 to-pink-500/20',
    borderColor: 'border-purple-500/30 hover:border-purple-500/50',
  },
  {
    id: 'hexa-block',
    title: 'Hexa Block Away',
    description: 'Logic puzzle on a hexagonal grid. Tap stacks to roll them off the board in the right order.',
    href: '/game/hexa-block',
    icon: Hexagon,
    status: 'ready' as const,
    color: 'from-cyan-500/20 to-blue-500/20',
    borderColor: 'border-cyan-500/30 hover:border-cyan-500/50',
  },
  {
    id: 'square-block',
    title: 'Square Block Away',
    description: 'Same puzzle on a rectangular grid. Tap blocks to slide them off in 4 directions.',
    href: '/game/square-block',
    icon: Square,
    status: 'ready' as const,
    color: 'from-amber-500/20 to-orange-500/20',
    borderColor: 'border-amber-500/30 hover:border-amber-500/50',
  },
];

export default function GameSelectorPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Game Demos</h1>
        <p className="text-muted-foreground mt-2 text-sm lg:text-base">
          Test level design framework concepts with playable game prototypes.
          Each game demonstrates different puzzle mechanics and difficulty tuning.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {games.map((game) => (
          <Link key={game.id} href={game.href}>
            <Card
              className={`h-full bg-gradient-to-br ${game.color} ${game.borderColor} transition-all cursor-pointer hover:scale-[1.02]`}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="p-3 rounded-xl bg-background/50">
                    <game.icon className="h-8 w-8" />
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {game.status === 'ready' ? 'Playable' : 'Coming Soon'}
                  </Badge>
                </div>
                <CardTitle className="mt-4">{game.title}</CardTitle>
                <CardDescription className="text-sm">{game.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-xs text-muted-foreground">
                  Click to play →
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Framework Integration</CardTitle>
          <CardDescription>
            These demos help validate level design decisions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3 text-sm">
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="font-medium">Difficulty Testing</p>
              <p className="text-xs text-muted-foreground mt-1">
                Adjust parameters and observe win/loss outcomes to calibrate difficulty tiers
              </p>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="font-medium">Outcome Analysis</p>
              <p className="text-xs text-muted-foreground mt-1">
                See near-loss wins and almost-win losses in action - the emotional sweet spots
              </p>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="font-medium">Cognitive Load</p>
              <p className="text-xs text-muted-foreground mt-1">
                Experience how move limits and objectives affect System 1 vs System 2 thinking
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
