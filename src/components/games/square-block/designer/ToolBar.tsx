'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { DIRECTION_ORDER } from '@/lib/squareGrid';
import { Lock, Unlock, Snowflake, FlipHorizontal, ZoomIn, ZoomOut, Maximize, Eraser, Palette } from 'lucide-react';
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
  selectedColor,
  setSelectedColor,
  blockPalette,
  zoom,
  handleZoomIn,
  handleZoomOut,
  handleZoomReset,
}: ToolBarProps) {
  const [customHex, setCustomHex] = useState('');

  const applyCustomHex = () => {
    let hex = customHex.trim();
    if (!hex) return;
    if (!hex.startsWith('#')) hex = '#' + hex;
    // Validate: must be #RGB, #RRGGBB, or #RRGGBBAA
    if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(hex)) {
      // Normalize to 6-char lowercase
      if (hex.length === 4) {
        hex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
      } else if (hex.length === 9) {
        hex = hex.slice(0, 7); // strip alpha
      }
      setSelectedColor(hex.toLowerCase());
      setCustomHex('');
    }
  };

  return (
    <>
      {/* Direction & Eraser */}
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

        {/* Color Palette */}
        <div className="space-y-2">
          <label className="text-sm font-medium flex items-center gap-2">
            <Palette className="h-4 w-4" />
            Block Color
          </label>
          {/* Current color preview */}
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded border-2 border-white/30 shrink-0"
              style={{ backgroundColor: selectedColor }}
            />
            <span className="text-xs font-mono text-muted-foreground">{selectedColor}</span>
          </div>
          {/* Artwork palette (colors from imported level) */}
          {blockPalette.length > 0 && (
            <div className="space-y-1">
              <span className="text-[10px] text-muted-foreground">From artwork ({blockPalette.length})</span>
              <div className="flex flex-wrap gap-1">
                {blockPalette.map((color) => (
                  <button
                    key={color}
                    className={`w-6 h-6 rounded border-2 transition-transform hover:scale-110 ${
                      selectedColor === color ? 'border-white ring-1 ring-white scale-110' : 'border-white/20'
                    }`}
                    style={{ backgroundColor: color }}
                    onClick={() => setSelectedColor(color)}
                    title={color}
                  />
                ))}
              </div>
            </div>
          )}
          {/* Custom hex input */}
          <div className="flex gap-1">
            <Input
              type="text"
              placeholder="#FF5733"
              value={customHex}
              onChange={(e) => setCustomHex(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') applyCustomHex(); }}
              className="h-7 text-xs font-mono flex-1"
            />
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={applyCustomHex}>
              Set
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
