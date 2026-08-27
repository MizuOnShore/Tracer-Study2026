import type { Metadata } from "next"
import { AppShell } from "@/components/app-shell"
import { StatusPanel } from "@/components/status-panel"
import { requireProfile } from "@/lib/auth"
import { publicConfig } from "@/lib/config"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Analytics" }
export const dynamic = "force-dynamic"

type AggregateRow = { graduation_year: number; strand: string; current_status: string; respondent_count: number }

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ year?: string; strand?: string; status?: string }> }) {
  const profile = await requireProfile()
  const filters = await searchParams
  const supabase = await createClient()
  let query = supabase.from("analytics_by_batch_strand_status").select("graduation_year,strand,current_status,respondent_count")
  if (filters.year) query = query.eq("graduation_year", Number(filters.year))
  if (filters.strand) query = query.eq("strand", filters.strand)
  if (filters.status) query = query.eq("current_status", filters.status)
  const { data, error } = await query.order("graduation_year").order("strand")
  const rows = (data ?? []) as AggregateRow[]
  const reportUrl = /^https:\/\//.test(publicConfig.powerBiReportUrl) ? publicConfig.powerBiReportUrl : ""

  return <AppShell profile={profile}>
    <header className="page-header"><div><span className="eyebrow">Descriptive analytics</span><h1>Graduate outcomes analytics</h1><p>Filters are applied in the database query. The accessible table and Power BI report use aggregate data only.</p></div></header>
    <section className="panel"><h2>Filters</h2><form className="field-grid" method="get"><div className="field"><label htmlFor="year">Graduation year</label><select id="year" name="year" defaultValue={filters.year ?? ""}><option value="">All years</option>{[2018,2019,2020,2021,2022,2023,2024,2025].map((year) => <option key={year}>{year}</option>)}</select></div><div className="field"><label htmlFor="strand">Strand</label><select id="strand" name="strand" defaultValue={filters.strand ?? ""}><option value="">All strands</option>{["ABM","GAS","HUMMS","ICT","STEM","SPORTS","TVL"].map((strand) => <option key={strand}>{strand}</option>)}</select></div><div className="field"><label htmlFor="status">Status</label><select id="status" name="status" defaultValue={filters.status ?? ""}><option value="">All statuses</option><option value="higher_education">Higher education</option><option value="employed">Employed</option><option value="self_employed">Self employed</option><option value="training">Training</option><option value="neet">NEET</option></select></div><div className="field" style={{ alignSelf: "end" }}><button className="button" type="submit">Apply filters</button></div></form></section>
    {error ? <StatusPanel title="Analytics unavailable" description="The aggregate query failed. Check that the database views in the Supabase migration were applied." code="ANALYTICS_QUERY_FAILED" /> : rows.length === 0 ? <StatusPanel title="No results for these filters" description="No persisted respondent records match the current year, strand, and status filters." code="DATA_NOT_AVAILABLE" /> : <section className="panel"><h2>Aggregate source table</h2><p>This table is the verified fallback and reconciliation source for Power BI.</p><div className="table-wrap"><table><thead><tr><th>Graduation year</th><th>Strand</th><th>Primary status</th><th>Respondents</th></tr></thead><tbody>{rows.map((row) => <tr key={`${row.graduation_year}-${row.strand}-${row.current_status}`}><td>{row.graduation_year}</td><td>{row.strand}</td><td>{row.current_status.replaceAll("_", " ")}</td><td>{Number(row.respondent_count)}</td></tr>)}</tbody></table></div></section>}
    <section className="panel"><h2>Power BI decision dashboard</h2>{reportUrl && rows.length ? <iframe title="DJIHS aggregate tracer analytics in Power BI" src={reportUrl} style={{ width: "100%", minHeight: 620, border: "1px solid var(--slate-200)" }} allowFullScreen /> : <div className="notice info"><code>{rows.length ? "POWER_BI_NOT_CONFIGURED" : "DATA_NOT_AVAILABLE"}</code> {rows.length ? "Add a real Power BI report URL after connecting the report to the aggregate Supabase views. No substitute chart is fabricated here." : "Power BI remains unavailable until valid tracer records exist."}</div>}</section>
  </AppShell>
}
