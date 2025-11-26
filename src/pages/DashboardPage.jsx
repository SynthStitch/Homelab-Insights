import { useCallback, useEffect, useRef, useState } from "react";
import * as echarts from "echarts";
import { select } from "d3-selection";
import Tooltip from "@mui/material/Tooltip";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import ThreeMetricChart from "../components/ThreeMetricChart.jsx";
import { CardBody, CardContainer } from "../components/TiltCard.jsx";
import { fetchSnapshots, fetchNodeSummary, fetchNodeVms } from "../services/proxmoxApiClient.js";
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

const palette = {
  blue: "#60a5fa",
  teal: "#5eead4",
  purple: "#c084fc",
  orange: "#fbbf24",
};

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
  if (series.length >= size) {
    return series.slice(series.length - size);
  }
  const padding = Array(size - series.length).fill(fillValue);
  return [...padding, ...series];
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

const bytesToMegabytesPerSecond = (bytesPerSecond) => {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return 0;
  return Math.round((bytesPerSecond / (1024 * 1024)) * 100) / 100;
};

const bytesToKilobitsPerSecond = (bytesPerSecond) => {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return 0;
  return Math.round(((bytesPerSecond * 8) / 1024) * 100) / 100;
};

const computeNodeMemoryPercent = (memory = {}) => {
  const total = toNumber(memory.total ?? memory.max);
  if (!total || total <= 0) return null;
  const used = toNumber(memory.used);
  if (Number.isFinite(used)) {
    return clamp((used / total) * 100);
  }
  const free = toNumber(memory.free ?? memory.available);
  if (Number.isFinite(free)) {
    return clamp(((total - free) / total) * 100);
  }
  return null;
};

const computeMemoryPercent = (snapshot) => {
  const memory = snapshot?.memory ?? {};
  const raw = snapshot?.raw ?? {};
  const max = toNumber(memory.max ?? raw.maxmem);
  if (!max || max <= 0) return null;

  const usedDirect = toNumber(memory.used ?? raw.mem);
  if (Number.isFinite(usedDirect)) {
    return clamp((usedDirect / max) * 100);
  }

  const free = toNumber(memory.free ?? raw.freemem);
  if (Number.isFinite(free)) {
    return clamp(((max - free) / max) * 100);
  }

  return null;
};

const formatTimestamp = (value) =>
  new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

const transformSnapshots = (snapshots) => {
  if (!Array.isArray(snapshots) || snapshots.length === 0) {
    return { points: createEmptyPoints(), lastTimestamp: null };
  }

  const sorted = snapshots
    .filter((snap) => snap?.collectedAt)
    .sort((a, b) => new Date(a.collectedAt) - new Date(b.collectedAt));

  if (sorted.length === 0) {
    return { points: createEmptyPoints(), lastTimestamp: null };
  }

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
    if (memoryPercent !== null) {
      memPercent = memoryPercent;
    }

    if (previous) {
      const deltaSeconds = Math.max(
        1,
        (timeStamp.getTime() - new Date(previous.collectedAt).getTime()) / 1000
      );
      const netInRate = computeRateFromRaw(snapshot.raw?.netin, previous.raw?.netin, deltaSeconds);
      const netOutRate = computeRateFromRaw(snapshot.raw?.netout, previous.raw?.netout, deltaSeconds);
      const diskReadRate = computeRateFromRaw(
        snapshot.raw?.diskread,
        previous.raw?.diskread,
        deltaSeconds
      );
      const diskWriteRate = computeRateFromRaw(
        snapshot.raw?.diskwrite,
        previous.raw?.diskwrite,
        deltaSeconds
      );

      netIn.push(bytesToKilobitsPerSecond(netInRate));
      netOut.push(bytesToKilobitsPerSecond(netOutRate));
      diskRead.push(bytesToMegabytesPerSecond(diskReadRate));
      diskWrite.push(bytesToMegabytesPerSecond(diskWriteRate));
    } else {
      netIn.push(0);
      netOut.push(0);
      diskRead.push(0);
      diskWrite.push(0);
    }

    previous = snapshot;
  }

  const points = {
    time: padSeries(time, SAMPLE_SIZE, "--"),
    cpu: padSeries(cpu, SAMPLE_SIZE, 0),
    netIn: padSeries(netIn, SAMPLE_SIZE, 0),
    netOut: padSeries(netOut, SAMPLE_SIZE, 0),
    diskRead: padSeries(diskRead, SAMPLE_SIZE, 0),
    diskWrite: padSeries(diskWrite, SAMPLE_SIZE, 0),
    mem: memPercent,
  };

  return { points, lastTimestamp: sorted.at(-1).collectedAt };
};

const buildSamplePoint = (prev) => ({
  time: [...prev.time.slice(1), formatTimestamp(Date.now())],
  cpu: [...prev.cpu.slice(1), clamp((prev.cpu.at(-1) ?? 35) + (Math.random() * 18 - 9))],
  mem: clamp((prev.mem ?? 42) + (Math.random() * 6 - 3)),
  netIn: [
    ...prev.netIn.slice(1),
    clamp((prev.netIn.at(-1) ?? 180) + (Math.random() * 90 - 45), 0, 1200),
  ],
  netOut: [
    ...prev.netOut.slice(1),
    clamp((prev.netOut.at(-1) ?? 140) + (Math.random() * 70 - 35), 0, 1200),
  ],
  diskRead: [
    ...prev.diskRead.slice(1),
    clamp((prev.diskRead.at(-1) ?? 0.25) + (Math.random() * 0.12 - 0.06), 0, 4),
  ],
  diskWrite: [
    ...prev.diskWrite.slice(1),
    clamp((prev.diskWrite.at(-1) ?? 0.18) + (Math.random() * 0.1 - 0.05), 0, 4),
  ],
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
  const [tiltCards, setTiltCards] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [status, setStatus] = useState({
    type: "loading",
    message: "Connecting to Proxmox…",
  });
  const [nodeSummary, setNodeSummary] = useState(null);
  const [vmList, setVmList] = useState([]);

  const { blue, teal, purple, orange } = palette;

  const NodeCard = ({ children }) =>
    tiltCards ? (
      <CardContainer containerClassName="node-card-tilt">
        <CardBody className="node-info-card tilt-card">{children}</CardBody>
      </CardContainer>
    ) : (
      <div className="node-info-card">{children}</div>
    );

  const renderVmItem = (vm, index) => {
    const vmKey = vm.id ?? vm.vmid ?? vm.name ?? index;
    const content = (
      <>
        <div className="vm-primary">
          <p className="vm-name">{vm.name ?? `VM ${vm.id ?? vm.vmid ?? index}`}</p>
          <p className={`vm-status badge-${(vm.status || "unknown").toLowerCase()}`}>{vm.status ?? "unknown"}</p>
        </div>
        <div className="vm-metrics">
          <div>
            <span>CPU</span>
            <strong>{Number.isFinite(vm?.cpu) ? `${clamp(vm.cpu * 100, 0, 400).toFixed(1)}%` : "—"}</strong>
          </div>
          <div>
            <span>Memory</span>
            <strong>
              {Number.isFinite(vm?.mem) && Number.isFinite(vm?.maxMem) && vm.maxMem > 0
                ? `${clamp((vm.mem / vm.maxMem) * 100, 0, 100).toFixed(1)}%`
                : "—"}
            </strong>
            <small>
              {Number.isFinite(vm?.mem) ? `${(vm.mem / 1024 ** 3).toFixed(2)} GB` : "—"} /{" "}
              {Number.isFinite(vm?.maxMem) ? `${(vm.maxMem / 1024 ** 3).toFixed(2)} GB` : "—"}
            </small>
          </div>
          <div>
            <span>Uptime</span>
            <strong>
              {Number.isFinite(vm?.uptimeSeconds)
                ? `${Math.floor(vm.uptimeSeconds / 3600)}h ${Math.floor((vm.uptimeSeconds % 3600) / 60)}m`
                : "—"}
            </strong>
          </div>
        </div>
      </>
    );

    if (tiltCards) {
      return (
        <CardContainer key={vmKey} as="li" containerClassName="vm-card-tilt">
          <CardBody className="vm-list-item tilt-card">{content}</CardBody>
        </CardContainer>
      );
    }

    return (
      <li key={vmKey} className="vm-list-item">
        {content}
      </li>
    );
  };

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
      grid: { left: 36, right: 12, top: 32, bottom: 30 },
      xAxis: {
        type: "category",
        data: points.time,
        boundaryGap: false,
        axisLine: { lineStyle: { color: "#334155" } },
        axisLabel: { color: "#94a3b8" },
      },
      yAxis: {
        type: "value",
        min: 0,
        max: 100,
        axisLine: { lineStyle: { color: "#334155" } },
        axisLabel: { color: "#94a3b8" },
        splitLine: { lineStyle: { color: "#1f2937" } },
      },
      series: [
        {
          name: "CPU",
          type: "line",
          smooth: true,
          data: points.cpu,
          showSymbol: false,
          lineStyle: { width: 2, color: blue },
          areaStyle: { color: "rgba(96,165,250,0.18)" },
        },
      ],
    });
  }, [blue, points.cpu, points.time]);

  useEffect(() => {
    memChart.current?.setOption({
      series: [
        {
          type: "gauge",
          max: 100,
          progress: { show: true, color: teal },
          axisLine: { lineStyle: { width: 12, color: [[1, "#1f2937"]] } },
          axisLabel: { color: "#94a3b8" },
          pointer: { itemStyle: { color: teal } },
          detail: {
            valueAnimation: true,
            formatter: "{value}%",
            color: "#e2e8f0",
          },
          data: [{ value: Math.round(points.mem) }],
        },
      ],
    });
  }, [points.mem, teal]);

  useEffect(() => {
    netChart.current?.setOption({
      grid: { left: 40, right: 16, top: 32, bottom: 28 },
      xAxis: {
        type: "category",
        data: points.time,
        boundaryGap: false,
        axisLine: { lineStyle: { color: "#334155" } },
        axisLabel: { color: "#94a3b8" },
      },
      yAxis: {
        type: "value",
        min: 0,
        max: (value) => Math.max(10, (value.max || 0) * 1.25),
        axisLine: { lineStyle: { color: "#334155" } },
        axisLabel: { color: "#94a3b8", formatter: "{value} Kb/s" },
        splitLine: { lineStyle: { color: "#1f2937" } },
      },
      legend: {
        data: ["Ingress", "Egress"],
        textStyle: { color: "#cbd5f5" },
      },
      series: [
        {
          name: "Ingress",
          type: "line",
          smooth: true,
          data: points.netIn,
          showSymbol: false,
          lineStyle: { width: 2, color: purple },
        },
        {
          name: "Egress",
          type: "line",
          smooth: true,
          data: points.netOut,
          showSymbol: false,
          lineStyle: { width: 2, color: orange },
        },
      ],
    });
  }, [orange, points.netIn, points.netOut, points.time, purple]);

  useEffect(() => {
    diskChart.current?.setOption({
      grid: { left: 40, right: 16, top: 32, bottom: 28 },
      xAxis: {
        type: "category",
        data: points.time,
        boundaryGap: false,
        axisLine: { lineStyle: { color: "#334155" } },
        axisLabel: { color: "#94a3b8" },
      },
      yAxis: {
        type: "value",
        min: 0,
        max: (value) => Math.max(1, (value.max || 0) * 1.2),
        axisLine: { lineStyle: { color: "#334155" } },
        axisLabel: { color: "#94a3b8", formatter: "{value} MB/s" },
        splitLine: { lineStyle: { color: "#1f2937" } },
      },
      legend: {
        data: ["Read", "Write"],
        textStyle: { color: "#cbd5f5" },
      },
      series: [
        {
          name: "Read",
          type: "line",
          smooth: true,
          data: points.diskRead,
          showSymbol: false,
          lineStyle: { width: 2, color: blue },
        },
        {
          name: "Write",
          type: "line",
          smooth: true,
          data: points.diskWrite,
          showSymbol: false,
          lineStyle: { width: 2, color: teal },
        },
      ],
    });
  }, [blue, points.diskRead, points.diskWrite, points.time, teal]);

  useEffect(() => {
    if (demoMode) {
      setStatus({ type: "demo", message: "Demo mode active." });
      return;
    }

    let cancelled = false;
    setStatus((prev) =>
      prev.type === "error"
        ? { type: "loading", message: "Reconnecting to Proxmox…" }
        : prev
    );

    const loadTelemetry = async () => {
      try {
        const [snapResponse, nodeResponse, vmsResponse] = await Promise.all([
          fetchSnapshots({
            node: PROXMOX_NODE,
            vmid: PROXMOX_VMID,
            limit: SAMPLE_SIZE,
          }),
          fetchNodeSummary({ node: PROXMOX_NODE }),
          fetchNodeVms({ node: PROXMOX_NODE }),
        ]);

        if (cancelled) return;

        const nodeData = nodeResponse?.data ?? null;
        setNodeSummary(nodeData);
        setVmList(Array.isArray(vmsResponse?.data) ? vmsResponse.data : []);

        const nodeName = nodeData?.node ?? PROXMOX_NODE;
        const snapshots = Array.isArray(snapResponse?.data) ? snapResponse.data : [];
        if (snapshots.length === 0) {
          setPoints(createEmptyPoints());
          setLastUpdated(null);
          setStatus({
            type: "waiting",
            message: `Waiting for Proxmox snapshots on node ${nodeName}…`,
          });
          return;
        }

        const { points: nextPoints, lastTimestamp } = transformSnapshots(snapshots);
        const hostMemPercent = computeNodeMemoryPercent(nodeData?.memory);
        if (hostMemPercent !== null) {
          nextPoints.mem = hostMemPercent;
        }
        setPoints(nextPoints);
        setLastUpdated(lastTimestamp);
        setStatus({
          type: "live",
          message: `Live data · Node ${nodeName}, VMID ${PROXMOX_VMID}`,
        });
      } catch (err) {
        if (cancelled) return;
        console.error("Failed to load Proxmox telemetry", err);
        setStatus({
          type: "error",
          message: err?.message || "Failed to load Proxmox telemetry.",
        });
      }
    };

    loadTelemetry();
    const timer = setInterval(loadTelemetry, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [demoMode, intervalMs]);

  useEffect(() => {
    if (!demoMode) return undefined;
    const timer = setInterval(() => {
      setPoints((prev) => buildSamplePoint(prev));
    }, intervalMs);
    return () => clearInterval(timer);
  }, [demoMode, intervalMs]);

  const nodeCpuPercent = Number.isFinite(nodeSummary?.cpu)
    ? clamp(nodeSummary.cpu * 100, 0, 100)
    : null;

  const nodeMemory = nodeSummary?.memory ?? {};
  const nodeMemPercent = computeNodeMemoryPercent(nodeMemory);
  const nodeMemUsed = toNumber(nodeMemory.used);
  const nodeMemTotal = toNumber(nodeMemory.total ?? nodeMemory.max);
  const nodeFsUsed = toNumber(nodeMemory.fs_used ?? nodeMemory.fsUsed);
  const nodeFsTotal = toNumber(nodeMemory.fs_total ?? nodeMemory.fsTotal);

  const nodeFsPercent = (() => {
    const used = toNumber(nodeMemory.fs_used ?? nodeMemory.fsUsed);
    const total = toNumber(nodeMemory.fs_total ?? nodeMemory.fsTotal);
    if (!total || total <= 0 || !Number.isFinite(used)) return null;
    return clamp((used / total) * 100);
  })();

  const nodeLoadAverage = (() => {
    if (!nodeSummary?.loadAvg) return "—";
    if (Array.isArray(nodeSummary.loadAvg)) {
      return nodeSummary.loadAvg.map((value) => Number(value).toFixed(2)).join(" / ");
    }
    const parts = String(nodeSummary.loadAvg)
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 3);
    return parts.length ? parts.join(" / ") : "—";
  })();

  const runningVmCount = vmList.reduce(
    (count, vm) => count + (vm?.status === "running" ? 1 : 0),
    0
  );
  const nodeDisplayName = nodeSummary?.node ?? PROXMOX_NODE;
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
    [points.time]
  );

  const getCpuHoverData = useCallback(
    (axisValue) => {
      const label = getLabelFromAxisValue(axisValue);
      if (!label) return null;
      const index = points.time.lastIndexOf(label);
      if (index === -1) return null;
      const value = points.cpu[index];
      if (!Number.isFinite(value)) return null;
      return {
        label,
        lines: [{ name: "CPU", value: `${value.toFixed(1)}%` }],
      };
    },
    [getLabelFromAxisValue, points.cpu, points.time]
  );

  const getNetworkHoverData = useCallback(
    (axisValue) => {
      const label = getLabelFromAxisValue(axisValue);
      if (!label) return null;
      const index = points.time.lastIndexOf(label);
      if (index === -1) return null;
      const ingress = points.netIn[index];
      const egress = points.netOut[index];
      if (!Number.isFinite(ingress) && !Number.isFinite(egress)) return null;
      return {
        label,
        lines: [
          { name: "Ingress", value: Number.isFinite(ingress) ? `${ingress.toFixed(1)} Kb/s` : "—" },
          { name: "Egress", value: Number.isFinite(egress) ? `${egress.toFixed(1)} Kb/s` : "—" },
        ],
      };
    },
    [getLabelFromAxisValue, points.netIn, points.netOut, points.time]
  );

  const getDiskHoverData = useCallback(
    (axisValue) => {
      const label = getLabelFromAxisValue(axisValue);
      if (!label) return null;
      const index = points.time.lastIndexOf(label);
      if (index === -1) return null;
      const read = points.diskRead[index];
      const write = points.diskWrite[index];
      if (!Number.isFinite(read) && !Number.isFinite(write)) return null;
      return {
        label,
        lines: [
          { name: "Read", value: Number.isFinite(read) ? `${read.toFixed(2)} MB/s` : "—" },
          { name: "Write", value: Number.isFinite(write) ? `${write.toFixed(2)} MB/s` : "—" },
        ],
      };
    },
    [getLabelFromAxisValue, points.diskRead, points.diskWrite, points.time]
  );

  const handleIntervalChange = (event) => {
    const value = Number(event.target.value) || DEFAULT_INTERVAL;
    setIntervalMs(Math.max(1000, value));
  };

  return (
    <div className="dash-wrapper">
      <header className="dash-header">
        <div>
          <h1>Homelab Dashboard</h1>
          <p>Real-time telemetry streamed from Proxmox.</p>
          <p className={`dash-status status-${status.type}`}>
            {status.message}
            {status.type === "live" && lastUpdated && (
              <>
                {" · Updated "}
                {formatTimestamp(lastUpdated)}
              </>
            )}
          </p>
        </div>
        <div className="dash-controls">
          <label>
            Interval (ms)
            <input
              type="number"
              value={intervalMs}
              min={1000}
              step={1000}
              onChange={handleIntervalChange}
            />
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={demoMode}
              onChange={(event) => setDemoMode(event.target.checked)}
            />
            Demo mode
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={showThreeD}
              onChange={(event) => setShowThreeD(event.target.checked)}
            />
            3D view
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={tiltCards}
              onChange={(event) => setTiltCards(event.target.checked)}
            />
            Tilt cards
          </label>
        </div>
      </header>

      <div className="dash-grid">
        <section className="panel panel-node">
          <h2>Node Overview</h2>
          {nodeSummary ? (
            <div className="node-info-grid">
              <NodeCard>
                <span className="node-info-label">Node</span>
                <strong>{nodeDisplayName}</strong>
                <span className={`node-info-status status-${(nodeSummary.status || "unknown").toLowerCase()}`}>
                  {nodeSummary.status ?? "unknown"}
                </span>
              </NodeCard>
              <NodeCard>
                <span className="node-info-label">CPU Usage</span>
                <strong>{Number.isFinite(nodeCpuPercent) ? `${nodeCpuPercent.toFixed(1)}%` : "—"}</strong>
                {Number.isFinite(nodeSummary?.maxCpu) && <span className="node-info-meta">{nodeSummary.maxCpu} cores</span>}
              </NodeCard>
              <NodeCard>
                <span className="node-info-label">Memory Usage</span>
                <strong>{Number.isFinite(nodeMemPercent) ? `${nodeMemPercent.toFixed(1)}%` : "—"}</strong>
                <span className="node-info-meta">
                  {Number.isFinite(nodeMemUsed) ? `${(nodeMemUsed / 1024 ** 3).toFixed(2)} GB` : "—"} /{" "}
                  {Number.isFinite(nodeMemTotal) ? `${(nodeMemTotal / 1024 ** 3).toFixed(2)} GB` : "—"}
                </span>
              </NodeCard>
              <NodeCard>
                <span className="node-info-label">Filesystem</span>
                <strong>{Number.isFinite(nodeFsPercent) ? `${nodeFsPercent.toFixed(1)}%` : "—"}</strong>
                <span className="node-info-meta">
                  {Number.isFinite(nodeFsUsed) ? `${(nodeFsUsed / 1024 ** 3).toFixed(2)} GB` : "—"} /{" "}
                  {Number.isFinite(nodeFsTotal) ? `${(nodeFsTotal / 1024 ** 3).toFixed(2)} GB` : "—"}
                </span>
              </NodeCard>
              <NodeCard>
                <span className="node-info-label">Uptime</span>
                <strong>
                  {Number.isFinite(nodeSummary?.uptimeSeconds)
                    ? `${Math.floor(nodeSummary.uptimeSeconds / 3600)}h ${Math.floor((nodeSummary.uptimeSeconds % 3600) / 60)}m`
                    : "—"}
                </strong>
                {nodeUptimeSince && <span className="node-info-meta">since {nodeUptimeSince}</span>}
              </NodeCard>
              <NodeCard>
                <span className="node-info-label load-label">
                  Load Avg (1m/5m/15m)
                  <Tooltip
                    arrow
                    title="Average number of runnable tasks over the last 1, 5, and 15 minutes. Values near your core count indicate saturation."
                  >
                    <InfoOutlinedIcon fontSize="small" className="load-info-icon" />
                  </Tooltip>
                </span>
                <strong>{nodeLoadAverage}</strong>
                <span className="node-info-meta">
                  {runningVmCount} / {vmList.length} VMs running
                </span>
              </NodeCard>
            </div>
          ) : (
            <p className="node-info-empty">Waiting for node metrics…</p>
          )}
        </section>

        <section className="panel panel-vms">
          <h2>Virtual Machines</h2>
          {vmList.length === 0 ? (
            <p className="vm-list-empty">No VMs detected on this node.</p>
          ) : (
            <ul className="vm-list">{vmList.map((vm, index) => renderVmItem(vm, index))}</ul>
          )}
        </section>

        <section className="panel panel-wide">
          <h2>CPU Utilisation</h2>
          <div className="chart-wrapper">
            <div ref={cpuRef} className="chart" />
            <ChartLensOverlay
              chartDomRef={cpuRef}
              chartInstanceRef={cpuChart}
              getHoverData={getCpuHoverData}
            />
          </div>
        </section>
        <section className="panel panel-narrow">
          <h2>Memory Usage</h2>
          <div ref={memRef} className="chart gauge" />
        </section>
        <section className="panel panel-network">
          <h2>Network Throughput</h2>
          <div className="chart-wrapper">
            <div ref={netRef} className="chart" />
            <ChartLensOverlay
              chartDomRef={netRef}
              chartInstanceRef={netChart}
              getHoverData={getNetworkHoverData}
            />
          </div>
        </section>
        <section className="panel panel-disk">
          <h2>Disk Activity</h2>
          <div className="chart-wrapper">
            <div ref={diskRef} className="chart" />
            <ChartLensOverlay
              chartDomRef={diskRef}
              chartInstanceRef={diskChart}
              getHoverData={getDiskHoverData}
            />
          </div>
        </section>
        {showThreeD && (
          <section className="panel panel-wide panel-3d">
            <h2>CPU History (3D Bars)</h2>
            <ThreeMetricChart data={points.cpu} color={blue} interactive />
          </section>
        )}
      </div>
    </div>
  );
}

function ChartLensOverlay({ chartDomRef, chartInstanceRef, getHoverData }) {
  const svgRef = useRef(null);
  const [tooltip, setTooltip] = useState({
    visible: false,
    label: "",
    lines: [],
    x: 0,
    y: 0,
  });

  useEffect(() => {
    if (!chartDomRef.current || !svgRef.current) return undefined;

    const svg = select(svgRef.current);
    svg.selectAll("*").remove();
    const line = svg
      .append("line")
      .attr("class", "lens-line")
      .style("opacity", 0);

    const updateSize = () => {
      const rect = chartDomRef.current?.getBoundingClientRect();
      if (!rect) return;
      svg.attr("width", rect.width).attr("height", rect.height);
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
      if (!chart) return;
      const rect = chartDomRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      line.attr("x1", x).attr("x2", x).attr("y1", 0).attr("y2", rect.height).style("opacity", 1);

      const converted = chart.convertFromPixel({ seriesIndex: 0 }, [x, y]);
      const axisValue = Array.isArray(converted) ? converted[0] : converted;
      const data = getHoverData(axisValue);
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
      if (observer) {
        observer.disconnect();
      } else {
        window.removeEventListener("resize", updateSize);
      }
    };
  }, [chartDomRef, chartInstanceRef, getHoverData]);

  return (
    <>
      <svg ref={svgRef} className="chart-lens-svg" />
      <div
        className={`lens-tooltip ${tooltip.visible ? "is-visible" : ""}`}
        style={{ left: tooltip.x, top: tooltip.y }}
      >
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
