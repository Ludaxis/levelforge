import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useMultipleCollections } from '../../storage/useMultipleCollections';
import { BaseLevel, CollectionMetadata, CollectionIndex, GameType } from '../../storage/types';

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

function createTestCollectionMetadata(
  id: string,
  name: string,
  gameType: GameType = 'fruit-match',
  levelCount: number = 0
): CollectionMetadata {
  return {
    id,
    name,
    gameType,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    levelCount,
  };
}

function setupCollectionIndex(gameType: GameType, index: CollectionIndex): void {
  localStorage.setItem(`${gameType}-collections-index`, JSON.stringify(index));
}

function setupCollectionLevels(gameType: GameType, collectionId: string, levels: TestLevel[]): void {
  localStorage.setItem(`${gameType}-collection-${collectionId}`, JSON.stringify(levels));
}

// ============================================================================
// Initialization Tests
// ============================================================================

describe('useMultipleCollections - Initialization', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should initialize with empty collections when no data exists', async () => {
    const { result } = renderHook(() => useMultipleCollections<TestLevel>('fruit-match'));

    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true);
    });

    expect(result.current.collections).toEqual([]);
    expect(result.current.activeCollectionId).toBeNull();
  });

  it('should load existing collection index from localStorage', async () => {
    const index: CollectionIndex = {
      collections: [createTestCollectionMetadata('col-1', 'Collection 1')],
      activeCollectionId: 'col-1',
    };
    setupCollectionIndex('fruit-match', index);

    const { result } = renderHook(() => useMultipleCollections<TestLevel>('fruit-match'));

    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true);
    });

    expect(result.current.collections).toHaveLength(1);
    expect(result.current.collections[0].name).toBe('Collection 1');
    expect(result.current.activeCollectionId).toBe('col-1');
  });

  it('should migrate from legacy single collection', async () => {
    const legacyLevels: TestLevel[] = [
      createTestLevel('1', 1, 'Legacy Level 1'),
      createTestLevel('2', 2, 'Legacy Level 2'),
    ];
    localStorage.setItem('fruit-match-level-collection', JSON.stringify(legacyLevels));

    const { result } = renderHook(() => useMultipleCollections<TestLevel>('fruit-match'));

    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true);
    });

    expect(result.current.collections).toHaveLength(1);
    expect(result.current.collections[0].id).toBe('default');
    expect(result.current.collections[0].name).toBe('Default Collection');
    expect(result.current.collections[0].levelCount).toBe(2);
    expect(result.current.activeCollectionId).toBe('default');

    // Verify levels were moved to new key
    const migratedLevels = JSON.parse(localStorage.getItem('fruit-match-collection-default') || '[]');
    expect(migratedLevels).toHaveLength(2);
  });

  it('should handle invalid JSON in storage', async () => {
    localStorage.setItem('fruit-match-collections-index', 'not valid json');

    const { result } = renderHook(() => useMultipleCollections<TestLevel>('fruit-match'));

    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true);
    });

    expect(result.current.collections).toEqual([]);
  });

  it('should handle invalid legacy data', async () => {
    localStorage.setItem('fruit-match-level-collection', 'not valid json');

    const { result } = renderHook(() => useMultipleCollections<TestLevel>('fruit-match'));

    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true);
    });

    expect(result.current.collections).toEqual([]);
  });

  it('should use different storage keys for different game types', async () => {
    const fruitIndex: CollectionIndex = {
      collections: [createTestCollectionMetadata('fruit-col', 'Fruit Collection', 'fruit-match')],
      activeCollectionId: 'fruit-col',
    };
    const squareIndex: CollectionIndex = {
      collections: [createTestCollectionMetadata('square-col', 'Square Collection', 'square-block')],
      activeCollectionId: 'square-col',
    };
    setupCollectionIndex('fruit-match', fruitIndex);
    setupCollectionIndex('square-block', squareIndex);

    const { result: fruitResult } = renderHook(() => useMultipleCollections<TestLevel>('fruit-match'));
    const { result: squareResult } = renderHook(() => useMultipleCollections<TestLevel>('square-block'));

    await waitFor(() => {
      expect(fruitResult.current.isLoaded).toBe(true);
      expect(squareResult.current.isLoaded).toBe(true);
    });

    expect(fruitResult.current.collections[0].name).toBe('Fruit Collection');
    expect(squareResult.current.collections[0].name).toBe('Square Collection');
  });
});

// ============================================================================
// createCollection Tests
// ============================================================================

describe('useMultipleCollections - createCollection', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should create a new collection', async () => {
    const { result } = renderHook(() => useMultipleCollections<TestLevel>('fruit-match'));

    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true);
    });

    let collectionId: string = '';
    act(() => {
      collectionId = result.current.createCollection('New Collection');
    });

    expect(result.current.collections).toHaveLength(1);
    expect(result.current.collections[0].name).toBe('New Collection');
    expect(collectionId).toContain('collection-');
  });

  it('should create collection with description', async () => {
    const { result } = renderHook(() => useMultipleCollections<TestLevel>('fruit-match'));

    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true);
    });

    act(() => {
      result.current.createCollection('My Collection', 'A test collection');
    });

    expect(result.current.collections[0].description).toBe('A test collection');
  });

  it('should set first collection as active when no active collection exists', async () => {
    const { result } = renderHook(() => useMultipleCollections<TestLevel>('fruit-match'));

    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true);
    });

    let collectionId: string = '';
    act(() => {
      collectionId = result.current.createCollection('First Collection');
    });

    expect(result.current.activeCollectionId).toBe(collectionId);
  });

  it('should not change active collection when adding subsequent collections', async () => {
    const { result } = renderHook(() => useMultipleCollections<TestLevel>('fruit-match'));

    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true);
    });

    let firstId: string = '';
    act(() => {
      firstId = result.current.createCollection('First Collection');
    });

    act(() => {
      result.current.createCollection('Second Collection');
    });

    expect(result.current.activeCollectionId).toBe(firstId);
    expect(result.current.collections).toHaveLength(2);
  });

  it('should initialize empty levels array for new collection', async () => {
    const { result } = renderHook(() => useMultipleCollections<TestLevel>('fruit-match'));

    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true);
    });

    let collectionId: string = '';
    act(() => {
      collectionId = result.current.createCollection('New Collection');
    });

    const levels = result.current.getLevelsForCollection(collectionId);
    expect(levels).toEqual([]);
  });

  it('should persist new collection to localStorage', async () => {
    const { result } = renderHook(() => useMultipleCollections<TestLevel>('fruit-match'));

    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true);
    });

    act(() => {
      result.current.createCollection('Persisted Collection');
    });

    const stored = JSON.parse(localStorage.getItem('fruit-match-collections-index') || '{}');
    expect(stored.collections).toHaveLength(1);
    expect(stored.collections[0].name).toBe('Persisted Collection');
  });
});

// ============================================================================
// renameCollection Tests
// ============================================================================

describe('useMultipleCollections - renameCollection', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should rename an existing collection', async () => {
    const index: CollectionIndex = {
      collections: [createTestCollectionMetadata('col-1', 'Old Name')],
      activeCollectionId: 'col-1',
    };
    setupCollectionIndex('fruit-match', index);

    const { result } = renderHook(() => useMultipleCollections<TestLevel>('fruit-match'));

    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true);
    });

    act(() => {
      result.current.renameCollection('col-1', 'New Name');
    });

    expect(result.current.collections[0].name).toBe('New Name');
  });

  it('should update description when renaming', async () => {
    const index: CollectionIndex = {
      collections: [createTestCollectionMetadata('col-1', 'Name')],
      activeCollectionId: 'col-1',
    };
    setupCollectionIndex('fruit-match', index);

    const { result } = renderHook(() => useMultipleCollections<TestLevel>('fruit-match'));

    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true);
    });

    act(() => {
      result.current.renameCollection('col-1', 'Name', 'New Description');
    });

    expect(result.current.collections[0].description).toBe('New Description');
  });

  it('should preserve existing description if not provided', async () => {
    const col = createTestCollectionMetadata('col-1', 'Name');
    col.description = 'Existing Description';
    const index: CollectionIndex = {
      collections: [col],
      activeCollectionId: 'col-1',
    };
    setupCollectionIndex('fruit-match', index);

    const { result } = renderHook(() => useMultipleCollections<TestLevel>('fruit-match'));

    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true);
    });

    act(() => {
      result.current.renameCollection('col-1', 'New Name');
    });

    expect(result.current.collections[0].description).toBe('Existing Description');
  });

  it('should update updatedAt timestamp when renaming', async () => {
    const col = createTestCollectionMetadata('col-1', 'Old Name');
    const originalUpdatedAt = col.updatedAt;
    const index: CollectionIndex = {
      collections: [col],
      activeCollectionId: 'col-1',
    };
    setupCollectionIndex('fruit-match', index);

    const { result } = renderHook(() => useMultipleCollections<TestLevel>('fruit-match'));

    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true);
    });

    // Wait a bit to ensure timestamp difference
    await new Promise((r) => setTimeout(r, 10));

    act(() => {
      result.current.renameCollection('col-1', 'New Name');
    });

    expect(result.current.collections[0].updatedAt).toBeGreaterThanOrEqual(originalUpdatedAt);
  });
});

// ============================================================================
// deleteCollection Tests
// ============================================================================

describe('useMultipleCollections - deleteCollection', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should delete a collection', async () => {
    const index: CollectionIndex = {
      collections: [
        createTestCollectionMetadata('col-1', 'Collection 1'),
        createTestCollectionMetadata('col-2', 'Collection 2'),
      ],
      activeCollectionId: 'col-1',
    };
    setupCollectionIndex('fruit-match', index);

    const { result } = renderHook(() => useMultipleCollections<TestLevel>('fruit-match'));

    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true);
    });

    act(() => {
      result.current.deleteCollection('col-2');
    });

    expect(result.current.collections).toHaveLength(1);
    expect(result.current.collections[0].id).toBe('col-1');
  });

  it('should remove collection data from localStorage', async () => {
    const index: CollectionIndex = {
      collections: [createTestCollectionMetadata('col-1', 'Collection 1')],
      activeCollectionId: 'col-1',
    };
    setupCollectionIndex('fruit-match', index);
    setupCollectionLevels('fruit-match', 'col-1', [createTestLevel('1', 1, 'Level 1')]);

    const { result } = renderHook(() => useMultipleCollections<TestLevel>('fruit-match'));

    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true);
    });

    act(() => {
      result.current.deleteCollection('col-1');
    });

    expect(localStorage.getItem('fruit-match-collection-col-1')).toBeNull();
  });

  it('should switch active collection when deleting active', async () => {
    const index: CollectionIndex = {
      collections: [
        createTestCollectionMetadata('col-1', 'Collection 1'),
        createTestCollectionMetadata('col-2', 'Collection 2'),
      ],
      activeCollectionId: 'col-1',
    };
    setupCollectionIndex('fruit-match', index);

    const { result } = renderHook(() => useMultipleCollections<TestLevel>('fruit-match'));

    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true);
    });

    act(() => {
      result.current.deleteCollection('col-1');
    });

    expect(result.current.activeCollectionId).toBe('col-2');
  });

  it('should set active to null when deleting last collection', async () => {
    const index: CollectionIndex = {
      collections: [createTestCollectionMetadata('col-1', 'Collection 1')],
      activeCollectionId: 'col-1',
    };
    setupCollectionIndex('fruit-match', index);

    const { result } = renderHook(() => useMultipleCollections<TestLevel>('fruit-match'));

    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true);
    });

    act(() => {
      result.current.deleteCollection('col-1');
    });

    expect(result.current.activeCollectionId).toBeNull();
    expect(result.current.collections).toHaveLength(0);
  });

  it('should not change active when deleting non-active collection', async () => {
    const index: CollectionIndex = {
      collections: [
        createTestCollectionMetadata('col-1', 'Collection 1'),
        createTestCollectionMetadata('col-2', 'Collection 2'),
      ],
      activeCollectionId: 'col-1',
    };
    setupCollectionIndex('fruit-match', index);

    const { result } = renderHook(() => useMultipleCollections<TestLevel>('fruit-match'));

    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true);
    });

    act(() => {
      result.current.deleteCollection('col-2');
    });

    expect(result.current.activeCollectionId).toBe('col-1');
  });
});

// ============================================================================
// setActiveCollection Tests
// ============================================================================

describe('useMultipleCollections - setActiveCollection', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should set active collection', async () => {
    const index: CollectionIndex = {
      collections: [
        createTestCollectionMetadata('col-1', 'Collection 1'),
        createTestCollectionMetadata('col-2', 'Collection 2'),
      ],
      activeCollectionId: 'col-1',
    };
    setupCollectionIndex('fruit-match', index);

    const { result } = renderHook(() => useMultipleCollections<TestLevel>('fruit-match'));

    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true);
    });

    act(() => {
      result.current.setActiveCollection('col-2');
    });

    expect(result.current.activeCollectionId).toBe('col-2');
  });

  it('should update activeCollection helper', async () => {
    const index: CollectionIndex = {
      collections: [
        createTestCollectionMetadata('col-1', 'Collection 1'),
        createTestCollectionMetadata('col-2', 'Collection 2'),
      ],
      activeCollectionId: 'col-1',
    };
    setupCollectionIndex('fruit-match', index);

    const { result } = renderHook(() => useMultipleCollections<TestLevel>('fruit-match'));

    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true);
    });

    expect(result.current.activeCollection?.name).toBe('Collection 1');

    act(() => {
      result.current.setActiveCollection('col-2');
    });

    expect(result.current.activeCollection?.name).toBe('Collection 2');
  });
});

// ============================================================================
// getLevelsForCollection Tests
// ============================================================================

describe('useMultipleCollections - getLevelsForCollection', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should return levels for a collection', async () => {
    const index: CollectionIndex = {
      collections: [createTestCollectionMetadata('col-1', 'Collection 1', 'fruit-match', 2)],
      activeCollectionId: 'col-1',
    };
    setupCollectionIndex('fruit-match', index);
    setupCollectionLevels('fruit-match', 'col-1', [
      createTestLevel('1', 1, 'Level 1'),
      createTestLevel('2', 2, 'Level 2'),
    ]);

    const { result } = renderHook(() => useMultipleCollections<TestLevel>('fruit-match'));

    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true);
    });

    const levels = result.current.getLevelsForCollection('col-1');
    expect(levels).toHaveLength(2);
    expect(levels[0].name).toBe('Level 1');
    expect(levels[1].name).toBe('Level 2');
  });

  it('should return empty array for non-existent collection', async () => {
    const { result } = renderHook(() => useMultipleCollections<TestLevel>('fruit-match'));

    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true);
    });

    const levels = result.current.getLevelsForCollection('non-existent');
    expect(levels).toEqual([]);
  });

  it('should return empty array for invalid JSON data', async () => {
    const index: CollectionIndex = {
      collections: [createTestCollectionMetadata('col-1', 'Collection 1')],
      activeCollectionId: 'col-1',
    };
    setupCollectionIndex('fruit-match', index);
    localStorage.setItem('fruit-match-collection-col-1', 'not valid json');

    const { result } = renderHook(() => useMultipleCollections<TestLevel>('fruit-match'));

    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true);
    });

    const levels = result.current.getLevelsForCollection('col-1');
    expect(levels).toEqual([]);
  });
});

// ============================================================================
// saveLevelsForCollection Tests
// ============================================================================

describe('useMultipleCollections - saveLevelsForCollection', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should save levels to a collection', async () => {
    const index: CollectionIndex = {
      collections: [createTestCollectionMetadata('col-1', 'Collection 1')],
      activeCollectionId: 'col-1',
    };
    setupCollectionIndex('fruit-match', index);

    const { result } = renderHook(() => useMultipleCollections<TestLevel>('fruit-match'));

    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true);
    });

    act(() => {
      result.current.saveLevelsForCollection('col-1', [
        createTestLevel('1', 1, 'New Level 1'),
        createTestLevel('2', 2, 'New Level 2'),
      ]);
    });

    const stored = JSON.parse(localStorage.getItem('fruit-match-collection-col-1') || '[]');
    expect(stored).toHaveLength(2);
    expect(stored[0].name).toBe('New Level 1');
  });

  it('should update level count in metadata', async () => {
    const index: CollectionIndex = {
      collections: [createTestCollectionMetadata('col-1', 'Collection 1', 'fruit-match', 0)],
      activeCollectionId: 'col-1',
    };
    setupCollectionIndex('fruit-match', index);

    const { result } = renderHook(() => useMultipleCollections<TestLevel>('fruit-match'));

    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true);
    });

    act(() => {
      result.current.saveLevelsForCollection('col-1', [
        createTestLevel('1', 1, 'Level 1'),
        createTestLevel('2', 2, 'Level 2'),
        createTestLevel('3', 3, 'Level 3'),
      ]);
    });

    expect(result.current.collections[0].levelCount).toBe(3);
  });

  it('should respect maxLevels limit', async () => {
    const index: CollectionIndex = {
      collections: [createTestCollectionMetadata('col-1', 'Collection 1')],
      activeCollectionId: 'col-1',
    };
    setupCollectionIndex('fruit-match', index);

    const { result } = renderHook(() => useMultipleCollections<TestLevel>('fruit-match', 3));

    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true);
    });

    const manyLevels = Array.from({ length: 10 }, (_, i) =>
      createTestLevel(`${i}`, i + 1, `Level ${i + 1}`)
    );

    act(() => {
      result.current.saveLevelsForCollection('col-1', manyLevels);
    });

    const stored = JSON.parse(localStorage.getItem('fruit-match-collection-col-1') || '[]');
    expect(stored).toHaveLength(3);
  });

  it('should update updatedAt timestamp', async () => {
    const col = createTestCollectionMetadata('col-1', 'Collection 1');
    const originalUpdatedAt = col.updatedAt;
    const index: CollectionIndex = {
      collections: [col],
      activeCollectionId: 'col-1',
    };
    setupCollectionIndex('fruit-match', index);

    const { result } = renderHook(() => useMultipleCollections<TestLevel>('fruit-match'));

    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true);
    });

    await new Promise((r) => setTimeout(r, 10));

    act(() => {
      result.current.saveLevelsForCollection('col-1', [createTestLevel('1', 1, 'Level 1')]);
    });

    expect(result.current.collections[0].updatedAt).toBeGreaterThanOrEqual(originalUpdatedAt);
  });
});

// ============================================================================
// addLevelToCollection Tests
// ============================================================================

describe('useMultipleCollections - addLevelToCollection', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should add a level to an empty collection', async () => {
    const index: CollectionIndex = {
      collections: [createTestCollectionMetadata('col-1', 'Collection 1')],
      activeCollectionId: 'col-1',
    };
    setupCollectionIndex('fruit-match', index);
    setupCollectionLevels('fruit-match', 'col-1', []);

    const { result } = renderHook(() => useMultipleCollections<TestLevel>('fruit-match'));

    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true);
    });

    let added: boolean = false;
    act(() => {
      added = result.current.addLevelToCollection('col-1', createTestLevel('1', 1, 'New Level'));
    });

    expect(added).toBe(true);
    const levels = result.current.getLevelsForCollection('col-1');
    expect(levels).toHaveLength(1);
    expect(levels[0].name).toBe('New Level');
  });

  it('should append level to existing levels', async () => {
    const index: CollectionIndex = {
      collections: [createTestCollectionMetadata('col-1', 'Collection 1', 'fruit-match', 1)],
      activeCollectionId: 'col-1',
    };
    setupCollectionIndex('fruit-match', index);
    setupCollectionLevels('fruit-match', 'col-1', [createTestLevel('1', 1, 'Existing Level')]);

    const { result } = renderHook(() => useMultipleCollections<TestLevel>('fruit-match'));

    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true);
    });

    act(() => {
      result.current.addLevelToCollection('col-1', createTestLevel('2', 2, 'New Level'));
    });

    const levels = result.current.getLevelsForCollection('col-1');
    expect(levels).toHaveLength(2);
    expect(levels[1].name).toBe('New Level');
  });

  it('should return false when collection is at max capacity', async () => {
    const index: CollectionIndex = {
      collections: [createTestCollectionMetadata('col-1', 'Collection 1', 'fruit-match', 2)],
      activeCollectionId: 'col-1',
    };
    setupCollectionIndex('fruit-match', index);
    setupCollectionLevels('fruit-match', 'col-1', [
      createTestLevel('1', 1, 'Level 1'),
      createTestLevel('2', 2, 'Level 2'),
    ]);

    const { result } = renderHook(() => useMultipleCollections<TestLevel>('fruit-match', 2));

    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true);
    });

    let added: boolean = true;
    act(() => {
      added = result.current.addLevelToCollection('col-1', createTestLevel('3', 3, 'Level 3'));
    });

    expect(added).toBe(false);
    const levels = result.current.getLevelsForCollection('col-1');
    expect(levels).toHaveLength(2);
  });
});

// ============================================================================
// activeCollection Helper Tests
// ============================================================================

describe('useMultipleCollections - activeCollection', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should return null when no active collection', async () => {
    const { result } = renderHook(() => useMultipleCollections<TestLevel>('fruit-match'));

    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true);
    });

    expect(result.current.activeCollection).toBeNull();
  });

  it('should return active collection metadata', async () => {
    const index: CollectionIndex = {
      collections: [
        createTestCollectionMetadata('col-1', 'Collection 1'),
        createTestCollectionMetadata('col-2', 'Collection 2'),
      ],
      activeCollectionId: 'col-2',
    };
    setupCollectionIndex('fruit-match', index);

    const { result } = renderHook(() => useMultipleCollections<TestLevel>('fruit-match'));

    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true);
    });

    expect(result.current.activeCollection?.id).toBe('col-2');
    expect(result.current.activeCollection?.name).toBe('Collection 2');
  });
});

// ============================================================================
// Persistence Tests
// ============================================================================

describe('useMultipleCollections - Persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should persist index changes to localStorage', async () => {
    const { result } = renderHook(() => useMultipleCollections<TestLevel>('fruit-match'));

    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true);
    });

    act(() => {
      result.current.createCollection('Test Collection');
    });

    const stored = JSON.parse(localStorage.getItem('fruit-match-collections-index') || '{}');
    expect(stored.collections).toHaveLength(1);
    expect(stored.collections[0].name).toBe('Test Collection');
  });

  it('should maintain data across hook re-renders', async () => {
    const { result, rerender } = renderHook(() => useMultipleCollections<TestLevel>('fruit-match'));

    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true);
    });

    act(() => {
      result.current.createCollection('Persistent Collection');
    });

    rerender();

    expect(result.current.collections).toHaveLength(1);
    expect(result.current.collections[0].name).toBe('Persistent Collection');
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('useMultipleCollections - Edge Cases', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should handle empty collection name', async () => {
    const { result } = renderHook(() => useMultipleCollections<TestLevel>('fruit-match'));

    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true);
    });

    act(() => {
      result.current.createCollection('');
    });

    expect(result.current.collections).toHaveLength(1);
    expect(result.current.collections[0].name).toBe('');
  });

  it('should handle special characters in collection name', async () => {
    const { result } = renderHook(() => useMultipleCollections<TestLevel>('fruit-match'));

    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true);
    });

    act(() => {
      result.current.createCollection('Test "quoted" & <special> 🎮');
    });

    expect(result.current.collections[0].name).toBe('Test "quoted" & <special> 🎮');
  });

  it('should handle multiple rapid operations', async () => {
    const { result } = renderHook(() => useMultipleCollections<TestLevel>('fruit-match'));

    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true);
    });

    act(() => {
      result.current.createCollection('Collection 1');
      result.current.createCollection('Collection 2');
      result.current.createCollection('Collection 3');
    });

    expect(result.current.collections).toHaveLength(3);
  });

  it('should handle renaming non-existent collection gracefully', async () => {
    const { result } = renderHook(() => useMultipleCollections<TestLevel>('fruit-match'));

    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true);
    });

    // Should not throw
    act(() => {
      result.current.renameCollection('non-existent', 'New Name');
    });

    expect(result.current.collections).toHaveLength(0);
  });

  it('should handle deleting non-existent collection gracefully', async () => {
    const { result } = renderHook(() => useMultipleCollections<TestLevel>('fruit-match'));

    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true);
    });

    // Should not throw
    act(() => {
      result.current.deleteCollection('non-existent');
    });

    expect(result.current.collections).toHaveLength(0);
  });
});
