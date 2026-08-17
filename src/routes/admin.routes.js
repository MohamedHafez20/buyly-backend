import express from "express";
import { getUsers, updateUserRole, deleteUser } from "../controllers/adminController.js";
import { protect } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/role.js";
import { getAllOrders, updateOrderStatus } from "../controllers/orderController.js";
import { getStats } from "../controllers/statsController.js";

const router = express.Router();

router.use(protect, requireAdmin);

router.get("/stats", getStats);
router.get("/users", getUsers);
router.patch("/users/:id/role", updateUserRole);
router.delete("/users/:id", deleteUser);
router.get("/orders", getAllOrders);
router.patch("/orders/:id/status", updateOrderStatus);

export default router;
