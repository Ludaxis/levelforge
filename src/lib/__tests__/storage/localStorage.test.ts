import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLocalStorageProvider } from '../../storage/localStorage';
import { BaseLevel } from '../../storage/types';

// Test level type
interface TestLevel extends BaseLevel {
  name: string;
  data?: string;
}

// ============================================================================
// Provider Creation
// ============================================================================

describe('createLocalStorageProvider', () => {
  const STORAGE_KEY = 'test-storage-key';

  beforeEach(() => {
    localStorage.clear();
  });

  describe('loadLevels', () => {
    it('should return empty array when no data exists', async () => {
      const provider = createLocalStorageProvider<TestLevel>(STORAGE_KEY);
      const levels = await provider.loadLevels();
      expect(levels).toEqual([]);
    });

    it('should load existing levels from localStorage', async () => {
      const testLevels: TestLevel[] = [
        { id: '1', levelNumber: 1, name: 'Level 1' },
        { id: '2', levelNumber: 2, name: 'Level 2' },
      ];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(testLevels));

      const provider = createLocalStorageProvider<TestLevel>(STORAGE_KEY);
      const levels = await provider.loadLevels();

      expect(levels).toHaveLength(2);
      expect(levels[0].name).toBe('Level 1');
      expect(levels[1].name).toBe('Level 2');
    });

    it('should return empty array for invalid JSON', async () => {
      localStorage.setItem(STORAGE_KEY, 'not valid json');

      const provider = createLocalStorageProvider<TestLevel>(STORAGE_KEY);
      const levels = await provider.loadLevels();

      expect(levels).toEqual([]);
    });

    it('should return empty array for non-array data', async () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ not: 'an array' }));

      const provider = createLocalStorageProvider<TestLevel>(STORAGE_KEY);
      const levels = await provider.loadLevels();

      expect(levels).toEqual([]);
    });

    it('should apply migration function if provided', async () => {
      const testLevels = [{ id: '1', levelNumber: 1, name: 'Old Name' }];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(testLevels));

      const migrate = (level: TestLevel): TestLevel => ({
        ...level,
        name: `Migrated: ${level.name}`,
      });

      const provider = createLocalStorageProvider<TestLevel>(STORAGE_KEY, migrate);
      const levels = await provider.loadLevels();

      expect(levels[0].name).toBe('Migrated: Old Name');
    });
  });

  describe('saveLevels', () => {
    it('should save levels to localStorage', async () => {
      const provider = createLocalStorageProvider<TestLevel>(STORAGE_KEY);
      const testLevels: TestLevel[] = [
        { id: '1', levelNumber: 1, name: 'Level 1' },
      ];

      await provider.saveLevels(testLevels);

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      expect(stored).toHaveLength(1);
      expect(stored[0].name).toBe('Level 1');
    });

    it('should overwrite existing data', async () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([
        { id: 'old', levelNumber: 0, name: 'Old Level' },
      ]));

      const provider = createLocalStorageProvider<TestLevel>(STORAGE_KEY);
      await provider.saveLevels([{ id: 'new', levelNumber: 1, name: 'New Level' }]);

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      expect(stored).toHaveLength(1);
      expect(stored[0].name).toBe('New Level');
    });
  });

  describe('saveLevel', () => {
    it('should add new level if not exists', async () => {
      const provider = createLocalStorageProvider<TestLevel>(STORAGE_KEY);
      const newLevel: TestLevel = { id: '1', levelNumber: 1, name: 'New' };

      await provider.saveLevel(newLevel);

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      expect(stored).toHaveLength(1);
      expect(stored[0].id).toBe('1');
    });

    it('should update existing level', async () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([
        { id: '1', levelNumber: 1, name: 'Original' },
      ]));

      const provider = createLocalStorageProvider<TestLevel>(STORAGE_KEY);
      await provider.saveLevel({ id: '1', levelNumber: 1, name: 'Updated' });

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      expect(stored).toHaveLength(1);
      expect(stored[0].name).toBe('Updated');
    });

    it('should preserve other levels when updating', async () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([
        { id: '1', levelNumber: 1, name: 'First' },
        { id: '2', levelNumber: 2, name: 'Second' },
      ]));

      const provider = createLocalStorageProvider<TestLevel>(STORAGE_KEY);
      await provider.saveLevel({ id: '1', levelNumber: 1, name: 'Updated First' });

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      expect(stored).toHaveLength(2);
      expect(stored.find((l: TestLevel) => l.id === '2')?.name).toBe('Second');
    });
  });

  describe('deleteLevel', () => {
    it('should remove level by ID', async () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([
        { id: '1', levelNumber: 1, name: 'First' },
        { id: '2', levelNumber: 2, name: 'Second' },
      ]));

      const provider = createLocalStorageProvider<TestLevel>(STORAGE_KEY);
      await provider.deleteLevel('1');

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      expect(stored).toHaveLength(1);
      expect(stored[0].id).toBe('2');
    });

    it('should handle deleting non-existent level', async () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([
        { id: '1', levelNumber: 1, name: 'First' },
      ]));

      const provider = createLocalStorageProvider<TestLevel>(STORAGE_KEY);
      await provider.deleteLevel('non-existent');

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      expect(stored).toHaveLength(1);
    });
  });

  describe('isAvailable', () => {
    it('should return true when localStorage works', () => {
      const provider = createLocalStorageProvider<TestLevel>(STORAGE_KEY);
      expect(provider.isAvailable()).toBe(true);
    });
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('Edge Cases', () => {
  const STORAGE_KEY = 'edge-case-key';

  beforeEach(() => {
    localStorage.clear();
  });

  it('should handle very large data', async () => {
    const provider = createLocalStorageProvider<TestLevel>(STORAGE_KEY);
    const largeLevels: TestLevel[] = Array.from({ length: 100 }, (_, i) => ({
      id: `level-${i}`,
      levelNumber: i,
      name: `Level ${i}`,
      data: 'x'.repeat(1000), // 1KB of data per level
    }));

    await provider.saveLevels(largeLevels);
    const loaded = await provider.loadLevels();

    expect(loaded).toHaveLength(100);
  });

  it('should handle special characters in data', async () => {
    const provider = createLocalStorageProvider<TestLevel>(STORAGE_KEY);
    const testLevel: TestLevel = {
      id: '1',
      levelNumber: 1,
      name: 'Test "quoted" & <special>',
      data: '{"nested": "json"}',
    };

    await provider.saveLevel(testLevel);
    const loaded = await provider.loadLevels();

    expect(loaded[0].name).toBe('Test "quoted" & <special>');
    expect(loaded[0].data).toBe('{"nested": "json"}');
  });

  it('should handle unicode characters', async () => {
    const provider = createLocalStorageProvider<TestLevel>(STORAGE_KEY);
    const testLevel: TestLevel = {
      id: '1',
      levelNumber: 1,
      name: '🎮 Level 日本語 🍎',
    };

    await provider.saveLevel(testLevel);
    const loaded = await provider.loadLevels();

    expect(loaded[0].name).toBe('🎮 Level 日本語 🍎');
  });
});
