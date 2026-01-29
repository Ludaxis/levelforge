import { useState, useEffect, useCallback, useRef } from 'react';
import { BaseLevel, SyncState, SyncedLevelCollection, SyncedLevelCollectionOptions } from './types';
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

  // Internal setLevels that also saves to localStorage and schedules sync
  const setLevels = useCallback(
    (newLevels: T[] | ((prev: T[]) => T[])) => {
      setLevelsState((prev) => {
        const resolved = typeof newLevels === 'function' ? newLevels(prev) : newLevels;

        // Save to localStorage synchronously
        localProvider.current.saveLevels(resolved).catch((err) => {
          console.error('[Storage] Failed to save to localStorage:', err);
        });

        // Schedule Supabase sync
        // We need to update the ref before scheduling
        levelsRef.current = resolved;
        scheduleSyncToSupabase();

        return resolved;
      });
    },
    [scheduleSyncToSupabase]
  );

  // Load from localStorage on mount
  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      // Load from localStorage first (instant)
      const localLevels = await localProvider.current.loadLevels();

      if (isMounted) {
        if (localLevels.length > 0) {
          setLevelsState(localLevels);
          levelsRef.current = localLevels;
        }
        setIsLoaded(true);
      }

      // Then check Supabase in background (if available and no local data)
      if (supabaseProvider.current.isAvailable()) {
        try {
          const remoteLevels = await supabaseProvider.current.loadLevels();

          if (isMounted) {
            if (remoteLevels.length > 0 && localLevels.length === 0) {
              // No local data but remote data exists - use remote
              const migrated = migrate
                ? remoteLevels.map(migrate)
                : remoteLevels;
              setLevelsState(migrated);
              levelsRef.current = migrated;
              // Also save to localStorage
              await localProvider.current.saveLevels(migrated);
              console.log(`[Sync] Loaded ${migrated.length} levels from Supabase`);
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
    (level: T) => {
      setLevels((prev) => {
        if (prev.length >= maxLevels) return prev;
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
