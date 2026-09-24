import { useEffect, useMemo, useRef, useState } from "react";
import * as echarts from "echarts";
import ThreeMetricChart from "../components/ThreeMetricChart.jsx";
import Field from "../components/Field.jsx";
import Fleet from "../components/Fleet.jsx";
import History, { RANGES, useHistory } from "../components/History.jsx";
import { fetchSnapshots, fetchNodeSummary, fetchNodeVms } from "../services/proxmoxApiClient.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useChartTheme } from "../context/ThemeContext.jsx";
import "./DashboardPage.css";

const SAMPLE_SIZE = 20;
const ALL = "*";
const DEFAULT_INTERVAL =
  (typeof import.meta !== "undefined" && Number(import.meta.env?.VITE_PROXMOX_POLL_INTERVAL_MS)) || 15000;
const PROXMOX_NODE = (typeof import.meta !== "undefined" && import.meta.env?.VITE_PROXMOX_NODE) || "pve";
const PROXMOX_VMID = (typeof import.meta !== "undefined" && import.meta.env?.VITE_PROXMOX_VMID) || "102";
const API_BASE =
  typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE
    ? import.meta.env.VITE_API_BASE.replace(/\/$/, "")
    : ""; // ponytail: same-origin in prod; set VITE_API_BASE only for split dev servers

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));
const toNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};
const gb = (value) => (Number.isFinite(value) ? `${(value / 1024 ** 3).toFixed(1)} GB` : "—");
const pct = (value) => (Number.isFinite(value) ? `${value.toFixed(1)}%` : "—");
const ratio = (used, total) => (Number.isFinite(used) && Number.isFinite(total) && total > 0 ? clamp((used / total) * 100) : null);
const hm = (seconds) =>
  Number.isFinite(seconds) && seconds > 0 ? `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m` : "—";
const formatTimestamp = (value) => new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const readLocal = (key, fallback) => {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
};

const computeNodeMemoryPercent = (memory = {}) => {
  const total = toNumber(memory.total ?? memory.max);
  if (!total || total <= 0) return null;
  const used = toNumber(memory.used);
  if (Number.isFinite(used)) return clamp((used / total) * 100);
  const free = toNumber(memory.free ?? memory.available);
  if (Number.isFinite(free)) return clamp(((total - free) / total) * 100);
  return null;
};

// CPU series of the polled guest, for the 3D bars.
const cpuSeriesFromSnapshots = (snapshots) => {
  const sorted = (Array.isArray(snapshots) ? snapshots : [])
    .filter((snap) => snap?.collectedAt)
    .sort((a, b) => new Date(a.collectedAt) - new Date(b.collectedAt))
    .map((snap) => (Number.isFinite(snap?.cpuPercent) ? clamp(snap.cpuPercent) : 0));
  const padded = [...Array(Math.max(0, SAMPLE_SIZE - sorted.length)).fill(0), ...sorted.slice(-SAMPLE_SIZE)];
  return { cpu: padded, last: sorted.length ? snapshots.at(-1)?.collectedAt ?? null : null };
};

const demoCpuStep = (prev) => [...prev.slice(1), clamp((prev.at(-1) ?? 35) + (Math.random() * 18 - 9))];

/** Derived numbers for one node summary. */
function describeNode(summary) {
  const memory = summary?.memory ?? {};
  const memUsed = toNumber(memory.used);
  const memTotal = toNumber(memory.total ?? memory.max);
  const fsUsed = toNumber(memory.fs_used ?? memory.fsUsed);
  const fsTotal = toNumber(memory.fs_total ?? memory.fsTotal);
  const load = (() => {
    if (!summary?.loadAvg) return "—";
    if (Array.isArray(summary.loadAvg)) return summary.loadAvg.map((v) => Number(v).toFixed(2)).join(" / ");
    const parts = String(summary.loadAvg).split(/\s+/).filter(Boolean).slice(0, 3);
    return parts.length ? parts.join(" / ") : "—";
  })();
  return {
    status: (summary?.status || "unknown").toLowerCase(),
    cpu: Number.isFinite(summary?.cpu) ? clamp(summary.cpu * 100) : null,
    maxCpu: summary?.maxCpu,
    mem: computeNodeMemoryPercent(memory),
    memUsed,
    memTotal,
    fs: ratio(fsUsed, fsTotal),
    fsUsed,
    fsTotal,
    uptime: summary?.uptimeSeconds,
    since:
      Number.isFinite(summary?.uptimeSeconds) && summary.uptimeSeconds > 0
        ? new Date(Date.now() - summary.uptimeSeconds * 1000).toLocaleString()
        : null,
    load,
  };
}

/** Small arc gauge on the theme. */
function Gauge({ value, color }) {
  const ref = useRef(null);
  const chart = useRef(null);
  const ct = useChartTheme();

  useEffect(() => {
    if (!chart.current && ref.current) chart.current = echarts.init(ref.current);
    const resize = () => chart.current?.resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  useEffect(() => {
    chart.current?.setOption({
      series: [
        {
          type: "gauge",
          startAngle: 210,
          endAngle: -30,
          min: 0,
          max: 100,
          radius: "96%",
          center: ["50%", "60%"],
          progress: { show: true, width: 10, roundCap: ct.fx === "glass", itemStyle: { color } },
          axisLine: { roundCap: ct.fx === "glass", lineStyle: { width: 10, color: [[1, ct.colors.lineSoft]] } },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: { show: false },
          pointer: { show: false },
          anchor: { show: false },
          title: { show: false },
          detail: {
            valueAnimation: true,
            formatter: (v) => (Number.isFinite(v) ? `${Math.round(v)}%` : "—"),
            color: ct.colors.text,
            fontFamily: ct.fonts.mono,
            fontSize: 26,
            fontWeight: 600,
            offsetCenter: [0, "-8%"],
          },
          data: [{ value: Number.isFinite(value) ? Math.round(value) : 0 }],
        },
      ],
    });
  }, [value, color, ct]);

  return <div ref={ref} className="gauge" />;
}

function NodeStats({ name, summary, guests, ct, showName }) {
  const d = describeNode(summary);
  const running = guests.filter((g) => g.status === "running").length;
  return (
    <div className="node-block">
      {showName ? (
        <div className="node-block__head">
          <span className="node-block__name">{name}</span>
          <span className="panel__meta">
            {running} / {guests.length} guests running
          </span>
        </div>
      ) : null}
      {summary ? (
        <div className="stats">
          <div className="stat">
            <span className="stat__label">Status</span>
            <span className="stat__value">{summary.node ?? name}</span>
            <span className={`badge badge--${d.status}`}>{d.status}</span>
          </div>
          <div className="stat">
            <span className="stat__label">CPU</span>
            <span className="stat__value">{pct(d.cpu)}</span>
            <span className="stat__meta">{Number.isFinite(d.maxCpu) ? `${d.maxCpu} cores` : " "}</span>
            <span className="bar" style={{ "--w": `${d.cpu ?? 0}%`, "--c": ct.colors.accent }}>
              <i />
            </span>
          </div>
          <div className="stat">
            <span className="stat__label">Memory</span>
            <span className="stat__value">{pct(d.mem)}</span>
            <span className="stat__meta">
              {gb(d.memUsed)} / {gb(d.memTotal)}
            </span>
            <span className="bar" style={{ "--w": `${d.mem ?? 0}%`, "--c": ct.colors.live }}>
              <i />
            </span>
          </div>
          <div className="stat">
            <span className="stat__label">Root FS</span>
            <span className="stat__value">{pct(d.fs)}</span>
            <span className="stat__meta">
              {gb(d.fsUsed)} / {gb(d.fsTotal)}
            </span>
            <span className="bar" style={{ "--w": `${d.fs ?? 0}%`, "--c": ct.colors.info }}>
              <i />
            </span>
          </div>
          <div className="stat">
            <span className="stat__label">Uptime</span>
            <span className="stat__value">{hm(d.uptime)}</span>
            {d.since ? <span className="stat__meta">since {d.since}</span> : null}
          </div>
          <div className="stat">
            <span className="stat__label">
              Load 1 / 5 / 15
              <span className="hint" tabIndex={0} data-tip="Runnable tasks averaged over 1, 5 and 15 minutes. Values near your core count mean saturation.">
                ?
              </span>
            </span>
            <span className="stat__value stat__value--sm">{d.load}</span>
          </div>
        </div>
      ) : (
        <p className="muted">Waiting for node metrics…</p>
      )}
    </div>
  );
}

function DashboardPage() {
  const [cpuPoints, setCpuPoints] = useState(() => Array(SAMPLE_SIZE).fill(0));
  const [demoMode, setDemoMode] = useState(false);
  const [intervalMs, setIntervalMs] = useState(DEFAULT_INTERVAL);
  const [showThreeD, setShowThreeD] = useState(true);
  const [range, setRange] = useState("hour");
  // ponytail: two layouts, css does the work. "grid" = dense Grafana-style, "stack" = one column.
  const [layout, setLayout] = useState(() => readLocal("homelab-layout", "grid"));
  const [lastUpdated, setLastUpdated] = useState(null);
  const [status, setStatus] = useState({ type: "loading", message: "Connecting to Proxmox…" });
  const [summaries, setSummaries] = useState({}); // node -> summary
  const [guests, setGuests] = useState([]); // every guest in scope, tagged with node
  const [availableNodes, setAvailableNodes] = useState([PROXMOX_NODE]);
  // scope: one node key, or ALL. focus: the guest the 3D chart follows.
  const [scope, setScope] = useState(() => readLocal("homelab-scope", PROXMOX_NODE));
  const [focus, setFocus] = useState({ node: PROXMOX_NODE, vmid: PROXMOX_VMID });
  const { auth } = useAuth();
  const ct = useChartTheme();

  const scopeNodes = useMemo(() => (scope === ALL ? availableNodes : [scope]), [scope, availableNodes]);
  const multi = scopeNodes.length > 1;
  const history = useHistory(scopeNodes, range, demoMode);

  useEffect(() => {
    try {
      localStorage.setItem("homelab-layout", layout);
      localStorage.setItem("homelab-scope", scope);
    } catch {
      /* ignore */
    }
  }, [layout, scope]);

  useEffect(() => {
    // Panels change width; let every chart re-measure after the CSS settles.
    const t = setTimeout(() => window.dispatchEvent(new Event("resize")), 60);
    return () => clearTimeout(t);
  }, [layout, scope]);

  useEffect(() => {
    let aborted = false;
    const token = auth?.token;
    if (!token) return undefined;
    const loadNodes = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/proxmox/nodes`, {
          headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (aborted) return;
        const nodes = Array.isArray(data?.nodes) ? data.nodes.map((n) => n?.name ?? n?.node).filter(Boolean) : [];
        // Saved nodes replace the env fallback (the poller does the same).
        const unique = nodes.length ? Array.from(new Set(nodes)) : [PROXMOX_NODE];
        setAvailableNodes(unique);
        setScope((prev) => (prev === ALL || unique.includes(prev) ? prev : unique[0] || PROXMOX_NODE));
        setFocus((prev) => (unique.includes(prev.node) ? prev : { node: unique[0] || PROXMOX_NODE, vmid: prev.vmid }));
      } catch {
        if (aborted) return;
        setAvailableNodes((prev) => (prev?.length ? prev : [PROXMOX_NODE]));
      }
    };
    loadNodes();
    return () => {
      aborted = true;
    };
  }, [auth?.token]);

  const scopeKey = scopeNodes.join("|");

  useEffect(() => {
    if (demoMode) {
      setStatus({ type: "demo", message: "Demo mode. Synthetic data." });
      return;
    }
    let cancelled = false;
    setStatus((prev) => (prev.type === "error" ? { type: "loading", message: "Reconnecting to Proxmox…" } : prev));
    const nodes = scopeKey.split("|").filter(Boolean);

    const loadTelemetry = async () => {
      try {
        const [perNode, snapResponse] = await Promise.all([
          Promise.all(
            nodes.map(async (node) => {
              const [nodeResponse, vmsResponse] = await Promise.all([fetchNodeSummary({ node }), fetchNodeVms({ node })]);
              const vms = (Array.isArray(vmsResponse?.data) ? vmsResponse.data : []).map((vm) => ({ ...vm, node }));
              return { node, summary: nodeResponse?.data ?? null, vms };
            }),
          ),
          fetchSnapshots({ node: focus.node, vmid: focus.vmid, limit: SAMPLE_SIZE }).catch(() => null),
        ]);
        if (cancelled) return;

        setSummaries(Object.fromEntries(perNode.map((r) => [r.node, r.summary])));
        const all = perNode.flatMap((r) => r.vms);
        setGuests(all);

        // Keep the focus on a guest that exists; otherwise fall to the first running one in scope.
        const hasFocus = all.some((vm) => vm.node === focus.node && String(vm.id) === String(focus.vmid));
        if (!hasFocus && all.length > 0) {
          const pick = all.find((vm) => vm.status === "running") ?? all[0];
          setFocus({ node: pick.node, vmid: String(pick.id) });
          return;
        }

        const snapshots = Array.isArray(snapResponse?.data) ? snapResponse.data : [];
        const { cpu, last } = cpuSeriesFromSnapshots(snapshots);
        setCpuPoints(cpu);
        setLastUpdated(last);
        const label = nodes.length > 1 ? `${nodes.length} nodes` : nodes[0];
        setStatus(
          snapshots.length === 0
            ? { type: "waiting", message: `Live · ${label} · no snapshots yet for VMID ${focus.vmid} on ${focus.node}` }
            : { type: "live", message: label },
        );
      } catch (err) {
        if (cancelled) return;
        console.error("Failed to load Proxmox telemetry", err);
        setStatus({ type: "error", message: err?.message || "Failed to load Proxmox telemetry." });
      }
    };

    loadTelemetry();
    const timer = setInterval(loadTelemetry, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [demoMode, intervalMs, scopeKey, focus.node, focus.vmid]);

  useEffect(() => {
    if (!demoMode) return undefined;
    const timer = setInterval(() => setCpuPoints(demoCpuStep), Math.min(intervalMs, 2000));
    return () => clearInterval(timer);
  }, [demoMode, intervalMs]);

  const selectGuest = (node, vmid) => {
    setFocus({ node, vmid: String(vmid) });
    if (scope !== ALL && node !== scope) setScope(node);
  };

  const title = scope === ALL ? "All nodes" : (summaries[scope]?.node ?? scope);
  const sortedGuests = [...guests].sort((a, b) => a.node.localeCompare(b.node) || Number(a.id) - Number(b.id));
  const runningCount = guests.filter((g) => g.status === "running").length;
  const usageClass = (value) => (!Number.isFinite(value) ? "" : value >= 85 ? " is-hot" : value >= 65 ? " is-warm" : "");

  return (
    <div className="page dash" data-layout={layout}>
      <header className="page-head">
        <div>
          <p className="eyebrow">dashboard</p>
          <h1>{title}</h1>
          <p className="dash__status">
            <span className={`badge badge--${status.type}`}>{status.type}</span>
            <span className="muted">{status.message}</span>
            {status.type === "live" ? (
              <span className="mono sensitive dash__updated">
                3D: {focus.node} · VMID {focus.vmid}
              </span>
            ) : null}
            {status.type === "live" && lastUpdated ? <span className="mono dash__updated">updated {formatTimestamp(lastUpdated)}</span> : null}
          </p>
        </div>

        <div className="toolbar">
          <Field as="select" label="Node" name="node" value={scope} onChange={(e) => setScope(e.target.value)}>
            {availableNodes.length > 1 ? <option value={ALL}>All nodes</option> : null}
            {availableNodes.map((node) => (
              <option key={node} value={node}>
                {node}
              </option>
            ))}
          </Field>
          <Field
            label="Interval (ms)"
            name="interval"
            type="number"
            value={intervalMs}
            min={1000}
            step={1000}
            onChange={(e) => setIntervalMs(Math.max(1000, Number(e.target.value) || DEFAULT_INTERVAL))}
          />
          <div className="seg toolbar__seg" role="tablist" aria-label="History range">
            {RANGES.map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={range === id} className={`seg__btn${range === id ? " is-active" : ""}`} onClick={() => setRange(id)}>
                {label}
              </button>
            ))}
          </div>
          <div className="seg toolbar__seg" role="tablist" aria-label="Layout">
            {[
              ["grid", "Grid"],
              ["stack", "Stack"],
            ].map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={layout === id} className={`seg__btn${layout === id ? " is-active" : ""}`} onClick={() => setLayout(id)}>
                {label}
              </button>
            ))}
          </div>
          <div className="toolbar__toggles">
            <label className="check">
              <input type="checkbox" checked={demoMode} onChange={(e) => setDemoMode(e.target.checked)} />
              Demo
            </label>
            <label className="check">
              <input type="checkbox" checked={showThreeD} onChange={(e) => setShowThreeD(e.target.checked)} />
              3D
            </label>
          </div>
        </div>
      </header>

      <div className="dash__grid">
        <section className="panel panel--overview">
          <div className="panel__head">
            <span className="panel__title">{multi ? "Nodes overview" : "Node overview"}</span>
            <span className="panel__meta">
              {runningCount} / {guests.length} guests running
            </span>
          </div>
          <div className={`node-blocks${multi ? " node-blocks--multi" : ""}`}>
            {scopeNodes.map((node) => (
              <NodeStats key={node} name={node} summary={summaries[node]} guests={guests.filter((g) => g.node === node)} ct={ct} showName={multi} />
            ))}
          </div>
        </section>

        <section className="panel panel--guests">
          <div className="panel__head">
            <span className="panel__title">Resource allocation</span>
            <span className="panel__meta">
              {sortedGuests.length} guests{multi ? ` across ${scopeNodes.length} nodes` : " on this node"}
            </span>
          </div>
          {sortedGuests.length === 0 ? (
            <p className="muted">No guests in scope.</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    {multi ? <th>Node</th> : null}
                    <th>ID</th>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th className="num">vCPU</th>
                    <th className="num">Memory</th>
                    <th className="num">Mem %</th>
                    <th className="num">Disk</th>
                    <th className="num">Disk %</th>
                    <th className="num">Uptime</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedGuests.map((vm) => {
                    const memPct = ratio(vm.mem, vm.maxMem);
                    const diskPct = ratio(vm.disk, vm.maxDisk);
                    const active = vm.node === focus.node && String(vm.id) === String(focus.vmid);
                    return (
                      <tr key={`${vm.node}:${vm.id}`} className={active ? "is-active" : ""} onClick={() => selectGuest(vm.node, vm.id)}>
                        {multi ? <td className="mono">{vm.node}</td> : null}
                        <td className="mono sensitive">
                          {vm.type === "lxc" ? "lxc" : "qemu"}/{vm.id}
                        </td>
                        <td className="table__name">{vm.name}</td>
                        <td className="mono">{vm.type === "lxc" ? "lxc" : "vm"}</td>
                        <td>
                          <span className={`badge badge--${(vm.status || "unknown").toLowerCase()}`}>{vm.status ?? "unknown"}</span>
                        </td>
                        <td className="num mono">{Number.isFinite(vm.maxCpu) ? vm.maxCpu : "—"}</td>
                        <td className="num mono">{gb(vm.maxMem)}</td>
                        <td className={`num mono${usageClass(memPct)}`}>{pct(memPct)}</td>
                        <td className="num mono">{gb(vm.maxDisk)}</td>
                        <td className={`num mono${usageClass(diskPct)}`}>{pct(diskPct)}</td>
                        <td className="num mono">{hm(vm.uptimeSeconds)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <Fleet nodes={availableNodes} selectedNode={focus.node} selectedVmid={focus.vmid} intervalMs={intervalMs} demo={demoMode} onSelect={selectGuest} />

        <History className="history--cpu" demo={demoMode} history={history} metric="cpu" timeframe={range} legend="table" title="Guests CPU usage" />
        <History className="history--mem" demo={demoMode} history={history} metric="mem" timeframe={range} legend="table" title="Guests memory usage" />
        <History className="history--disk" demo={demoMode} history={history} metric="disk" timeframe={range} legend="table" title="Guests disk I/O" />
        <History className="history--net" demo={demoMode} history={history} metric="net" timeframe={range} legend="table" title="Guests network" />

        {scopeNodes.map((node) => {
          const d = describeNode(summaries[node]);
          return (
            <div key={node} className="gauge-pair">
              <section className="panel panel--gauge">
                <div className="panel__head">
                  <span className="panel__title">{multi ? `${node} · CPU` : "Host CPU"}</span>
                  <span className="panel__meta">{Number.isFinite(d.maxCpu) ? `${d.maxCpu} cores` : "now"}</span>
                </div>
                <Gauge value={d.cpu} color={ct.colors.accent} />
              </section>
              <section className="panel panel--gauge">
                <div className="panel__head">
                  <span className="panel__title">{multi ? `${node} · memory` : "Host memory"}</span>
                  <span className="panel__meta">
                    {gb(d.memUsed)} / {gb(d.memTotal)}
                  </span>
                </div>
                <Gauge value={d.mem} color={ct.colors.live} />
              </section>
            </div>
          );
        })}

        {showThreeD ? (
          <section className="panel panel--3d">
            <div className="panel__head">
              <span className="panel__title">CPU history · 3D</span>
              <span className="panel__meta">
                <span className="sensitive">
                  {focus.node} · VMID {focus.vmid}
                </span>{" "}
                · drag to orbit
              </span>
            </div>
            <ThreeMetricChart key={ct.colors.bgElev} data={cpuPoints} color={ct.colors.accent} background={ct.colors.bgElev} gridColor={ct.colors.line} interactive />
          </section>
        ) : null}
      </div>
    </div>
  );
}

export default DashboardPage;
