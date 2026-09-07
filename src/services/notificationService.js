import Notification from "../models/Notification.js";
import User from "../models/User.js";

// ---------------------------------------------------------------------------
// Centralized notification service.
//
// Every notification in the app is created through here — controllers call the
// typed helpers (notifyOrderPlaced, notifyOrderStatusChanged, …) instead of
// hand-rolling Notification.create() calls, so titles/messages/action URLs stay
// consistent and there is exactly one place to change them.
//
// Design notes:
//  • Safety first. A notification must NEVER break the primary flow (placing an
//    order, registering, etc.). Every public helper is wrapped so a failure is
//    logged and swallowed — the caller can `await` it without risk.
//  • Real-time seam. `emit()` is the single hook where a Socket.IO/WebSocket
//    push would go. It is a no-op today (the project polls), but wiring sockets
//    later means editing only this one function.
// ---------------------------------------------------------------------------

// Short, human order reference — mirrors the frontend's orderRef() so the id a
// customer sees in a notification matches the one on the order-success screen.
const orderRef = (id = "") => `BLY-${String(id).slice(-6).toUpperCase()}`;

// Real-time push seam. Today notifications reach clients via polling, so this is
// intentionally a no-op. To add sockets later, emit here to a room keyed by
// `notification.recipient` (and/or `recipientRole`) — nothing else must change.
export const emit = (/* notification */) => {
  // e.g. io.to(String(notification.recipient)).emit("notification", notification)
};

// Low-level create. Returns the saved doc (or null on failure — never throws).
const createNotification = async (data) => {
  try {
    const notification = await Notification.create(data);
    emit(notification);
    return notification;
  } catch (err) {
    console.error("[notifications] create failed:", err.message);
    return null;
  }
};

// Create the same notification for many recipients at once (admin fan-out,
// broadcast to all users). Uses insertMany for one round-trip. Never throws.
const createMany = async (recipients, base) => {
  if (!recipients.length) return [];
  try {
    const docs = recipients.map((recipient) => ({ ...base, recipient }));
    const created = await Notification.insertMany(docs, { ordered: false });
    created.forEach(emit);
    return created;
  } catch (err) {
    console.error("[notifications] bulk create failed:", err.message);
    return [];
  }
};

// Ids of every admin — the audience for system/activity notifications.
const adminIds = async () => {
  try {
    const admins = await User.find({ role: "admin" }).select("_id").lean();
    return admins.map((a) => a._id);
  } catch (err) {
    console.error("[notifications] admin lookup failed:", err.message);
    return [];
  }
};

// ---- Generic public helpers (used by custom sends + the typed events) -------

// One notification to one user (customer inbox).
export const notifyUser = (recipient, payload) =>
  createNotification({ recipient, recipientRole: "user", ...payload });

// Fan a system notification out to every admin (admin inbox).
export const notifyAdmins = async (payload) => {
  const ids = await adminIds();
  return createMany(ids, { recipientRole: "admin", ...payload });
};

// Broadcast to every customer account (role: "user").
export const notifyAllUsers = async (payload) => {
  try {
    const users = await User.find({ role: "user" }).select("_id").lean();
    return createMany(
      users.map((u) => u._id),
      { recipientRole: "user", ...payload }
    );
  } catch (err) {
    console.error("[notifications] broadcast failed:", err.message);
    return [];
  }
};

// ---- Typed event helpers (called from controllers) -------------------------

// A customer placed an order → confirm it to them, alert every admin.
export const notifyOrderPlaced = async (order, customerName = "A customer") => {
  const ref = orderRef(order._id);
  await notifyUser(order.user, {
    type: "order_placed",
    title: "Order placed successfully",
    message: `Your order ${ref} has been placed and is awaiting confirmation.`,
    relatedEntity: order._id,
    relatedEntityType: "order",
    actionUrl: "/orders",
    metadata: { orderRef: ref, total: order.total },
  });
  await notifyAdmins({
    type: "admin_new_order",
    title: "New order received",
    message: `${customerName} placed order ${ref} for $${Number(order.total).toFixed(2)}.`,
    relatedEntity: order._id,
    relatedEntityType: "order",
    actionUrl: "/admin/orders",
    metadata: { orderRef: ref, total: order.total },
  });
};

// Map an order status to the customer-facing notification it should produce.
// The order model's real statuses are pending | paid | shipped | delivered |
// cancelled; each maps to a friendly type/title/message.
const STATUS_NOTIFICATION = {
  paid: {
    type: "order_confirmed",
    title: "Order confirmed",
    message: (ref) => `Your order ${ref} has been confirmed and is now being prepared.`,
  },
  shipped: {
    type: "order_shipped",
    title: "Order shipped",
    message: (ref) => `Good news — your order ${ref} is on its way.`,
  },
  delivered: {
    type: "order_delivered",
    title: "Order delivered",
    message: (ref) => `Your order ${ref} has been delivered. We hope you love it!`,
  },
  cancelled: {
    type: "order_cancelled",
    title: "Order cancelled",
    message: (ref) => `Your order ${ref} has been cancelled.`,
  },
  pending: {
    type: "order_status",
    title: "Order updated",
    message: (ref) => `Your order ${ref} is now pending.`,
  },
};

// An admin changed an order's status → notify the customer. When the change is a
// cancellation, also record it in the admin inbox.
export const notifyOrderStatusChanged = async (order) => {
  const ref = orderRef(order._id);
  const conf = STATUS_NOTIFICATION[order.status] || STATUS_NOTIFICATION.pending;
  await notifyUser(order.user, {
    type: conf.type,
    title: conf.title,
    message: conf.message(ref),
    relatedEntity: order._id,
    relatedEntityType: "order",
    actionUrl: "/orders",
    metadata: { orderRef: ref, status: order.status },
  });
  if (order.status === "cancelled") {
    await notifyAdmins({
      type: "admin_order_cancelled",
      title: "Order cancelled",
      message: `Order ${ref} has been cancelled.`,
      relatedEntity: order._id,
      relatedEntityType: "order",
      actionUrl: "/admin/orders",
      metadata: { orderRef: ref },
    });
  }
};

// Payment result on an order. Success confirms to the customer; failure warns
// the customer and flags a payment issue for admins.
export const notifyPaymentResult = async (order, { success }) => {
  const ref = orderRef(order._id);
  if (success) {
    await notifyUser(order.user, {
      type: "payment_success",
      title: "Payment successful",
      message: `We received your payment for order ${ref}. Thank you!`,
      relatedEntity: order._id,
      relatedEntityType: "order",
      actionUrl: "/orders",
      metadata: { orderRef: ref, total: order.total },
    });
  } else {
    await notifyUser(order.user, {
      type: "payment_failed",
      title: "Payment failed",
      message: `Payment for order ${ref} could not be processed. Please try again.`,
      relatedEntity: order._id,
      relatedEntityType: "order",
      actionUrl: "/orders",
      metadata: { orderRef: ref },
    });
    await notifyAdmins({
      type: "admin_payment_issue",
      title: "Payment issue",
      message: `Payment failed for order ${ref}.`,
      relatedEntity: order._id,
      relatedEntityType: "order",
      actionUrl: "/admin/orders",
      metadata: { orderRef: ref },
    });
  }
};

// A new customer registered → let admins know.
export const notifyNewUser = async (user) => {
  await notifyAdmins({
    type: "admin_new_user",
    title: "New customer registered",
    message: `${user.name} (${user.email}) just created an account.`,
    relatedEntity: user._id,
    relatedEntityType: "user",
    actionUrl: "/admin/users",
    metadata: { name: user.name, email: user.email },
  });
};

// A product review was submitted → notify admins to moderate it.
export const notifyReviewSubmitted = async (review, product, reviewerName = "A customer") => {
  await notifyAdmins({
    type: "admin_review",
    title: "New product review",
    message: `${reviewerName} left a ${review.rating}-star review on "${product.name}".`,
    relatedEntity: review._id,
    relatedEntityType: "review",
    actionUrl: "/admin/reviews",
    metadata: { productName: product.name, rating: review.rating },
  });
};

// After any stock mutation, alert admins when a product is low or out of stock.
// De-duplicated: if an unread alert of the same kind already exists for the
// product we skip, so a busy product can't flood the admin inbox.
export const notifyStockLevels = async (product) => {
  try {
    if (!product) return;
    const stock = Number(product.stock) || 0;
    const threshold = Number(product.lowStockThreshold) || 0;

    let type;
    let title;
    let message;
    if (stock <= 0) {
      type = "admin_out_of_stock";
      title = "Product out of stock";
      message = `"${product.name}" is now out of stock.`;
    } else if (stock <= threshold) {
      type = "admin_low_stock";
      title = "Low stock warning";
      message = `"${product.name}" is running low (${stock} left).`;
    } else {
      return; // healthy stock — nothing to report
    }

    // Skip if an unread alert of this kind for this product already stands.
    const existing = await Notification.findOne({
      recipientRole: "admin",
      type,
      relatedEntity: product._id,
      isRead: false,
    }).select("_id").lean();
    if (existing) return;

    await notifyAdmins({
      type,
      title,
      message,
      relatedEntity: product._id,
      relatedEntityType: "product",
      actionUrl: "/admin/inventory",
      metadata: { productName: product.name, stock },
    });
  } catch (err) {
    console.error("[notifications] stock-level check failed:", err.message);
  }
};
