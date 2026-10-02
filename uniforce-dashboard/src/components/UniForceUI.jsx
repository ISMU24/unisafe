import { ArrowUpRight, ArrowDownRight, AlertTriangle } from "lucide-react";
import { red, amber, teal, blue, CATEGORY } from "../services/mockData.js";

export function LoadingBlock({ label = "Loading…" }) {
  return (
    <div role="status" aria-live="polite" style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "26px 14px", justifyContent: "center",
      fontSize: 12.5, color: "var(--text-muted)",
    }}>
      <span style={{
        width: 14, height: 14, borderRadius: "50%",
        border: "2px solid var(--border)", borderTopColor: "var(--text-muted)",
        animation: "uf-spin 0.8s linear infinite",
      }} />
      {label}
      <style>{"@keyframes uf-spin{to{transform:rotate(360deg)}}"}</style>
    </div>
  );
}

export function ErrorBanner({ message, onRetry }) {
  if (!message) return null;
  return (
    <div role="alert" style={{
      display: "flex", alignItems: "center", gap: 9,
      padding: "10px 13px", marginBottom: 14,
      borderRadius: 10,
      border: `1px solid ${red}55`,
      background: `${red}12`,
      fontSize: 12.5, color: "var(--text)",
    }}>
      <AlertTriangle size={15} color={red} style={{ flexShrink: 0 }} />
      <span style={{ flex: 1 }}>{message}</span>
      {onRetry && (
        <button onClick={onRetry} style={{
          background: "var(--bg2)", border: `1px solid var(--border)`, borderRadius: 8,
          padding: "4px 11px", fontSize: 11.5, fontWeight: 700,
          color: "var(--text)", cursor: "pointer",
        }}>Retry</button>
      )}
    </div>
  );
}

// These always use the semantic accent colors (same in both themes).
// Keys must cover every value of the server's `incident_status` and
// `sos_status` enums, otherwise a live status renders as a neutral pill.
const STATUS_COLORS = {
  // incident_status
  "Submitted":         { c: "#6B7280", bg: "#EEEEEC" },
  "Received":          { c: blue,      bg: "#E7EFFA" },
  "Under Review":      { c: amber,     bg: "#FBF0DF" },
  "Assigned":          { c: blue,      bg: "#E7EFFA" },
  "Responding":        { c: amber,     bg: "#FBF0DF" },
  "Resolved":          { c: teal,      bg: "#E4F2EC" },
  "Closed":            { c: "#6B7280", bg: "#EEEEEC" },
  "Cancelled":         { c: "#6B7280", bg: "#EEEEEC" },
  // sos_status
  "Active":            { c: red,       bg: "#FBE7E7" },
  "Acknowledged":      { c: amber,     bg: "#FBF0DF" },
};

export function StatusPill({ status }) {
  const s = STATUS_COLORS[status] || STATUS_COLORS["Submitted"];
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color: s.c, background: s.bg, padding: "3px 9px", borderRadius: 20, whiteSpace: "nowrap" }}>
      {status || "Submitted"}
    </span>
  );
}

export function CatBadge({ type }) {
  const c = CATEGORY[type] || CATEGORY.Other;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: c.color }}>
      <c.icon size={13} /> {type}
    </span>
  );
}

export function DutyPill({ status }) {
  const map = {
    "On duty":  { c: teal,      bg: "#E4F2EC" },
    "On call":  { c: amber,     bg: "#FBF0DF" },
    "Off duty": { c: "#6B7280", bg: "#EEEEEC" },
  };
  const s = map[status] || map["Off duty"];
  return <span style={{ fontSize: 11, fontWeight: 700, color: s.c, background: s.bg, padding: "3px 9px", borderRadius: 20, width: "fit-content" }}>{status}</span>;
}

// Theme-aware: uses CSS variables
export function TableHeader({ cols, widths }) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: widths || "90px 110px 1fr 160px 70px 140px 24px",
      padding: "10px 14px",
      background: "var(--bg3)",
      borderBottom: "1px solid var(--border)",
    }}>
      {cols.map((c, i) => (
        <span key={i} style={{ fontSize: 10.5, fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.3 }}>{c}</span>
      ))}
    </div>
  );
}

export function SectionHeader({ title, sub }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 19, fontWeight: 800, color: "var(--text)" }}>{title}</div>
      <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 2 }}>{sub}</div>
    </div>
  );
}

export function StatCard({ label, value, delta, up, icon: Icon, color }) {
  return (
    <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 11.5, color: "var(--text-muted)", fontWeight: 600 }}>{label}</span>
        <Icon size={15} color={color} />
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, color: "var(--text)", marginTop: 6 }}>{value}</div>
      {delta && (
        <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 4, display: "flex", alignItems: "center", gap: 3 }}>
          {up === true  && <ArrowUpRight   size={11} color={red}  />}
          {up === false && <ArrowDownRight size={11} color={teal} />}
          {delta}
        </div>
      )}
    </div>
  );
}

export function DetailRow({ label, value, icon: Icon, last }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "7px 0", borderBottom: last ? "none" : "1px solid var(--border)",
    }}>
      <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", display: "flex", alignItems: "center", gap: 4 }}>
        {Icon && <Icon size={12} color="var(--text-muted)" />} {value}
      </span>
    </div>
  );
}
