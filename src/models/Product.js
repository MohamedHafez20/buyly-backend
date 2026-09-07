import mongoose from "mongoose";

// A single purchasable variant: one color + size combination with its own stock
// and an SKU. Products opt into per-variant inventory by defining variants; when
// they do, the controller keeps the product-level `stock` in sync as the sum so
// all existing product-level flows (pricing, checkout, inventory admin) keep
// working unchanged. Products with no variants behave exactly as before.
const variantSchema = new mongoose.Schema(
  {
    sku: { type: String, trim: true },
    color: { type: String, trim: true, default: "" },
    size: { type: String, trim: true, default: "" },
    stock: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

// A "buy N for a fixed price" bundle tier. Each tier keeps its own _id so the
// cart and orders can reference a specific tier stably. The base product price is
// never affected by these — they are an alternative, optional way to buy.
const bundleOfferSchema = new mongoose.Schema(
  {
    quantity: { type: Number, required: true, min: 2 }, // number of pieces
    bundlePrice: { type: Number, required: true, min: 0 }, // fixed total for the bundle
    label: { type: String, trim: true, default: "" }, // e.g. "Best Value"
    active: { type: Boolean, default: true },
  },
  { _id: true }
);

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, unique: true, index: true },
    description: { type: String, trim: true },
    brand: { type: String, trim: true },
    price: { type: Number, required: true, min: 0 },
    oldPrice: { type: Number, min: 0, default: null }, // original price for discounts
    stock: { type: Number, default: 0, min: 0 },
    lowStockThreshold: { type: Number, default: 5, min: 0 },
    images: { type: [String], default: [] }, // gallery (relative /uploads/... or absolute URLs)
    image: { type: String }, // legacy mirror of images[0], kept for backward compatibility
    // Color variants: array of { name, hex } objects, e.g.
    // { name: "Navy Blue", hex: "#1E3A8A" }. Stored as an untyped array so that
    // legacy products (which held plain color-name strings) still read cleanly;
    // the controller normalizes all input to the { name, hex } shape on write.
    colors: { type: Array, default: [] },
    sizes: { type: [String], default: [] },
    // Per-variant inventory (color+size -> stock/SKU). Empty for products that
    // track stock at the product level only.
    variants: { type: [variantSchema], default: [] },
    // Optional "buy N for a fixed price" bundle tiers. Empty = no bundle offers.
    bundleOffers: { type: [bundleOfferSchema], default: [] },
    badge: { type: String, default: null }, // e.g. "Best Seller", "New", "Hot"
    features: { type: [String], default: [] },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    reviews: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ["active", "draft"], default: "active" },
    // Merchandising gender. "unisex" covers products that belong to both men and
    // women. Defaults to "unisex" so products created without an explicit choice
    // (and legacy documents backfilled by the migration) stay visible under every
    // storefront tab. Note: "all" is a frontend filter only — never a stored value.
    gender: {
      type: String,
      enum: ["men", "women", "unisex"],
      default: "unisex",
      index: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Product", productSchema);
