'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Play, Trash2, Plus, Sparkles, Download, Upload, Eye, EyeOff,
} from 'lucide-react';
import {
  getSawtoothPosition,
  getExpectedDifficulty,
} from '@/types/squareBlock';
import { DIFFICULTY_BADGE_COLORS } from '@/lib/designerConstants';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown, FolderOpen } from 'lucide-react';
import type { ConfigurationPanelProps } from './types';

export function ConfigurationPanel({
  blocks,
  rows,
  cols,
  solvability,
  isGenerating,
  showBlocksAhead,
  setShowBlocksAhead,
  smartFillLevel,
  clearAll,
  handlePlay,
  handleExportJSON,
  handleImportMultipleFiles,
  handleSizeChange,
  // Collection props
  onAddToCollection,
  editingLevel,
  levelNumber,
  onLevelNumberChange,
  maxLevelNumber,
  handleAddToCollection,
  collections,
  targetCollectionId,
  setTargetCollectionId,
}: ConfigurationPanelProps) {
  return (
    <>
      {/* Grid Size */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">Grid Size</label>
          <span className="text-sm text-muted-foreground">{rows} x {cols} ({rows * cols} cells)</span>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-muted-foreground">Rows</label>
            <Slider
              value={[rows]}
              onValueChange={([v]) => handleSizeChange(v, cols)}
              min={3}
              max={50}
              step={1}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Columns</label>
            <Slider
              value={[cols]}
              onValueChange={([v]) => handleSizeChange(rows, v)}
              min={3}
              max={50}
              step={1}
            />
          </div>
        </div>
      </div>

      {/* Configuration Panel */}
      <Card>
        <CardContent className="pt-4 space-y-4">
          {/* Smart Fill */}
          <Button
            variant="secondary"
            size="sm"
            onClick={smartFillLevel}
            disabled={isGenerating}
            className="w-full"
            title="Fill entire grid with random solvable blocks"
          >
            {isGenerating ? (
              <>
                <span className="animate-spin mr-2">&#9203;</span>
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Fill Grid Randomly
              </>
            )}
          </Button>

          {/* View Options */}
          <div className="flex gap-2">
            <Button
              variant={showBlocksAhead ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowBlocksAhead(!showBlocksAhead)}
              className="flex-1"
            >
              {showBlocksAhead ? (
                <>
                  <Eye className="h-4 w-4 mr-2" />
                  Hide Blockers
                </>
              ) : (
                <>
                  <EyeOff className="h-4 w-4 mr-2" />
                  Show Blockers
                </>
              )}
            </Button>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={clearAll} disabled={blocks.size === 0} className="flex-1">
              <Trash2 className="h-4 w-4 mr-2" />
              Clear All
            </Button>
            <Button size="sm" onClick={handlePlay} disabled={!solvability.solvable} className="flex-1">
              <Play className="h-4 w-4 mr-2" />
              Play Level
            </Button>
          </div>

          {/* Level Number & Add to Collection */}
          {onAddToCollection && (
            <div className="space-y-3 pt-3 border-t">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Level Position</label>
                <Badge variant="outline">#{levelNumber}</Badge>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onLevelNumberChange?.(Math.max(1, levelNumber - 1))}
                  disabled={levelNumber <= 1}
                >
                  -
                </Button>
                <Slider
                  value={[levelNumber]}
                  min={1}
                  max={maxLevelNumber}
                  step={1}
                  onValueChange={([v]) => onLevelNumberChange?.(v)}
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onLevelNumberChange?.(Math.min(maxLevelNumber, levelNumber + 1))}
                  disabled={levelNumber >= maxLevelNumber}
                >
                  +
                </Button>
              </div>
              <div className="text-xs text-muted-foreground text-center">
                Expected: <span className={`font-medium ${DIFFICULTY_BADGE_COLORS[getExpectedDifficulty(levelNumber)]?.text || 'text-foreground'}`}>
                  {getExpectedDifficulty(levelNumber)}
                </span> (Position {getSawtoothPosition(levelNumber)} in cycle)
              </div>
              {/* Collection Target Selector */}
              {collections && collections.length > 1 && (
                <div className="flex items-center gap-2">
                  <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="flex-1 justify-between h-8">
                        <span className="truncate text-xs">
                          {collections.find(c => c.id === targetCollectionId)?.name || 'Select collection'}
                        </span>
                        <ChevronDown className="h-3 w-3 ml-1 shrink-0" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-56">
                      {collections.map(c => (
                        <DropdownMenuItem
                          key={c.id}
                          onClick={() => setTargetCollectionId(c.id)}
                          className={c.id === targetCollectionId ? 'bg-accent' : ''}
                        >
                          <span className="flex-1 truncate">{c.name}</span>
                          <span className="text-xs text-muted-foreground ml-2">{c.levelCount}</span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
              <Button
                size="sm"
                variant="secondary"
                onClick={handleAddToCollection}
                disabled={!solvability.solvable || blocks.size === 0}
                className="w-full"
              >
                <Plus className="h-4 w-4 mr-2" />
                {editingLevel ? 'Update Level' : `Add to ${collections?.find(c => c.id === targetCollectionId)?.name || 'Collection'}`}
              </Button>
            </div>
          )}

          {/* Import/Export JSON */}
          <div className="pt-3 border-t space-y-2">
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handleImportMultipleFiles}
                className="flex-1"
                title="Import multiple JSON files"
              >
                <Upload className="h-4 w-4 mr-2" />
                Import Files
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleExportJSON}
                disabled={blocks.size === 0}
                className="flex-1"
              >
                <Download className="h-4 w-4 mr-2" />
                Export JSON
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
