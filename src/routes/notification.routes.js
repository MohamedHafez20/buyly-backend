import express from "express";
import { protect } from "../middleware/auth.js";
import {
  getMyNotifications,
  getMyUnreadCount,
  markMyNotificationRead,
  markAllMyNotificationsRead,
  deleteMyNotification,
} from "../controllers/notificationController.js";

const router = express.Router();

// Every route here is for the signed-in user's own notifications only. The
// controller scopes each query to req.user.id, so a user can never read or
// mutate another account's notifications.
router.use(protect);

router.get("/", getMyNotifications);
router.get("/unread-count", getMyUnreadCount);
router.patch("/read-all", markAllMyNotificationsRead);
router.patch("/:id/read", markMyNotificationRead);
router.delete("/:id", deleteMyNotification);

export default router;
