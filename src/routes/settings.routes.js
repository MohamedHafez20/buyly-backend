import express from "express";
import { getSettings } from "../controllers/settingsController.js";

const router = express.Router();

// Public — store name, currency and pricing rules used for display.
router.get("/", getSettings);

export default router;
