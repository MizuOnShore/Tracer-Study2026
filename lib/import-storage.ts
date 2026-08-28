export type ImportExtension = "csv" | "xlsx"

export function canonicalImportContentType(extension: ImportExtension) {
  return extension === "csv"
    ? "text/csv"
    : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
}

export function classifyImportStorageError(error: unknown) {
  const candidate = error as { message?: unknown; error?: unknown; statusCode?: unknown }
  const diagnostic = String(candidate?.message ?? candidate?.error ?? "Unknown storage error")
  const normalized = diagnostic.toLowerCase()

  if (normalized.includes("bucket") && (normalized.includes("not found") || normalized.includes("does not exist"))) {
    return {
      code: "RAW_IMPORT_BUCKET_NOT_FOUND",
      message: "The private import storage bucket is unavailable. Ask an administrator to apply the storage migration.",
      diagnostic,
      statusCode: candidate?.statusCode,
    }
  }
  if (normalized.includes("mime") || normalized.includes("content type")) {
    return {
      code: "RAW_IMPORT_MIME_REJECTED",
      message: "Storage rejected the uploaded file type. Use the CSV template or a standard XLSX workbook.",
      diagnostic,
      statusCode: candidate?.statusCode,
    }
  }
  if (normalized.includes("row-level security") || normalized.includes("unauthorized") || normalized.includes("permission")) {
    return {
      code: "RAW_IMPORT_STORAGE_FORBIDDEN",
      message: "Your account is not permitted to store import files. Check the storage policies and account status.",
      diagnostic,
      statusCode: candidate?.statusCode,
    }
  }
  return {
    code: "RAW_IMPORT_STORAGE_FAILED",
    message: "The original file could not be stored; no import batch was created.",
    diagnostic,
    statusCode: candidate?.statusCode,
  }
}
