import { createClient } from "@supabase/supabase-js"
import { publicConfig, requireServiceRoleKey } from "@/lib/config"

export function createAdminClient() {
  return createClient(publicConfig.supabaseUrl, requireServiceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
