import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

function csvCell(value: unknown) {
  let text = String(value ?? "")
  if (/^[=+\-@]/.test(text)) text = `'${text}`
  return `"${text.replaceAll('"', '""')}"`
}

export async function GET(_request: Request, context: { params: Promise<{ runId: string }> }) {
  const { runId } = await context.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ message: "Authentication is required." }, { status: 401 })
  const [{ data: run }, { data: profile }] = await Promise.all([
    supabase.from("prediction_runs").select("id,filename,uploaded_by").eq("id", runId).maybeSingle(),
    supabase.from("profiles").select("role,status").eq("id", user.id).maybeSingle(),
  ])
  if (!run) return NextResponse.json({ message: "Prediction run not found." }, { status: 404 })
  if (String(run.uploaded_by) !== user.id && profile?.role !== "admin") return NextResponse.json({ message: "You cannot export issues for this prediction run." }, { status: 403 })
  const { data, error } = await supabase.from("prediction_validation_issues")
    .select("row_number,column_name,severity,code,message,raw_value")
    .eq("prediction_run_id", runId)
    .order("row_number", { nullsFirst: true })
  if (error) return NextResponse.json({ message: "Validation errors could not be exported." }, { status: 500 })
  const header = ["row_number", "column_name", "severity", "code", "message", "raw_value"]
  const csv = [header, ...(data ?? []).map((row) => header.map((key) => row[key as keyof typeof row]))]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n")
  const stem = String(run.filename).replace(/\.[^.]+$/, "")
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${stem}-validation-errors.csv"`, "Cache-Control": "private, no-store" } })
}
