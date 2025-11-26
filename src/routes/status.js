import { Router } from "express";
import { getVms, getNode } from "../controllers/statusController.js";

const router = Router();

router.get("/vms", getVms);
router.get("/nodes/:name", getNode);

export default router;

