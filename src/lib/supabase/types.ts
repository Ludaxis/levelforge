/**
 * Game types supported by the storage system
 */
export type GameType = 'fruit-match' | 'hexa-block' | 'square-block';

/**
 * Database schema types for Supabase
 */
export interface Database {
  public: {
    Tables: {
      level_collections: {
        Row: DbLevelCollection;
        Insert: Omit<DbLevelCollection, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<DbLevelCollection, 'id'>>;
      };
      levels: {
        Row: DbLevel;
        Insert: Omit<DbLevel, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<DbLevel, 'id'>>;
      };
      shared_collections: {
        Row: DbSharedCollection;
        Insert: Omit<DbSharedCollection, 'id' | 'created_at' | 'updated_at' | 'view_count'>;
        Update: Partial<Omit<DbSharedCollection, 'id'>>;
      };
    };
  };
}

/**
 * Database row type for level_collections table
 */
export interface DbLevelCollection {
  id: string;
  device_id: string | null;
  user_id: string | null;
  game_type: GameType;
  created_at: string;
  updated_at: string;
}

/**
 * Database row type for levels table
 */
export interface DbLevel {
  id: string;
  collection_id: string;
  level_number: number;
  level_data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/**
 * Database row type for shared_collections table
 */
export interface DbSharedCollection {
  id: string;
  collection_id: string;
  share_code: string;
  title: string | null;
  description: string | null;
  is_public: boolean;
  view_count: number;
  created_at: string;
  updated_at: string;
}
