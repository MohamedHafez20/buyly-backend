import mongoose from "mongoose";

const inventoryAdjustmentSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    quantity: { type: Number, required: true },
    type: {
      type: String,
      enum: ["purchase", "manual_adjustment", "restock", "order_cancellation", "returned_item"],
      required: true,
    },
    reason: { type: String, trim: true, default: "" },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
  },
  { timestamps: true }
);

export default mongoose.model("InventoryAdjustment", inventoryAdjustmentSchema);
