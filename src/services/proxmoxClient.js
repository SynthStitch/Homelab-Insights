import http from "node:http";
import https from "node:https";
import fetch from "node-fetch";
import { config } from "../config.js";

const baseUrl = config.proxmox.baseUrl?.replace(/\/$/, "");
const tokenId = config.proxmox.tokenId?.trim();
const tokenSecret = config.proxmox.tokenSecret?.trim();

const httpAgent = new http.Agent({ keepAlive: true });
const httpsAgent = new https.Agent({
  keepAlive: true,
  rejectUnauthorized: config.proxmox.rejectUnauthorized,
});

function getAgent(parsedURL) {
  return parsedURL.protocol === "http:" ? httpAgent : httpsAgent;
}

function assertConfigured() {
  if (!baseUrl) {
    throw new Error("Proxmox base URL is not configured (set PROXMOX_API_BASE).");
  }
  if (!tokenId || !tokenSecret) {
    throw new Error(
      "Proxmox API token is not configured (set PROXMOX_API_TOKEN_ID and PROXMOX_API_TOKEN_SECRET)."
    );
  }
}

function buildAuthHeader() {
  assertConfigured();
  return `PVEAPIToken=${tokenId}=${tokenSecret}`;
}

async function proxmoxGet(path, { signal } = {}) {
  assertConfigured();
  const targetPath = path.startsWith("/") ? path : `/${path}`;
  const url = `${baseUrl}${targetPath}`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: buildAuthHeader(),
    },
    agent: getAgent,
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

export async function fetchVmStatus({ node, vmid, signal } = {}) {
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
  return proxmoxGet(endpoint, { signal });
}

export async function fetchRaw(path, { signal } = {}) {
  return proxmoxGet(path, { signal });
}

async function proxmoxGetWithAgent(path, options = {}) {
  return proxmoxGet(path, options);
}

export async function fetchNodeStatus({ node, signal } = {}) {
  const resolvedNode = node ?? config.proxmox.defaultNode;
  if (!resolvedNode) {
    throw new Error("Node is required. Provide ?node= or set PROXMOX_DEFAULT_NODE.");
  }

  const [detail, nodesList] = await Promise.all([
    proxmoxGetWithAgent(
      `/nodes/${encodeURIComponent(resolvedNode)}/status`,
      { signal }
    ),
    proxmoxGetWithAgent("/nodes", { signal }),
  ]);

  const nodeEntry = nodesList?.data?.find?.(
    (item) => item?.node === resolvedNode
  );

  return { detail, nodeEntry };
}

export async function fetchNodeVms({ node, signal } = {}) {
  const resolvedNode = node ?? config.proxmox.defaultNode;
  if (!resolvedNode) {
    throw new Error("Node is required. Provide ?node= or set PROXMOX_DEFAULT_NODE.");
  }

  const endpoint = `/nodes/${encodeURIComponent(resolvedNode)}/qemu`;
  return proxmoxGet(endpoint, { signal });
}
