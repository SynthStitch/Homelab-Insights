import { fetchVmStatus } from "./proxmoxClient.js";
import { ProxmoxSnapshot } from "../models/index.js";
import { config } from "../config.js";

let timer = null;
let running = false;

function extractMetrics(payload) {
  const data = payload?.data ?? payload;
  if (!data) return {};
  const cpuPercent =
    typeof data.cpu === "number" ? Math.round(data.cpu * 100 * 100) / 100 : undefined;
  return {
    status: data.status ?? data.qmpstatus ?? data.running ?? data.runningMachine,
    cpuPercent,
    memory: {
      used: data.mem ?? null,
      free: data.freemem ?? null,
      max: data.maxmem ?? null,
    },
    uptimeSeconds: typeof data.uptime === "number" ? data.uptime : undefined,
  };
}

export async function collectSnapshotOnce({
  node = config.proxmox.defaultNode,
  vmid = config.proxmox.defaultVmid,
} = {}) {
  if (!node || !vmid) {
    throw new Error("collectSnapshotOnce requires node and vmid to be configured.");
  }
  const payload = await fetchVmStatus({ node, vmid });
  const metrics = extractMetrics(payload?.data ?? payload);

  await ProxmoxSnapshot.create({
    node,
    vmid,
    status: metrics.status,
    cpuPercent: metrics.cpuPercent,
    memory: metrics.memory,
    uptimeSeconds: metrics.uptimeSeconds,
    raw: payload?.data ?? payload,
  });

  return metrics;
}

export function startProxmoxPolling({
  node = config.proxmox.defaultNode,
  vmid = config.proxmox.defaultVmid,
  intervalMs = config.proxmox.pollIntervalMs,
} = {}) {
  if (running) return;
  if (!node || !vmid) {
    console.warn("Proxmox polling skipped: node/vmid not configured.");
    return;
  }
  running = true;

  const tick = async () => {
    try {
      await collectSnapshotOnce({ node, vmid });
    } catch (err) {
      console.error("Proxmox polling error", err);
    }
  };

  // run immediately, don't await to keep startup fast
  void tick();

  timer = setInterval(tick, intervalMs);
  timer.unref?.();
  console.log(`Proxmox polling started (node=${node}, vmid=${vmid}, interval=${intervalMs}ms)`);
}

export function stopProxmoxPolling() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  running = false;
}
