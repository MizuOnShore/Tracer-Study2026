import Link from "next/link"
import { BarChart3 } from "lucide-react"

export function InstitutionalHeader() {
  return (
    <header className="public-header">
      <Link className="brand" href="/" aria-label="DJIHS tracer system home">
        <span className="brand-mark" aria-hidden="true"><BarChart3 size={20} /></span>
        <span><strong>DJIHS Tracer System</strong><small>Decision Support and Graduate Outcomes</small></span>
      </Link>
      <nav aria-label="Public navigation">
        <Link href="/survey">Alumni survey</Link>
        <Link className="button secondary small" href="/login">Authorized user login</Link>
      </nav>
    </header>
  )
}
