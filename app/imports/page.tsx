import type { Metadata } from "next"
import { AppShell } from "@/components/app-shell"
import { ImportWorkflow } from "@/components/import-workflow"
import { requireProfile } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Import and validation" }
export const dynamic = "force-dynamic"

export default async function ImportsPage() {
  const profile = await requireProfile()
  const supabase = await createClient()
  const { data: batches } = await supabase.from("import_batches").select("id,original_file_name,status,total_rows,valid_rows,invalid_rows,created_at").order("created_at", { ascending: false }).limit(20)
  return <AppShell profile={profile}><header className="page-header"><div><span className="eyebrow">Tracer data management</span><h1>Import and validation</h1><p>Files are parsed into a staged preview. Only a fully valid batch can be committed to respondent records.</p></div></header><ImportWorkflow /><section className="panel"><h2>Import history</h2>{batches?.length ? <div className="table-wrap"><table><thead><tr><th>File</th><th>Total</th><th>Valid</th><th>Invalid</th><th>Status</th><th>Created</th></tr></thead><tbody>{batches.map((batch) => <tr key={String(batch.id)}><td>{String(batch.original_file_name)}</td><td>{Number(batch.total_rows)}</td><td>{Number(batch.valid_rows)}</td><td>{Number(batch.invalid_rows)}</td><td><span className={`badge ${batch.status === "committed" ? "success" : batch.invalid_rows ? "error" : "warning"}`}>{String(batch.status)}</span></td><td>{new Date(String(batch.created_at)).toLocaleString("en-PH")}</td></tr>)}</tbody></table></div> : <p>No files have been uploaded.</p>}</section></AppShell>
}
