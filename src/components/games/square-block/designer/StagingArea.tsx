'use client';

import { SquareBlock } from '@/types/squareBlock';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Upload, Plus, Eye, Trash2 } from 'lucide-react';
import { gridKey } from '@/lib/squareGrid';
import type { StagingAreaProps } from './types';

export function StagingArea({
  stagedLevels,
  setStagedLevels,
  handleImportMultipleFiles,
  handleAddStagedToCollection,
  onAddToCollection,
  setRows,
  setCols,
  setBlocks,
  setHoles,
}: StagingAreaProps) {
  if (stagedLevels.length === 0) return null;

  return (
    <Card className="border-blue-500/30">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Upload className="h-4 w-4" />
            Imported Files ({stagedLevels.length})
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={() => setStagedLevels([])}>
            Clear All
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="max-h-[250px] overflow-y-auto space-y-2">
          {stagedLevels.map(staged => (
            <div key={staged.id} className={`flex items-center gap-3 p-2 rounded-lg border ${
              staged.error ? 'bg-red-500/10 border-red-500/30' :
              staged.solvable ? 'bg-green-500/10 border-green-500/30' :
              'bg-amber-500/10 border-amber-500/30'
            }`}>
              <input
                type="checkbox"
                checked={staged.selected}
                disabled={!!staged.error || !staged.solvable}
                onChange={(e) => setStagedLevels(prev =>
                  prev.map(s => s.id === staged.id ? { ...s, selected: e.target.checked } : s)
                )}
                className="h-4 w-4"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{staged.filename}</p>
                <p className="text-xs text-muted-foreground">
                  {staged.levelData.rows}×{staged.levelData.cols} · {staged.blockCount} blocks
                </p>
              </div>
              {staged.error ? (
                <Badge variant="destructive">{staged.error}</Badge>
              ) : !staged.solvable ? (
                <Badge variant="outline" className="text-amber-500">Deadlock</Badge>
              ) : (
                <Badge className={
                  staged.difficultyTier === 'easy' ? 'bg-green-500' :
                  staged.difficultyTier === 'medium' ? 'bg-yellow-500 text-black' :
                  staged.difficultyTier === 'hard' ? 'bg-orange-500' : 'bg-red-500'
                }>
                  {staged.difficultyScore}
                </Badge>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => {
                  // Load into designer for preview/editing
                  setRows(staged.levelData.rows);
                  setCols(staged.levelData.cols);
                  const blockMap = new Map<string, SquareBlock>();
                  for (const block of staged.levelData.blocks) {
                    blockMap.set(gridKey(block.coord), block);
                  }
                  setBlocks(blockMap);
                  setHoles(new Set());
                }}
                title="Load into designer"
              >
                <Eye className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-destructive"
                onClick={() => setStagedLevels(prev => prev.filter(s => s.id !== staged.id))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 pt-2 border-t">
          <Button variant="outline" size="sm" onClick={handleImportMultipleFiles}>
            <Plus className="h-4 w-4 mr-1" /> Add More Files
          </Button>
          <div className="flex-1" />
          <span className="text-xs text-muted-foreground">
            {stagedLevels.filter(s => s.selected).length} selected
          </span>
          <Button
            size="sm"
            disabled={stagedLevels.filter(s => s.selected).length === 0 || !onAddToCollection}
            onClick={handleAddStagedToCollection}
          >
            Add to Collection
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
