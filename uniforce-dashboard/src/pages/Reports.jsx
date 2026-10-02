import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line } from "recharts";
import { SectionHeader, LoadingBlock, ErrorBanner } from "../components/UniForceUI.jsx";
import { blue } from "../services/mockData.js";
import { getIncidents } from "../api.js";
import { useTheme } from "../context/ThemeContext.jsx";

const CATEGORIES = ["Security", "Fire", "Ambulance", "Other"];

function buildByType(incidents) {
  return CATEGORIES.map((type) => ({
    type,
    count: incidents.filter((i) => i.type === type).length,
  }));
}

// Bucket real incidents into the last 6 calendar weeks by submittedAt.
function buildWeekly(incidents) {
  const weeks = [];
  const now = new Date();
  for (let i = 5; i >= 0; i -= 1) {
    const end = new Date(now);
    end.setDate(now.getDate() - i * 7);
    const start = new Date(end);
    start.setDate(end.getDate() - 7);
    weeks.push({
      week: start.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
      from: start.getTime(),
      to: end.getTime(),
      reports: 0,
    });
  }
  incidents.forEach((incident) => {
    const at = new Date(incident.createdAt || incident.submittedAt).getTime();
    if (Number.isNaN(at)) return;
    const bucket = weeks.find((w) => at >= w.from && at < w.to);
    if (bucket) bucket.reports += 1;
  });
  return weeks.map(({ week, reports }) => ({ week, reports }));
}

function toCsv(rows) {
  return rows
    .map((row) =>
      [row.id, row.type, row.status, row.priority, row.reporter, row.loc, row.time]
        .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
        .join(","),
    )
    .join("\n");
}

export default function Reports() {
  const { dark } = useTheme();
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const tickColor = dark ? "#6b7a99" : "#6B7280";
  const gridColor = dark ? "#2a3147" : "#E4E4DF";
  const tooltipStyle = { fontSize: 12, borderRadius: 8, background: dark ? "#161b27" : "#fff", border: `1px solid ${dark ? "#2a3147" : "#E4E4DF"}`, color: dark ? "#c9d1e0" : "#0B1F33" };
  const barFill = dark ? "#c9d1e0" : "#0B1F33";

  async function load() {
    setLoading(true);
    try {
      setIncidents(await getIncidents({ limit: 100 }));
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function downloadCsv() {
    const header = "ID,Type,Status,Priority,Reporter,Location,Reported";
    const blob = new Blob([`${header}\n${toCsv(incidents)}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `unisafe-incidents-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      <SectionHeader title="Reports and analytics" sub="Trends across the current semester" />
      {error && <ErrorBanner message={error} onRetry={load} />}
      {loading && <LoadingBlock label="Building report data…" />}

      {!loading && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", marginBottom: 12 }}>Incidents by type</div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={buildByType(incidents)}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                  <XAxis dataKey="type" tick={{ fontSize: 11, fill: tickColor }} axisLine={{ stroke: gridColor }} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: tickColor }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="count" fill={barFill} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", marginBottom: 12 }}>Report volume — last 6 weeks</div>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={buildWeekly(incidents)}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                  <XAxis dataKey="week" tick={{ fontSize: 11, fill: tickColor }} axisLine={{ stroke: gridColor }} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: tickColor }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line type="monotone" dataKey="reports" stroke={blue} strokeWidth={2.5} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          <button
            onClick={downloadCsv}
            disabled={!incidents.length}
            style={{
              marginTop: 16, background: "var(--accent)", color: "#fff", border: "none", borderRadius: 8,
              padding: "10px 18px", fontSize: 12.5, fontWeight: 700,
              cursor: incidents.length ? "pointer" : "not-allowed", opacity: incidents.length ? 1 : 0.5,
            }}
          >
            {incidents.length ? `Export ${incidents.length} incidents (CSV)` : 'No incidents to export'}
          </button>
        </>
      )}
    </div>
  );
}
