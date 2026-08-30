import express from "express";
import {
  getSummary,
  getCart,
  addItem,
  updateItem,
  removeItem,
  clearCart,
  replaceCart,
  mergeCart,
} from "../controllers/cartController.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

// Public — price an arbitrary item list (guests / instant previews).
router.post("/summary", getSummary);

// Authenticated — the persisted per-user cart.
router.get("/", protect, getCart);
router.put("/", protect, replaceCart);
router.post("/items", protect, addItem);
router.patch("/items/:productId", protect, updateItem);
router.delete("/items/:productId", protect, removeItem);
router.delete("/", protect, clearCart);
router.post("/merge", protect, mergeCart);

export default router;
