import { describe, expect, it } from "vitest"
import { summarizeAggregateRows } from "@/lib/dashboard-analytics"

describe("dashboard aggregate reconciliation", () => {
  it("reconciles outcome, year, strand, and cohort totals", () => {
    const summary = summarizeAggregateRows([
      { graduation_year: 2024, strand: "ICT", current_status: "employed", respondent_count: 8 },
      { graduation_year: 2024, strand: "ICT", current_status: "neet", respondent_count: 2 },
      { graduation_year: 2023, strand: "STEM", current_status: "higher_education", respondent_count: 7 },
      { graduation_year: 2023, strand: "ABM", current_status: "self_employed", respondent_count: 3 },
      { graduation_year: 2023, strand: "ABM", current_status: "training", respondent_count: 1 },
    ])

    expect(summary.total).toBe(21)
    expect(summary.years).toEqual([
      { key: "2023", label: "2023", count: 11 },
      { key: "2024", label: "2024", count: 10 },
    ])
    expect(summary.strands.map(({ label, count }) => [label, count])).toEqual([["ICT", 10], ["STEM", 7], ["ABM", 4]])
    expect(summary.cohorts.find((row) => row.graduation_year === 2024)).toMatchObject({ total: 10, employed: 8, neet: 2 })
  })

  it("ignores unknown statuses instead of corrupting dashboard totals", () => {
    const summary = summarizeAggregateRows([
      { graduation_year: 2024, strand: "ICT", current_status: "unknown", respondent_count: 99 },
    ])
    expect(summary.total).toBe(0)
  })
})
