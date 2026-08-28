import type { Metadata } from "next"
import Link from "next/link"
import { AppShell } from "@/components/app-shell"
import { DashboardVisualizations } from "@/components/dashboard-visualizations"
import { StatusPanel } from "@/components/status-panel"
import { requireProfile } from "@/lib/auth"
import { summarizeAggregateRows, type AggregateRow } from "@/lib/dashboard-analytics"
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
  const [{ data: overviewData, error }, { data: aggregateData, error: aggregateError }, { data: models }, { data: batches }] = await Promise.all([
    supabase.from("analytics_overview").select("*").maybeSingle(),
    supabase.from("analytics_by_batch_strand_status").select("graduation_year,strand,current_status,respondent_count").order("graduation_year"),
    supabase.from("model_registry").select("kind,version,status,activated_at").eq("status", "active"),
    supabase.from("import_batches").select("id,original_file_name,status,total_rows,created_at").order("created_at", { ascending: false }).limit(5),
  ])
  const overview = overviewData as Overview | null
  const total = Number(overview?.total_respondents ?? 0)
  const summary = summarizeAggregateRows((aggregateData ?? []) as AggregateRow[])
  const aggregateMismatch = !aggregateError && total !== summary.total
  const averageSubjectRelevance = nullableNumber(overview?.average_subject_relevance)
  const averagePreparedness = nullableNumber(overview?.average_preparedness)

  return (
    <AppShell profile={profile}>
      <header className="page-header"><div><span className="eyebrow">System overview</span><h1>Graduate outcomes dashboard</h1><p>Every table and chart is calculated from committed respondent records. No demo values or fallback statistics are displayed.</p></div><div className="header-actions"><Link className="button" href="/imports">Import data</Link><Link className="button secondary" href="/analytics">Detailed analytics</Link></div></header>
      {error ? <StatusPanel title="Analytics query unavailable" description="The database did not return the aggregate overview. Check the migration and service connection." code="ANALYTICS_QUERY_FAILED" /> : total === 0 ? <StatusPanel title="No tracer data available" description="Import a validated tracer file or collect alumni survey responses before analytics and model development can begin." code="DATA_NOT_AVAILABLE"><p><Link className="button small" href="/imports">Open import module</Link></p></StatusPanel> : <>
        <section className="metric-grid" aria-label="Respondent totals">
          <Metric label="Total respondents" value={total} detail="Committed records" />
          <Metric label="Imported records" value={Number(overview?.imported_records ?? 0)} detail={`${((Number(overview?.imported_records ?? 0) / total) * 100).toFixed(1)}% of respondents`} />
          <Metric label="Survey responses" value={Number(overview?.survey_responses ?? 0)} detail={`${((Number(overview?.survey_responses ?? 0) / total) * 100).toFixed(1)}% of respondents`} />
          <Metric label="NEET" value={Number(overview?.neet ?? 0)} detail={`${((Number(overview?.neet ?? 0) / total) * 100).toFixed(1)}% of respondents`} tone={Number(overview?.neet ?? 0) > 0 ? "risk" : undefined} />
        </section>
        {aggregateError ? <StatusPanel title="Detailed charts unavailable" description="The overview loaded, but the grouped analytics view did not. Apply the current database migration before using dashboard charts." code="ANALYTICS_GROUP_QUERY_FAILED" /> : aggregateMismatch ? <StatusPanel title="Analytics totals do not reconcile" description="The overview and grouped analytics views returned different totals. Charts are hidden until the database views are consistent." code="ANALYTICS_RECONCILIATION_FAILED" /> : <>
          <DashboardVisualizations summary={summary} importedRecords={Number(overview?.imported_records ?? 0)} surveyResponses={Number(overview?.survey_responses ?? 0)} averageSubjectRelevance={averageSubjectRelevance} averagePreparedness={averagePreparedness} />
          <section className="panel"><div className="section-heading"><div><h2>Outcome table by graduation year</h2><p>Counts reconcile with the charts above and support exact panel review.</p></div><Link className="button secondary small" href="/analytics">Filter full analytics</Link></div><div className="table-wrap"><table><thead><tr><th>Batch</th><th>Total</th><th>Higher education</th><th>Employed</th><th>Self employed</th><th>Training</th><th>NEET</th><th>NEET share</th></tr></thead><tbody>{summary.cohorts.map((row) => <tr key={row.graduation_year}><td><strong>{row.graduation_year}</strong></td><td>{row.total.toLocaleString("en-PH")}</td><td>{row.higher_education}</td><td>{row.employed}</td><td>{row.self_employed}</td><td>{row.training}</td><td>{row.neet}</td><td>{row.total ? ((row.neet / row.total) * 100).toFixed(1) : "0.0"}%</td></tr>)}</tbody><tfoot><tr><th>All batches</th><th>{summary.total.toLocaleString("en-PH")}</th>{summary.outcomes.map((item) => <th key={item.key}>{item.count.toLocaleString("en-PH")}</th>)}<th>{((Number(overview?.neet ?? 0) / total) * 100).toFixed(1)}%</th></tr></tfoot></table></div></section>
        </>}
      </>}

      <section className="panel"><h2>Prediction readiness</h2><p>Production prediction is enabled only when a finalized model version is active.</p>{models?.length ? <div className="table-wrap"><table><thead><tr><th>Model</th><th>Version</th><th>Status</th></tr></thead><tbody>{models.map((model) => <tr key={String(model.kind)}><td>{String(model.kind).toUpperCase()}</td><td>{String(model.version)}</td><td><span className="badge success">Active</span></td></tr>)}</tbody></table></div> : <div className="notice warning"><code>MODEL_NOT_AVAILABLE</code> No active pathway or NEET model has been registered. Predictions are disabled.</div>}</section>

      <section className="panel"><h2>Recent import batches</h2>{batches?.length ? <div className="table-wrap"><table><thead><tr><th>File</th><th>Rows</th><th>Status</th><th>Created</th></tr></thead><tbody>{batches.map((batch) => <tr key={String(batch.id)}><td>{String(batch.original_file_name)}</td><td>{Number(batch.total_rows)}</td><td><span className={`badge ${batch.status === "committed" ? "success" : "warning"}`}>{String(batch.status)}</span></td><td>{new Date(String(batch.created_at)).toLocaleString("en-PH")}</td></tr>)}</tbody></table></div> : <p>No import batches exist.</p>}</section>
    </AppShell>
  )
}

function Metric({ label, value, detail, tone }: { label: string; value: number; detail: string; tone?: "risk" }) {
  return <article className={`metric-card${tone ? ` ${tone}` : ""}`}><span>{label}</span><strong>{value.toLocaleString("en-PH")}</strong><small>{detail}</small></article>
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}
