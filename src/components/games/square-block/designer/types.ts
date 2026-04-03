import {
  SquareBlock,
  BlockDirection,
  BLOCK_COLORS,
  DesignedLevel,
  DifficultyTier,
} from '@/types/squareBlock';
import { CollectionMetadata } from '@/lib/storage/types';
import { DeadlockInfo } from '@/lib/useSquareBlockGame';

// ============================================================================
// Constants
// ============================================================================

/** Fixed cell size for readability - grid scrolls instead of shrinking */
export const FIXED_CELL_SIZE = 32;

export const DEFAULT_BLOCK_COLOR = BLOCK_COLORS.cyan;

export const DIRECTION_LABELS: Record<BlockDirection, string> = {
  N: '\u2191',
  E: '\u2192',
  S: '\u2193',
  W: '\u2190',
  N_S: '\u2195',
  E_W: '\u2194',
};

// ============================================================================
// Types
// ============================================================================

export interface StagedLevel {
  id: string;
  filename: string;
  levelData: { rows: number; cols: number; blocks: SquareBlock[] };
  blockCount: number;
  solvable: boolean;
  difficultyScore: number | null;
  difficultyTier: DifficultyTier | null;
  selected: boolean;
  error?: string;
}

export interface SquareBlockLevelDesignerProps {
  onPlayLevel: (level: import('@/types/squareBlock').SquareBlockLevel) => void;
  onAddToCollection?: (level: DesignedLevel, collectionId?: string) => void;
  levelNumber?: number;
  onLevelNumberChange?: (num: number) => void;
  maxLevelNumber?: number;
  editingLevel?: DesignedLevel | null;
  showMetricsPanel?: boolean;
  // Multiple collections support
  collections?: CollectionMetadata[];
  activeCollectionId?: string | null;
}

// ============================================================================
// Sub-component prop types
// ============================================================================

export interface GridCanvasProps {
  rows: number;
  cols: number;
  cellSize: number;
  gridCoords: import('@/lib/squareGrid').GridCoord[];
  blocks: Map<string, SquareBlock>;
  holes: Set<string>;
  hoveredCell: string | null;
  setHoveredCell: (key: string | null) => void;
  handleCellClick: (coord: import('@/lib/squareGrid').GridCoord) => void;
  canClearBlock: (block: SquareBlock, currentBlocks: Map<string, SquareBlock>, currentHoles: Set<string>) => boolean;
  deadlockInfo: DeadlockInfo;
  selectedDirection: BlockDirection;
  selectedLocked: boolean;
  selectedIceCount: number;
  selectedMirror: boolean;
  showBlocksAhead: boolean;
  blocksAheadMap: Map<string, number>;
  viewBox: string;
  origin: { x: number; y: number };
  width: number;
  height: number;
  zoom: number;
  isPanning: boolean;
  svgContainerRef: React.RefObject<HTMLDivElement | null>;
  handleWheel: (e: React.WheelEvent) => void;
  handlePanStart: (e: React.MouseEvent) => void;
  handlePanMove: (e: React.MouseEvent) => void;
  handlePanEnd: () => void;
}

export interface ToolBarProps {
  selectedDirection: BlockDirection;
  setSelectedDirection: (dir: BlockDirection) => void;
  selectedLocked: boolean;
  setSelectedLocked: (locked: boolean) => void;
  selectedIceCount: number;
  setSelectedIceCount: (count: number) => void;
  selectedMirror: boolean;
  setSelectedMirror: (mirror: boolean) => void;
  eraserMode: boolean;
  setEraserMode: (eraser: boolean) => void;
  zoom: number;
  handleZoomIn: () => void;
  handleZoomOut: () => void;
  handleZoomReset: () => void;
}

export interface StagingAreaProps {
  stagedLevels: StagedLevel[];
  setStagedLevels: React.Dispatch<React.SetStateAction<StagedLevel[]>>;
  handleImportMultipleFiles: () => void;
  handleAddStagedToCollection: () => void;
  onAddToCollection?: (level: DesignedLevel, collectionId?: string) => void;
  setRows: (rows: number) => void;
  setCols: (cols: number) => void;
  setBlocks: (blocks: Map<string, SquareBlock>) => void;
  setHoles: (holes: Set<string>) => void;
}

export interface SolvabilityBannerProps {
  solvability: { solvable: boolean; optimalMoves: number; message: string };
  deadlockInfo: DeadlockInfo;
  blocks: Map<string, SquareBlock>;
  holes: Set<string>;
  blockTypeCounts: {
    total: number;
    normal: number;
    gate: number;
    ice: number;
    mirror: number;
  };
}

export interface DifficultyPanelProps {
  blocks: Map<string, SquareBlock>;
  puzzleAnalysis: import('@/lib/puzzleAnalyzer').PuzzleAnalysis | null;
  difficultyBreakdown: import('@/lib/puzzleAnalyzer').DifficultyBreakdown | null;
  solvability: { solvable: boolean; optimalMoves: number; message: string };
  isAdjusting: boolean;
  lastAdjustmentResult: {
    success: boolean;
    scoreBefore: number;
    scoreAfter: number;
    action: string;
  } | null;
  canIncreaseDifficulty: boolean;
  canDecreaseDifficulty: boolean;
  increaseDifficulty: () => void;
  decreaseDifficulty: () => void;
}

export interface ConfigurationPanelProps {
  blocks: Map<string, SquareBlock>;
  holes: Set<string>;
  rows: number;
  cols: number;
  solvability: { solvable: boolean; optimalMoves: number; message: string };
  isGenerating: boolean;
  showBlocksAhead: boolean;
  setShowBlocksAhead: (show: boolean) => void;
  smartFillLevel: () => void;
  clearAll: () => void;
  handlePlay: () => void;
  handleExportJSON: () => void;
  handleImportMultipleFiles: () => void;
  handleSizeChange: (newRows: number, newCols: number) => void;
  // Collection props
  onAddToCollection?: (level: DesignedLevel, collectionId?: string) => void;
  editingLevel?: DesignedLevel | null;
  levelNumber: number;
  onLevelNumberChange?: (num: number) => void;
  maxLevelNumber: number;
  handleAddToCollection: () => void;
  collections?: CollectionMetadata[];
  targetCollectionId?: string;
  setTargetCollectionId: (id: string | undefined) => void;
}

export interface EmbeddedMetricsPanelProps {
  blocks: Map<string, SquareBlock>;
  holes: Set<string>;
  rows: number;
  cols: number;
  levelNumber: number;
  solvable: boolean;
}
