import type { Metadata } from "next"
import Link from "next/link"
import { AppShell } from "@/components/app-shell"
import { BatchPredictionWorkflow } from "@/components/batch-prediction-workflow"
import { StatusPanel } from "@/components/status-panel"
import { requireProfile } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Batch Predictions" }
export const dynamic = "force-dynamic"

export default async function PredictionsPage() {
  const profile = await requireProfile()
  const supabase = await createClient()
  const [{ data: models }, { data: history, error: historyError }] = await Promise.all([
    supabase.from("model_registry").select("kind,version,status").eq("status", "active"),
    supabase.from("prediction_runs").select("id,filename,status,original_record_count,valid_record_count,invalid_record_count,model_versions,error_message,created_at,completed_at").order("created_at", { ascending: false }).limit(50),
  ])
  const kinds = (models ?? []).map((model) => String(model.kind))
  const modelsReady = kinds.includes("pathway") && kinds.includes("neet")
  return <AppShell profile={profile}><header className="page-header"><div><span className="eyebrow">Batch-level decision support</span><h1>Batch Predictions</h1><p>Validate an inference-only dataset, explicitly run the active static models, and preserve each completed analysis as a separate prediction run.</p></div></header><div className="notice info prediction-disclaimer">Prediction uploads do not alter actual respondent records. Predicted outcomes are model-generated estimates and are not confirmed respondent outcomes.</div>{historyError ? <StatusPanel title="Batch predictions unavailable" description="Apply the batch-prediction database migration before using this module." code="PREDICTION_SCHEMA_NOT_AVAILABLE" /> : <><BatchPredictionWorkflow modelsReady={modelsReady} /><section className="panel"><h2>Prediction History</h2>{history?.length ? <div className="table-wrap"><table><thead><tr><th>Filename</th><th>Date</th><th>Validated records</th><th>Model</th><th>Status</th><th>Action</th></tr></thead><tbody>{history.map((run) => { const versions = run.model_versions && typeof run.model_versions === "object" && !Array.isArray(run.model_versions) ? run.model_versions as Record<string, unknown> : {}; return <tr key={String(run.id)}><td>{String(run.filename)}</td><td>{new Date(String(run.completed_at ?? run.created_at)).toLocaleString("en-PH")}</td><td>{Number(run.valid_record_count).toLocaleString("en-PH")} / {Number(run.original_record_count).toLocaleString("en-PH")}</td><td>{versions.pathway ? `Pathway ${String(versions.pathway)} · NEET ${String(versions.neet ?? "—")}` : "Not run"}</td><td><span className={`badge ${run.status === "completed" ? "success" : run.status === "failed" || run.status === "validation_failed" ? "error" : "warning"}`}>{String(run.status).replaceAll("_", " ")}</span>{run.error_message ? <small className="table-error">{String(run.error_message)}</small> : null}</td><td>{run.status === "completed" ? <Link className="button secondary small" href={`/predictions/${String(run.id)}`}>View Results</Link> : "—"}</td></tr>})}</tbody></table></div> : <p>No prediction runs have been created yet.</p>}</section></>}</AppShell>
}
