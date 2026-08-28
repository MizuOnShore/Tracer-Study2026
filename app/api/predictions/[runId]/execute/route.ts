import { NextResponse } from "next/server"
import { batchServiceResponseSchema, buildModelInput, pathwayDisplayLabel, summarizePredictionRows, type BatchDisplayRow } from "@/lib/prediction-runs"
import { createClient } from "@/lib/supabase/server"

export const maxDuration = 300

type StagedRow = { source_row: number; normalized_data: Record<string, unknown> }

async function markFailed(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, runId: string, stage: string, message: string) {
  await supabase.from("prediction_runs").update({ status: "failed", error_message: message, completed_at: new Date().toISOString() }).eq("id", runId)
  await supabase.from("audit_logs").insert({ actor_id: userId, action: "prediction.failed", entity_type: "prediction_run", entity_id: runId, metadata: { stage } })
}

export async function POST(_request: Request, context: { params: Promise<{ runId: string }> }) {
  const { runId } = await context.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ message: "Authentication is required." }, { status: 401 })

  const [{ data: run }, { data: profile }] = await Promise.all([
    supabase.from("prediction_runs").select("id,status,uploaded_by,valid_record_count").eq("id", runId).maybeSingle(),
    supabase.from("profiles").select("role,status").eq("id", user.id).maybeSingle(),
  ])
  if (!run) return NextResponse.json({ message: "Prediction run not found." }, { status: 404 })
  if (String(run.uploaded_by) !== user.id && profile?.role !== "admin") return NextResponse.json({ message: "You cannot execute this prediction run." }, { status: 403 })
  if (run.status !== "validated" || Number(run.valid_record_count) < 1) return NextResponse.json({ message: "Only a validated run with valid rows can be processed." }, { status: 409 })

  const serviceUrl = process.env.ML_SERVICE_URL?.trim()
  const serviceToken = process.env.ML_SERVICE_TOKEN?.trim()
  if (!serviceUrl || !serviceToken) {
    await markFailed(supabase, user.id, runId, "service_configuration", "Prediction service is not configured.")
    return NextResponse.json({ code: "ML_SERVICE_NOT_CONFIGURED", message: "Prediction service is not configured. The dataset was not processed." }, { status: 503 })
  }

  const { data: modelRows, error: modelError } = await supabase.from("model_registry")
    .select("id,kind,version,status").eq("status", "active").in("kind", ["pathway", "neet"])
  if (modelError) {
    await markFailed(supabase, user.id, runId, "model_registry", "Active model versions could not be verified.")
    return NextResponse.json({ code: "MODEL_REGISTRY_UNAVAILABLE", message: "Active model versions could not be verified." }, { status: 503 })
  }
  const models = Object.fromEntries((modelRows ?? []).map((model) => [String(model.kind), { id: String(model.id), version: String(model.version) }])) as Record<string, { id: string; version: string }>
  if (!models.pathway || !models.neet) {
    await markFailed(supabase, user.id, runId, "active_models", "Both active pathway and NEET models are required.")
    return NextResponse.json({ code: "MODEL_NOT_AVAILABLE", message: "Both active pathway and NEET models are required for a batch prediction." }, { status: 503 })
  }

  const { data: lockedRun, error: lockError } = await supabase.from("prediction_runs")
    .update({ status: "processing", started_at: new Date().toISOString(), error_message: null })
    .eq("id", runId).eq("status", "validated").select("id").maybeSingle()
  if (lockError || !lockedRun) return NextResponse.json({ message: "This prediction run has already started or could not be locked." }, { status: 409 })
  await supabase.from("audit_logs").insert({ actor_id: user.id, action: "prediction.started", entity_type: "prediction_run", entity_id: runId, metadata: { valid_rows: Number(run.valid_record_count), models: { pathway: models.pathway.version, neet: models.neet.version } } })

  const stagedRows: StagedRow[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("prediction_staged_rows")
      .select("source_row,normalized_data").eq("prediction_run_id", runId).eq("is_valid", true)
      .order("source_row").range(from, from + 999)
    if (error) {
      await markFailed(supabase, user.id, runId, "staged_rows", "Validated rows could not be loaded.")
      return NextResponse.json({ code: "PREDICTION_ROWS_UNAVAILABLE", message: "Validated rows could not be loaded. No result was saved." }, { status: 500 })
    }
    stagedRows.push(...(data ?? []).map((row) => ({ source_row: Number(row.source_row), normalized_data: row.normalized_data as Record<string, unknown> })))
    if (!data || data.length < 1000) break
  }
  if (stagedRows.length !== Number(run.valid_record_count)) {
    await markFailed(supabase, user.id, runId, "row_count", "The persisted valid-row count did not match validation.")
    return NextResponse.json({ code: "PREDICTION_ROW_COUNT_MISMATCH", message: "The validated row count changed. No prediction was saved." }, { status: 409 })
  }

  const servicePredictions: Array<ReturnType<typeof batchServiceResponseSchema.parse>["predictions"][number]> = []
  for (let index = 0; index < stagedRows.length; index += 250) {
    const chunk = stagedRows.slice(index, index + 250)
    let response: Response
    try {
      response = await fetch(`${serviceUrl.replace(/\/$/, "")}/predict/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceToken}` },
        body: JSON.stringify({
          expected_model_versions: { pathway: models.pathway.version, neet: models.neet.version },
          records: chunk.map((row) => ({ source_row: row.source_row, record: buildModelInput(row.normalized_data) })),
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(60_000),
      })
    } catch {
      await markFailed(supabase, user.id, runId, "service_connection", "Prediction service was unavailable or timed out.")
      return NextResponse.json({ code: "ML_SERVICE_UNAVAILABLE", message: "Prediction service is temporarily unavailable. Your dataset was not processed. Please try again." }, { status: 503 })
    }
    if (!response.ok) {
      await markFailed(supabase, user.id, runId, "service_response", `Prediction service returned HTTP ${response.status}.`)
      const code = response.status === 401 ? "ML_SERVICE_UNAUTHORIZED" : "MODEL_INFERENCE_FAILED"
      return NextResponse.json({ code, message: response.status === 401 ? "The prediction service rejected the server request. Contact an administrator." : "The active models could not complete batch inference. No results were saved." }, { status: 502 })
    }
    const parsed = batchServiceResponseSchema.safeParse(await response.json().catch(() => null))
    if (!parsed.success || parsed.data.model_versions.pathway !== models.pathway.version || parsed.data.model_versions.neet !== models.neet.version || parsed.data.predictions.length !== chunk.length) {
      await markFailed(supabase, user.id, runId, "response_validation", "Prediction service returned an incomplete or incompatible response.")
      return NextResponse.json({ code: "INVALID_MODEL_RESPONSE", message: "The prediction service returned an incomplete response. No results were saved." }, { status: 502 })
    }
    const expectedRows = new Set(chunk.map((row) => row.source_row))
    if (new Set(parsed.data.predictions.map((item) => item.source_row)).size !== chunk.length || parsed.data.predictions.some((item) => !expectedRows.has(item.source_row))) {
      await markFailed(supabase, user.id, runId, "response_rows", "Prediction response rows did not match the validated input rows.")
      return NextResponse.json({ code: "INVALID_MODEL_RESPONSE_ROWS", message: "Prediction response rows did not match the validated dataset. No results were saved." }, { status: 502 })
    }
    servicePredictions.push(...parsed.data.predictions)
  }

  const stagedByRow = new Map(stagedRows.map((row) => [row.source_row, row.normalized_data]))
  const displayRows: BatchDisplayRow[] = servicePredictions.map((item) => {
    const input = stagedByRow.get(item.source_row) ?? {}
    return {
      sourceRow: item.source_row, sourceIdentifier: `Record ${item.source_row - 1}`,
      graduationYear: Number(input.graduation_year), strand: String(input.strand ?? ""), gender: String(input.gender ?? ""),
      certification: String(input.certification ?? ""), preparedness: Number(input.preparedness),
      predictedOutcome: pathwayDisplayLabel(item.pathway.predicted_class, item.pathway.interpreted_label),
      confidence: item.pathway.probability, pathwayClass: item.pathway.predicted_class,
      neetPredicted: item.neet.predicted_class === "NEET", neetProbability: item.neet.probability,
    }
  })
  const resultRows = servicePredictions.flatMap((item) => {
    const inputSnapshot = buildModelInput(stagedByRow.get(item.source_row) ?? {})
    const sourceIdentifier = `Record ${item.source_row - 1}`
    return [
      { model_id: models.pathway.id, kind: "pathway", source_row: item.source_row, source_identifier: sourceIdentifier, interpreted_label: item.pathway.interpreted_label ?? null, predicted_class: item.pathway.predicted_class, probability: item.pathway.probability, class_probabilities: item.pathway.class_probabilities, factor_associations: null, input_snapshot: inputSnapshot },
      { model_id: models.neet.id, kind: "neet", source_row: item.source_row, source_identifier: sourceIdentifier, interpreted_label: null, predicted_class: item.neet.predicted_class, probability: item.neet.probability, class_probabilities: item.neet.class_probabilities, factor_associations: item.neet.factor_associations, input_snapshot: inputSnapshot },
    ]
  })
  const summary = summarizePredictionRows(displayRows)
  const { data: inserted, error: persistenceError } = await supabase.rpc("complete_prediction_run", {
    target_run_id: runId,
    result_rows: resultRows,
    completed_model_versions: { pathway: models.pathway.version, neet: models.neet.version },
    completed_summary: summary,
  })
  if (persistenceError || Number(inserted) !== resultRows.length) {
    await markFailed(supabase, user.id, runId, "result_persistence", "Inference completed, but its atomic database save failed.")
    return NextResponse.json({ code: "PREDICTION_PERSISTENCE_FAILED", message: "Inference completed, but the complete result could not be saved. It is not presented as a completed run." }, { status: 500 })
  }
  return NextResponse.json({ run_id: runId, status: "completed", processed_records: displayRows.length })
}
