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

import {
  PixelCell,
  FruitType,
  DifficultyTier,
  FRUIT_COLORS,
  ALL_FRUITS,
  LauncherOrderConfig,
  PixelGroup,
  UnlockStage,
  ExplicitLauncherConfig,
  LAUNCHER_CAPACITIES,
  LauncherCapacity,
} from '@/types/fruitMatch';

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

// ColorType enum values:
// None=-1, Blue=0, Orange=1, Red=2, Pink=3, Yellow=4, Green=5, Violet=6, White=7, Black=8

// Standard color palette (ColorType -> Hex)
export const COLOR_TYPE_TO_HEX: Record<number, string> = {
  0: '4C9EF2',  // Blue - blueberry
  1: 'F99D00',  // Orange - orange
  2: 'DF4624',  // Red - strawberry
  3: 'DE4C7E',  // Pink - dragon fruit
  4: 'F3DE00',  // Yellow - banana
  5: '90CA00',  // Green - apple
  6: '8E68E0',  // Violet/Purple - plum
  7: 'FFFBF7',  // White/Cream - pear
  8: '4C4343',  // Black/Dark - blackberry
};

// Map FruitType to ColorType
export const FRUIT_TO_COLOR_TYPE: Record<FruitType, number> = {
  blueberry: 0,    // Blue
  orange: 1,       // Orange
  strawberry: 2,   // Red
  dragonfruit: 3,  // Pink
  banana: 4,       // Yellow
  apple: 5,        // Green
  plum: 6,         // Violet/Purple
  pear: 7,         // White/Cream
  blackberry: 8,   // Black/Dark
};

// Map ColorType to FruitType (reverse mapping)
export const COLOR_TYPE_TO_FRUIT: Record<number, FruitType> = {
  0: 'blueberry',    // Blue
  1: 'orange',       // Orange
  2: 'strawberry',   // Red
  3: 'dragonfruit',  // Pink
  4: 'banana',       // Yellow
  5: 'apple',        // Green
  6: 'plum',         // Violet/Purple
  7: 'pear',         // White/Cream
  8: 'blackberry',   // Black/Dark
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
  // Extracted launcher order config from imported groups
  launcherOrderConfig?: LauncherOrderConfig;
}

export function importFromReferenceFormat(ref: ReferenceLevel): ImportedLevel {
  const colorData = new Map<string, { colorType: number; colorHex: string; group: number }>();
  const height = ref.Artwork.Height;

  // Track groups and their color types
  const groupColorTypes = new Map<number, Set<FruitType>>();
  const groupPixelCounts = new Map<number, number>();

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

    // Track group info
    if (!groupColorTypes.has(pixel.Group)) {
      groupColorTypes.set(pixel.Group, new Set());
    }
    groupColorTypes.get(pixel.Group)!.add(fruitType);
    groupPixelCounts.set(pixel.Group, (groupPixelCounts.get(pixel.Group) || 0) + 1);

    return {
      row: flippedRow,
      col: pixel.Position.x,
      fruitType,
      filled: false,
      groupId: pixel.Group,
    };
  });

  // Build LauncherOrderConfig from extracted groups
  const launcherOrderConfig = buildLauncherOrderConfigFromImport(
    pixelArt,
    groupColorTypes,
    groupPixelCounts,
    ref.UnlockStageData
  );

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
    launcherOrderConfig,
  };
}

/**
 * Helper to build LauncherOrderConfig from imported reference format data
 */
function buildLauncherOrderConfigFromImport(
  pixelArt: PixelCell[],
  groupColorTypes: Map<number, Set<FruitType>>,
  groupPixelCounts: Map<number, number>,
  unlockStageData: ReferenceUnlockStage[]
): LauncherOrderConfig {
  // Build PixelGroups
  const groups: PixelGroup[] = [];
  const groupIds = Array.from(groupColorTypes.keys()).sort((a, b) => a - b);

  groupIds.forEach((groupId, index) => {
    const colorTypes = Array.from(groupColorTypes.get(groupId) || []);
    groups.push({
      id: groupId,
      name: `Group ${index + 1}`,
      colorTypes,
      order: index,
    });
  });

  // Build UnlockStages from reference format
  const unlockStages: UnlockStage[] = unlockStageData.map((stage, index) => ({
    id: index + 1,
    name: `Stage ${index + 1}`,
    groupIds: stage.RequiredCompletedGroups,
  }));

  // If no unlock stages, create a default one with all groups
  if (unlockStages.length === 0) {
    unlockStages.push({
      id: 1,
      name: 'Stage 1',
      groupIds: groupIds,
    });
  }

  // Build ExplicitLauncherConfigs - generate launchers for each group in order
  const launchers: ExplicitLauncherConfig[] = [];
  let orderIndex = 0;

  for (const group of groups) {
    for (const fruitType of group.colorTypes) {
      const pixelCount = pixelArt.filter(
        c => c.fruitType === fruitType && c.groupId === group.id
      ).length;

      if (pixelCount > 0) {
        const capacities = breakdownIntoCapacitiesForImport(pixelCount);
        for (const capacity of capacities) {
          launchers.push({
            id: `imported-${Date.now()}-${orderIndex}`,
            fruitType,
            capacity,
            groupId: group.id,
            orderIndex: orderIndex++,
          });
        }
      }
    }
  }

  return {
    mode: 'manual', // Imported levels use manual mode to preserve order
    groups,
    launchers,
    unlockStages,
  };
}

/**
 * Break down pixel count into launcher capacities (for import)
 */
function breakdownIntoCapacitiesForImport(pixelCount: number): LauncherCapacity[] {
  const capacities: LauncherCapacity[] = [];
  let remaining = pixelCount;

  const sortedCapacities = [...LAUNCHER_CAPACITIES].sort((a, b) => b - a);

  for (const capacity of sortedCapacities) {
    while (remaining >= capacity) {
      capacities.push(capacity);
      remaining -= capacity;
    }
  }

  if (remaining > 0) {
    capacities.push(20);
  }

  return capacities;
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
  // Optional: launcher order config for explicit groups
  launcherOrderConfig?: LauncherOrderConfig;
}

export function exportToReferenceFormat(data: ExportLevelData): ReferenceLevel {
  const height = data.pixelArtHeight;
  const config = data.launcherOrderConfig;

  // Build a map from FruitType to group ID if config exists
  const fruitToGroupId = new Map<FruitType, number>();
  if (config) {
    for (const group of config.groups) {
      for (const fruitType of group.colorTypes) {
        fruitToGroupId.set(fruitType, group.id);
      }
    }
  }

  // Auto-assign groups by color type if no config
  const colorTypeGroups = new Map<number, number>();
  let nextGroup = 1;

  // Build PixelData array
  // Note: Our format has row=0 at top, reference format has y=0 at bottom
  // So we flip: y = (height - 1) - row
  const pixelData: ReferencePixelData[] = data.pixelArt.map((cell) => {
    const flippedY = (height - 1) - cell.row;
    const key = `${cell.row},${cell.col}`;

    // Use preserved color data if available (from import round-trip)
    if (data.colorData?.has(key)) {
      const preserved = data.colorData.get(key)!;
      return {
        Position: { x: cell.col, y: flippedY },
        ColorType: preserved.colorType,
        Group: preserved.group,
        ColorHex: preserved.colorHex,
      };
    }

    // Convert from FruitType
    const colorType = FRUIT_TO_COLOR_TYPE[cell.fruitType];
    const colorHex = COLOR_TYPE_TO_HEX[colorType];

    // Determine group - prefer cell's explicit groupId, then config, then auto-assign
    let group: number;
    if (cell.groupId !== undefined) {
      group = cell.groupId;
    } else if (config && fruitToGroupId.has(cell.fruitType)) {
      group = fruitToGroupId.get(cell.fruitType)!;
    } else {
      // Auto-assign by color type
      if (!colorTypeGroups.has(colorType)) {
        colorTypeGroups.set(colorType, nextGroup++);
      }
      group = colorTypeGroups.get(colorType)!;
    }

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

  // Build Requirements (count pixels per ColorType and Group)
  const requirementMap = new Map<string, { colorType: number; count: number; group: number }>();
  for (const pixel of pixelData) {
    const key = `${pixel.ColorType}-${pixel.Group}`;
    if (!requirementMap.has(key)) {
      requirementMap.set(key, { colorType: pixel.ColorType, count: 0, group: pixel.Group });
    }
    requirementMap.get(key)!.count++;
  }

  const requirements: ReferenceRequirement[] = Array.from(requirementMap.values()).map(r => ({
    ColorType: r.colorType,
    Value: r.count,
    Group: r.group,
  }));

  // Build UnlockStageData from config or use all groups in one stage
  let unlockStageData: ReferenceUnlockStage[];
  if (config && config.unlockStages.length > 0) {
    unlockStageData = config.unlockStages.map(stage => ({
      RequiredCompletedGroups: stage.groupIds,
    }));
  } else {
    // Get all unique groups from pixel data
    const allGroups = Array.from(new Set(pixelData.map(p => p.Group)));
    unlockStageData = [{ RequiredCompletedGroups: allGroups }];
  }

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
