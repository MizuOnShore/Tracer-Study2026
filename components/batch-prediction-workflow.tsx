"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useRef, useState } from "react"
import { AlertTriangle, CheckCircle2, FileSpreadsheet, UploadCloud } from "lucide-react"

type Issue = { row_number: number | null; column_name: string | null; severity: "error" | "warning"; code: string; message: string }
type Validation = {
  run_id: string; status: string; filename: string; file_size: number; total_rows: number; valid_rows: number;
  invalid_rows: number; duplicate_rows: number; missing_rows: number; issues: Issue[]
}

function bytes(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

export function BatchPredictionWorkflow({ modelsReady }: { modelsReady: boolean }) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [validating, setValidating] = useState(false)
  const [running, setRunning] = useState(false)
  const [message, setMessage] = useState("")
  const [validation, setValidation] = useState<Validation | null>(null)
  const [showIssues, setShowIssues] = useState(false)

  function choose(selected?: File | null) {
    if (!selected) return
    setFile(selected); setValidation(null); setMessage(""); setShowIssues(false)
  }

  async function validate() {
    if (!file) return
    setValidating(true); setMessage(""); setValidation(null)
    const form = new FormData(); form.set("file", file)
    const response = await fetch("/api/predictions/validate", { method: "POST", body: form })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) setMessage(String(body.message ?? "The dataset could not be validated."))
    else { setValidation(body as Validation); router.refresh() }
    setValidating(false)
  }

  async function runPrediction() {
    if (!validation?.run_id) return
    setRunning(true); setMessage("")
    const response = await fetch(`/api/predictions/${validation.run_id}/execute`, { method: "POST" })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) { setMessage(String(body.message ?? "Batch prediction failed.")); setRunning(false); router.refresh(); return }
    router.push(`/predictions/${validation.run_id}`)
  }

  return <section className="panel batch-upload-panel">
    <div className="section-heading"><div><span className="eyebrow">New batch prediction</span><h2>Run Batch Prediction</h2><p>Upload a CSV or Excel dataset to generate predicted graduate outcomes for the selected batch.</p></div><Link className="button secondary small" href="/api/imports/template">Download column template</Link></div>
    <div
      className={`prediction-dropzone${dragging ? " dragging" : ""}`}
      onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => { event.preventDefault(); setDragging(false); choose(event.dataTransfer.files[0]) }}
    >
      <UploadCloud size={32} aria-hidden="true" />
      <strong>Drag and drop a tracer dataset here</strong>
      <span>CSV or XLSX, maximum 10 MB</span>
      <button className="button secondary small" type="button" onClick={() => inputRef.current?.click()}>Choose File</button>
      <input ref={inputRef} className="visually-hidden" type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => choose(event.target.files?.[0])} />
    </div>
    {file && <div className="selected-file"><FileSpreadsheet size={22} /><div><strong>{file.name}</strong><span>{bytes(file.size)}{validation ? ` · ${validation.total_rows.toLocaleString("en-PH")} detected records` : " · not yet validated"}</span></div><button className="button small" type="button" disabled={validating || running} onClick={validate}>{validating ? "Validating…" : "Validate dataset"}</button></div>}
    {message && <div className="notice error" role="alert">{message}</div>}
    {validation && <div className="validation-block">
      <div className="validation-title"><div>{validation.valid_rows > 0 ? <CheckCircle2 className="success-icon" /> : <AlertTriangle className="error-icon" />}<div><h3>Dataset Validation</h3><p>{validation.valid_rows > 0 ? `${validation.valid_rows.toLocaleString("en-PH")} records are ready for prediction.` : "No records are eligible for prediction."}</p></div></div><span className={`badge ${validation.valid_rows ? "success" : "error"}`}>{validation.status.replaceAll("_", " ")}</span></div>
      <dl className="validation-metrics">
        <div><dt>Total rows</dt><dd>{validation.total_rows}</dd></div><div><dt>Valid rows</dt><dd>{validation.valid_rows}</dd></div><div><dt>Invalid rows</dt><dd>{validation.invalid_rows}</dd></div><div><dt>Duplicate rows</dt><dd>{validation.duplicate_rows}</dd></div><div><dt>Rows with missing data</dt><dd>{validation.missing_rows}</dd></div>
      </dl>
      <p className="processing-scope"><strong>{validation.valid_rows} of {validation.total_rows} records will be processed.</strong> Invalid rows will not be sent to the ML service and are not silently committed as respondents.</p>
      <div className="form-actions">
        {validation.issues.length > 0 && <button className="button secondary small" type="button" onClick={() => setShowIssues((current) => !current)}>{showIssues ? "Hide validation issues" : "View validation issues"}</button>}
        {validation.issues.length > 0 && <Link className="button secondary small" href={`/api/predictions/${validation.run_id}/errors`}>Download validation errors</Link>}
        <button className="button small" type="button" disabled={running || !modelsReady || validation.valid_rows === 0} onClick={runPrediction}>{running ? "Processing valid records…" : "Run Batch Prediction"}</button>
      </div>
      {!modelsReady && <div className="notice warning"><code>MODEL_NOT_AVAILABLE</code> Both an active pathway model and an active NEET model are required before this validated run can be processed.</div>}
      {running && <div className="notice info" role="status">The Render service is processing the validated records in secured chunks. Keep this page open until the result is saved.</div>}
      {showIssues && validation.issues.length > 0 && <div className="table-wrap validation-issues"><table><thead><tr><th>Row</th><th>Column</th><th>Type</th><th>Issue</th></tr></thead><tbody>{validation.issues.map((issue, index) => <tr key={`${issue.row_number}-${issue.code}-${index}`}><td>{issue.row_number ?? "File"}</td><td>{issue.column_name ?? "—"}</td><td><span className={`badge ${issue.severity === "error" ? "error" : "warning"}`}>{issue.severity}</span></td><td>{issue.message}</td></tr>)}</tbody></table></div>}
    </div>}
  </section>
}
