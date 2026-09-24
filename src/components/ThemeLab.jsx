import { useState } from "react";
import { useTheme } from "../context/ThemeContext.jsx";
import { FONT_STACKS, FX_OPTIONS, PRESETS, TOKEN_GROUPS } from "../lib/themes.js";
import "./ThemeLab.css";

const isHex6 = (v) => /^#[0-9a-f]{6}$/i.test(v);
const FONT_KEYS = [
  ["font-display", "Display"],
  ["font-body", "Body"],
  ["font-mono", "Mono"],
];
const RADII = ["0px", "2px", "6px", "10px", "14px"];

function fontKeyFor(stack) {
  return Object.entries(FONT_STACKS).find(([, v]) => v === stack)?.[0] ?? "";
}

export default function ThemeLab() {
  const t = useTheme();
  const [io, setIo] = useState("");
  const [note, setNote] = useState("");

  if (!t.labOpen) return null;

  const flash = (msg) => {
    setNote(msg);
    setTimeout(() => setNote(""), 1800);
  };

  return (
    <aside className="lab" role="dialog" aria-label="Theme lab">
      <div className="lab__head">
        <div>
          <span className="panel__title">Theme lab</span>
          <p className="lab__sub">
            {t.id}
            {t.dirty ? " · unsaved edits" : ""}
          </p>
        </div>
        <button type="button" className="assistant__close" onClick={() => t.setLabOpen(false)} aria-label="Close theme lab">
          ×
        </button>
      </div>

      <div className="lab__body">
        <section className="lab__sec">
          <h4>Presets</h4>
          <div className="lab__chips">
            {Object.entries(PRESETS).map(([id, p]) => (
              <button key={id} type="button" className={`chip${t.id === id ? " is-active" : ""}`} onClick={() => t.setTheme(id)}>
                {p.label}
              </button>
            ))}
          </div>
          {Object.keys(t.customs).length ? (
            <>
              <h4>Saved</h4>
              <div className="lab__chips">
                {Object.keys(t.customs).map((name) => (
                  <span key={name} className={`chip lab__custom${t.id === name ? " is-active" : ""}`}>
                    <button type="button" onClick={() => t.setTheme(name)}>
                      {name}
                    </button>
                    <button type="button" aria-label={`Delete ${name}`} onClick={() => t.removeCustom(name)}>
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </>
          ) : null}
        </section>

        {TOKEN_GROUPS.map((group) => (
          <section key={group.title} className="lab__sec">
            <h4>{group.title}</h4>
            <div className="lab__tokens">
              {group.keys.map((key) => {
                const value = t.vars[key];
                return (
                  <label key={key} className="lab__token">
                    <span>{key}</span>
                    {isHex6(value) ? (
                      <input type="color" value={value} onChange={(e) => t.setVar(key, e.target.value)} />
                    ) : (
                      <input type="text" value={value} onChange={(e) => t.setVar(key, e.target.value)} spellCheck={false} />
                    )}
                  </label>
                );
              })}
            </div>
          </section>
        ))}

        <section className="lab__sec">
          <h4>Type & shape</h4>
          <div className="lab__tokens">
            {FONT_KEYS.map(([key, label]) => (
              <label key={key} className="lab__token">
                <span>{label}</span>
                <select value={fontKeyFor(t.vars[key])} onChange={(e) => t.setVar(key, FONT_STACKS[e.target.value])}>
                  {Object.keys(FONT_STACKS).map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <label className="lab__token">
              <span>radius</span>
              <select
                value={t.vars.radius}
                onChange={(e) => {
                  t.setVar("radius", e.target.value);
                  t.setVar("radius-sm", e.target.value === "0px" ? "0px" : `${Math.max(2, parseInt(e.target.value, 10) - 4)}px`);
                }}
              >
                {RADII.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <label className="lab__token">
              <span>atmosphere</span>
              <select value={t.vars.fx} onChange={(e) => t.setVar("fx", e.target.value)}>
                {FX_OPTIONS.map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="lab__token">
              <span>glow</span>
              <select value={t.vars.glow === "none" ? "off" : "on"} onChange={(e) => t.setVar("glow", e.target.value === "on" ? `0 0 8px ${t.vars.accent}99` : "none")}>
                <option value="off">off</option>
                <option value="on">on</option>
              </select>
            </label>
          </div>
        </section>

        <section className="lab__sec">
          <h4>Save & share</h4>
          <div className="actions">
            <button
              type="button"
              className="btn btn--sm btn--primary"
              onClick={() => {
                const name = window.prompt("Save theme as", t.id.startsWith("glass") || PRESETS[t.id] ? "" : t.id);
                if (name && t.saveAs(name)) flash(`saved “${name}”`);
              }}
            >
              Save as…
            </button>
            <button type="button" className="btn btn--sm" onClick={t.resetOverrides} disabled={!t.dirty}>
              Reset edits
            </button>
            <button
              type="button"
              className="btn btn--sm"
              onClick={() => {
                const json = t.exportTheme();
                setIo(json);
                navigator.clipboard?.writeText(json).then(() => flash("copied JSON"), () => flash("JSON below"));
              }}
            >
              Export
            </button>
            <button type="button" className="btn btn--sm" onClick={() => flash(t.importTheme(io) ? "imported" : "invalid JSON")}>
              Import
            </button>
          </div>
          <textarea className="lab__io" rows={5} value={io} onChange={(e) => setIo(e.target.value)} placeholder='{"name":"my theme","base":"magi","vars":{...}}' spellCheck={false} />
          {note ? <p className="status-text status-text--success">{note}</p> : null}
        </section>
      </div>
    </aside>
  );
}
