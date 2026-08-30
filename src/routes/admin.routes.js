import express from "express";
import { getUsers, updateUserRole, deleteUser } from "../controllers/adminController.js";
import { protect } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/role.js";
import { getAllOrders, updateOrderStatus } from "../controllers/orderController.js";
import { getStats } from "../controllers/statsController.js";
import { getAdminSettings, updateSettings } from "../controllers/settingsController.js";
import {
  getCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
} from "../controllers/couponController.js";
import {
  getAllReviews,
  moderateReview,
  deleteReview,
} from "../controllers/reviewController.js";

const router = express.Router();

router.use(protect, requireAdmin);

router.get("/stats", getStats);
router.get("/settings", getAdminSettings);
router.patch("/settings", updateSettings);
router.get("/users", getUsers);
router.patch("/users/:id/role", updateUserRole);
router.delete("/users/:id", deleteUser);
router.get("/orders", getAllOrders);
router.patch("/orders/:id/status", updateOrderStatus);
router.get("/coupons", getCoupons);
router.post("/coupons", createCoupon);
router.patch("/coupons/:id", updateCoupon);
router.delete("/coupons/:id", deleteCoupon);
router.get("/reviews", getAllReviews);
router.patch("/reviews/:id", moderateReview);
router.delete("/reviews/:id", deleteReview);

export default router;
