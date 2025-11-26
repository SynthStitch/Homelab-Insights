import { Router } from "express";
import { signin } from "../controllers/authController.js";

const router = Router();

router.post("/signin", signin);

export default router;

