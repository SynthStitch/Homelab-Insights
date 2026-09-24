import { useEffect, useMemo, useRef, useState } from "react";
import * as echarts from "echarts";
import { fetchHistory } from "../services/proxmoxApiClient.js";
import { useChartTheme } from "../context/ThemeContext.jsx";
import "./History.css";

// eslint-disable-next-line react-refresh/only-export-components
export const METRICS = [
  { id: "cpu", label: "CPU", unit: "%", max: 100 },
  { id: "mem", label: "Memory", unit: "%", max: 100 },
  { id: "disk", label: "Disk I/O", unit: "MB/s" },
  { id: "net", label: "Network", unit: "MB/s" },
];

// eslint-disable-next-line react-refresh/only-export-components
export const RANGES = [
  ["hour", "1h"],
  ["day", "1d"],
  ["week", "1w"],
  ["month", "1m"],
  ["year", "1y"],
];

const REFRESH_MS = 60_000;

// Synthetic history so panels have something to show in demo mode.
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

/** Merge several nodes' histories into one: host lines become named series, guests get a node suffix. */
function mergeHistories(results) {
  const named = results.filter(Boolean);
  if (named.length === 1) return named[0];
  const guests = [];
  for (const r of named) {
    if (r.host?.t?.length) guests.push({ id: `host-${r.node}`, name: `${r.node} (host)`, type: "host", status: "running", ...r.host });
    for (const g of r.guests ?? []) guests.push({ ...g, name: `${g.name} @${r.node}` });
  }
  return { node: named.map((r) => r.node).join(", "), timeframe: named[0]?.timeframe, host: null, guests };
}

/** Fetches RRD history for one node or several (array). Pass the result to <History> panels to share one request. */
// eslint-disable-next-line react-refresh/only-export-components
export function useHistory(node, timeframe, demo = false) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const nodes = Array.isArray(node) ? node : node ? [node] : [];
  const nodesKey = nodes.join("|");

  useEffect(() => {
    if (demo) {
      setData(demoHistory(timeframe));
      setError("");
      return undefined;
    }
    if (!nodes.length) return undefined;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const results = await Promise.all(nodes.map((n) => fetchHistory({ node: n, timeframe }).then((res) => res?.data ?? null)));
        if (!cancelled) {
          setData(mergeHistories(results));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodesKey, timeframe, demo]);

  return { data, error, loading };
}

const stats = (values) => {
  const nums = values.filter((v) => Number.isFinite(v));
  if (!nums.length) return { max: null, mean: null, last: null };
  return {
    max: Math.max(...nums),
    mean: nums.reduce((a, b) => a + b, 0) / nums.length,
    last: nums[nums.length - 1],
  };
};

/**
 * Multi-series history chart.
 *  - metric: pin to one metric (hides the metric tabs)
 *  - timeframe: controlled range (hides the range tabs)
 *  - legend: "table" (Grafana-style max/mean/last beside the chart) or "bottom"
 *  - history: a shared useHistory() result, so sibling panels don't refetch
 */
export default function History({
  node,
  demo = false,
  metric: fixedMetric,
  timeframe: fixedTimeframe,
  legend = "bottom",
  title,
  className = "",
  history,
}) {
  const chartRef = useRef(null);
  const chart = useRef(null);
  const [metricState, setMetric] = useState(fixedMetric ?? "cpu");
  const [timeframeState, setTimeframe] = useState(fixedTimeframe ?? "hour");
  const metric = fixedMetric ?? metricState;
  const timeframe = fixedTimeframe ?? timeframeState;
  const own = useHistory(history ? null : node, timeframe, history ? false : demo);
  const { data, error, loading } = history ?? own;
  const ct = useChartTheme();
  const [hidden, setHidden] = useState(() => new Set());

  const metricDef = useMemo(() => METRICS.find((m) => m.id === metric) ?? METRICS[0], [metric]);

  const rows = useMemo(() => {
    if (!data) return [];
    const list = [];
    if (data.host?.[metric]?.some((v) => v !== null)) {
      list.push({ key: "host", name: "host", color: ct.colors.text, dashed: true, series: data.host, ...stats(data.host[metric]) });
    }
    (data.guests ?? [])
      .filter((g) => g[metric]?.some((v) => v !== null && v !== undefined))
      .forEach((g, i) =>
        list.push({
          key: `${g.type}/${g.id}`,
          name: g.name,
          type: g.type,
          color: ct.seriesPalette[i % ct.seriesPalette.length],
          series: g,
          ...stats(g[metric]),
        }),
      );
    return list;
  }, [data, metric, ct]);

  useEffect(() => {
    if (!chart.current && chartRef.current) chart.current = echarts.init(chartRef.current);
    const resize = () => chart.current?.resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  useEffect(() => {
    if (!chart.current || !data) return;
    const fmt = (v) => (v === null || v === undefined ? "—" : `${Number(v).toFixed(metricDef.unit === "%" ? 1 : 2)} ${metricDef.unit}`);
    const series = rows
      .filter((r) => !hidden.has(r.key))
      .map((r) => ({
        name: r.name,
        type: "line",
        showSymbol: false,
        ...ct.seriesStyle,
        connectNulls: false,
        lineStyle: { ...ct.line(r.color, r.dashed ? 2 : 1.5), ...(r.dashed ? { type: "dashed" } : {}) },
        itemStyle: { color: r.color },
        emphasis: { focus: "series", lineStyle: { width: 2.5 } },
        data: r.series.t.map((ts, i) => [ts, r.series[metric][i]]),
      }));

    chart.current.setOption(
      {
        animationDuration: 300,
        grid: { left: 46, right: 12, top: 10, bottom: legend === "table" ? 24 : 52 },
        tooltip: { ...ct.tooltipStyle, order: "valueDesc", valueFormatter: fmt },
        legend:
          legend === "table"
            ? { show: false }
            : {
                type: "scroll",
                bottom: 0,
                icon: "roundRect",
                itemWidth: 10,
                itemHeight: 3,
                textStyle: { color: ct.colors.muted, fontFamily: ct.fonts.mono, fontSize: 10 },
                pageTextStyle: { color: ct.colors.muted },
                pageIconColor: ct.colors.muted,
                pageIconInactiveColor: ct.colors.line,
              },
        xAxis: { type: "time", ...ct.axisStyle, splitLine: { show: false } },
        yAxis: {
          type: "value",
          min: 0,
          max: metricDef.max,
          ...ct.axisStyle,
          axisLabel: { ...ct.axisStyle.axisLabel, formatter: `{value} ${metricDef.unit}` },
        },
        dataZoom: [{ type: "inside", throttle: 50 }],
        series,
      },
      { notMerge: true },
    );
  }, [data, rows, hidden, metric, metricDef, ct, legend]);

  const toggle = (key) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const solo = (key) => setHidden(new Set(rows.filter((r) => r.key !== key).map((r) => r.key)));

  const fmtCell = (v) => (v === null ? "—" : metricDef.unit === "%" ? `${v.toFixed(1)}%` : v.toFixed(2));

  return (
    <section className={`panel history ${className}`.trim()}>
      <div className="panel__head">
        <span className="panel__title">{title ?? `Guests ${metricDef.label.toLowerCase()}`}</span>
        <div className="history__controls">
          {!fixedMetric ? (
            <div className="seg" role="tablist" aria-label="Metric">
              {METRICS.map((m) => (
                <button key={m.id} type="button" role="tab" aria-selected={metric === m.id} className={`seg__btn${metric === m.id ? " is-active" : ""}`} onClick={() => setMetric(m.id)}>
                  {m.label}
                </button>
              ))}
            </div>
          ) : null}
          {!fixedTimeframe ? (
            <div className="seg" role="tablist" aria-label="Range">
              {RANGES.map(([id, label]) => (
                <button key={id} type="button" role="tab" aria-selected={timeframe === id} className={`seg__btn${timeframe === id ? " is-active" : ""}`} onClick={() => setTimeframe(id)}>
                  {label}
                </button>
              ))}
            </div>
          ) : null}
          {loading ? <span className="panel__meta">refreshing…</span> : null}
          {hidden.size ? (
            <button type="button" className="btn btn--sm" onClick={() => setHidden(new Set())}>
              Show all
            </button>
          ) : null}
        </div>
      </div>

      {error ? <p className="status-text status-text--error">{error}</p> : null}

      <div className={`history__body${legend === "table" ? " history__body--table" : ""}`}>
        <div ref={chartRef} className="history__chart" />
        {legend === "table" ? (
          <div className="legend">
            <div className="legend__row legend__row--head">
              <span>Name</span>
              <span>Max</span>
              <span>Mean</span>
              <span>Last</span>
            </div>
            <div className="legend__scroll">
              {rows.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  className={`legend__row${hidden.has(r.key) ? " is-hidden" : ""}`}
                  onClick={(e) => (e.shiftKey ? solo(r.key) : toggle(r.key))}
                  title="Click to hide, shift-click to solo"
                >
                  <span className="legend__name">
                    <i style={{ background: r.color }} />
                    {r.name}
                    {r.type ? <small>{r.type === "lxc" ? "ct" : r.type === "host" ? "host" : "vm"}</small> : null}
                  </span>
                  <span className="mono">{fmtCell(r.max)}</span>
                  <span className="mono">{fmtCell(r.mean)}</span>
                  <span className="mono legend__last">{fmtCell(r.last)}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
