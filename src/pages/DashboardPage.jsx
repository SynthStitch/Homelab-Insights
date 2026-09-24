import { useEffect, useRef, useState } from "react";
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

function DashboardPage() {
  const [cpuPoints, setCpuPoints] = useState(() => Array(SAMPLE_SIZE).fill(0));
  const [demoMode, setDemoMode] = useState(false);
  const [intervalMs, setIntervalMs] = useState(DEFAULT_INTERVAL);
  const [showThreeD, setShowThreeD] = useState(true);
  const [range, setRange] = useState("hour");
  // ponytail: two layouts, css does the work. "grid" = dense Grafana-style, "stack" = one column.
  const [layout, setLayout] = useState(() => {
    try {
      return localStorage.getItem("homelab-layout") || "grid";
    } catch {
      return "grid";
    }
  });
  const [lastUpdated, setLastUpdated] = useState(null);
  const [status, setStatus] = useState({ type: "loading", message: "Connecting to Proxmox…" });
  const [nodeSummary, setNodeSummary] = useState(null);
  const [vmList, setVmList] = useState([]);
  const [availableNodes, setAvailableNodes] = useState([PROXMOX_NODE]);
  const [selectedNode, setSelectedNode] = useState(PROXMOX_NODE);
  const [selectedVmid, setSelectedVmid] = useState(PROXMOX_VMID);
  const { auth } = useAuth();
  const ct = useChartTheme();
  const history = useHistory(selectedNode, range, demoMode);

  useEffect(() => {
    try {
      localStorage.setItem("homelab-layout", layout);
    } catch {
      /* ignore */
    }
    // Panels change width; let every chart re-measure after the CSS settles.
    const t = setTimeout(() => window.dispatchEvent(new Event("resize")), 60);
    return () => clearTimeout(t);
  }, [layout]);

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
        if (!unique.includes(selectedNode)) setSelectedNode(unique[0] || PROXMOX_NODE);
      } catch {
        if (aborted) return;
        setAvailableNodes((prev) => (prev?.length ? prev : [PROXMOX_NODE]));
      }
    };
    loadNodes();
    return () => {
      aborted = true;
    };
  }, [auth?.token, selectedNode]);

  useEffect(() => {
    if (demoMode) {
      setStatus({ type: "demo", message: "Demo mode. Synthetic data." });
      return;
    }
    let cancelled = false;
    setStatus((prev) => (prev.type === "error" ? { type: "loading", message: "Reconnecting to Proxmox…" } : prev));

    const loadTelemetry = async () => {
      try {
        const [snapResponse, nodeResponse, vmsResponse] = await Promise.all([
          fetchSnapshots({ node: selectedNode, vmid: selectedVmid, limit: SAMPLE_SIZE }),
          fetchNodeSummary({ node: selectedNode }),
          fetchNodeVms({ node: selectedNode }),
        ]);
        if (cancelled) return;

        const nodeData = nodeResponse?.data ?? null;
        setNodeSummary(nodeData);
        const vmData = Array.isArray(vmsResponse?.data) ? vmsResponse.data : [];
        setVmList(vmData);

        // If the current VMID isn't on this node, pick the first VM and refetch next tick.
        const hasCurrent = vmData.some((vm) => String(vm.id) === String(selectedVmid));
        if (!hasCurrent && vmData.length > 0) {
          setSelectedVmid(String(vmData[0].id));
          return;
        }

        const nodeName = nodeData?.node ?? selectedNode;
        const snapshots = Array.isArray(snapResponse?.data) ? snapResponse.data : [];
        const { cpu, last } = cpuSeriesFromSnapshots(snapshots);
        setCpuPoints(cpu);
        setLastUpdated(last);
        setStatus(
          snapshots.length === 0
            ? { type: "waiting", message: `Live · no snapshots yet for VMID ${selectedVmid} on ${nodeName}` }
            : { type: "live", message: nodeName },
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
  }, [demoMode, intervalMs, selectedNode, selectedVmid]);

  useEffect(() => {
    if (!demoMode) return undefined;
    const timer = setInterval(() => setCpuPoints(demoCpuStep), Math.min(intervalMs, 2000));
    return () => clearInterval(timer);
  }, [demoMode, intervalMs]);

  const nodeCpuPercent = Number.isFinite(nodeSummary?.cpu) ? clamp(nodeSummary.cpu * 100) : null;
  const nodeMemory = nodeSummary?.memory ?? {};
  const nodeMemPercent = computeNodeMemoryPercent(nodeMemory);
  const nodeMemUsed = toNumber(nodeMemory.used);
  const nodeMemTotal = toNumber(nodeMemory.total ?? nodeMemory.max);
  const nodeFsUsed = toNumber(nodeMemory.fs_used ?? nodeMemory.fsUsed);
  const nodeFsTotal = toNumber(nodeMemory.fs_total ?? nodeMemory.fsTotal);
  const nodeFsPercent = ratio(nodeFsUsed, nodeFsTotal);

  const nodeLoadAverage = (() => {
    if (!nodeSummary?.loadAvg) return "—";
    if (Array.isArray(nodeSummary.loadAvg)) return nodeSummary.loadAvg.map((value) => Number(value).toFixed(2)).join(" / ");
    const parts = String(nodeSummary.loadAvg).split(/\s+/).filter(Boolean).slice(0, 3);
    return parts.length ? parts.join(" / ") : "—";
  })();

  const runningVmCount = vmList.reduce((count, vm) => count + (vm?.status === "running" ? 1 : 0), 0);
  const nodeDisplayName = nodeSummary?.node ?? selectedNode ?? PROXMOX_NODE;
  const nodeUptimeSince =
    Number.isFinite(nodeSummary?.uptimeSeconds) && nodeSummary.uptimeSeconds > 0
      ? new Date(Date.now() - nodeSummary.uptimeSeconds * 1000).toLocaleString()
      : null;
  const nodeStatus = (nodeSummary?.status || "unknown").toLowerCase();
  const sortedVms = [...vmList].sort((a, b) => Number(a.id) - Number(b.id));

  const usageClass = (value) => (!Number.isFinite(value) ? "" : value >= 85 ? " is-hot" : value >= 65 ? " is-warm" : "");

  return (
    <div className="page dash" data-layout={layout}>
      <header className="page-head">
        <div>
          <p className="eyebrow">dashboard</p>
          <h1>{nodeDisplayName}</h1>
          <p className="dash__status">
            <span className={`badge badge--${status.type}`}>{status.type}</span>
            <span className="muted">{status.message}</span>
            {status.type === "live" ? <span className="mono sensitive dash__updated">VMID {selectedVmid}</span> : null}
            {status.type === "live" && lastUpdated ? <span className="mono dash__updated">updated {formatTimestamp(lastUpdated)}</span> : null}
          </p>
        </div>

        <div className="toolbar">
          <Field as="select" label="Node" name="node" value={selectedNode} onChange={(e) => setSelectedNode(e.target.value)}>
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
            <span className="panel__title">Node overview</span>
            <span className="panel__meta">
              {runningVmCount} / {vmList.length} guests running
            </span>
          </div>
          {nodeSummary ? (
            <div className="stats">
              <div className="stat">
                <span className="stat__label">Status</span>
                <span className="stat__value">{nodeDisplayName}</span>
                <span className={`badge badge--${nodeStatus}`}>{nodeStatus}</span>
              </div>
              <div className="stat">
                <span className="stat__label">CPU</span>
                <span className="stat__value">{pct(nodeCpuPercent)}</span>
                <span className="stat__meta">{Number.isFinite(nodeSummary?.maxCpu) ? `${nodeSummary.maxCpu} cores` : " "}</span>
                <span className="bar" style={{ "--w": `${nodeCpuPercent ?? 0}%`, "--c": ct.colors.accent }}>
                  <i />
                </span>
              </div>
              <div className="stat">
                <span className="stat__label">Memory</span>
                <span className="stat__value">{pct(nodeMemPercent)}</span>
                <span className="stat__meta">
                  {gb(nodeMemUsed)} / {gb(nodeMemTotal)}
                </span>
                <span className="bar" style={{ "--w": `${nodeMemPercent ?? 0}%`, "--c": ct.colors.live }}>
                  <i />
                </span>
              </div>
              <div className="stat">
                <span className="stat__label">Root FS</span>
                <span className="stat__value">{pct(nodeFsPercent)}</span>
                <span className="stat__meta">
                  {gb(nodeFsUsed)} / {gb(nodeFsTotal)}
                </span>
                <span className="bar" style={{ "--w": `${nodeFsPercent ?? 0}%`, "--c": ct.colors.info }}>
                  <i />
                </span>
              </div>
              <div className="stat">
                <span className="stat__label">Uptime</span>
                <span className="stat__value">{hm(nodeSummary?.uptimeSeconds)}</span>
                {nodeUptimeSince ? <span className="stat__meta">since {nodeUptimeSince}</span> : null}
              </div>
              <div className="stat">
                <span className="stat__label">
                  Load 1 / 5 / 15
                  <span className="hint" tabIndex={0} data-tip="Runnable tasks averaged over 1, 5 and 15 minutes. Values near your core count mean saturation.">
                    ?
                  </span>
                </span>
                <span className="stat__value stat__value--sm">{nodeLoadAverage}</span>
              </div>
            </div>
          ) : (
            <p className="muted">Waiting for node metrics…</p>
          )}
        </section>

        <section className="panel panel--guests">
          <div className="panel__head">
            <span className="panel__title">Resource allocation</span>
            <span className="panel__meta">{sortedVms.length} guests on this node</span>
          </div>
          {sortedVms.length === 0 ? (
            <p className="muted">No guests on this node.</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
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
                  {sortedVms.map((vm) => {
                    const memPct = ratio(vm.mem, vm.maxMem);
                    const diskPct = ratio(vm.disk, vm.maxDisk);
                    const active = String(vm.id) === String(selectedVmid);
                    return (
                      <tr key={vm.id} className={active ? "is-active" : ""} onClick={() => setSelectedVmid(String(vm.id))}>
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

        <Fleet
          nodes={availableNodes}
          selectedNode={selectedNode}
          selectedVmid={selectedVmid}
          intervalMs={intervalMs}
          demo={demoMode}
          onSelect={(node, vmid) => {
            setSelectedNode(node);
            setSelectedVmid(vmid);
          }}
        />

        <History className="history--cpu" node={selectedNode} demo={demoMode} history={history} metric="cpu" timeframe={range} legend="table" title="Guests CPU usage" />
        <History className="history--mem" node={selectedNode} demo={demoMode} history={history} metric="mem" timeframe={range} legend="table" title="Guests memory usage" />
        <History className="history--disk" node={selectedNode} demo={demoMode} history={history} metric="disk" timeframe={range} legend="table" title="Guests disk I/O" />
        <History className="history--net" node={selectedNode} demo={demoMode} history={history} metric="net" timeframe={range} legend="table" title="Guests network" />

        <section className="panel panel--gauge">
          <div className="panel__head">
            <span className="panel__title">Host CPU</span>
            <span className="panel__meta">{Number.isFinite(nodeSummary?.maxCpu) ? `${nodeSummary.maxCpu} cores` : "now"}</span>
          </div>
          <Gauge value={nodeCpuPercent} color={ct.colors.accent} />
        </section>

        <section className="panel panel--gauge">
          <div className="panel__head">
            <span className="panel__title">Host memory</span>
            <span className="panel__meta">
              {gb(nodeMemUsed)} / {gb(nodeMemTotal)}
            </span>
          </div>
          <Gauge value={nodeMemPercent} color={ct.colors.live} />
        </section>

        {showThreeD ? (
          <section className="panel panel--3d">
            <div className="panel__head">
              <span className="panel__title">CPU history · 3D</span>
              <span className="panel__meta">
                <span className="sensitive">VMID {selectedVmid}</span> · drag to orbit
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
