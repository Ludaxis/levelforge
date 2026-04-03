'use client';

import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { StudioGameState, StudioTile, StudioLauncherState } from '@/lib/useStudioGame';
import { COLOR_TYPE_TO_FRUIT, COLOR_TYPE_TO_HEX } from '@/lib/juicyBlastExport';
import { VARIANT_NAMES, FruitType } from '@/types/fruitMatch';
import { ColorSwatch } from './designer/types';

function resolveHex(colorType: number, colorTypeToHex?: Record<number, string>): string {
  return colorTypeToHex?.[colorType] ?? COLOR_TYPE_TO_HEX[colorType] ?? '888888';
}

function variantName(colorType: number, variant: number): string {
  const fruit = COLOR_TYPE_TO_FRUIT[colorType] as FruitType | undefined;
  if (!fruit) return `C${colorType}`;
  const names = VARIANT_NAMES[fruit];
  if (!names) return fruit.charAt(0).toUpperCase() + fruit.slice(1, 4);
  const fullName = names[variant] ?? names[0];
  // Short: first 4 chars
  return fullName.slice(0, 4);
}

function shortName(colorType: number): string {
  return variantName(colorType, 0);
}

function CompactLauncher({
  launcher,
  index,
  active,
  colorTypeToHex,
}: {
  launcher: StudioLauncherState;
  index: number;
  active: boolean;
  colorTypeToHex?: Record<number, string>;
}) {
  const hex = resolveHex(launcher.colorType, colorTypeToHex);
  return (
    <div
      className={`flex items-center gap-1.5 rounded border px-2 py-1 text-[10px] ${
        active
          ? 'border-primary/40 bg-primary/5'
          : 'border-border bg-muted/20 opacity-60'
      }`}
    >
      <ColorSwatch colorType={launcher.colorType} size={12} hex={hex} className="rounded-full flex-shrink-0" />
      <span className="font-medium truncate">{shortName(launcher.colorType)}</span>
      <span className="text-muted-foreground ml-auto font-mono">{launcher.collected.length}/3</span>
    </div>
  );
}

function CompactTile({
  tile,
  label,
  colorTypeToHex,
  muted = false,
  activeColorTypes,
}: {
  tile: StudioTile | null;
  label: string;
  colorTypeToHex?: Record<number, string>;
  muted?: boolean;
  activeColorTypes?: Set<number>;
}) {
  if (!tile) {
    return (
      <div className="flex items-center gap-1 rounded border border-dashed border-border bg-muted/10 px-1.5 py-0.5">
        <span className="text-[9px] text-muted-foreground/50">{label}</span>
      </div>
    );
  }

  const hex = resolveHex(tile.colorType, colorTypeToHex);
  const isActive = activeColorTypes?.has(tile.colorType) ?? false;

  return (
    <div
      className={`flex items-center gap-1 rounded border px-1.5 py-0.5 ${
        isActive
          ? 'border-emerald-400/70 bg-emerald-50/80 dark:bg-emerald-950/20'
          : muted
            ? 'border-amber-300/50 bg-amber-50/50 dark:bg-amber-950/10'
            : 'border-border bg-background'
      }`}
    >
      <span className="text-[9px] text-muted-foreground w-5 flex-shrink-0">{label}</span>
      <ColorSwatch colorType={tile.colorType} size={10} hex={hex} className="rounded-full flex-shrink-0" />
      <span className="text-[10px] font-medium truncate">{variantName(tile.colorType, tile.variant)}</span>
    </div>
  );
}

export function StudioArrangementPreview({
  previewState,
  colorTypeToHex,
  waitingStandSlots,
  blockingOffset,
  maxSelectableItems,
  onBlockingOffsetChange,
}: {
  previewState: StudioGameState | null;
  colorTypeToHex?: Record<number, string>;
  waitingStandSlots: number;
  blockingOffset: number;
  maxSelectableItems: number;
  onBlockingOffsetChange?: (value: number) => void;
}) {
  if (!previewState) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
        Add launchers and item pool entries to generate the playable arrangement.
      </div>
    );
  }

  const unlockDistance = maxSelectableItems * 2 + blockingOffset;
  const allLaunchers = [...previewState.activeLaunchers, ...previewState.launcherQueue];
  const activeColorTypes = new Set(previewState.activeLaunchers.map((l) => l.colorType));

  return (
    <div className="space-y-3">
      {/* Stats + Blocking slider */}
      <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
        <Badge variant="outline" className="h-5 text-[10px]">Unlock {unlockDistance}</Badge>
        <Badge variant="outline" className="h-5 text-[10px]">A: {previewState.layerA.filter(t => t).length}</Badge>
        <Badge variant="outline" className="h-5 text-[10px]">B: {previewState.layerB.filter(t => t).length}</Badge>
        <Badge variant="outline" className="h-5 text-[10px]">C: {previewState.layerC.length}</Badge>
        <Badge variant="outline" className="h-5 text-[10px]">Slots: {waitingStandSlots}</Badge>
      </div>
      {onBlockingOffsetChange && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium text-muted-foreground whitespace-nowrap">Blocking: {blockingOffset}</span>
          <Slider
            value={[blockingOffset]}
            min={0}
            max={10}
            step={1}
            onValueChange={([v]) => onBlockingOffsetChange(v)}
            className="flex-1"
          />
        </div>
      )}

      {/* Blenders — compact inline list */}
      <div className="grid gap-1.5 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {allLaunchers.map((launcher, index) => (
          <CompactLauncher
            key={launcher.id}
            launcher={launcher}
            index={index}
            active={index < previewState.activeLaunchers.length}
            colorTypeToHex={colorTypeToHex}
          />
        ))}
      </div>

      {/* Layer A */}
      <div className="space-y-1">
        <div className="text-[10px] font-medium text-muted-foreground">Layer A (Surface)</div>
        <div className="grid gap-1 grid-cols-3 sm:grid-cols-5 lg:grid-cols-8 xl:grid-cols-10">
          {previewState.layerA.map((tile, index) => (
            <CompactTile
              key={`a-${index}-${tile?.id ?? 'e'}`}
              tile={tile}
              label={`A${index + 1}`}
              colorTypeToHex={colorTypeToHex}
              activeColorTypes={activeColorTypes}
            />
          ))}
        </div>
      </div>

      {/* Layer B */}
      <div className="space-y-1">
        <div className="text-[10px] font-medium text-muted-foreground">Layer B (Hinted)</div>
        <div className="grid gap-1 grid-cols-3 sm:grid-cols-5 lg:grid-cols-8 xl:grid-cols-10">
          {previewState.layerB.map((tile, index) => (
            <CompactTile
              key={`b-${index}-${tile?.id ?? 'e'}`}
              tile={tile}
              label={`B${index + 1}`}
              colorTypeToHex={colorTypeToHex}
              muted
              activeColorTypes={activeColorTypes}
            />
          ))}
        </div>
      </div>

      {/* Layer C — show ALL items */}
      <div className="space-y-1">
        <div className="text-[10px] font-medium text-muted-foreground">
          Layer C (Hidden Queue) — {previewState.layerC.length} items
        </div>
        {previewState.layerC.length > 0 ? (
          <div className="grid gap-1 grid-cols-3 sm:grid-cols-5 lg:grid-cols-8 xl:grid-cols-10">
            {previewState.layerC.map((tile, index) => (
              <CompactTile
                key={`c-${index}-${tile.id}`}
                tile={tile}
                label={`C${index + 1}`}
                colorTypeToHex={colorTypeToHex}
                muted
                activeColorTypes={activeColorTypes}
              />
            ))}
          </div>
        ) : (
          <div className="text-[10px] text-muted-foreground/60 italic">No hidden queue items.</div>
        )}
      </div>
    </div>
  );
}
