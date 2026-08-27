import Link from "next/link"
import { BarChart3, ClipboardList, FileUp, History, LayoutDashboard, Lightbulb, LogOut, ShieldCheck, Sparkles, Users } from "lucide-react"
import type { Profile } from "@/lib/database.types"

const links = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/imports", label: "Import & validation", icon: FileUp },
  { href: "/respondents", label: "Respondent records", icon: ClipboardList },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/predictions", label: "Predictions", icon: Sparkles },
  { href: "/insights", label: "Discussion & insights", icon: Lightbulb },
]

export function AppShell({ profile, children }: { profile: Profile; children: React.ReactNode }) {
  return (
    <div className="app-frame">
      <aside className="sidebar">
        <Link className="brand sidebar-brand" href="/dashboard">
          <span className="brand-mark"><BarChart3 size={20} /></span>
          <span><strong>DJIHS Tracer</strong><small>Decision Support System</small></span>
        </Link>
        <nav className="side-nav" aria-label="Application navigation">
          {links.map(({ href, label, icon: Icon }) => <Link href={href} key={href}><Icon size={18} />{label}</Link>)}
          {profile.role === "admin" && <Link href="/admin"><Users size={18} />User management</Link>}
          {profile.role === "admin" && <Link href="/audit"><History size={18} />Audit history</Link>}
        </nav>
        <div className="sidebar-user">
          <ShieldCheck size={18} />
          <div><strong>{profile.full_name}</strong><span>{profile.role === "admin" ? "Administrator" : "Authorized user"}</span></div>
        </div>
        <form action="/api/auth/logout" method="post"><button className="side-logout" type="submit"><LogOut size={17} />Sign out</button></form>
      </aside>
      <main className="app-content">{children}</main>
    </div>
  )
}
