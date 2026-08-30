import mongoose from "mongoose";

// Countries available for shipping/checkout. Managed by admins; the storefront
// reads the enabled list instead of hardcoding a country <select>.
const countrySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    // ISO 3166-1 alpha-2 code (e.g. "US"). Optional but handy for later
    // shipping/tax rules keyed by country.
    code: { type: String, trim: true, uppercase: true, default: "" },
    enabled: { type: Boolean, default: true },
    order: { type: Number, default: 0 }, // display ordering
    shippingRate: { type: Number, default: null, min: 0 },
    taxRate: { type: Number, default: null, min: 0, max: 100 },
  },
  { timestamps: true }
);

countrySchema.index(
  { code: 1 },
  {
    unique: true,
    partialFilterExpression: { code: { $type: "string", $gt: "" } },
  }
);

export default mongoose.model("Country", countrySchema);
