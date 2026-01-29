import { createClient, SupabaseClient, User, AuthChangeEvent, Session } from '@supabase/supabase-js';
import { createBrowserClient } from '@supabase/ssr';

// Singleton client instance
let supabaseClient: SupabaseClient | null = null;

/**
 * Get or create the Supabase client
 * Returns null if Supabase is not configured
 */
export function getSupabaseClient(): SupabaseClient | null {
  // Return cached instance if available
  if (supabaseClient !== null) {
    return supabaseClient;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Check if Supabase is configured
  if (!supabaseUrl || !supabaseAnonKey) {
    console.log('[Supabase] Not configured - using localStorage only');
    return null;
  }

  // Validate URL format
  if (!supabaseUrl.startsWith('https://') || !supabaseUrl.includes('.supabase.co')) {
    console.warn('[Supabase] Invalid URL format - using localStorage only');
    return null;
  }

  try {
    // Use createBrowserClient for proper cookie-based session handling
    supabaseClient = createBrowserClient(supabaseUrl, supabaseAnonKey);
    console.log('[Supabase] Client initialized successfully');
    return supabaseClient;
  } catch (error) {
    console.error('[Supabase] Failed to initialize client:', error);
    return null;
  }
}

/**
 * Check if Supabase is available and configured
 */
export function isSupabaseConfigured(): boolean {
  return getSupabaseClient() !== null;
}

// Device ID management
const DEVICE_ID_KEY = 'echo-level-workbench-device-id';

/**
 * Get or create a unique device ID for this browser
 * Device ID is stored in localStorage and persists across sessions
 */
export function getDeviceId(): string {
  if (typeof window === 'undefined') {
    // SSR - return a placeholder that will be replaced on client
    return 'ssr-placeholder';
  }

  let deviceId = localStorage.getItem(DEVICE_ID_KEY);

  if (!deviceId) {
    // Generate a new UUID-like device ID
    deviceId = `device-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
    console.log('[Supabase] Generated new device ID:', deviceId);
  }

  return deviceId;
}

// ============================================================================
// Auth Functions
// ============================================================================

/**
 * Get the current authenticated user
 */
export async function getUser(): Promise<User | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const { data: { user } } = await client.auth.getUser();
    return user;
  } catch (error) {
    console.error('[Supabase] Error getting user:', error);
    return null;
  }
}

/**
 * Get the current session
 */
export async function getSession(): Promise<Session | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const { data: { session } } = await client.auth.getSession();
    return session;
  } catch (error) {
    console.error('[Supabase] Error getting session:', error);
    return null;
  }
}

/**
 * Sign in with email and password
 */
export async function signInWithEmail(email: string, password: string): Promise<{ user: User | null; error: string | null }> {
  const client = getSupabaseClient();
  if (!client) return { user: null, error: 'Supabase not configured' };

  try {
    const { data, error } = await client.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return { user: null, error: error.message };
    }

    return { user: data.user, error: null };
  } catch (error) {
    console.error('[Supabase] Sign in error:', error);
    return { user: null, error: 'An unexpected error occurred' };
  }
}

/**
 * Sign up with email and password
 */
export async function signUpWithEmail(email: string, password: string): Promise<{ user: User | null; error: string | null }> {
  const client = getSupabaseClient();
  if (!client) return { user: null, error: 'Supabase not configured' };

  try {
    const { data, error } = await client.auth.signUp({
      email,
      password,
    });

    if (error) {
      return { user: null, error: error.message };
    }

    return { user: data.user, error: null };
  } catch (error) {
    console.error('[Supabase] Sign up error:', error);
    return { user: null, error: 'An unexpected error occurred' };
  }
}

/**
 * Sign in with Google OAuth
 */
export async function signInWithGoogle(): Promise<{ error: string | null }> {
  const client = getSupabaseClient();
  if (!client) return { error: 'Supabase not configured' };

  try {
    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      return { error: error.message };
    }

    return { error: null };
  } catch (error) {
    console.error('[Supabase] Google sign in error:', error);
    return { error: 'An unexpected error occurred' };
  }
}

/**
 * Sign out the current user
 */
export async function signOut(): Promise<{ error: string | null }> {
  const client = getSupabaseClient();
  if (!client) return { error: 'Supabase not configured' };

  try {
    const { error } = await client.auth.signOut();

    if (error) {
      return { error: error.message };
    }

    return { error: null };
  } catch (error) {
    console.error('[Supabase] Sign out error:', error);
    return { error: 'An unexpected error occurred' };
  }
}

/**
 * Subscribe to auth state changes
 */
export function onAuthStateChange(
  callback: (event: AuthChangeEvent, session: Session | null) => void
): { unsubscribe: () => void } {
  const client = getSupabaseClient();
  if (!client) {
    return { unsubscribe: () => {} };
  }

  const { data: { subscription } } = client.auth.onAuthStateChange(callback);
  return { unsubscribe: () => subscription.unsubscribe() };
}
