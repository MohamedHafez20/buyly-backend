import mongoose from "mongoose";

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    slug: { type: String, unique: true, index: true },
    description: { type: String, trim: true }, // short blurb shown under the category
    image: { type: String }, // banner image (relative /uploads/... or absolute URL)
    icon: { type: String }, // line-icon key used by the frontend (shirt, layers, wind, footprints, watch)
    status: { type: String, enum: ["active", "hidden"], default: "active" },
  },
  { timestamps: true }
);

export default mongoose.model("Category", categorySchema);
