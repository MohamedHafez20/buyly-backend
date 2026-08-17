import express from "express";
import { upload } from "../middleware/upload.js";
import { uploadImages } from "../controllers/uploadController.js";
import { protect } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/role.js";

const router = express.Router();

// Admin-only image upload. Multer errors (wrong type / too large) are turned
// into clean 400 responses instead of crashing the request.
router.post(
  "/",
  protect,
  requireAdmin,
  (req, res, next) => {
    upload.array("images", 6)(req, res, (err) => {
      if (err) return res.status(400).json({ message: err.message });
      next();
    });
  },
  uploadImages
);

export default router;
