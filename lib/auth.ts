import { cache } from "react"
import { redirect } from "next/navigation"
import { isSupabaseConfigured } from "@/lib/config"
import type { AppRole, Profile } from "@/lib/database.types"
import { createClient } from "@/lib/supabase/server"

export const getSessionProfile = cache(async (): Promise<Profile | null> => {
  if (!isSupabaseConfigured) return null
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from("profiles")
    .select("id,email,full_name,role,status,created_at,updated_at")
    .eq("id", user.id)
    .maybeSingle()

  return data as Profile | null
})

export async function requireProfile(allowedRoles: AppRole[] = ["admin", "user"]) {
  const profile = await getSessionProfile()
  if (!profile) redirect("/login?reason=authentication_required")
  if (profile.status !== "active") redirect("/login?reason=account_inactive")
  if (!allowedRoles.includes(profile.role)) redirect("/dashboard?reason=forbidden")
  return profile
}
