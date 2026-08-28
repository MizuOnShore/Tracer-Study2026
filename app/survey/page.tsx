import type { Metadata } from "next"
import { InstitutionalHeader } from "@/components/institutional-header"
import { SurveyForm } from "@/components/survey-form"
import { isSurveySubmissionConfigured } from "@/lib/config"

export const metadata: Metadata = { title: "SHS graduate survey" }

export default function SurveyPage() {
  return (
    <>
      <InstitutionalHeader />
      <main className="survey-page">
        <div className="survey-container">
          <header className="survey-intro">
            <span className="eyebrow">Alumni tracer questionnaire</span>
            <h1>SHS GRAD SURVEY</h1>
            <p>Development and Evaluation of a Stacked Ensemble Learning Model for Predicting K-12 Graduate Employability Pathways</p>
          </header>
          <section className="survey-card">
            <p className="privacy-note">Participation is voluntary. Your response will be kept confidential, used for the stated research and school decision-support purposes, and reported in aggregate. Required fields are marked with an asterisk.</p>
            <SurveyForm configured={isSurveySubmissionConfigured} />
          </section>
        </div>
      </main>
    </>
  )
}
