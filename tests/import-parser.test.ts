import ExcelJS from "exceljs"
import { describe, expect, it } from "vitest"
import { OPTIONAL_IMPORT_COLUMNS, REQUIRED_IMPORT_COLUMNS, parseImportWorkbook } from "@/lib/import-parser"

async function workbook(rows: unknown[][]): Promise<ArrayBuffer> {
  const book = new ExcelJS.Workbook()
  const sheet = book.addWorksheet("Tracer")
  sheet.addRows(rows)
  const bytes = await book.xlsx.writeBuffer()
  const view = new Uint8Array(bytes)
  return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength)
}

const valid = [
  "graduate@example.com", "Graduate One", "Female", 20, 2023, "HUMMS", "None", "employed", 4, 4,
  "Finding work", "Career guidance", "More outreach",
  "", "", "Company", "Assistant", "Yes", "", "", "", "", "", "", "",
]

describe("import parser", () => {
  it("normalizes and validates a valid row", async () => {
    const result = await parseImportWorkbook(await workbook([[...REQUIRED_IMPORT_COLUMNS, ...OPTIONAL_IMPORT_COLUMNS], valid]), "xlsx")
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].is_valid).toBe(true)
    expect(result.rows[0].normalized_data.email).toBe("graduate@example.com")
  })

  it("reports missing required columns", async () => {
    const result = await parseImportWorkbook(await workbook([["email", "full_name"], ["a@example.com", "A Person"]]), "xlsx")
    expect(result.issues.some((issue) => issue.code === "MISSING_COLUMN")).toBe(true)
    expect(result.rows[0].is_valid).toBe(false)
  })

  it("warns about extra columns without treating the warning as a row error", async () => {
    const headers = [...REQUIRED_IMPORT_COLUMNS, ...OPTIONAL_IMPORT_COLUMNS, "unapproved_metric"]
    const row = [...valid, "ignored"]
    const result = await parseImportWorkbook(await workbook([headers, row]), "xlsx")
    expect(result.issues.some((issue) => issue.code === "UNEXPECTED_COLUMN")).toBe(true)
  })

  it("blocks duplicate rows in one file", async () => {
    const result = await parseImportWorkbook(await workbook([[...REQUIRED_IMPORT_COLUMNS, ...OPTIONAL_IMPORT_COLUMNS], valid, valid]), "xlsx")
    expect(result.rows[1].is_valid).toBe(false)
    expect(result.issues.some((issue) => issue.code === "DUPLICATE_IN_FILE")).toBe(true)
  })

  it("reports malformed and null-heavy rows", async () => {
    const row = ["not-an-email", "", "Unknown", "abc", 2030, "INVALID", "", "unknown", 7, 0, "", "", ""]
    const result = await parseImportWorkbook(await workbook([[...REQUIRED_IMPORT_COLUMNS], row]), "xlsx")
    expect(result.rows[0].is_valid).toBe(false)
    expect(result.issues.filter((issue) => issue.severity === "error").length).toBeGreaterThan(5)
  })

  it("rejects a workbook with no content", async () => {
    await expect(parseImportWorkbook(await workbook([]), "xlsx")).rejects.toThrow(/EMPTY_(FILE|WORKBOOK)/)
  })
})
