import { vi } from 'vitest';
import { BaseLevel, StorageProvider, SyncState, SyncStatus } from '@/lib/storage/types';

/**
 * Create a base level for testing
 */
export function createTestBaseLevel(
  id: string,
  levelNumber: number,
  extras?: Record<string, unknown>
): BaseLevel {
  return {
    id,
    levelNumber,
    ...extras,
  };
}

/**
 * Create a mock localStorage provider for testing
 */
export function createMockLocalStorageProvider<T extends BaseLevel>(
  initialLevels: T[] = []
): StorageProvider<T> & { _levels: T[] } {
  const mockProvider = {
    _levels: [...initialLevels],

    loadLevels: vi.fn(async () => {
      return [...mockProvider._levels];
    }),

    saveLevels: vi.fn(async (levels: T[]) => {
      mockProvider._levels = [...levels];
    }),

    saveLevel: vi.fn(async (level: T) => {
      const index = mockProvider._levels.findIndex(l => l.id === level.id);
      if (index >= 0) {
        mockProvider._levels[index] = level;
      } else {
        mockProvider._levels.push(level);
      }
    }),

    deleteLevel: vi.fn(async (id: string) => {
      mockProvider._levels = mockProvider._levels.filter(l => l.id !== id);
    }),

    isAvailable: vi.fn(() => true),
  };

  return mockProvider;
}

/**
 * Create a mock Supabase provider for testing
 */
export function createMockSupabaseProvider<T extends BaseLevel>(
  initialLevels: T[] = []
): StorageProvider<T> & {
  _levels: T[];
  _collectionId: string | null;
  _shouldFail: boolean;
  simulateFailure: (fail: boolean) => void;
} {
  const mockProvider = {
    _levels: [...initialLevels],
    _collectionId: 'test-collection-id',
    _shouldFail: false,

    loadLevels: vi.fn(async () => {
      if (mockProvider._shouldFail) {
        throw new Error('Supabase connection failed');
      }
      return [...mockProvider._levels];
    }),

    saveLevels: vi.fn(async (levels: T[]) => {
      if (mockProvider._shouldFail) {
        throw new Error('Supabase connection failed');
      }
      mockProvider._levels = [...levels];
    }),

    saveLevel: vi.fn(async (level: T) => {
      if (mockProvider._shouldFail) {
        throw new Error('Supabase connection failed');
      }
      const index = mockProvider._levels.findIndex(l => l.id === level.id);
      if (index >= 0) {
        mockProvider._levels[index] = level;
      } else {
        mockProvider._levels.push(level);
      }
    }),

    deleteLevel: vi.fn(async (id: string) => {
      if (mockProvider._shouldFail) {
        throw new Error('Supabase connection failed');
      }
      mockProvider._levels = mockProvider._levels.filter(l => l.id !== id);
    }),

    isAvailable: vi.fn(() => !mockProvider._shouldFail),

    getCollectionId: vi.fn(async () => mockProvider._collectionId),

    simulateFailure: (fail: boolean) => {
      mockProvider._shouldFail = fail;
    },
  };

  return mockProvider;
}

/**
 * Create a mock sync state
 */
export function createMockSyncState(
  status: SyncStatus = 'synced',
  options?: Partial<SyncState>
): SyncState {
  return {
    status,
    lastSynced: options?.lastSynced ?? new Date(),
    pendingChanges: options?.pendingChanges ?? 0,
    error: options?.error ?? null,
    isOnline: options?.isOnline ?? true,
  };
}

/**
 * Setup localStorage with test data
 */
export function setupLocalStorageWithData<T>(key: string, data: T): void {
  localStorage.setItem(key, JSON.stringify(data));
}

/**
 * Clear localStorage and reset mocks
 */
export function clearLocalStorage(): void {
  localStorage.clear();
}

/**
 * Create multiple test levels with sequential IDs
 */
export function createTestLevels<T extends BaseLevel>(
  count: number,
  factory: (id: string, levelNumber: number) => T
): T[] {
  return Array.from({ length: count }, (_, i) =>
    factory(`level-${i + 1}`, i + 1)
  );
}

/**
 * Wait for async operations to complete
 */
export async function flushPromises(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0));
}

/**
 * Mock the window.navigator.onLine property
 */
export function mockOnlineStatus(isOnline: boolean): void {
  Object.defineProperty(window.navigator, 'onLine', {
    value: isOnline,
    writable: true,
    configurable: true,
  });
}
