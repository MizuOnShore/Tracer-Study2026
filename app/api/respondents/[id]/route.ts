import { createHash } from "node:crypto"
import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"

const schema = z.object({
  full_name: z.string().trim().min(2).max(150),
  email: z.string().trim().toLowerCase().email().max(254),
  age: z.coerce.number().int().min(14).max(100),
  graduation_year: z.coerce.number().int().min(2018).max(2025),
  certification: z.string().trim().min(1).max(200),
  subject_relevance: z.coerce.number().int().min(1).max(5),
  preparedness: z.coerce.number().int().min(1).max(5),
  challenges: z.string().trim().min(1).max(2000),
  support_needed: z.string().trim().min(1).max(2000),
  feedback: z.string().trim().min(1).max(2000),
})

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ message: "Authentication is required." }, { status: 401 })
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ message: "One or more corrected fields are invalid.", issues: parsed.error.flatten() }, { status: 422 })
  const { id } = await params
  const fingerprint = createHash("sha256").update(`${parsed.data.email}|${parsed.data.full_name.toLowerCase()}|${parsed.data.graduation_year}`).digest("hex")
  const { error } = await supabase.from("respondent_records").update({ ...parsed.data, record_fingerprint: fingerprint }).eq("id", id)
  if (error) return NextResponse.json({ message: error.code === "23505" ? "The correction would duplicate an existing graduate." : "The record could not be updated." }, { status: error.code === "23505" ? 409 : 500 })
  await supabase.from("audit_logs").insert({ actor_id: user.id, action: "respondent.updated", entity_type: "respondent_record", entity_id: id, metadata: { changed_fields: Object.keys(parsed.data) } })
  return NextResponse.json({ status: "updated" })
}
