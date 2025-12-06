const API_BASE =
  typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE
    ? import.meta.env.VITE_API_BASE.replace(/\/$/, "")
    : "http://localhost:4100";

const AUTH_STORAGE_KEY = "homelab-auth";

function getStoredToken() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.token || null;
  } catch (err) {
    return null;
  }
}

function buildUrl(path, params = {}) {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const baseUrl = `${API_BASE}/`;
  const url = new URL(normalizedPath, baseUrl);
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    url.searchParams.set(key, value);
  });
  return url.toString();
}

async function fetchJson(path, params) {
  const token = getStoredToken();
  const response = await fetch(buildUrl(path, params), {
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data?.error || `Request failed with status ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return data;
}

export function fetchSnapshots({ node, vmid, limit } = {}) {
  return fetchJson("/api/proxmox/snapshots", { node, vmid, limit });
}

export function fetchLatestSnapshot({ node, vmid } = {}) {
  return fetchJson("/api/proxmox/snapshots/latest", { node, vmid });
}

export function fetchNodeSummary({ node } = {}) {
  return fetchJson("/api/proxmox/node-summary", { node });
}

export function fetchNodeVms({ node } = {}) {
  return fetchJson("/api/proxmox/vms", { node });
}
