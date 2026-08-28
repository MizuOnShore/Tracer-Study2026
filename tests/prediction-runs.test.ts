import { describe, expect, it } from "vitest"
import { confidenceBand, groupPredictionRows, summarizePredictionRows, type BatchDisplayRow } from "@/lib/prediction-runs"

const rows: BatchDisplayRow[] = [
  { sourceRow: 2, sourceIdentifier: "Record 1", graduationYear: 2025, strand: "ICT", gender: "Female", certification: "NC II", preparedness: 4, predictedOutcome: "Employment-oriented", confidence: 0.86, pathwayClass: "0", neetPredicted: false, neetProbability: 0.12 },
  { sourceRow: 3, sourceIdentifier: "Record 2", graduationYear: 2025, strand: "ICT", gender: "Male", certification: "None", preparedness: 2, predictedOutcome: "Education-oriented", confidence: 0.67, pathwayClass: "1", neetPredicted: true, neetProbability: 0.71 },
  { sourceRow: 4, sourceIdentifier: "Record 3", graduationYear: 2024, strand: "STEM", gender: "Female", certification: "None", preparedness: 5, predictedOutcome: "Employment-oriented", confidence: 0.49, pathwayClass: "0", neetPredicted: false, neetProbability: 0.22 },
]

describe("batch prediction analytics", () => {
  it("summarizes only supplied model results", () => {
    expect(summarizePredictionRows(rows)).toEqual({ processed: 3, predictedNeet: 1, outcomeCounts: { "Employment-oriented": 2, "Education-oriented": 1 }, confidenceCounts: { High: 1, Medium: 1, Low: 1 } })
  })

  it("uses documented confidence thresholds", () => {
    expect(confidenceBand(0.8)).toBe("High")
    expect(confidenceBand(0.6)).toBe("Medium")
    expect(confidenceBand(0.599)).toBe("Low")
  })

  it("calculates group counts without inventing missing groups", () => {
    expect(groupPredictionRows(rows, "strand")).toEqual([
      { group: "ICT", count: 2, outcomes: { "Employment-oriented": 1, "Education-oriented": 1 }, predictedNeet: 1 },
      { group: "STEM", count: 1, outcomes: { "Employment-oriented": 1 }, predictedNeet: 0 },
    ])
  })
})
