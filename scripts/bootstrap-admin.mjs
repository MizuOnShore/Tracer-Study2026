import { createClient } from "@supabase/supabase-js"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase()
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD
const fullName = process.env.BOOTSTRAP_ADMIN_FULL_NAME?.trim()

if (!url || !key || !email || !password || !fullName) {
  throw new Error("Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD, and BOOTSTRAP_ADMIN_FULL_NAME.")
}
if (password.length < 12) throw new Error("The bootstrap password must contain at least 12 characters.")

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName } })
if (error || !data.user) throw error ?? new Error("Supabase did not create the administrator.")
const { error: profileError } = await supabase.from("profiles").insert({ id: data.user.id, email, full_name: fullName, role: "admin", status: "active" })
if (profileError) {
  await supabase.auth.admin.deleteUser(data.user.id)
  throw profileError
}
process.stdout.write(`Administrator created: ${data.user.id}\n`)
