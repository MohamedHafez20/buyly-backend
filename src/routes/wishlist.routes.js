import express from "express";
import {
  getWishlist,
  mergeWishlist,
  toggleWishlist,
} from "../controllers/wishlistController.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

// Authenticated — the persisted per-user wishlist.
router.get("/", protect, getWishlist);
router.post("/toggle", protect, toggleWishlist);
router.post("/merge", protect, mergeWishlist);

export default router;
