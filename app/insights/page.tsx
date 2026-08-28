import type { Metadata } from "next"
import { AppShell } from "@/components/app-shell"
import { StatusPanel } from "@/components/status-panel"
import { requireProfile } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Discussion and insights" }
export const dynamic = "force-dynamic"

type Overview = Record<string, number | null>

export default async function InsightsPage() {
  const profile = await requireProfile()
  const supabase = await createClient()
  const [{ data: overviewData, error }, { data: clusters }, { data: activeModels }] = await Promise.all([
    supabase.from("analytics_import_overview").select("*").maybeSingle(),
    supabase.from("cluster_profiles").select("cluster_id,interpreted_label,profile,model_registry!inner(version,status)").eq("model_registry.status", "active"),
    supabase.from("model_registry").select("id,kind,version,status,training_record_count").eq("status", "active"),
  ])
  const overview = overviewData as Overview | null
  const total = Number(overview?.total_imported_records ?? 0)
  const statuses = ["employed", "higher_education", "self_employed", "training", "neet"]
  const leading = statuses.map((key) => [key, Number(overview?.[key] ?? 0)] as const).sort((a, b) => b[1] - a[1])[0]
  return <AppShell profile={profile}><header className="page-header"><div><span className="eyebrow">Interpretation workspace</span><h1>Discussion and insights</h1><p>All descriptive findings use committed import records only. Model outputs and recommendations are not presented as causal conclusions.</p></div></header>{error ? <StatusPanel title="Insights unavailable" description="The import-only aggregate source query failed." code="ANALYTICS_QUERY_FAILED" /> : total === 0 ? <StatusPanel title="No evidence available for discussion" description="Insights are withheld until real tracer records are imported, validated, and committed." code="DATA_NOT_AVAILABLE" /> : <>
    <section className="panel"><span className="badge">Descriptive finding</span><h2 style={{ marginTop: 12 }}>Recorded primary status</h2><p>Among {total} imported respondents, the largest recorded primary-status group is <strong>{leading[0].replaceAll("_", " ")}</strong> with {leading[1]} respondent{leading[1] === 1 ? "" : "s"} ({((leading[1] / total) * 100).toFixed(1)}%). This describes the available imported data and does not establish a population rate or a cause.</p></section>
    <section className="panel"><span className="badge">Descriptive finding</span><h2 style={{ marginTop: 12 }}>Preparation ratings</h2><p>The mean subject-relevance rating is <strong>{Number(overview?.average_subject_relevance ?? 0).toFixed(2)}/5</strong>, and the mean preparedness rating is <strong>{Number(overview?.average_preparedness ?? 0).toFixed(2)}/5</strong>. These are recorded ratings from committed import rows.</p></section>
    <section className="panel"><span className="badge warning">Predictive interpretation</span><h2 style={{ marginTop: 12 }}>Data-driven employability pathways</h2>{clusters?.length ? <div className="table-wrap"><table><thead><tr><th>Cluster ID</th><th>Approved interpretation</th><th>Stored profile</th></tr></thead><tbody>{clusters.map((cluster) => <tr key={String(cluster.cluster_id)}><td>{Number(cluster.cluster_id)}</td><td>{cluster.interpreted_label ? String(cluster.interpreted_label) : "Interpretation pending"}</td><td><code>{JSON.stringify(cluster.profile)}</code></td></tr>)}</tbody></table></div> : <p><code>MODEL_NOT_AVAILABLE</code> No active pathway model with reviewed cluster profiles exists. The system does not substitute hardcoded pathway names.</p>}</section>
    <section className="panel"><span className="badge warning">Recommendation</span><h2 style={{ marginTop: 12 }}>School review priorities</h2><p>{Number(overview?.neet ?? 0) > 0 ? `Review support needs and barriers recorded for the ${Number(overview?.neet)} imported respondent(s) currently classified as NEET, while protecting individual confidentiality.` : "Continue importing representative tracer records before prioritizing interventions from these data."} This is a decision-support recommendation, not a causal finding.</p></section>
    <section className="panel"><h2>Model evidence state</h2>{activeModels?.length ? <p>{activeModels.length} active model version(s) are registered. Model-specific performance must be read from held-out test metrics in the registry before interpreting predictions.</p> : <p><code>MODEL_NOT_AVAILABLE</code> No predictive findings are available.</p>}</section>
  </>}</AppShell>
}
