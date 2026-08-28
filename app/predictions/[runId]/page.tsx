import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { AppShell } from "@/components/app-shell"
import { BatchResultsDashboard } from "@/components/batch-results-dashboard"
import { StatusPanel } from "@/components/status-panel"
import { requireProfile } from "@/lib/auth"
import { loadBatchDisplayRows } from "@/lib/prediction-run-data"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Batch Prediction Results" }
export const dynamic = "force-dynamic"

export default async function PredictionRunPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params
  const profile = await requireProfile()
  const supabase = await createClient()
  const { data: run, error } = await supabase.from("prediction_runs").select("id,filename,status,original_record_count,valid_record_count,invalid_record_count,model_versions,error_message,created_at,completed_at").eq("id", runId).maybeSingle()
  if (error || !run) notFound()
  if (run.status !== "completed") return <AppShell profile={profile}><header className="page-header"><div><span className="eyebrow">Batch prediction</span><h1>{String(run.filename)}</h1></div><Link className="button secondary" href="/predictions">Back to predictions</Link></header><StatusPanel title="Prediction results are not available" description={String(run.error_message ?? `This run is currently ${String(run.status).replaceAll("_", " ")}.`)} code="PREDICTION_RUN_NOT_COMPLETED" /></AppShell>

  let rows
  try { rows = await loadBatchDisplayRows(supabase, runId) } catch { return <AppShell profile={profile}><StatusPanel title="Prediction results unavailable" description="The saved result rows could not be loaded." code="PREDICTION_RESULTS_QUERY_FAILED" /></AppShell> }
  const versions = run.model_versions && typeof run.model_versions === "object" && !Array.isArray(run.model_versions) ? run.model_versions as Record<string, unknown> : {}
  return <AppShell profile={profile}><header className="page-header"><div><span className="eyebrow">Saved prediction run</span><h1>Batch Prediction Results</h1><p>{String(run.filename)}</p></div><Link className="button secondary" href="/predictions">Back to predictions</Link></header><section className="run-facts"><div><strong>{Number(run.original_record_count).toLocaleString("en-PH")}</strong><span>uploaded</span></div><div><strong>{Number(run.valid_record_count).toLocaleString("en-PH")}</strong><span>processed</span></div><div><strong>{Number(run.invalid_record_count).toLocaleString("en-PH")}</strong><span>excluded</span></div><div><strong>{String(versions.pathway ?? "—")}</strong><span>pathway model</span></div><div><strong>{String(versions.neet ?? "—")}</strong><span>NEET model</span></div><div><strong>{new Date(String(run.completed_at ?? run.created_at)).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" })}</strong><span>run date</span></div></section><div className="notice warning prediction-disclaimer">Prediction results are model-generated estimates and should not be interpreted as confirmed graduate outcomes.</div>{rows.length ? <BatchResultsDashboard rows={rows} /> : <StatusPanel title="No complete result pairs" description="The saved run does not contain both pathway and NEET results for any source row." code="INCOMPLETE_PREDICTION_RESULTS" />}</AppShell>
}
