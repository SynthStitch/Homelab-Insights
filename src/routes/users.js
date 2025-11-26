import { Router } from "express";
import {
  listUsers,
  createUser,
  updateUser,
  deleteUser,
} from "../controllers/usersController.js";

const router = Router();

router.get("/", listUsers);
router.post("/", createUser);
router.patch("/:username", updateUser);
router.delete("/:username", deleteUser);

export default router;
