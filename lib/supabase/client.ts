"use client"

import { createBrowserClient } from "@supabase/ssr"
import { requireServerSupabaseConfig } from "@/lib/config"

export function createClient() {
  const config = requireServerSupabaseConfig()
  return createBrowserClient(config.url, config.anonKey)
}
