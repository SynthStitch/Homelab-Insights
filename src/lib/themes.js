// Theme presets + custom-theme storage. A theme is a flat map of CSS custom
// property names (without the --) to values, plus `fx` (atmosphere style).
// ponytail: custom themes live in localStorage; export/import JSON covers sharing.

export const FONT_STACKS = {
  bricolage: '"Bricolage Grotesque", "Instrument Sans", system-ui, sans-serif',
  instrument: '"Instrument Sans", system-ui, -apple-system, "Segoe UI", sans-serif',
  jetbrains: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
  sharetech: '"Share Tech Mono", "JetBrains Mono", ui-monospace, monospace',
  barlow: '"Barlow Condensed", "Arial Narrow", sans-serif',
  plexmono: '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
  plexsans: '"IBM Plex Sans", "Instrument Sans", system-ui, sans-serif',
  jura: '"Jura", "IBM Plex Sans", system-ui, sans-serif',
  system: 'system-ui, -apple-system, "Segoe UI", sans-serif',
};

export const FX_OPTIONS = [
  ["terrain", "Wireframe terrain"],
  ["glass", "Glass shards"],
  ["crt", "CRT scanlines"],
  ["grid", "Flat grid"],
];

const glass = {
  bg: "#070b14",
  "bg-elev": "#0b1020",
  surface: "#0f1526",
  "surface-2": "#141c31",
  line: "#94a3b824",
  "line-strong": "#94a3b84d",
  text: "#e6ebf7",
  muted: "#8b96b0",
  faint: "#5b6680",
  accent: "#facc15",
  "accent-soft": "#facc1524",
  "accent-ink": "#1a1400",
  live: "#2dd4bf",
  info: "#60a5fa",
  violet: "#a78bfa",
  warn: "#fb923c",
  danger: "#fb7185",
  "font-display": FONT_STACKS.bricolage,
  "font-body": FONT_STACKS.instrument,
  "font-mono": FONT_STACKS.jetbrains,
  radius: "10px",
  "radius-sm": "6px",
  glow: "none",
  fx: "glass",
};

// Evangelion MAGI: phosphor orange on black, green for "pattern green", red alerts.
const magi = {
  bg: "#050302",
  "bg-elev": "#0a0604",
  surface: "#0c0805",
  "surface-2": "#140d07",
  line: "#ff7a1a33",
  "line-strong": "#ff7a1a73",
  text: "#ffb067",
  muted: "#d2762b",
  faint: "#8a4b1c",
  accent: "#ff7a1a",
  "accent-soft": "#ff7a1a26",
  "accent-ink": "#140700",
  live: "#7dff9a",
  info: "#ffd166",
  violet: "#ff5a3c",
  warn: "#ffa726",
  danger: "#ff3b30",
  "font-display": FONT_STACKS.barlow,
  "font-body": FONT_STACKS.sharetech,
  "font-mono": FONT_STACKS.sharetech,
  radius: "2px",
  "radius-sm": "2px",
  glow: "0 0 8px rgba(255, 122, 26, 0.55)",
  fx: "crt",
};

// Wireframe: monochrome technical drawing, thin white lines, no colour except status.
const wire = {
  bg: "#060606",
  "bg-elev": "#0b0b0b",
  surface: "#0f0f0f",
  "surface-2": "#171717",
  line: "#ffffff1f",
  "line-strong": "#ffffff40",
  text: "#ededed",
  muted: "#9a9a9a",
  faint: "#5c5c5c",
  accent: "#ffffff",
  "accent-soft": "#ffffff1a",
  "accent-ink": "#000000",
  live: "#a8ffb0",
  info: "#b9d7ff",
  violet: "#d4c4ff",
  warn: "#ffd9a8",
  danger: "#ff9c9c",
  "font-display": FONT_STACKS.plexmono,
  "font-body": FONT_STACKS.plexmono,
  "font-mono": FONT_STACKS.plexmono,
  radius: "0px",
  "radius-sm": "0px",
  glow: "none",
  fx: "grid",
};

// Oblivion: monochrome near-black, light spaced type, wireframe terrain, frosted pills.
const oblivion = {
  bg: "#07080a",
  "bg-elev": "#0b0d10",
  surface: "#0e1114",
  "surface-2": "#151a1f",
  line: "#c7d1dc1f",
  "line-strong": "#c7d1dc40",
  text: "#e3e8ee",
  muted: "#94a0ad",
  faint: "#5b6672",
  accent: "#d6dee7",
  "accent-soft": "#d6dee71a",
  "accent-ink": "#0b0d10",
  live: "#a9e3c9",
  info: "#9cc3e6",
  violet: "#b9b4e6",
  warn: "#e6c79c",
  danger: "#e6a1a1",
  "font-display": FONT_STACKS.jura,
  "font-body": FONT_STACKS.plexsans,
  "font-mono": FONT_STACKS.plexmono,
  radius: "4px",
  "radius-sm": "3px",
  glow: "none",
  fx: "terrain",
};

export const PRESETS = {
  oblivion: { label: "Oblivion", vars: oblivion },
  glass: { label: "Glass", vars: glass },
  magi: { label: "MAGI", vars: magi },
  wire: { label: "Wireframe", vars: wire },
};

export const TOKEN_GROUPS = [
  { title: "Surfaces", keys: ["bg", "bg-elev", "surface", "surface-2", "line", "line-strong"] },
  { title: "Ink", keys: ["text", "muted", "faint"] },
  { title: "Brand & status", keys: ["accent", "accent-soft", "accent-ink", "live", "info", "violet", "warn", "danger"] },
];

const CUSTOM_KEY = "homelab-custom-themes";
const ACTIVE_KEY = "homelab-theme";

const read = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const write = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode */
  }
};

export const loadCustomThemes = () => read(CUSTOM_KEY, {});
export const saveCustomThemes = (themes) => write(CUSTOM_KEY, themes);
const DEFAULT_ID = "oblivion";
const MIGRATION_KEY = "homelab-theme-migrated-oblivion";

// New visitors get Oblivion. Existing browsers still on untouched Glass are moved once.
export const loadActive = () => {
  const active = read(ACTIVE_KEY, { id: DEFAULT_ID, overrides: {} });
  try {
    if (!localStorage.getItem(MIGRATION_KEY)) {
      localStorage.setItem(MIGRATION_KEY, "1");
      if (active.id === "glass" && !Object.keys(active.overrides ?? {}).length) return { id: DEFAULT_ID, overrides: {} };
    }
  } catch {
    /* ignore */
  }
  return active;
};
export const saveActive = (active) => write(ACTIVE_KEY, active);

/** Resolve an id (preset or custom name) to { base, vars }. */
export function resolveTheme(id, customs = loadCustomThemes()) {
  if (PRESETS[id]) return { base: id, vars: PRESETS[id].vars };
  const custom = customs[id];
  if (custom) return { base: custom.base || "glass", vars: { ...PRESETS[custom.base || "glass"].vars, ...custom.vars } };
  return { base: "oblivion", vars: PRESETS.oblivion.vars };
}

/** Push a resolved var map onto <html>. */
export function applyTheme(vars, base) {
  const root = document.documentElement;
  for (const [k, v] of Object.entries(vars)) {
    if (k === "fx") continue;
    root.style.setProperty(`--${k}`, v);
  }
  root.dataset.theme = base;
  root.dataset.fx = vars.fx || "glass";
}
