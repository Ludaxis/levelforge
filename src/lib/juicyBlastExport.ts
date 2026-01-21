/**
 * Juicy Blast Reference Format Import/Export
 *
 * Converts between internal format and the reference JSON format:
 * {
 *   LevelId, LevelIndex, Difficulty, GraphicId, SongId, LevelVariant,
 *   Artwork: { Width, Height, PixelData: [{Position: {x,y}, ColorType, Group, ColorHex}] },
 *   SelectableItems: [{ColorType, Layer}],
 *   Requirements: [{ColorType, Value, Group}],
 *   UnlockStageData: [{RequiredCompletedGroups: []}]
 * }
 */

import { PixelCell, FruitType, DifficultyTier, FRUIT_COLORS, ALL_FRUITS } from '@/types/fruitMatch';

// ============================================================================
// Reference Format Types
// ============================================================================

export interface ReferencePixelData {
  Position: { x: number; y: number };
  ColorType: number;
  Group: number;
  ColorHex: string;
}

export interface ReferenceArtwork {
  Width: number;
  Height: number;
  PixelData: ReferencePixelData[];
}

export interface ReferenceSelectableItem {
  ColorType: number;
  Layer: number;
}

export interface ReferenceRequirement {
  ColorType: number;
  Value: number;
  Group: number;
}

export interface ReferenceUnlockStage {
  RequiredCompletedGroups: number[];
}

export interface ReferenceLevel {
  LevelId: string;
  SongId: string;
  LevelIndex: number;
  LevelVariant: number;
  Difficulty: number;
  GraphicId: string;
  Artwork: ReferenceArtwork;
  SelectableItems: ReferenceSelectableItem[];
  Requirements: ReferenceRequirement[];
  UnlockStageData: ReferenceUnlockStage[];
}

// ============================================================================
// Color Type Mapping
// ============================================================================

// Standard color palette (ColorType -> Hex)
export const COLOR_TYPE_TO_HEX: Record<number, string> = {
  0: '4C9EF2',  // Blue
  1: 'FA9E00',  // Orange
  2: 'DD4422',  // Red
  3: 'DF4C7C',  // Pink
  4: '8B5CF6',  // Purple/Violet
  5: '22C55E',  // Green
  6: 'EAB308',  // Yellow
  7: 'FFFAFA',  // White
  8: '4C4141',  // Dark/Black
  9: '06B6D4',  // Cyan
};

// Map FruitType to ColorType
export const FRUIT_TO_COLOR_TYPE: Record<FruitType, number> = {
  apple: 2,     // Red
  orange: 1,    // Orange
  lemon: 6,     // Yellow
  grape: 4,     // Purple
  cherry: 3,    // Pink
  kiwi: 5,      // Green
  white: 7,     // White
  black: 8,     // Dark/Black
};

// Map ColorType to FruitType (reverse mapping)
export const COLOR_TYPE_TO_FRUIT: Record<number, FruitType> = {
  0: 'kiwi',    // Blue -> closest is kiwi (green)
  1: 'orange',  // Orange
  2: 'apple',   // Red
  3: 'cherry',  // Pink
  4: 'grape',   // Purple
  5: 'kiwi',    // Green
  6: 'lemon',   // Yellow
  7: 'white',   // White
  8: 'black',   // Dark/Black
  9: 'kiwi',    // Cyan -> default to kiwi
};

// Difficulty tier to number mapping
export const DIFFICULTY_TO_NUMBER: Record<DifficultyTier, number> = {
  trivial: 1,
  easy: 2,
  medium: 3,
  hard: 4,
  expert: 5,
  nightmare: 6,
};

export const NUMBER_TO_DIFFICULTY: Record<number, DifficultyTier> = {
  1: 'trivial',
  2: 'easy',
  3: 'medium',
  4: 'hard',
  5: 'expert',
  6: 'nightmare',
};

// ============================================================================
// Hex Color Utilities
// ============================================================================

// Find closest ColorType for a hex color
export function hexToColorType(hex: string): number {
  const cleanHex = hex.replace('#', '').toUpperCase();

  // First check for exact match
  for (const [typeStr, colorHex] of Object.entries(COLOR_TYPE_TO_HEX)) {
    if (colorHex.toUpperCase() === cleanHex) {
      return parseInt(typeStr);
    }
  }

  // Find closest color by RGB distance
  const targetRgb = hexToRgb(cleanHex);
  let closestType = 0;
  let minDistance = Infinity;

  for (const [typeStr, colorHex] of Object.entries(COLOR_TYPE_TO_HEX)) {
    const rgb = hexToRgb(colorHex);
    const distance = Math.sqrt(
      Math.pow(rgb.r - targetRgb.r, 2) +
      Math.pow(rgb.g - targetRgb.g, 2) +
      Math.pow(rgb.b - targetRgb.b, 2)
    );
    if (distance < minDistance) {
      minDistance = distance;
      closestType = parseInt(typeStr);
    }
  }

  return closestType;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const cleanHex = hex.replace('#', '');
  return {
    r: parseInt(cleanHex.substring(0, 2), 16),
    g: parseInt(cleanHex.substring(2, 4), 16),
    b: parseInt(cleanHex.substring(4, 6), 16),
  };
}

// ============================================================================
// Check if JSON is reference format
// ============================================================================

export function isReferenceFormat(data: unknown): data is ReferenceLevel {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;
  return (
    'Artwork' in obj &&
    typeof obj.Artwork === 'object' &&
    obj.Artwork !== null &&
    'PixelData' in (obj.Artwork as Record<string, unknown>) &&
    'SelectableItems' in obj
  );
}

// ============================================================================
// Import from Reference Format
// ============================================================================

export interface ImportedLevel {
  levelId: string;
  levelIndex: number;
  difficulty: DifficultyTier;
  graphicId: string;
  pixelArtWidth: number;
  pixelArtHeight: number;
  pixelArt: PixelCell[];
  // Store raw color data for export
  colorData: Map<string, { colorType: number; colorHex: string; group: number }>;
  selectableItems: ReferenceSelectableItem[];
  requirements: ReferenceRequirement[];
  unlockStageData: ReferenceUnlockStage[];
}

export function importFromReferenceFormat(ref: ReferenceLevel): ImportedLevel {
  const colorData = new Map<string, { colorType: number; colorHex: string; group: number }>();
  const height = ref.Artwork.Height;

  // Convert PixelData to our PixelCell format
  // Note: Reference format has y=0 at bottom, our format has row=0 at top
  // So we flip: row = (height - 1) - y
  const pixelArt: PixelCell[] = ref.Artwork.PixelData.map((pixel) => {
    const flippedRow = (height - 1) - pixel.Position.y;

    // Store raw color data for round-trip (using flipped row)
    const key = `${flippedRow},${pixel.Position.x}`;
    colorData.set(key, {
      colorType: pixel.ColorType,
      colorHex: pixel.ColorHex,
      group: pixel.Group,
    });

    // Map ColorType to FruitType
    const fruitType = COLOR_TYPE_TO_FRUIT[pixel.ColorType] || 'apple';

    return {
      row: flippedRow,
      col: pixel.Position.x,
      fruitType,
      filled: false,
    };
  });

  return {
    levelId: ref.LevelId,
    levelIndex: ref.LevelIndex,
    difficulty: NUMBER_TO_DIFFICULTY[ref.Difficulty] || 'medium',
    graphicId: ref.GraphicId,
    pixelArtWidth: ref.Artwork.Width,
    pixelArtHeight: ref.Artwork.Height,
    pixelArt,
    colorData,
    selectableItems: ref.SelectableItems,
    requirements: ref.Requirements,
    unlockStageData: ref.UnlockStageData,
  };
}

// ============================================================================
// Export to Reference Format
// ============================================================================

export interface ExportLevelData {
  levelId?: string;
  levelIndex: number;
  difficulty: DifficultyTier;
  graphicId?: string;
  pixelArtWidth: number;
  pixelArtHeight: number;
  pixelArt: PixelCell[];
  // Optional: preserved color data from import
  colorData?: Map<string, { colorType: number; colorHex: string; group: number }>;
  // Optional: sink tiles for SelectableItems
  sinkTileCount?: number;
}

export function exportToReferenceFormat(data: ExportLevelData): ReferenceLevel {
  // Group pixels by color type and assign groups
  const colorTypeGroups = new Map<number, number>();
  let nextGroup = 1;
  const height = data.pixelArtHeight;

  // Build PixelData array
  // Note: Our format has row=0 at top, reference format has y=0 at bottom
  // So we flip: y = (height - 1) - row
  const pixelData: ReferencePixelData[] = data.pixelArt.map((cell) => {
    const flippedY = (height - 1) - cell.row;
    const key = `${cell.row},${cell.col}`;

    // Use preserved color data if available
    if (data.colorData?.has(key)) {
      const preserved = data.colorData.get(key)!;
      return {
        Position: { x: cell.col, y: flippedY },
        ColorType: preserved.colorType,
        Group: preserved.group,
        ColorHex: preserved.colorHex,
      };
    }

    // Otherwise, convert from FruitType
    const colorType = FRUIT_TO_COLOR_TYPE[cell.fruitType];
    // Use the standard reference color for this ColorType, not our internal fruit color
    const colorHex = COLOR_TYPE_TO_HEX[colorType];

    // Assign group by color type
    if (!colorTypeGroups.has(colorType)) {
      colorTypeGroups.set(colorType, nextGroup++);
    }
    const group = colorTypeGroups.get(colorType)!;

    return {
      Position: { x: cell.col, y: flippedY },
      ColorType: colorType,
      Group: group,
      ColorHex: colorHex,
    };
  });

  // Build SelectableItems (one per pixel, Layer 0)
  const selectableItems: ReferenceSelectableItem[] = pixelData.map((pixel) => ({
    ColorType: pixel.ColorType,
    Layer: 0,
  }));

  // Build Requirements (count pixels per ColorType, grouped)
  const colorTypeCounts = new Map<number, number>();
  for (const pixel of pixelData) {
    colorTypeCounts.set(pixel.ColorType, (colorTypeCounts.get(pixel.ColorType) || 0) + 1);
  }

  const requirements: ReferenceRequirement[] = [];
  for (const [colorType, count] of colorTypeCounts) {
    const group = colorTypeGroups.get(colorType) || 0;
    requirements.push({
      ColorType: colorType,
      Value: count,
      Group: group,
    });
  }

  // Build simple UnlockStageData (all groups in one stage)
  const allGroups = Array.from(colorTypeGroups.values());
  const unlockStageData: ReferenceUnlockStage[] = [
    { RequiredCompletedGroups: allGroups },
  ];

  return {
    LevelId: data.levelId || `level_${String(data.levelIndex).padStart(3, '0')}`,
    SongId: 'song_001',
    LevelIndex: data.levelIndex,
    LevelVariant: 0,
    Difficulty: DIFFICULTY_TO_NUMBER[data.difficulty],
    GraphicId: data.graphicId || `graphic_${data.pixelArtWidth}x${data.pixelArtHeight}`,
    Artwork: {
      Width: data.pixelArtWidth,
      Height: data.pixelArtHeight,
      PixelData: pixelData,
    },
    SelectableItems: selectableItems,
    Requirements: requirements,
    UnlockStageData: unlockStageData,
  };
}
