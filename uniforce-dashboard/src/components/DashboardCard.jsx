export default function DashboardCard({ title, children, action, className = '' }) {
  return (
    <div className={`card ${className}`}>
      {(title || action) && (
        <div className="flex justify-between items-center mb-4">
          {title && <h3 style={{ color: 'var(--text)', fontSize: 15, fontWeight: 600 }}>{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </div>
  )
}
