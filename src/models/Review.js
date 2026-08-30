import mongoose from "mongoose";

// A product review. One review per user per product (enforced by a compound
// unique index). Product rating/review-count aggregates are recomputed from
// approved reviews whenever a review changes.
const reviewSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true }, // snapshot of the reviewer's name
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, trim: true, default: "", maxlength: 2000 },
    status: {
      type: String,
      enum: ["approved", "rejected"],
      default: "approved",
    },
  },
  { timestamps: true }
);

// One review per user per product.
reviewSchema.index({ product: 1, user: 1 }, { unique: true });

export default mongoose.model("Review", reviewSchema);
