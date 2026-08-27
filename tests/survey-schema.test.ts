import { describe, expect, it } from "vitest"
import { surveySchema } from "@/lib/survey-schema"

const common = {
  client_request_id: "b932589a-b410-4c78-a70b-4b1896378e24",
  consent_given: true,
  email: "graduate@example.com",
  full_name: "Graduate One",
  gender: "Female",
  age: 20,
  graduation_year: 2023,
  strand: "HUMMS",
  certification: "None",
  subject_relevance: 4,
  preparedness: 4,
  challenges: "Finding local opportunities",
  support_needed: "Career guidance",
  feedback: "Continue alumni outreach",
  website: "",
}

describe("survey branching validation", () => {
  it("accepts complete employment details", () => {
    expect(surveySchema.safeParse({ ...common, current_status: "employed", employer_name: "Company", job_title: "Assistant", employment_relation: "Partially" }).success).toBe(true)
  })

  it("rejects an employed response without its branch details", () => {
    expect(surveySchema.safeParse({ ...common, current_status: "employed" }).success).toBe(false)
  })

  it("does not accept declined consent as a submission", () => {
    expect(surveySchema.safeParse({ ...common, consent_given: false, current_status: "training", training_center: "Center", training_title: "Course", training_relation: "Directly related" }).success).toBe(false)
  })

  it("requires a NEET reason but does not infer NEET from unemployment text", () => {
    expect(surveySchema.safeParse({ ...common, current_status: "neet", neet_reasons: [], actively_seeking: true }).success).toBe(false)
  })
})
