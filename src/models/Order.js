import mongoose from "mongoose";

const orderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    name: { type: String, required: true },   // snapshot at purchase time
    price: { type: Number, required: true },   // snapshot at purchase time
    quantity: { type: Number, required: true, min: 1 },
    // Variant snapshot at purchase time (empty for non-variant products).
    color: { type: String, default: "" },
    size: { type: String, default: "" },
    sku: { type: String, default: "" },
    // Bundle snapshot: when set, this line is a "buy N for a fixed price" bundle.
    // Price and piece selections are frozen here so historical orders are
    // unaffected by later admin changes to (or removal of) the bundle offer.
    bundleTierId: { type: mongoose.Schema.Types.ObjectId, default: null },
    bundlePrice: { type: Number, default: null },
    bundleLabel: { type: String, default: "" },
    pieces: {
      type: [{ _id: false, color: String, size: String, sku: String }],
      default: [],
    },
  },
  { _id: false }
);

// Snapshot of the coupon applied to an order (null when none was used).
const orderCouponSchema = new mongoose.Schema(
  {
    code: { type: String },
    type: { type: String }, // "percent" | "fixed"
    value: { type: Number },
    discount: { type: Number },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    items: [orderItemSchema],
    // Price breakdown snapshotted from the pricing service at purchase time.
    subtotal: { type: Number, required: true, default: 0 },
    discount: { type: Number, required: true, default: 0 },
    // Snapshot of the applied coupon (null when none was used).
    coupon: { type: orderCouponSchema, default: null },
    shipping: { type: Number, required: true, default: 0 },
    tax: { type: Number, required: true, default: 0 },
    total: { type: Number, required: true },
    status: {
      type: String,
      enum: ["pending", "paid", "shipped", "delivered", "cancelled"],
      default: "pending",
    },
    shippingAddress: { type: String },
  },
  { timestamps: true }
);

export default mongoose.model("Order", orderSchema);