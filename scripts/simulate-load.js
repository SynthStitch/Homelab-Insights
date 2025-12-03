#!/usr/bin/env node
/* eslint-env node */
/* global process */
// Inserts synthetic high-load snapshots into MongoDB for demo purposes.
import dotenv from "dotenv";
import { connectMongo, disconnectMongo } from "../src/db/mongo.js";
import { ProxmoxSnapshot } from "../src/models/proxmoxSnapshot.js";

dotenv.config();

const node = process.env.PROXMOX_DEFAULT_NODE || "pve";
const vmid = process.env.PROXMOX_DEFAULT_VMID || "102";
const count = Number(process.env.LOAD_SNAPSHOT_COUNT || 12);
const intervalMs = Number(process.env.PROXMOX_POLL_INTERVAL_MS || 15000);

function buildSnapshot(offsetIndex, now) {
  const ts = new Date(now - offsetIndex * intervalMs);
  const cpuPercent = Math.min(100, Math.round((80 + Math.random() * 18) * 100) / 100);
  const usedMem = 6 * 1024 ** 3 + Math.floor(Math.random() * 512 * 1024 ** 2);
  const maxMem = 8 * 1024 ** 3;
  const netin = 5_000_000 + offsetIndex * 50_000 + Math.floor(Math.random() * 20_000);
  const netout = 7_000_000 + offsetIndex * 60_000 + Math.floor(Math.random() * 25_000);
  const diskread = 10_000_000 + offsetIndex * 80_000 + Math.floor(Math.random() * 30_000);
  const diskwrite = 12_000_000 + offsetIndex * 90_000 + Math.floor(Math.random() * 35_000);

  return {
    node,
    vmid,
    status: "running",
    cpuPercent,
    memory: {
      used: usedMem,
      free: Math.max(0, maxMem - usedMem),
      max: maxMem,
    },
    uptimeSeconds: 7200 + offsetIndex * 60,
    collectedAt: ts,
    raw: {
      cpu: cpuPercent / 100,
      mem: usedMem,
      maxmem: maxMem,
      freemem: Math.max(0, maxMem - usedMem),
      netin,
      netout,
      diskread,
      diskwrite,
      uptime: 7200 + offsetIndex * 60,
      status: "running",
      node,
      vmid,
    },
  };
}

async function main() {
  await connectMongo();

  const now = Date.now();
  const docs = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    docs.push(buildSnapshot(i, now));
  }

  const result = await ProxmoxSnapshot.insertMany(docs);
  console.log(`Inserted ${result.length} synthetic snapshots for node=${node}, vmid=${vmid}`);
}

main()
  .catch((err) => {
    console.error("Failed to insert synthetic snapshots", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await disconnectMongo();
    } catch (err) {
      console.error("Failed to close Mongo connection", err);
    }
  });


