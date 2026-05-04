import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { PixelCell } from '@/types/fruitMatch';
import { StudioGameConfig } from '@/lib/studioGameLogic';
import { COLOR_TYPE_TO_FRUIT } from '@/lib/juicyBlastExport';
import { SimulatorPanel } from './SimulatorPanel';

function makeConfig(): StudioGameConfig {
  const pixelArt: PixelCell[] = [0, 0, 0, 1, 1, 1].map((colorType, idx) => ({
    row: Math.floor(idx / 3),
    col: idx % 3,
    fruitType: COLOR_TYPE_TO_FRUIT[colorType],
    filled: false,
    colorType,
    groupId: colorType + 1,
  }));

  return {
    pixelArt,
    pixelArtWidth: 3,
    pixelArtHeight: 2,
    maxSelectableItems: 6,
    waitingStandSlots: 5,
    selectableItems: [
      { colorType: 0, variant: 0, order: 0, layer: 'A' },
      { colorType: 0, variant: 0, order: 1, layer: 'A' },
      { colorType: 0, variant: 0, order: 2, layer: 'A' },
      { colorType: 1, variant: 0, order: 3, layer: 'A' },
      { colorType: 1, variant: 0, order: 4, layer: 'A' },
      { colorType: 1, variant: 0, order: 5, layer: 'A' },
    ],
    launchers: [
      { colorType: 0, pixelCount: 3, group: 1, order: 0 },
      { colorType: 1, pixelCount: 3, group: 2, order: 1 },
    ],
    activeLauncherCount: 2,
    blockingOffset: 0,
    seed: 42,
  };
}

describe('SimulatorPanel', () => {
  it('renders an empty disabled state without crashing', () => {
    render(<SimulatorPanel studioGameConfig={null} legacyScore={null} />);

    expect(screen.getByText(/Simulator unavailable/)).toBeInTheDocument();
  });

  it('runs a deterministic replay for the current config', async () => {
    const user = userEvent.setup();
    render(<SimulatorPanel studioGameConfig={makeConfig()} legacyScore={12} />);

    await user.click(screen.getByRole('button', { name: /Run Replay/i }));

    expect(screen.getByText('Replay Timeline')).toBeInTheDocument();
    expect(screen.getByText('Win')).toBeInTheDocument();
    expect(screen.getAllByText('Complete').length).toBeGreaterThan(0);
  });
});
