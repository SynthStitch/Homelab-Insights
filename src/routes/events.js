import { Router } from "express";
import { listEvents, streamEvents, createEvent } from "../controllers/eventsController.js";

const router = Router();

router.get("/", listEvents);
router.get("/stream", streamEvents);
router.post("/", createEvent);

export default router;

