/**
 * Storage abstraction types for level collections
 */

/**
 * Sync status indicator
 */
export type SyncStatus = 'synced' | 'pending' | 'conflict' | 'offline' | 'error';

/**
 * Current sync state for the collection
 */
export interface SyncState {
  status: SyncStatus;
  lastSynced: Date | null;
  pendingChanges: number;
  error: string | null;
  isOnline: boolean;
}

/**
 * Base interface for any level type
 * All level types must have at least these properties
 */
export interface BaseLevel {
  id: string;
  levelNumber: number;
}

/**
 * Storage provider interface
 * Both localStorage and Supabase providers implement this
 */
export interface StorageProvider<T extends BaseLevel> {
  /**
   * Load all levels from storage
   */
  loadLevels(): Promise<T[]>;

  /**
   * Save all levels to storage (full replacement)
   */
  saveLevels(levels: T[]): Promise<void>;

  /**
   * Save a single level (upsert)
   */
  saveLevel(level: T): Promise<void>;

  /**
   * Delete a level by ID
   */
  deleteLevel(id: string): Promise<void>;

  /**
   * Check if the provider is available
   */
  isAvailable(): boolean;

  /**
   * Get the current collection ID (for sharing)
   * Only available on Supabase provider
   */
  getCollectionId?(): Promise<string | null>;
}

/**
 * Options for the synced level collection hook
 */
export interface SyncedLevelCollectionOptions<T extends BaseLevel> {
  /**
   * Game type identifier for Supabase storage
   */
  gameType: 'fruit-match' | 'hexa-block' | 'square-block';

  /**
   * localStorage key for this collection
   */
  localStorageKey: string;

  /**
   * Maximum number of levels allowed
   */
  maxLevels: number;

  /**
   * Optional migration function to run on loaded levels
   */
  migrate?: (level: T) => T;

  /**
   * Debounce delay for sync operations (ms)
   * @default 2000
   */
  syncDebounceMs?: number;
}

/**
 * Return type for the synced level collection hook
 */
export interface SyncedLevelCollection<T extends BaseLevel> {
  /**
   * Current levels array
   */
  levels: T[];

  /**
   * Replace all levels (accepts array or updater function)
   */
  setLevels: (levels: T[] | ((prev: T[]) => T[])) => void;

  /**
   * Whether initial load is complete
   */
  isLoaded: boolean;

  /**
   * Current sync state
   */
  syncState: SyncState;

  /**
   * Add a new level to the collection
   */
  addLevel: (level: T) => void;

  /**
   * Update an existing level by ID
   */
  updateLevel: (id: string, updates: Partial<T>) => void;

  /**
   * Delete a level by ID
   */
  deleteLevel: (id: string) => void;

  /**
   * Move a level up or down in the list
   */
  moveLevel: (id: string, direction: 'up' | 'down') => void;

  /**
   * Import levels (appends to existing or replaces based on implementation)
   */
  importLevels: (levels: T[]) => void;

  /**
   * Clear all levels
   */
  clearAll: () => void;

  /**
   * Force immediate sync to Supabase
   */
  forceSync: () => Promise<void>;
}
