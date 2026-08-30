import express from "express";
import {
  getActiveBars,
  getAllBars,
  createBar,
  updateBar,
  deleteBar,
  reorderBars,
} from "../controllers/announcementController.js";
import { protect } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/role.js";

const router = express.Router();

// Public — only currently-active bars, sorted by sortOrder.
router.get("/", getActiveBars);

// Admin — full management.
router.get("/all", protect, requireAdmin, getAllBars);
router.post("/", protect, requireAdmin, createBar);
router.patch("/reorder", protect, requireAdmin, reorderBars); // before /:id
router.patch("/:id", protect, requireAdmin, updateBar);
router.delete("/:id", protect, requireAdmin, deleteBar);

export default router;
