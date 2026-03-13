'use client';

import {
  FruitType,
  DesignedFruitMatchLevel,
  FruitMatchLevel,
} from '@/types/fruitMatch';
import {
  COLOR_TYPE_TO_HEX,
  hexToColorName,
} from '@/lib/juicyBlastExport';

// ============================================================================
// Types
// ============================================================================

export interface LevelDesignerV2Props {
  onPlayLevel: (level: FruitMatchLevel) => void;
  onAddToCollection?: (level: DesignedFruitMatchLevel) => void;
  levelNumber?: number;
  onLevelNumberChange?: (num: number) => void;
  maxLevelNumber?: number;
  editingLevel?: DesignedFruitMatchLevel | null;
  existingLevelIds?: string[];
}

export interface StudioPixelCell {
  row: number;
  col: number;
  colorType: number;
  colorGroup: number;
  colorHex: string;
  group: number;
  fruitType: FruitType;
}

export interface StudioGroup {
  id: number;
  name: string;
  pixelsByColor: Record<number, number>;
  totalPixels: number;
}

export interface StudioLauncher {
  id: string;
  colorType: number;
  pixelCount: number;
  group: number;
  isLocked: boolean;
  order: number;
}

export interface StudioSelectableItem {
  id: string;
  colorType: number;
  variant: number;
  layer: 'A' | 'B' | 'C';
  order: number;
}

// ============================================================================
// Constants
// ============================================================================

export const DIFFICULTY_COLORS: Record<string, string> = {
  trivial: 'bg-gray-500',
  easy: 'bg-green-500',
  medium: 'bg-yellow-500 text-black',
  hard: 'bg-orange-500',
  expert: 'bg-red-500',
  nightmare: 'bg-purple-500',
};

// Stable group colors for visual identification
export const GROUP_COLORS = [
  '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
  '#EC4899', '#06B6D4', '#F97316', '#6366F1', '#14B8A6',
];

// ============================================================================
// Helper: generate unique IDs
// ============================================================================

let _idCounter = 0;
export function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${++_idCounter}`;
}

// ============================================================================
// Helper: get group color by index
// ============================================================================

export function getGroupColor(index: number): string {
  return GROUP_COLORS[index % GROUP_COLORS.length];
}

// ============================================================================
// ColorSwatch helper component
// ============================================================================

export function ColorSwatch({ colorType, size = 20, className = '', hex: hexOverride }: { colorType: number; size?: number; className?: string; hex?: string }) {
  const hex = hexOverride || COLOR_TYPE_TO_HEX[colorType] || '888888';
  return (
    <div
      className={`rounded-sm border border-white/20 shrink-0 ${className}`}
      style={{ backgroundColor: `#${hex}`, width: size, height: size }}
      title={hexToColorName(hex)}
    />
  );
}
