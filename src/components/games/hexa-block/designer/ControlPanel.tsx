'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  isBidirectional,
  GameMode,
  CLOCKWISE_DIRECTIONS,
} from '@/types/hexaBlock';
import {
  HexDirection,
  DIRECTION_ORDER,
} from '@/lib/hexGrid';
import { Settings, CheckCircle, AlertTriangle, Eye, EyeOff } from 'lucide-react';
import {
  DIRECTION_LABELS,
  STACK_COLOR_OPTIONS,
  AXIS_ORDER,
  ControlPanelProps,
} from './types';

export function ControlPanel({
  solvability,
  stacks,
  holes,
  initialClearability,
  editMode,
  placementMode,
  selectedDirection,
  selectedColor,
  selectedCarouselArms,
  gameMode,
  gridRadius,
  gridCoords,
  showBlocksAhead,
  onEditModeChange,
  onPlacementModeChange,
  onDirectionChange,
  onColorChange,
  onCarouselArmsChange,
  onGameModeChange,
  onRadiusChange,
  onShowBlocksAheadChange,
}: ControlPanelProps) {
  const difficultyLabel = initialClearability >= 0.5 ? 'Easy' : initialClearability >= 0.2 ? 'Medium' : initialClearability > 0 ? 'Hard' : '-';
  const difficultyColor = initialClearability >= 0.5 ? 'text-green-400' : initialClearability >= 0.2 ? 'text-yellow-400' : 'text-red-400';

  return (
    <div className="w-72 flex-shrink-0 flex flex-col gap-3">
      {/* Solvability Check - Fixed at top */}
      <div
        className={`flex items-center gap-2 p-3 rounded-lg ${
          solvability.solvable ? 'bg-green-500/10 border border-green-500/30' : 'bg-amber-500/10 border border-amber-500/30'
        }`}
      >
        {solvability.solvable ? (
          <CheckCircle className="h-5 w-5 text-green-500" />
        ) : (
          <AlertTriangle className="h-5 w-5 text-amber-500" />
        )}
        <div className="flex-1">
          <p className={`text-sm font-medium ${solvability.solvable ? 'text-green-500' : 'text-amber-500'}`}>
            {solvability.solvable ? 'Solvable!' : 'Not solvable'}
          </p>
          <p className="text-xs text-muted-foreground">{solvability.message}</p>
        </div>
        <div className="flex flex-col gap-1 items-end text-xs">
          <Badge variant="outline" className="text-xs">{stacks.size} cells</Badge>
          {holes.size > 0 && <Badge variant="outline" className="text-xs">{holes.size} holes</Badge>}
          {stacks.size > 0 && solvability.solvable && (
            <Badge variant="outline" className={`text-xs ${difficultyColor}`}>
              {difficultyLabel}
            </Badge>
          )}
        </div>
      </div>

      {/* Controls Card */}
      <Card className="flex-1 overflow-y-auto">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings className="h-4 w-4" />
            Level Designer
          </CardTitle>
          <CardDescription className="text-xs">
            {editMode === 'place' ? 'Click hexes to place/remove stacks' : 'Click stacks to change arrow direction'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Direction & Color Selectors (only in stack place mode) */}
          {editMode === 'place' && placementMode === 'stack' && (
            <div className="space-y-2">
              <div className="space-y-1">
                <label className="text-xs font-medium">Direction</label>
                <div className="flex flex-wrap gap-1">
                  {/* Single directions */}
                  {DIRECTION_ORDER.map((dir) => (
                    <Button
                      key={dir}
                      variant={selectedDirection === dir ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => onDirectionChange(dir)}
                      className="w-8 h-8 text-sm p-0"
                    >
                      {DIRECTION_LABELS[dir]}
                    </Button>
                  ))}
                </div>
                {/* Bidirectional axes - only in push mode */}
                {gameMode === 'push' && (
                  <div className="flex flex-wrap gap-1">
                    {AXIS_ORDER.map((axis) => (
                      <Button
                        key={axis}
                        variant={selectedDirection === axis ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => onDirectionChange(axis)}
                        className="w-10 h-8 text-sm p-0"
                      >
                        {DIRECTION_LABELS[axis]}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Color</label>
                <div className="flex flex-wrap gap-1.5">
                  {STACK_COLOR_OPTIONS.map(([name, color]) => (
                    <button
                      key={name}
                      onClick={() => onColorChange(color)}
                      className={`w-6 h-6 rounded-full transition-transform ${
                        selectedColor === color ? 'ring-2 ring-white scale-110' : ''
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Game Mode */}
          <div className="space-y-1">
            <label className="text-xs font-medium">Game Mode</label>
            <div className="flex gap-1">
              <Button
                variant={gameMode === 'classic' ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  onGameModeChange('classic');
                  if (isBidirectional(selectedDirection)) {
                    onDirectionChange('E');
                  }
                }}
                className="flex-1 h-7 text-xs"
              >
                Classic
              </Button>
              <Button
                variant={gameMode === 'push' ? 'default' : 'outline'}
                size="sm"
                onClick={() => onGameModeChange('push')}
                className="flex-1 h-7 text-xs"
              >
                Push
              </Button>
            </div>
          </div>

          {/* Grid Size */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium">Grid Size</label>
              <span className="text-xs text-muted-foreground">R:{gridRadius} ({gridCoords.length})</span>
            </div>
            <Slider
              value={[gridRadius]}
              onValueChange={([v]) => onRadiusChange(v)}
              min={2}
              max={6}
              step={1}
            />
          </div>

          {/* Edit Mode Toggle */}
          <div className="space-y-1">
            <label className="text-xs font-medium">Edit Mode</label>
            <div className="grid grid-cols-2 gap-1">
              <Button
                variant={editMode === 'place' && placementMode === 'stack' ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  onEditModeChange('place');
                  onPlacementModeChange('stack');
                }}
                className="h-7 text-xs"
              >
                Stacks
              </Button>
              <Button
                variant={editMode === 'place' && placementMode === 'hole' ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  onEditModeChange('place');
                  onPlacementModeChange('hole');
                }}
                className="h-7 text-xs"
              >
                Holes
              </Button>
              <Button
                variant={editMode === 'place' && placementMode === 'pause' ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  onEditModeChange('place');
                  onPlacementModeChange('pause');
                }}
                className="h-7 text-xs"
              >
                Pauses
              </Button>
              <Button
                variant={editMode === 'place' && placementMode === 'carousel' ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  onEditModeChange('place');
                  onPlacementModeChange('carousel');
                }}
                className="h-7 text-xs"
              >
                Rotators
              </Button>
              <Button
                variant={editMode === 'direction' ? 'default' : 'outline'}
                size="sm"
                onClick={() => onEditModeChange('direction')}
                className="h-7 text-xs col-span-2"
              >
                Arrows
              </Button>
            </div>
          </div>

          {/* Carousel Arm Selector (shown when carousel mode is active) */}
          {placementMode === 'carousel' && editMode === 'place' && (
            <div className="space-y-1">
              <label className="text-xs font-medium">Rotator Arms ({selectedCarouselArms.size} selected)</label>
              <div className="flex gap-1 flex-wrap">
                {CLOCKWISE_DIRECTIONS.map((dir) => (
                  <Button
                    key={dir}
                    variant={selectedCarouselArms.has(dir) ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      const newArms = new Set(selectedCarouselArms);
                      if (newArms.has(dir)) {
                        // Don't remove if it would leave less than 2 arms
                        if (newArms.size > 2) {
                          newArms.delete(dir);
                        }
                      } else {
                        newArms.add(dir);
                      }
                      onCarouselArmsChange(newArms);
                    }}
                    className="h-6 w-8 text-xs p-0"
                  >
                    {DIRECTION_LABELS[dir]}
                  </Button>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground">Select 2-6 arms. Tiles rotate clockwise.</p>
            </div>
          )}

          {/* Blocks Ahead Toggle */}
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium">Blocks Analysis</label>
            <Button
              variant={showBlocksAhead ? 'default' : 'outline'}
              size="sm"
              onClick={() => onShowBlocksAheadChange(!showBlocksAhead)}
              className="h-6 text-xs px-2"
            >
              {showBlocksAhead ? <Eye className="h-3 w-3 mr-1" /> : <EyeOff className="h-3 w-3 mr-1" />}
              {showBlocksAhead ? 'On' : 'Off'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
