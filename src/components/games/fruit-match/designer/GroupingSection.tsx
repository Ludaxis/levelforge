'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Plus,
  Trash2,
  GripVertical,
  Layers,
  Paintbrush,
  MousePointer,
  Hash,
} from 'lucide-react';
import { COLOR_TYPE_TO_HEX } from '@/lib/juicyBlastExport';
import { StudioGroup, ColorSwatch, getGroupColor } from './types';

export function GroupingSection({
  groups,
  selectedGroupId,
  onSelectGroup,
  onAddGroup,
  onDeleteGroup,
  onRenameGroup,
  onReorder,
  colorTypeToHex,
  totalPixels,
}: {
  groups: StudioGroup[];
  selectedGroupId: number | null;
  onSelectGroup: (id: number | null) => void;
  onAddGroup: () => void;
  onDeleteGroup: (id: number) => void;
  onRenameGroup: (id: number, name: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  colorTypeToHex?: Record<number, string>;
  totalPixels: number;
}) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const startRename = (g: StudioGroup) => {
    setEditingId(g.id);
    setEditName(g.name);
  };

  const submitRename = () => {
    if (editingId !== null) {
      onRenameGroup(editingId, editName);
      setEditingId(null);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4" />
            Groups
            <Badge variant="outline" className="text-[10px]">{groups.length}</Badge>
          </div>
          <div className="flex items-center gap-1">
            {selectedGroupId !== null && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => onSelectGroup(null)}
              >
                <MousePointer className="h-3 w-3 mr-1" />
                Done
              </Button>
            )}
            <Button variant="outline" size="sm" className="h-7" onClick={onAddGroup}>
              <Plus className="h-3 w-3 mr-1" />
              Add
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {selectedGroupId !== null && (
          <div className="mb-2 p-2 bg-primary/10 border border-primary/30 rounded-lg text-xs text-primary">
            <Paintbrush className="h-3 w-3 inline mr-1" />
            Click pixels on the canvas to assign them to the selected group. Click <strong>Done</strong> when finished.
          </div>
        )}
        {groups.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            Groups auto-populate from JSON. Click Add to create manually.
          </p>
        ) : (
          <div className="space-y-1.5 max-h-[250px] overflow-y-auto">
            {groups.map((g, idx) => {
              const isSelected = selectedGroupId === g.id;
              const groupColor = getGroupColor(idx);
              return (
                <div
                  key={g.id}
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
                  className={`flex items-center gap-2 p-2 rounded-lg border text-sm transition-all cursor-pointer ${
                    draggedIdx === idx ? 'opacity-50' : ''
                  } ${dragOverIdx === idx ? 'border-primary border-2' : ''} ${
                    isSelected
                      ? 'border-primary bg-primary/10 ring-1 ring-primary'
                      : 'border-border bg-card hover:bg-muted/30'
                  }`}
                  onClick={() => onSelectGroup(isSelected ? null : g.id)}
                >
                  {/* Drag handle */}
                  <div
                    className="cursor-grab active:cursor-grabbing shrink-0 text-muted-foreground"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <GripVertical className="h-4 w-4" />
                  </div>

                  {/* Group color indicator (dominant color) */}
                  <div
                    className="w-3 h-3 rounded-full shrink-0 border border-white/30"
                    style={{ backgroundColor: (() => {
                      const entries = Object.entries(g.pixelsByColor);
                      if (entries.length === 0) return groupColor;
                      const dominant = entries.reduce((best, cur) => cur[1] > best[1] ? cur : best);
                      const ct = Number(dominant[0]);
                      const hex = colorTypeToHex?.[ct] || COLOR_TYPE_TO_HEX[ct];
                      return hex ? `#${hex}` : groupColor;
                    })() }}
                  />

                  {/* Color breakdown dots */}
                  <div className="flex gap-0.5 shrink-0">
                    {Object.entries(g.pixelsByColor).map(([ct]) => (
                      <ColorSwatch key={ct} colorType={Number(ct)} size={14} hex={colorTypeToHex?.[Number(ct)]} />
                    ))}
                  </div>

                  {/* Name */}
                  {editingId === g.id ? (
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onBlur={submitRename}
                      onKeyDown={(e) => e.key === 'Enter' && submitRename()}
                      onClick={(e) => e.stopPropagation()}
                      className="h-6 text-xs flex-1"
                      autoFocus
                    />
                  ) : (
                    <span
                      className="text-xs flex-1 truncate cursor-pointer hover:underline"
                      onClick={(e) => {
                        e.stopPropagation();
                        startRename(g);
                      }}
                    >
                      {g.name}
                    </span>
                  )}

                  {/* Pixel count */}
                  <Badge variant="secondary" className="text-[10px] shrink-0">
                    {g.totalPixels}px
                  </Badge>

                  {/* Select for painting */}
                  {isSelected && (
                    <Badge variant="default" className="text-[10px] shrink-0">
                      <Paintbrush className="h-2.5 w-2.5 mr-0.5" />
                      Painting
                    </Badge>
                  )}

                  {/* Delete */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteGroup(g.id);
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
        {/* Total pixel count comparison */}
        {groups.length > 0 && (() => {
          const groupTotal = groups.reduce((sum, g) => sum + g.totalPixels, 0);
          const match = groupTotal === totalPixels;
          const diff = groupTotal - totalPixels;
          return (
            <div className={`mt-2 flex items-center gap-2 text-xs px-2 py-1.5 rounded border ${
              match ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400'
            }`}>
              <Hash className="h-3 w-3 shrink-0" />
              <span>Groups total: <strong>{groupTotal}px</strong> / Artwork: <strong>{totalPixels}px</strong></span>
              {!match && <span className="ml-auto">({diff > 0 ? '+' : ''}{diff})</span>}
            </div>
          );
        })()}
        <p className="text-xs text-muted-foreground mt-2">
          Click a group to select it, then paint pixels on the canvas. Drag to reorder.
        </p>
      </CardContent>
    </Card>
  );
}
