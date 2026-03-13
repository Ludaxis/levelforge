'use client';

import { Card, CardContent } from '@/components/ui/card';
import { COLOR_TYPE_TO_HEX, COLOR_TYPE_TO_NAME, hexToColorName } from '@/lib/juicyBlastExport';

export function ArtworkInfoPanel({
  width,
  height,
  totalPixels,
  colorCounts,
}: {
  width: number;
  height: number;
  totalPixels: number;
  colorCounts: { colorType: number; count: number; hex: string }[];
}) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="grid grid-cols-2 gap-4">
          {/* Left: Artwork Info */}
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Artwork Info</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="p-2 bg-muted/30 rounded">
                <div className="text-muted-foreground text-xs">Size</div>
                <div className="font-medium">{width} x {height}</div>
              </div>
              <div className="p-2 bg-muted/30 rounded">
                <div className="text-muted-foreground text-xs">Pixels</div>
                <div className="font-medium">{totalPixels}</div>
              </div>
              <div className="p-2 bg-muted/30 rounded">
                <div className="text-muted-foreground text-xs">Colors</div>
                <div className="font-medium">{colorCounts.length}</div>
              </div>
            </div>
          </div>

          {/* Right: Color Palette */}
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Color Palette</h4>
            <div className="space-y-1 max-h-[150px] overflow-y-auto">
              {colorCounts.map(({ colorType, count, hex }) => (
                <div key={colorType} className="flex items-center gap-2 text-sm">
                  <div
                    className="w-4 h-4 rounded-sm border border-white/20 shrink-0"
                    style={{ backgroundColor: `#${COLOR_TYPE_TO_HEX[colorType] || hex}` }}
                  />
                  <span className="text-xs text-muted-foreground flex-1">
                    {COLOR_TYPE_TO_NAME[colorType] || hexToColorName(hex)}
                  </span>
                  <span className="text-xs font-mono">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
