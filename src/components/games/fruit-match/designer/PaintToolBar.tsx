'use client';

import { Card, CardContent } from '@/components/ui/card';
import { COLOR_TYPE_TO_HEX, COLOR_TYPE_TO_NAME } from '@/lib/juicyBlastExport';
import { Eraser } from 'lucide-react';

export function PaintToolBar({
  selectedColorType,
  onSelect,
}: {
  selectedColorType: number | 'eraser';
  onSelect: (ct: number | 'eraser') => void;
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-muted-foreground mr-1">Paint:</span>
          {Array.from({ length: 9 }, (_, i) => i).map((ct) => (
            <button
              key={ct}
              onClick={() => onSelect(ct)}
              className={`w-8 h-8 rounded border-2 transition-all ${
                selectedColorType === ct
                  ? 'border-white scale-110 ring-2 ring-primary ring-offset-1 ring-offset-background'
                  : 'border-white/20 hover:border-white/50'
              }`}
              style={{ backgroundColor: `#${COLOR_TYPE_TO_HEX[ct]}` }}
              title={COLOR_TYPE_TO_NAME[ct]}
            />
          ))}
          <button
            onClick={() => onSelect('eraser')}
            className={`w-8 h-8 rounded border-2 flex items-center justify-center transition-all ${
              selectedColorType === 'eraser'
                ? 'border-white scale-110 ring-2 ring-primary ring-offset-1 ring-offset-background bg-muted'
                : 'border-white/20 hover:border-white/50 bg-muted/50'
            }`}
            title="Eraser"
          >
            <Eraser className="h-4 w-4" />
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
