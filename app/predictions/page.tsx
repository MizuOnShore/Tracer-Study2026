import type { Metadata } from "next"
import { AppShell } from "@/components/app-shell"
import { PredictionWorkflow } from "@/components/prediction-workflow"
import { StatusPanel } from "@/components/status-panel"
import { requireProfile } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Predictions" }
export const dynamic = "force-dynamic"

export default async function PredictionsPage() {
  const profile = await requireProfile()
  const supabase = await createClient()
  const [{ data: respondents }, { data: models }, { data: history }] = await Promise.all([
    supabase.from("respondent_records").select("id,full_name,graduation_year,strand").eq("source", "import").order("full_name").limit(500),
    supabase.from("model_registry").select("kind,version,status").eq("status", "active"),
    supabase.from("prediction_results").select("id,kind,predicted_class,probability,generated_at,respondent_records!inner(full_name,source),model_registry(version)").eq("respondent_records.source", "import").order("generated_at", { ascending: false }).limit(25),
  ])
  const kinds = (models ?? []).map((model) => String(model.kind))
  return <AppShell profile={profile}><header className="page-header"><div><span className="eyebrow">Static model inference</span><h1>Pathway and NEET predictions</h1><p>Only imported respondents are eligible. Pathway clusters are data-driven, NEET is a separate binary logistic-regression output, and committing records never triggers retraining.</p></div></header>{!respondents?.length ? <StatusPanel title="No imported respondents available" description="A committed import record is required before prediction." code="DATA_NOT_AVAILABLE" /> : !kinds.length ? <StatusPanel title="No active models" description="Train the committed import batch offline, review its evidence, register the artifacts, then explicitly activate an approved version. Predictions remain disabled." code="MODEL_NOT_AVAILABLE" /> : <PredictionWorkflow respondents={respondents.map((row) => ({ id: String(row.id), full_name: String(row.full_name), graduation_year: Number(row.graduation_year), strand: String(row.strand) }))} availableKinds={kinds} />}<section className="panel"><h2>Recent imported-record predictions</h2>{history?.length ? <div className="table-wrap"><table><thead><tr><th>Generated</th><th>Type</th><th>Class</th><th>Probability</th></tr></thead><tbody>{history.map((row) => <tr key={String(row.id)}><td>{new Date(String(row.generated_at)).toLocaleString("en-PH")}</td><td>{String(row.kind)}</td><td>{String(row.predicted_class)}</td><td>{(Number(row.probability) * 100).toFixed(1)}%</td></tr>)}</tbody></table></div> : <p>No imported-record prediction results have been persisted.</p>}</section></AppShell>
}
