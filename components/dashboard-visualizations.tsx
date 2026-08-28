"use client"

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import type { DashboardSummary } from "@/lib/dashboard-analytics"

type Props = {
  summary: DashboardSummary
  committedBatches: number
  averageSubjectRelevance: number | null
  averagePreparedness: number | null
}

export function DashboardVisualizations({
  summary,
  committedBatches,
  averageSubjectRelevance,
  averagePreparedness,
}: Props) {
  return (
    <section className="dashboard-chart-grid" aria-label="Imported graduate outcomes charts">
      <article className="chart-card">
        <div className="chart-heading"><div><span>Primary outcome</span><h2>Pathway distribution</h2></div><strong>{summary.total.toLocaleString("en-PH")}</strong></div>
        <div className="chart-body chart-body-pie" role="img" aria-label="Donut chart showing imported respondent distribution across five current statuses">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={summary.outcomes} dataKey="count" nameKey="label" innerRadius={58} outerRadius={88} paddingAngle={2} isAnimationActive={false}>
                {summary.outcomes.map((item) => <Cell key={item.key} fill={item.color} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ul className="chart-legend" aria-label="Imported pathway distribution values">
          {summary.outcomes.map((item) => <li key={item.key}><span className="legend-dot" style={{ backgroundColor: item.color }} /><span>{item.label}</span><strong>{item.count.toLocaleString("en-PH")}</strong></li>)}
        </ul>
      </article>

      <article className="chart-card">
        <div className="chart-heading"><div><span>Cohort coverage</span><h2>Imported respondents by year</h2></div></div>
        <div className="chart-body" role="img" aria-label="Bar chart showing imported respondent count by graduation year">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={summary.years} margin={{ top: 12, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#dde3eb" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#5c687a" }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#5c687a" }} axisLine={false} tickLine={false} />
              <Tooltip />
              <Bar dataKey="count" name="Imported respondents" fill="#1d5d91" radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </article>

      <article className="chart-card">
        <div className="chart-heading"><div><span>Program coverage</span><h2>Imported respondents by strand</h2></div></div>
        <div className="chart-body chart-body-tall" role="img" aria-label="Horizontal bar chart showing imported respondent count by SHS strand">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={summary.strands} layout="vertical" margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#dde3eb" />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "#5c687a" }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="label" width={58} tick={{ fontSize: 11, fill: "#5c687a" }} axisLine={false} tickLine={false} />
              <Tooltip />
              <Bar dataKey="count" name="Imported respondents" fill="#176b4d" radius={[0, 4, 4, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </article>

      <article className="chart-card">
        <div className="chart-heading"><div><span>Dataset scope</span><h2>Imported preparation measures</h2></div></div>
        <div className="dataset-scope" aria-label="Import-only dashboard scope">
          <strong>{summary.total.toLocaleString("en-PH")}</strong>
          <span>respondents from {committedBatches.toLocaleString("en-PH")} committed file{committedBatches === 1 ? "" : "s"}</span>
          <small>Website survey responses excluded</small>
        </div>
        <div className="rating-grid" aria-label="Average imported SHS preparation ratings">
          <Rating label="Subject relevance" value={averageSubjectRelevance} />
          <Rating label="Preparedness" value={averagePreparedness} />
        </div>
        <p className="chart-note">Ratings use the persisted 1–5 tracer scale from committed import rows only.</p>
      </article>
    </section>
  )
}

function Rating({ label, value }: { label: string; value: number | null }) {
  const safeValue = value !== null && Number.isFinite(value) ? Math.min(5, Math.max(0, value)) : 0
  return <div className="rating-card"><span>{label}</span><strong>{value === null ? "—" : safeValue.toFixed(2)}</strong><div className="progress-track"><span style={{ width: String((safeValue / 5) * 100) + "%" }} /></div><small>out of 5</small></div>
}
