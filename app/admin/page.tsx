import type { Metadata } from "next"
import { AppShell } from "@/components/app-shell"
import { UserManagement } from "@/components/user-management"
import { requireProfile } from "@/lib/auth"
import type { Profile } from "@/lib/database.types"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "User management" }
export const dynamic = "force-dynamic"

export default async function AdminPage() {
  const profile = await requireProfile(["admin"])
  const supabase = await createClient()
  const { data } = await supabase.from("profiles").select("id,email,full_name,role,status,created_at,updated_at").order("created_at")
  return <AppShell profile={profile}><header className="page-header"><div><span className="eyebrow">Administration</span><h1>User management</h1><p>Create and maintain only the accounts authorized to access private school records and analytical functions.</p></div></header><UserManagement users={(data ?? []) as Profile[]} currentUserId={profile.id} /></AppShell>
}
