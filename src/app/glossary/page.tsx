'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { BookOpen, Search } from 'lucide-react';

interface GlossaryTerm {
  term: string;
  definition: string;
  category: 'flow' | 'difficulty' | 'emotional' | 'mechanics' | 'metrics' | 'monetization' | 'design';
  relatedTerms?: string[];
  example?: string;
}

const GLOSSARY_TERMS: GlossaryTerm[] = [
  // Flow & Psychology
  {
    term: 'Flow State',
    definition: 'A mental state where the player is fully immersed and engaged, losing track of time. Occurs when challenge level matches player skill. Too easy = boredom, too hard = frustration.',
    category: 'flow',
    relatedTerms: ['Boredom Zone', 'Frustration Zone', 'Optimum Flow'],
    example: 'A player completing levels smoothly with focused concentration, not noticing 30 minutes have passed.',
  },
  {
    term: 'Optimum Flow',
    definition: 'The ideal diagonal band on the flow state chart where difficulty and skill are balanced. Players feel challenged but capable, leading to maximum engagement.',
    category: 'flow',
    relatedTerms: ['Flow State', 'Flow Channel'],
  },
  {
    term: 'Flow Channel',
    definition: 'The acceptable range around perfect balance where players remain engaged. Slight deviations toward boredom or frustration are acceptable if brief.',
    category: 'flow',
    relatedTerms: ['Flow State', 'Sawtooth Pattern'],
  },
  {
    term: 'Boredom Zone',
    definition: 'State where player skill significantly exceeds the challenge. Players disengage, rush through, or quit. On the flow chart, this is the lower-right area (high skill, low difficulty).',
    category: 'flow',
    relatedTerms: ['Flow State', 'Victory Lap'],
    example: 'A veteran player breezing through early levels with no effort required.',
  },
  {
    term: 'Frustration Zone',
    definition: 'State where challenge significantly exceeds player skill. Players feel stuck, may rage-quit, or lose motivation. On the flow chart, this is the upper-left area (low skill, high difficulty).',
    category: 'flow',
    relatedTerms: ['Flow State', 'Hard Spike'],
    example: 'A player failing the same level 20+ times with no clear path to improvement.',
  },

  // Difficulty Curve
  {
    term: 'Sawtooth Pattern',
    definition: 'A difficulty curve that rises gradually then partially resets, creating a saw-tooth shape when graphed. Prevents monotonous difficulty climbs through tension-release-satisfaction cycles.',
    category: 'difficulty',
    relatedTerms: ['Hard Spike', 'Victory Lap', '10-Level Cycle'],
    example: 'Levels 1-10 gradually increase difficulty, level 10 is super hard, then level 11 resets to easy before climbing again.',
  },
  {
    term: '10-Level Cycle',
    definition: 'The standard sawtooth unit used by top puzzle games. Each cycle contains: easy recovery (1-2), rising difficulty (3-4), hard spike (5), brief dip (6-7), rising tension (8-9), and super hard peak (10).',
    category: 'difficulty',
    relatedTerms: ['Sawtooth Pattern', 'Episode'],
  },
  {
    term: 'Hard Spike',
    definition: 'An intentionally difficult level placed mid-cycle (typically position 5) to create tension and test player skill. Should feel challenging but achievable.',
    category: 'difficulty',
    relatedTerms: ['Super Hard Level', 'Sawtooth Pattern'],
    example: 'Level 5, 15, 25, etc. in a sawtooth pattern—harder than surrounding levels but not the hardest.',
  },
  {
    term: 'Super Hard Level',
    definition: 'The peak difficulty in a cycle (typically position 10). Requires multiple attempts (2.5+ average) and represents a significant achievement when completed.',
    category: 'difficulty',
    relatedTerms: ['Hard Spike', 'Boss Level'],
    example: 'Level 10, 20, 30, etc.—the culmination of each cycle requiring mastery of introduced mechanics.',
  },
  {
    term: 'Victory Lap',
    definition: 'An intentionally easy level following a hard challenge, allowing players to feel skilled and recover emotionally. Brief controlled dips into the boredom zone.',
    category: 'difficulty',
    relatedTerms: ['Recovery Level', 'Boredom Zone'],
    example: 'Level 11 after beating the super hard level 10—player feels powerful and accomplished.',
  },
  {
    term: 'Recovery Level',
    definition: 'Easy levels placed after difficulty spikes to let players catch their breath. Prevents burnout and reinforces the feeling of progress.',
    category: 'difficulty',
    relatedTerms: ['Victory Lap', 'Sawtooth Pattern'],
  },
  {
    term: 'Baseline Increase',
    definition: 'The gradual rise in overall difficulty across cycles. While each cycle resets relatively, the baseline difficulty increases so cycle 5 is harder than cycle 1 overall.',
    category: 'difficulty',
    relatedTerms: ['Sawtooth Pattern', 'Progression'],
  },
  {
    term: 'Decision Density',
    definition: 'The number of meaningful choices a player must make per unit of time or per move. Higher decision density increases cognitive load and perceived difficulty.',
    category: 'difficulty',
    example: 'Reducing moves from 30 to 20 while keeping objectives the same increases decision density by ~50%.',
  },

  // Emotional Outcomes
  {
    term: 'Near-Loss Win',
    definition: 'Completing a level with minimal resources remaining (1-3 moves left). Creates maximum satisfaction and emotional investment. The most valuable outcome for engagement.',
    category: 'emotional',
    relatedTerms: ['Almost-Win Loss', 'Pinch Point'],
    example: 'Winning with exactly 1 move remaining, triggering an emotional high.',
  },
  {
    term: 'Almost-Win Loss',
    definition: 'Failing a level when victory seemed within reach (1-3 objectives remaining). Motivates retry rather than quitting because success feels achievable.',
    category: 'emotional',
    relatedTerms: ['Near-Loss Win', 'Fuu-Effect'],
    example: 'Failing with just 2 tiles left to collect—player thinks "I almost had it!" and tries again.',
  },
  {
    term: 'Easy Win',
    definition: 'Completing a level with many resources remaining (10+ moves). Can lead to boredom if too frequent. Useful for victory laps but should be limited.',
    category: 'emotional',
    relatedTerms: ['Victory Lap', 'Boredom Zone'],
  },
  {
    term: 'Crushing Loss',
    definition: 'Failing a level with many objectives remaining (10+). Feels unfair and hopeless, often leading to rage-quit or game abandonment. Should be avoided.',
    category: 'emotional',
    relatedTerms: ['Frustration Zone'],
    example: 'Running out of moves with half the objectives incomplete—player feels the level is impossible.',
  },

  // Cognitive Framework
  {
    term: 'System 1 Thinking',
    definition: 'Fast, automatic, intuitive mental processing. Pattern matching, quick decisions, muscle memory. Feels effortless. Dominant in early game and easy levels.',
    category: 'mechanics',
    relatedTerms: ['System 2 Thinking', 'Cognitive Load'],
    example: 'Instantly recognizing a match-3 pattern without consciously analyzing the board.',
  },
  {
    term: 'System 2 Thinking',
    definition: 'Slow, deliberate, analytical mental processing. Planning, calculation, strategic thinking. Requires effort. Dominant in hard levels and complex puzzles.',
    category: 'mechanics',
    relatedTerms: ['System 1 Thinking', 'Cognitive Load'],
    example: 'Carefully planning 5 moves ahead to set up a cascade that clears multiple objectives.',
  },
  {
    term: 'Cognitive Load',
    definition: 'The mental effort required to process information and make decisions. High cognitive load is tiring; games should balance periods of high and low load.',
    category: 'mechanics',
    relatedTerms: ['System 1 Thinking', 'System 2 Thinking', 'Decision Density'],
  },

  // Level Types
  {
    term: 'Tutorial Level',
    definition: 'Super-easy levels introducing 1-3 mechanics in isolation. Focus on teaching, not challenging. High win rates (90%+) to build confidence.',
    category: 'design',
    relatedTerms: ['Onboarding', 'Three-Encounter Method'],
  },
  {
    term: 'Wow-Effect Level',
    definition: 'Levels designed to trigger cascades and spectacular chain reactions. Releases endorphins through visual satisfaction and big score boosts.',
    category: 'design',
    relatedTerms: ['Cascade', 'Dopamine Hit'],
    example: 'A level where the board layout naturally creates massive cascades with minimal player input.',
  },
  {
    term: 'Fuu-Effect Level',
    definition: 'Levels where 1-2 extra moves always seem just out of reach. Tests patience and creates monetization opportunities. Named for the frustrated sigh players make.',
    category: 'design',
    relatedTerms: ['Almost-Win Loss', 'Pinch Point'],
    example: 'Consistently running out of moves with 1-2 objectives remaining—"if I just had one more move!"',
  },
  {
    term: 'Procrastinating Level',
    definition: 'Comfort-zone levels maintaining flow without significant challenge. Lets players relax and enjoy the game without stress.',
    category: 'design',
    relatedTerms: ['Flow State'],
  },
  {
    term: 'Skill Level',
    definition: 'Levels explicitly testing player ability, typically appearing later in progression. Rewards mastery and separates casual from dedicated players.',
    category: 'design',
  },

  // Game Mechanics
  {
    term: 'Cascade',
    definition: 'Chain reaction where matches trigger tile drops, creating new matches automatically. Key source of satisfaction and score multiplication.',
    category: 'mechanics',
    relatedTerms: ['Wow-Effect Level'],
    example: 'A single match triggers 5 subsequent matches as tiles fall and create new patterns.',
  },
  {
    term: 'Move Limit',
    definition: 'Maximum number of moves allowed to complete a level. Primary difficulty lever in match-3 games. Tighter limits = higher difficulty.',
    category: 'mechanics',
    relatedTerms: ['Decision Density'],
  },
  {
    term: 'Objective',
    definition: 'Goal required to complete a level (collect X tiles, clear Y obstacles, etc.). Multiple objectives increase complexity.',
    category: 'mechanics',
    example: 'Collect 20 red tiles, 15 blue tiles, and clear 10 blockers.',
  },
  {
    term: 'Blocker/Obstacle',
    definition: 'Board elements that impede matching (ice, chains, boxes, etc.). New blockers introduce novelty; combining blockers increases difficulty.',
    category: 'mechanics',
  },

  // Metrics & Analytics
  {
    term: 'Win Rate',
    definition: 'Percentage of level attempts that result in completion. Key difficulty metric. Easy: 70-90%, Medium: 40-60%, Hard: 25-40%, Super Hard: 20-30%.',
    category: 'metrics',
    relatedTerms: ['Attempt Count'],
  },
  {
    term: 'Attempt Count',
    definition: 'Average number of tries players need to complete a level. Normal: ~1.2, Hard: ~1.6, Super Hard: 2.5+.',
    category: 'metrics',
    relatedTerms: ['Win Rate'],
  },
  {
    term: 'Session Length',
    definition: 'Duration of a single play session. Median is 4-5 minutes; top games achieve 7-8 minutes. Match-3 leaders reach 15-20 minutes.',
    category: 'metrics',
  },
  {
    term: 'Stickiness (DAU/MAU)',
    definition: 'Ratio of Daily Active Users to Monthly Active Users. Measures how often players return. Median: 10-15%, leaders: 30-43%.',
    category: 'metrics',
  },
  {
    term: 'Retention',
    definition: 'Percentage of players who return after a time period. D1 (Day 1): 24-48%, D7: 7-25%, D30: 5-15%. Critical for long-term success.',
    category: 'metrics',
    relatedTerms: ['Churn'],
  },
  {
    term: 'Churn',
    definition: 'Rate at which players stop playing. Opposite of retention. High difficulty can cause churn spikes.',
    category: 'metrics',
    relatedTerms: ['Retention'],
  },

  // Monetization
  {
    term: 'Pinch Point',
    definition: 'Moments of economic pressure where players choose between investing time/skill or spending money. Key monetization opportunities.',
    category: 'monetization',
    relatedTerms: ['Fuu-Effect Level', 'Almost-Win Loss'],
    example: 'Offering to continue a failed level for gems, or purchase extra moves mid-level.',
  },
  {
    term: 'Lives/Energy System',
    definition: 'Mechanic limiting play attempts. Creates natural session breaks, habit formation, and monetization through life purchases or refill timers.',
    category: 'monetization',
    example: '5 lives regenerating over time; pay to refill instantly or wait.',
  },
  {
    term: 'Boost/Power-up',
    definition: 'Items giving temporary advantages (extra moves, special tiles, etc.). Soft currency sink and monetization lever.',
    category: 'monetization',
  },

  // Design Frameworks
  {
    term: 'Three-Encounter Method',
    definition: 'Teaching progression: 1) Introduction (isolated mechanic), 2) Combination (with known mechanic), 3) Application (integrated puzzle).',
    category: 'design',
    relatedTerms: ['Tutorial Level', 'Onboarding'],
  },
  {
    term: 'Interest Curve',
    definition: 'Jesse Schell\'s framework where each level is a microcosm of the full game\'s emotional arc—rising engagement peaks leading to satisfying climax.',
    category: 'design',
    relatedTerms: ['Sawtooth Pattern'],
  },
  {
    term: 'Episode',
    definition: 'A group of levels (typically 15) forming a thematic unit. Used in Candy Crush. Contains ~33% hard levels distributed throughout.',
    category: 'design',
    relatedTerms: ['10-Level Cycle'],
  },
  {
    term: 'Onboarding',
    definition: 'The initial player experience (levels 1-30) focused on teaching mechanics with high win rates. Goal: hook players within minutes.',
    category: 'design',
    relatedTerms: ['Tutorial Level', 'Three-Encounter Method'],
  },
  {
    term: 'Meta-Game',
    definition: 'Progression systems outside core puzzles (home decoration, story, collection). Extends session time and provides long-term goals.',
    category: 'design',
    example: 'Decorating a mansion in Homescapes or rebuilding a kingdom in Royal Match.',
  },
];

const CATEGORY_INFO: Record<string, { label: string; color: string }> = {
  flow: { label: 'Flow & Psychology', color: 'bg-green-500' },
  difficulty: { label: 'Difficulty Curve', color: 'bg-orange-500' },
  emotional: { label: 'Emotional Outcomes', color: 'bg-pink-500' },
  mechanics: { label: 'Game Mechanics', color: 'bg-blue-500' },
  metrics: { label: 'Metrics & Analytics', color: 'bg-purple-500' },
  monetization: { label: 'Monetization', color: 'bg-yellow-500' },
  design: { label: 'Design Frameworks', color: 'bg-cyan-500' },
};

export default function GlossaryPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const filteredTerms = GLOSSARY_TERMS.filter((term) => {
    const matchesSearch =
      searchQuery === '' ||
      term.term.toLowerCase().includes(searchQuery.toLowerCase()) ||
      term.definition.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = !selectedCategory || term.category === selectedCategory;
    return matchesSearch && matchesCategory;
  }).sort((a, b) => a.term.localeCompare(b.term));

  const categories = Object.entries(CATEGORY_INFO);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Glossary</h1>
        <p className="text-muted-foreground mt-2">
          Complete reference of game design terminology used throughout the workbench.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Search & Filter
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search terms..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge
              variant={selectedCategory === null ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => setSelectedCategory(null)}
            >
              All ({GLOSSARY_TERMS.length})
            </Badge>
            {categories.map(([key, { label, color }]) => {
              const count = GLOSSARY_TERMS.filter((t) => t.category === key).length;
              return (
                <Badge
                  key={key}
                  variant={selectedCategory === key ? 'default' : 'outline'}
                  className={`cursor-pointer ${selectedCategory === key ? color : ''}`}
                  onClick={() => setSelectedCategory(selectedCategory === key ? null : key)}
                >
                  {label} ({count})
                </Badge>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="text-sm text-muted-foreground">
        Showing {filteredTerms.length} of {GLOSSARY_TERMS.length} terms
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {filteredTerms.map((item) => (
          <Card key={item.term} className="h-full">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-base">{item.term}</CardTitle>
                <Badge
                  variant="outline"
                  className={`text-xs shrink-0 ${CATEGORY_INFO[item.category].color} text-white border-0`}
                >
                  {CATEGORY_INFO[item.category].label}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{item.definition}</p>

              {item.example && (
                <div className="p-2 bg-muted/50 rounded text-xs">
                  <span className="font-medium">Example: </span>
                  <span className="text-muted-foreground">{item.example}</span>
                </div>
              )}

              {item.relatedTerms && item.relatedTerms.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  <span className="text-xs text-muted-foreground">Related:</span>
                  {item.relatedTerms.map((related) => (
                    <Badge
                      key={related}
                      variant="outline"
                      className="text-xs cursor-pointer hover:bg-muted"
                      onClick={() => setSearchQuery(related)}
                    >
                      {related}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredTerms.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center">
            <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No terms found matching your search.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
