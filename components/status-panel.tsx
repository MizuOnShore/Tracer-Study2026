import { CircleAlert, Database, type LucideIcon } from "lucide-react"

export function StatusPanel({
  title,
  description,
  code,
  icon: Icon = Database,
  children,
}: {
  title: string
  description: string
  code?: string
  icon?: LucideIcon
  children?: React.ReactNode
}) {
  return (
    <section className="status-panel">
      <span className="status-icon"><Icon size={24} /></span>
      <div><h2>{title}</h2><p>{description}</p>{code && <code>{code}</code>}{children}</div>
    </section>
  )
}

export function ErrorPanel({ title, description }: { title: string; description: string }) {
  return <StatusPanel title={title} description={description} icon={CircleAlert} />
}
