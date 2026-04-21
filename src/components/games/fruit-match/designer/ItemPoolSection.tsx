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
  Pin,
  PinOff,
} from 'lucide-react';
import { VARIANT_NAMES } from '@/types/fruitMatch';
import { COLOR_TYPE_TO_FRUIT, COLOR_TYPE_TO_HEX, hexToColorName } from '@/lib/juicyBlastExport';
import { StudioSelectableItem, ColorSwatch } from './types';
import {
  VARIANT_COMPLEXITY_STOPS,
  summarizeGlobalComplexity,
  type VariantComplexityStop,
} from '@/lib/juicyBlast/variantComplexity';

export function ItemPoolSection({
  items,
  maxSelectableItems,
  displayOrder,
  onMaxChange,
  onAddItem,
  onDeleteItem,
  onReorder,
  onChangeLayer,
  onChangeVariant,
  colorTypeToHex,
  pinnedItemIds,
  onClearPins,
  variantComplexityByColor,
  onGlobalComplexityChange,
  onColorComplexityChange,
}: {
  items: StudioSelectableItem[];
  maxSelectableItems: number;
  displayOrder?: Map<string, number>;
  onMaxChange: (v: number) => void;
  onAddItem: (colorType: number, variant: number) => void;
  onDeleteItem: (id: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onChangeLayer: (id: string, layer: 'A' | 'B' | 'C') => void;
  onChangeVariant: (id: string, variant: number) => void;
  colorTypeToHex?: Record<number, string>;
  pinnedItemIds?: Set<string>;
  onClearPins?: () => void;
  variantComplexityByColor: Record<number, VariantComplexityStop>;
  onGlobalComplexityChange: (stop: VariantComplexityStop) => void;
  onColorComplexityChange: (colorType: number, stop: VariantComplexityStop) => void;
}) {
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [addColorType, setAddColorType] = useState(0);
  const [addVariant, setAddVariant] = useState(0);

  // Sort by arrangement display order if available, otherwise by authored order
  const sorted = useMemo(() => {
    if (displayOrder && displayOrder.size > 0) {
      return [...items].sort((a, b) => {
        const oa = displayOrder.get(a.id) ?? a.order;
        const ob = displayOrder.get(b.id) ?? b.order;
        return oa - ob;
      });
    }
    return [...items].sort((a, b) => a.order - b.order);
  }, [items, displayOrder]);

  // Split into layers
  const layerA = sorted.filter((i) => i.layer === 'A');
  const layerB = sorted.filter((i) => i.layer === 'B');
  const layerC = sorted.filter((i) => i.layer === 'C');

  const layerOptions: ('A' | 'B' | 'C')[] = ['A', 'B', 'C'];

  const pinnedCount = pinnedItemIds?.size ?? 0;

  // Unique colors present, counted + sorted (most fruits first, same as color palette)
  const colorsInLevel = useMemo(() => {
    const counts = new Map<number, number>();
    for (const it of items) counts.set(it.colorType, (counts.get(it.colorType) ?? 0) + 1);
    return [...counts.entries()]
      .map(([colorType, count]) => ({ colorType, count }))
      .sort((a, b) => b.count - a.count);
  }, [items]);

  const globalComplexity = useMemo(
    () => summarizeGlobalComplexity(variantComplexityByColor, colorsInLevel.map((c) => c.colorType)),
    [variantComplexityByColor, colorsInLevel]
  );

  const renderItem = (item: StudioSelectableItem, globalIdx: number, layerNum: number) => {
    const fruit = COLOR_TYPE_TO_FRUIT[item.colorType];
    const variantNames = fruit ? VARIANT_NAMES[fruit] : undefined;
    const isPinned = pinnedItemIds?.has(item.id) ?? false;
    return (
      <div
        key={item.id}
        draggable
        onDragStart={() => setDraggedIdx(globalIdx)}
        onDragOver={(e) => {
          e.preventDefault();
          if (draggedIdx !== null && globalIdx !== draggedIdx) setDragOverIdx(globalIdx);
        }}
        onDragLeave={() => setDragOverIdx(null)}
        onDrop={(e) => {
          e.preventDefault();
          if (draggedIdx !== null && draggedIdx !== globalIdx) onReorder(draggedIdx, globalIdx);
          setDraggedIdx(null);
          setDragOverIdx(null);
        }}
        onDragEnd={() => {
          setDraggedIdx(null);
          setDragOverIdx(null);
        }}
        className={`flex items-center gap-1.5 p-1.5 rounded border bg-card text-xs transition-all ${
          draggedIdx === globalIdx ? 'opacity-50' : ''
        } ${dragOverIdx === globalIdx ? 'border-primary border-2' : isPinned ? 'border-amber-500/50' : 'border-border'}`}
      >
        <span className="w-4 text-[10px] text-muted-foreground text-center font-mono shrink-0">{layerNum}</span>
        {isPinned && <Pin className="h-2.5 w-2.5 text-amber-500 shrink-0" />}
        <GripVertical className="h-3 w-3 text-muted-foreground cursor-grab shrink-0" />
        <ColorSwatch colorType={item.colorType} size={16} hex={colorTypeToHex?.[item.colorType]} />
        <select
          value={item.variant}
          onChange={(e) => onChangeVariant(item.id, Number(e.target.value))}
          className="h-5 text-[10px] bg-background border rounded px-0.5 flex-1 min-w-0 truncate"
        >
          {[0, 1, 2].map((v) => (
            <option key={v} value={v}>
              {variantNames?.[v] || `V${v}`}
            </option>
          ))}
        </select>
        <select
          value={item.layer}
          onChange={(e) => onChangeLayer(item.id, e.target.value as 'A' | 'B' | 'C')}
          className="h-5 text-[10px] bg-background border rounded px-0.5 shrink-0"
        >
          {layerOptions.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
        <Button
          variant="ghost"
          size="sm"
          className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive shrink-0"
          onClick={() => onDeleteItem(item.id)}
        >
          <Trash2 className="h-2.5 w-2.5" />
        </Button>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          <span>Item Pool (Selectable Items)</span>
          <div className="flex items-center gap-1.5">
            {pinnedCount > 0 && onClearPins && (
              <Button variant="ghost" size="sm" className="h-5 text-[10px] text-amber-500" onClick={onClearPins} title="Clear all pinned layers — let blocking control layers">
                <PinOff className="h-3 w-3 mr-1" />
                {pinnedCount} pinned
              </Button>
            )}
            <Badge variant="outline" className="text-[10px]">{items.length} items</Badge>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* MaxSelectableItems */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Max Selectable:</span>
          <Input
            type="number"
            min={1}
            max={20}
            value={maxSelectableItems}
            onChange={(e) => onMaxChange(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
            className="h-7 w-20 text-xs"
          />
        </div>

        {/* Variant Complexity — global + per-color */}
        {colorsInLevel.length > 0 && (
          <div className="rounded-md border bg-muted/20 p-2 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-col">
                <span className="text-xs font-medium">Variant Complexity</span>
                <span className="text-[10px] text-muted-foreground">
                  Redistributes variants in groups of 3 within each color.
                </span>
              </div>
              <StopPicker
                value={globalComplexity === 'mixed' ? null : globalComplexity}
                mixed={globalComplexity === 'mixed'}
                onChange={(s) => onGlobalComplexityChange(s)}
                title="Apply to all colors"
              />
            </div>

            <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-1.5">
              {colorsInLevel.map(({ colorType, count }) => {
                const fruit = COLOR_TYPE_TO_FRUIT[colorType];
                const name = hexToColorName(
                  colorTypeToHex?.[colorType] || COLOR_TYPE_TO_HEX[colorType] || '888888'
                );
                const stop = variantComplexityByColor[colorType] ?? 0;
                return (
                  <div
                    key={colorType}
                    className="flex items-center gap-1.5 rounded border bg-card px-1.5 py-1"
                  >
                    <ColorSwatch
                      colorType={colorType}
                      size={14}
                      hex={colorTypeToHex?.[colorType]}
                    />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[10px] leading-none">{name}</span>
                      <span className="text-[9px] leading-none text-muted-foreground">
                        {count} · {fruit ? VARIANT_NAMES[fruit]?.[stop] ?? `V${stop}` : `V${stop}`}
                      </span>
                    </div>
                    <StopPicker
                      value={stop}
                      onChange={(s) => onColorComplexityChange(colorType, s)}
                      compact
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Add Item */}
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={addColorType}
            onChange={(e) => {
              setAddColorType(Number(e.target.value));
              setAddVariant(0);
            }}
            className="h-7 text-xs bg-background border rounded px-2"
          >
            {Array.from({ length: 9 }, (_, i) => i).map((ct) => (
              <option key={ct} value={ct}>
                {hexToColorName(colorTypeToHex?.[ct] || COLOR_TYPE_TO_HEX[ct] || '888888')}
              </option>
            ))}
          </select>
          <select
            value={addVariant}
            onChange={(e) => setAddVariant(Number(e.target.value))}
            className="h-7 text-xs bg-background border rounded px-2"
          >
            {[0, 1, 2].map((v) => {
              const fruit = COLOR_TYPE_TO_FRUIT[addColorType];
              const name = fruit ? VARIANT_NAMES[fruit]?.[v] || `Variant ${v}` : `Variant ${v}`;
              return (
                <option key={v} value={v}>
                  {name}
                </option>
              );
            })}
          </select>
          <Button variant="outline" size="sm" className="h-7" onClick={() => onAddItem(addColorType, addVariant)}>
            <Plus className="h-3 w-3 mr-1" />
            Add
          </Button>
        </div>

        {/* Layer A */}
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <Badge className="bg-green-600 text-[10px]">Layer A</Badge>
            <span className="text-[10px] text-muted-foreground">Surface (visible)</span>
            <span className="text-[10px] text-muted-foreground ml-auto">{layerA.length}/{maxSelectableItems}</span>
          </div>
          <div className="space-y-0.5 max-h-[120px] overflow-y-auto">
            {layerA.map((item, i) => renderItem(item, sorted.indexOf(item), i + 1))}
          </div>
        </div>

        {/* Layer B */}
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <Badge className="bg-blue-600 text-[10px]">Layer B</Badge>
            <span className="text-[10px] text-muted-foreground">Replaces A when picked</span>
            <span className="text-[10px] text-muted-foreground ml-auto">{layerB.length}/{maxSelectableItems}</span>
          </div>
          <div className="space-y-0.5 max-h-[120px] overflow-y-auto">
            {layerB.map((item, i) => renderItem(item, sorted.indexOf(item), i + 1))}
          </div>
        </div>

        {/* Layer C */}
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <Badge className="bg-purple-600 text-[10px]">Layer C</Badge>
            <span className="text-[10px] text-muted-foreground">Queue (fills B slots)</span>
            <span className="text-[10px] text-muted-foreground ml-auto">{layerC.length}</span>
          </div>
          <div className="space-y-0.5 max-h-[120px] overflow-y-auto">
            {layerC.map((item, i) => renderItem(item, sorted.indexOf(item), i + 1))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StopPicker({
  value,
  onChange,
  mixed,
  compact,
  title,
}: {
  value: VariantComplexityStop | null;
  onChange: (stop: VariantComplexityStop) => void;
  mixed?: boolean;
  compact?: boolean;
  title?: string;
}) {
  const size = compact ? 'h-5 w-5 text-[10px]' : 'h-6 w-6 text-[11px]';
  return (
    <div
      className="inline-flex overflow-hidden rounded border bg-background"
      title={title ?? (mixed ? 'Colors use different complexity stops' : undefined)}
    >
      {VARIANT_COMPLEXITY_STOPS.map((s) => {
        const active = !mixed && value === s;
        return (
          <button
            key={s}
            type="button"
            onClick={() => onChange(s)}
            className={`${size} font-mono transition-colors ${
              active
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            {s}
          </button>
        );
      })}
    </div>
  );
}
