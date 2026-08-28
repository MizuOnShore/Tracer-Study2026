import Link from "next/link"
import { CheckCircle2, Database, FileCheck2, ShieldCheck } from "lucide-react"
import { InstitutionalHeader } from "@/components/institutional-header"

export default function HomePage() {
  return (
    <>
      <InstitutionalHeader />
      <main>
        <section className="hero">
          <div className="hero-copy">
            <span className="eyebrow">Calamba</span>
            <h1>Graduate tracer analysis for evidence-based school decisions.</h1>
            <p>A secure import, validation, analytics, and prediction workspace for understanding the post–Senior High School outcomes recorded in authorized tracer datasets.</p>
            <div className="hero-actions">
              <Link className="button" href="/login">Authorized user login</Link>
            </div>
          </div>
          <aside className="hero-card" aria-label="System scope">
            <h2>What the system supports</h2>
            <ul className="feature-list">
              <li><CheckCircle2 size={19} />Validated CSV and XLSX tracer records</li>
              <li><CheckCircle2 size={19} />Aggregate dashboards prepared for Power BI</li>
              <li><CheckCircle2 size={19} />Data-driven pathway and separate NEET predictions</li>
              <li><CheckCircle2 size={19} />Role-protected accounts, history, and model versions</li>
            </ul>
          </aside>
        </section>
        <section className="principles" aria-label="System safeguards">
          <div className="principles-inner">
            <div>
              <ShieldCheck size={22} />
              <h2>Restricted data access</h2>
              <p>Only authorized school personnel can import tracer files or access records, analytics, predictions, and administration.</p>
            </div>
            <div>
              <FileCheck2 size={22} />
              <h2>Validated provenance</h2>
              <p>Imported records remain linked to their original private file, checksum, validation results, and committed batch.</p>
            </div>
            <div>
              <Database size={22} />
              <h2>Honest data states</h2>
              <p>No demo graduates, invented metrics, or placeholder model predictions are shown as real.</p>
            </div>
          </div>
        </section>
      </main>
    </>
  )
}
