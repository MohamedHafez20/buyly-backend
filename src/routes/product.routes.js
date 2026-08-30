import express from "express";
import {
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
} from "../controllers/productController.js";
import { getProductReviews, createReview } from "../controllers/reviewController.js";
import { protect } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/role.js";

const router = express.Router();

// Public — customers browse
router.get("/", getProducts);
router.get("/:id", getProduct);

// Reviews for a product (list is public; posting requires a session).
router.get("/:id/reviews", getProductReviews);
router.post("/:id/reviews", protect, createReview);

// Admin only — manage catalog
router.post("/", protect, requireAdmin, createProduct);
router.patch("/:id", protect, requireAdmin, updateProduct);
router.delete("/:id", protect, requireAdmin, deleteProduct);

export default router;