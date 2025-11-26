import {
  fetchVmStatus,
  fetchRaw,
  fetchNodeStatus,
  fetchNodeVms,
} from "../services/proxmoxClient.js";
import { ProxmoxSnapshot } from "../models/index.js";
import { config } from "../config.js";

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

export const getVmStatus = async (req, res) => {
  try {
    const data = await fetchVmStatus({
      node: req.query.node,
      vmid: req.query.vmid,
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
    const payload = await fetchNodeStatus({
      node: req.query.node,
    });
    const data = mapNodeSummary(payload);
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
    name: item?.name ?? item?.vmid?.toString(),
    status: item?.status,
    cpu: item?.cpu,
    maxCpu: item?.maxcpu,
    mem: item?.mem,
    maxMem: item?.maxmem,
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
    const payload = await fetchNodeVms({
      node: req.query.node,
    });
    const nodeName = req.query.node ?? config.proxmox.defaultNode ?? undefined;
    const vms = mapVmList(payload);

    const vmIds = vms.map((vm) => String(vm.id)).filter(Boolean);
    let latestSnapshots = new Map();
    if (vmIds.length > 0) {
      const query = {
        vmid: { $in: vmIds },
      };
      if (nodeName) {
        query.node = nodeName;
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

    const enriched = vms.map((vm) => {
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
