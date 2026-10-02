export default function StatisticsCard({ icon, value, label, change, changeDir, color }) {
  return (
    <div className="stat-card" style={{ borderTop: `3px solid ${color || 'var(--accent)'}` }}>
      <span className="stat-icon">{icon}</span>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
      {change && <span className={`stat-change ${changeDir}`}>{changeDir === 'up' ? '▲' : '▼'} {change}</span>}
    </div>
  )
}
