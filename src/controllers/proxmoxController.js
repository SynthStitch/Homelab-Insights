import {
  fetchVmStatus,
  fetchRaw,
  fetchNodeStatus,
  fetchNodeVms,
  fetchRrd,
} from "../services/proxmoxClient.js";
import { ProxmoxSnapshot, ProxmoxNode } from "../models/index.js";
import { config } from "../config.js";

/**
 * Controller layer for Proxmox-related routes.
 * Uses per-node config from Mongo when available; falls back to env config.
 * This keeps UI-added nodes (with their own host/IP and token) working without .env edits.
 */

function buildErrorResponse(err) {
  const status = Number.isInteger(err?.status) ? err.status : 500;
  const payload = {
    result: status,
    error: err?.message ?? "Proxmox request failed",
  };
  if (err?.body) {
    payload.details = err.body;
  }
  return { status, payload };
}

/**
 * The UI addresses hosts by the saved node's display name (unique), falling back to the
 * env default. The Proxmox node identifier is only used for API paths, since every
 * fresh install is called "pve" and two of them must coexist.
 */
async function resolveTarget(key) {
  const wanted = key ?? config.proxmox.defaultNode ?? undefined;
  if (!wanted) return { key: wanted, node: wanted, nodeConfig: null };
  const nodeConfig =
    (await ProxmoxNode.findOne({ name: wanted }).lean().exec()) ??
    (await ProxmoxNode.findOne({ node: wanted }).lean().exec());
  return { key: nodeConfig?.name ?? wanted, node: nodeConfig?.node ?? wanted, nodeConfig };
}

export const getVmStatus = async (req, res) => {
  try {
    const { node: nodeName, nodeConfig } = await resolveTarget(req.query.node);
    const data = await fetchVmStatus({
      node: nodeName,
      vmid: req.query.vmid,
      type: req.query.type,
      nodeConfig,
    });
    res.status(200);
    res.json({ result: 200, data });
  } catch (err) {
    console.error("getVmStatus error", err);
    const { status, payload } = buildErrorResponse(err);
    res.status(status);
    res.json(payload);
  }
};

export const proxyProxmoxPath = async (req, res) => {
  const path = req.query.path;
  if (!path) {
    res.status(400);
    res.json({ result: 400, error: "Query parameter 'path' is required." });
    return;
  }
  try {
    // Note: proxy currently uses env config only; extend with node lookup if you expose it in UI.
    const data = await fetchRaw(path, { signal: req.signal });
    res.status(200);
    res.json({ result: 200, data });
  } catch (err) {
    console.error("proxyProxmoxPath error", err);
    const { status, payload } = buildErrorResponse(err);
    res.status(status);
    res.json(payload);
  }
};

function serializeSnapshot(doc) {
  if (!doc) return null;
  return {
    id: doc._id.toString(),
    node: doc.node,
    vmid: doc.vmid,
    status: doc.status,
    cpuPercent: doc.cpuPercent,
    memory: doc.memory,
    uptimeSeconds: doc.uptimeSeconds,
    collectedAt: doc.collectedAt,
    raw: doc.raw,
  };
}

export const getLatestSnapshot = async (req, res) => {
  const node = req.query.node;
  const vmid = req.query.vmid;

  if (!node || !vmid) {
    res.status(400);
    res.json({ result: 400, error: "Query parameters 'node' and 'vmid' are required." });
    return;
  }

  try {
    const doc = await ProxmoxSnapshot.findOne({ node, vmid })
      .sort({ collectedAt: -1 })
      .lean();
    if (!doc) {
      res.status(404);
      res.json({ result: 404, error: "No snapshots found for the specified node/vmid." });
      return;
    }
    res.status(200);
    res.json({ result: 200, data: serializeSnapshot(doc) });
  } catch (err) {
    console.error("getLatestSnapshot error", err);
    const { status, payload } = buildErrorResponse(err);
    res.status(status);
    res.json(payload);
  }
};

export const listSnapshots = async (req, res) => {
  const { node, vmid } = req.query;
  const limit = Math.min(Number(req.query.limit) || 50, 500);

  if (!node || !vmid) {
    res.status(400);
    res.json({ result: 400, error: "Query parameters 'node' and 'vmid' are required." });
    return;
  }

  try {
    const docs = await ProxmoxSnapshot.find({ node, vmid })
      .sort({ collectedAt: -1 })
      .limit(limit)
      .lean();
    res.status(200);
    res.json({ result: 200, data: docs.map(serializeSnapshot) });
  } catch (err) {
    console.error("listSnapshots error", err);
    const { status, payload } = buildErrorResponse(err);
    res.status(status);
    res.json(payload);
  }
};

function mapNodeSummary(payload) {
  if (!payload) return null;
  const detail = payload.detail?.data?.data ?? payload.detail?.data ?? payload.detail ?? {};
  const nodeEntry = payload.nodeEntry ?? {};

  const memory = detail.memory ?? {};
  const rootfs = detail.rootfs ?? {};

  return {
    node: nodeEntry.node ?? detail.node ?? payload.node,
    status: nodeEntry.status ?? detail.status ?? "unknown",
    cpu: nodeEntry.cpu ?? detail.cpu,
    maxCpu: nodeEntry.maxcpu ?? detail.maxcpu ?? detail.maxCpu,
    memory: {
      used: memory.used ?? nodeEntry.mem,
      free: memory.free ?? memory.available,
      max: memory.total ?? nodeEntry.maxmem,
      available: memory.available,
      fsUsed: rootfs.used ?? nodeEntry.disk,
      fsTotal: rootfs.total ?? nodeEntry.maxdisk,
    },
    uptimeSeconds: nodeEntry.uptime ?? detail.uptime,
    loadAvg: detail.loadavg ?? nodeEntry.loadavg,
    version: detail.pveversion ?? nodeEntry.pveversion ?? detail.version,
  };
}

export const getNodeSummary = async (req, res) => {
  try {
    const { key, node: nodeName, nodeConfig } = await resolveTarget(req.query.node);
    const payload = await fetchNodeStatus({
      node: nodeName,
      nodeConfig,
    });
    const data = mapNodeSummary(payload);
    if (data) data.node = key;
    res.status(200);
    res.json({ result: 200, data });
  } catch (err) {
    console.error("getNodeSummary error", err);
    const { status, payload } = buildErrorResponse(err);
    res.status(status);
    res.json(payload);
  }
};

function mapVmList(payload) {
  const list = payload?.data ?? payload;
  if (!Array.isArray(list)) return [];
  return list.map((item) => ({
    id: item?.vmid ?? item?.id,
    type: item?.type === "lxc" ? "lxc" : "qemu",
    name: item?.name ?? item?.vmid?.toString(),
    status: item?.status,
    cpu: item?.cpu,
    maxCpu: item?.maxcpu,
    mem: item?.mem,
    maxMem: item?.maxmem,
    disk: item?.disk,
    maxDisk: item?.maxdisk,
    uptimeSeconds: item?.uptime,
    pid: item?.pid,
    node: item?.node,
    template: Boolean(item?.template),
  }));
}

function summarizeSnapshot(doc) {
  if (!doc) return null;
  const memory = doc.memory ?? {};
  const used = typeof memory.used === "number" ? memory.used : null;
  const max = typeof memory.max === "number" ? memory.max : null;
  let percent = null;
  if (Number.isFinite(used) && Number.isFinite(max) && max > 0) {
    percent = Math.round((used / max) * 10000) / 100;
  }
  return {
    collectedAt: doc.collectedAt,
    cpuPercent: doc.cpuPercent,
    memoryUsed: used,
    memoryMax: max,
    memoryPercent: percent,
  };
}

export const listNodeVms = async (req, res) => {
  try {
    const { key, node: nodeName, nodeConfig } = await resolveTarget(req.query.node);
    const payload = await fetchNodeVms({
      node: nodeName,
      nodeConfig,
    });
    const vms = mapVmList(payload).map((vm) => ({ ...vm, node: key }));

    // Enforce per-user VM allowlist (unless "*" or empty)
    const allowedVmIds = Array.isArray(req.user?.allowedVmIds) ? req.user.allowedVmIds : [];
    const allowAll = allowedVmIds.length === 0 || allowedVmIds.includes("*");
    const filteredVms = allowAll
      ? vms
      : vms.filter((vm) => allowedVmIds.includes(String(vm.id)));

    const vmIds = filteredVms.map((vm) => String(vm.id)).filter(Boolean);
    let latestSnapshots = new Map();
    if (vmIds.length > 0) {
      const query = {
        vmid: { $in: vmIds },
      };
      if (key) {
        query.node = key;
      }
      const snapshots = await ProxmoxSnapshot.find(query)
        .sort({ collectedAt: -1 })
        .lean();
      latestSnapshots = new Map();
      for (const snap of snapshots) {
        const key = String(snap.vmid);
        if (!latestSnapshots.has(key)) {
          latestSnapshots.set(key, summarizeSnapshot(snap));
        }
      }
    }

    const enriched = filteredVms.map((vm) => {
      const snapshot = latestSnapshots.get(String(vm.id));
      return snapshot
        ? {
            ...vm,
            snapshot,
          }
        : vm;
    });

    res.status(200);
    res.json({ result: 200, data: enriched });
  } catch (err) {
    console.error("listNodeVms error", err);
    const { status, payload } = buildErrorResponse(err);
    res.status(status);
    res.json(payload);
  }
};

// ---------------------------------------------------------------------------
// History: Grafana-style multi-series from Proxmox's own RRD store.
// ponytail: 30s in-memory cache; per-node fan-out is ~1 request per guest.
// ---------------------------------------------------------------------------

const TIMEFRAMES = new Set(["hour", "day", "week", "month", "year"]);
const historyCache = new Map();
const HISTORY_TTL_MS = 30_000;

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
const pct = (a, b) => (num(a) !== null && num(b) > 0 ? Math.round((a / b) * 1000) / 10 : null);
const mbps = (a, b) => (num(a) !== null || num(b) !== null ? Math.round((((a ?? 0) + (b ?? 0)) / 1024 ** 2) * 100) / 100 : null);

function guestSeries(rows) {
  const t = [];
  const cpu = [];
  const mem = [];
  const disk = [];
  const net = [];
  for (const r of rows) {
    if (!r?.time) continue;
    t.push(r.time * 1000);
    cpu.push(num(r.cpu) === null ? null : Math.round(r.cpu * 1000) / 10);
    mem.push(pct(r.mem, r.maxmem));
    disk.push(mbps(r.diskread, r.diskwrite));
    net.push(mbps(r.netin, r.netout));
  }
  return { t, cpu, mem, disk, net };
}

function nodeSeries(rows) {
  const t = [];
  const cpu = [];
  const mem = [];
  const disk = [];
  const net = [];
  for (const r of rows) {
    if (!r?.time) continue;
    t.push(r.time * 1000);
    cpu.push(num(r.cpu) === null ? null : Math.round(r.cpu * 1000) / 10);
    mem.push(pct(r.memused, r.memtotal));
    disk.push(null); // node rrd has no disk throughput; only root fs usage
    net.push(mbps(r.netin, r.netout));
  }
  return { t, cpu, mem, disk, net };
}

export const getHistory = async (req, res) => {
  try {
    const timeframe = TIMEFRAMES.has(req.query.timeframe) ? req.query.timeframe : "hour";
    const { key, node: nodeName, nodeConfig } = await resolveTarget(req.query.node);
    const cacheKey = `${key}:${timeframe}:${req.user?.username ?? ""}`;
    const hit = historyCache.get(cacheKey);
    if (hit && Date.now() - hit.at < HISTORY_TTL_MS) {
      // Several panels ask at once; share one in-flight fan-out.
      res.json({ result: 200, data: await hit.promise, cached: true });
      return;
    }
    const promise = (async () => {

    const vms = mapVmList(await fetchNodeVms({ node: nodeName, nodeConfig }));
    const allowedVmIds = Array.isArray(req.user?.allowedVmIds) ? req.user.allowedVmIds : [];
    const allowAll = allowedVmIds.length === 0 || allowedVmIds.includes("*");
    const visible = (allowAll ? vms : vms.filter((vm) => allowedVmIds.includes(String(vm.id)))).filter((vm) => !vm.template);

    const [hostRows, ...guestRows] = await Promise.all([
      fetchRrd({ node: nodeName, timeframe, nodeConfig }).catch(() => []),
      ...visible.map((vm) =>
        fetchRrd({ node: nodeName, type: vm.type, vmid: vm.id, timeframe, nodeConfig }).catch(() => []),
      ),
    ]);

    return {
      node: key,
      timeframe,
      host: nodeSeries(hostRows),
      guests: visible.map((vm, i) => ({ id: vm.id, name: vm.name, type: vm.type, status: vm.status, ...guestSeries(guestRows[i]) })),
    };
    })();
    historyCache.set(cacheKey, { at: Date.now(), promise });
    promise.catch(() => historyCache.delete(cacheKey));
    res.json({ result: 200, data: await promise });
  } catch (err) {
    console.error("getHistory error", err);
    const { status, payload } = buildErrorResponse(err);
    res.status(status);
    res.json(payload);
  }
};
