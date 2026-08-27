import { createHash } from "node:crypto"
import { Readable } from "node:stream"
import ExcelJS from "exceljs"
import { GENDERS, GRADUATION_YEARS, STRANDS } from "@/lib/survey-schema"

export const MAX_IMPORT_BYTES = 10 * 1024 * 1024
export const ACCEPTED_IMPORT_TYPES = [
  "text/csv",
  "application/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const

export const REQUIRED_IMPORT_COLUMNS = [
  "email", "full_name", "gender", "age", "graduation_year", "strand",
  "certification", "current_status", "subject_relevance", "preparedness",
  "challenges", "support_needed", "feedback",
] as const

export const OPTIONAL_IMPORT_COLUMNS = [
  "higher_education_course", "higher_education_relation", "employer_name", "job_title",
  "employment_relation", "business_nature", "business_relation", "training_center",
  "training_title", "training_relation", "neet_reasons", "actively_seeking",
] as const

type ImportIssue = {
  row_number: number | null
  column_name: string | null
  severity: "error" | "warning"
  code: string
  message: string
  raw_value: string | null
}

export type ParsedImportRow = {
  row_number: number
  normalized_data: Record<string, string | number | boolean | string[]>
  record_fingerprint: string
  is_valid: boolean
}

export type ImportParseResult = {
  rows: ParsedImportRow[]
  issues: ImportIssue[]
  headers: string[]
}

const statusAliases: Record<string, string> = {
  "enrolled in higher education": "higher_education",
  "higher education": "higher_education",
  college: "higher_education",
  employed: "employed",
  "self employed": "self_employed",
  "self-employed": "self_employed",
  "running business": "self_employed",
  training: "training",
  tesda: "training",
  neet: "neet",
  "not currently in education employment or training": "neet",
}

function cleanHeader(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s/-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
}

function text(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ")
}

function normalizeStatus(value: unknown) {
  const cleaned = text(value).toLowerCase().replace(/[(),.]/g, "").replace(/\s+/g, " ")
  return statusAliases[cleaned] ?? cleaned.replace(/\s+/g, "_")
}

function truthy(value: unknown): boolean | null {
  const cleaned = text(value).toLowerCase()
  if (["yes", "true", "1"].includes(cleaned)) return true
  if (["no", "false", "0"].includes(cleaned)) return false
  return null
}

function fingerprint(row: Record<string, unknown>) {
  return createHash("sha256")
    .update(`${text(row.email).toLowerCase()}|${text(row.full_name).toLowerCase()}|${row.graduation_year}`)
    .digest("hex")
}

function addRequiredIssue(issues: ImportIssue[], rowNumber: number, column: string, value: unknown) {
  issues.push({
    row_number: rowNumber,
    column_name: column,
    severity: "error",
    code: "REQUIRED_VALUE_MISSING",
    message: `${column} is required.`,
    raw_value: text(value) || null,
  })
}

function validateRow(raw: Record<string, unknown>, rowNumber: number): { row: ParsedImportRow; issues: ImportIssue[] } {
  const issues: ImportIssue[] = []
  for (const column of REQUIRED_IMPORT_COLUMNS) {
    if (!text(raw[column])) addRequiredIssue(issues, rowNumber, column, raw[column])
  }

  const email = text(raw.email).toLowerCase()
  const age = Number(text(raw.age))
  const graduationYear = Number(text(raw.graduation_year))
  const relevance = Number(text(raw.subject_relevance))
  const preparedness = Number(text(raw.preparedness))
  const strand = text(raw.strand).toUpperCase()
  const gender = text(raw.gender)
  const currentStatus = normalizeStatus(raw.current_status)

  const invalid = (column: string, code: string, message: string, value: unknown) =>
    issues.push({ row_number: rowNumber, column_name: column, severity: "error", code, message, raw_value: text(value) || null })

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) invalid("email", "INVALID_EMAIL", "Email format is invalid.", raw.email)
  if (text(raw.age) && (!Number.isInteger(age) || age < 14 || age > 100)) invalid("age", "INVALID_AGE", "Age must be a whole number from 14 to 100.", raw.age)
  if (text(raw.graduation_year) && !GRADUATION_YEARS.includes(graduationYear as never)) invalid("graduation_year", "INVALID_GRADUATION_YEAR", "Graduation year must be from 2018 to 2025.", raw.graduation_year)
  if (gender && !GENDERS.includes(gender as never)) invalid("gender", "INVALID_GENDER", `Gender must be one of: ${GENDERS.join(", ")}.`, raw.gender)
  if (strand && !STRANDS.includes(strand as never)) invalid("strand", "INVALID_STRAND", `Strand must be one of: ${STRANDS.join(", ")}.`, raw.strand)
  if (text(raw.subject_relevance) && (!Number.isInteger(relevance) || relevance < 1 || relevance > 5)) invalid("subject_relevance", "INVALID_RATING", "Subject relevance must be an integer from 1 to 5.", raw.subject_relevance)
  if (text(raw.preparedness) && (!Number.isInteger(preparedness) || preparedness < 1 || preparedness > 5)) invalid("preparedness", "INVALID_RATING", "Preparedness must be an integer from 1 to 5.", raw.preparedness)
  if (!["higher_education", "employed", "self_employed", "training", "neet"].includes(currentStatus)) invalid("current_status", "INVALID_STATUS", "Current status is not recognized.", raw.current_status)

  const requireBranch = (columns: string[]) => columns.forEach((column) => {
    if (!text(raw[column])) addRequiredIssue(issues, rowNumber, column, raw[column])
  })
  if (currentStatus === "higher_education") requireBranch(["higher_education_course", "higher_education_relation"])
  if (currentStatus === "employed") requireBranch(["employer_name", "job_title", "employment_relation"])
  if (currentStatus === "self_employed") requireBranch(["business_nature", "business_relation"])
  if (currentStatus === "training") requireBranch(["training_center", "training_title", "training_relation"])
  if (currentStatus === "neet") requireBranch(["neet_reasons", "actively_seeking"])

  const normalized: Record<string, string | number | boolean | string[]> = {
    email,
    full_name: text(raw.full_name),
    gender,
    age,
    graduation_year: graduationYear,
    strand,
    certification: text(raw.certification),
    current_status: currentStatus,
    subject_relevance: relevance,
    preparedness,
    challenges: text(raw.challenges),
    support_needed: text(raw.support_needed),
    feedback: text(raw.feedback),
  }
  for (const column of OPTIONAL_IMPORT_COLUMNS) {
    const value = text(raw[column])
    if (value) normalized[column] = column === "neet_reasons" ? value.split(/[;|]/).map((item) => item.trim()).filter(Boolean) : value
  }
  if (currentStatus === "neet" && text(raw.actively_seeking)) {
    const parsedBoolean = truthy(raw.actively_seeking)
    if (parsedBoolean === null) invalid("actively_seeking", "INVALID_BOOLEAN", "Actively seeking must be Yes or No.", raw.actively_seeking)
    else normalized.actively_seeking = parsedBoolean
  }

  return {
    row: { row_number: rowNumber, normalized_data: normalized, record_fingerprint: fingerprint(normalized), is_valid: issues.every((issue) => issue.severity !== "error") },
    issues,
  }
}

export async function parseImportWorkbook(buffer: ArrayBuffer, extension: "csv" | "xlsx"): Promise<ImportParseResult> {
  const workbook = new ExcelJS.Workbook()
  if (extension === "xlsx") {
    await workbook.xlsx.load(buffer)
  } else {
    await workbook.csv.read(Readable.from(Buffer.from(buffer)))
  }
  const sheet = workbook.worksheets[0]
  if (!sheet) throw new Error("EMPTY_WORKBOOK")
  const matrix: unknown[][] = []
  sheet.eachRow({ includeEmpty: true }, (row) => {
    const values: unknown[] = []
    for (let column = 1; column <= Math.max(sheet.columnCount, row.cellCount); column += 1) {
      // ExcelJS does not evaluate formulas. `text` uses only the cached result,
      // so uploaded spreadsheet formulas are never executed by this service.
      values.push(row.getCell(column).text)
    }
    matrix.push(values)
  })
  if (matrix.length === 0 || matrix.every((row) => row.every((value) => !text(value)))) throw new Error("EMPTY_FILE")

  const headers = (matrix[0] ?? []).map(cleanHeader)
  const issues: ImportIssue[] = []
  const duplicates = headers.filter((header, index) => header && headers.indexOf(header) !== index)
  for (const header of new Set(duplicates)) {
    issues.push({ row_number: null, column_name: header, severity: "error", code: "DUPLICATE_COLUMN", message: `Column ${header} appears more than once.`, raw_value: header })
  }
  for (const column of REQUIRED_IMPORT_COLUMNS) {
    if (!headers.includes(column)) issues.push({ row_number: null, column_name: column, severity: "error", code: "MISSING_COLUMN", message: `Required column ${column} is missing.`, raw_value: null })
  }
  const allowed = new Set<string>([...REQUIRED_IMPORT_COLUMNS, ...OPTIONAL_IMPORT_COLUMNS])
  for (const header of headers.filter(Boolean)) {
    if (!allowed.has(header)) issues.push({ row_number: null, column_name: header, severity: "warning", code: "UNEXPECTED_COLUMN", message: `Unexpected column ${header} will be ignored.`, raw_value: header })
  }

  const rows: ParsedImportRow[] = []
  const seen = new Map<string, number>()
  matrix.slice(1).forEach((values, index) => {
    if (values.every((value) => !text(value))) return
    const raw = Object.fromEntries(headers.map((header, columnIndex) => [header, values[columnIndex]]))
    const result = validateRow(raw, index + 2)
    const firstRow = seen.get(result.row.record_fingerprint)
    if (firstRow) {
      result.issues.push({ row_number: index + 2, column_name: null, severity: "error", code: "DUPLICATE_IN_FILE", message: `Duplicate of row ${firstRow}.`, raw_value: null })
      result.row.is_valid = false
    } else {
      seen.set(result.row.record_fingerprint, index + 2)
    }
    rows.push(result.row)
    issues.push(...result.issues)
  })

  if (!rows.length) issues.push({ row_number: null, column_name: null, severity: "error", code: "NO_DATA_ROWS", message: "The file has headers but no data rows.", raw_value: null })
  return { rows, issues, headers }
}

export function sha256(buffer: ArrayBuffer) {
  return createHash("sha256").update(Buffer.from(buffer)).digest("hex")
}
