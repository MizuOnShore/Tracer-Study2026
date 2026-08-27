import { REQUIRED_IMPORT_COLUMNS, OPTIONAL_IMPORT_COLUMNS } from "@/lib/import-parser"

export async function GET() {
  const csv = `${[...REQUIRED_IMPORT_COLUMNS, ...OPTIONAL_IMPORT_COLUMNS].join(",")}\r\n`
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=DJIHS-tracer-import-template.csv", "X-Content-Type-Options": "nosniff" } })
}
