import { describe, expect, it } from "vitest"
import { canonicalImportContentType, classifyImportStorageError } from "@/lib/import-storage"

describe("import storage compatibility", () => {
  it("uses bucket-approved canonical MIME types regardless of the browser label", () => {
    expect(canonicalImportContentType("csv")).toBe("text/csv")
    expect(canonicalImportContentType("xlsx")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
  })

  it("returns actionable storage error codes without exposing raw details to users", () => {
    expect(classifyImportStorageError({ message: "mime type application/vnd.ms-excel is not supported" }).code).toBe("RAW_IMPORT_MIME_REJECTED")
    expect(classifyImportStorageError({ message: "new row violates row-level security policy" }).code).toBe("RAW_IMPORT_STORAGE_FORBIDDEN")
    expect(classifyImportStorageError({ message: "Bucket not found" }).code).toBe("RAW_IMPORT_BUCKET_NOT_FOUND")
  })
})
