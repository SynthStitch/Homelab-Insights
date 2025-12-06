import { fetchVmStatus } from "./proxmoxClient.js";
import { ProxmoxSnapshot, ProxmoxNode } from "../models/index.js";
import { config } from "../config.js";
import { fetchNodeVms } from "./proxmoxClient.js";

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

/**
 * Collect a single snapshot for a given node/vmid using the provided nodeConfig (from DB) or fallback config.
 */
export async function collectSnapshotOnce({
  node = config.proxmox.defaultNode,
  vmid = config.proxmox.defaultVmid,
  nodeConfig = null,
} = {}) {
  if (!node || !vmid) {
    throw new Error("collectSnapshotOnce requires node and vmid to be configured.");
  }
  const payload = await fetchVmStatus({ node, vmid, nodeConfig });
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

/**
 * Poll all saved Proxmox nodes (from Mongo) plus the fallback env default.
 * Each tick loads the latest nodes so newly added nodes in the UI will start polling automatically.
 * If a node has no default VMID, we pick the first VM on that node so charts still populate.
 */
export function startProxmoxPolling({ intervalMs = config.proxmox.pollIntervalMs } = {}) {
  if (running) return;
  running = true;

  const tick = async () => {
    try {
      // Load nodes from DB (UI-saved). If none, fall back to env default.
      const dbNodes = await ProxmoxNode.find({}).lean().exec();
      const targets = dbNodes.length
        ? dbNodes
        : [
            {
              node: config.proxmox.defaultNode,
              defaultVmid: config.proxmox.defaultVmid,
              baseUrl: config.proxmox.baseUrl,
              tokenId: config.proxmox.tokenId,
              tokenSecret: config.proxmox.tokenSecret,
              rejectUnauthorized: config.proxmox.rejectUnauthorized,
            },
          ];

      await Promise.all(
        targets
          .map((t) => ({
            node: t.node || config.proxmox.defaultNode,
            vmid: t.defaultVmid || config.proxmox.defaultVmid,
            nodeConfig: t,
          }))
          .filter((t) => t.node && t.nodeConfig?.baseUrl)
          .map(async (t) => {
            let vmidToUse = t.vmid;
            if (!vmidToUse) {
              try {
                const vmList = await fetchNodeVms({ node: t.node, nodeConfig: t.nodeConfig });
                const vms = Array.isArray(vmList?.data) ? vmList.data : [];
                if (vms.length > 0) {
                  vmidToUse = String(vms[0].id);
                }
              } catch (err) {
                console.error(`Proxmox polling: failed to fetch VMs for node=${t.node}`, err);
              }
            }
            if (!vmidToUse) {
              console.warn(`Proxmox polling skipped: no VMID for node ${t.node}`);
              return;
            }
            await collectSnapshotOnce({ ...t, vmid: vmidToUse }).catch((err) => {
              console.error(`Proxmox polling error (node=${t.node}, vmid=${vmidToUse})`, err);
            });
          })
      );
    } catch (err) {
      console.error("Proxmox polling tick failed", err);
    }
  };

  // Run immediately (async) so charts can start filling
  void tick();

  timer = setInterval(tick, intervalMs);
  timer.unref?.();
  console.log(`Proxmox polling started (interval=${intervalMs}ms, multi-node enabled)`);
}

export function stopProxmoxPolling() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  running = false;
}
