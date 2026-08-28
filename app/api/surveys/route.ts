import { createHmac } from "node:crypto"
import { NextResponse } from "next/server"
import { isSupabaseConfigured, requireSurveyRateLimitSecret } from "@/lib/config"
import { createAdminClient } from "@/lib/supabase/admin"
import { surveySchema } from "@/lib/survey-schema"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  if (!isSupabaseConfigured) {
    return NextResponse.json(
      { code: "DATA_STORE_NOT_CONFIGURED", message: "Survey submission is unavailable until Supabase is configured." },
      { status: 503 },
    )
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0)
  if (declaredLength > 65_536) {
    return NextResponse.json({ code: "REQUEST_TOO_LARGE", message: "The survey request is too large." }, { status: 413 })
  }

  let body: unknown
  try {
    const rawBody = await request.text()
    if (rawBody.length > 65_536) {
      return NextResponse.json({ code: "REQUEST_TOO_LARGE", message: "The survey request is too large." }, { status: 413 })
    }
    body = JSON.parse(rawBody)
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

  let supabase
  let throttleHash
  try {
    supabase = createAdminClient()
    const forwarded = request.headers.get("x-vercel-forwarded-for")
      ?? request.headers.get("x-forwarded-for")
      ?? "local-or-unknown"
    const clientAddress = forwarded.split(",")[0].trim()
    throttleHash = createHmac("sha256", requireSurveyRateLimitSecret()).update(clientAddress).digest("hex")
  } catch {
    return NextResponse.json(
      { code: "SURVEY_SERVICE_NOT_CONFIGURED", message: "Survey submission is unavailable until its server-side security settings are configured." },
      { status: 503 },
    )
  }

  const { data, error } = await supabase.rpc("submit_tracer_survey", {
    payload: parsed.data,
    submission_ip_hash: throttleHash,
  })

  if (error) {
    const rateLimited = error.message.includes("SURVEY_RATE_LIMIT_EXCEEDED")
    const duplicate = error.code === "23505" || error.message.includes("already exists")
    return NextResponse.json(
      {
        code: rateLimited ? "RATE_LIMITED" : duplicate ? "DUPLICATE_SUBMISSION" : "SUBMISSION_FAILED",
        message: rateLimited
          ? "Too many survey submissions were attempted from this connection. Please wait 10 minutes and try again."
          : duplicate
          ? "A response for this graduate has already been recorded. Contact the school if it must be corrected."
          : "The response could not be saved. No success was recorded; please try again.",
      },
      { status: rateLimited ? 429 : duplicate ? 409 : 500 },
    )
  }

  return NextResponse.json({ response_id: data, status: "stored" }, { status: 201 })
}
