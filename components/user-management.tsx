"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import type { Profile } from "@/lib/database.types"

export function UserManagement({ users, currentUserId }: { users: Profile[]; currentUserId: string }) {
  const router = useRouter()
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("")
    const form = new FormData(event.currentTarget)
    const response = await fetch("/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(form)) })
    const result = await response.json().catch(() => ({}))
    setMessage(response.ok ? "Account created." : String(result.message ?? "Account creation failed."))
    if (response.ok) { event.currentTarget.reset(); router.refresh() }
    setBusy(false)
  }
  async function update(id: string, changes: Record<string, string>) {
    setBusy(true); setMessage("")
    const response = await fetch("/api/admin/users", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...changes }) })
    const result = await response.json().catch(() => ({}))
    setMessage(response.ok ? "Account updated." : String(result.message ?? "Account update failed."))
    if (response.ok) router.refresh()
    setBusy(false)
  }
  return <>
    <section className="panel"><h2>Add authorized account</h2><p>A temporary password must have at least 12 characters. Public self-registration is disabled.</p><form onSubmit={create}><div className="field-grid"><div className="field"><label className="required" htmlFor="full_name">Full name</label><input id="full_name" name="full_name" required minLength={2} maxLength={150} /></div><div className="field"><label className="required" htmlFor="email">Email</label><input id="email" name="email" type="email" required /></div><div className="field"><label className="required" htmlFor="role">Role</label><select id="role" name="role" defaultValue="user"><option value="user">Authorized user</option><option value="admin">Administrator</option></select></div><div className="field"><label className="required" htmlFor="password">Temporary password</label><input id="password" name="password" type="password" minLength={12} maxLength={128} autoComplete="new-password" required /></div></div><div className="form-actions"><button className="button" disabled={busy}>Create account</button></div></form></section>
    {message && <div className={`notice ${message.includes("created") || message.includes("updated") ? "success" : "error"}`}>{message}</div>}
    <section className="panel"><h2>System accounts</h2><div className="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td>{user.full_name}{user.id === currentUserId ? " (you)" : ""}</td><td>{user.email}</td><td><select aria-label={`Role for ${user.full_name}`} defaultValue={user.role} disabled={busy} onChange={(event) => update(user.id, { role: event.target.value })}><option value="user">User</option><option value="admin">Admin</option></select></td><td><span className={`badge ${user.status === "active" ? "success" : "warning"}`}>{user.status}</span></td><td><button className="button secondary small" type="button" disabled={busy || user.id === currentUserId} onClick={() => update(user.id, { status: user.status === "active" ? "inactive" : "active" })}>{user.status === "active" ? "Deactivate" : "Reactivate"}</button></td></tr>)}</tbody></table></div></section>
  </>
}
