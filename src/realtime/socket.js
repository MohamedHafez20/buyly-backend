import { Server } from "socket.io";
import jwt from "jsonwebtoken";

// ---------------------------------------------------------------------------
// Real-time notification transport (Socket.IO).
//
// This is the concrete implementation behind notificationService's `emit()`
// seam. When a notification is created, the service calls pushNotification(),
// which delivers it to just that recipient's room over an authenticated socket.
// Polling remains in place on the client as a fallback, so if sockets are down
// the app still works — just at the 45s cadence instead of instantly.
// ---------------------------------------------------------------------------

let io = null;

// Serialize a Notification document to the client shape (id instead of _id),
// mirroring notificationController's view() so a pushed notification is shaped
// exactly like one fetched over REST.
const toClient = (n) => ({
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

// A recipient listens on a room keyed by inbox (role) + user id, so a person's
// customer feed and admin feed stay separate — an admin joins both.
const roomFor = (role, recipientId) => `${role}:${recipientId}`;

// Attach Socket.IO to the given HTTP server and authenticate every connection
// with the same JWT used for REST. Call once at startup.
export const initSocket = (server) => {
  io = new Server(server, {
    cors: { origin: process.env.CLIENT_URL || "*", credentials: true },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("No token"));
    try {
      socket.user = jwt.verify(token, process.env.JWT_SECRET); // { id, role }
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    const { id, role } = socket.user;
    socket.join(roomFor("user", id)); // customer inbox for everyone
    if (role === "admin") socket.join(roomFor("admin", id)); // + admin inbox
  });

  return io;
};

// Deliver a saved notification to its recipient's room. No-op when sockets are
// not initialised (e.g. seed/migration scripts or tests), so callers never guard.
export const pushNotification = (notification) => {
  if (!io || !notification) return;
  const room = roomFor(notification.recipientRole || "user", notification.recipient);
  io.to(room).emit("notification", toClient(notification));
};
