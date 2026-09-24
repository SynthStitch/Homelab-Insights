import { useCallback, useEffect, useRef, useState } from "react";
import * as echarts from "echarts";
import { select } from "d3-selection";
import ThreeMetricChart from "../components/ThreeMetricChart.jsx";
import Field from "../components/Field.jsx";
import Fleet from "../components/Fleet.jsx";
import { fetchSnapshots, fetchNodeSummary, fetchNodeVms } from "../services/proxmoxApiClient.js";
import { useAuth } from "../context/AuthContext.jsx";
import { colors, axisStyle, legendStyle, tooltipStyle, fonts } from "../lib/theme.js";
import "./DashboardPage.css";

const SAMPLE_SIZE = 20;
const DEFAULT_INTERVAL =
  (typeof import.meta !== "undefined" &&
    Number(import.meta.env?.VITE_PROXMOX_POLL_INTERVAL_MS)) ||
  15000;
const PROXMOX_NODE =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_PROXMOX_NODE) || "pve";
const PROXMOX_VMID =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_PROXMOX_VMID) || "102";
const API_BASE =
  typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE
    ? import.meta.env.VITE_API_BASE.replace(/\/$/, "")
    : ""; // ponytail: same-origin in prod; set VITE_API_BASE only for split dev servers

const blankSeries = (value = 0) => Array(SAMPLE_SIZE).fill(value);

const createEmptyPoints = () => ({
  time: blankSeries("--"),
  cpu: blankSeries(0),
  mem: 0,
  netIn: blankSeries(0),
  netOut: blankSeries(0),
  diskRead: blankSeries(0),
  diskWrite: blankSeries(0),
});

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));

const padSeries = (series, size, fillValue) => {
  if (series.length >= size) return series.slice(series.length - size);
  return [...Array(size - series.length).fill(fillValue), ...series];
};

const toNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const computeRateFromRaw = (currentValue, previousValue, deltaSeconds) => {
  const current = toNumber(currentValue);
  const previous = toNumber(previousValue);
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return 0;
  const delta = current - previous;
  if (!Number.isFinite(delta) || delta <= 0) return 0;
  return deltaSeconds > 0 ? delta / deltaSeconds : 0;
};

const bytesToMegabytesPerSecond = (bytesPerSecond) =>
  Number.isFinite(bytesPerSecond) && bytesPerSecond > 0
    ? Math.round((bytesPerSecond / (1024 * 1024)) * 100) / 100
    : 0;

const bytesToKilobitsPerSecond = (bytesPerSecond) =>
  Number.isFinite(bytesPerSecond) && bytesPerSecond > 0
    ? Math.round(((bytesPerSecond * 8) / 1024) * 100) / 100
    : 0;

const computeNodeMemoryPercent = (memory = {}) => {
  const total = toNumber(memory.total ?? memory.max);
  if (!total || total <= 0) return null;
  const used = toNumber(memory.used);
  if (Number.isFinite(used)) return clamp((used / total) * 100);
  const free = toNumber(memory.free ?? memory.available);
  if (Number.isFinite(free)) return clamp(((total - free) / total) * 100);
  return null;
};

const computeMemoryPercent = (snapshot) => {
  const memory = snapshot?.memory ?? {};
  const raw = snapshot?.raw ?? {};
  const max = toNumber(memory.max ?? raw.maxmem);
  if (!max || max <= 0) return null;
  const usedDirect = toNumber(memory.used ?? raw.mem);
  if (Number.isFinite(usedDirect)) return clamp((usedDirect / max) * 100);
  const free = toNumber(memory.free ?? raw.freemem);
  if (Number.isFinite(free)) return clamp(((max - free) / max) * 100);
  return null;
};

const formatTimestamp = (value) =>
  new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

const gb = (value) => (Number.isFinite(value) ? `${(value / 1024 ** 3).toFixed(1)} GB` : "—");
const pct = (value) => (Number.isFinite(value) ? `${value.toFixed(1)}%` : "—");
const hm = (seconds) =>
  Number.isFinite(seconds)
    ? `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
    : "—";

const transformSnapshots = (snapshots) => {
  if (!Array.isArray(snapshots) || snapshots.length === 0) {
    return { points: createEmptyPoints(), lastTimestamp: null };
  }
  const sorted = snapshots
    .filter((snap) => snap?.collectedAt)
    .sort((a, b) => new Date(a.collectedAt) - new Date(b.collectedAt));
  if (sorted.length === 0) return { points: createEmptyPoints(), lastTimestamp: null };

  const time = [];
  const cpu = [];
  const netIn = [];
  const netOut = [];
  const diskRead = [];
  const diskWrite = [];
  let memPercent = 0;
  let previous = null;

  for (const snapshot of sorted) {
    const timeStamp = new Date(snapshot.collectedAt);
    time.push(formatTimestamp(timeStamp));

    const cpuValue = Number.isFinite(snapshot?.cpuPercent)
      ? clamp(snapshot.cpuPercent, 0, 100)
      : cpu.length
        ? cpu[cpu.length - 1]
        : 0;
    cpu.push(cpuValue);

    const memoryPercent = computeMemoryPercent(snapshot);
    if (memoryPercent !== null) memPercent = memoryPercent;

    if (previous) {
      const deltaSeconds = Math.max(
        1,
        (timeStamp.getTime() - new Date(previous.collectedAt).getTime()) / 1000,
      );
      netIn.push(bytesToKilobitsPerSecond(computeRateFromRaw(snapshot.raw?.netin, previous.raw?.netin, deltaSeconds)));
      netOut.push(bytesToKilobitsPerSecond(computeRateFromRaw(snapshot.raw?.netout, previous.raw?.netout, deltaSeconds)));
      diskRead.push(bytesToMegabytesPerSecond(computeRateFromRaw(snapshot.raw?.diskread, previous.raw?.diskread, deltaSeconds)));
      diskWrite.push(bytesToMegabytesPerSecond(computeRateFromRaw(snapshot.raw?.diskwrite, previous.raw?.diskwrite, deltaSeconds)));
    } else {
      netIn.push(0);
      netOut.push(0);
      diskRead.push(0);
      diskWrite.push(0);
    }
    previous = snapshot;
  }

  return {
    points: {
      time: padSeries(time, SAMPLE_SIZE, "--"),
      cpu: padSeries(cpu, SAMPLE_SIZE, 0),
      netIn: padSeries(netIn, SAMPLE_SIZE, 0),
      netOut: padSeries(netOut, SAMPLE_SIZE, 0),
      diskRead: padSeries(diskRead, SAMPLE_SIZE, 0),
      diskWrite: padSeries(diskWrite, SAMPLE_SIZE, 0),
      mem: memPercent,
    },
    lastTimestamp: sorted.at(-1).collectedAt,
  };
};

const buildSamplePoint = (prev) => ({
  time: [...prev.time.slice(1), formatTimestamp(Date.now())],
  cpu: [...prev.cpu.slice(1), clamp((prev.cpu.at(-1) ?? 35) + (Math.random() * 18 - 9))],
  mem: clamp((prev.mem ?? 42) + (Math.random() * 6 - 3)),
  netIn: [...prev.netIn.slice(1), clamp((prev.netIn.at(-1) ?? 180) + (Math.random() * 90 - 45), 0, 1200)],
  netOut: [...prev.netOut.slice(1), clamp((prev.netOut.at(-1) ?? 140) + (Math.random() * 70 - 35), 0, 1200)],
  diskRead: [...prev.diskRead.slice(1), clamp((prev.diskRead.at(-1) ?? 0.25) + (Math.random() * 0.12 - 0.06), 0, 4)],
  diskWrite: [...prev.diskWrite.slice(1), clamp((prev.diskWrite.at(-1) ?? 0.18) + (Math.random() * 0.1 - 0.05), 0, 4)],
});

const lineSeries = (name, data, color, area = false) => ({
  name,
  type: "line",
  smooth: 0.35,
  data,
  showSymbol: false,
  lineStyle: { width: 2, color },
  ...(area
    ? {
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: `${color}55` },
            { offset: 1, color: `${color}00` },
          ]),
        },
      }
    : {}),
});

const timeAxis = (data) => ({
  type: "category",
  data,
  boundaryGap: false,
  ...axisStyle,
  splitLine: { show: false },
});

function DashboardPage() {
  const cpuRef = useRef(null);
  const memRef = useRef(null);
  const netRef = useRef(null);
  const diskRef = useRef(null);

  const cpuChart = useRef(null);
  const memChart = useRef(null);
  const netChart = useRef(null);
  const diskChart = useRef(null);

  const [points, setPoints] = useState(createEmptyPoints);
  const [demoMode, setDemoMode] = useState(false);
  const [intervalMs, setIntervalMs] = useState(DEFAULT_INTERVAL);
  const [showThreeD, setShowThreeD] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [status, setStatus] = useState({ type: "loading", message: "Connecting to Proxmox…" });
  const [nodeSummary, setNodeSummary] = useState(null);
  const [vmList, setVmList] = useState([]);
  const [availableNodes, setAvailableNodes] = useState([PROXMOX_NODE]);
  const [selectedNode, setSelectedNode] = useState(PROXMOX_NODE);
  const [selectedVmid, setSelectedVmid] = useState(PROXMOX_VMID);
  const { auth } = useAuth();

  useEffect(() => {
    if (!cpuChart.current && cpuRef.current) cpuChart.current = echarts.init(cpuRef.current);
    if (!memChart.current && memRef.current) memChart.current = echarts.init(memRef.current);
    if (!netChart.current && netRef.current) netChart.current = echarts.init(netRef.current);
    if (!diskChart.current && diskRef.current) diskChart.current = echarts.init(diskRef.current);

    const resizeCharts = () => {
      cpuChart.current?.resize();
      memChart.current?.resize();
      netChart.current?.resize();
      diskChart.current?.resize();
    };
    window.addEventListener("resize", resizeCharts);
    return () => window.removeEventListener("resize", resizeCharts);
  }, []);

  useEffect(() => {
    cpuChart.current?.setOption({
      grid: { left: 40, right: 12, top: 20, bottom: 28 },
      tooltip: tooltipStyle,
      xAxis: timeAxis(points.time),
      yAxis: { type: "value", min: 0, max: 100, ...axisStyle, axisLabel: { ...axisStyle.axisLabel, formatter: "{value}%" } },
      series: [lineSeries("CPU", points.cpu, colors.accent, true)],
    });
  }, [points.cpu, points.time]);

  useEffect(() => {
    memChart.current?.setOption({
      series: [
        {
          type: "gauge",
          startAngle: 210,
          endAngle: -30,
          min: 0,
          max: 100,
          radius: "92%",
          center: ["50%", "58%"],
          progress: { show: true, width: 10, roundCap: true, itemStyle: { color: colors.live } },
          axisLine: { roundCap: true, lineStyle: { width: 10, color: [[1, colors.line]] } },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: { show: false },
          pointer: { show: false },
          anchor: { show: false },
          title: { show: false },
          detail: {
            valueAnimation: true,
            formatter: "{value}%",
            color: colors.text,
            fontFamily: fonts.mono,
            fontSize: 30,
            fontWeight: 600,
            offsetCenter: [0, "-5%"],
          },
          data: [{ value: Math.round(points.mem) }],
        },
      ],
    });
  }, [points.mem]);

  useEffect(() => {
    netChart.current?.setOption({
      grid: { left: 52, right: 12, top: 28, bottom: 28 },
      tooltip: tooltipStyle,
      legend: { ...legendStyle, data: ["Ingress", "Egress"] },
      xAxis: timeAxis(points.time),
      yAxis: {
        type: "value",
        min: 0,
        max: (value) => Math.max(10, (value.max || 0) * 1.25),
        ...axisStyle,
        axisLabel: { ...axisStyle.axisLabel, formatter: "{value} Kb/s" },
      },
      series: [lineSeries("Ingress", points.netIn, colors.info), lineSeries("Egress", points.netOut, colors.violet)],
    });
  }, [points.netIn, points.netOut, points.time]);

  useEffect(() => {
    diskChart.current?.setOption({
      grid: { left: 52, right: 12, top: 28, bottom: 28 },
      tooltip: tooltipStyle,
      legend: { ...legendStyle, data: ["Read", "Write"] },
      xAxis: timeAxis(points.time),
      yAxis: {
        type: "value",
        min: 0,
        max: (value) => Math.max(1, (value.max || 0) * 1.2),
        ...axisStyle,
        axisLabel: { ...axisStyle.axisLabel, formatter: "{value} MB/s" },
      },
      series: [lineSeries("Read", points.diskRead, colors.live), lineSeries("Write", points.diskWrite, colors.warn)],
    });
  }, [points.diskRead, points.diskWrite, points.time]);

  useEffect(() => {
    let aborted = false;
    const token = auth?.token;
    if (!token) {
      setAvailableNodes((prev) => (prev?.length ? prev : [PROXMOX_NODE]));
      setSelectedNode((prev) => prev || PROXMOX_NODE);
      return undefined;
    }
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
        if (snapshots.length === 0) {
          setPoints(createEmptyPoints());
          setLastUpdated(null);
          setStatus({ type: "waiting", message: `Waiting for snapshots on ${nodeName}…` });
          return;
        }

        const { points: nextPoints, lastTimestamp } = transformSnapshots(snapshots);
        const hostMemPercent = computeNodeMemoryPercent(nodeData?.memory);
        if (hostMemPercent !== null) nextPoints.mem = hostMemPercent;
        setPoints(nextPoints);
        setLastUpdated(lastTimestamp);
        setStatus({ type: "live", message: `${nodeName} · VMID ${selectedVmid}` });
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
    const timer = setInterval(() => setPoints((prev) => buildSamplePoint(prev)), intervalMs);
    return () => clearInterval(timer);
  }, [demoMode, intervalMs]);

  const nodeCpuPercent = Number.isFinite(nodeSummary?.cpu) ? clamp(nodeSummary.cpu * 100, 0, 100) : null;
  const nodeMemory = nodeSummary?.memory ?? {};
  const nodeMemPercent = computeNodeMemoryPercent(nodeMemory);
  const nodeMemUsed = toNumber(nodeMemory.used);
  const nodeMemTotal = toNumber(nodeMemory.total ?? nodeMemory.max);
  const nodeFsUsed = toNumber(nodeMemory.fs_used ?? nodeMemory.fsUsed);
  const nodeFsTotal = toNumber(nodeMemory.fs_total ?? nodeMemory.fsTotal);
  const nodeFsPercent =
    nodeFsTotal && nodeFsTotal > 0 && Number.isFinite(nodeFsUsed) ? clamp((nodeFsUsed / nodeFsTotal) * 100) : null;

  const nodeLoadAverage = (() => {
    if (!nodeSummary?.loadAvg) return "—";
    if (Array.isArray(nodeSummary.loadAvg)) {
      return nodeSummary.loadAvg.map((value) => Number(value).toFixed(2)).join(" / ");
    }
    const parts = String(nodeSummary.loadAvg).split(/\s+/).filter(Boolean).slice(0, 3);
    return parts.length ? parts.join(" / ") : "—";
  })();

  const runningVmCount = vmList.reduce((count, vm) => count + (vm?.status === "running" ? 1 : 0), 0);
  const nodeDisplayName = nodeSummary?.node ?? selectedNode ?? PROXMOX_NODE;
  const nodeUptimeSince =
    Number.isFinite(nodeSummary?.uptimeSeconds) && nodeSummary.uptimeSeconds > 0
      ? new Date(Date.now() - nodeSummary.uptimeSeconds * 1000).toLocaleString()
      : null;

  const getLabelFromAxisValue = useCallback(
    (axisValue) => {
      if (typeof axisValue === "string") return axisValue;
      if (typeof axisValue === "number" && points.time.length > 0) {
        const index = Math.max(0, Math.min(points.time.length - 1, Math.round(axisValue)));
        return points.time[index];
      }
      return null;
    },
    [points.time],
  );

  const hoverAt = useCallback(
    (axisValue, build) => {
      const label = getLabelFromAxisValue(axisValue);
      if (!label) return null;
      const index = points.time.lastIndexOf(label);
      if (index === -1) return null;
      const lines = build(index);
      return lines ? { label, lines } : null;
    },
    [getLabelFromAxisValue, points.time],
  );

  const getCpuHoverData = useCallback(
    (axisValue) =>
      hoverAt(axisValue, (i) => {
        const value = points.cpu[i];
        return Number.isFinite(value) ? [{ name: "CPU", value: `${value.toFixed(1)}%` }] : null;
      }),
    [hoverAt, points.cpu],
  );

  const getNetworkHoverData = useCallback(
    (axisValue) =>
      hoverAt(axisValue, (i) => {
        const a = points.netIn[i];
        const b = points.netOut[i];
        if (!Number.isFinite(a) && !Number.isFinite(b)) return null;
        return [
          { name: "Ingress", value: Number.isFinite(a) ? `${a.toFixed(1)} Kb/s` : "—" },
          { name: "Egress", value: Number.isFinite(b) ? `${b.toFixed(1)} Kb/s` : "—" },
        ];
      }),
    [hoverAt, points.netIn, points.netOut],
  );

  const getDiskHoverData = useCallback(
    (axisValue) =>
      hoverAt(axisValue, (i) => {
        const a = points.diskRead[i];
        const b = points.diskWrite[i];
        if (!Number.isFinite(a) && !Number.isFinite(b)) return null;
        return [
          { name: "Read", value: Number.isFinite(a) ? `${a.toFixed(2)} MB/s` : "—" },
          { name: "Write", value: Number.isFinite(b) ? `${b.toFixed(2)} MB/s` : "—" },
        ];
      }),
    [hoverAt, points.diskRead, points.diskWrite],
  );

  const nodeStatus = (nodeSummary?.status || "unknown").toLowerCase();

  return (
    <div className="page dash">
      <header className="page-head">
        <div>
          <p className="eyebrow">dashboard</p>
          <h1>{nodeDisplayName}</h1>
          <p className="dash__status">
            <span className={`badge badge--${status.type}`}>{status.type}</span>
            <span className="muted">{status.message}</span>
            {status.type === "live" && lastUpdated ? (
              <span className="mono dash__updated">updated {formatTimestamp(lastUpdated)}</span>
            ) : null}
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
        <section className="panel span-12">
          <div className="panel__head">
            <span className="panel__title">Node overview</span>
            <span className="panel__meta">
              {runningVmCount} / {vmList.length} VMs running
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
                <span className="bar" style={{ "--w": `${nodeCpuPercent ?? 0}%`, "--c": colors.accent }}>
                  <i />
                </span>
              </div>
              <div className="stat">
                <span className="stat__label">Memory</span>
                <span className="stat__value">{pct(nodeMemPercent)}</span>
                <span className="stat__meta">
                  {gb(nodeMemUsed)} / {gb(nodeMemTotal)}
                </span>
                <span className="bar" style={{ "--w": `${nodeMemPercent ?? 0}%`, "--c": colors.live }}>
                  <i />
                </span>
              </div>
              <div className="stat">
                <span className="stat__label">Root FS</span>
                <span className="stat__value">{pct(nodeFsPercent)}</span>
                <span className="stat__meta">
                  {gb(nodeFsUsed)} / {gb(nodeFsTotal)}
                </span>
                <span className="bar" style={{ "--w": `${nodeFsPercent ?? 0}%`, "--c": colors.info }}>
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
                  <span
                    className="hint"
                    tabIndex={0}
                    data-tip="Runnable tasks averaged over 1, 5 and 15 minutes. Values near your core count mean saturation."
                  >
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

        <section className="panel span-8">
          <div className="panel__head">
            <span className="panel__title">CPU utilisation</span>
            <span className="panel__meta">last {SAMPLE_SIZE} samples</span>
          </div>
          <div className="chart-wrap">
            <div ref={cpuRef} className="chart" />
            <ChartLensOverlay chartDomRef={cpuRef} chartInstanceRef={cpuChart} getHoverData={getCpuHoverData} />
          </div>
        </section>

        <section className="panel span-4">
          <div className="panel__head">
            <span className="panel__title">Memory</span>
            <span className="panel__meta">host</span>
          </div>
          <div ref={memRef} className="chart chart--gauge" />
        </section>

        <section className="panel span-6">
          <div className="panel__head">
            <span className="panel__title">Network</span>
            <span className="panel__meta">Kb/s</span>
          </div>
          <div className="chart-wrap">
            <div ref={netRef} className="chart" />
            <ChartLensOverlay chartDomRef={netRef} chartInstanceRef={netChart} getHoverData={getNetworkHoverData} />
          </div>
        </section>

        <section className="panel span-6">
          <div className="panel__head">
            <span className="panel__title">Disk</span>
            <span className="panel__meta">MB/s</span>
          </div>
          <div className="chart-wrap">
            <div ref={diskRef} className="chart" />
            <ChartLensOverlay chartDomRef={diskRef} chartInstanceRef={diskChart} getHoverData={getDiskHoverData} />
          </div>
        </section>

        {showThreeD ? (
          <section className="panel span-12">
            <div className="panel__head">
              <span className="panel__title">CPU history · 3D</span>
              <span className="panel__meta">drag to orbit</span>
            </div>
            <ThreeMetricChart data={points.cpu} color={colors.accent} interactive />
          </section>
        ) : null}
      </div>
    </div>
  );
}

function ChartLensOverlay({ chartDomRef, chartInstanceRef, getHoverData }) {
  const svgRef = useRef(null);
  const [tooltip, setTooltip] = useState({ visible: false, label: "", lines: [], x: 0, y: 0 });

  useEffect(() => {
    if (!chartDomRef.current || !svgRef.current) return undefined;

    const svg = select(svgRef.current);
    svg.selectAll("*").remove();
    const line = svg.append("line").attr("class", "lens-line").style("opacity", 0);

    const updateSize = () => {
      const rect = chartDomRef.current?.getBoundingClientRect();
      if (rect) svg.attr("width", rect.width).attr("height", rect.height);
    };
    updateSize();

    let observer;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(updateSize);
      observer.observe(chartDomRef.current);
    } else {
      window.addEventListener("resize", updateSize);
    }

    const handleMove = (event) => {
      const chart = chartInstanceRef.current;
      const rect = chartDomRef.current?.getBoundingClientRect();
      if (!chart || !rect) return;
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      line.attr("x1", x).attr("x2", x).attr("y1", 0).attr("y2", rect.height).style("opacity", 1);
      const converted = chart.convertFromPixel({ seriesIndex: 0 }, [x, y]);
      const data = getHoverData(Array.isArray(converted) ? converted[0] : converted);
      if (!data) {
        setTooltip((prev) => (prev.visible ? { ...prev, visible: false } : prev));
        return;
      }
      setTooltip({ visible: true, label: data.label, lines: data.lines, x, y });
    };

    const handleLeave = () => {
      line.style("opacity", 0);
      setTooltip((prev) => (prev.visible ? { ...prev, visible: false } : prev));
    };

    const selection = select(chartDomRef.current);
    selection.on("mousemove.lens", handleMove).on("mouseleave.lens", handleLeave);

    return () => {
      selection.on("mousemove.lens", null).on("mouseleave.lens", null);
      if (observer) observer.disconnect();
      else window.removeEventListener("resize", updateSize);
    };
  }, [chartDomRef, chartInstanceRef, getHoverData]);

  return (
    <>
      <svg ref={svgRef} className="lens-svg" />
      <div className={`lens-tip${tooltip.visible ? " is-visible" : ""}`} style={{ left: tooltip.x, top: tooltip.y }}>
        <p>{tooltip.label}</p>
        <ul>
          {tooltip.lines.map((line) => (
            <li key={line.name}>
              <span>{line.name}</span>
              <strong>{line.value}</strong>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

export default DashboardPage;
