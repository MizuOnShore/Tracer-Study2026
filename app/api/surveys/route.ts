import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { isSupabaseConfigured, publicConfig } from "@/lib/config"
import { surveySchema } from "@/lib/survey-schema"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  if (!isSupabaseConfigured) {
    return NextResponse.json(
      { code: "DATA_STORE_NOT_CONFIGURED", message: "Survey submission is unavailable until Supabase is configured." },
      { status: 503 },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ code: "INVALID_JSON", message: "The request body is not valid JSON." }, { status: 400 })
  }

  const parsed = surveySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { code: "VALIDATION_FAILED", message: "Please correct the marked fields.", issues: parsed.error.flatten() },
      { status: 422 },
    )
  }

  const supabase = createClient(publicConfig.supabaseUrl, publicConfig.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await supabase.rpc("submit_tracer_survey", { payload: parsed.data })

  if (error) {
    const duplicate = error.code === "23505" || error.message.includes("already exists")
    return NextResponse.json(
      {
        code: duplicate ? "DUPLICATE_SUBMISSION" : "SUBMISSION_FAILED",
        message: duplicate
          ? "A response for this graduate has already been recorded. Contact the school if it must be corrected."
          : "The response could not be saved. No success was recorded; please try again.",
      },
      { status: duplicate ? 409 : 500 },
    )
  }

  return NextResponse.json({ response_id: data, status: "stored" }, { status: 201 })
}
