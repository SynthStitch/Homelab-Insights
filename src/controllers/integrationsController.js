import Joi from "joi";
import { Setting } from "../models/setting.js";

/**
 * Prometheus / Alertmanager integration.
 * Settings live in the `Setting` collection under key "prometheus".
 * ponytail: URL + optional bearer token only; add basic auth / mTLS when a real deployment needs it.
 */

const KEY = "prometheus";

const schema = Joi.object({
  url: Joi.string().uri({ scheme: [/https?/] }).allow("").required(),
  alertmanagerUrl: Joi.string().uri({ scheme: [/https?/] }).allow("", null),
  token: Joi.string().allow("", null),
  enabled: Joi.boolean().default(true),
});

const trimSlash = (u) => (u || "").replace(/\/+$/, "");

async function loadSettings() {
  const doc = await Setting.findOne({ key: KEY }).lean();
  return { url: "", alertmanagerUrl: "", token: "", enabled: false, ...(doc?.value ?? {}) };
}

const publicView = (s) => ({ ...s, token: s.token ? "••••••" : "", hasToken: Boolean(s.token) });

async function promFetch(base, path, token, { timeoutMs = 8000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${trimSlash(base)}${path}`, {
      headers: { Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      signal: ctrl.signal,
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || body?.status === "error") {
      const err = new Error(body?.error || `HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

async function probe(url, token) {
  const [build, targets] = await Promise.all([
    promFetch(url, "/api/v1/status/buildinfo", token),
    promFetch(url, "/api/v1/targets?state=active", token).catch(() => null),
  ]);
  const active = targets?.data?.activeTargets ?? [];
  return {
    version: build?.data?.version ?? "unknown",
    targets: active.length,
    up: active.filter((t) => t.health === "up").length,
    jobs: [...new Set(active.map((t) => t.labels?.job).filter(Boolean))],
  };
}

export async function getPrometheus(req, res) {
  res.json({ prometheus: publicView(await loadSettings()) });
}

export async function savePrometheus(req, res) {
  const { error, value } = schema.validate(req.body ?? {});
  if (error) return res.status(400).json({ error: error.message });
  const current = await loadSettings();
  const next = {
    url: trimSlash(value.url),
    alertmanagerUrl: trimSlash(value.alertmanagerUrl),
    // Empty token in the form keeps the stored one; send "-" to clear it.
    token: value.token === "-" ? "" : value.token || current.token,
    enabled: value.enabled && Boolean(value.url),
  };
  await Setting.findOneAndUpdate({ key: KEY }, { value: next, updatedBy: req.user?.username }, { upsert: true, new: true });
  return res.json({ prometheus: publicView(next) });
}

export async function testPrometheus(req, res) {
  const { error, value } = schema.validate(req.body ?? {});
  if (error) return res.status(400).json({ error: error.message });
  const current = await loadSettings();
  const token = value.token && value.token !== "-" ? value.token : current.token;
  try {
    const result = await probe(value.url, token);
    let alertmanager = null;
    if (value.alertmanagerUrl) {
      alertmanager = await promFetch(value.alertmanagerUrl, "/api/v2/status", token)
        .then((s) => ({ ok: true, version: s?.versionInfo?.version ?? "unknown" }))
        .catch((err) => ({ ok: false, error: err.message }));
    }
    return res.json({ ok: true, result: { ...result, alertmanager } });
  } catch (err) {
    return res.status(err.status && Number.isInteger(err.status) ? err.status : 502).json({ ok: false, error: err.message });
  }
}

/** Authenticated proxy for range queries, so the browser never sees the Prometheus URL or token. */
export async function queryRange(req, res) {
  const settings = await loadSettings();
  if (!settings.enabled || !settings.url) {
    return res.status(409).json({ error: "Prometheus is not configured. Add it under Admin → Integrations." });
  }
  const { query, start, end, step } = req.query;
  if (!query) return res.status(400).json({ error: "Query parameter 'query' is required." });
  const now = Math.floor(Date.now() / 1000);
  const params = new URLSearchParams({
    query,
    start: String(start ?? now - 3600),
    end: String(end ?? now),
    step: String(step ?? "60"),
  });
  try {
    const body = await promFetch(settings.url, `/api/v1/query_range?${params}`, settings.token, { timeoutMs: 20000 });
    return res.json({ result: 200, data: body.data });
  } catch (err) {
    return res.status(err.status && Number.isInteger(err.status) ? err.status : 502).json({ error: err.message });
  }
}

/** Active alerts from Alertmanager, for a future dashboard panel. */
export async function activeAlerts(req, res) {
  const settings = await loadSettings();
  if (!settings.enabled || !settings.alertmanagerUrl) {
    return res.status(409).json({ error: "Alertmanager is not configured." });
  }
  try {
    const alerts = await promFetch(settings.alertmanagerUrl, "/api/v2/alerts?active=true&silenced=false", settings.token);
    return res.json({ result: 200, data: alerts });
  } catch (err) {
    return res.status(err.status && Number.isInteger(err.status) ? err.status : 502).json({ error: err.message });
  }
}
