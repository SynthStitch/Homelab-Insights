import http from "node:http";
import https from "node:https";
import fetch from "node-fetch";
import { config } from "../config.js";

const httpAgent = new http.Agent({ keepAlive: true });
const httpsAgents = new Map();

/**
 * Lightweight Proxmox client that can switch hosts per-node.
 * - When a nodeConfig is supplied (saved node from Mongo), use its baseUrl/token.
 * - Otherwise fall back to primary/secondary env settings.
 * This keeps UI-added nodes working without touching .env.
 */

function getHttpsAgent(rejectUnauthorized) {
  const key = rejectUnauthorized ? "strict" : "insecure";
  if (!httpsAgents.has(key)) {
    httpsAgents.set(
      key,
      new https.Agent({
        keepAlive: true,
        rejectUnauthorized,
      })
    );
  }
  return httpsAgents.get(key);
}

function getAgent(parsedURL, rejectUnauthorized) {
  return parsedURL.protocol === "http:" ? httpAgent : getHttpsAgent(rejectUnauthorized);
}

function normalizeConfig(raw = {}) {
  return {
    baseUrl: raw.baseUrl?.replace(/\/$/, ""),
    tokenId: raw.tokenId?.trim(),
    tokenSecret: raw.tokenSecret?.trim(),
    rejectUnauthorized:
      typeof raw.rejectUnauthorized === "boolean"
        ? raw.rejectUnauthorized
        : config.proxmox.rejectUnauthorized,
  };
}

function resolveNodeConfig(node, overrideConfig) {
  if (overrideConfig?.baseUrl && overrideConfig?.tokenId && overrideConfig?.tokenSecret) {
    return normalizeConfig(overrideConfig);
  }

  const primary = normalizeConfig({
    baseUrl: config.proxmox.baseUrl,
    tokenId: config.proxmox.tokenId,
    tokenSecret: config.proxmox.tokenSecret,
    rejectUnauthorized: config.proxmox.rejectUnauthorized,
  });

  const secondaryEnv = config.proxmox.secondary || {};
  const secondary = normalizeConfig({
    baseUrl: secondaryEnv.baseUrl,
    tokenId: secondaryEnv.tokenId,
    tokenSecret: secondaryEnv.tokenSecret,
    rejectUnauthorized: secondaryEnv.rejectUnauthorized,
  });

  if (
    node &&
    secondaryEnv.node &&
    node === secondaryEnv.node &&
    secondary.baseUrl &&
    secondary.tokenId &&
    secondary.tokenSecret
  ) {
    return secondary;
  }

  return primary;
}

function assertConfigured(resolved) {
  if (!resolved.baseUrl) {
    throw new Error("Proxmox base URL is not configured (set PROXMOX_API_BASE).");
  }
  if (!resolved.tokenId || !resolved.tokenSecret) {
    throw new Error(
      "Proxmox API token is not configured (set PROXMOX_API_TOKEN_ID and PROXMOX_API_TOKEN_SECRET)."
    );
  }
}

function buildAuthHeader(resolved) {
  assertConfigured(resolved);
  return `PVEAPIToken=${resolved.tokenId}=${resolved.tokenSecret}`;
}

async function proxmoxGet(path, { signal, node, nodeConfig } = {}) {
  const resolved = resolveNodeConfig(node, nodeConfig);
  assertConfigured(resolved);
  const targetPath = path.startsWith("/") ? path : `/${path}`;
  const url = `${resolved.baseUrl}${targetPath}`;
  const parsed = new URL(url);
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: buildAuthHeader(resolved),
    },
    agent: getAgent(parsed, resolved.rejectUnauthorized),
    signal,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const error = new Error(
      `Proxmox request failed with status ${response.status} ${response.statusText}`
    );
    error.status = response.status;
    error.body = body;
    throw error;
  }

  return response.json();
}

export async function fetchVmStatus({ node, vmid, signal, nodeConfig } = {}) {
  const resolvedNode = node ?? config.proxmox.defaultNode;
  const resolvedVmid = vmid ?? config.proxmox.defaultVmid;

  if (!resolvedNode || !resolvedVmid) {
    throw new Error(
      "Node and VMID are required. Provide them in the request or set PROXMOX_DEFAULT_NODE and PROXMOX_DEFAULT_VMID."
    );
  }

  const endpoint = `/nodes/${encodeURIComponent(resolvedNode)}/qemu/${encodeURIComponent(
    resolvedVmid
  )}/status/current`;
  return proxmoxGet(endpoint, { signal, node: resolvedNode, nodeConfig });
}

export async function fetchRaw(path, { signal } = {}) {
  return proxmoxGet(path, { signal });
}

async function proxmoxGetWithAgent(path, options = {}) {
  return proxmoxGet(path, options);
}

export async function fetchNodeStatus({ node, signal, nodeConfig } = {}) {
  const resolvedNode = node ?? config.proxmox.defaultNode;
  if (!resolvedNode) {
    throw new Error("Node is required. Provide ?node= or set PROXMOX_DEFAULT_NODE.");
  }

  const [detail, nodesList] = await Promise.all([
    proxmoxGetWithAgent(
      `/nodes/${encodeURIComponent(resolvedNode)}/status`,
      { signal, node: resolvedNode, nodeConfig }
    ),
    proxmoxGetWithAgent("/nodes", { signal, node: resolvedNode, nodeConfig }),
  ]);

  const nodeEntry = nodesList?.data?.find?.(
    (item) => item?.node === resolvedNode
  );

  return { detail, nodeEntry };
}

export async function fetchNodeVms({ node, signal, nodeConfig } = {}) {
  const resolvedNode = node ?? config.proxmox.defaultNode;
  if (!resolvedNode) {
    throw new Error("Node is required. Provide ?node= or set PROXMOX_DEFAULT_NODE.");
  }

  const endpoint = `/nodes/${encodeURIComponent(resolvedNode)}/qemu`;
  return proxmoxGet(endpoint, { signal, node: resolvedNode, nodeConfig });
}
