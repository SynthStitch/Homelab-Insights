import { Router } from "express";
import { authenticate, adminOnly } from "../middlewares/auth.js";
import { sendTestAlert } from "../controllers/alertsController.js";

const router = Router();

// http://localhost:4100/api/alerts/test (POST) - send a test SMS/email alert
router.post("/test", authenticate, adminOnly, sendTestAlert);

export default router;
