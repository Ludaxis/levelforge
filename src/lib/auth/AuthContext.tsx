'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { User } from '@supabase/supabase-js';
import {
  getUser,
  signInWithEmail as signInWithEmailFn,
  signUpWithEmail as signUpWithEmailFn,
  signInWithGoogle as signInWithGoogleFn,
  signOut as signOutFn,
  onAuthStateChange,
  isSupabaseConfigured,
} from '@/lib/supabase/client';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isSupabaseAvailable: boolean;
}

interface AuthContextValue extends AuthState {
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signInWithGoogle: () => Promise<{ error: string | null }>;
  signOut: () => Promise<{ error: string | null }>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSupabaseAvailable, setIsSupabaseAvailable] = useState(false);

  // Check Supabase availability and get initial user
  useEffect(() => {
    const configured = isSupabaseConfigured();
    setIsSupabaseAvailable(configured);

    if (!configured) {
      setIsLoading(false);
      return;
    }

    // Get initial user
    getUser().then((user) => {
      setUser(user);
      setIsLoading(false);
    });

    // Subscribe to auth state changes
    const { unsubscribe } = onAuthStateChange((event, session) => {
      console.log('[Auth] State change:', event, session?.user?.email);
      setUser(session?.user ?? null);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const refreshUser = useCallback(async () => {
    const user = await getUser();
    setUser(user);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const { user, error } = await signInWithEmailFn(email, password);
      if (user) {
        setUser(user);
      }
      return { error };
    } finally {
      setIsLoading(false);
    }
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const { user, error } = await signUpWithEmailFn(email, password);
      if (user) {
        setUser(user);
      }
      return { error };
    } finally {
      setIsLoading(false);
    }
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setIsLoading(true);
    try {
      const { error } = await signInWithGoogleFn();
      return { error };
    } finally {
      // Don't set loading false here since we're redirecting
    }
  }, []);

  const signOutHandler = useCallback(async () => {
    setIsLoading(true);
    try {
      const { error } = await signOutFn();
      if (!error) {
        setUser(null);
      }
      return { error };
    } finally {
      setIsLoading(false);
    }
  }, []);

  const value: AuthContextValue = {
    user,
    isLoading,
    isAuthenticated: user !== null,
    isSupabaseAvailable,
    signIn,
    signUp,
    signInWithGoogle,
    signOut: signOutHandler,
    refreshUser,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
