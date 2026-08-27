import { NextResponse } from "next/server"
import { ACCEPTED_IMPORT_TYPES, MAX_IMPORT_BYTES, parseImportWorkbook, sha256 } from "@/lib/import-parser"
import { createClient } from "@/lib/supabase/server"

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-180)
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ message: "Authentication is required." }, { status: 401 })

  const form = await request.formData().catch(() => null)
  const file = form?.get("file")
  if (!(file instanceof File)) return NextResponse.json({ message: "Choose a CSV or XLSX file." }, { status: 400 })
  const extension = file.name.toLowerCase().split(".").pop()
  if (!extension || !["csv", "xlsx"].includes(extension) || !ACCEPTED_IMPORT_TYPES.includes(file.type as never)) {
    return NextResponse.json({ message: "Only CSV and XLSX files are accepted." }, { status: 415 })
  }
  if (file.size === 0) return NextResponse.json({ message: "The selected file is empty." }, { status: 422 })
  if (file.size > MAX_IMPORT_BYTES) return NextResponse.json({ message: "The file exceeds the 10 MB limit." }, { status: 413 })

  const buffer = await file.arrayBuffer()
  let parsed
  try {
    parsed = await parseImportWorkbook(buffer, extension as "csv" | "xlsx")
  } catch (error) {
    const code = error instanceof Error ? error.message : "MALFORMED_FILE"
    return NextResponse.json({ code, message: code === "EMPTY_FILE" ? "The file contains no records." : "The file could not be parsed." }, { status: 422 })
  }

  const fingerprintList = parsed.rows.map((row) => row.record_fingerprint)
  const existing = new Set<string>()
  for (let index = 0; index < fingerprintList.length; index += 100) {
    const { data } = await supabase.from("respondent_records").select("record_fingerprint").in("record_fingerprint", fingerprintList.slice(index, index + 100))
    for (const row of data ?? []) existing.add(String(row.record_fingerprint))
  }
  for (const row of parsed.rows) {
    if (!existing.has(row.record_fingerprint)) continue
    row.is_valid = false
    parsed.issues.push({ row_number: row.row_number, column_name: null, severity: "error", code: "DUPLICATE_EXISTING_RECORD", message: "This graduate already exists in the database.", raw_value: null })
  }

  const hash = sha256(buffer)
  const path = `${user.id}/${new Date().toISOString().slice(0, 10)}/${hash}-${safeFileName(file.name)}`
  const { error: uploadError } = await supabase.storage.from("raw-imports").upload(path, buffer, { contentType: file.type, upsert: false })
  if (uploadError) return NextResponse.json({ message: "The original file could not be stored; no import batch was created." }, { status: 500 })

  const invalidRows = parsed.rows.filter((row) => !row.is_valid).length
  const batch = {
    uploaded_by: user.id,
    original_file_name: safeFileName(file.name),
    storage_path: path,
    mime_type: file.type,
    byte_size: file.size,
    sha256: hash,
    status: invalidRows === 0 && !parsed.issues.some((issue) => issue.severity === "error" && issue.row_number === null) ? "validated" : "uploaded",
    total_rows: parsed.rows.length,
    valid_rows: parsed.rows.length - invalidRows,
    invalid_rows: invalidRows,
  }
  const { data: savedBatch, error: batchError } = await supabase.from("import_batches").insert(batch).select("id").single()
  if (batchError || !savedBatch) {
    await supabase.storage.from("raw-imports").remove([path])
    return NextResponse.json({ message: batchError?.code === "23505" ? "This exact file has already been imported by your account." : "The import batch could not be created." }, { status: batchError?.code === "23505" ? 409 : 500 })
  }

  const batchId = String(savedBatch.id)
  const stagedRows = parsed.rows.map((row) => ({ import_batch_id: batchId, ...row }))
  const validationIssues = parsed.issues.map((issue) => ({ import_batch_id: batchId, ...issue }))
  const { error: rowsError } = stagedRows.length ? await supabase.from("import_staged_rows").insert(stagedRows) : { error: null }
  const { error: issuesError } = validationIssues.length ? await supabase.from("import_validation_issues").insert(validationIssues) : { error: null }
  if (rowsError || issuesError) {
    return NextResponse.json({ code: "STAGING_INCOMPLETE", message: "The file was stored, but validation staging failed. Do not commit this batch; an administrator can remove it." }, { status: 500 })
  }

  await supabase.from("audit_logs").insert({ actor_id: user.id, action: "import.validated", entity_type: "import_batch", entity_id: batchId, metadata: { total_rows: parsed.rows.length, valid_rows: parsed.rows.length - invalidRows, invalid_rows: invalidRows } })
  return NextResponse.json({ batch_id: batchId, status: batch.status, total_rows: parsed.rows.length, valid_rows: parsed.rows.length - invalidRows, invalid_rows: invalidRows, issues: parsed.issues.slice(0, 200), preview: parsed.rows.slice(0, 20).map((row) => ({ row_number: row.row_number, is_valid: row.is_valid, data: row.normalized_data })) }, { status: 201 })
}
