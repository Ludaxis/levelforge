import { getSupabaseClient, getDeviceId } from '../supabase/client';
import { GameType } from '../supabase/types';

/**
 * Migrate device-based collection to user account
 * Called after login if user has existing device data
 *
 * Migration strategy:
 * 1. Find the device's collection for the game type
 * 2. Update the collection to be owned by the user
 * 3. Remove device_id reference
 *
 * This preserves all levels and just transfers ownership.
 */
export async function migrateDeviceCollectionToUser(
  userId: string,
  gameType: GameType
): Promise<{ success: boolean; migrated: boolean; error?: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, migrated: false, error: 'Supabase not configured' };
  }

  const deviceId = getDeviceId();
  if (deviceId === 'ssr-placeholder') {
    return { success: false, migrated: false, error: 'Device ID not available' };
  }

  try {
    // Check if user already has a collection for this game type
    const { data: userRows, error: userError } = await client
      .from('level_collections')
      .select('id')
      .eq('user_id', userId)
      .eq('game_type', gameType)
      .limit(1);

    if (userError) {
      console.error('[Migration] Error checking user collection:', userError.message);
      return { success: false, migrated: false, error: userError.message || 'Unknown error' };
    }

    if (userRows && userRows.length > 0) {
      // User already has a collection, no migration needed
      console.log(`[Migration] User already has ${gameType} collection, skipping migration`);
      return { success: true, migrated: false };
    }

    // Find device collection
    const { data: deviceRows, error: findError } = await client
      .from('level_collections')
      .select('id')
      .eq('device_id', deviceId)
      .eq('game_type', gameType)
      .limit(1);

    if (findError) {
      console.error('[Migration] Error finding device collection:', findError.message);
      return { success: false, migrated: false, error: findError.message };
    }

    if (!deviceRows || deviceRows.length === 0) {
      console.log(`[Migration] No device collection for ${gameType}, nothing to migrate`);
      return { success: true, migrated: false };
    }

    const deviceCollection = deviceRows[0];

    // Migrate: update collection to be owned by user
    const { error: updateError } = await client
      .from('level_collections')
      .update({
        user_id: userId,
        device_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', deviceCollection.id);

    if (updateError) {
      console.error('[Migration] Error migrating collection:', updateError);
      return { success: false, migrated: false, error: updateError.message };
    }

    console.log(`[Migration] Successfully migrated ${gameType} collection to user ${userId}`);
    return { success: true, migrated: true };
  } catch (error) {
    console.error('[Migration] Unexpected error:', error);
    return { success: false, migrated: false, error: 'Unexpected error during migration' };
  }
}

/**
 * Migrate all game types for a user after login
 */
export async function migrateAllCollectionsToUser(
  userId: string
): Promise<{ results: Record<GameType, { success: boolean; migrated: boolean; error?: string }> }> {
  const gameTypes: GameType[] = ['fruit-match', 'hexa-block', 'square-block'];
  const results: Record<GameType, { success: boolean; migrated: boolean; error?: string }> = {
    'fruit-match': { success: false, migrated: false },
    'hexa-block': { success: false, migrated: false },
    'square-block': { success: false, migrated: false },
  };

  for (const gameType of gameTypes) {
    results[gameType] = await migrateDeviceCollectionToUser(userId, gameType);
  }

  return { results };
}

/**
 * Check if device has any collections that can be migrated
 */
export async function hasDeviceCollections(): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  const deviceId = getDeviceId();
  if (deviceId === 'ssr-placeholder') return false;

  try {
    const { data, error } = await client
      .from('level_collections')
      .select('id')
      .eq('device_id', deviceId)
      .limit(1);

    if (error) {
      console.error('[Migration] Error checking device collections:', error);
      return false;
    }

    return (data?.length ?? 0) > 0;
  } catch (error) {
    console.error('[Migration] Unexpected error checking device collections:', error);
    return false;
  }
}
