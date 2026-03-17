import {
  HexStack,
  HexaBlockLevel,
  STACK_COLORS,
  GameMode,
  StackDirection,
  HexAxis,
  DesignedLevel,
  Carousel,
} from '@/types/hexaBlock';
import {
  HexDirection,
  DIRECTION_ORDER,
  AxialCoord,
} from '@/lib/hexGrid';
import { LevelTemplate } from '@/lib/hexLevelTemplates';

// ============================================================================
// Props Interfaces
// ============================================================================

export interface HexBlockLevelDesignerProps {
  onPlayLevel: (level: HexaBlockLevel) => void;
  onAddToCollection?: (level: DesignedLevel) => void;
  levelNumber?: number;
  onLevelNumberChange?: (num: number) => void;
  maxLevelNumber?: number;
  editingLevel?: DesignedLevel | null;
  showMetricsPanel?: boolean;
}

export interface StackConfig {
  direction: HexDirection;
  color: string;
  height: number;
}

export interface EmbeddedMetricsPanelProps {
  stacks: Map<string, HexStack>;
  holes: Set<string>;
  levelNumber: number;
  solvable: boolean;
  initialClearability: number;
  gridRadius: number;
  extraMoves: number;
  optimalMoves: number;
  onExtraMovesChange: (value: number) => void;
}

export interface DirectionArrowProps {
  cx: number;
  cy: number;
  direction: StackDirection;
  size: number;
  color?: string;
}

export interface HexGridCanvasProps {
  viewBox: string;
  width: number;
  height: number;
  origin: { x: number; y: number };
  gridCoords: AxialCoord[];
  stacks: Map<string, HexStack>;
  holes: Set<string>;
  pauses: Set<string>;
  carousels: Map<string, Carousel>;
  hoveredHex: string | null;
  editMode: 'place' | 'direction';
  placementMode: 'stack' | 'hole' | 'pause' | 'carousel';
  selectedDirection: StackDirection;
  selectedColor: string;
  selectedCarouselArms: Set<HexDirection>;
  showBlocksAhead: boolean;
  blocksAheadMap: Map<string, number>;
  onHexClick: (coord: AxialCoord) => void;
  onHexHover: (key: string | null) => void;
}

export interface ControlPanelProps {
  solvability: { solvable: boolean; optimalMoves: number; pauseEncounters: number; message: string };
  stacks: Map<string, HexStack>;
  holes: Set<string>;
  initialClearability: number;
  editMode: 'place' | 'direction';
  placementMode: 'stack' | 'hole' | 'pause' | 'carousel';
  selectedDirection: StackDirection;
  selectedColor: string;
  selectedCarouselArms: Set<HexDirection>;
  gameMode: GameMode;
  gridRadius: number;
  gridCoords: AxialCoord[];
  showBlocksAhead: boolean;
  onEditModeChange: (mode: 'place' | 'direction') => void;
  onPlacementModeChange: (mode: 'stack' | 'hole' | 'pause' | 'carousel') => void;
  onDirectionChange: (dir: StackDirection) => void;
  onColorChange: (color: string) => void;
  onCarouselArmsChange: (arms: Set<HexDirection>) => void;
  onGameModeChange: (mode: GameMode) => void;
  onRadiusChange: (radius: number) => void;
  onShowBlocksAheadChange: (show: boolean) => void;
}

export interface ConfigurationPanelProps {
  stacks: Map<string, HexStack>;
  holes: Set<string>;
  gridCoords: AxialCoord[];
  targetStackCount: number;
  targetDifficulty: 'any' | 'easy' | 'medium' | 'hard';
  solvability: { solvable: boolean; optimalMoves: number; pauseEncounters: number; message: string };
  shareCode: string | null;
  importCode: string;
  copySuccess: boolean;
  editingLevel?: DesignedLevel | null;
  onAddToCollection?: (level: DesignedLevel) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onTargetStackCountChange: (count: number) => void;
  onTargetDifficultyChange: (diff: 'any' | 'easy' | 'medium' | 'hard') => void;
  onGenerateRandom: () => void;
  onSmartFill: () => void;
  onApplyTemplate: (template: LevelTemplate) => void;
  onExportJSON: () => void;
  onImportJSON: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onGenerateShareCode: () => void;
  onCopyCode: () => void;
  onImportCode: () => void;
  onImportCodeChange: (code: string) => void;
  onClearAll: () => void;
  onPlay: () => void;
  onAddToCollectionClick: () => void;
}

// ============================================================================
// Constants
// ============================================================================

export const HEX_SIZE = 35;
export const STACK_COLOR_OPTIONS = Object.entries(STACK_COLORS);

export const AXIS_ORDER: HexAxis[] = ['E_W', 'NE_SW', 'SE_NW'];
export const ALL_DIRECTIONS: StackDirection[] = [...DIRECTION_ORDER, ...AXIS_ORDER];

export const DIRECTION_LABELS: Record<StackDirection, string> = {
  NE: '↗',
  E: '→',
  SE: '↘',
  SW: '↙',
  W: '←',
  NW: '↖',
  E_W: '↔',
  NE_SW: '⤢',
  SE_NW: '⤡',
};
