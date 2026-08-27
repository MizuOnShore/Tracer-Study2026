"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import type { RespondentRecord } from "@/lib/database.types"

export function RespondentEditor({ record }: { record: RespondentRecord }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("")
    const values = Object.fromEntries(new FormData(event.currentTarget))
    const response = await fetch(`/api/respondents/${record.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) })
    const result = await response.json().catch(() => ({}))
    setMessage(response.ok ? "Record updated." : String(result.message ?? "Update failed."))
    setBusy(false)
    if (response.ok) { setEditing(false); router.refresh() }
  }
  if (!editing) return <div className="form-actions"><button className="button secondary" type="button" onClick={() => setEditing(true)}>Edit record</button>{message && <span className="notice success">{message}</span>}</div>
  return <form onSubmit={save} className="panel"><h2>Edit validated fields</h2><p>Changing identity fields recalculates the duplicate fingerprint. The action is written to the audit log.</p><div className="field-grid"><Field name="full_name" label="Full name" value={record.full_name} /><Field name="email" label="Email" value={record.email} type="email" /><Field name="age" label="Age" value={record.age} type="number" /><Field name="graduation_year" label="Graduation year" value={record.graduation_year} type="number" /><Field name="certification" label="Certification" value={record.certification} /><Field name="subject_relevance" label="Subject relevance (1–5)" value={record.subject_relevance} type="number" /><Field name="preparedness" label="Preparedness (1–5)" value={record.preparedness} type="number" /><div className="field full"><label htmlFor="challenges">Challenges</label><textarea id="challenges" name="challenges" defaultValue={record.challenges} required /></div><div className="field full"><label htmlFor="support_needed">Support needed</label><textarea id="support_needed" name="support_needed" defaultValue={record.support_needed} required /></div><div className="field full"><label htmlFor="feedback">Feedback</label><textarea id="feedback" name="feedback" defaultValue={record.feedback} required /></div></div>{message && <div className="notice error">{message}</div>}<div className="form-actions"><button className="button" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button><button className="button secondary" type="button" onClick={() => setEditing(false)}>Cancel</button></div></form>
}
function Field({ name, label, value, type = "text" }: { name: string; label: string; value: string | number; type?: string }) { return <div className="field"><label htmlFor={name}>{label}</label><input id={name} name={name} type={type} defaultValue={value} required /></div> }
