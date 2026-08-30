import express from "express";
import { getInventoryHistory, adjustInventory } from "../controllers/inventoryController.js";
import { protect } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/role.js";

const router = express.Router();

router.use(protect, requireAdmin);

router.get("/history", getInventoryHistory);
router.post("/adjust", adjustInventory);

export default router;
