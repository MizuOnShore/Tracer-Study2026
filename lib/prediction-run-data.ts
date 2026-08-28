import "server-only"
import { pathwayDisplayLabel, type BatchDisplayRow } from "@/lib/prediction-runs"
import type { createClient } from "@/lib/supabase/server"

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

export async function loadBatchDisplayRows(supabase: SupabaseClient, runId: string): Promise<BatchDisplayRow[]> {
  const rawResults: Array<Record<string, unknown>> = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("prediction_results")
      .select("source_row,source_identifier,interpreted_label,kind,predicted_class,probability,input_snapshot")
      .eq("prediction_run_id", runId).order("source_row").range(from, from + 999)
    if (error) throw new Error("PREDICTION_RESULTS_QUERY_FAILED")
    rawResults.push(...((data ?? []) as Array<Record<string, unknown>>))
    if (!data || data.length < 1000) break
  }
  const pairs = new Map<number, { pathway?: Record<string, unknown>; neet?: Record<string, unknown> }>()
  for (const result of rawResults) {
    const sourceRow = Number(result.source_row)
    const pair = pairs.get(sourceRow) ?? {}
    if (result.kind === "pathway") pair.pathway = result
    if (result.kind === "neet") pair.neet = result
    pairs.set(sourceRow, pair)
  }
  return [...pairs.entries()].flatMap(([sourceRow, pair]) => {
    if (!pair.pathway || !pair.neet) return []
    const input = pair.pathway.input_snapshot && typeof pair.pathway.input_snapshot === "object" && !Array.isArray(pair.pathway.input_snapshot) ? pair.pathway.input_snapshot as Record<string, unknown> : {}
    return [{
      sourceRow, sourceIdentifier: String(pair.pathway.source_identifier), graduationYear: Number(input.graduation_year),
      strand: String(input.strand ?? ""), gender: String(input.gender ?? ""), certification: String(input.certification ?? ""),
      preparedness: Number(input.preparedness),
      predictedOutcome: pathwayDisplayLabel(String(pair.pathway.predicted_class), pair.pathway.interpreted_label ? String(pair.pathway.interpreted_label) : null),
      confidence: Number(pair.pathway.probability), pathwayClass: String(pair.pathway.predicted_class),
      neetPredicted: pair.neet.predicted_class === "NEET", neetProbability: Number(pair.neet.probability),
    }]
  }).sort((a, b) => a.sourceRow - b.sourceRow)
}
