import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Brain, Heart, Calculator, BookOpen, CheckSquare, Gamepad2 } from "lucide-react";
import Link from "next/link";

const tools = [
  {
    title: "Sawtooth Difficulty Curve",
    description: "Visualize and design the 10-level difficulty cycle pattern",
    href: "/sawtooth",
    icon: TrendingUp,
    status: "ready",
  },
  {
    title: "Cognitive Balance",
    description: "Balance System 1 (automatic) vs System 2 (deliberate) thinking",
    href: "/cognitive",
    icon: Brain,
    status: "ready",
  },
  {
    title: "Emotional Spectrum",
    description: "Engineer near-loss wins and almost-win losses",
    href: "/emotional",
    icon: Heart,
    status: "ready",
  },
  {
    title: "Move Calculator",
    description: "Calculate recommended move limits by level range",
    href: "/calculator",
    icon: Calculator,
    status: "ready",
  },
];

const principles = [
  "Make the Goal Easily Understood",
  "Make it Easy to Get Started",
  "Give a Sense of Progress",
  "Give a Sense of Solvability",
  "Increase Difficulty Gradually",
  "Use Parallelism to Prevent Bottlenecks",
  "Apply Pyramid Structure",
  "Hints Extend Interest",
  "Eventually Give the Answer",
  "Use Perceptual Shifts Cautiously",
];

export default function Dashboard() {
  return (
    <div className="space-y-6 lg:space-y-8">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">LevelForge</h1>
        <p className="text-muted-foreground mt-2 text-sm lg:text-base">
          Interactive tools for designing engaging puzzle experiences based on industry best practices.
        </p>
      </div>

      {/* Featured: Game Demo */}
      <Link href="/game" className="block mb-6">
        <Card className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 border-purple-500/20 hover:border-purple-500/40 transition-colors cursor-pointer">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500 rounded-lg">
                <Gamepad2 className="h-6 w-6 text-white" />
              </div>
              <div>
                <CardTitle>Match-3 Game Demo</CardTitle>
                <CardDescription>
                  Test framework concepts with a playable game. Configure levels and see outcomes in real-time.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
        </Card>
      </Link>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {tools.map((tool) => (
          <Link key={tool.href} href={tool.href}>
            <Card className="h-full transition-colors hover:bg-accent/50 cursor-pointer">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{tool.title}</CardTitle>
                <tool.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">{tool.description}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Core Design Principles
            </CardTitle>
            <CardDescription>
              The 10 foundational principles of puzzle design
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {principles.map((principle, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Badge variant="outline" className="w-6 h-6 flex items-center justify-center p-0 text-xs">
                    {i + 1}
                  </Badge>
                  <span className="text-sm">{principle}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckSquare className="h-5 w-5" />
              Quick Reference
            </CardTitle>
            <CardDescription>
              Key metrics and targets
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium">Win Rate Targets</p>
                <div className="flex flex-wrap gap-2 mt-1">
                  <Badge className="bg-green-500">Easy: 70-90%</Badge>
                  <Badge className="bg-yellow-500">Medium: 40-60%</Badge>
                  <Badge className="bg-orange-500">Hard: 25-40%</Badge>
                  <Badge className="bg-red-500">Super Hard: 20-30%</Badge>
                </div>
              </div>
              <div>
                <p className="text-sm font-medium">Sawtooth Cycle</p>
                <p className="text-xs text-muted-foreground">
                  10-level pattern: Easy recovery → Rising → Hard spike (5) → Dip → Rising → Super Hard peak (10)
                </p>
              </div>
              <div className="p-3 rounded-lg bg-gradient-to-r from-amber-500/20 to-yellow-500/20 border border-amber-500/30">
                <p className="text-sm font-semibold text-amber-400">The Golden Rule</p>
                <p className="text-sm text-amber-100/90 italic mt-1">
                  &quot;Make players feel losses are their own fault, not the game&apos;s.&quot;
                </p>
                <p className="text-xs text-amber-200/70 mt-2">
                  When players fail, they should think &quot;I could beat it next time if I play better&quot; — not that the game cheated. This keeps players retrying instead of quitting.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
