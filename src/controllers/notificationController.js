import mongoose from "mongoose";
import Notification, { NOTIFICATION_TYPES } from "../models/Notification.js";
import User from "../models/User.js";
import { notifyUser, notifyAllUsers, notifyAdmins } from "../services/notificationService.js";

// Shape a notification for the client (id instead of _id), matching the app's
// existing convention (see reviewController).
const view = (n) => ({
  id: n._id,
  recipient: n.recipient,
  recipientRole: n.recipientRole,
  type: n.type,
  title: n.title,
  message: n.message,
  isRead: n.isRead,
  relatedEntity: n.relatedEntity,
  relatedEntityType: n.relatedEntityType,
  actionUrl: n.actionUrl,
  metadata: n.metadata,
  createdAt: n.createdAt,
  updatedAt: n.updatedAt,
});

// Parse and clamp pagination params shared by the user + admin feeds.
const paging = (req) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 15));
  return { page, limit, skip: (page - 1) * limit };
};

// Run a paginated feed query for the given base filter (already scoped to the
// caller). Returns the list plus counts the UI needs (total, pages, unread).
const runFeed = async (baseFilter, extra, req) => {
  const { page, limit, skip } = paging(req);
  const filter = { ...baseFilter, ...extra };
  const [items, total, unread] = await Promise.all([
    Notification.find(filter).sort("-createdAt").skip(skip).limit(limit).lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ ...baseFilter, isRead: false }),
  ]);
  return {
    notifications: items.map(view),
    page,
    limit,
    total,
    pages: Math.max(1, Math.ceil(total / limit)),
    hasMore: skip + items.length < total,
    unread,
  };
};

// Build the admin filter (type / read state / search) from query params.
const adminExtraFilter = (req) => {
  const extra = {};
  if (req.query.type && NOTIFICATION_TYPES.includes(req.query.type)) {
    extra.type = req.query.type;
  }
  if (req.query.read === "read") extra.isRead = true;
  else if (req.query.read === "unread") extra.isRead = false;
  if (req.query.search) {
    const rx = { $regex: String(req.query.search).trim(), $options: "i" };
    extra.$or = [{ title: rx }, { message: rx }];
  }
  return extra;
};

// =========================== USER (customer) ===============================

// GET /api/notifications?page=&limit=  — the signed-in user's own feed.
export const getMyNotifications = async (req, res) => {
  try {
    const base = { recipient: req.user.id, recipientRole: "user" };
    res.json(await runFeed(base, {}, req));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/notifications/unread-count
export const getMyUnreadCount = async (req, res) => {
  try {
    const count = await Notification.countDocuments({
      recipient: req.user.id,
      recipientRole: "user",
      isRead: false,
    });
    res.json({ count });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PATCH /api/notifications/:id/read  — mark one of my notifications read.
export const markMyNotificationRead = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid notification id" });
    }
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipient: req.user.id, recipientRole: "user" },
      { isRead: req.body?.isRead === false ? false : true },
      { new: true }
    );
    if (!notification) return res.status(404).json({ message: "Notification not found" });
    res.json(view(notification));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PATCH /api/notifications/read-all
export const markAllMyNotificationsRead = async (req, res) => {
  try {
    const r = await Notification.updateMany(
      { recipient: req.user.id, recipientRole: "user", isRead: false },
      { isRead: true }
    );
    res.json({ modified: r.modifiedCount ?? r.nModified ?? 0 });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// DELETE /api/notifications/:id
export const deleteMyNotification = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid notification id" });
    }
    const r = await Notification.findOneAndDelete({
      _id: req.params.id,
      recipient: req.user.id,
      recipientRole: "user",
    });
    if (!r) return res.status(404).json({ message: "Notification not found" });
    res.json({ message: "Notification deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// =========================== ADMIN =========================================

// GET /api/admin/notifications?page=&limit=&type=&read=&search=
export const getAdminNotifications = async (req, res) => {
  try {
    const base = { recipient: req.user.id, recipientRole: "admin" };
    res.json(await runFeed(base, adminExtraFilter(req), req));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/admin/notifications/unread-count
export const getAdminUnreadCount = async (req, res) => {
  try {
    const count = await Notification.countDocuments({
      recipient: req.user.id,
      recipientRole: "admin",
      isRead: false,
    });
    res.json({ count });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/admin/notifications/stats  — totals + per-type breakdown for the
// admin notification center's stat cards.
export const getAdminNotificationStats = async (req, res) => {
  try {
    const base = { recipient: new mongoose.Types.ObjectId(String(req.user.id)), recipientRole: "admin" };
    const [total, unread, byType] = await Promise.all([
      Notification.countDocuments(base),
      Notification.countDocuments({ ...base, isRead: false }),
      Notification.aggregate([
        { $match: base },
        { $group: { _id: "$type", count: { $sum: 1 } } },
      ]),
    ]);
    res.json({
      total,
      unread,
      read: total - unread,
      byType: byType.reduce((acc, t) => ({ ...acc, [t._id]: t.count }), {}),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PATCH /api/admin/notifications/:id/read  — body { isRead } toggles read state.
export const setAdminNotificationRead = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid notification id" });
    }
    const isRead = req.body?.isRead === false ? false : true;
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipient: req.user.id, recipientRole: "admin" },
      { isRead },
      { new: true }
    );
    if (!notification) return res.status(404).json({ message: "Notification not found" });
    res.json(view(notification));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PATCH /api/admin/notifications/read-all
export const markAllAdminNotificationsRead = async (req, res) => {
  try {
    const r = await Notification.updateMany(
      { recipient: req.user.id, recipientRole: "admin", isRead: false },
      { isRead: true }
    );
    res.json({ modified: r.modifiedCount ?? r.nModified ?? 0 });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// DELETE /api/admin/notifications/:id
export const deleteAdminNotification = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid notification id" });
    }
    const r = await Notification.findOneAndDelete({
      _id: req.params.id,
      recipient: req.user.id,
      recipientRole: "admin",
    });
    if (!r) return res.status(404).json({ message: "Notification not found" });
    res.json({ message: "Notification deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/admin/notifications/send  — admin authors a custom notification.
// audience: "all" (every customer) | "user" (one, needs userId).
export const sendCustomNotification = async (req, res) => {
  try {
    const { title, message, audience = "all", userId } = req.body;
    const type = NOTIFICATION_TYPES.includes(req.body.type) ? req.body.type : "custom";
    const actionUrl = String(req.body.actionUrl || "").trim();

    if (!String(title || "").trim() || !String(message || "").trim()) {
      return res.status(400).json({ message: "Title and message are required" });
    }

    const payload = {
      type,
      title: String(title).trim(),
      message: String(message).trim(),
      actionUrl,
      relatedEntityType: "none",
      metadata: { custom: true, sentBy: req.user.id },
    };

    if (audience === "user") {
      if (!mongoose.isValidObjectId(userId)) {
        return res.status(400).json({ message: "A valid userId is required to target a specific user" });
      }
      const target = await User.findById(userId).select("_id").lean();
      if (!target) return res.status(404).json({ message: "Target user not found" });
      await notifyUser(target._id, payload);
      return res.status(201).json({ message: "Notification sent", recipients: 1 });
    }

    if (audience === "all") {
      const created = await notifyAllUsers(payload);
      return res.status(201).json({ message: "Notification sent to all customers", recipients: created.length });
    }

    if (audience === "admins") {
      const created = await notifyAdmins(payload);
      return res.status(201).json({ message: "Notification sent to all admins", recipients: created.length });
    }

    return res.status(400).json({ message: "Unknown audience" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
