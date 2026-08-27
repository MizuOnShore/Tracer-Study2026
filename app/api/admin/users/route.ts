import { NextResponse } from "next/server"
import { z } from "zod"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

const createUserSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  full_name: z.string().trim().min(2).max(150),
  role: z.enum(["admin", "user"]),
  password: z.string().min(12).max(128),
})

async function authorizeAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from("profiles").select("role,status").eq("id", user.id).maybeSingle()
  return profile?.role === "admin" && profile?.status === "active" ? user : null
}

export async function POST(request: Request) {
  const actor = await authorizeAdmin()
  if (!actor) return NextResponse.json({ message: "Administrator access is required." }, { status: 403 })

  const parsed = createUserSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ message: "Invalid account details.", issues: parsed.error.flatten() }, { status: 422 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: { full_name: parsed.data.full_name },
  })
  if (error || !data.user) {
    return NextResponse.json({ message: "The account could not be created." }, { status: 400 })
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: data.user.id,
    email: parsed.data.email,
    full_name: parsed.data.full_name,
    role: parsed.data.role,
    status: "active",
  })
  if (profileError) {
    await admin.auth.admin.deleteUser(data.user.id)
    return NextResponse.json({ message: "Account creation was rolled back because its profile could not be saved." }, { status: 500 })
  }

  await admin.from("audit_logs").insert({
    actor_id: actor.id,
    action: "user.created",
    entity_type: "profile",
    entity_id: data.user.id,
    metadata: { role: parsed.data.role },
  })
  return NextResponse.json({ id: data.user.id }, { status: 201 })
}

const updateUserSchema = z.object({
  id: z.string().uuid(),
  full_name: z.string().trim().min(2).max(150).optional(),
  role: z.enum(["admin", "user"]).optional(),
  status: z.enum(["active", "inactive"]).optional(),
}).refine((value) => value.full_name || value.role || value.status, "No changes supplied.")

export async function PATCH(request: Request) {
  const actor = await authorizeAdmin()
  if (!actor) return NextResponse.json({ message: "Administrator access is required." }, { status: 403 })
  const parsed = updateUserSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ message: "Invalid account update." }, { status: 422 })
  if (parsed.data.id === actor.id && parsed.data.status === "inactive") {
    return NextResponse.json({ message: "You cannot deactivate your own active session." }, { status: 409 })
  }

  const { id, ...updates } = parsed.data
  const admin = createAdminClient()
  const { error } = await admin.from("profiles").update(updates).eq("id", id)
  if (error) return NextResponse.json({ message: "The account could not be updated." }, { status: 500 })
  await admin.from("audit_logs").insert({
    actor_id: actor.id,
    action: "user.updated",
    entity_type: "profile",
    entity_id: id,
    metadata: { changed_fields: Object.keys(updates) },
  })
  return NextResponse.json({ status: "updated" })
}
