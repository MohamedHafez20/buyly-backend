import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import categoryRoutes from "./routes/category.routes.js";
import productRoutes from "./routes/product.routes.js";
import orderRoutes from "./routes/order.routes.js";
import uploadRoutes from "./routes/upload.routes.js";
import cartRoutes from "./routes/cart.routes.js";
import settingsRoutes from "./routes/settings.routes.js";
import countryRoutes from "./routes/country.routes.js";
import reviewRoutes from "./routes/review.routes.js";
import inventoryRoutes from "./routes/inventory.routes.js";
import wishlistRoutes from "./routes/wishlist.routes.js";
import announcementRoutes from "./routes/announcement.routes.js";
import notificationRoutes from "./routes/notification.routes.js";
import { uploadsDir } from "./middleware/upload.js";

const app = express();

app.use(cors());
app.use(express.json());

// Serve uploaded product images.
app.use("/uploads", express.static(uploadsDir));

app.get("/", (req, res) => {
  res.json({ message: "Buyly API is running" });
});

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/countries", countryRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/admin/inventory", inventoryRoutes);
app.use("/api/wishlist", wishlistRoutes);
app.use("/api/announcements", announcementRoutes);
app.use("/api/notifications", notificationRoutes);

export default app;
