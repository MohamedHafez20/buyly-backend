import express from "express";
import { createOrder, getMyOrders, getOrder, payOrder, handleStripeWebhook, handlePaypalWebhook } from "../controllers/orderController.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

router.post("/", protect, createOrder);
router.get("/my", protect, getMyOrders);
router.post("/webhook/stripe", handleStripeWebhook);
router.post("/webhook/paypal", handlePaypalWebhook);
router.post("/:id/pay", protect, payOrder);
router.get("/:id", protect, getOrder);

export default router;