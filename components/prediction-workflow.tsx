"use client"

import { useState } from "react"

type Respondent = { id: string; full_name: string; graduation_year: number; strand: string }
type Result = { kind: "pathway" | "neet"; model_version: string; predicted_class: string; interpreted_label?: string | null; probability: number; class_probabilities: Record<string, number>; factor_associations: Array<Record<string, unknown>> | null; prediction_id: string }

export function PredictionWorkflow({ respondents, availableKinds }: { respondents: Respondent[]; availableKinds: string[] }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [result, setResult] = useState<Result | null>(null)
  async function predict(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(""); setResult(null)
    const form = new FormData(event.currentTarget)
    const response = await fetch("/api/predictions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ respondent_id: form.get("respondent_id"), kind: form.get("kind") }) })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) setMessage(String(body.message ?? "Prediction failed."))
    else setResult(body as Result)
    setBusy(false)
  }
  return <>
    <section className="panel"><h2>Generate from a persisted respondent</h2><p>The server loads the active registered model version and saves only a validated inference response.</p><form onSubmit={predict}><div className="field-grid"><div className="field"><label className="required" htmlFor="respondent_id">Respondent</label><select id="respondent_id" name="respondent_id" defaultValue="" required><option value="" disabled>Select a respondent</option>{respondents.map((item) => <option key={item.id} value={item.id}>{item.full_name} · {item.graduation_year} · {item.strand}</option>)}</select></div><div className="field"><label className="required" htmlFor="kind">Prediction type</label><select id="kind" name="kind" defaultValue="" required><option value="" disabled>Select type</option><option value="pathway" disabled={!availableKinds.includes("pathway")}>Employability pathway{!availableKinds.includes("pathway") ? " — unavailable" : ""}</option><option value="neet" disabled={!availableKinds.includes("neet")}>NEET risk{!availableKinds.includes("neet") ? " — unavailable" : ""}</option></select></div></div><div className="form-actions"><button className="button" disabled={busy || !respondents.length || !availableKinds.length}>{busy ? "Running verified model…" : "Generate prediction"}</button></div></form></section>
    {message && <div className="notice error" role="alert">{message}</div>}
    {result && <section className="panel"><span className="badge success">Persisted prediction</span><h2 style={{ marginTop: 12 }}>{result.kind === "pathway" ? (result.interpreted_label || `Cluster ${result.predicted_class} — interpretation pending`) : result.predicted_class}</h2><p>Confidence / NEET probability: <strong>{(result.probability * 100).toFixed(1)}%</strong> · Model version {result.model_version}</p><div className="table-wrap"><table><thead><tr><th>Class</th><th>Probability</th></tr></thead><tbody>{Object.entries(result.class_probabilities).map(([label, probability]) => <tr key={label}><td>{result.kind === "pathway" ? `Cluster ${label}` : label}</td><td>{(probability * 100).toFixed(1)}%</td></tr>)}</tbody></table></div>{result.factor_associations?.length ? <><h3 style={{ marginTop: 22 }}>Model factor associations</h3><p className="privacy-note">These contributions explain this model output. They are associations, not causes.</p><div className="table-wrap"><table><thead><tr><th>Encoded feature</th><th>Direction</th><th>Contribution</th></tr></thead><tbody>{result.factor_associations.map((factor, index) => <tr key={index}><td>{String(factor.encoded_feature)}</td><td>{String(factor.direction)}</td><td>{Number(factor.contribution).toFixed(4)}</td></tr>)}</tbody></table></div></> : null}<p className="privacy-note">Prediction record: {result.prediction_id}</p></section>}
  </>
}
