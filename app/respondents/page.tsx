import type { Metadata } from "next"
import Link from "next/link"
import { AppShell } from "@/components/app-shell"
import { StatusPanel } from "@/components/status-panel"
import { requireProfile } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Respondent records" }
export const dynamic = "force-dynamic"

export default async function RespondentsPage({ searchParams }: { searchParams: Promise<{ q?: string; year?: string; strand?: string; status?: string }> }) {
  const profile = await requireProfile()
  const filters = await searchParams
  const supabase = await createClient()
  let query = supabase.from("respondent_records").select("id,full_name,email,graduation_year,strand,current_status,source,created_at", { count: "exact" })
  const search = (filters.q ?? "").trim().replace(/[%_]/g, "")
  if (search) query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`)
  if (filters.year) query = query.eq("graduation_year", Number(filters.year))
  if (filters.strand) query = query.eq("strand", filters.strand)
  if (filters.status) query = query.eq("current_status", filters.status)
  const { data, count, error } = await query.order("created_at", { ascending: false }).limit(100)
  return <AppShell profile={profile}><header className="page-header"><div><span className="eyebrow">Record search and management</span><h1>Respondent records</h1><p>Personally identifiable fields are available only to active authorized accounts and are not exposed by public routes.</p></div></header><section className="panel"><h2>Search and filter</h2><form method="get" className="field-grid"><div className="field full"><label htmlFor="q">Name or email</label><input id="q" name="q" defaultValue={filters.q} maxLength={150} /></div><div className="field"><label htmlFor="year">Year</label><select id="year" name="year" defaultValue={filters.year ?? ""}><option value="">All</option>{[2018,2019,2020,2021,2022,2023,2024,2025].map((year) => <option key={year}>{year}</option>)}</select></div><div className="field"><label htmlFor="strand">Strand</label><select id="strand" name="strand" defaultValue={filters.strand ?? ""}><option value="">All</option>{["ABM","GAS","HUMMS","ICT","STEM","SPORTS","TVL"].map((strand) => <option key={strand}>{strand}</option>)}</select></div><div className="field"><label htmlFor="status">Status</label><select id="status" name="status" defaultValue={filters.status ?? ""}><option value="">All</option>{["higher_education","employed","self_employed","training","neet"].map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select></div><div className="field" style={{ alignSelf: "end" }}><button className="button" type="submit">Search records</button></div></form></section>{error ? <StatusPanel title="Records unavailable" description="The respondent query failed." code="RESPONDENT_QUERY_FAILED" /> : !data?.length ? <StatusPanel title="No matching records" description="No persisted respondent records match the current filters." code="DATA_NOT_AVAILABLE" /> : <section className="panel"><h2>{count ?? data.length} matching record{count === 1 ? "" : "s"}</h2><div className="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Batch</th><th>Strand</th><th>Status</th><th>Source</th><th></th></tr></thead><tbody>{data.map((row) => <tr key={String(row.id)}><td>{String(row.full_name)}</td><td>{String(row.email)}</td><td>{Number(row.graduation_year)}</td><td>{String(row.strand)}</td><td>{String(row.current_status).replaceAll("_", " ")}</td><td><span className="badge">{String(row.source)}</span></td><td><Link className="button secondary small" href={`/respondents/${row.id}`}>View</Link></td></tr>)}</tbody></table></div>{Number(count) > 100 && <p className="privacy-note">Showing the first 100 results. Narrow the filters to locate a specific record.</p>}</section>}</AppShell>
}
