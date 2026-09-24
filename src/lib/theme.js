// JS mirror of the CSS tokens for canvas/WebGL libraries (ECharts, three).
// Keep in sync with src/index.css :root.
export const colors = {
  bg: "#070b14",
  bgElev: "#0b1020",
  surface: "#0f1526",
  line: "#1e2740",
  text: "#e6ebf7",
  muted: "#8b96b0",
  faint: "#5b6680",
  accent: "#facc15",
  live: "#2dd4bf",
  info: "#60a5fa",
  violet: "#a78bfa",
  warn: "#fb923c",
  danger: "#fb7185",
};

// Distinct hues for many-series charts; host line uses colors.text.
export const seriesPalette = [
  "#facc15", "#2dd4bf", "#60a5fa", "#a78bfa", "#fb923c", "#fb7185",
  "#4ade80", "#f472b6", "#38bdf8", "#e879f9", "#fbbf24", "#34d399",
];

export const fonts = {
  mono: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
};

// Shared ECharts axis/grid styling so every chart reads as one instrument.
export const axisStyle = {
  axisLine: { lineStyle: { color: colors.line } },
  axisTick: { show: false },
  axisLabel: { color: colors.faint, fontFamily: fonts.mono, fontSize: 10 },
  splitLine: { lineStyle: { color: colors.line, type: "dashed" } },
};

export const legendStyle = {
  top: 0,
  right: 0,
  icon: "roundRect",
  itemWidth: 10,
  itemHeight: 3,
  textStyle: { color: colors.muted, fontFamily: fonts.mono, fontSize: 10 },
};

export const tooltipStyle = {
  trigger: "axis",
  backgroundColor: "rgba(20,28,49,0.96)",
  borderColor: colors.line,
  textStyle: { color: colors.text, fontFamily: fonts.mono, fontSize: 11 },
};
