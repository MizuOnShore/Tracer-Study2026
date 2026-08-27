import Link from "next/link"
import { InstitutionalHeader } from "@/components/institutional-header"
import { StatusPanel } from "@/components/status-panel"

export default function SetupPage() {
  return (
    <>
      <InstitutionalHeader />
      <main className="auth-page">
        <div className="auth-card" style={{ width: "min(680px, 100%)" }}>
          <StatusPanel
            title="System setup is required"
            description="Supabase has not been connected. Apply the repository migration, configure the environment variables, and create the first administrator before using internal modules. No fallback records are being displayed."
            code="DATA_STORE_NOT_CONFIGURED"
          >
            <p><Link className="button secondary small" href="/">Return to public home</Link></p>
          </StatusPanel>
        </div>
      </main>
    </>
  )
}
