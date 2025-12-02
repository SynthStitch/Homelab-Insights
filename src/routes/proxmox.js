import { Router } from "express";
import {
  getVmStatus,
  proxyProxmoxPath,
  getLatestSnapshot,
  listSnapshots,
  getNodeSummary,
  listNodeVms,
} from "../controllers/proxmoxController.js";
import {
  testNodeConnection,
  createNode,
  listNodes,
  pingStoredNode,
  deleteNode,
} from "../controllers/proxmoxNodeController.js";
import { authenticate, adminOnly } from "../middlewares/auth.js";

const router = Router();

router.get("/vm-status", getVmStatus);
router.get("/proxy", proxyProxmoxPath);
router.get("/snapshots/latest", getLatestSnapshot);
router.get("/snapshots", listSnapshots);
router.get("/node-summary", getNodeSummary);
router.get("/vms", listNodeVms);

// Admin-only node management/testing endpoints
// http://localhost:4100/api/proxmox/nodes/test  (POST) - test a node connection before saving
router.post("/nodes/test", authenticate, adminOnly, testNodeConnection);
// http://localhost:4100/api/proxmox/nodes       (POST) - create/save a node after successful test
router.post("/nodes", authenticate, adminOnly, createNode);
// http://localhost:4100/api/proxmox/nodes       (GET)  - list saved nodes
router.get("/nodes", authenticate, adminOnly, listNodes);
// http://localhost:4100/api/proxmox/nodes/:name/ping (GET) - ping a saved node
router.get("/nodes/:name/ping", authenticate, adminOnly, pingStoredNode);
// http://localhost:4100/api/proxmox/nodes/:name (DELETE) - delete a saved node
router.delete("/nodes/:name", authenticate, adminOnly, deleteNode);

export default router;
