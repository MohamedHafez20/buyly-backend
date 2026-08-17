import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, unique: true, index: true },
    description: { type: String, trim: true },
    brand: { type: String, trim: true },
    price: { type: Number, required: true, min: 0 },
    oldPrice: { type: Number, min: 0, default: null }, // original price for discounts
    stock: { type: Number, default: 0, min: 0 },
    images: { type: [String], default: [] }, // gallery (relative /uploads/... or absolute URLs)
    image: { type: String }, // legacy mirror of images[0], kept for backward compatibility
    colors: { type: [String], default: [] },
    sizes: { type: [String], default: [] },
    badge: { type: String, default: null }, // e.g. "Best Seller", "New", "Hot"
    features: { type: [String], default: [] },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    reviews: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ["active", "draft"], default: "active" },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Product", productSchema);
