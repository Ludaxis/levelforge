'use client';

import { Badge } from '@/components/ui/badge';
import { StudioGameState, StudioTile, StudioLauncherState } from '@/lib/useStudioGame';
import { COLOR_TYPE_TO_FRUIT, hexToColorName, COLOR_TYPE_TO_HEX } from '@/lib/juicyBlastExport';
import { ColorSwatch } from './designer/types';

function resolveHex(colorType: number, colorTypeToHex?: Record<number, string>): string {
  return colorTypeToHex?.[colorType] ?? COLOR_TYPE_TO_HEX[colorType] ?? '888888';
}

function formatFruitName(colorType: number): string {
  const fruit = COLOR_TYPE_TO_FRUIT[colorType];
  if (!fruit) return `Color ${colorType}`;
  return fruit.charAt(0).toUpperCase() + fruit.slice(1);
}

function LauncherPreview({
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
      className={`rounded-xl border p-2.5 transition-colors ${
        active
          ? 'border-primary/40 bg-primary/5'
          : 'border-border bg-muted/25 opacity-70'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Blender {index + 1}
          </div>
          <div className="text-xs font-medium">{formatFruitName(launcher.colorType)}</div>
        </div>
        <ColorSwatch colorType={launcher.colorType} size={18} hex={hex} className="rounded-full" />
      </div>
      <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{active ? 'Active' : 'Queued'}</span>
        <span className="font-mono">{launcher.collected.length}/3</span>
      </div>
    </div>
  );
}

function TileCell({
  tile,
  label,
  colorTypeToHex,
  muted = false,
}: {
  tile: StudioTile | null;
  label: string;
  colorTypeToHex?: Record<number, string>;
  muted?: boolean;
}) {
  if (!tile) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/20 p-2 text-center">
        <div className="text-[10px] text-muted-foreground">{label}</div>
        <div className="mt-2 text-[10px] text-muted-foreground/70">Empty</div>
      </div>
    );
  }

  const hex = resolveHex(tile.colorType, colorTypeToHex);
  return (
    <div
      className={`rounded-lg border p-2 transition-colors ${
        muted
          ? 'border-amber-300/60 bg-amber-50/60 dark:bg-amber-950/10'
          : 'border-emerald-300/60 bg-emerald-50/60 dark:bg-emerald-950/10'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[10px] text-muted-foreground">{label}</span>
        <ColorSwatch colorType={tile.colorType} size={16} hex={hex} className="rounded-full" />
      </div>
      <div className="mt-2 text-[11px] font-medium">{formatFruitName(tile.colorType)}</div>
      <div className="text-[10px] text-muted-foreground">{hexToColorName(hex)}</div>
    </div>
  );
}

export function StudioArrangementPreview({
  previewState,
  colorTypeToHex,
  waitingStandSlots,
  blockingOffset,
  maxSelectableItems,
}: {
  previewState: StudioGameState | null;
  colorTypeToHex?: Record<number, string>;
  waitingStandSlots: number;
  blockingOffset: number;
  maxSelectableItems: number;
}) {
  if (!previewState) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
        Add launchers and item pool entries to generate the playable arrangement.
      </div>
    );
  }

  const unlockDistance = maxSelectableItems * 2 + blockingOffset;
  const launchers = [...previewState.activeLaunchers, ...previewState.launcherQueue];
  const visibleLayerC = previewState.layerC.slice(0, 10);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">Unlock Distance {unlockDistance}</Badge>
        <Badge variant="outline">Layer A {previewState.layerA.length}</Badge>
        <Badge variant="outline">Layer B {previewState.layerB.length}</Badge>
        <Badge variant="outline">Layer C {previewState.layerC.length}</Badge>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {launchers.map((launcher, index) => (
          <LauncherPreview
            key={launcher.id}
            launcher={launcher}
            index={index}
            active={index < previewState.activeLaunchers.length}
            colorTypeToHex={colorTypeToHex}
          />
        ))}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium">Backup Slots</div>
          <div className="text-[10px] text-muted-foreground">Live gameplay uses these as overflow pressure.</div>
        </div>
        <div className="grid grid-cols-5 gap-2 lg:grid-cols-7">
          {Array.from({ length: waitingStandSlots }, (_, index) => (
            <div
              key={index}
              className="rounded-lg border border-border bg-background/60 p-2 text-center"
            >
              <div className="text-[10px] text-muted-foreground">Slot {index + 1}</div>
              <div className="mt-2 text-[10px] text-muted-foreground/70">Empty</div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium">Layer A (Surface)</div>
          <div className="text-[10px] text-muted-foreground">Clickable items visible at the start.</div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {previewState.layerA.map((tile, index) => (
            <TileCell
              key={`a-${index}-${tile?.id ?? 'empty'}`}
              tile={tile}
              label={`A${index + 1}`}
              colorTypeToHex={colorTypeToHex}
            />
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium">Layer B (Hinted)</div>
          <div className="text-[10px] text-muted-foreground">Slides up when the matching A slot is cleared.</div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {previewState.layerB.map((tile, index) => (
            <TileCell
              key={`b-${index}-${tile?.id ?? 'empty'}`}
              tile={tile}
              label={`B${index + 1}`}
              colorTypeToHex={colorTypeToHex}
              muted
            />
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium">Layer C (Hidden Queue)</div>
          <div className="text-[10px] text-muted-foreground">
            Shared refill queue feeding B slots. Showing {visibleLayerC.length} of {previewState.layerC.length}.
          </div>
        </div>
        {visibleLayerC.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            {visibleLayerC.map((tile, index) => (
              <TileCell
                key={`c-${index}-${tile.id}`}
                tile={tile}
                label={`C${index + 1}`}
                colorTypeToHex={colorTypeToHex}
                muted
              />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border bg-muted/20 p-3 text-[11px] text-muted-foreground">
            No hidden queue for this arrangement.
          </div>
        )}
      </div>
    </div>
  );
}
