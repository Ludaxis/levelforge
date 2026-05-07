import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { StudioExportLevel } from '@/lib/juicyBlastExport';
import { SolvabilityChecker } from './SolvabilityChecker';

function makeTwoColorLevel(): StudioExportLevel {
  return {
    LevelId: 'OptimalStarts',
    MaxSelectableItems: 2,
    BlockingOffset: 0,
    WaitingStandSlots: 5,
    ActiveLauncherCount: 2,
    Artwork: {
      Width: 1,
      Height: 1,
      PixelData: [],
    },
    Requirements: [
      { ColorType: 0, Value: 1, Group: 1 },
      { ColorType: 2, Value: 1, Group: 2 },
    ],
    SelectableItems: [
      { ColorType: 0, Variant: 0, Layer: 0, Order: 0 },
      { ColorType: 2, Variant: 0, Layer: 0, Order: 1 },
      { ColorType: 0, Variant: 0, Layer: 1, Order: 2 },
      { ColorType: 2, Variant: 0, Layer: 1, Order: 3 },
      { ColorType: 0, Variant: 0, Layer: 2, Order: 4 },
      { ColorType: 2, Variant: 0, Layer: 2, Order: 5 },
    ],
    Launchers: [
      { ColorType: 0, Value: 1, Group: 1, Order: 0, IsLocked: false },
      { ColorType: 2, Value: 1, Group: 2, Order: 1, IsLocked: false },
    ],
  };
}

describe('SolvabilityChecker', () => {
  it('imports a level without pretending non-DFS path counts are exact', async () => {
    const user = userEvent.setup();
    const { container } = render(<SolvabilityChecker />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([JSON.stringify(makeTwoColorLevel())], 'OptimalStarts.json', {
      type: 'application/json',
    });
    Object.defineProperty(file, 'text', {
      value: async () => JSON.stringify(makeTwoColorLevel()),
    });

    fireEvent.change(input, { target: { files: [file] } });
    expect(await screen.findByText('1 level loaded')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Run Analysis/i }));

    expect((await screen.findAllByText('OptimalStarts')).length).toBeGreaterThan(0);
    expect(screen.getByText('Not counted')).toBeInTheDocument();
    expect(screen.getByText(/Optimal starts: #0 #1/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Export Optimal Policy/i })).toBeInTheDocument();
  });
});
