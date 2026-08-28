export const OUTCOME_STATUSES = [
  { key: "higher_education", label: "Higher education", color: "#1d5d91" },
  { key: "employed", label: "Employed", color: "#176b4d" },
  { key: "self_employed", label: "Self employed", color: "#7c5aa6" },
  { key: "training", label: "Training", color: "#d27a16" },
  { key: "neet", label: "NEET", color: "#a22b32" },
] as const

export type OutcomeStatus = (typeof OUTCOME_STATUSES)[number]["key"]

export type AggregateRow = {
  graduation_year: number
  strand: string
  current_status: string
  respondent_count: number
}

export type CountDatum = { key: string; label: string; count: number; color?: string }

export type CohortDatum = {
  graduation_year: number
  total: number
  higher_education: number
  employed: number
  self_employed: number
  training: number
  neet: number
}

export type DashboardSummary = {
  total: number
  outcomes: CountDatum[]
  years: CountDatum[]
  strands: CountDatum[]
  cohorts: CohortDatum[]
}

export function summarizeAggregateRows(rows: AggregateRow[]): DashboardSummary {
  const outcomeCounts = new Map<OutcomeStatus, number>(OUTCOME_STATUSES.map((item) => [item.key, 0]))
  const yearCounts = new Map<number, number>()
  const strandCounts = new Map<string, number>()
  const cohortCounts = new Map<number, CohortDatum>()

  for (const row of rows) {
    const count = Number(row.respondent_count)
    const year = Number(row.graduation_year)
    if (!Number.isFinite(count) || count < 0 || !Number.isInteger(year)) continue

    const status = OUTCOME_STATUSES.find((item) => item.key === row.current_status)?.key
    if (!status) continue

    outcomeCounts.set(status, (outcomeCounts.get(status) ?? 0) + count)
    yearCounts.set(year, (yearCounts.get(year) ?? 0) + count)
    strandCounts.set(row.strand, (strandCounts.get(row.strand) ?? 0) + count)

    const cohort = cohortCounts.get(year) ?? {
      graduation_year: year,
      total: 0,
      higher_education: 0,
      employed: 0,
      self_employed: 0,
      training: 0,
      neet: 0,
    }
    cohort.total += count
    cohort[status] += count
    cohortCounts.set(year, cohort)
  }

  const outcomes = OUTCOME_STATUSES.map((item) => ({ ...item, count: outcomeCounts.get(item.key) ?? 0 }))
  const years = [...yearCounts].sort(([a], [b]) => a - b).map(([year, count]) => ({ key: String(year), label: String(year), count }))
  const strands = [...strandCounts]
    .sort(([strandA, countA], [strandB, countB]) => countB - countA || strandA.localeCompare(strandB))
    .map(([strand, count]) => ({ key: strand, label: strand, count }))
  const cohorts = [...cohortCounts.values()].sort((a, b) => b.graduation_year - a.graduation_year)

  return { total: outcomes.reduce((sum, item) => sum + item.count, 0), outcomes, years, strands, cohorts }
}
