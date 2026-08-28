import type { Metadata } from "next"
import Link from "next/link"
import { AppShell } from "@/components/app-shell"
import { StatusPanel } from "@/components/status-panel"
import { requireProfile } from "@/lib/auth"
import { loadBatchDisplayRows } from "@/lib/prediction-run-data"
import { groupPredictionRows, percentage, summarizePredictionRows } from "@/lib/prediction-runs"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Discussion & Insights" }
export const dynamic = "force-dynamic"

export default async function InsightsPage({ searchParams }: { searchParams: Promise<{ run?: string }> }) {
  const profile = await requireProfile()
  const supabase = await createClient()
  const { data: runs, error } = await supabase.from("prediction_runs").select("id,filename,valid_record_count,model_versions,completed_at,created_at").eq("status", "completed").order("completed_at", { ascending: false }).limit(100)
  if (error) return <AppShell profile={profile}><header className="page-header"><div><span className="eyebrow">Run-based interpretation</span><h1>Discussion & Insights</h1></div></header><StatusPanel title="Prediction runs unavailable" description="Apply the batch-prediction database migration before using this module." code="PREDICTION_SCHEMA_NOT_AVAILABLE" /></AppShell>
  if (!runs?.length) return <AppShell profile={profile}><header className="page-header"><div><span className="eyebrow">Run-based interpretation</span><h1>Discussion & Insights</h1><p>Academic, deterministic findings are generated only from a selected completed prediction run.</p></div></header><StatusPanel title="No completed prediction runs" description="Run and save a batch prediction before opening Discussion & Insights." code="DATA_NOT_AVAILABLE" /></AppShell>
  const query = await searchParams
  const selected = runs.find((run) => String(run.id) === query.run) ?? runs[0]
  let rows
  try { rows = await loadBatchDisplayRows(supabase, String(selected.id)) } catch { return <AppShell profile={profile}><StatusPanel title="Discussion unavailable" description="The selected run's saved results could not be loaded." code="PREDICTION_RESULTS_QUERY_FAILED" /></AppShell> }
  if (!rows.length) return <AppShell profile={profile}><StatusPanel title="No complete prediction pairs" description="The selected run has no complete pathway and NEET result pairs." code="INCOMPLETE_PREDICTION_RESULTS" /></AppShell>

  const summary = summarizePredictionRows(rows)
  const outcomes = Object.entries(summary.outcomeCounts).sort((a, b) => b[1] - a[1])
  const leading = outcomes[0]
  const least = outcomes.at(-1) ?? leading
  const strands = groupPredictionRows(rows, "strand")
  const highestNeetStrand = [...strands].sort((a, b) => percentage(b.predictedNeet, b.count) - percentage(a.predictedNeet, a.count))[0]
  const strongest = strands.flatMap((group) => Object.entries(group.outcomes).map(([outcome, count]) => ({ group: group.group, outcome, rate: percentage(count, group.count), count: group.count }))).sort((a, b) => b.rate - a.rate)[0]
  const lowConfidence = summary.confidenceCounts.Low
  const lowPreparedness = rows.filter((row) => row.preparedness <= 2)
  const versions = selected.model_versions && typeof selected.model_versions === "object" && !Array.isArray(selected.model_versions) ? selected.model_versions as Record<string, unknown> : {}

  return <AppShell profile={profile}><header className="page-header"><div><span className="eyebrow">Run-based interpretation</span><h1>Discussion & Insights</h1><p>All statements below are deterministic calculations from one saved prediction run; they do not establish causality or confirmed outcomes.</p></div><Link className="button secondary" href={`/predictions/${String(selected.id)}`}>View Results</Link></header>
    <section className="panel run-selector"><form method="get"><label htmlFor="run">Prediction Run</label><select id="run" name="run" defaultValue={String(selected.id)}>{runs.map((run) => <option key={String(run.id)} value={String(run.id)}>{String(run.filename)} — {new Date(String(run.completed_at ?? run.created_at)).toLocaleDateString("en-PH")}</option>)}</select><button className="button small">Load discussion</button></form><small>Pathway model {String(versions.pathway ?? "—")} · NEET model {String(versions.neet ?? "—")}</small></section>
    <div className="notice warning">Predicted outcomes are model-generated estimates and are not confirmed respondent outcomes.</div>
    <section className="panel"><span className="badge">Batch overview</span><h2 className="panel-heading-spaced">Batch Overview</h2><p>Of the {summary.processed.toLocaleString("en-PH")} records processed in this prediction run, <strong>{leading[0]}</strong> was the most frequently predicted pathway at {percentage(leading[1], summary.processed).toFixed(1)}% ({leading[1]} records). The separate NEET model classified {summary.predictedNeet} records as predicted NEET ({percentage(summary.predictedNeet, summary.processed).toFixed(1)}%).</p></section>
    <section className="panel"><span className="badge">Calculated findings</span><h2 className="panel-heading-spaced">Key Findings</h2><ul className="finding-list"><li>The most common predicted pathway was <strong>{leading[0]}</strong> ({percentage(leading[1], summary.processed).toFixed(1)}%).</li><li>The least common predicted pathway was <strong>{least[0]}</strong> ({percentage(least[1], summary.processed).toFixed(1)}%).</li>{strongest && <li>The largest observed within-strand pathway proportion was <strong>{strongest.outcome}</strong> among <strong>{strongest.group}</strong> records ({strongest.rate.toFixed(1)}% of {strongest.count} records in that strand). This is descriptive, not causal.</li>}<li>The NEET model classified <strong>{summary.predictedNeet}</strong> records as predicted NEET; it does not confirm their current real-world status.</li></ul></section>
    <section className="panel"><span className="badge warning">Follow-up priority</span><h2 className="panel-heading-spaced">Groups Requiring Attention</h2><ul className="finding-list"><li>{summary.predictedNeet > 0 ? `${summary.predictedNeet} records were predicted under the NEET outcome and may warrant careful follow-up verification.` : "No record in this run was classified as predicted NEET; this does not prove that the cohort has no support needs."}</li>{highestNeetStrand && <li><strong>{highestNeetStrand.group}</strong> had the highest predicted NEET proportion among represented strands at {percentage(highestNeetStrand.predictedNeet, highestNeetStrand.count).toFixed(1)}% ({highestNeetStrand.predictedNeet} of {highestNeetStrand.count}).</li>}<li>{lowPreparedness.length} records reported preparedness ratings of 1 or 2; their support needs may be reviewed without treating the rating as a cause of a predicted outcome.</li><li>{lowConfidence} pathway predictions were in the low-confidence band and should not drive individual decisions without additional evidence.</li></ul></section>
    <section className="panel"><span className="badge">Model evidence</span><h2 className="panel-heading-spaced">Prediction Reliability</h2><div className="confidence-grid"><div><span>High confidence</span><strong>{summary.confidenceCounts.High}</strong><small>≥ 80%</small></div><div><span>Medium confidence</span><strong>{summary.confidenceCounts.Medium}</strong><small>60–79.9%</small></div><div><span>Low confidence</span><strong>{summary.confidenceCounts.Low}</strong><small>&lt; 60%</small></div></div><p>These bands use the pathway model&apos;s returned maximum class probability. Low-confidence predictions should be interpreted cautiously and should not be treated as confirmed outcomes.</p></section>
    <section className="panel"><span className="badge warning">Decision support</span><h2 className="panel-heading-spaced">Institutional Considerations</h2><ul className="finding-list">{summary.predictedNeet > 0 && <li>Consider verifying the circumstances and support needs of records with predicted NEET classifications before planning targeted assistance.</li>}{lowConfidence > 0 && <li>Consider additional follow-up data collection for low-confidence records before using them for case-level guidance.</li>}{lowPreparedness.length > 0 && <li>Review career-preparation and referral support for cohorts reporting lower preparedness, without inferring that preparedness caused their predicted pathway.</li>}<li>Use these aggregate estimates alongside actual tracer outcomes, school context, and professional judgment; do not replace confirmed respondent data with predictions.</li></ul></section>
  </AppShell>
}
