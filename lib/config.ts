export const publicConfig = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "",
  powerBiReportUrl: process.env.NEXT_PUBLIC_POWER_BI_REPORT_URL?.trim() ?? "",
}

export const isSupabaseConfigured = Boolean(
  publicConfig.supabaseUrl && publicConfig.supabaseAnonKey,
)

export function requireServerSupabaseConfig() {
  if (!isSupabaseConfigured) {
    throw new Error("SUPABASE_NOT_CONFIGURED")
  }
  return {
    url: publicConfig.supabaseUrl,
    anonKey: publicConfig.supabaseAnonKey,
  }
}

export function requireServiceRoleKey() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!serviceRoleKey || !isSupabaseConfigured) {
    throw new Error("SUPABASE_SERVICE_ROLE_NOT_CONFIGURED")
  }
  return serviceRoleKey
}
