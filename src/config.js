/* eslint-env node */
import dotenv from "dotenv";

dotenv.config();

function getEnv(name, fallback) {
  const value = process.env[name];
  return value === undefined ? fallback : value;
}

function getEnvBoolean(name, fallback) {
  const value = process.env[name];
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

export const config = {
  jwt: {
    secret: getEnv("JWT_SECRET", "change-me"),
    expiresIn: getEnv("JWT_EXPIRES", "7d"),
  },
  corsOrigin: getEnv("CORS_ORIGIN", "*"),
  proxmox: {
    baseUrl: getEnv("PROXMOX_API_BASE", ""),
    tokenId: getEnv("PROXMOX_API_TOKEN_ID", ""),
    tokenSecret: getEnv("PROXMOX_API_TOKEN_SECRET", ""),
    defaultNode: getEnv("PROXMOX_DEFAULT_NODE", ""),
    defaultVmid: getEnv("PROXMOX_DEFAULT_VMID", ""),
    rejectUnauthorized: getEnvBoolean("PROXMOX_REJECT_UNAUTHORIZED", true),
    pollIntervalMs: Number(getEnv("PROXMOX_POLL_INTERVAL_MS", "15000")) || 15000,
  },
  mongo: {
    uri: getEnv("MONGODB_URI", ""),
    dbName: getEnv("MONGODB_DB_NAME", ""),
  },
};
