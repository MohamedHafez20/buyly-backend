import mongoose from "mongoose";

// Every notification type the system can create. Kept as one exported list so
// the controller (validation), the service (typed helpers) and any admin filter
// all agree on the same vocabulary. Grouped by audience for readability.
export const NOTIFICATION_TYPES = [
  // ----- customer / user facing -----
  "order_placed",
  "order_confirmed",
  "order_processing",
  "order_shipped",
  "order_delivered",
  "order_cancelled",
  "order_status",
  "payment_success",
  "payment_failed",
  "payment_update",
  "product_back_in_stock",
  "price_offer",
  "promotion",
  "announcement",
  "account",
  // ----- admin / system facing -----
  "admin_new_order",
  "admin_new_user",
  "admin_order_cancelled",
  "admin_payment_issue",
  "admin_low_stock",
  "admin_out_of_stock",
  "admin_review",
  "admin_contact",
  "admin_system",
  // ----- catch-all for admin-authored custom sends -----
  "custom",
];

// The kinds of documents a notification can point back to. We deliberately store
// only the id + type (not a copy of the entity) to avoid duplicating data that
// can go stale — the frontend follows `actionUrl` to the live record.
export const RELATED_ENTITY_TYPES = ["order", "product", "user", "review", "none"];

const notificationSchema = new mongoose.Schema(
  {
    // Who receives this notification. Admin/system notifications are fanned out
    // to one document per admin so read-state is tracked per recipient.
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Which "inbox" this belongs to. Lets us cleanly separate a person's
    // customer notifications from their admin notifications (an admin has both).
    recipientRole: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },
    type: {
      type: String,
      enum: NOTIFICATION_TYPES,
      required: true,
    },
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    isRead: { type: Boolean, default: false },
    // Optional back-reference to the entity that triggered this (id only).
    relatedEntity: { type: mongoose.Schema.Types.ObjectId, default: null },
    relatedEntityType: {
      type: String,
      enum: RELATED_ENTITY_TYPES,
      default: "none",
    },
    // Where clicking the notification should take the recipient.
    actionUrl: { type: String, default: "" },
    // Freeform extra context (order ref, product name, amount, etc.). Small,
    // display-only snapshots are fine here; anything authoritative is refetched.
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

// A recipient's feed is always "my notifications, newest first" and "how many of
// mine are unread" — these compound indexes serve both without a collection scan.
notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, isRead: 1 });

export default mongoose.model("Notification", notificationSchema);
