import { useState, useEffect, useCallback, useRef } from 'react';
import { BaseLevel, SyncState, SyncedLevelCollection, SyncedLevelCollectionOptions } from './types';
import { createIndexedDBProvider, migrateLocalStorageToIndexedDB } from './indexedDB';
import { createLocalStorageProvider } from './localStorage';
import { createSupabaseStorageProvider } from './supabase';

const DEFAULT_SYNC_DEBOUNCE_MS = 2000;

/**
 * Hook that provides synced level collection with localStorage + Supabase backup
 *
 * - Loads from localStorage instantly (zero latency)
 * - Syncs to Supabase in background (debounced)
 * - Full offline functionality maintained
 * - No user authentication required (device ID based)
 */
export function useSyncedLevelCollection<T extends BaseLevel>(
  options: SyncedLevelCollectionOptions<T>
): SyncedLevelCollection<T> {
  const {
    gameType,
    localStorageKey,
    maxLevels,
    migrate,
    syncDebounceMs = DEFAULT_SYNC_DEBOUNCE_MS,
  } = options;

  const [levels, setLevelsState] = useState<T[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [syncState, setSyncState] = useState<SyncState>({
    status: 'pending',
    lastSynced: null,
    pendingChanges: 0,
    error: null,
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  });

  // Refs for providers (stable across renders)
  // Primary local storage: IndexedDB (no 5 MB cap). Falls back to localStorage
  // for environments where IndexedDB is unavailable.
  const idbProvider = useRef(createIndexedDBProvider<T>(localStorageKey, migrate));
  const localProvider = useRef(createLocalStorageProvider<T>(localStorageKey, migrate));
  const supabaseProvider = useRef(createSupabaseStorageProvider<T>(gameType));
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSyncingRef = useRef(false);
  const pendingChangesRef = useRef(0);
  const levelsRef = useRef<T[]>([]);

  // Keep levelsRef in sync
  useEffect(() => {
    levelsRef.current = levels;
  }, [levels]);

  // Sync to Supabase (debounced)
  const syncToSupabase = useCallback(async () => {
    if (isSyncingRef.current) return;
    if (!supabaseProvider.current.isAvailable()) {
      setSyncState((prev) => ({ ...prev, status: 'offline', pendingChanges: 0 }));
      return;
    }

    isSyncingRef.current = true;
    setSyncState((prev) => ({ ...prev, status: 'pending' }));

    try {
      await supabaseProvider.current.saveLevels(levelsRef.current);
      pendingChangesRef.current = 0;
      setSyncState({
        status: 'synced',
        lastSynced: new Date(),
        pendingChanges: 0,
        error: null,
        isOnline: true,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setSyncState((prev) => ({
        ...prev,
        status: 'error',
        error: message,
      }));
      console.error('[Sync] Failed to sync to Supabase:', error);
    } finally {
      isSyncingRef.current = false;
    }
  }, []);

  // Schedule a debounced sync
  const scheduleSyncToSupabase = useCallback(() => {
    pendingChangesRef.current += 1;
    setSyncState((prev) => ({
      ...prev,
      status: 'pending',
      pendingChanges: pendingChangesRef.current,
    }));

    // Clear existing timeout
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }

    // Schedule new sync
    syncTimeoutRef.current = setTimeout(() => {
      syncToSupabase();
    }, syncDebounceMs);
  }, [syncToSupabase, syncDebounceMs]);

  // Internal setLevels that saves to IndexedDB (primary) and schedules Supabase sync
  const setLevels = useCallback(
    (newLevels: T[] | ((prev: T[]) => T[])) => {
      setLevelsState((prev) => {
        const resolved = typeof newLevels === 'function' ? newLevels(prev) : newLevels;

        // Save to IndexedDB (primary) — no 5 MB cap
        idbProvider.current.saveLevels(resolved).catch((err) => {
          console.error('[Storage] IndexedDB save failed, trying localStorage:', err);
          localProvider.current.saveLevels(resolved).catch((lsErr) => {
            console.error('[Storage] localStorage save also failed:', lsErr);
          });
        });

        // Schedule Supabase sync
        levelsRef.current = resolved;
        scheduleSyncToSupabase();

        return resolved;
      });
    },
    [scheduleSyncToSupabase]
  );

  // Load from IndexedDB (primary) on mount, migrating from localStorage if needed
  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      // 1. Try IndexedDB first
      let localLevels = await idbProvider.current.loadLevels();

      // 2. If empty, migrate from localStorage (one-time)
      if (localLevels.length === 0) {
        const migrated = await migrateLocalStorageToIndexedDB<T>(localStorageKey, migrate);
        if (migrated.length > 0) {
          localLevels = migrated;
        } else {
          // Fallback: try reading localStorage directly (no migration)
          localLevels = await localProvider.current.loadLevels();
        }
      }

      if (isMounted) {
        if (localLevels.length > 0) {
          setLevelsState(localLevels);
          levelsRef.current = localLevels;
        }
        setIsLoaded(true);
      }

      // 3. Reconcile with Supabase in background
      if (supabaseProvider.current.isAvailable()) {
        try {
          const remoteLevels = await supabaseProvider.current.loadLevels();

          if (isMounted) {
            if (remoteLevels.length > 0 && localLevels.length === 0) {
              // No local data but remote data exists — use remote
              const migrated = migrate
                ? remoteLevels.map(migrate)
                : remoteLevels;
              setLevelsState(migrated);
              levelsRef.current = migrated;
              await idbProvider.current.saveLevels(migrated);
            } else if (localLevels.length > 0 && remoteLevels.length > localLevels.length) {
              // Remote has MORE levels — local was likely truncated by the old
              // localStorage 5 MB limit. Prefer remote to avoid data loss.
              const migrated = migrate
                ? remoteLevels.map(migrate)
                : remoteLevels;
              setLevelsState(migrated);
              levelsRef.current = migrated;
              await idbProvider.current.saveLevels(migrated);
            } else if (localLevels.length > 0) {
              // Local data exists and is at least as large as remote — push to remote
              const localJson = JSON.stringify(localLevels);
              const remoteJson = JSON.stringify(remoteLevels);
              if (localJson !== remoteJson) {
                isSyncingRef.current = true;
                try {
                  await supabaseProvider.current.saveLevels(localLevels);
                } catch (pushError) {
                  console.error('[Sync] Failed to push local→remote:', pushError);
                } finally {
                  isSyncingRef.current = false;
                }
              }
            }

            setSyncState({
              status: 'synced',
              lastSynced: new Date(),
              pendingChanges: 0,
              error: null,
              isOnline: true,
            });
          }
        } catch (error) {
          if (isMounted) {
            setSyncState((prev) => ({
              ...prev,
              status: localLevels.length > 0 ? 'synced' : 'offline',
              error: error instanceof Error ? error.message : 'Failed to load from server',
              isOnline: navigator.onLine,
            }));
          }
        }
      } else {
        if (isMounted) {
          setSyncState((prev) => ({
            ...prev,
            status: 'offline',
            isOnline: navigator.onLine,
          }));
        }
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  // Intentional mount-only effect: loads from IndexedDB then reconciles with Supabase once.
  // All referenced values are refs or stable setState dispatchers that do not change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Online/offline event listeners
  useEffect(() => {
    const handleOnline = () => {
      setSyncState((prev) => ({ ...prev, isOnline: true }));
      // Auto-sync when coming back online
      if (pendingChangesRef.current > 0 || syncState.status === 'offline') {
        syncToSupabase();
      }
    };

    const handleOffline = () => {
      setSyncState((prev) => ({ ...prev, isOnline: false, status: 'offline' }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [syncToSupabase, syncState.status]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, []);

  // CRUD operations
  const addLevel = useCallback(
    (level: T, atPosition?: number) => {
      setLevels((prev) => {
        if (prev.length >= maxLevels) return prev;

        // If a level with the same name exists, replace it in-place
        // (covers the "delete level 4, re-add level 4" workflow)
        const existingIdx = prev.findIndex((l) => l.name === level.name);
        if (existingIdx >= 0) {
          const updated = [...prev];
          updated[existingIdx] = { ...level, levelNumber: existingIdx + 1 } as T;
          return updated;
        }

        // Insert at a specific position (1-based) if requested
        if (atPosition !== undefined && atPosition >= 1 && atPosition <= prev.length + 1) {
          const newLevels = [...prev];
          newLevels.splice(atPosition - 1, 0, level);
          return newLevels.map((l, i) => ({ ...l, levelNumber: i + 1 } as T));
        }

        // Default: append to end
        const maxNum = prev.reduce((max, l) => Math.max(max, l.levelNumber), 0);
        const newLevel = { ...level, levelNumber: maxNum + 1 } as T;
        return [...prev, newLevel];
      });
    },
    [setLevels, maxLevels]
  );

  const updateLevel = useCallback(
    (id: string, updates: Partial<T>) => {
      setLevels((prev) =>
        prev.map((l) => (l.id === id ? { ...l, ...updates } : l))
      );
    },
    [setLevels]
  );

  const deleteLevel = useCallback(
    (id: string) => {
      setLevels((prev) => {
        const filtered = prev.filter((l) => l.id !== id);
        return filtered.map((l, i) => ({ ...l, levelNumber: i + 1 }));
      });
    },
    [setLevels]
  );

  const moveLevel = useCallback(
    (id: string, direction: 'up' | 'down') => {
      setLevels((prev) => {
        const index = prev.findIndex((l) => l.id === id);
        if (index === -1) return prev;
        if (direction === 'up' && index === 0) return prev;
        if (direction === 'down' && index === prev.length - 1) return prev;

        const newLevels = [...prev];
        const swapIndex = direction === 'up' ? index - 1 : index + 1;
        [newLevels[index], newLevels[swapIndex]] = [
          newLevels[swapIndex],
          newLevels[index],
        ];

        return newLevels.map((l, i) => ({ ...l, levelNumber: i + 1 }));
      });
    },
    [setLevels]
  );

  const importLevels = useCallback(
    (importedLevels: T[]) => {
      setLevels(
        importedLevels.slice(0, maxLevels).map((l, i) => ({
          ...l,
          levelNumber: i + 1,
        }))
      );
    },
    [setLevels, maxLevels]
  );

  const clearAll = useCallback(() => {
    setLevels([]);
  }, [setLevels]);

  const forceSync = useCallback(async () => {
    // Clear any pending timeout
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = null;
    }

    // Wait for any in-flight sync to complete before re-syncing
    if (isSyncingRef.current) {
      const maxWait = 10000;
      const pollInterval = 100;
      let waited = 0;
      while (isSyncingRef.current && waited < maxWait) {
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
        waited += pollInterval;
      }
    }

    await syncToSupabase();
  }, [syncToSupabase]);

  return {
    levels,
    setLevels,
    isLoaded,
    syncState,
    addLevel,
    updateLevel,
    deleteLevel,
    moveLevel,
    importLevels,
    clearAll,
    forceSync,
  };
}
