"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

type Issue = { row_number: number | null; column_name: string | null; severity: "error" | "warning"; code: string; message: string }
type Preview = { batch_id: string; status: string; total_rows: number; valid_rows: number; invalid_rows: number; issues: Issue[]; preview: Array<{ row_number: number; is_valid: boolean; data: Record<string, unknown> }> }

export function ImportWorkflow() {
  const router = useRouter()
  const [preview, setPreview] = useState<Preview | null>(null)
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)

  async function validate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true); setMessage(""); setPreview(null)
    const response = await fetch("/api/imports", { method: "POST", body: new FormData(event.currentTarget) }).catch(() => null)
    const result = response ? await response.json().catch(() => ({})) : {}
    if (!response?.ok) setMessage(String(result.message ?? "The file could not be validated."))
    else setPreview(result as Preview)
    setBusy(false)
  }

  async function commit() {
    if (!preview) return
    setBusy(true); setMessage("")
    const response = await fetch("/api/imports/commit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ batch_id: preview.batch_id }) })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) setMessage(String(result.message ?? "Commit failed; no rows were saved."))
    else { setMessage(`${result.committed_records} records committed successfully.`); setPreview(null); router.refresh() }
    setBusy(false)
  }

  return <>
    <section className="panel"><h2>Upload tracer file</h2><p>CSV or XLSX only, maximum 10 MB. The original file is stored privately before validation.</p><form onSubmit={validate}><div className="field"><label className="required" htmlFor="import-file">Tracer data file</label><input id="import-file" name="file" type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required /></div><div className="form-actions"><button className="button" disabled={busy} type="submit">{busy ? "Checking file…" : "Upload and validate"}</button><a className="button secondary" href="/api/imports/template">Download column template</a></div></form></section>
    {message && <div className={`notice ${message.includes("successfully") ? "success" : "error"}`} role="status">{message}</div>}
    {preview && <section className="panel"><h2>Validation preview</h2><div className="metric-grid"><Metric label="Rows" value={preview.total_rows} /><Metric label="Valid" value={preview.valid_rows} /><Metric label="Invalid" value={preview.invalid_rows} /><Metric label="Issues shown" value={preview.issues.length} /></div>{preview.issues.length > 0 && <div className="table-wrap"><table><thead><tr><th>Row</th><th>Column</th><th>Severity</th><th>Issue</th></tr></thead><tbody>{preview.issues.map((issue, index) => <tr key={`${issue.code}-${issue.row_number}-${index}`}><td>{issue.row_number ?? "File"}</td><td>{issue.column_name ?? "—"}</td><td><span className={`badge ${issue.severity === "error" ? "error" : "warning"}`}>{issue.severity}</span></td><td>{issue.message}</td></tr>)}</tbody></table></div>}<div className="form-actions"><button className="button" type="button" disabled={busy || preview.status !== "validated" || preview.invalid_rows > 0} onClick={commit}>Commit validated records</button>{preview.invalid_rows > 0 && <span className="privacy-note">Commit is disabled because one or more rows are invalid. Correct the source file and upload it again.</span>}</div></section>}
  </>
}

function Metric({ label, value }: { label: string; value: number }) { return <article className="metric-card"><span>{label}</span><strong>{value}</strong></article> }
