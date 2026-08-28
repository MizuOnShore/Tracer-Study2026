import type { Metadata } from "next"
import { AppShell } from "@/components/app-shell"
import { StatusPanel } from "@/components/status-panel"
import { requireProfile } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Audit history" }
export const dynamic = "force-dynamic"

export default async function AuditPage() {
  const profile = await requireProfile(["admin"])
  const supabase = await createClient()
  const { data, error } = await supabase.from("audit_logs").select("id,actor_id,action,entity_type,entity_id,metadata,created_at,profiles(full_name,email)").order("created_at", { ascending: false }).limit(250)
  return <AppShell profile={profile}><header className="page-header"><div><span className="eyebrow">Accountability</span><h1>Audit history</h1><p>Recorded import, record, account, batch-prediction, and model-registry events. Access is limited to administrators.</p></div></header>{error ? <StatusPanel title="Audit history unavailable" description="The audit-log query failed." code="AUDIT_QUERY_FAILED" /> : !data?.length ? <StatusPanel title="No audit events" description="No audited application action has been recorded." code="DATA_NOT_AVAILABLE" /> : <section className="panel"><div className="table-wrap"><table><thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Entity</th><th>Metadata</th></tr></thead><tbody>{data.map((row) => <tr key={String(row.id)}><td>{new Date(String(row.created_at)).toLocaleString("en-PH")}</td><td>{row.actor_id ? String(row.actor_id).slice(0, 8) : "System"}</td><td>{String(row.action)}</td><td>{String(row.entity_type)} {row.entity_id ? `· ${String(row.entity_id).slice(0, 8)}` : ""}</td><td><code>{JSON.stringify(row.metadata)}</code></td></tr>)}</tbody></table></div></section>}</AppShell>
}
