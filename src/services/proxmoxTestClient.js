import http from "node:http";
import https from "node:https";
import fetch from "node-fetch";

function normalizeBaseUrl(baseUrl) {
  if (!baseUrl) return "";
  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
}

function buildAuthHeader(tokenId, tokenSecret) {
  if (!tokenId || !tokenSecret) {
    throw new Error("Proxmox tokenId and tokenSecret are required.");
  }
  return `PVEAPIToken=${tokenId}=${tokenSecret}`;
}

function getAgent(url, rejectUnauthorized) {
  const useReject = rejectUnauthorized !== false;
  const httpAgent = new http.Agent({ keepAlive: true });
  const httpsAgent = new https.Agent({ keepAlive: true, rejectUnauthorized: useReject });
  return url.startsWith("http:") ? httpAgent : httpsAgent;
}

async function proxmoxGet({ baseUrl, tokenId, tokenSecret, path, rejectUnauthorized, signal }) {
  const normalizedBase = normalizeBaseUrl(baseUrl);
  if (!normalizedBase) {
    throw new Error("Proxmox baseUrl is required.");
  }
  if (!path) {
    throw new Error("path is required");
  }
  const targetPath = path.startsWith("/") ? path : `/${path}`;
  const url = `${normalizedBase}${targetPath}`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: buildAuthHeader(tokenId, tokenSecret),
    },
    agent: getAgent(url, rejectUnauthorized),
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

export async function testProxmoxCredentials({
  baseUrl,
  tokenId,
  tokenSecret,
  node,
  rejectUnauthorized = true,
  vmid,
  signal,
}) {
  const normalizedBase = normalizeBaseUrl(baseUrl);
  if (!normalizedBase || !tokenId || !tokenSecret || !node) {
    throw new Error("baseUrl, tokenId, tokenSecret, and node are required.");
  }

  const status = await proxmoxGet({
    baseUrl: normalizedBase,
    tokenId,
    tokenSecret,
    rejectUnauthorized,
    path: `/nodes/${encodeURIComponent(node)}/status`,
    signal,
  });

  const vms = await proxmoxGet({
    baseUrl: normalizedBase,
    tokenId,
    tokenSecret,
    rejectUnauthorized,
    path: `/nodes/${encodeURIComponent(node)}/qemu`,
    signal,
  });

  let vmStatus = null;
  if (vmid) {
    try {
      vmStatus = await proxmoxGet({
        baseUrl: normalizedBase,
        tokenId,
        tokenSecret,
        rejectUnauthorized,
        path: `/nodes/${encodeURIComponent(node)}/qemu/${encodeURIComponent(vmid)}/status/current`,
        signal,
      });
    } catch (err) {
      // Optional; only attach if present.
      vmStatus = { error: err.message, status: err.status };
    }
  }

  return {
    ok: true,
    baseUrl: normalizedBase,
    node,
    status,
    vmCount: Array.isArray(vms?.data) ? vms.data.length : undefined,
    vmStatus,
  };
}
