'use client';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { DIRECTION_ORDER } from '@/lib/squareGrid';
import { Lock, Unlock, Snowflake, FlipHorizontal, ZoomIn, ZoomOut, Maximize, Eraser } from 'lucide-react';
import { DIRECTION_LABELS } from './types';
import type { ToolBarProps } from './types';

export function ToolBar({
  selectedDirection,
  setSelectedDirection,
  selectedLocked,
  setSelectedLocked,
  selectedIceCount,
  setSelectedIceCount,
  selectedMirror,
  setSelectedMirror,
  eraserMode,
  setEraserMode,
  zoom,
  handleZoomIn,
  handleZoomOut,
  handleZoomReset,
}: ToolBarProps) {
  return (
    <>
      {/* Direction & Color Selectors */}
      <div className="space-y-3">
        <div className="space-y-2">
          <label className="text-sm font-medium">Direction</label>
          <div className="flex flex-wrap gap-1">
            {DIRECTION_ORDER.map((dir) => (
              <Button
                key={dir}
                variant={!eraserMode && selectedDirection === dir ? 'default' : 'outline'}
                size="sm"
                onClick={() => { setSelectedDirection(dir); setEraserMode(false); }}
                className="w-10 h-10 text-lg"
              >
                {DIRECTION_LABELS[dir]}
              </Button>
            ))}
            <Button
              variant={eraserMode ? 'destructive' : 'outline'}
              size="sm"
              onClick={() => setEraserMode(!eraserMode)}
              className="w-10 h-10"
              title="Eraser — click blocks to remove them"
            >
              <Eraser className="h-5 w-5" />
            </Button>
          </div>
        </div>
        {/* Gate Toggle */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Gate Block</label>
          <Button
            variant={selectedLocked ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              setSelectedLocked(!selectedLocked);
              // Mutual exclusion: clear ice count when enabling gate
              if (!selectedLocked) setSelectedIceCount(0);
            }}
            disabled={selectedIceCount > 0}
            className="w-full"
          >
            {selectedLocked ? (
              <>
                <Lock className="h-4 w-4 mr-2" />
                Gate (needs neighbors cleared)
              </>
            ) : (
              <>
                <Unlock className="h-4 w-4 mr-2" />
                Normal Block
              </>
            )}
          </Button>
        </div>

        {/* Ice Count */}
        <div className="space-y-2">
          <label className="text-sm font-medium flex items-center gap-2">
            <Snowflake className="h-4 w-4 text-cyan-400" />
            Ice Count
          </label>
          <div className="flex items-center gap-2">
            <Slider
              value={[selectedIceCount]}
              onValueChange={([v]) => {
                setSelectedIceCount(v);
                // Mutual exclusion: clear locked when setting ice count
                if (v > 0) setSelectedLocked(false);
              }}
              min={0}
              max={100}
              step={1}
              disabled={selectedLocked}
            />
            <Badge variant="outline" className="min-w-[50px] justify-center">
              {selectedIceCount || 'None'}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Block unfreezes after this many clears
          </p>
        </div>

        {/* Mirror Toggle */}
        <div className="space-y-2">
          <label className="text-sm font-medium flex items-center gap-2">
            <FlipHorizontal className="h-4 w-4 text-purple-400" />
            Mirror Block
          </label>
          <Button
            variant={selectedMirror ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedMirror(!selectedMirror)}
            className="w-full"
          >
            {selectedMirror ? (
              <>
                <FlipHorizontal className="h-4 w-4 mr-2" />
                Mirror (moves opposite)
              </>
            ) : (
              <>
                <FlipHorizontal className="h-4 w-4 mr-2 opacity-50" />
                Normal Direction
              </>
            )}
          </Button>
          <p className="text-xs text-muted-foreground">
            Block moves opposite to arrow direction
          </p>
        </div>
      </div>

      {/* Zoom Controls */}
      <div className="flex items-center justify-center gap-2 mb-2">
        <Button variant="outline" size="sm" onClick={handleZoomOut} title="Zoom Out">
          <ZoomOut className="h-4 w-4" />
        </Button>
        <span className="text-xs text-muted-foreground w-16 text-center">{Math.round(zoom * 100)}%</span>
        <Button variant="outline" size="sm" onClick={handleZoomIn} title="Zoom In">
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={handleZoomReset} title="Reset View">
          <Maximize className="h-4 w-4" />
        </Button>
        <span className="text-xs text-muted-foreground ml-2">
          Ctrl+scroll to zoom
        </span>
      </div>
    </>
  );
}
