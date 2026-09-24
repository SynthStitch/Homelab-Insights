import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { PRESETS, applyTheme, loadActive, loadCustomThemes, resolveTheme, saveActive, saveCustomThemes } from "../lib/themes.js";
import { buildChartTheme } from "../lib/theme.js";

const ThemeContext = createContext(null);
const PRIVACY_KEY = "homelab-privacy";

export function ThemeProvider({ children }) {
  const [active, setActive] = useState(loadActive); // { id, overrides }
  const [customs, setCustoms] = useState(loadCustomThemes);
  const [labOpen, setLabOpen] = useState(false);
  const [privacy, setPrivacy] = useState(() => {
    try {
      return localStorage.getItem(PRIVACY_KEY) === "1";
    } catch {
      return false;
    }
  });

  const resolved = useMemo(() => resolveTheme(active.id, customs), [active.id, customs]);
  const vars = useMemo(() => ({ ...resolved.vars, ...active.overrides }), [resolved, active.overrides]);

  useEffect(() => {
    applyTheme(vars, resolved.base);
    saveActive(active);
  }, [vars, resolved.base, active]);

  useEffect(() => {
    document.documentElement.dataset.privacy = privacy ? "on" : "off";
    try {
      localStorage.setItem(PRIVACY_KEY, privacy ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [privacy]);

  const setTheme = useCallback((id) => setActive({ id, overrides: {} }), []);
  const setVar = useCallback((key, value) => setActive((a) => ({ ...a, overrides: { ...a.overrides, [key]: value } })), []);
  const resetOverrides = useCallback(() => setActive((a) => ({ ...a, overrides: {} })), []);

  const saveAs = useCallback(
    (name) => {
      const clean = name?.trim();
      if (!clean || PRESETS[clean]) return false;
      const next = { ...customs, [clean]: { base: resolved.base, vars } };
      setCustoms(next);
      saveCustomThemes(next);
      setActive({ id: clean, overrides: {} });
      return true;
    },
    [customs, resolved.base, vars],
  );

  const removeCustom = useCallback(
    (name) => {
      const next = { ...customs };
      delete next[name];
      setCustoms(next);
      saveCustomThemes(next);
      setActive((a) => (a.id === name ? { id: "glass", overrides: {} } : a));
    },
    [customs],
  );

  const importTheme = useCallback(
    (json) => {
      try {
        const parsed = JSON.parse(json);
        const name = parsed.name?.trim();
        if (!name || !parsed.vars) return false;
        const next = { ...customs, [name]: { base: PRESETS[parsed.base] ? parsed.base : "glass", vars: parsed.vars } };
        setCustoms(next);
        saveCustomThemes(next);
        setActive({ id: name, overrides: {} });
        return true;
      } catch {
        return false;
      }
    },
    [customs],
  );

  const exportTheme = useCallback(() => JSON.stringify({ name: active.id, base: resolved.base, vars }, null, 2), [active.id, resolved.base, vars]);

  const chart = useMemo(() => buildChartTheme(vars), [vars]);

  const value = useMemo(
    () => ({
      id: active.id,
      base: resolved.base,
      vars,
      dirty: Object.keys(active.overrides).length > 0,
      customs,
      chart,
      labOpen,
      setLabOpen,
      privacy,
      setPrivacy,
      setTheme,
      setVar,
      resetOverrides,
      saveAs,
      removeCustom,
      importTheme,
      exportTheme,
    }),
    [active.id, active.overrides, resolved.base, vars, customs, chart, labOpen, privacy, setTheme, setVar, resetOverrides, saveAs, removeCustom, importTheme, exportTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useChartTheme() {
  return useTheme().chart;
}
