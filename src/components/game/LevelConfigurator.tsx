'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { LevelConfig, Objective, TileColor, TILE_COLORS, COLOR_HEX, DIFFICULTY_PRESETS } from '@/types/game';
import { DIFFICULTY_TIERS } from '@/lib/constants';
import { Play, RotateCcw, Settings, Info } from 'lucide-react';

interface LevelConfiguratorProps {
  config: LevelConfig;
  onConfigChange: (config: LevelConfig) => void;
  onPlay: () => void;
  onReset: () => void;
  isPlaying: boolean;
}

export function LevelConfigurator({
  config,
  onConfigChange,
  onPlay,
  onReset,
  isPlaying,
}: LevelConfiguratorProps) {
  const [selectedObjectiveColor, setSelectedObjectiveColor] = useState<TileColor>('red');

  const updateConfig = (updates: Partial<LevelConfig>) => {
    onConfigChange({ ...config, ...updates });
  };

  const applyDifficultyPreset = (tier: LevelConfig['difficultyTier']) => {
    const preset = DIFFICULTY_PRESETS[tier];
    const baseTarget = Math.round(18 * preset.objectiveMultiplier);

    // Use colors based on the preset's colorCount
    const availableColors = TILE_COLORS.slice(0, preset.colorCount);
    const objectiveColors = availableColors.slice(0, 3); // First 3 colors as objectives

    updateConfig({
      boardSize: preset.boardSize,
      moveLimit: preset.moveLimit,
      colorCount: preset.colorCount,
      difficultyTier: tier,
      objectives: objectiveColors.map((color) => ({
        color,
        target: baseTarget + Math.floor(Math.random() * 5),
        collected: 0,
      })),
    });
  };

  const addObjective = () => {
    if (config.objectives.length >= 4) return;
    const newObjective: Objective = {
      color: selectedObjectiveColor,
      target: 20,
      collected: 0,
    };
    updateConfig({ objectives: [...config.objectives, newObjective] });
  };

  const removeObjective = (index: number) => {
    if (config.objectives.length <= 1) return;
    updateConfig({ objectives: config.objectives.filter((_, i) => i !== index) });
  };

  const updateObjectiveTarget = (index: number, target: number) => {
    const newObjectives = [...config.objectives];
    newObjectives[index] = { ...newObjectives[index], target };
    updateConfig({ objectives: newObjectives });
  };

  const currentPreset = DIFFICULTY_PRESETS[config.difficultyTier];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Level Configuration
        </CardTitle>
        <CardDescription>Configure the level parameters based on framework principles</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Difficulty Presets */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Difficulty Preset</label>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(DIFFICULTY_PRESETS) as LevelConfig['difficultyTier'][]).map((tier) => (
              <Button
                key={tier}
                variant={config.difficultyTier === tier ? 'default' : 'outline'}
                size="sm"
                onClick={() => applyDifficultyPreset(tier)}
                style={{
                  borderColor: config.difficultyTier === tier ? DIFFICULTY_TIERS[tier].color : undefined,
                  backgroundColor: config.difficultyTier === tier ? DIFFICULTY_TIERS[tier].color : undefined,
                }}
              >
                {tier.charAt(0).toUpperCase() + tier.slice(1).replace(/([A-Z])/g, ' $1')}
              </Button>
            ))}
          </div>
          <div className="flex items-start gap-2 p-2 bg-muted/50 rounded-lg mt-2">
            <Info className="h-4 w-4 mt-0.5 text-muted-foreground" />
            <div className="text-xs text-muted-foreground">
              <p className="font-medium">{currentPreset.description}</p>
              <p className="mt-1">
                Win rate target: {DIFFICULTY_TIERS[config.difficultyTier].winRate[0]}-
                {DIFFICULTY_TIERS[config.difficultyTier].winRate[1]}%
              </p>
            </div>
          </div>
        </div>

        {/* Color Count */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Tile Colors</label>
            <span className="text-sm text-muted-foreground">{config.colorCount} colors</span>
          </div>
          <div className="flex gap-1 mb-2">
            {TILE_COLORS.slice(0, config.colorCount).map((color) => (
              <div
                key={color}
                className="w-6 h-6 rounded-full"
                style={{ backgroundColor: COLOR_HEX[color] }}
              />
            ))}
            {TILE_COLORS.slice(config.colorCount).map((color) => (
              <div
                key={color}
                className="w-6 h-6 rounded-full opacity-20"
                style={{ backgroundColor: COLOR_HEX[color] }}
              />
            ))}
          </div>
          <Slider
            value={[config.colorCount]}
            onValueChange={([v]) => updateConfig({ colorCount: v })}
            min={4}
            max={6}
            step={1}
          />
          <p className="text-xs text-muted-foreground">
            Fewer colors = easier to match. Easy: 4, Medium: 5, Hard: 5-6
          </p>
        </div>

        {/* Board Size */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Board Size</label>
            <span className="text-sm text-muted-foreground">{config.boardSize}x{config.boardSize}</span>
          </div>
          <Slider
            value={[config.boardSize]}
            onValueChange={([v]) => updateConfig({ boardSize: v })}
            min={5}
            max={9}
            step={1}
          />
        </div>

        {/* Move Limit */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Move Limit</label>
            <span className="text-sm text-muted-foreground">{config.moveLimit} moves</span>
          </div>
          <Slider
            value={[config.moveLimit]}
            onValueChange={([v]) => updateConfig({ moveLimit: v })}
            min={10}
            max={50}
            step={1}
          />
          <p className="text-xs text-muted-foreground">
            Tight moves create tension. Aim for near-loss finishes (1-3 moves left).
          </p>
        </div>

        {/* Objectives */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Objectives</label>
            <span className="text-xs text-muted-foreground">
              Total: {config.objectives.reduce((sum, obj) => sum + obj.target, 0)}
            </span>
          </div>
          {config.objectives.map((obj, i) => (
            <div key={i} className="flex items-center gap-3 p-2 bg-muted/50 rounded-lg">
              <div
                className="w-6 h-6 rounded-full"
                style={{ backgroundColor: COLOR_HEX[obj.color] }}
              />
              <div className="flex-1">
                <Slider
                  value={[obj.target]}
                  onValueChange={([v]) => updateObjectiveTarget(i, v)}
                  min={5}
                  max={50}
                  step={5}
                />
              </div>
              <span className="text-sm w-8">{obj.target}</span>
              {config.objectives.length > 1 && (
                <Button variant="ghost" size="sm" onClick={() => removeObjective(i)}>
                  ×
                </Button>
              )}
            </div>
          ))}

          {config.objectives.length < 4 && (
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                {TILE_COLORS.slice(0, config.colorCount).map((color) => (
                  <button
                    key={color}
                    onClick={() => setSelectedObjectiveColor(color)}
                    className={`w-6 h-6 rounded-full transition-transform ${
                      selectedObjectiveColor === color ? 'ring-2 ring-white scale-110' : ''
                    }`}
                    style={{ backgroundColor: COLOR_HEX[color] }}
                  />
                ))}
              </div>
              <Button variant="outline" size="sm" onClick={addObjective}>
                + Add Objective
              </Button>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2 pt-4 border-t">
          {!isPlaying ? (
            <Button onClick={onPlay} className="w-full">
              <Play className="h-4 w-4 mr-2" />
              Start Level
            </Button>
          ) : (
            <>
              <Button onClick={onReset} variant="outline" className="w-full">
                <RotateCcw className="h-4 w-4 mr-2" />
                Restart Level
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Changing settings will restart the level
              </p>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
