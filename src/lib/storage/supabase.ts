import { getSupabaseClient, getDeviceId, getUser } from '../supabase/client';
import { GameType } from '../supabase/types';
import { BaseLevel, StorageProvider } from './types';
import { migrateDeviceCollectionToUser } from './migration';

/**
 * Create a Supabase-based storage provider
 * @param gameType - The game type for this collection
 */
export function createSupabaseStorageProvider<T extends BaseLevel>(
  gameType: GameType
): StorageProvider<T> {
  /**
   * Get or create the collection ID for this user/device/game combination
   * Priority: user_id > device_id
   */
  async function getOrCreateCollectionId(): Promise<string | null> {
    const client = getSupabaseClient();
    if (!client) return null;

    try {
      const user = await getUser();

      // If authenticated, use user_id
      if (user) {
        // First, try to migrate any device collection to this user
        // This must happen BEFORE checking for user collection
        await migrateDeviceCollectionToUser(user.id, gameType);

        // Now try to find existing collection for this user
        // Use .limit(1) instead of .maybeSingle() to handle duplicates gracefully
        const { data: existingRows, error: findError } = await client
          .from('level_collections')
          .select('id')
          .eq('user_id', user.id)
          .eq('game_type', gameType)
          .limit(1);

        if (findError) {
          console.error('[Supabase] Error finding user collection:', findError.message);
          return null;
        }

        if (existingRows && existingRows.length > 0) {
          return existingRows[0].id;
        }

        // Create new collection for user
        const { data: created, error: createError } = await client
          .from('level_collections')
          .insert({
            user_id: user.id,
            device_id: null,
            game_type: gameType,
          })
          .select('id')
          .single();

        if (createError) {
          console.error('[Supabase] Failed to create user collection:', JSON.stringify(createError, null, 2));
          console.error('[Supabase] Error code:', createError.code, 'message:', createError.message, 'details:', createError.details);
          return null;
        }

        console.log('[Supabase] Created new user collection:', created?.id);
        return created?.id ?? null;
      }

      // Guest mode: use device_id
      const deviceId = getDeviceId();
      if (deviceId === 'ssr-placeholder') return null;

      // Try to find existing collection for this device
      const { data: existingRows, error: findError } = await client
        .from('level_collections')
        .select('id')
        .eq('device_id', deviceId)
        .eq('game_type', gameType)
        .limit(1);

      if (findError) {
        console.error('[Supabase] Error finding device collection:', findError.message);
        return null;
      }

      if (existingRows && existingRows.length > 0) {
        return existingRows[0].id;
      }

      // Create new collection for device
      const { data: created, error: createError } = await client
        .from('level_collections')
        .insert({
          device_id: deviceId,
          user_id: null,
          game_type: gameType,
        })
        .select('id')
        .single();

      if (createError) {
        console.error('[Supabase] Failed to create device collection:', JSON.stringify(createError, null, 2));
        console.error('[Supabase] Error code:', createError.code, 'message:', createError.message, 'details:', createError.details);
        return null;
      }

      console.log('[Supabase] Created new device collection:', created?.id);
      return created?.id ?? null;
    } catch (error) {
      console.error('[Supabase] Error in getOrCreateCollectionId:', error);
      return null;
    }
  }

  return {
    async loadLevels(): Promise<T[]> {
      const client = getSupabaseClient();
      if (!client) return [];

      const collectionId = await getOrCreateCollectionId();
      if (!collectionId) return [];

      try {
        const { data, error } = await client
          .from('levels')
          .select('level_number, level_data')
          .eq('collection_id', collectionId)
          .order('level_number', { ascending: true });

        if (error) {
          console.error('[Supabase] Failed to load levels:', error);
          return [];
        }

        // Convert DB format to level format
        return (data || []).map((row) => ({
          ...(row.level_data as T),
          levelNumber: row.level_number,
        }));
      } catch (error) {
        console.error('[Supabase] Error loading levels:', error);
        return [];
      }
    },

    async saveLevels(levels: T[]): Promise<void> {
      const client = getSupabaseClient();
      if (!client) return;

      const collectionId = await getOrCreateCollectionId();
      if (!collectionId) return;

      try {
        // Delete all existing levels for this collection
        const { error: deleteError } = await client
          .from('levels')
          .delete()
          .eq('collection_id', collectionId);

        if (deleteError) {
          console.error('[Supabase] Failed to delete existing levels:', deleteError);
          throw deleteError;
        }

        // Insert all new levels
        if (levels.length > 0) {
          const rows = levels.map((level) => ({
            collection_id: collectionId,
            level_number: level.levelNumber,
            level_data: level as Record<string, unknown>,
          }));

          const { error: insertError } = await client
            .from('levels')
            .insert(rows);

          if (insertError) {
            console.error('[Supabase] Failed to insert levels:', insertError);
            throw insertError;
          }
        }

        // Update collection timestamp
        await client
          .from('level_collections')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', collectionId);

        console.log(`[Supabase] Saved ${levels.length} levels for ${gameType}`);
      } catch (error) {
        console.error('[Supabase] Error saving levels:', error);
        throw error;
      }
    },

    async saveLevel(level: T): Promise<void> {
      const client = getSupabaseClient();
      if (!client) return;

      const collectionId = await getOrCreateCollectionId();
      if (!collectionId) return;

      try {
        const { error } = await client
          .from('levels')
          .upsert({
            collection_id: collectionId,
            level_number: level.levelNumber,
            level_data: level as Record<string, unknown>,
          }, {
            onConflict: 'collection_id,level_number',
          });

        if (error) {
          console.error('[Supabase] Failed to save level:', error);
          throw error;
        }
      } catch (error) {
        console.error('[Supabase] Error saving level:', error);
        throw error;
      }
    },

    async deleteLevel(id: string): Promise<void> {
      const client = getSupabaseClient();
      if (!client) return;

      const collectionId = await getOrCreateCollectionId();
      if (!collectionId) return;

      try {
        // We need to find the level by its ID in the level_data
        // This is a bit inefficient but necessary since ID is in JSONB
        const { data: levels } = await client
          .from('levels')
          .select('level_number, level_data')
          .eq('collection_id', collectionId);

        const levelToDelete = levels?.find(
          (l) => (l.level_data as Record<string, unknown>).id === id
        );

        if (levelToDelete) {
          const { error } = await client
            .from('levels')
            .delete()
            .eq('collection_id', collectionId)
            .eq('level_number', levelToDelete.level_number);

          if (error) {
            console.error('[Supabase] Failed to delete level:', error);
            throw error;
          }
        }
      } catch (error) {
        console.error('[Supabase] Error deleting level:', error);
        throw error;
      }
    },

    isAvailable(): boolean {
      return getSupabaseClient() !== null;
    },

    /**
     * Get the current collection ID (useful for sharing)
     */
    async getCollectionId(): Promise<string | null> {
      return getOrCreateCollectionId();
    },
  };
}

