import Link from "next/link"
import { notFound } from "next/navigation"
import { AppShell } from "@/components/app-shell"
import { RespondentEditor } from "@/components/respondent-editor"
import { requireProfile } from "@/lib/auth"
import type { RespondentRecord } from "@/lib/database.types"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export default async function RespondentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireProfile()
  const { id } = await params
  const supabase = await createClient()
  const [{ data }, { data: predictions }] = await Promise.all([
    supabase.from("respondent_records").select("*").eq("id", id).eq("source", "import").maybeSingle(),
    supabase.from("prediction_results").select("id,kind,predicted_class,probability,generated_at,model_registry(version)").eq("respondent_record_id", id).order("generated_at", { ascending: false }),
  ])
  if (!data) notFound()

  const record = data as unknown as RespondentRecord
  const canonical = record.canonical_data && typeof record.canonical_data === "object" && !Array.isArray(record.canonical_data)
    ? record.canonical_data
    : {}
  const branchDetails = Object.entries(canonical).filter(([, value]) => value !== null && value !== undefined && value !== "")

  return (
    <AppShell profile={profile}>
      <header className="page-header">
        <div><span className="eyebrow">Imported respondent detail</span><h1>{record.full_name}</h1><p>Committed import row {record.source_row_number ?? "—"} · Added {new Date(record.created_at).toLocaleString("en-PH")}</p></div>
        <Link className="button secondary" href="/respondents">Back to records</Link>
      </header>
      <section className="panel">
        <h2>Canonical tracer fields</h2>
        <div className="table-wrap"><table><tbody>{[
          ["Email", record.email],
          ["Gender", record.gender],
          ["Age", record.age],
          ["Graduation year", record.graduation_year],
          ["Strand", record.strand],
          ["Certification", record.certification],
          ["Current status", record.current_status.replaceAll("_", " ")],
          ["Subject relevance", String(record.subject_relevance) + "/5"],
          ["Preparedness", String(record.preparedness) + "/5"],
          ["Challenges", record.challenges],
          ["Support needed", record.support_needed],
          ["Feedback", record.feedback],
        ].map(([label, value]) => <tr key={String(label)}><th style={{ width: 210 }}>{label}</th><td>{String(value)}</td></tr>)}</tbody></table></div>
      </section>
      {branchDetails.length > 0 && <section className="panel"><h2>Imported pathway details</h2><div className="table-wrap"><table><tbody>{branchDetails.map(([key, value]) => <tr key={key}><th style={{ width: 250 }}>{key.replaceAll("_", " ")}</th><td>{Array.isArray(value) ? value.join(", ") : String(value)}</td></tr>)}</tbody></table></div></section>}
      <RespondentEditor record={record} />
      <section className="panel">
        <h2>Prediction history</h2>
        {predictions?.length ? <div className="table-wrap"><table><thead><tr><th>Type</th><th>Result</th><th>Probability</th><th>Generated</th></tr></thead><tbody>{predictions.map((prediction) => <tr key={String(prediction.id)}><td>{String(prediction.kind)}</td><td>{String(prediction.predicted_class)}</td><td>{(Number(prediction.probability) * 100).toFixed(1)}%</td><td>{new Date(String(prediction.generated_at)).toLocaleString("en-PH")}</td></tr>)}</tbody></table></div> : <p>No persisted predictions exist for this imported respondent.</p>}
      </section>
    </AppShell>
  )
}
