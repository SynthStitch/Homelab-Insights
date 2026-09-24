import { Router } from "express";
import { authenticate, adminOnly } from "../middlewares/auth.js";
import { getPrometheus, savePrometheus, testPrometheus, queryRange, activeAlerts } from "../controllers/integrationsController.js";

const router = Router();

// Admin: configure
router.get("/prometheus", authenticate, adminOnly, getPrometheus);
router.put("/prometheus", authenticate, adminOnly, savePrometheus);
router.post("/prometheus/test", authenticate, adminOnly, testPrometheus);

// Any signed-in user: read through the configured servers
// GET /api/integrations/prometheus/query_range?query=<promql>&start=&end=&step=
router.get("/prometheus/query_range", authenticate, queryRange);
router.get("/alertmanager/alerts", authenticate, activeAlerts);

export default router;
