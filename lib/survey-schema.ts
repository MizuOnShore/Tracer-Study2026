import { z } from "zod"

export const GRADUATION_YEARS = [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025] as const
export const STRANDS = ["ABM", "GAS", "HUMMS", "ICT", "STEM", "SPORTS", "TVL"] as const
export const GENDERS = ["Female", "Male", "Prefer not to say", "Other"] as const
export const NEET_REASONS = [
  "Financial constraints",
  "Family concerns",
  "Domestic responsibilities",
  "Health-related reasons",
  "Lack of interest in further studies",
  "Waiting for results of previous applications",
  "No job opportunities in local area",
] as const

const requiredText = (label: string, max = 1000) =>
  z.string().trim().min(1, `${label} is required.`).max(max, `${label} is too long.`)

const common = z.object({
  client_request_id: z.string().uuid(),
  consent_given: z.literal(true),
  email: z.string().trim().toLowerCase().email().max(254),
  full_name: requiredText("Full name", 150),
  gender: z.enum(GENDERS),
  age: z.coerce.number().int().min(14).max(100),
  graduation_year: z.coerce.number().refine(
    (year): year is (typeof GRADUATION_YEARS)[number] => GRADUATION_YEARS.includes(year as never),
    "Select a graduation year from 2018 to 2025.",
  ),
  strand: z.enum(STRANDS),
  certification: requiredText("Certification or qualification", 200),
  subject_relevance: z.coerce.number().int().min(1).max(5),
  preparedness: z.coerce.number().int().min(1).max(5),
  challenges: requiredText("Primary challenges", 2000),
  support_needed: requiredText("Assistance or support needed", 2000),
  feedback: requiredText("Feedback or recommendations", 2000),
  website: z.string().max(0).optional(),
})

const relation = z.enum(["Yes", "No", "Partially"])

export const surveySchema = z.discriminatedUnion("current_status", [
  common.extend({
    current_status: z.literal("higher_education"),
    higher_education_course: requiredText("Degree program or course", 300),
    higher_education_relation: relation,
  }),
  common.extend({
    current_status: z.literal("employed"),
    employer_name: requiredText("Company", 300),
    job_title: requiredText("Job title", 300),
    employment_relation: relation,
  }),
  common.extend({
    current_status: z.literal("self_employed"),
    business_nature: requiredText("Nature of business", 500),
    business_relation: relation,
  }),
  common.extend({
    current_status: z.literal("training"),
    training_center: requiredText("Training center", 300),
    training_title: requiredText("Training or course title", 300),
    training_relation: z.enum(["Directly related", "Indirectly related", "Not related / new skill"]),
  }),
  common.extend({
    current_status: z.literal("neet"),
    neet_reasons: z.array(z.enum(NEET_REASONS)).min(1, "Select at least one reason."),
    actively_seeking: z.boolean(),
  }),
])

export type SurveySubmission = z.infer<typeof surveySchema>

export const STATUS_LABELS: Record<SurveySubmission["current_status"], string> = {
  higher_education: "Enrolled in Higher Education",
  employed: "Employed",
  self_employed: "Self Employed / Running Business",
  training: "Training Related Courses (TESDA, etc.)",
  neet: "Not currently in education, employment, or training",
}
