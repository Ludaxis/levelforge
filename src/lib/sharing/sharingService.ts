import { getSupabaseClient, getUser } from '../supabase/client';
import { DbLevel, DbLevelCollection, DbSharedCollection, GameType } from '../supabase/types';

/**
 * Generate a short unique share code
 * Format: 6 alphanumeric characters
 */
export function generateShareCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Get the share URL for a given share code
 */
export function getShareUrl(shareCode: string): string {
  if (typeof window === 'undefined') {
    return `/shared/${shareCode}`;
  }
  return `${window.location.origin}/shared/${shareCode}`;
}

/**
 * Create a shared collection link
 */
export async function createShareLink(
  collectionId: string,
  title?: string,
  description?: string
): Promise<{ shareCode: string; shareUrl: string; error?: string } | { error: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return { error: 'Supabase not configured' };
  }

  const user = await getUser();
  if (!user) {
    return { error: 'You must be signed in to share collections' };
  }

  try {
    // Verify the user owns this collection
    const { data: collection, error: collectionError } = await client
      .from('level_collections')
      .select('id, user_id')
      .eq('id', collectionId)
      .single();

    if (collectionError || !collection) {
      return { error: 'Collection not found' };
    }

    if (collection.user_id !== user.id) {
      return { error: 'You can only share your own collections' };
    }

    // Check if already shared
    const { data: existingShare } = await client
      .from('shared_collections')
      .select('share_code')
      .eq('collection_id', collectionId)
      .maybeSingle();

    if (existingShare) {
      // Update existing share
      const { error: updateError } = await client
        .from('shared_collections')
        .update({
          title,
          description,
          updated_at: new Date().toISOString(),
        })
        .eq('collection_id', collectionId);

      if (updateError) {
        return { error: updateError.message };
      }

      return {
        shareCode: existingShare.share_code,
        shareUrl: getShareUrl(existingShare.share_code),
      };
    }

    // Create new share
    const shareCode = generateShareCode();
    const { error: insertError } = await client
      .from('shared_collections')
      .insert({
        collection_id: collectionId,
        share_code: shareCode,
        title,
        description,
        is_public: true,
      });

    if (insertError) {
      // If share code collision, try again
      if (insertError.code === '23505') {
        return createShareLink(collectionId, title, description);
      }
      return { error: insertError.message };
    }

    console.log(`[Sharing] Created share link: ${shareCode}`);
    return {
      shareCode,
      shareUrl: getShareUrl(shareCode),
    };
  } catch (error) {
    console.error('[Sharing] Error creating share link:', error);
    return { error: 'Failed to create share link' };
  }
}

/**
 * Get the share info for a collection
 */
export async function getShareInfo(
  collectionId: string
): Promise<DbSharedCollection | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const { data, error } = await client
      .from('shared_collections')
      .select('*')
      .eq('collection_id', collectionId)
      .maybeSingle();

    if (error) {
      console.error('[Sharing] Error getting share info:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('[Sharing] Error getting share info:', error);
    return null;
  }
}

/**
 * Get shared collection by share code (public access)
 */
export async function getSharedCollection(
  shareCode: string
): Promise<{
  share: DbSharedCollection;
  collection: DbLevelCollection;
  levels: DbLevel[];
  ownerEmail?: string;
} | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    // Get shared collection info
    const { data: share, error: shareError } = await client
      .from('shared_collections')
      .select('*')
      .eq('share_code', shareCode)
      .eq('is_public', true)
      .single();

    if (shareError || !share) {
      console.log('[Sharing] Share not found or not public');
      return null;
    }

    // Get the collection
    const { data: collection, error: collectionError } = await client
      .from('level_collections')
      .select('*')
      .eq('id', share.collection_id)
      .single();

    if (collectionError || !collection) {
      console.error('[Sharing] Collection not found');
      return null;
    }

    // Get all levels
    const { data: levels, error: levelsError } = await client
      .from('levels')
      .select('*')
      .eq('collection_id', share.collection_id)
      .order('level_number', { ascending: true });

    if (levelsError) {
      console.error('[Sharing] Error getting levels:', levelsError);
      return null;
    }

    return {
      share,
      collection,
      levels: levels || [],
    };
  } catch (error) {
    console.error('[Sharing] Error getting shared collection:', error);
    return null;
  }
}

/**
 * Increment view count for a shared collection
 */
export async function incrementViewCount(shareCode: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;

  try {
    // Try RPC first, fallback to direct update
    const { error: rpcError } = await client.rpc('increment_view_count', { p_share_code: shareCode });

    if (rpcError) {
      // Fallback if RPC doesn't exist: just update directly
      // Note: This is not atomic but good enough for view counts
      const { data } = await client
        .from('shared_collections')
        .select('view_count')
        .eq('share_code', shareCode)
        .single();

      if (data) {
        await client
          .from('shared_collections')
          .update({ view_count: (data.view_count || 0) + 1 })
          .eq('share_code', shareCode);
      }
    }
  } catch (error) {
    // Non-critical, just log
    console.error('[Sharing] Error incrementing view count:', error);
  }
}

/**
 * Revoke/disable sharing for a collection
 */
export async function revokeShareLink(collectionId: string): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, error: 'Supabase not configured' };
  }

  const user = await getUser();
  if (!user) {
    return { success: false, error: 'You must be signed in' };
  }

  try {
    // Verify ownership
    const { data: collection } = await client
      .from('level_collections')
      .select('user_id')
      .eq('id', collectionId)
      .single();

    if (!collection || collection.user_id !== user.id) {
      return { success: false, error: 'Collection not found or not owned by you' };
    }

    // Delete share
    const { error } = await client
      .from('shared_collections')
      .delete()
      .eq('collection_id', collectionId);

    if (error) {
      return { success: false, error: error.message };
    }

    console.log(`[Sharing] Revoked share for collection: ${collectionId}`);
    return { success: true };
  } catch (error) {
    console.error('[Sharing] Error revoking share:', error);
    return { success: false, error: 'Failed to revoke share' };
  }
}

/**
 * Toggle public visibility of a share
 */
export async function setSharePublic(
  collectionId: string,
  isPublic: boolean
): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, error: 'Supabase not configured' };
  }

  const user = await getUser();
  if (!user) {
    return { success: false, error: 'You must be signed in' };
  }

  try {
    // Verify ownership
    const { data: collection } = await client
      .from('level_collections')
      .select('user_id')
      .eq('id', collectionId)
      .single();

    if (!collection || collection.user_id !== user.id) {
      return { success: false, error: 'Collection not found or not owned by you' };
    }

    const { error } = await client
      .from('shared_collections')
      .update({ is_public: isPublic })
      .eq('collection_id', collectionId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('[Sharing] Error updating share visibility:', error);
    return { success: false, error: 'Failed to update share visibility' };
  }
}
