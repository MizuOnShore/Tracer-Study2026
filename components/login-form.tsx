"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

export function LoginForm({ configured, nextPath }: { configured: boolean; nextPath: string }) {
  const router = useRouter()
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!configured) return
    setBusy(true)
    setMessage("")
    const form = new FormData(event.currentTarget)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({
      email: String(form.get("email") ?? "").trim().toLowerCase(),
      password: String(form.get("password") ?? ""),
    })
    if (error) {
      setMessage("The email or password is incorrect, or the account is unavailable.")
      setBusy(false)
      return
    }
    router.replace(nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/dashboard")
    router.refresh()
  }

  return (
    <form onSubmit={submit}>
      {!configured && <div className="notice warning">Supabase is not configured. Login is unavailable and no sample credentials exist.</div>}
      {message && <div className="notice error" role="alert">{message}</div>}
      <div className="field"><label className="required" htmlFor="email">School account email</label><input id="email" name="email" type="email" autoComplete="username" required disabled={!configured} /></div>
      <div className="field"><label className="required" htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="current-password" required disabled={!configured} /></div>
      <button className="button" type="submit" disabled={!configured || busy}>{busy ? "Signing in…" : "Sign in"}</button>
      <p className="privacy-note">Accounts are created by a system administrator. Public self-registration is disabled.</p>
    </form>
  )
}
