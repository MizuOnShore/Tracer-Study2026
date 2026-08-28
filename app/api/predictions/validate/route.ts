import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import { ACCEPTED_IMPORT_TYPES, MAX_IMPORT_BYTES, parseImportWorkbook, sha256 } from "@/lib/import-parser"
import { canonicalImportContentType, classifyImportStorageError, type ImportExtension } from "@/lib/import-storage"
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
  if (!extension || !["csv", "xlsx"].includes(extension) || (file.type && !ACCEPTED_IMPORT_TYPES.includes(file.type as never))) {
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

  const invalidRows = parsed.rows.filter((row) => !row.is_valid).length
  const duplicateRows = new Set(parsed.issues.filter((issue) => issue.code === "DUPLICATE_IN_FILE" && issue.row_number).map((issue) => issue.row_number)).size
  const missingRows = new Set(parsed.issues.filter((issue) => issue.code === "REQUIRED_VALUE_MISSING" && issue.row_number).map((issue) => issue.row_number)).size
  const validRows = parsed.rows.length - invalidRows
  const runId = randomUUID()
  const filename = safeFileName(file.name)
  const path = `${user.id}/${runId}/${filename}`
  const storageContentType = canonicalImportContentType(extension as ImportExtension)
  const { error: uploadError } = await supabase.storage.from("prediction-inputs").upload(path, buffer, {
    contentType: storageContentType,
    upsert: false,
  })
  if (uploadError) {
    const failure = classifyImportStorageError(uploadError)
    console.error("PREDICTION_INPUT_STORAGE_FAILED", { diagnostic: failure.diagnostic, statusCode: failure.statusCode, extension })
    return NextResponse.json({ code: "PREDICTION_INPUT_STORAGE_FAILED", message: "The prediction dataset could not be stored securely. No run was created." }, { status: 500 })
  }

  const status = validRows > 0 ? "validated" : "validation_failed"
  const { error: runError } = await supabase.from("prediction_runs").insert({
    id: runId,
    filename,
    storage_path: path,
    mime_type: storageContentType,
    byte_size: file.size,
    sha256: sha256(buffer),
    original_record_count: parsed.rows.length,
    valid_record_count: validRows,
    invalid_record_count: invalidRows,
    duplicate_record_count: duplicateRows,
    missing_data_record_count: missingRows,
    uploaded_by: user.id,
    status,
  })
  if (runError) {
    await supabase.storage.from("prediction-inputs").remove([path])
    return NextResponse.json({ code: "PREDICTION_RUN_CREATE_FAILED", message: "The validated prediction run could not be created." }, { status: 500 })
  }

  const staged = parsed.rows.map((row) => ({
    prediction_run_id: runId,
    source_row: row.row_number,
    normalized_data: row.normalized_data,
    is_valid: row.is_valid,
  }))
  const issues = parsed.issues.map((issue) => ({ prediction_run_id: runId, ...issue }))
  let stagedError = null
  for (let index = 0; index < staged.length && !stagedError; index += 500) {
    const result = await supabase.from("prediction_staged_rows").insert(staged.slice(index, index + 500))
    stagedError = result.error
  }
  let issuesError = null
  for (let index = 0; index < issues.length && !issuesError; index += 500) {
    const result = await supabase.from("prediction_validation_issues").insert(issues.slice(index, index + 500))
    issuesError = result.error
  }
  if (stagedError || issuesError) {
    await supabase.from("prediction_runs").update({ status: "failed", error_message: "Validation staging could not be persisted." }).eq("id", runId)
    await supabase.from("audit_logs").insert({ actor_id: user.id, action: "prediction.failed", entity_type: "prediction_run", entity_id: runId, metadata: { stage: "validation_persistence" } })
    return NextResponse.json({ code: "PREDICTION_VALIDATION_PERSISTENCE_FAILED", message: "Validation finished, but its rows could not be staged. No prediction was run." }, { status: 500 })
  }

  await supabase.from("audit_logs").insert([
    { actor_id: user.id, action: "prediction.dataset_uploaded", entity_type: "prediction_run", entity_id: runId, metadata: { filename, byte_size: file.size } },
    { actor_id: user.id, action: "prediction.validation_completed", entity_type: "prediction_run", entity_id: runId, metadata: { total_rows: parsed.rows.length, valid_rows: validRows, invalid_rows: invalidRows, duplicate_rows: duplicateRows, missing_rows: missingRows } },
  ])

  return NextResponse.json({
    run_id: runId,
    status,
    filename,
    file_size: file.size,
    total_rows: parsed.rows.length,
    valid_rows: validRows,
    invalid_rows: invalidRows,
    duplicate_rows: duplicateRows,
    missing_rows: missingRows,
    issues: parsed.issues.slice(0, 200),
  }, { status: 201 })
}
