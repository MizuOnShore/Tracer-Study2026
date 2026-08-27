"use client"

import { useState } from "react"
import { GENDERS, GRADUATION_YEARS, NEET_REASONS, STATUS_LABELS, STRANDS } from "@/lib/survey-schema"

type Consent = "pending" | "yes" | "no"
type Status = keyof typeof STATUS_LABELS | ""

function value(form: FormData, name: string) { return String(form.get(name) ?? "").trim() }

export function SurveyForm({ configured }: { configured: boolean }) {
  const [consent, setConsent] = useState<Consent>("pending")
  const [status, setStatus] = useState<Status>("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [responseId, setResponseId] = useState("")

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError("")
    const form = new FormData(event.currentTarget)
    const payload: Record<string, unknown> = {
      client_request_id: crypto.randomUUID(),
      consent_given: true,
      email: value(form, "email"),
      full_name: value(form, "full_name"),
      gender: value(form, "gender"),
      age: value(form, "age"),
      graduation_year: value(form, "graduation_year"),
      strand: value(form, "strand"),
      certification: value(form, "certification"),
      current_status: status,
      subject_relevance: value(form, "subject_relevance"),
      preparedness: value(form, "preparedness"),
      challenges: value(form, "challenges"),
      support_needed: value(form, "support_needed"),
      feedback: value(form, "feedback"),
      website: value(form, "website"),
    }
    if (status === "higher_education") Object.assign(payload, { higher_education_course: value(form, "higher_education_course"), higher_education_relation: value(form, "higher_education_relation") })
    if (status === "employed") Object.assign(payload, { employer_name: value(form, "employer_name"), job_title: value(form, "job_title"), employment_relation: value(form, "employment_relation") })
    if (status === "self_employed") Object.assign(payload, { business_nature: value(form, "business_nature"), business_relation: value(form, "business_relation") })
    if (status === "training") Object.assign(payload, { training_center: value(form, "training_center"), training_title: value(form, "training_title"), training_relation: value(form, "training_relation") })
    if (status === "neet") Object.assign(payload, { neet_reasons: form.getAll("neet_reasons").map(String), actively_seeking: value(form, "actively_seeking") === "yes" })

    const response = await fetch("/api/surveys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).catch(() => null)
    const result = response ? await response.json().catch(() => ({})) : {}
    if (!response?.ok) {
      setError(String(result.message ?? "The response could not be saved. Please check your connection and try again."))
      setBusy(false)
      return
    }
    setResponseId(String(result.response_id))
    setBusy(false)
  }

  if (responseId) {
    return <div className="notice success" role="status"><strong>Response received.</strong><br />Your answers were stored successfully. Reference: {responseId}</div>
  }

  return (
    <form onSubmit={submit}>
      {!configured && <div className="notice warning">Submission is currently unavailable because the school data service has not been configured. You may review the questionnaire, but no response can be stored.</div>}
      <section className="form-section">
        <h2>Consent and contact</h2>
        <p>Required questions 1–2</p>
        <div className="field-grid">
          <div className="field full"><label className="required" htmlFor="survey-email">1. Email</label><input id="survey-email" name="email" type="email" autoComplete="email" required /></div>
          <fieldset className="field full">
            <legend className="required">2. Do you voluntarily consent to participate in this study?</legend>
            <div className="choice-list">
              <label className="choice"><input type="radio" name="consent" required checked={consent === "yes"} onChange={() => setConsent("yes")} />Yes</label>
              <label className="choice"><input type="radio" name="consent" required checked={consent === "no"} onChange={() => setConsent("no")} />No</label>
            </div>
          </fieldset>
        </div>
      </section>

      {consent === "no" && <div className="notice info" role="status">You have declined participation. The questionnaire has ended, and no response has been submitted or stored.</div>}
      {consent === "yes" && <>
        <section className="form-section">
          <h2>Graduate profile</h2><p>Required questions 3–8</p>
          <div className="field-grid">
            <div className="field full"><label className="required" htmlFor="full_name">3. Full Name</label><input id="full_name" name="full_name" autoComplete="name" maxLength={150} required /></div>
            <div className="field"><label className="required" htmlFor="gender">4. Gender</label><select id="gender" name="gender" defaultValue="" required><option value="" disabled>Select one</option>{GENDERS.map((item) => <option key={item}>{item}</option>)}</select></div>
            <div className="field"><label className="required" htmlFor="age">5. Age</label><input id="age" name="age" type="number" min={14} max={100} step={1} required /></div>
            <div className="field"><label className="required" htmlFor="graduation_year">6. Year graduated</label><select id="graduation_year" name="graduation_year" defaultValue="" required><option value="" disabled>Select year</option>{GRADUATION_YEARS.map((year) => <option key={year}>{year}</option>)}</select></div>
            <div className="field"><label className="required" htmlFor="strand">7. Strand</label><select id="strand" name="strand" defaultValue="" required><option value="" disabled>Select strand</option>{STRANDS.map((item) => <option key={item}>{item}</option>)}</select></div>
            <div className="field full"><label className="required" htmlFor="certification">8. Certifications / qualifications</label><select id="certification" name="certification" defaultValue="" required><option value="" disabled>Select one</option><option>NC II</option><option>NC I</option><option>None</option><option>Other</option></select></div>
          </div>
        </section>

        <section className="form-section">
          <h2>Current post-SHS status</h2><p>Your selection determines the next questions shown.</p>
          <div className="field"><label className="required" htmlFor="current_status">9. What is your primary current status?</label><select id="current_status" name="current_status" value={status} onChange={(event) => setStatus(event.target.value as Status)} required><option value="" disabled>Select current status</option>{Object.entries(STATUS_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
        </section>

        {status === "higher_education" && <section className="form-section"><h2>Higher education</h2><div className="field-grid"><div className="field full"><label className="required" htmlFor="higher_education_course">10. Degree Program / Course</label><input id="higher_education_course" name="higher_education_course" required /></div><RelationQuestion number={11} id="higher_education_relation" label="Is your course related to your SHS strand?" /></div></section>}
        {status === "employed" && <section className="form-section"><h2>Employment</h2><div className="field-grid"><div className="field"><label className="required" htmlFor="employer_name">12. Company</label><input id="employer_name" name="employer_name" required /></div><div className="field"><label className="required" htmlFor="job_title">13. Job title</label><input id="job_title" name="job_title" required /></div><RelationQuestion number={14} id="employment_relation" label="Is your job related to your SHS strand?" /></div></section>}
        {status === "self_employed" && <section className="form-section"><h2>Entrepreneurship</h2><div className="field-grid"><div className="field full"><label className="required" htmlFor="business_nature">15. Nature of Business</label><input id="business_nature" name="business_nature" required /></div><RelationQuestion number={16} id="business_relation" label="Is your business related to your SHS specialization?" /></div></section>}
        {status === "training" && <section className="form-section"><h2>Training</h2><div className="field-grid"><div className="field"><label className="required" htmlFor="training_center">17. Training Center</label><input id="training_center" name="training_center" required /></div><div className="field"><label className="required" htmlFor="training_title">18. Training / Course Title</label><input id="training_title" name="training_title" required /></div><div className="field full"><label className="required" htmlFor="training_relation">19. Relationship to SHS specialization</label><select id="training_relation" name="training_relation" defaultValue="" required><option value="" disabled>Select one</option><option>Directly related</option><option>Indirectly related</option><option>Not related / new skill</option></select></div></div></section>}
        {status === "neet" && <section className="form-section"><h2>Current transition situation</h2><div className="field-grid"><fieldset className="field full"><legend className="required">20. Reason(s) for not currently being in education, employment, or training</legend><div className="choice-list">{NEET_REASONS.map((reason) => <label className="choice" key={reason}><input type="checkbox" name="neet_reasons" value={reason} />{reason}</label>)}</div></fieldset><fieldset className="field full"><legend className="required">21. Are you actively looking for work or planning to enroll soon?</legend><div className="choice-list"><label className="choice"><input type="radio" name="actively_seeking" value="yes" required />Yes</label><label className="choice"><input type="radio" name="actively_seeking" value="no" required />No</label></div></fieldset></div></section>}

        {status && <section className="form-section">
          <h2>Preparedness, challenges, and feedback</h2><p>Required questions 22–26</p>
          <div className="field-grid">
            <RatingQuestion number={22} name="subject_relevance" label="Relevance of your SHS subjects" low="Very" high="Very Relevant" />
            <RatingQuestion number={23} name="preparedness" label="How prepared did SHS make you?" low="Very" high="Very Prepared" />
            <div className="field full"><label className="required" htmlFor="challenges">24. What primary challenges did you encounter after SHS?</label><textarea id="challenges" name="challenges" maxLength={2000} required /></div>
            <div className="field full"><label className="required" htmlFor="support_needed">25. What assistance or support do you need?</label><textarea id="support_needed" name="support_needed" maxLength={2000} required /></div>
            <div className="field full"><label className="required" htmlFor="feedback">26. Additional feedback or recommendations</label><textarea id="feedback" name="feedback" maxLength={2000} required /></div>
            <div aria-hidden="true" style={{ position: "absolute", left: "-10000px" }}><label htmlFor="website">Website</label><input id="website" name="website" tabIndex={-1} autoComplete="off" /></div>
          </div>
          {error && <div className="notice error" role="alert">{error}</div>}
          <div className="form-actions"><button className="button" type="submit" disabled={!configured || busy}>{busy ? "Submitting…" : "Submit response"}</button><span className="privacy-note">Submission does not grant access to internal system modules.</span></div>
        </section>}
      </>}
    </form>
  )
}

function RelationQuestion({ number, id, label }: { number: number; id: string; label: string }) {
  return <div className="field full"><label className="required" htmlFor={id}>{number}. {label}</label><select id={id} name={id} defaultValue="" required><option value="" disabled>Select one</option><option>Yes</option><option>No</option><option>Partially</option></select></div>
}

function RatingQuestion({ number, name, label, low, high }: { number: number; name: string; label: string; low: string; high: string }) {
  return <div className="field"><label className="required" htmlFor={name}>{number}. {label}</label><select id={name} name={name} defaultValue="" required><option value="" disabled>Select rating</option><option value="1">1 — {low}</option><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="5">5 — {high}</option></select></div>
}
