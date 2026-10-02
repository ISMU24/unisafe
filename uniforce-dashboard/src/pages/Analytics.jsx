import { useEffect, useState } from 'react'
import DashboardCard from '../components/DashboardCard.jsx'
import StatisticsCard from '../components/StatisticsCard.jsx'
import { ErrorBanner, LoadingBlock } from '../components/UniForceUI.jsx'
import { Bar, Doughnut } from 'react-chartjs-2'
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  ArcElement, Tooltip, Legend
} from 'chart.js'
import { getDashboardStats, getIncidents } from '../api.js'

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend)

const baseOpts = {
  responsive: true, maintainAspectRatio: false,
  plugins: { legend: { labels: { color: '#6B7280', boxWidth: 12 } } },
  scales: {
    x: { grid: { color: 'rgba(107,114,128,0.18)' }, ticks: { color: '#6B7280' } },
    y: { grid: { color: 'rgba(107,114,128,0.18)' }, ticks: { color: '#6B7280' }, beginAtZero: true },
  },
}

const CATEGORY_COLORS = {
  Security: '#2A5DA8', Ambulance: '#1F7A5C', Fire: '#C13B2E', Other: '#C97F1E',
}

const STAGE_ORDER = ['Submitted', 'Received', 'Under Review', 'Assigned', 'Responding', 'Resolved', 'Closed']

function countBy(rows, key, value) {
  return rows.filter((r) => r[key] === value).length
}

export default function Analytics() {
  const [incidents, setIncidents] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  async function load() {
    setLoading(true)
    try {
      const [rows, summary] = await Promise.all([
        getIncidents({ limit: 100 }),
        getDashboardStats().catch(() => null),
      ])
      setIncidents(rows)
      setStats(summary)
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const total = incidents.length
  const closedish = incidents.filter((i) => ['Resolved', 'Closed'].includes(i.status)).length
  const resolutionRate = total ? Math.round((closedish / total) * 100) : 0
  const activeSos = incidents.filter((i) => i.isSOS && !['Resolved', 'Cancelled'].includes(i.status)).length
  const open = total - closedish

  const categoryRows = ['Security', 'Fire', 'Ambulance', 'Other']
  const categoryCounts = categoryRows.map((c) => countBy(incidents, 'type', c))

  const donutData = {
    labels: categoryRows,
    datasets: [{
      data: categoryCounts,
      backgroundColor: categoryRows.map((c) => CATEGORY_COLORS[c]),
    }],
  }

  const categoryBarData = {
    labels: categoryRows,
    datasets: [{
      label: 'Incidents',
      data: categoryCounts,
      backgroundColor: categoryRows.map((c) => CATEGORY_COLORS[c]),
    }],
  }

  const statusData = {
    labels: STAGE_ORDER,
    datasets: [{
      label: 'Incidents',
      data: STAGE_ORDER.map((s) => countBy(incidents, 'status', s)),
      backgroundColor: '#2A5DA8',
    }],
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Analytics</h2>
          <p>Campus security performance metrics — live from the operations database</p>
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={load} />}
      {loading && <LoadingBlock label="Calculating metrics…" />}

      {!loading && (
        <>
          <div className="stats-grid">
            <StatisticsCard icon="📈" value={String(total)} label="Incidents Tracked" change={stats ? `${stats.incidents?.total ?? total} on record` : 'Live'} changeDir="up" color="var(--accent)" />
            <StatisticsCard icon="✅" value={`${resolutionRate}%`} label="Resolution Rate" change={`${closedish} resolved or closed`} changeDir={resolutionRate >= 50 ? 'up' : 'down'} color="var(--success)" />
            <StatisticsCard icon="🚨" value={String(activeSos)} label="Active SOS" change="Requiring response" changeDir="down" color="var(--warning)" />
            <StatisticsCard icon="📌" value={String(open)} label="Open Cases" change="Not yet resolved" changeDir="down" color="var(--info)" />
          </div>

          <div className="grid-2" style={{ marginBottom: 16 }}>
            <DashboardCard title="Incidents by Category">
              <div className="chart-wrap"><Bar data={categoryBarData} options={baseOpts} /></div>
            </DashboardCard>
            <DashboardCard title="Incident Type Distribution">
              <div className="chart-wrap"><Doughnut data={donutData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: '#6B7280', boxWidth: 12 } } } }} /></div>
            </DashboardCard>
          </div>

          <DashboardCard title="Cases by Status">
            <div className="chart-wrap"><Bar data={statusData} options={baseOpts} /></div>
          </DashboardCard>
        </>
      )}
    </>
  )
}
