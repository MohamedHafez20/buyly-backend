import express from "express";
import {
  getCountries,
  getAllCountries,
  createCountry,
  updateCountry,
  deleteCountry,
} from "../controllers/countryController.js";
import { protect } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/role.js";

const router = express.Router();

// Public — enabled countries for the checkout form.
router.get("/", getCountries);

// Admin — full management.
router.get("/all", protect, requireAdmin, getAllCountries);
router.post("/", protect, requireAdmin, createCountry);
router.patch("/:id", protect, requireAdmin, updateCountry);
router.delete("/:id", protect, requireAdmin, deleteCountry);

export default router;
