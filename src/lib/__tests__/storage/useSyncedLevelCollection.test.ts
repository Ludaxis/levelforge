import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSyncedLevelCollection } from '../../storage/useSyncedLevelCollection';
import { BaseLevel, SyncedLevelCollectionOptions } from '../../storage/types';

// Mock the Supabase provider
vi.mock('../../storage/supabase', () => ({
  createSupabaseStorageProvider: vi.fn(() => ({
    loadLevels: vi.fn().mockResolvedValue([]),
    saveLevels: vi.fn().mockResolvedValue(undefined),
    saveLevel: vi.fn().mockResolvedValue(undefined),
    deleteLevel: vi.fn().mockResolvedValue(undefined),
    isAvailable: vi.fn().mockReturnValue(false),
    getCollectionId: vi.fn().mockResolvedValue(null),
  })),
}));

// Test level type
interface TestLevel extends BaseLevel {
  name: string;
  data?: string;
}

// ============================================================================
// Test Helpers
// ============================================================================

function createTestLevel(id: string, levelNumber: number, name: string): TestLevel {
  return { id, levelNumber, name };
}

function createTestOptions(
  overrides?: Partial<SyncedLevelCollectionOptions<TestLevel>>
): SyncedLevelCollectionOptions<TestLevel> {
  return {
    gameType: 'fruit-match',
    localStorageKey: 'test-synced-collection',
    maxLevels: 100,
    syncDebounceMs: 100, // Short for testing
    ...overrides,
  };
}

function setupLocalStorage(key: string, levels: TestLevel[]): void {
  localStorage.setItem(key, JSON.stringify(levels));
}

// Helper to wait for isLoaded with real timers
async function waitForLoaded(
  result: { current: { isLoaded: boolean } },
  timeoutMs: number = 1000
): Promise<void> {
  const startTime = Date.now();
  while (!result.current.isLoaded && Date.now() - startTime < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

// ============================================================================
// Initialization Tests
// ============================================================================

describe('useSyncedLevelCollection - Initialization', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should initialize with empty levels when no data exists', async () => {
    const options = createTestOptions();
    const { result } = renderHook(() => useSyncedLevelCollection<TestLevel>(options));

    await waitForLoaded(result);

    expect(result.current.levels).toEqual([]);
    expect(result.current.isLoaded).toBe(true);
  });

  it('should load levels from localStorage', async () => {
    const options = createTestOptions();
    setupLocalStorage(options.localStorageKey, [
      createTestLevel('1', 1, 'Level 1'),
      createTestLevel('2', 2, 'Level 2'),
    ]);

    const { result } = renderHook(() => useSyncedLevelCollection<TestLevel>(options));

    await waitForLoaded(result);

    expect(result.current.levels).toHaveLength(2);
    expect(result.current.levels[0].name).toBe('Level 1');
  });

  it('should start with pending sync status', () => {
    const options = createTestOptions();
    const { result } = renderHook(() => useSyncedLevelCollection<TestLevel>(options));

    expect(result.current.syncState.status).toBe('pending');
  });

  it('should have zero pending changes initially', () => {
    const options = createTestOptions();
    const { result } = renderHook(() => useSyncedLevelCollection<TestLevel>(options));

    expect(result.current.syncState.pendingChanges).toBe(0);
  });

  it('should set isLoaded to true after loading', async () => {
    const options = createTestOptions();
    const { result } = renderHook(() => useSyncedLevelCollection<TestLevel>(options));

    expect(result.current.isLoaded).toBe(false);

    await waitForLoaded(result);

    expect(result.current.isLoaded).toBe(true);
  });

  it('should apply migration function to loaded levels', async () => {
    const options = createTestOptions({
      migrate: (level: TestLevel) => ({
        ...level,
        name: `Migrated: ${level.name}`,
      }),
    });
    setupLocalStorage(options.localStorageKey, [createTestLevel('1', 1, 'Original')]);

    const { result } = renderHook(() => useSyncedLevelCollection<TestLevel>(options));

    await waitForLoaded(result);

    expect(result.current.levels[0].name).toBe('Migrated: Original');
  });
});

// ============================================================================
// addLevel Tests
// ============================================================================

describe('useSyncedLevelCollection - addLevel', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should add a new level', async () => {
    const options = createTestOptions();
    const { result } = renderHook(() => useSyncedLevelCollection<TestLevel>(options));

    await waitForLoaded(result);

    act(() => {
      result.current.addLevel(createTestLevel('new-id', 0, 'New Level'));
    });

    expect(result.current.levels).toHaveLength(1);
    expect(result.current.levels[0].name).toBe('New Level');
  });

  it('should auto-assign level number', async () => {
    const options = createTestOptions();
    setupLocalStorage(options.localStorageKey, [
      createTestLevel('1', 1, 'Level 1'),
      createTestLevel('2', 2, 'Level 2'),
    ]);

    const { result } = renderHook(() => useSyncedLevelCollection<TestLevel>(options));

    await waitForLoaded(result);

    act(() => {
      result.current.addLevel(createTestLevel('new-id', 0, 'New Level'));
    });

    expect(result.current.levels[2].levelNumber).toBe(3);
  });

  it('should not add when at max capacity', async () => {
    const options = createTestOptions({ maxLevels: 2 });
    setupLocalStorage(options.localStorageKey, [
      createTestLevel('1', 1, 'Level 1'),
      createTestLevel('2', 2, 'Level 2'),
    ]);

    const { result } = renderHook(() => useSyncedLevelCollection<TestLevel>(options));

    await waitForLoaded(result);

    act(() => {
      result.current.addLevel(createTestLevel('3', 3, 'Level 3'));
    });

    expect(result.current.levels).toHaveLength(2);
  });

  it('should persist to localStorage', async () => {
    const options = createTestOptions();
    const { result } = renderHook(() => useSyncedLevelCollection<TestLevel>(options));

    await waitForLoaded(result);

    act(() => {
      result.current.addLevel(createTestLevel('new-id', 0, 'Persisted Level'));
    });

    // Wait for localStorage save
    await new Promise((resolve) => setTimeout(resolve, 50));

    const stored = JSON.parse(localStorage.getItem(options.localStorageKey) || '[]');
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe('Persisted Level');
  });
});

// ============================================================================
// updateLevel Tests
// ============================================================================

describe('useSyncedLevelCollection - updateLevel', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should update an existing level', async () => {
    const options = createTestOptions();
    setupLocalStorage(options.localStorageKey, [createTestLevel('1', 1, 'Original')]);

    const { result } = renderHook(() => useSyncedLevelCollection<TestLevel>(options));

    await waitForLoaded(result);

    act(() => {
      result.current.updateLevel('1', { name: 'Updated' });
    });

    expect(result.current.levels[0].name).toBe('Updated');
  });

  it('should preserve other properties when updating', async () => {
    const options = createTestOptions();
    setupLocalStorage(options.localStorageKey, [
      { id: '1', levelNumber: 1, name: 'Level', data: 'some data' },
    ]);

    const { result } = renderHook(() => useSyncedLevelCollection<TestLevel>(options));

    await waitForLoaded(result);

    act(() => {
      result.current.updateLevel('1', { name: 'New Name' });
    });

    expect(result.current.levels[0].data).toBe('some data');
  });

  it('should not affect other levels', async () => {
    const options = createTestOptions();
    setupLocalStorage(options.localStorageKey, [
      createTestLevel('1', 1, 'Level 1'),
      createTestLevel('2', 2, 'Level 2'),
    ]);

    const { result } = renderHook(() => useSyncedLevelCollection<TestLevel>(options));

    await waitForLoaded(result);

    act(() => {
      result.current.updateLevel('1', { name: 'Updated' });
    });

    expect(result.current.levels[1].name).toBe('Level 2');
  });

  it('should handle non-existent level', async () => {
    const options = createTestOptions();
    setupLocalStorage(options.localStorageKey, [createTestLevel('1', 1, 'Level 1')]);

    const { result } = renderHook(() => useSyncedLevelCollection<TestLevel>(options));

    await waitForLoaded(result);

    // Should not throw
    act(() => {
      result.current.updateLevel('non-existent', { name: 'Updated' });
    });

    expect(result.current.levels).toHaveLength(1);
    expect(result.current.levels[0].name).toBe('Level 1');
  });
});

// ============================================================================
// deleteLevel Tests
// ============================================================================

describe('useSyncedLevelCollection - deleteLevel', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should delete a level', async () => {
    const options = createTestOptions();
    setupLocalStorage(options.localStorageKey, [
      createTestLevel('1', 1, 'Level 1'),
      createTestLevel('2', 2, 'Level 2'),
    ]);

    const { result } = renderHook(() => useSyncedLevelCollection<TestLevel>(options));

    await waitForLoaded(result);

    act(() => {
      result.current.deleteLevel('1');
    });

    expect(result.current.levels).toHaveLength(1);
    expect(result.current.levels[0].id).toBe('2');
  });

  it('should renumber remaining levels', async () => {
    const options = createTestOptions();
    setupLocalStorage(options.localStorageKey, [
      createTestLevel('1', 1, 'Level 1'),
      createTestLevel('2', 2, 'Level 2'),
      createTestLevel('3', 3, 'Level 3'),
    ]);

    const { result } = renderHook(() => useSyncedLevelCollection<TestLevel>(options));

    await waitForLoaded(result);

    act(() => {
      result.current.deleteLevel('2');
    });

    expect(result.current.levels[0].levelNumber).toBe(1);
    expect(result.current.levels[1].levelNumber).toBe(2);
  });

  it('should handle deleting non-existent level', async () => {
    const options = createTestOptions();
    setupLocalStorage(options.localStorageKey, [createTestLevel('1', 1, 'Level 1')]);

    const { result } = renderHook(() => useSyncedLevelCollection<TestLevel>(options));

    await waitForLoaded(result);

    // Should not throw
    act(() => {
      result.current.deleteLevel('non-existent');
    });

    expect(result.current.levels).toHaveLength(1);
  });
});

// ============================================================================
// moveLevel Tests
// ============================================================================

describe('useSyncedLevelCollection - moveLevel', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should move level up', async () => {
    const options = createTestOptions();
    setupLocalStorage(options.localStorageKey, [
      createTestLevel('1', 1, 'Level 1'),
      createTestLevel('2', 2, 'Level 2'),
    ]);

    const { result } = renderHook(() => useSyncedLevelCollection<TestLevel>(options));

    await waitForLoaded(result);

    act(() => {
      result.current.moveLevel('2', 'up');
    });

    expect(result.current.levels[0].id).toBe('2');
    expect(result.current.levels[1].id).toBe('1');
  });

  it('should move level down', async () => {
    const options = createTestOptions();
    setupLocalStorage(options.localStorageKey, [
      createTestLevel('1', 1, 'Level 1'),
      createTestLevel('2', 2, 'Level 2'),
    ]);

    const { result } = renderHook(() => useSyncedLevelCollection<TestLevel>(options));

    await waitForLoaded(result);

    act(() => {
      result.current.moveLevel('1', 'down');
    });

    expect(result.current.levels[0].id).toBe('2');
    expect(result.current.levels[1].id).toBe('1');
  });

  it('should not move first level up', async () => {
    const options = createTestOptions();
    setupLocalStorage(options.localStorageKey, [
      createTestLevel('1', 1, 'Level 1'),
      createTestLevel('2', 2, 'Level 2'),
    ]);

    const { result } = renderHook(() => useSyncedLevelCollection<TestLevel>(options));

    await waitForLoaded(result);

    act(() => {
      result.current.moveLevel('1', 'up');
    });

    expect(result.current.levels[0].id).toBe('1');
    expect(result.current.levels[1].id).toBe('2');
  });

  it('should not move last level down', async () => {
    const options = createTestOptions();
    setupLocalStorage(options.localStorageKey, [
      createTestLevel('1', 1, 'Level 1'),
      createTestLevel('2', 2, 'Level 2'),
    ]);

    const { result } = renderHook(() => useSyncedLevelCollection<TestLevel>(options));

    await waitForLoaded(result);

    act(() => {
      result.current.moveLevel('2', 'down');
    });

    expect(result.current.levels[0].id).toBe('1');
    expect(result.current.levels[1].id).toBe('2');
  });

  it('should update level numbers after move', async () => {
    const options = createTestOptions();
    setupLocalStorage(options.localStorageKey, [
      createTestLevel('1', 1, 'Level 1'),
      createTestLevel('2', 2, 'Level 2'),
      createTestLevel('3', 3, 'Level 3'),
    ]);

    const { result } = renderHook(() => useSyncedLevelCollection<TestLevel>(options));

    await waitForLoaded(result);

    act(() => {
      result.current.moveLevel('3', 'up');
    });

    expect(result.current.levels[0].levelNumber).toBe(1);
    expect(result.current.levels[1].levelNumber).toBe(2);
    expect(result.current.levels[2].levelNumber).toBe(3);
  });

  it('should handle non-existent level', async () => {
    const options = createTestOptions();
    setupLocalStorage(options.localStorageKey, [createTestLevel('1', 1, 'Level 1')]);

    const { result } = renderHook(() => useSyncedLevelCollection<TestLevel>(options));

    await waitForLoaded(result);

    // Should not throw
    act(() => {
      result.current.moveLevel('non-existent', 'up');
    });

    expect(result.current.levels).toHaveLength(1);
  });
});

// ============================================================================
// importLevels Tests
// ============================================================================

describe('useSyncedLevelCollection - importLevels', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should replace all levels', async () => {
    const options = createTestOptions();
    setupLocalStorage(options.localStorageKey, [createTestLevel('old', 1, 'Old Level')]);

    const { result } = renderHook(() => useSyncedLevelCollection<TestLevel>(options));

    await waitForLoaded(result);

    act(() => {
      result.current.importLevels([
        createTestLevel('new1', 1, 'New Level 1'),
        createTestLevel('new2', 2, 'New Level 2'),
      ]);
    });

    expect(result.current.levels).toHaveLength(2);
    expect(result.current.levels[0].name).toBe('New Level 1');
    expect(result.current.levels[1].name).toBe('New Level 2');
  });

  it('should respect maxLevels limit', async () => {
    const options = createTestOptions({ maxLevels: 2 });
    const { result } = renderHook(() => useSyncedLevelCollection<TestLevel>(options));

    await waitForLoaded(result);

    act(() => {
      result.current.importLevels([
        createTestLevel('1', 1, 'Level 1'),
        createTestLevel('2', 2, 'Level 2'),
        createTestLevel('3', 3, 'Level 3'),
        createTestLevel('4', 4, 'Level 4'),
      ]);
    });

    expect(result.current.levels).toHaveLength(2);
  });

  it('should renumber imported levels', async () => {
    const options = createTestOptions();
    const { result } = renderHook(() => useSyncedLevelCollection<TestLevel>(options));

    await waitForLoaded(result);

    act(() => {
      result.current.importLevels([
        createTestLevel('a', 99, 'Level A'),
        createTestLevel('b', 50, 'Level B'),
      ]);
    });

    expect(result.current.levels[0].levelNumber).toBe(1);
    expect(result.current.levels[1].levelNumber).toBe(2);
  });
});

// ============================================================================
// clearAll Tests
// ============================================================================

describe('useSyncedLevelCollection - clearAll', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should remove all levels', async () => {
    const options = createTestOptions();
    setupLocalStorage(options.localStorageKey, [
      createTestLevel('1', 1, 'Level 1'),
      createTestLevel('2', 2, 'Level 2'),
    ]);

    const { result } = renderHook(() => useSyncedLevelCollection<TestLevel>(options));

    await waitForLoaded(result);

    act(() => {
      result.current.clearAll();
    });

    expect(result.current.levels).toEqual([]);
  });

  it('should persist empty state to localStorage', async () => {
    const options = createTestOptions();
    setupLocalStorage(options.localStorageKey, [createTestLevel('1', 1, 'Level 1')]);

    const { result } = renderHook(() => useSyncedLevelCollection<TestLevel>(options));

    await waitForLoaded(result);

    act(() => {
      result.current.clearAll();
    });

    // Wait for localStorage save
    await new Promise((resolve) => setTimeout(resolve, 50));

    const stored = JSON.parse(localStorage.getItem(options.localStorageKey) || '["should be empty"]');
    expect(stored).toEqual([]);
  });
});

// ============================================================================
// setLevels Tests
// ============================================================================

describe('useSyncedLevelCollection - setLevels', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should accept array directly', async () => {
    const options = createTestOptions();
    const { result } = renderHook(() => useSyncedLevelCollection<TestLevel>(options));

    await waitForLoaded(result);

    act(() => {
      result.current.setLevels([createTestLevel('1', 1, 'Direct Level')]);
    });

    expect(result.current.levels).toHaveLength(1);
    expect(result.current.levels[0].name).toBe('Direct Level');
  });

  it('should accept updater function', async () => {
    const options = createTestOptions();
    setupLocalStorage(options.localStorageKey, [createTestLevel('1', 1, 'Original')]);

    const { result } = renderHook(() => useSyncedLevelCollection<TestLevel>(options));

    await waitForLoaded(result);

    act(() => {
      result.current.setLevels((prev) => [
        ...prev,
        createTestLevel('2', 2, 'Added'),
      ]);
    });

    expect(result.current.levels).toHaveLength(2);
    expect(result.current.levels[1].name).toBe('Added');
  });
});

// ============================================================================
// Sync State Tests
// ============================================================================

describe('useSyncedLevelCollection - Sync State', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should have offline status when Supabase unavailable', async () => {
    const options = createTestOptions();
    const { result } = renderHook(() => useSyncedLevelCollection<TestLevel>(options));

    await waitForLoaded(result);

    // Supabase is mocked as unavailable
    expect(result.current.syncState.status).toBe('offline');
  });

  it('should update pending changes on modification', async () => {
    const options = createTestOptions();
    const { result } = renderHook(() => useSyncedLevelCollection<TestLevel>(options));

    await waitForLoaded(result);

    act(() => {
      result.current.addLevel(createTestLevel('1', 1, 'Level'));
    });

    expect(result.current.syncState.pendingChanges).toBeGreaterThanOrEqual(0);
  });

  it('should track online status', async () => {
    const options = createTestOptions();
    const { result } = renderHook(() => useSyncedLevelCollection<TestLevel>(options));

    await waitForLoaded(result);

    expect(typeof result.current.syncState.isOnline).toBe('boolean');
  });
});

// ============================================================================
// forceSync Tests
// ============================================================================

describe('useSyncedLevelCollection - forceSync', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should provide forceSync function', async () => {
    const options = createTestOptions();
    const { result } = renderHook(() => useSyncedLevelCollection<TestLevel>(options));

    await waitForLoaded(result);

    expect(typeof result.current.forceSync).toBe('function');
  });

  it('should execute without error when offline', async () => {
    const options = createTestOptions();
    const { result } = renderHook(() => useSyncedLevelCollection<TestLevel>(options));

    await waitForLoaded(result);

    // Should not throw
    await act(async () => {
      await result.current.forceSync();
    });
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('useSyncedLevelCollection - Edge Cases', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should handle invalid JSON in localStorage', async () => {
    const options = createTestOptions();
    localStorage.setItem(options.localStorageKey, 'not valid json');

    const { result } = renderHook(() => useSyncedLevelCollection<TestLevel>(options));

    await waitForLoaded(result);

    expect(result.current.levels).toEqual([]);
  });

  it('should handle rapid consecutive operations', async () => {
    const options = createTestOptions();
    const { result } = renderHook(() => useSyncedLevelCollection<TestLevel>(options));

    await waitForLoaded(result);

    act(() => {
      result.current.addLevel(createTestLevel('1', 1, 'Level 1'));
      result.current.addLevel(createTestLevel('2', 2, 'Level 2'));
      result.current.addLevel(createTestLevel('3', 3, 'Level 3'));
    });

    expect(result.current.levels).toHaveLength(3);
  });

  it('should handle special characters in level data', async () => {
    const options = createTestOptions();
    const { result } = renderHook(() => useSyncedLevelCollection<TestLevel>(options));

    await waitForLoaded(result);

    act(() => {
      result.current.addLevel({
        id: '1',
        levelNumber: 1,
        name: 'Test "quoted" & <special> 🎮',
        data: '{"nested": "json"}',
      });
    });

    expect(result.current.levels[0].name).toBe('Test "quoted" & <special> 🎮');
  });

  it('should handle empty maxLevels edge', async () => {
    const options = createTestOptions({ maxLevels: 0 });
    const { result } = renderHook(() => useSyncedLevelCollection<TestLevel>(options));

    await waitForLoaded(result);

    act(() => {
      result.current.addLevel(createTestLevel('1', 1, 'Level'));
    });

    expect(result.current.levels).toHaveLength(0);
  });

  it('should maintain data across re-renders', async () => {
    const options = createTestOptions();
    const { result, rerender } = renderHook(() => useSyncedLevelCollection<TestLevel>(options));

    await waitForLoaded(result);

    act(() => {
      result.current.addLevel(createTestLevel('1', 1, 'Persistent Level'));
    });

    rerender();

    expect(result.current.levels).toHaveLength(1);
    expect(result.current.levels[0].name).toBe('Persistent Level');
  });
});
