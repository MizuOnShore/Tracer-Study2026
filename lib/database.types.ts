export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type AppRole = "admin" | "user"
export type AccountStatus = "active" | "inactive"
export type PostShsStatus = "higher_education" | "employed" | "self_employed" | "training" | "neet"
export type ModelKind = "pathway" | "neet"

export interface Profile {
  id: string
  email: string
  full_name: string
  role: AppRole
  status: AccountStatus
  created_at: string
  updated_at: string
}

export interface RespondentRecord {
  id: string
  import_batch_id: string | null
  source: "survey" | "import"
  source_row_number: number | null
  email: string
  full_name: string
  gender: "Female" | "Male" | "Prefer not to say" | "Other"
  age: number
  graduation_year: number
  strand: "ABM" | "GAS" | "HUMMS" | "ICT" | "STEM" | "SPORTS" | "TVL"
  certification: string
  current_status: PostShsStatus
  subject_relevance: number
  preparedness: number
  challenges: string
  support_needed: string
  feedback: string
  canonical_data: Json
  record_fingerprint: string
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface ModelRegistryEntry {
  id: string
  kind: ModelKind
  version: string
  status: "training" | "evaluated" | "active" | "retired" | "failed"
  artifact_path: string | null
  preprocessing_path: string | null
  metadata_path: string | null
  feature_schema_version: string
  training_record_count: number | null
  activated_at: string | null
}

// Supabase accepts this intentionally small structural type. Generate a full
// type file from the deployed project before production deployment.
export interface Database {
  public: {
    Tables: Record<string, {
      Row: Record<string, unknown>
      Insert: Record<string, unknown>
      Update: Record<string, unknown>
      Relationships: []
    }>
    Views: Record<string, {
      Row: Record<string, unknown>
      Relationships: []
    }>
    Functions: Record<string, { Args: Record<string, unknown>; Returns: unknown }>
    Enums: Record<string, string>
    CompositeTypes: never
  }
}
