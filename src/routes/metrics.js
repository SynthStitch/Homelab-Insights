import { Router } from "express";
import { getSnapshot } from "../controllers/metricsController.js";

const router = Router();

router.get("/snapshot", getSnapshot);

export default router;

