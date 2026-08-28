import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ message: "Authentication is required." }, { status: 401 })
  const url = new URL(request.url)
  const year = url.searchParams.get("year")
  const strand = url.searchParams.get("strand")
  const status = url.searchParams.get("status")
  let query = supabase.from("analytics_import_by_batch_strand_status").select("graduation_year,strand,current_status,respondent_count")
  if (year) query = query.eq("graduation_year", Number(year))
  if (strand) query = query.eq("strand", strand)
  if (status) query = query.eq("current_status", status)
  const { data, error } = await query.order("graduation_year")
  if (error) return NextResponse.json({ code: "ANALYTICS_QUERY_FAILED", message: "Analytics could not be loaded." }, { status: 500 })
  return NextResponse.json({ state: data?.length ? "DATA_AVAILABLE" : "DATA_NOT_AVAILABLE", rows: data ?? [] })
}
