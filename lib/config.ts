export const publicConfig = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "",
  powerBiReportUrl: process.env.NEXT_PUBLIC_POWER_BI_REPORT_URL?.trim() ?? "",
}

export const isSupabaseConfigured = Boolean(
  publicConfig.supabaseUrl && publicConfig.supabaseAnonKey,
)

export const isSurveySubmissionConfigured = Boolean(
  isSupabaseConfigured
  && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  && (process.env.SURVEY_RATE_LIMIT_SECRET?.trim().length ?? 0) >= 32,
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

export function requireSurveyRateLimitSecret() {
  const secret = process.env.SURVEY_RATE_LIMIT_SECRET?.trim()
  if (!secret || secret.length < 32) {
    throw new Error("SURVEY_RATE_LIMIT_SECRET_NOT_CONFIGURED")
  }
  return secret
}
