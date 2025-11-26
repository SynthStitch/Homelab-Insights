import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import "./LandingPage.css";
import WavyBackground from "../components/WavyBackground.jsx";
import EncryptedText from "../components/EncryptedText.jsx";
import { CardBody, CardContainer, CardItem } from "../components/TiltCard.jsx";
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
  Number.isFinite(value) ? `${(value / 1024 ** 3).toFixed(2)} GB` : "--";

const formatUptime = (seconds) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return "--";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  return `${hours}h ${minutes}m`;
};

function LandingPage() {
  const [stats, setStats] = useState({
    cpuPercent: null,
    memPercent: null,
    memUsed: null,
    memTotal: null,
    uptimeSeconds: null,
    nodeStatus: "unknown",
  });
  const [status, setStatus] = useState({ type: "loading", message: "Syncing node status..." });

  useEffect(() => {
    let aborted = false;
    setStatus({ type: "loading", message: "Syncing node status..." });
    fetchNodeSummary({ node: LANDING_NODE })
      .then((response) => {
        if (aborted) return;
        const data = response?.data;
        const memory = data?.memory ?? {};
        const totalMem = toNumber(memory.total ?? memory.max);
        const usedMem = toNumber(memory.used);
        const cpuPercent = Number.isFinite(data?.cpu) ? clamp(data.cpu * 100, 0, 100) : null;
        const memPercent = computePercent(usedMem, totalMem);
        setStats({
          cpuPercent,
          memPercent,
          memUsed: usedMem,
          memTotal: totalMem,
          uptimeSeconds: data?.uptimeSeconds ?? data?.uptime ?? null,
          nodeStatus: data?.status ?? "unknown",
        });
        setStatus({ type: "ready", message: "Live metrics" });
      })
      .catch((error) => {
        if (aborted) return;
        console.error("Landing page metrics failed", error);
        setStatus({
          type: "error",
          message: error?.message || "Unable to fetch node metrics.",
        });
      });

    return () => {
      aborted = true;
    };
  }, []);

  const uptimeText = useMemo(() => formatUptime(stats.uptimeSeconds), [stats.uptimeSeconds]);
  const metricCards = useMemo(() => {
    const nodeStatus = (stats.nodeStatus || "unknown").toLowerCase();
    return [
      {
        id: "node",
        label: "Node",
        value: LANDING_NODE,
        subLabel: stats.nodeStatus || "Unknown",
        subClass: `metric-sub metric-status-${nodeStatus}`,
      },
      {
        id: "cpu",
        label: "CPU Utilization",
        value: formatPercent(stats.cpuPercent),
        subLabel: "Last 60 seconds",
      },
      {
        id: "memory",
        label: "Memory Consumption",
        value: formatPercent(stats.memPercent),
        subLabel: `${formatGigabytes(stats.memUsed ?? NaN)} / ${formatGigabytes(
          stats.memTotal ?? NaN,
        )}`,
      },
      {
        id: "uptime",
        label: "Uptime",
        value: uptimeText,
        subLabel: "Since last reboot",
      },
    ];
  }, [stats.cpuPercent, stats.memPercent, stats.memTotal, stats.memUsed, stats.nodeStatus, uptimeText]);

  const featureCards = useMemo(
    () => [
      {
        id: "snapshots",
        title: "Automated snapshots",
        copy: "Poll every 15 seconds and consolidate snapshots in MongoDB.",
      },
      {
        id: "telemetry",
        title: "Unified telemetry",
        copy: "Metrics, logs, and traces from Proxmox, Docker, and bare metal.",
      },
      {
        id: "selfhosted",
        title: "Self-hosted",
        copy: "Keep data on your network with local processing.",
      },
    ],
    [],
  );

  return (
    <WavyBackground
      containerClassName="landing-wave"
      className="landing-root"
      colors={["#1E293B", "#1D4ED8", "#0EA5E9", "#38BDF8"]}
      waveWidth={60}
      backgroundFill="#030712"
      blur={18}
      speed="slow"
      waveOpacity={0.4}
    >
      <div className="landing-grid">
        <div className="landing-left">
          <section className="landing-heading">
            <h1 className="landing-title">
              <EncryptedText
                text="Monitor."
                className="title-line"
                revealDelayMs={35}
                flipDelayMs={55}
              />
              <EncryptedText
                text="Predict."
                className="title-line"
                revealDelayMs={45}
                flipDelayMs={60}
              />
              <EncryptedText
                text="Optimize."
                className="title-line"
                revealDelayMs={55}
                flipDelayMs={70}
              />
            </h1>
            <p>Real-time insights for every node in your homelab.</p>
            <p className={`landing-status landing-status-${status.type}`}>{status.message}</p>
          </section>

          <section className="landing-actions">
            <Link to="/dashboard" className="landing-action landing-action--primary">
              View dashboard
            </Link>
            <a href="#learn" className="landing-action landing-action--ghost">
              Learn more
            </a>
          </section>

          <section className="landing-features" id="learn">
            {featureCards.map((feature) => (
              <CardContainer
                key={feature.id}
                containerClassName="landing-feature-container"
                className="landing-feature-tilt"
              >
                <CardBody className="landing-feature-card">
                  <CardItem as="strong" className="feature-title" translateZ={12}>
                    {feature.title}
                  </CardItem>
                  <CardItem as="p" className="feature-copy" translateZ={4}>
                    {feature.copy}
                  </CardItem>
                </CardBody>
              </CardContainer>
            ))}
          </section>
        </div>

        <aside className="landing-right">
          <section className="landing-metrics">
            {metricCards.map((metric) => (
              <CardContainer
                key={metric.id}
                containerClassName="landing-metric-container"
                className="landing-metric-tilt"
              >
                <CardBody className="landing-metric-card">
                  <CardItem as="strong" className="metric-title" translateZ={10} translateY={-2}>
                    {metric.label}
                  </CardItem>
                  <CardItem as="span" className="metric-value" translateZ={18}>
                    {metric.value}
                  </CardItem>
                  <CardItem
                    as="small"
                    className={metric.subClass || "metric-sub"}
                    translateZ={6}
                  >
                    {metric.subLabel}
                  </CardItem>
                </CardBody>
              </CardContainer>
            ))}
          </section>
        </aside>
      </div>
    </WavyBackground>
  );
}

export default LandingPage;
