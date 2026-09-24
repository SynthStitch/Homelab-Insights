import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import "./LandingPage.css";
import { fetchNodeSummary } from "../services/proxmoxApiClient.js";

const LANDING_NODE =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_PROXMOX_NODE) || "pve";

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));

const toNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const computePercent = (used, total) => {
  if (!Number.isFinite(used) || !Number.isFinite(total) || total <= 0) return null;
  return clamp((used / total) * 100);
};

const formatPercent = (value) => (Number.isFinite(value) ? `${value.toFixed(1)}%` : "--");

const formatGigabytes = (value) =>
  Number.isFinite(value) ? `${(value / 1024 ** 3).toFixed(1)} GB` : "--";

const formatUptime = (seconds) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return "--";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return days > 0 ? `${days}d ${hours}h` : `${hours}h ${minutes}m`;
};

const features = [
  {
    title: "Automated snapshots",
    copy: "Every node is polled on a fixed cadence and each sample lands in MongoDB, so charts have history the moment you open them.",
  },
  {
    title: "Unified telemetry",
    copy: "Proxmox nodes and VMs today. OpenTelemetry, Prometheus and Loki compose stacks are in the box when you want more.",
  },
  {
    title: "Stays on your network",
    copy: "Self-hosted API, database and UI. Nothing phones home. Bring your own OpenAI key if you want the copilot.",
  },
];

function LandingPage() {
  const [stats, setStats] = useState({
    cpuPercent: null,
    memPercent: null,
    memUsed: null,
    memTotal: null,
    uptimeSeconds: null,
    nodeStatus: "unknown",
  });
  const [status, setStatus] = useState({ type: "loading", label: "Syncing" });

  useEffect(() => {
    let aborted = false;
    fetchNodeSummary({ node: LANDING_NODE })
      .then((response) => {
        if (aborted) return;
        const data = response?.data;
        const memory = data?.memory ?? {};
        const totalMem = toNumber(memory.total ?? memory.max);
        const usedMem = toNumber(memory.used);
        setStats({
          cpuPercent: Number.isFinite(data?.cpu) ? clamp(data.cpu * 100) : null,
          memPercent: computePercent(usedMem, totalMem),
          memUsed: usedMem,
          memTotal: totalMem,
          uptimeSeconds: data?.uptimeSeconds ?? data?.uptime ?? null,
          nodeStatus: data?.status ?? "unknown",
        });
        setStatus({ type: "live", label: "Live" });
      })
      .catch((error) => {
        if (aborted) return;
        console.error("Landing page metrics failed", error);
        setStatus({ type: "error", label: "Offline" });
      });
    return () => {
      aborted = true;
    };
  }, []);

  const uptimeText = useMemo(() => formatUptime(stats.uptimeSeconds), [stats.uptimeSeconds]);
  const nodeStatus = (stats.nodeStatus || "unknown").toLowerCase();

  return (
    <div className="page landing">
      <section className="hero">
        <div className="hero__copy">
          <p className="eyebrow rise">homelab telemetry · proxmox · docker · otel</p>
          <h1 className="hero__title">
            <span className="rise" style={{ "--d": "60ms" }}>
              Monitor.
            </span>
            <span className="rise" style={{ "--d": "140ms" }}>
              Predict.
            </span>
            <span className="rise hero__accent" style={{ "--d": "220ms" }}>
              Optimize.
            </span>
          </h1>
          <p className="hero__lede rise" style={{ "--d": "300ms" }}>
            Real-time insight for every node in your homelab. Snapshots every fifteen seconds, one
            dashboard, and nothing leaves your network.
          </p>
          <div className="hero__actions rise" style={{ "--d": "380ms" }}>
            <Link to="/dashboard" className="btn btn--primary">
              Open dashboard
            </Link>
            <Link to="/overview" className="btn">
              How it works
            </Link>
          </div>
        </div>

        <aside className="readout rise" style={{ "--d": "200ms" }} aria-label="Live node readout">
          <div className="readout__head">
            <span className="panel__title">Live readout</span>
            <span className={`badge badge--${status.type}`}>{status.label}</span>
          </div>

          <div className="readout__row">
            <span className="stat__label">Node</span>
            <span className="readout__value">{LANDING_NODE}</span>
            <span className={`badge badge--${nodeStatus}`}>{nodeStatus}</span>
          </div>

          <div className="readout__row">
            <span className="stat__label">CPU</span>
            <span className="readout__value">{formatPercent(stats.cpuPercent)}</span>
            <span className="bar" style={{ "--w": `${stats.cpuPercent ?? 0}%`, "--c": "var(--accent)" }}>
              <i />
            </span>
          </div>

          <div className="readout__row">
            <span className="stat__label">Memory</span>
            <span className="readout__value">{formatPercent(stats.memPercent)}</span>
            <span className="readout__meta">
              {formatGigabytes(stats.memUsed ?? NaN)} / {formatGigabytes(stats.memTotal ?? NaN)}
            </span>
            <span className="bar" style={{ "--w": `${stats.memPercent ?? 0}%`, "--c": "var(--live)" }}>
              <i />
            </span>
          </div>

          <div className="readout__row">
            <span className="stat__label">Uptime</span>
            <span className="readout__value">{uptimeText}</span>
            <span className="readout__meta">since last reboot</span>
          </div>
        </aside>
      </section>

      <ol className="features">
        {features.map((feature, index) => (
          <li key={feature.title} className="feature rise" style={{ "--d": `${460 + index * 80}ms` }}>
            <span className="feature__index">0{index + 1}</span>
            <h3>{feature.title}</h3>
            <p>{feature.copy}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default LandingPage;
