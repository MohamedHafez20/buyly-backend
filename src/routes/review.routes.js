import express from "express";
import { updateReview, deleteReview } from "../controllers/reviewController.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

// Owner-only edit / (owner or admin) delete of a single review.
router.patch("/:id", protect, updateReview);
router.delete("/:id", protect, deleteReview);

export default router;
