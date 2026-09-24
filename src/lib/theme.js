// Chart theme module: turns the active design tokens into ECharts styling.
// Each `fx` mode also changes the *shape* of the graphs, not just colours:
//   glass → smooth lines with soft gradient fills
//   crt   → stepped phosphor traces with glow, ruler ticks (MAGI)
//   grid  → thin straight strokes, no fill (wireframe)
//   terrain → hairline strokes, cool grey palette, dotted grid (Oblivion)
import { PRESETS } from "./themes.js";

const glassPalette = ["#facc15", "#2dd4bf", "#60a5fa", "#a78bfa", "#fb923c", "#fb7185", "#4ade80", "#f472b6", "#38bdf8", "#e879f9", "#fbbf24", "#34d399"];

export function buildChartTheme(vars, fx = vars.fx || "glass") {
  const colors = {
    bg: vars.bg,
    bgElev: vars["bg-elev"],
    surface: vars.surface,
    line: vars["line-strong"],
    lineSoft: vars.line,
    text: vars.text,
    muted: vars.muted,
    faint: vars.faint,
    accent: vars.accent,
    live: vars.live,
    info: vars.info,
    violet: vars.violet,
    warn: vars.warn,
    danger: vars.danger,
  };
  const fonts = { mono: vars["font-mono"] };
  const crt = fx === "crt";
  const wire = fx === "grid" || fx === "terrain";
  const terrain = fx === "terrain";

  const seriesPalette = crt
    ? [colors.accent, colors.live, colors.danger, colors.info, colors.warn, colors.violet, "#ffd9b3", "#c8ffd0", "#ff8f7a", "#ffe6a3"]
    : terrain
      ? ["#e3e8ee", "#9cc3e6", "#a9e3c9", "#8a9bb0", "#c9d3dd", "#b9b4e6", "#e6c79c", "#6f8496", "#e6a1a1", "#dfe6ee", "#7fa4c4", "#94a0ad"]
      : wire
        ? ["#ffffff", "#bdbdbd", "#8f8f8f", colors.live, colors.info, colors.violet, colors.warn, colors.danger, "#6e6e6e", "#d0d0d0"]
        : glassPalette;

  const axisStyle = {
    axisLine: { lineStyle: { color: colors.line } },
    axisTick: crt ? { show: true, length: 5, lineStyle: { color: colors.line } } : { show: false },
    ...(crt ? { minorTick: { show: true, splitNumber: 5, length: 3, lineStyle: { color: colors.lineSoft } } } : {}),
    axisLabel: { color: colors.faint, fontFamily: fonts.mono, fontSize: 10 },
    splitLine: { lineStyle: { color: colors.lineSoft, type: crt || terrain ? "dotted" : wire ? "solid" : "dashed" } },
  };

  const legendStyle = {
    top: 0,
    right: 0,
    icon: "roundRect",
    itemWidth: 10,
    itemHeight: 3,
    textStyle: { color: colors.muted, fontFamily: fonts.mono, fontSize: 10 },
  };

  const tooltipStyle = {
    trigger: "axis",
    backgroundColor: vars["surface-2"],
    borderColor: colors.line,
    textStyle: { color: colors.text, fontFamily: fonts.mono, fontSize: 11 },
  };

  const line = (color, width = crt ? 1.6 : wire ? 1.2 : 2) => ({
    width,
    color,
    ...(crt ? { shadowBlur: 10, shadowColor: color } : {}),
  });

  const seriesStyle = crt ? { step: "end", smooth: false } : terrain ? { smooth: 0.15 } : wire ? { smooth: false } : { smooth: 0.35 };

  const area = (color) =>
    crt || wire
      ? undefined
      : {
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: `${color}55` },
              { offset: 1, color: `${color}00` },
            ],
          },
        };

  return { fx, colors, fonts, seriesPalette, axisStyle, legendStyle, tooltipStyle, line, seriesStyle, area };
}

// Static fallback for non-React consumers (three.js scene, tests).
export const colors = buildChartTheme(PRESETS.oblivion.vars).colors;
