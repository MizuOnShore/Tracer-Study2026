import { z } from "zod"

export const modelResultSchema = z.object({
  kind: z.enum(["pathway", "neet"]),
  model_version: z.string().min(1),
  predicted_class: z.string().min(1),
  interpreted_label: z.string().nullable().optional(),
  probability: z.number().min(0).max(1),
  class_probabilities: z.record(z.number().min(0).max(1)),
  threshold: z.number().min(0).max(1).optional(),
  factor_associations: z.array(z.record(z.unknown())).nullable(),
})

export const batchServiceResponseSchema = z.object({
  model_versions: z.object({ pathway: z.string().min(1), neet: z.string().min(1) }),
  predictions: z.array(z.object({
    source_row: z.number().int().gt(1),
    pathway: modelResultSchema.extend({ kind: z.literal("pathway") }),
    neet: modelResultSchema.extend({ kind: z.literal("neet") }),
  })),
})

export type ModelResult = z.infer<typeof modelResultSchema>

export type BatchDisplayRow = {
  sourceRow: number
  sourceIdentifier: string
  graduationYear: number
  strand: string
  gender: string
  certification: string
  preparedness: number
  predictedOutcome: string
  confidence: number
  pathwayClass: string
  neetPredicted: boolean
  neetProbability: number
}

const MODEL_INPUT_FIELDS = [
  "gender", "age", "graduation_year", "strand", "certification", "current_status",
  "subject_relevance", "preparedness", "higher_education_relation", "employment_relation",
  "business_relation", "training_relation", "actively_seeking",
] as const

export function buildModelInput(normalized: Record<string, unknown>) {
  return Object.fromEntries(MODEL_INPUT_FIELDS.map((key) => [key, normalized[key] ?? null]))
}

export function pathwayDisplayLabel(predictedClass: string, interpretedLabel?: string | null) {
  return interpretedLabel?.trim() || `Cluster ${predictedClass} — interpretation pending`
}

export function confidenceBand(confidence: number): "High" | "Medium" | "Low" {
  if (confidence >= 0.8) return "High"
  if (confidence >= 0.6) return "Medium"
  return "Low"
}

export function summarizePredictionRows(rows: BatchDisplayRow[]) {
  const outcomeCounts: Record<string, number> = {}
  const confidenceCounts = { High: 0, Medium: 0, Low: 0 }
  let predictedNeet = 0
  for (const row of rows) {
    outcomeCounts[row.predictedOutcome] = (outcomeCounts[row.predictedOutcome] ?? 0) + 1
    confidenceCounts[confidenceBand(row.confidence)] += 1
    if (row.neetPredicted) predictedNeet += 1
  }
  return {
    processed: rows.length,
    predictedNeet,
    outcomeCounts,
    confidenceCounts,
  }
}

export function percentage(count: number, total: number) {
  return total > 0 ? (count / total) * 100 : 0
}

export type BreakdownRow = {
  group: string
  count: number
  outcomes: Record<string, number>
  predictedNeet: number
}

export function groupPredictionRows(
  rows: BatchDisplayRow[],
  field: "graduationYear" | "strand" | "gender" | "certification" | "preparedness",
): BreakdownRow[] {
  const groups = new Map<string, BreakdownRow>()
  for (const row of rows) {
    const raw = row[field]
    const group = field === "preparedness" ? `Rating ${raw}` : String(raw || "Not provided")
    const current = groups.get(group) ?? { group, count: 0, outcomes: {}, predictedNeet: 0 }
    current.count += 1
    current.outcomes[row.predictedOutcome] = (current.outcomes[row.predictedOutcome] ?? 0) + 1
    if (row.neetPredicted) current.predictedNeet += 1
    groups.set(group, current)
  }
  return [...groups.values()].sort((a, b) => a.group.localeCompare(b.group, undefined, { numeric: true }))
}
