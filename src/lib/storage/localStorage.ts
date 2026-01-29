import { BaseLevel, StorageProvider } from './types';

/**
 * Create a localStorage-based storage provider
 * @param storageKey - The localStorage key to use
 * @param migrate - Optional migration function for loaded levels
 */
export function createLocalStorageProvider<T extends BaseLevel>(
  storageKey: string,
  migrate?: (level: T) => T
): StorageProvider<T> {
  return {
    async loadLevels(): Promise<T[]> {
      if (typeof window === 'undefined') {
        return [];
      }

      try {
        const stored = localStorage.getItem(storageKey);
        if (!stored) {
          return [];
        }

        const parsed = JSON.parse(stored);
        if (!Array.isArray(parsed)) {
          console.warn(`[localStorage] Invalid data format in ${storageKey}`);
          return [];
        }

        // Apply migration if provided
        if (migrate) {
          return parsed.map(migrate);
        }

        return parsed;
      } catch (error) {
        console.error(`[localStorage] Failed to load from ${storageKey}:`, error);
        return [];
      }
    },

    async saveLevels(levels: T[]): Promise<void> {
      if (typeof window === 'undefined') {
        return;
      }

      try {
        localStorage.setItem(storageKey, JSON.stringify(levels));
      } catch (error) {
        console.error(`[localStorage] Failed to save to ${storageKey}:`, error);
        throw error;
      }
    },

    async saveLevel(level: T): Promise<void> {
      if (typeof window === 'undefined') {
        return;
      }

      try {
        const levels = await this.loadLevels();
        const existingIndex = levels.findIndex((l) => l.id === level.id);

        if (existingIndex >= 0) {
          levels[existingIndex] = level;
        } else {
          levels.push(level);
        }

        await this.saveLevels(levels);
      } catch (error) {
        console.error(`[localStorage] Failed to save level:`, error);
        throw error;
      }
    },

    async deleteLevel(id: string): Promise<void> {
      if (typeof window === 'undefined') {
        return;
      }

      try {
        const levels = await this.loadLevels();
        const filtered = levels.filter((l) => l.id !== id);
        await this.saveLevels(filtered);
      } catch (error) {
        console.error(`[localStorage] Failed to delete level:`, error);
        throw error;
      }
    },

    isAvailable(): boolean {
      if (typeof window === 'undefined') {
        return false;
      }

      try {
        const testKey = '__storage_test__';
        localStorage.setItem(testKey, testKey);
        localStorage.removeItem(testKey);
        return true;
      } catch {
        return false;
      }
    },
  };
}
