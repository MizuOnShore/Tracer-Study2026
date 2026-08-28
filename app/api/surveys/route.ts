import { NextResponse } from "next/server"

export async function POST() {
  return NextResponse.json(
    {
      code: "SURVEY_COLLECTION_DISABLED",
      message: "Public survey collection is disabled. Tracer data is accepted only through authorized CSV/XLSX imports.",
    },
    { status: 410 },
  )
}
