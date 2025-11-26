import { Router } from "express";
import {
  getVmStatus,
  proxyProxmoxPath,
  getLatestSnapshot,
  listSnapshots,
  getNodeSummary,
  listNodeVms,
} from "../controllers/proxmoxController.js";

const router = Router();

router.get("/vm-status", getVmStatus);
router.get("/proxy", proxyProxmoxPath);
router.get("/snapshots/latest", getLatestSnapshot);
router.get("/snapshots", listSnapshots);
router.get("/node-summary", getNodeSummary);
router.get("/vms", listNodeVms);

export default router;
