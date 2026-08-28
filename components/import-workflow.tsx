"use client"

import Link from "next/link"
import { useState } from "react"
import { useRouter } from "next/navigation"

type Issue = { row_number: number | null; column_name: string | null; severity: "error" | "warning"; code: string; message: string }
type Preview = { batch_id: string; status: string; total_rows: number; valid_rows: number; invalid_rows: number; issues: Issue[]; preview: Array<{ row_number: number; is_valid: boolean; data: Record<string, unknown> }>; resumed?: boolean }
type CommittedBatch = { id: string; records: number }

export function ImportWorkflow() {
  const router = useRouter()
  const [preview, setPreview] = useState<Preview | null>(null)
  const [message, setMessage] = useState("")
  const [committedBatch, setCommittedBatch] = useState<CommittedBatch | null>(null)
  const [busy, setBusy] = useState(false)

  async function validate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setMessage("")
    setPreview(null)
    setCommittedBatch(null)
    const response = await fetch("/api/imports", { method: "POST", body: new FormData(event.currentTarget) }).catch(() => null)
    const result = response ? await response.json().catch(() => ({})) : {}
    if (!response?.ok) setMessage(String(result.message ?? "The file could not be validated."))
    else setPreview(result as Preview)
    setBusy(false)
  }

  async function commit() {
    if (!preview) return
    setBusy(true)
    setMessage("")
    const batchId = preview.batch_id
    const response = await fetch("/api/imports/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batch_id: batchId }),
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) {
      setMessage(String(result.message ?? "Commit failed; no rows were saved."))
    } else {
      const records = Number(result.committed_records)
      setMessage(records + " records committed successfully.")
      setCommittedBatch({ id: batchId, records })
      setPreview(null)
      router.refresh()
    }
    setBusy(false)
  }

  return (
    <>
      <section className="panel">
        <h2>Upload tracer file</h2>
        <p>CSV or XLSX only, maximum 10 MB. Uploading validates and stages the file; dashboard charts update only after you commit all validated rows.</p>
        <form onSubmit={validate}>
          <div className="field">
            <label className="required" htmlFor="import-file">Tracer data file</label>
            <input id="import-file" name="file" type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required />
          </div>
          <div className="form-actions">
            <button className="button" disabled={busy} type="submit">{busy ? "Checking file…" : "Upload and validate"}</button>
            <a className="button secondary" href="/api/imports/template">Download column template</a>
          </div>
        </form>
      </section>

      {message && <div className={committedBatch ? "notice success" : "notice error"} role="status"><span>{message}</span>{committedBatch && <Link className="button small" href="/dashboard">View updated dashboard</Link>}</div>}

      {committedBatch && (
        <section className="panel">
          <span className="badge success">Committed training source</span>
          <h2 className="panel-heading-spaced">Static model training source ready</h2>
          <p>The stored original file is now the authoritative training source for this batch. The offline command downloads it privately and verifies SHA-256 before training.</p>
          <dl className="detail-list">
            <div><dt>Batch ID</dt><dd><code>{committedBatch.id}</code></dd></div>
            <div><dt>Committed rows</dt><dd>{committedBatch.records.toLocaleString("en-PH")}</dd></div>
          </dl>
          <p className="privacy-note">First generate Elbow diagnostics:</p>
          <code className="command-block">npm run train:import -- --batch-id {committedBatch.id} --version YYYY-MM-DD.1</code>
          <p className="privacy-note">After reviewing SSE and selecting k:</p>
          <code className="command-block">npm run train:import -- --batch-id {committedBatch.id} --version YYYY-MM-DD.1 --k SELECTED_K</code>
          <div className="notice info">Training remains manual and does not activate a model. Review held-out metrics and cluster profiles before registration or activation.</div>
        </section>
      )}

      {preview && (
        <section className="panel">
          <h2>Validation preview</h2>
          <div className="metric-grid">
            <Metric label="Rows" value={preview.total_rows} />
            <Metric label="Valid" value={preview.valid_rows} />
            <Metric label="Invalid" value={preview.invalid_rows} />
            <Metric label="Issues shown" value={preview.issues.length} />
          </div>
          {preview.resumed && <div className="notice warning"><strong>Previous upload restored.</strong> This exact file was already validated, so its existing batch is shown instead of creating a duplicate upload.</div>}
          <div className="notice info"><strong>Validation is not the final import.</strong> Review the results, then select <strong>Commit validated records</strong> to persist the rows and update dashboard charts.</div>
          {preview.issues.length > 0 && <div className="table-wrap"><table><thead><tr><th>Row</th><th>Column</th><th>Severity</th><th>Issue</th></tr></thead><tbody>{preview.issues.map((issue, index) => <tr key={[issue.code, issue.row_number, index].join("-")}><td>{issue.row_number ?? "File"}</td><td>{issue.column_name ?? "—"}</td><td><span className={issue.severity === "error" ? "badge error" : "badge warning"}>{issue.severity}</span></td><td>{issue.message}</td></tr>)}</tbody></table></div>}
          <div className="form-actions">
            <button className="button" type="button" disabled={busy || preview.status !== "validated" || preview.invalid_rows > 0} onClick={commit}>Commit validated records</button>
            {preview.invalid_rows > 0 && <span className="privacy-note">Commit is disabled because one or more rows are invalid. Correct the source file and upload it again.</span>}
          </div>
        </section>
      )}
    </>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return <article className="metric-card"><span>{label}</span><strong>{value}</strong></article>
}
