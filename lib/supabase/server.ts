import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { requireServerSupabaseConfig } from "@/lib/config"

export async function createClient() {
  const config = requireServerSupabaseConfig()
  const cookieStore = await cookies()

  return createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          )
        } catch {
          // Server Components cannot set cookies. proxy.ts refreshes sessions.
        }
      },
    },
  })
}
