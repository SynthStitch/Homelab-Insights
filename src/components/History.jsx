import { useEffect, useMemo, useRef, useState } from "react";
import * as echarts from "echarts";
import { fetchHistory } from "../services/proxmoxApiClient.js";
import { colors, fonts, seriesPalette, axisStyle, tooltipStyle } from "../lib/theme.js";
import "./History.css";

const METRICS = [
  { id: "cpu", label: "CPU", unit: "%", max: 100 },
  { id: "mem", label: "Memory", unit: "%", max: 100 },
  { id: "disk", label: "Disk I/O", unit: "MB/s" },
  { id: "net", label: "Network", unit: "MB/s" },
];

const RANGES = [
  ["hour", "1h"],
  ["day", "1d"],
  ["week", "1w"],
  ["month", "1m"],
  ["year", "1y"],
];

const REFRESH_MS = 60_000;

// Synthetic history so the panel has something to show in demo mode.
function demoHistory(timeframe) {
  const n = 70;
  const step = { hour: 60e3, day: 20 * 60e3, week: 2 * 3600e3, month: 8 * 3600e3, year: 4 * 86400e3 }[timeframe] ?? 60e3;
  const now = Date.now();
  const t = Array.from({ length: n }, (_, i) => now - (n - 1 - i) * step);
  const wave = (a, f, p, base) => t.map((_, i) => Math.max(0, base + a * Math.sin(i / f + p) + (Math.random() - 0.5) * a * 0.4));
  const g = (id, name, type, s) => ({
    id,
    name,
    type,
    status: "running",
    t,
    cpu: wave(12, 7, s, 18 + s * 5),
    mem: wave(4, 11, s, 35 + s * 9),
    disk: wave(1.2, 5, s, 0.6),
    net: wave(3, 9, s, 1.5 + s),
  });
  return {
    node: "demo",
    timeframe,
    host: { t, cpu: wave(8, 9, 1, 24), mem: wave(2, 13, 2, 41), disk: t.map(() => null), net: wave(5, 8, 1, 6) },
    guests: [g(100, "docker", "lxc", 0), g(102, "prometheus", "lxc", 1), g(103, "postgresql", "lxc", 2), g(123, "portainerboom", "qemu", 3), g(999, "openclaw", "qemu", 4)],
  };
}

export default function History({ node, demo = false }) {
  const chartRef = useRef(null);
  const chart = useRef(null);
  const [metric, setMetric] = useState("cpu");
  const [timeframe, setTimeframe] = useState("hour");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (demo) {
      setData(demoHistory(timeframe));
      setError("");
      return undefined;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetchHistory({ node, timeframe });
        if (!cancelled) {
          setData(res?.data ?? null);
          setError("");
        }
      } catch (err) {
        if (!cancelled) setError(err?.message || "History unavailable");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [node, timeframe, demo]);

  const metricDef = useMemo(() => METRICS.find((m) => m.id === metric) ?? METRICS[0], [metric]);

  useEffect(() => {
    if (!chart.current && chartRef.current) chart.current = echarts.init(chartRef.current);
    const resize = () => chart.current?.resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  useEffect(() => {
    if (!chart.current || !data) return;
    const toPoints = (s) => s.t.map((ts, i) => [ts, s[metric][i]]);
    const guests = (data.guests ?? []).filter((g) => g[metric]?.some((v) => v !== null && v !== undefined));
    const series = guests.map((g, i) => ({
      name: g.name,
      type: "line",
      showSymbol: false,
      smooth: 0.25,
      connectNulls: false,
      lineStyle: { width: 1.5, color: seriesPalette[i % seriesPalette.length] },
      itemStyle: { color: seriesPalette[i % seriesPalette.length] },
      emphasis: { focus: "series", lineStyle: { width: 2.5 } },
      data: toPoints(g),
    }));
    if (data.host && data.host[metric]?.some((v) => v !== null)) {
      series.unshift({
        name: "host",
        type: "line",
        showSymbol: false,
        smooth: 0.25,
        lineStyle: { width: 2, color: colors.text, type: "dashed" },
        itemStyle: { color: colors.text },
        emphasis: { focus: "series" },
        data: toPoints(data.host),
      });
    }

    chart.current.setOption(
      {
        animationDuration: 300,
        grid: { left: 48, right: 16, top: 12, bottom: 56 },
        tooltip: {
          ...tooltipStyle,
          order: "valueDesc",
          valueFormatter: (v) => (v === null || v === undefined ? "—" : `${Number(v).toFixed(metricDef.unit === "%" ? 1 : 2)} ${metricDef.unit}`),
        },
        legend: {
          type: "scroll",
          bottom: 0,
          icon: "roundRect",
          itemWidth: 10,
          itemHeight: 3,
          textStyle: { color: colors.muted, fontFamily: fonts.mono, fontSize: 10 },
          pageTextStyle: { color: colors.muted },
          pageIconColor: colors.muted,
          pageIconInactiveColor: colors.line,
        },
        xAxis: { type: "time", ...axisStyle, splitLine: { show: false } },
        yAxis: {
          type: "value",
          min: 0,
          max: metricDef.max,
          ...axisStyle,
          axisLabel: { ...axisStyle.axisLabel, formatter: `{value} ${metricDef.unit}` },
        },
        dataZoom: [{ type: "inside", throttle: 50 }],
        series,
      },
      { notMerge: true },
    );
  }, [data, metric, metricDef]);

  const guestCount = data?.guests?.length ?? 0;

  return (
    <section className="panel history">
      <div className="panel__head">
        <span className="panel__title">History</span>
        <div className="history__controls">
          <div className="seg" role="tablist" aria-label="Metric">
            {METRICS.map((m) => (
              <button key={m.id} type="button" role="tab" aria-selected={metric === m.id} className={`seg__btn${metric === m.id ? " is-active" : ""}`} onClick={() => setMetric(m.id)}>
                {m.label}
              </button>
            ))}
          </div>
          <div className="seg" role="tablist" aria-label="Range">
            {RANGES.map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={timeframe === id} className={`seg__btn${timeframe === id ? " is-active" : ""}`} onClick={() => setTimeframe(id)}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="history__meta">
        <span className="panel__meta">
          {guestCount} guests · host dashed · scroll to zoom · click legend to toggle
        </span>
        {loading ? <span className="panel__meta">refreshing…</span> : null}
        {error ? <span className="status-text status-text--error">{error}</span> : null}
      </div>
      <div ref={chartRef} className="history__chart" />
    </section>
  );
}
