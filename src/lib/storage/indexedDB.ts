import { BaseLevel, StorageProvider } from './types';

const DB_NAME = 'levelforge-storage';
const STORE_NAME = 'collections';
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

/**
 * Create an IndexedDB-based storage provider.
 * Unlike localStorage (~5 MB cap), IndexedDB can store hundreds of MB,
 * so large pixel-art level collections won't be silently truncated.
 */
export function createIndexedDBProvider<T extends BaseLevel>(
  storageKey: string,
  migrate?: (level: T) => T,
): StorageProvider<T> {
  return {
    async loadLevels(): Promise<T[]> {
      if (typeof window === 'undefined') return [];

      try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readonly');
          const store = tx.objectStore(STORE_NAME);
          const request = store.get(storageKey);
          request.onsuccess = () => {
            const data = request.result;
            if (!Array.isArray(data)) {
              resolve([]);
              return;
            }
            resolve(migrate ? data.map(migrate) : data);
          };
          request.onerror = () => reject(request.error);
        });
      } catch (error) {
        console.error(`[IndexedDB] Failed to load from ${storageKey}:`, error);
        return [];
      }
    },

    async saveLevels(levels: T[]): Promise<void> {
      if (typeof window === 'undefined') return;

      try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          store.put(levels, storageKey);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      } catch (error) {
        console.error(`[IndexedDB] Failed to save to ${storageKey}:`, error);
        throw error;
      }
    },

    async saveLevel(level: T): Promise<void> {
      const levels = await this.loadLevels();
      const idx = levels.findIndex((l) => l.id === level.id);
      if (idx >= 0) {
        levels[idx] = level;
      } else {
        levels.push(level);
      }
      await this.saveLevels(levels);
    },

    async deleteLevel(id: string): Promise<void> {
      const levels = await this.loadLevels();
      await this.saveLevels(levels.filter((l) => l.id !== id));
    },

    isAvailable(): boolean {
      return typeof window !== 'undefined' && typeof indexedDB !== 'undefined';
    },
  };
}

/**
 * Migrate data from localStorage to IndexedDB (one-time).
 * Returns the migrated levels, or [] if nothing to migrate.
 */
export async function migrateLocalStorageToIndexedDB<T extends BaseLevel>(
  storageKey: string,
  migrate?: (level: T) => T,
): Promise<T[]> {
  if (typeof window === 'undefined') return [];

  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return [];

    const levels: T[] = migrate ? parsed.map(migrate) : parsed;

    // Write to IndexedDB
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(levels, storageKey);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    // Clear localStorage to free space
    localStorage.removeItem(storageKey);
    console.log(`[IndexedDB] Migrated ${levels.length} levels from localStorage`);

    return levels;
  } catch (error) {
    console.error('[IndexedDB] Migration failed:', error);
    return [];
  }
}
