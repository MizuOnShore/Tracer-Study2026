import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"

const requestSchema = z.object({ respondent_id: z.string().uuid(), kind: z.enum(["pathway", "neet"]) })
const resultSchema = z.object({
  kind: z.enum(["pathway", "neet"]),
  model_version: z.string(),
  predicted_class: z.string(),
  interpreted_label: z.string().nullable().optional(),
  probability: z.number().min(0).max(1),
  class_probabilities: z.record(z.number().min(0).max(1)),
  threshold: z.number().min(0).max(1).optional(),
  factor_associations: z.array(z.record(z.unknown())).nullable(),
})

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ message: "Authentication is required." }, { status: 401 })
  const parsed = requestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ message: "Select a valid respondent and prediction type." }, { status: 422 })

  const [{ data: model }, { data: record }] = await Promise.all([
    supabase.from("model_registry").select("id,kind,version,status").eq("kind", parsed.data.kind).eq("status", "active").maybeSingle(),
    supabase.from("respondent_records").select("id,gender,age,graduation_year,strand,certification,current_status,subject_relevance,preparedness,canonical_data").eq("id", parsed.data.respondent_id).maybeSingle(),
  ])
  if (!model) return NextResponse.json({ code: "MODEL_NOT_AVAILABLE", message: `No active ${parsed.data.kind} model is registered. No prediction was generated.` }, { status: 503 })
  if (!record) return NextResponse.json({ code: "RESPONDENT_NOT_FOUND", message: "The respondent record is unavailable." }, { status: 404 })
  const serviceUrl = process.env.ML_SERVICE_URL?.trim()
  if (!serviceUrl) return NextResponse.json({ code: "ML_SERVICE_NOT_CONFIGURED", message: "The model service is not configured. No prediction was generated." }, { status: 503 })

  const canonical = record.canonical_data && typeof record.canonical_data === "object" && !Array.isArray(record.canonical_data)
    ? record.canonical_data as Record<string, unknown>
    : {}
  const approvedBranchFeatures = [
    "higher_education_relation", "employment_relation", "business_relation",
    "training_relation", "actively_seeking",
  ]
  const input = {
    ...Object.fromEntries(approvedBranchFeatures.map((key) => [key, canonical[key] ?? null])),
    gender: record.gender, age: record.age, graduation_year: record.graduation_year,
    strand: record.strand, certification: record.certification, current_status: record.current_status,
    subject_relevance: record.subject_relevance, preparedness: record.preparedness,
  }
  let serviceResponse: Response
  try {
    serviceResponse = await fetch(`${serviceUrl.replace(/\/$/, "")}/predict/${parsed.data.kind}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(process.env.ML_SERVICE_TOKEN ? { Authorization: `Bearer ${process.env.ML_SERVICE_TOKEN}` } : {}) },
      body: JSON.stringify({ expected_model_version: model.version, record: input }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    return NextResponse.json({ code: "ML_SERVICE_UNAVAILABLE", message: "The model service could not be reached. No prediction was generated." }, { status: 503 })
  }
  if (!serviceResponse.ok) {
    return NextResponse.json({ code: "MODEL_INFERENCE_FAILED", message: "The registered model could not complete inference. No result was saved." }, { status: 502 })
  }
  const prediction = resultSchema.safeParse(await serviceResponse.json().catch(() => null))
  if (!prediction.success || prediction.data.model_version !== model.version || prediction.data.kind !== parsed.data.kind) {
    return NextResponse.json({ code: "INVALID_MODEL_RESPONSE", message: "The inference response did not match the active model contract. No result was saved." }, { status: 502 })
  }

  const { data: saved, error } = await supabase.from("prediction_results").insert({
    respondent_record_id: record.id,
    model_id: model.id,
    kind: parsed.data.kind,
    predicted_class: prediction.data.predicted_class,
    probability: prediction.data.probability,
    class_probabilities: prediction.data.class_probabilities,
    factor_associations: prediction.data.factor_associations,
    input_snapshot: input,
    generated_by: user.id,
  }).select("id,generated_at").single()
  if (error || !saved) return NextResponse.json({ code: "PREDICTION_PERSISTENCE_FAILED", message: "Inference completed but the result could not be persisted, so it is not presented as a completed prediction." }, { status: 500 })
  await supabase.from("audit_logs").insert({ actor_id: user.id, action: "prediction.generated", entity_type: "prediction_result", entity_id: saved.id, metadata: { kind: parsed.data.kind, model_version: model.version, respondent_id: record.id } })
  return NextResponse.json({ ...prediction.data, prediction_id: saved.id, generated_at: saved.generated_at })
}
