'use client';

import { useState, useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Cell,
  LineChart,
  Line,
  ComposedChart,
  Area,
  Tooltip,
  Legend,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Clock, Target, TrendingUp, Users, Gamepad2, BarChart3, Info } from 'lucide-react';

// Progression Stage Data
const PROGRESSION_STAGES = [
  { stage: '1-10', label: 'Tutorial', minDuration: 30, maxDuration: 60, minMoves: 10, maxMoves: 12, focus: 'Single mechanics' },
  { stage: '11-30', label: 'Basic Mastery', minDuration: 60, maxDuration: 90, minMoves: 12, maxMoves: 15, focus: 'Basic mechanic mastery' },
  { stage: '31-100', label: 'Core Game', minDuration: 90, maxDuration: 150, minMoves: 15, maxMoves: 20, focus: 'Core game experience' },
  { stage: '101-500', label: 'Mid-Late', minDuration: 120, maxDuration: 180, minMoves: 15, maxMoves: 25, focus: 'Increased complexity' },
  { stage: '500-1000', label: 'Expert', minDuration: 120, maxDuration: 240, minMoves: 18, maxMoves: 30, focus: 'Expert difficulty spikes' },
  { stage: '1000+', label: 'Veteran', minDuration: 120, maxDuration: 300, minMoves: 20, maxMoves: 35, focus: 'Veteran player design' },
];

// Genre Benchmarks
const GENRE_BENCHMARKS = [
  { genre: 'Match-3', minLevel: 120, maxLevel: 240, minSession: 180, maxSession: 420, limitType: 'Move-based', color: 'hsl(262, 83%, 58%)' },
  { genre: 'Hyper-Casual', minLevel: 30, maxLevel: 120, minSession: 180, maxSession: 360, limitType: 'None/minimal', color: 'hsl(142, 76%, 36%)' },
  { genre: 'Word Puzzle', minLevel: 60, maxLevel: 300, minSession: 240, maxSession: 600, limitType: 'None', color: 'hsl(199, 89%, 48%)' },
  { genre: 'Physics Puzzle', minLevel: 30, maxLevel: 180, minSession: 300, maxSession: 600, limitType: 'Skill-based', color: 'hsl(25, 95%, 53%)' },
  { genre: 'Premium Puzzle', minLevel: 300, maxLevel: 900, minSession: 900, maxSession: 1800, limitType: 'None', color: 'hsl(45, 93%, 47%)' },
  { genre: 'Bubble Shooter', minLevel: 120, maxLevel: 300, minSession: 240, maxSession: 480, limitType: 'Move or time', color: 'hsl(330, 81%, 60%)' },
];

// Session Metrics
const SESSION_METRICS = [
  { metric: 'Session Length', median: 4.5, top25: 7.5, leaders: 17.5, unit: 'min' },
  { metric: 'Sessions/Day', median: 4.5, top25: 6, leaders: 6, unit: '' },
  { metric: 'Daily Playtime', median: 25, top25: 45, leaders: 67.5, unit: 'min' },
  { metric: 'Stickiness', median: 12.5, top25: 19, leaders: 36.5, unit: '%' },
];

// Retention Benchmarks
const RETENTION_DATA = [
  { day: 'D1', average: 25, good: 45, great: 48 },
  { day: 'D7', average: 8, good: 20, great: 25 },
  { day: 'D30', average: 5, good: 10, great: 15 },
];

// Level Types (Room 8 Studio Framework)
const LEVEL_TYPES = [
  { type: 'Tutorial', description: 'Super-easy, 1-3 mechanics', emotion: 'Learning', color: 'hsl(199, 89%, 48%)', frequency: 10 },
  { type: 'Wow-Effect', description: 'Cascade triggers, endorphin release', emotion: 'Excitement', color: 'hsl(142, 76%, 36%)', frequency: 20 },
  { type: 'Fuu-Effect', description: '1-2 extra moves always seem out of reach', emotion: 'Tension', color: 'hsl(25, 95%, 53%)', frequency: 15 },
  { type: 'Procrastinating', description: 'Comfort zone, maintain flow', emotion: 'Relaxation', color: 'hsl(262, 83%, 58%)', frequency: 35 },
  { type: 'Skill', description: 'Test player ability, later progression', emotion: 'Achievement', color: 'hsl(45, 93%, 47%)', frequency: 20 },
];

// Case Study Data
const CASE_STUDIES = {
  royalMatch: {
    name: 'Royal Match',
    normal: { attempts: 1.2, moves: '23-30' },
    hard: { attempts: 1.6, moves: '25-28', perWorld: 8 },
    superHard: { attempts: 2.5, moves: '27', perWorld: 5 },
    victoryLaps: 9,
    totalLevels: '12,400+',
    newLevels: '~100/2 weeks',
  },
  candyCrush: {
    name: 'Candy Crush Saga',
    episodeSize: 15,
    hardPercentage: 33,
    totalLevels: '21,125+',
    pattern: '1-2-3 series (odd harder)',
  },
  homescapes: {
    name: 'Homescapes',
    maxObjectives: 4,
    maxPhases: 5,
    totalLevels: '18,050+',
    newLevels: 'up to 50/week',
    stuckDays: '4-5+ on hard',
  },
};

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

export function LevelDurationFramework() {
  const [selectedLevel, setSelectedLevel] = useState(50);
  const [selectedGenre, setSelectedGenre] = useState('Match-3');

  // Calculate recommendations based on selected level
  const levelRecommendations = useMemo(() => {
    const stage = PROGRESSION_STAGES.find((s) => {
      const [min, max] = s.stage.includes('+')
        ? [parseInt(s.stage), Infinity]
        : s.stage.split('-').map(Number);
      return selectedLevel >= min && selectedLevel <= max;
    }) || PROGRESSION_STAGES[PROGRESSION_STAGES.length - 1];

    return {
      ...stage,
      avgDuration: (stage.minDuration + stage.maxDuration) / 2,
      avgMoves: Math.round((stage.minMoves + stage.maxMoves) / 2),
    };
  }, [selectedLevel]);

  const selectedGenreData = GENRE_BENCHMARKS.find((g) => g.genre === selectedGenre);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Mobile Puzzle Level Duration Framework
          </CardTitle>
          <CardDescription>
            Industry benchmarks for level duration, move counts, and session design based on GDC presentations,
            analytics platforms, and top-grossing game analysis.
          </CardDescription>
        </CardHeader>
      </Card>

      <Tabs defaultValue="calculator" className="space-y-4">
        <TabsList className="grid grid-cols-5 w-full">
          <TabsTrigger value="calculator">Calculator</TabsTrigger>
          <TabsTrigger value="progression">Progression</TabsTrigger>
          <TabsTrigger value="genres">Genres</TabsTrigger>
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
          <TabsTrigger value="cases">Case Studies</TabsTrigger>
        </TabsList>

        {/* Duration Calculator Tab */}
        <TabsContent value="calculator" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Level Duration Calculator</CardTitle>
                <CardDescription>Get recommendations for any level number</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Level Number</label>
                    <span className="text-2xl font-bold">{selectedLevel}</span>
                  </div>
                  <Slider
                    value={[selectedLevel]}
                    onValueChange={([v]) => setSelectedLevel(v)}
                    min={1}
                    max={1500}
                    step={1}
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>1</span>
                    <span>500</span>
                    <span>1000</span>
                    <span>1500</span>
                  </div>
                </div>

                <div className="p-4 bg-muted/50 rounded-lg space-y-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{levelRecommendations.label}</Badge>
                    <span className="text-sm text-muted-foreground">Stage {levelRecommendations.stage}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Target Duration</p>
                      <p className="text-lg font-semibold">
                        {formatDuration(levelRecommendations.minDuration)} - {formatDuration(levelRecommendations.maxDuration)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Move Count</p>
                      <p className="text-lg font-semibold">
                        {levelRecommendations.minMoves}-{levelRecommendations.maxMoves} moves
                      </p>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground">Design Focus</p>
                    <p className="text-sm">{levelRecommendations.focus}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Quick Reference</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {PROGRESSION_STAGES.map((stage) => (
                    <div
                      key={stage.stage}
                      className={`p-2 rounded-lg border cursor-pointer transition-colors ${
                        levelRecommendations.stage === stage.stage
                          ? 'bg-primary/10 border-primary'
                          : 'hover:bg-muted/50'
                      }`}
                      onClick={() => {
                        const [min] = stage.stage.includes('+')
                          ? [parseInt(stage.stage)]
                          : stage.stage.split('-').map(Number);
                        setSelectedLevel(min);
                      }}
                    >
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">L{stage.stage}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatDuration(stage.minDuration)}-{formatDuration(stage.maxDuration)}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{stage.minMoves}-{stage.maxMoves} moves</span>
                        <span>{stage.label}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Progression Stages Tab */}
        <TabsContent value="progression" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Duration by Progression Stage</CardTitle>
              <CardDescription>How level duration and moves evolve through game progression</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[350px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={PROGRESSION_STAGES}
                    margin={{ top: 20, right: 30, bottom: 40, left: 40 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="stage" tick={{ fontSize: 11 }} />
                    <YAxis
                      yAxisId="duration"
                      orientation="left"
                      tick={{ fontSize: 11 }}
                      label={{ value: 'Duration (sec)', angle: -90, position: 'insideLeft', fontSize: 11 }}
                    />
                    <YAxis
                      yAxisId="moves"
                      orientation="right"
                      tick={{ fontSize: 11 }}
                      label={{ value: 'Moves', angle: 90, position: 'insideRight', fontSize: 11 }}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const data = payload[0].payload;
                        return (
                          <div className="bg-background border rounded-lg p-3 shadow-lg text-sm">
                            <p className="font-medium">Levels {data.stage}</p>
                            <p className="text-muted-foreground">{data.label}</p>
                            <div className="mt-2 space-y-1">
                              <p>Duration: {formatDuration(data.minDuration)} - {formatDuration(data.maxDuration)}</p>
                              <p>Moves: {data.minMoves}-{data.maxMoves}</p>
                              <p className="text-xs text-muted-foreground">{data.focus}</p>
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Bar yAxisId="duration" dataKey="maxDuration" fill="hsl(262, 83%, 58%)" fillOpacity={0.3} name="Max Duration" />
                    <Bar yAxisId="duration" dataKey="minDuration" fill="hsl(262, 83%, 58%)" name="Min Duration" />
                    <Line yAxisId="moves" type="monotone" dataKey="maxMoves" stroke="hsl(25, 95%, 53%)" strokeWidth={2} name="Max Moves" />
                    <Line yAxisId="moves" type="monotone" dataKey="minMoves" stroke="hsl(142, 76%, 36%)" strokeWidth={2} name="Min Moves" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Key Insights</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3 text-sm">
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="font-medium">Early Game (1-30)</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    30-90 seconds per level. Focus on teaching one mechanic at a time.
                    High win rates, let players "feel smart" quickly.
                  </p>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="font-medium">Core Game (31-200)</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    2-3 minutes per level. 15-20 moves with 2-3 objectives.
                    "Decision density" increases ~20% as players progress.
                  </p>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="font-medium">Late Game (200+)</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    2-5 minutes maintained. Complexity increases but duration stabilizes
                    as veteran players develop faster pattern recognition.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Genre Benchmarks Tab */}
        <TabsContent value="genres" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Genre Duration Comparison</CardTitle>
                <CardDescription>Level duration varies significantly by puzzle sub-genre</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={GENRE_BENCHMARKS}
                      layout="vertical"
                      margin={{ top: 10, right: 30, bottom: 10, left: 80 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis type="number" tick={{ fontSize: 11 }} label={{ value: 'Seconds', position: 'bottom', fontSize: 11 }} />
                      <YAxis type="category" dataKey="genre" tick={{ fontSize: 11 }} width={75} />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const data = payload[0].payload;
                          return (
                            <div className="bg-background border rounded-lg p-3 shadow-lg text-sm">
                              <p className="font-medium">{data.genre}</p>
                              <p>Level: {formatDuration(data.minLevel)} - {formatDuration(data.maxLevel)}</p>
                              <p>Session: {formatDuration(data.minSession)} - {formatDuration(data.maxSession)}</p>
                              <p className="text-xs text-muted-foreground mt-1">Limit: {data.limitType}</p>
                            </div>
                          );
                        }}
                      />
                      <Bar dataKey="maxLevel" stackId="a" fill="hsl(262, 83%, 58%)" fillOpacity={0.3} name="Max" />
                      <Bar dataKey="minLevel" stackId="b" name="Min">
                        {GENRE_BENCHMARKS.map((entry, index) => (
                          <Cell key={index} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Genre Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {GENRE_BENCHMARKS.map((genre) => (
                  <div
                    key={genre.genre}
                    className={`p-2 rounded-lg border cursor-pointer transition-colors ${
                      selectedGenre === genre.genre ? 'border-primary bg-muted' : 'hover:bg-muted/50'
                    }`}
                    onClick={() => setSelectedGenre(genre.genre)}
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded" style={{ backgroundColor: genre.color }} />
                      <span className="text-sm font-medium">{genre.genre}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {formatDuration(genre.minLevel)}-{formatDuration(genre.maxLevel)} per level
                    </div>
                    <Badge variant="outline" className="text-xs mt-1">{genre.limitType}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {selectedGenreData && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{selectedGenreData.genre} Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-4">
                  <div className="p-3 bg-muted/50 rounded-lg text-center">
                    <p className="text-2xl font-bold">{formatDuration(selectedGenreData.minLevel)}-{formatDuration(selectedGenreData.maxLevel)}</p>
                    <p className="text-xs text-muted-foreground">Level Duration</p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg text-center">
                    <p className="text-2xl font-bold">{formatDuration(selectedGenreData.minSession)}-{formatDuration(selectedGenreData.maxSession)}</p>
                    <p className="text-xs text-muted-foreground">Session Target</p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg text-center">
                    <p className="text-2xl font-bold">{selectedGenreData.limitType}</p>
                    <p className="text-xs text-muted-foreground">Limit Type</p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg text-center">
                    <p className="text-2xl font-bold">{Math.round(selectedGenreData.maxSession / selectedGenreData.maxLevel)}-{Math.round(selectedGenreData.maxSession / selectedGenreData.minLevel)}</p>
                    <p className="text-xs text-muted-foreground">Levels/Session</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Session Metrics Tab */}
        <TabsContent value="sessions" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Session Metrics Comparison</CardTitle>
                <CardDescription>Median vs Top 25% vs Match-3 Leaders</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={SESSION_METRICS}
                      margin={{ top: 20, right: 30, bottom: 20, left: 40 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="metric" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="median" fill="hsl(220, 14%, 50%)" name="Median" />
                      <Bar dataKey="top25" fill="hsl(199, 89%, 48%)" name="Top 25%" />
                      <Bar dataKey="leaders" fill="hsl(142, 76%, 36%)" name="Match-3 Leaders" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Retention Benchmarks</CardTitle>
                <CardDescription>Day 1, 7, and 30 retention rates</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={RETENTION_DATA}
                      margin={{ top: 20, right: 30, bottom: 20, left: 40 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} unit="%" />
                      <Tooltip formatter={(value) => `${value}%`} />
                      <Legend />
                      <Bar dataKey="average" fill="hsl(220, 14%, 50%)" name="Average" />
                      <Bar dataKey="good" fill="hsl(199, 89%, 48%)" name="Good Target" />
                      <Bar dataKey="great" fill="hsl(142, 76%, 36%)" name="Great (Leaders)" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Level Type Mix (Room 8 Framework)</CardTitle>
              <CardDescription>Recommended 2-3 emotions per session through varied level types</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-5">
                {LEVEL_TYPES.map((type) => (
                  <div key={type.type} className="p-3 rounded-lg border">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-3 h-3 rounded" style={{ backgroundColor: type.color }} />
                      <span className="text-sm font-medium">{type.type}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{type.description}</p>
                    <div className="mt-2 flex items-center justify-between">
                      <Badge variant="outline" className="text-xs">{type.emotion}</Badge>
                      <span className="text-xs text-muted-foreground">~{type.frequency}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Session Design Principles</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 text-sm">
                <div className="space-y-3">
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="font-medium">5-7 Minute Window</p>
                    <p className="text-xs text-muted-foreground">
                      Median session is 4-5 minutes. Top performers achieve 7-8 minutes.
                      Match-3 leaders target up to 30 minutes across multiple levels.
                    </p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="font-medium">Lives System Strategy</p>
                    <p className="text-xs text-muted-foreground">
                      5 lives with timed regeneration allows ~10 minutes uninterrupted play—
                      minimum threshold for healthy engagement before paywall.
                    </p>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="font-medium">"Snacking" Paradigm</p>
                    <p className="text-xs text-muted-foreground">
                      Players engage during commutes, breaks, before sleep. Deliver dopamine
                      hits within seconds, full completion in 1-4 minutes.
                    </p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="font-medium">Device Patterns</p>
                    <p className="text-xs text-muted-foreground">
                      Phones drive morning commute sessions. Tablets enable longer evening
                      "couch sessions" of 10+ minutes.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Case Studies Tab */}
        <TabsContent value="cases" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            {/* Royal Match */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <div className="w-3 h-3 rounded bg-purple-500" />
                  {CASE_STUDIES.royalMatch.name}
                </CardTitle>
                <CardDescription>{CASE_STUDIES.royalMatch.totalLevels} levels</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between p-2 bg-green-500/10 rounded">
                    <span>Normal</span>
                    <span>~{CASE_STUDIES.royalMatch.normal.attempts} attempts, {CASE_STUDIES.royalMatch.normal.moves} moves</span>
                  </div>
                  <div className="flex justify-between p-2 bg-yellow-500/10 rounded">
                    <span>Hard ({CASE_STUDIES.royalMatch.hard.perWorld}/world)</span>
                    <span>~{CASE_STUDIES.royalMatch.hard.attempts} attempts</span>
                  </div>
                  <div className="flex justify-between p-2 bg-red-500/10 rounded">
                    <span>Super Hard ({CASE_STUDIES.royalMatch.superHard.perWorld}/world)</span>
                    <span>~{CASE_STUDIES.royalMatch.superHard.attempts} attempts</span>
                  </div>
                </div>
                <div className="pt-2 border-t text-xs text-muted-foreground">
                  <p>• {CASE_STUDIES.royalMatch.victoryLaps} victory lap levels (every 10th from 20-100)</p>
                  <p>• {CASE_STUDIES.royalMatch.newLevels} new levels</p>
                  <p>• Concurrent matching during cascades</p>
                </div>
              </CardContent>
            </Card>

            {/* Candy Crush */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <div className="w-3 h-3 rounded bg-orange-500" />
                  {CASE_STUDIES.candyCrush.name}
                </CardTitle>
                <CardDescription>{CASE_STUDIES.candyCrush.totalLevels} levels</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2 text-sm">
                  <div className="p-2 bg-muted/50 rounded">
                    <p className="font-medium">Episode Structure</p>
                    <p className="text-xs text-muted-foreground">
                      {CASE_STUDIES.candyCrush.episodeSize} levels per episode,
                      ~{CASE_STUDIES.candyCrush.hardPercentage}% (~5 levels) rated hard
                    </p>
                  </div>
                  <div className="p-2 bg-muted/50 rounded">
                    <p className="font-medium">Difficulty Pattern</p>
                    <p className="text-xs text-muted-foreground">
                      {CASE_STUDIES.candyCrush.pattern}
                    </p>
                  </div>
                </div>
                <div className="pt-2 border-t text-xs text-muted-foreground">
                  <p>• Removed timed levels in 2018</p>
                  <p>• Key metric: "time to abandon" + "time to pass"</p>
                  <p>• "If a level must be hard, make it short"</p>
                </div>
              </CardContent>
            </Card>

            {/* Homescapes */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <div className="w-3 h-3 rounded bg-green-500" />
                  {CASE_STUDIES.homescapes.name}
                </CardTitle>
                <CardDescription>{CASE_STUDIES.homescapes.totalLevels} levels</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2 text-sm">
                  <div className="p-2 bg-muted/50 rounded">
                    <p className="font-medium">Complexity</p>
                    <p className="text-xs text-muted-foreground">
                      Up to {CASE_STUDIES.homescapes.maxObjectives} objectives,
                      some stages with {CASE_STUDIES.homescapes.maxPhases} phases
                    </p>
                  </div>
                  <div className="p-2 bg-muted/50 rounded">
                    <p className="font-medium">Hard Level Impact</p>
                    <p className="text-xs text-muted-foreground">
                      Players report stuck for {CASE_STUDIES.homescapes.stuckDays} days
                    </p>
                  </div>
                </div>
                <div className="pt-2 border-t text-xs text-muted-foreground">
                  <p>• {CASE_STUDIES.homescapes.newLevels} new levels</p>
                  <p>• Has adaptive difficulty (eases after failures)</p>
                  <p>• Gardenscapes plays "harder" (no adaptive)</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Key Monetization Insight</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="p-4 bg-muted/50 rounded-lg">
                <div className="flex items-start gap-3">
                  <Info className="h-5 w-5 text-primary mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium mb-2">
                      "Retention always wins" — Jan Wedekind, King (Head of Central Insights)
                    </p>
                    <p className="text-muted-foreground">
                      Royal Match generates <strong>2x more "near-loss moments"</strong> than Candy Crush and
                      <strong> 2x more "almost-win moments"</strong> than Homescapes. King's analysis showed
                      that making Level 65 easier retained players longer with compound benefits—prioritizing
                      lifetime value over single-level conversion. "Crazy hard levels never pay off in the long term."
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
