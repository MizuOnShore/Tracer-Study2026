import type { Metadata } from "next"
import Link from "next/link"
import { AppShell } from "@/components/app-shell"
import { StatusPanel } from "@/components/status-panel"
import { requireProfile } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Overview" }
export const dynamic = "force-dynamic"

type Overview = {
  total_respondents: number
  survey_responses: number
  imported_records: number
  employed: number
  higher_education: number
  self_employed: number
  training: number
  neet: number
  average_subject_relevance: number | null
  average_preparedness: number | null
}

export default async function DashboardPage() {
  const profile = await requireProfile()
  const supabase = await createClient()
  const [{ data: overviewData, error }, { data: models }, { data: batches }] = await Promise.all([
    supabase.from("analytics_overview").select("*").maybeSingle(),
    supabase.from("model_registry").select("kind,version,status,activated_at").eq("status", "active"),
    supabase.from("import_batches").select("id,original_file_name,status,total_rows,created_at").order("created_at", { ascending: false }).limit(5),
  ])
  const overview = overviewData as Overview | null
  const total = Number(overview?.total_respondents ?? 0)

  return (
    <AppShell profile={profile}>
      <header className="page-header"><div><span className="eyebrow">System overview</span><h1>Graduate outcomes workspace</h1><p>Counts below are queried from persisted respondent records. They are not seeded or estimated.</p></div></header>
      {error ? <StatusPanel title="Analytics query unavailable" description="The database did not return the aggregate overview. Check the migration and service connection." code="ANALYTICS_QUERY_FAILED" /> : total === 0 ? <StatusPanel title="No tracer data available" description="Import a validated tracer file or collect alumni survey responses before analytics and model development can begin." code="DATA_NOT_AVAILABLE"><p><Link className="button small" href="/imports">Open import module</Link></p></StatusPanel> : <>
        <section className="metric-grid" aria-label="Respondent totals">
          <Metric label="Total respondents" value={total} />
          <Metric label="Survey responses" value={Number(overview?.survey_responses ?? 0)} />
          <Metric label="Imported records" value={Number(overview?.imported_records ?? 0)} />
          <Metric label="NEET" value={Number(overview?.neet ?? 0)} />
        </section>
        <section className="panel"><h2>Current pathway distribution</h2><p>Descriptive counts based on each graduate&apos;s recorded primary current status.</p><div className="table-wrap"><table><thead><tr><th>Status</th><th>Count</th><th>Share</th></tr></thead><tbody>{[
          ["Employed", overview?.employed], ["Higher education", overview?.higher_education], ["Self employed", overview?.self_employed], ["Training", overview?.training], ["NEET", overview?.neet],
        ].map(([label, count]) => <tr key={String(label)}><td>{label}</td><td>{Number(count ?? 0)}</td><td>{((Number(count ?? 0) / total) * 100).toFixed(1)}%</td></tr>)}</tbody></table></div></section>
      </>}

      <section className="panel"><h2>Prediction readiness</h2><p>Production prediction is enabled only when a finalized model version is active.</p>{models?.length ? <div className="table-wrap"><table><thead><tr><th>Model</th><th>Version</th><th>Status</th></tr></thead><tbody>{models.map((model) => <tr key={String(model.kind)}><td>{String(model.kind).toUpperCase()}</td><td>{String(model.version)}</td><td><span className="badge success">Active</span></td></tr>)}</tbody></table></div> : <div className="notice warning"><code>MODEL_NOT_AVAILABLE</code> No active pathway or NEET model has been registered. Predictions are disabled.</div>}</section>

      <section className="panel"><h2>Recent import batches</h2>{batches?.length ? <div className="table-wrap"><table><thead><tr><th>File</th><th>Rows</th><th>Status</th><th>Created</th></tr></thead><tbody>{batches.map((batch) => <tr key={String(batch.id)}><td>{String(batch.original_file_name)}</td><td>{Number(batch.total_rows)}</td><td><span className={`badge ${batch.status === "committed" ? "success" : "warning"}`}>{String(batch.status)}</span></td><td>{new Date(String(batch.created_at)).toLocaleString("en-PH")}</td></tr>)}</tbody></table></div> : <p>No import batches exist.</p>}</section>
    </AppShell>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return <article className="metric-card"><span>{label}</span><strong>{value.toLocaleString("en-PH")}</strong></article>
}
