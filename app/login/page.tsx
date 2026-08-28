import type { Metadata } from "next"
import { InstitutionalHeader } from "@/components/institutional-header"
import { LoginForm } from "@/components/login-form"
import { isSupabaseConfigured } from "@/lib/config"

export const metadata: Metadata = { title: "Authorized user login" }

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; reason?: string }> }) {
  const query = await searchParams
  return (
    <>
      <InstitutionalHeader />
      <main className="auth-page">
        <section className="auth-card">
          <span className="eyebrow">Restricted access</span>
          <h1>Authorized user login</h1>
          <p>For designated DJIHS administrators and school personnel. Tracer records enter the system only through validated file imports.</p>
          {query.reason === "account_inactive" && <div className="notice error">This account is inactive. Contact the system administrator.</div>}
          <LoginForm configured={isSupabaseConfigured} nextPath={query.next ?? "/dashboard"} />
        </section>
      </main>
    </>
  )
}
