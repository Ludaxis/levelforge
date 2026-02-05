'use client';

import { useState, useEffect, useCallback } from 'react';
import { BaseLevel, CollectionMetadata, CollectionIndex, GameType } from './types';

/**
 * Hook for managing multiple collections per game type
 */
export function useMultipleCollections<T extends BaseLevel>(
  gameType: GameType,
  maxLevels: number = 100
) {
  const indexKey = `${gameType}-collections-index`;
  const [collectionIndex, setCollectionIndex] = useState<CollectionIndex>({ collections: [], activeCollectionId: null });
  const [isLoaded, setIsLoaded] = useState(false);

  // Load on mount (with legacy migration)
  useEffect(() => {
    const stored = localStorage.getItem(indexKey);
    if (stored) {
      try {
        setCollectionIndex(JSON.parse(stored));
      } catch {
        // Invalid JSON, start fresh
        setCollectionIndex({ collections: [], activeCollectionId: null });
      }
    } else {
      // Migrate from legacy single collection
      const legacyKey = `${gameType}-level-collection`;
      const legacyData = localStorage.getItem(legacyKey);
      if (legacyData) {
        try {
          const levels = JSON.parse(legacyData);
          const defaultCollection: CollectionMetadata = {
            id: 'default',
            name: 'Default Collection',
            gameType,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            levelCount: Array.isArray(levels) ? levels.length : 0,
          };
          // Save to new key
          localStorage.setItem(`${gameType}-collection-default`, legacyData);
          const index: CollectionIndex = { collections: [defaultCollection], activeCollectionId: 'default' };
          localStorage.setItem(indexKey, JSON.stringify(index));
          setCollectionIndex(index);
        } catch {
          // Invalid legacy data, start fresh
          setCollectionIndex({ collections: [], activeCollectionId: null });
        }
      }
    }
    setIsLoaded(true);
  }, [gameType, indexKey]);

  // Save index on change
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem(indexKey, JSON.stringify(collectionIndex));
    }
  }, [collectionIndex, isLoaded, indexKey]);

  const createCollection = useCallback((name: string, description?: string): string => {
    const id = `collection-${Date.now()}`;
    const newCollection: CollectionMetadata = {
      id,
      name,
      description,
      gameType,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      levelCount: 0,
    };
    localStorage.setItem(`${gameType}-collection-${id}`, '[]');
    setCollectionIndex(prev => ({
      collections: [...prev.collections, newCollection],
      activeCollectionId: prev.activeCollectionId ?? id,
    }));
    return id;
  }, [gameType]);

  const renameCollection = useCallback((id: string, name: string, description?: string) => {
    setCollectionIndex(prev => ({
      ...prev,
      collections: prev.collections.map(c =>
        c.id === id ? { ...c, name, description: description ?? c.description, updatedAt: Date.now() } : c
      ),
    }));
  }, []);

  const deleteCollection = useCallback((id: string) => {
    localStorage.removeItem(`${gameType}-collection-${id}`);
    setCollectionIndex(prev => ({
      collections: prev.collections.filter(c => c.id !== id),
      activeCollectionId: prev.activeCollectionId === id
        ? (prev.collections.find(c => c.id !== id)?.id ?? null)
        : prev.activeCollectionId,
    }));
  }, [gameType]);

  const setActiveCollection = useCallback((id: string) => {
    setCollectionIndex(prev => ({ ...prev, activeCollectionId: id }));
  }, []);

  const getLevelsForCollection = useCallback((id: string): T[] => {
    const data = localStorage.getItem(`${gameType}-collection-${id}`);
    if (!data) return [];
    try {
      return JSON.parse(data);
    } catch {
      return [];
    }
  }, [gameType]);

  const saveLevelsForCollection = useCallback((id: string, levels: T[]) => {
    const trimmedLevels = levels.slice(0, maxLevels);
    localStorage.setItem(`${gameType}-collection-${id}`, JSON.stringify(trimmedLevels));
    setCollectionIndex(prev => ({
      ...prev,
      collections: prev.collections.map(c =>
        c.id === id ? { ...c, levelCount: trimmedLevels.length, updatedAt: Date.now() } : c
      ),
    }));
  }, [gameType, maxLevels]);

  const addLevelToCollection = useCallback((id: string, level: T) => {
    const levels = getLevelsForCollection(id);
    if (levels.length >= maxLevels) return false;
    levels.push(level);
    saveLevelsForCollection(id, levels);
    return true;
  }, [getLevelsForCollection, saveLevelsForCollection, maxLevels]);

  const activeCollection = collectionIndex.collections.find(c => c.id === collectionIndex.activeCollectionId) ?? null;

  return {
    collectionIndex,
    isLoaded,
    createCollection,
    renameCollection,
    deleteCollection,
    setActiveCollection,
    getLevelsForCollection,
    saveLevelsForCollection,
    addLevelToCollection,
    activeCollection,
    collections: collectionIndex.collections,
    activeCollectionId: collectionIndex.activeCollectionId,
  };
}
