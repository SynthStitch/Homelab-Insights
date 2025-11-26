import { listVMs, nodeSummary } from "../services/proxmox.js";

export async function getVms(req, res, next) {
  try {
    const vms = await listVMs();
    res.json({ vms });
  } catch (err) {
    next(err);
  }
}

export async function getNode(req, res, next) {
  try {
    const node = await nodeSummary(req.params.name);
    res.json({ node });
  } catch (err) {
    next(err);
  }
}

