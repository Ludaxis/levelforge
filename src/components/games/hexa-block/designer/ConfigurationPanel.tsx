'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Play, Trash2, Shuffle, Dices, Plus, Download, Upload, Copy, Share2, Grid3X3, Sparkles } from 'lucide-react';
import { LEVEL_TEMPLATES } from '@/lib/hexLevelTemplates';
import { ConfigurationPanelProps } from './types';

export function ConfigurationPanel({
  stacks,
  holes,
  gridCoords,
  targetStackCount,
  targetDifficulty,
  solvability,
  shareCode,
  importCode,
  copySuccess,
  editingLevel,
  onAddToCollection,
  fileInputRef,
  onTargetStackCountChange,
  onTargetDifficultyChange,
  onGenerateRandom,
  onSmartFill,
  onApplyTemplate,
  onExportJSON,
  onImportJSON,
  onGenerateShareCode,
  onCopyCode,
  onImportCode,
  onImportCodeChange,
  onClearAll,
  onPlay,
  onAddToCollectionClick,
}: ConfigurationPanelProps) {
  return (
    <Card className="flex-1 overflow-y-auto">
      <CardContent className="pt-3 space-y-3">
        {/* Random Generator */}
        <div className="space-y-2 p-2 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-2">
            <Dices className="h-3 w-3" />
            <label className="text-xs font-medium">Random Generator</label>
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Cells</span>
              <span className="text-xs font-medium">{targetStackCount}</span>
            </div>
            <Slider
              value={[targetStackCount]}
              onValueChange={([v]) => onTargetStackCountChange(v)}
              min={2}
              max={Math.min(100, Math.floor(gridCoords.length * 0.8))}
              step={1}
            />
          </div>
          <div className="flex gap-1">
            <Button
              variant={targetDifficulty === 'any' ? 'default' : 'outline'}
              size="sm"
              onClick={() => onTargetDifficultyChange('any')}
              className="flex-1 h-6 text-xs"
            >
              Any
            </Button>
            <Button
              variant={targetDifficulty === 'easy' ? 'default' : 'outline'}
              size="sm"
              onClick={() => onTargetDifficultyChange('easy')}
              className="flex-1 h-6 text-xs"
            >
              Easy
            </Button>
            <Button
              variant={targetDifficulty === 'medium' ? 'default' : 'outline'}
              size="sm"
              onClick={() => onTargetDifficultyChange('medium')}
              className="flex-1 h-6 text-xs"
            >
              Med
            </Button>
            <Button
              variant={targetDifficulty === 'hard' ? 'default' : 'outline'}
              size="sm"
              onClick={() => onTargetDifficultyChange('hard')}
              className="flex-1 h-6 text-xs"
            >
              Hard
            </Button>
          </div>
          <div className="flex gap-1">
            <Button
              variant="secondary"
              size="sm"
              onClick={onGenerateRandom}
              className="flex-1 h-7 text-xs"
            >
              <Shuffle className="h-3 w-3 mr-1" />
              Random
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={onSmartFill}
              className="flex-1 h-7 text-xs"
              title="Fill all empty cells while maintaining solvability"
            >
              <Sparkles className="h-3 w-3 mr-1" />
              Smart Fill
            </Button>
          </div>
        </div>

        {/* Level Templates */}
        <div className="space-y-2 p-2 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-2">
            <Grid3X3 className="h-3 w-3" />
            <label className="text-xs font-medium">Templates</label>
          </div>
          <div className="grid grid-cols-4 gap-1">
            {LEVEL_TEMPLATES.map((template) => (
              <Button
                key={template.id}
                variant="outline"
                size="sm"
                onClick={() => onApplyTemplate(template)}
                className="text-xs h-6 px-1"
                title={template.description}
              >
                {template.name}
              </Button>
            ))}
          </div>
        </div>

        {/* Export/Import/Share */}
        <div className="space-y-2 p-2 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-2">
            <Share2 className="h-3 w-3" />
            <label className="text-xs font-medium">Export & Share</label>
          </div>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={onImportJSON}
            className="hidden"
          />

          {/* Export/Import JSON */}
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={onExportJSON}
              disabled={stacks.size === 0}
              className="flex-1 h-6 text-xs"
            >
              <Download className="h-3 w-3 mr-1" />
              Export
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 h-6 text-xs"
            >
              <Upload className="h-3 w-3 mr-1" />
              Import
            </Button>
          </div>

          {/* Share Code */}
          <Button
            variant="outline"
            size="sm"
            onClick={onGenerateShareCode}
            disabled={stacks.size === 0}
            className="w-full h-6 text-xs"
          >
            <Copy className="h-3 w-3 mr-1" />
            Generate Code
          </Button>

          {shareCode && (
            <div className="flex gap-1">
              <input
                type="text"
                value={shareCode}
                readOnly
                className="flex-1 px-2 py-0.5 text-xs bg-background border rounded font-mono"
              />
              <Button
                variant={copySuccess ? 'default' : 'outline'}
                size="sm"
                onClick={onCopyCode}
                className="h-6 text-xs px-2"
              >
                {copySuccess ? '✓' : 'Copy'}
              </Button>
            </div>
          )}

          {/* Import from Code */}
          <div className="flex gap-1">
            <input
              type="text"
              value={importCode}
              onChange={(e) => onImportCodeChange(e.target.value)}
              placeholder="Paste code..."
              className="flex-1 px-2 py-0.5 text-xs bg-background border rounded font-mono"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={onImportCode}
              disabled={!importCode.trim()}
              className="h-6 text-xs px-2"
            >
              Load
            </Button>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-1 pt-1">
          <Button
            variant="outline"
            size="sm"
            onClick={onClearAll}
            disabled={stacks.size === 0}
            className="flex-1 h-8 text-xs"
          >
            <Trash2 className="h-3 w-3 mr-1" />
            Clear
          </Button>
          <Button
            size="sm"
            onClick={onPlay}
            disabled={!solvability.solvable}
            className="flex-1 h-8 text-xs"
          >
            <Play className="h-3 w-3 mr-1" />
            Play
          </Button>
        </div>

        {/* Add to Collection */}
        {onAddToCollection && (
          <Button
            size="sm"
            variant="secondary"
            onClick={onAddToCollectionClick}
            disabled={!solvability.solvable || stacks.size === 0}
            className="w-full h-8 text-xs"
          >
            <Plus className="h-3 w-3 mr-1" />
            {editingLevel ? 'Update Level' : 'Add to Collection'}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
