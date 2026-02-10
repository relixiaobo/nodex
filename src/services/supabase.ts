/**
 * Supabase 客户端初始化
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let supabaseInstance: SupabaseClient | null = null;

/**
 * 初始化 Supabase 客户端。在应用启动时调用一次。
 */
export function initSupabase(url: string, anonKey: string): SupabaseClient {
  supabaseInstance = createClient(url, anonKey);
  return supabaseInstance;
}

/**
 * 获取 Supabase 客户端实例。必须在 initSupabase 之后调用。
 */
export function getSupabase(): SupabaseClient {
  if (!supabaseInstance) {
    throw new Error('Supabase not initialized. Call initSupabase() first.');
  }
  return supabaseInstance;
}

/**
 * 重置 Supabase 客户端（降级到离线模式）。
 */
export function resetSupabase(): void {
  supabaseInstance = null;
}

/**
 * 检查 Supabase 是否已初始化。用于判断是否应尝试远程操作。
 */
export function isSupabaseReady(): boolean {
  return supabaseInstance !== null;
}
