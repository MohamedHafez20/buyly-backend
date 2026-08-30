import mongoose from "mongoose";

// A persisted cart line stores only a product reference and quantity. Prices,
// names and availability are always resolved live from the Product collection
// by the pricing service — never trusted from the client — so a cart can never
// go stale or be tampered with.
const cartItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    quantity: { type: Number, required: true, min: 1, default: 1 },
    // Optional variant selection. Empty for products without per-variant
    // inventory, so existing single-stock products behave exactly as before.
    color: { type: String, default: "" },
    size: { type: String, default: "" },
    sku: { type: String, default: "" },
    // Bundle lines: a "buy N for a fixed price" purchase, kept as ONE line.
    // `uid` gives the line a stable identity (client-generated); `pieces` are the
    // per-piece variant selections. Null/empty for ordinary product lines.
    uid: { type: String, default: "" },
    bundleTierId: { type: mongoose.Schema.Types.ObjectId, default: null },
    pieces: {
      type: [{ _id: false, color: String, size: String, sku: String }],
      default: [],
    },
  },
  { _id: false }
);

const cartSchema = new mongoose.Schema(
  {
    // One cart per user.
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    items: { type: [cartItemSchema], default: [] },
  },
  { timestamps: true }
);

export default mongoose.model("Cart", cartSchema);
