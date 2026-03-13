'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Plus,
  Trash2,
  GripVertical,
  Lock,
  Hash,
} from 'lucide-react';
import { COLOR_TYPE_TO_HEX, hexToColorName } from '@/lib/juicyBlastExport';
import { StudioLauncher, StudioGroup, ColorSwatch } from './types';

export function LauncherSection({
  launchers,
  groups,
  onAdd,
  onDelete,
  onReorder,
  onUpdate,
  colorTypeToHex,
  totalPixels,
}: {
  launchers: StudioLauncher[];
  groups: StudioGroup[];
  onAdd: (colorType: number, pixelCount: number, group: number) => void;
  onDelete: (id: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onUpdate: (id: string, updates: Partial<Pick<StudioLauncher, 'colorType' | 'pixelCount' | 'group'>>) => void;
  colorTypeToHex?: Record<number, string>;
  totalPixels: number;
}) {
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addColorType, setAddColorType] = useState(0);
  const [addPixelCount, setAddPixelCount] = useState(20);
  const [addGroup, setAddGroup] = useState(groups[0]?.id ?? 1);

  const sorted = useMemo(() => [...launchers].sort((a, b) => a.order - b.order), [launchers]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            Launcher (Requirement)
            <Badge variant="outline" className="text-[10px]">{launchers.length}</Badge>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">Add launchers for each color requirement.</p>
        ) : (
          <div className="space-y-1 max-h-[250px] overflow-y-auto">
            {sorted.map((launcher, idx) => (
              <div
                key={launcher.id}
                draggable
                onDragStart={() => setDraggedIdx(idx)}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (draggedIdx !== null && idx !== draggedIdx) setDragOverIdx(idx);
                }}
                onDragLeave={() => setDragOverIdx(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  if (draggedIdx !== null && draggedIdx !== idx) onReorder(draggedIdx, idx);
                  setDraggedIdx(null);
                  setDragOverIdx(null);
                }}
                onDragEnd={() => {
                  setDraggedIdx(null);
                  setDragOverIdx(null);
                }}
                className={`rounded-lg border bg-card text-sm transition-all ${
                  draggedIdx === idx ? 'opacity-50' : ''
                } ${dragOverIdx === idx ? 'border-primary border-2' : 'border-border'}`}
              >
                <div
                  className="flex items-center gap-2 p-2 cursor-pointer"
                  onClick={() => setExpandedId(expandedId === launcher.id ? null : launcher.id)}
                >
                  <div
                    className="cursor-grab active:cursor-grabbing shrink-0 text-muted-foreground"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <GripVertical className="h-4 w-4" />
                  </div>

                  <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium shrink-0">
                    {idx + 1}
                  </span>

                  <ColorSwatch colorType={launcher.colorType} size={20} hex={colorTypeToHex?.[launcher.colorType]} />

                  <span className="text-xs flex-1">
                    {hexToColorName(colorTypeToHex?.[launcher.colorType] || COLOR_TYPE_TO_HEX[launcher.colorType] || '888888')} x{launcher.pixelCount}
                  </span>

                  {launcher.isLocked && (
                    <Lock className="h-3 w-3 text-muted-foreground shrink-0" />
                  )}

                  <Badge variant={launcher.isLocked ? 'outline' : 'default'} className="text-[10px] shrink-0">
                    {launcher.isLocked ? 'Locked' : 'Active'}
                  </Badge>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive shrink-0"
                    onClick={(e) => { e.stopPropagation(); onDelete(launcher.id); }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>

                {/* Expanded edit panel */}
                {expandedId === launcher.id && (
                  <div className="px-2 pb-2 pt-1 border-t border-border/50 flex items-center gap-2 flex-wrap">
                    <label className="text-[10px] text-muted-foreground">Color:</label>
                    <select
                      value={launcher.colorType}
                      onChange={(e) => onUpdate(launcher.id, { colorType: Number(e.target.value) })}
                      className="h-6 text-xs bg-background border rounded px-1"
                    >
                      {Array.from({ length: 9 }, (_, i) => i).map((ct) => (
                        <option key={ct} value={ct}>{hexToColorName(colorTypeToHex?.[ct] || COLOR_TYPE_TO_HEX[ct] || '888888')}</option>
                      ))}
                    </select>
                    <label className="text-[10px] text-muted-foreground">Value:</label>
                    <Input
                      type="number"
                      min={1}
                      value={launcher.pixelCount}
                      onChange={(e) => onUpdate(launcher.id, { pixelCount: Math.max(1, Number(e.target.value) || 1) })}
                      className="h-6 w-16 text-xs"
                    />
                    <label className="text-[10px] text-muted-foreground">Group:</label>
                    <select
                      value={launcher.group}
                      onChange={(e) => onUpdate(launcher.id, { group: Number(e.target.value) })}
                      className="h-6 text-xs bg-background border rounded px-1"
                    >
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {/* Add Launcher form */}
        <div className="flex items-center gap-2 flex-wrap mt-2 pt-2 border-t border-border/50">
          <select
            value={addColorType}
            onChange={(e) => setAddColorType(Number(e.target.value))}
            className="h-7 text-xs bg-background border rounded px-2"
          >
            {Array.from({ length: 9 }, (_, i) => i).map((ct) => (
              <option key={ct} value={ct}>{hexToColorName(colorTypeToHex?.[ct] || COLOR_TYPE_TO_HEX[ct] || '888888')}</option>
            ))}
          </select>
          <Input
            type="number"
            min={1}
            value={addPixelCount}
            onChange={(e) => setAddPixelCount(Math.max(1, Number(e.target.value) || 1))}
            className="h-7 w-16 text-xs"
            placeholder="Value"
          />
          <select
            value={addGroup}
            onChange={(e) => setAddGroup(Number(e.target.value))}
            className="h-7 text-xs bg-background border rounded px-2"
          >
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
          <Button variant="outline" size="sm" className="h-7" onClick={() => onAdd(addColorType, addPixelCount, addGroup)}>
            <Plus className="h-3 w-3 mr-1" />
            Add
          </Button>
        </div>
        {/* Total pixel count comparison */}
        {launchers.length > 0 && (() => {
          const launcherTotal = launchers.reduce((sum, l) => sum + l.pixelCount, 0);
          const match = launcherTotal === totalPixels;
          const diff = launcherTotal - totalPixels;
          return (
            <div className={`mt-2 flex items-center gap-2 text-xs px-2 py-1.5 rounded border ${
              match ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400'
            }`}>
              <Hash className="h-3 w-3 shrink-0" />
              <span>Launchers total: <strong>{launcherTotal}px</strong> / Artwork: <strong>{totalPixels}px</strong></span>
              {!match && <span className="ml-auto">({diff > 0 ? '+' : ''}{diff})</span>}
            </div>
          );
        })()}
        <p className="text-xs text-muted-foreground mt-2">
          Click a launcher to edit. Drag to reorder. First 2 = active, rest = locked.
        </p>
      </CardContent>
    </Card>
  );
}
