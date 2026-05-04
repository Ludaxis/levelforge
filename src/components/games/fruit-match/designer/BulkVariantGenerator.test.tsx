import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PixelCell } from '@/types/fruitMatch';
import { StudioGameConfig } from '@/lib/studioGameLogic';
import { COLOR_TYPE_TO_FRUIT } from '@/lib/juicyBlastExport';
import { BulkVariantGenerator } from './BulkVariantGenerator';

function makeConfig(): StudioGameConfig {
  const colors = [0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3];
  const pixelArt: PixelCell[] = colors.map((colorType, idx) => ({
    row: Math.floor(idx / 4),
    col: idx % 4,
    fruitType: COLOR_TYPE_TO_FRUIT[colorType],
    filled: false,
    colorType,
    groupId: colorType + 1,
  }));
  const launchers = [0, 1, 2, 3].map((colorType, order) => ({
    colorType,
    pixelCount: 3,
    group: order + 1,
    order,
  }));
  const selectableItems = launchers.flatMap((launcher, launcherIndex) =>
    Array.from({ length: 3 }, (_, itemIndex) => {
      const order = launcherIndex * 3 + itemIndex;
      return {
        colorType: launcher.colorType,
        variant: 0,
        order,
        layer: order < 8 ? 'A' as const : 'B' as const,
      };
    }),
  );

  return {
    pixelArt,
    pixelArtWidth: 4,
    pixelArtHeight: 3,
    maxSelectableItems: 8,
    waitingStandSlots: 5,
    selectableItems,
    launchers,
    activeLauncherCount: 2,
    blockingOffset: 1,
    seed: 42,
  };
}

describe('BulkVariantGenerator', () => {
  it('exposes content-aware validated variant controls', async () => {
    const user = userEvent.setup();
    const config = makeConfig();

    render(
      <BulkVariantGenerator
        base={{
          maxSelectableItems: config.maxSelectableItems,
          blockingOffset: config.blockingOffset ?? 0,
          activeLauncherCount: config.activeLauncherCount ?? 2,
          waitingStandSlots: config.waitingStandSlots,
          maxActiveLaunchers: config.launchers.length,
        }}
        baseConfig={config}
        levelNumber={1}
        onExport={vi.fn()}
        onExportValidated={vi.fn()}
      />,
    );

    await user.click(screen.getByText('Bulk Variant Generator'));

    expect(screen.getByText('Content separation')).toBeInTheDocument();
    expect(screen.getByText(/separation checked/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Generate Validated 1-9/i })).toBeInTheDocument();
  });

  it('renders solver separation after generating validated variants', async () => {
    const user = userEvent.setup();
    const config = makeConfig();

    render(
      <BulkVariantGenerator
        base={{
          maxSelectableItems: config.maxSelectableItems,
          blockingOffset: config.blockingOffset ?? 0,
          activeLauncherCount: config.activeLauncherCount ?? 2,
          waitingStandSlots: config.waitingStandSlots,
          maxActiveLaunchers: config.launchers.length,
        }}
        baseConfig={config}
        levelNumber={1}
        onExport={vi.fn()}
        onExportValidated={vi.fn()}
      />,
    );

    await user.click(screen.getByText('Bulk Variant Generator'));
    await user.click(screen.getByRole('button', { name: /Generate Validated 1-9/i }));

    await waitFor(
      () => expect(screen.getByText(/Variant separation/)).toBeInTheDocument(),
      { timeout: 5000 },
    );
    expect(screen.getByText('Items')).toBeInTheDocument();
    expect(screen.getByText('Amb')).toBeInTheDocument();
    expect(screen.getByText('New')).toBeInTheDocument();
  });
});
