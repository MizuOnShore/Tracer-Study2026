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

type ImportOverview = {
  total_imported_records: number
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
  const [
    { data: overviewData, error },
    { data: aggregateData, error: aggregateError },
    { data: models },
    { data: batches },
    { count: committedBatchCount },
  ] = await Promise.all([
    supabase.from("analytics_import_overview").select("*").maybeSingle(),
    supabase.from("analytics_import_by_batch_strand_status").select("graduation_year,strand,current_status,respondent_count").order("graduation_year"),
    supabase.from("model_registry").select("kind,version,status,activated_at").eq("status", "active"),
    supabase.from("import_batches").select("id,original_file_name,status,total_rows,created_at").order("created_at", { ascending: false }).limit(5),
    supabase.from("import_batches").select("id", { count: "exact", head: true }).eq("status", "committed"),
  ])

  const overview = overviewData as ImportOverview | null
  const total = Number(overview?.total_imported_records ?? 0)
  const summary = summarizeAggregateRows((aggregateData ?? []) as AggregateRow[])
  const aggregateMismatch = !aggregateError && total !== summary.total
  const averageSubjectRelevance = nullableNumber(overview?.average_subject_relevance)
  const averagePreparedness = nullableNumber(overview?.average_preparedness)

  return (
    <AppShell profile={profile}>
      <header className="page-header">
        <div>
          <span className="eyebrow">Imported dataset overview</span>
          <h1>CSV graduate outcomes dashboard</h1>
          <p>Every table, chart, percentage, and average below uses committed file-import records only. Public website survey submissions are excluded.</p>
        </div>
        <div className="header-actions">
          <Link className="button" href="/imports">Import CSV</Link>
          <Link className="button secondary" href="/analytics">Detailed import analytics</Link>
        </div>
      </header>

      {error ? (
        <StatusPanel title="Import analytics query unavailable" description="The database did not return the import-only aggregate overview. Apply the latest Supabase migration and check the service connection." code="IMPORT_ANALYTICS_QUERY_FAILED" />
      ) : total === 0 ? (
        <StatusPanel title="No committed import data available" description="Upload, validate, and commit a CSV or XLSX tracer file. Website survey submissions do not populate this dashboard." code="IMPORTED_DATA_NOT_AVAILABLE">
          <p><Link className="button small" href="/imports">Open import module</Link></p>
        </StatusPanel>
      ) : (
        <>
          <section className="metric-grid" aria-label="Imported respondent totals">
            <Metric label="Imported respondents" value={total} detail="Committed CSV/XLSX rows" />
            <Metric label="Committed files" value={Number(committedBatchCount ?? 0)} detail="Import batches included" />
            <Metric label="Employed" value={Number(overview?.employed ?? 0)} detail={formatShare(Number(overview?.employed ?? 0), total) + " of imported respondents"} />
            <Metric label="NEET" value={Number(overview?.neet ?? 0)} detail={formatShare(Number(overview?.neet ?? 0), total) + " of imported respondents"} tone={Number(overview?.neet ?? 0) > 0 ? "risk" : undefined} />
          </section>

          {aggregateError ? (
            <StatusPanel title="Import charts unavailable" description="The import overview loaded, but the grouped import analytics view did not. Apply the latest Supabase migration." code="IMPORT_ANALYTICS_GROUP_QUERY_FAILED" />
          ) : aggregateMismatch ? (
            <StatusPanel title="Import analytics totals do not reconcile" description="The import overview and grouped import views returned different totals. Charts are hidden until the database views are consistent." code="IMPORT_ANALYTICS_RECONCILIATION_FAILED" />
          ) : (
            <>
              <DashboardVisualizations summary={summary} committedBatches={Number(committedBatchCount ?? 0)} averageSubjectRelevance={averageSubjectRelevance} averagePreparedness={averagePreparedness} />
              <section className="panel">
                <div className="section-heading">
                  <div><h2>Imported outcomes by graduation year</h2><p>Survey responses are excluded. Counts reconcile with the import-only charts above.</p></div>
                  <Link className="button secondary small" href="/analytics">Open detailed analytics</Link>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Batch</th><th>Total</th><th>Higher education</th><th>Employed</th><th>Self employed</th><th>Training</th><th>NEET</th><th>NEET share</th></tr></thead>
                    <tbody>{summary.cohorts.map((row) => <tr key={row.graduation_year}><td><strong>{row.graduation_year}</strong></td><td>{row.total.toLocaleString("en-PH")}</td><td>{row.higher_education}</td><td>{row.employed}</td><td>{row.self_employed}</td><td>{row.training}</td><td>{row.neet}</td><td>{formatShare(row.neet, row.total)}</td></tr>)}</tbody>
                    <tfoot><tr><th>All imported batches</th><th>{summary.total.toLocaleString("en-PH")}</th>{summary.outcomes.map((item) => <th key={item.key}>{item.count.toLocaleString("en-PH")}</th>)}<th>{formatShare(Number(overview?.neet ?? 0), total)}</th></tr></tfoot>
                  </table>
                </div>
              </section>
            </>
          )}
        </>
      )}

      <section className="panel">
        <h2>Prediction readiness</h2>
        <p>Production prediction is enabled only when a finalized model version is active.</p>
        {models?.length ? <div className="table-wrap"><table><thead><tr><th>Model</th><th>Version</th><th>Status</th></tr></thead><tbody>{models.map((model) => <tr key={String(model.kind)}><td>{String(model.kind).toUpperCase()}</td><td>{String(model.version)}</td><td><span className="badge success">Active</span></td></tr>)}</tbody></table></div> : <div className="notice warning"><code>MODEL_NOT_AVAILABLE</code> No active pathway or NEET model has been registered. Predictions are disabled.</div>}
      </section>

      <section className="panel">
        <h2>Recent CSV/XLSX import batches</h2>
        <p>Only batches marked committed contribute records to the dashboard above.</p>
        {batches?.length ? <div className="table-wrap"><table><thead><tr><th>File</th><th>Training batch ID</th><th>Rows</th><th>Status</th><th>Created</th></tr></thead><tbody>{batches.map((batch) => <tr key={String(batch.id)}><td>{String(batch.original_file_name)}</td><td><code>{String(batch.id)}</code></td><td>{Number(batch.total_rows)}</td><td><span className={batch.status === "committed" ? "badge success" : "badge warning"}>{String(batch.status)}</span></td><td>{new Date(String(batch.created_at)).toLocaleString("en-PH")}</td></tr>)}</tbody></table></div> : <p>No import batches exist.</p>}
      </section>
    </AppShell>
  )
}

function Metric({ label, value, detail, tone }: { label: string; value: number; detail: string; tone?: "risk" }) {
  return <article className={tone ? "metric-card risk" : "metric-card"}><span>{label}</span><strong>{value.toLocaleString("en-PH")}</strong><small>{detail}</small></article>
}

function formatShare(value: number, total: number) {
  return (total ? (value / total) * 100 : 0).toFixed(1) + "%"
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}
