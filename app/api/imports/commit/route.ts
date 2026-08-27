import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"

const schema = z.object({ batch_id: z.string().uuid() })

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ message: "Authentication is required." }, { status: 401 })
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ message: "A valid batch ID is required." }, { status: 422 })
  const { data, error } = await supabase.rpc("commit_import_batch", { target_batch_id: parsed.data.batch_id })
  if (error) {
    const duplicate = error.code === "23505"
    return NextResponse.json({ code: duplicate ? "DUPLICATE_RECORD" : "COMMIT_FAILED", message: duplicate ? "Commit was rolled back because a graduate already exists." : error.message }, { status: duplicate ? 409 : 422 })
  }
  return NextResponse.json({ status: "committed", committed_records: data })
}
