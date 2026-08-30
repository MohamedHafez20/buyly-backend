import mongoose from "mongoose";

// Discount coupons. All validation and the discount amount are computed
// server-side by the pricing service — the frontend only submits a code.
const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    // percent → value is 0-100; fixed → value is a currency amount.
    type: { type: String, enum: ["percent", "fixed"], required: true },
    value: { type: Number, required: true, min: 0 },

    active: { type: Boolean, default: true },
    expiresAt: { type: Date, default: null },

    minSubtotal: { type: Number, default: 0, min: 0 }, // minimum cart subtotal to qualify
    usageLimit: { type: Number, default: null, min: 0 }, // total redemptions allowed (null = unlimited)
    usedCount: { type: Number, default: 0, min: 0 },
    perUserLimit: { type: Number, default: null, min: 0 }, // redemptions per user (null = unlimited)
  },
  { timestamps: true }
);

export default mongoose.model("Coupon", couponSchema);
