import mongoose from "mongoose";

// Store-wide configuration. Persisted as a single document (singleton) so the
// backend — not the frontend — owns pricing rules: shipping thresholds, the
// flat shipping fee, and the tax rate. The admin panel edits these; the
// storefront only reads them.
const settingsSchema = new mongoose.Schema(
  {
    // A fixed key guarantees there is only ever one settings document.
    key: { type: String, default: "store", unique: true, immutable: true },

    storeName: { type: String, default: "Buyly", trim: true },
    currency: { type: String, default: "USD", trim: true, uppercase: true },

    // Brand image shown on the login / sign-up pages. Empty string means "use
    // the bundled default banner". Stored as a relative /uploads path or an
    // absolute URL; the frontend resolves it against the API origin.
    authImage: { type: String, default: "", trim: true },

    // Pricing rules used by the pricing service.
    freeShippingThreshold: { type: Number, default: 75, min: 0 }, // subtotal >= this ships free
    shippingFlatRate: { type: Number, default: 6.99, min: 0 }, // charged below the threshold
    taxRatePercent: { type: Number, default: 8, min: 0, max: 100 }, // applied to the subtotal

    // Payment methods offered at checkout. The storefront renders whatever the
    // backend marks enabled — it never hardcodes the list.
    paymentMethods: {
      type: [
        {
          _id: false,
          key: { type: String, required: true }, // card | paypal | cod | ...
          label: { type: String, required: true }, // display label
          enabled: { type: Boolean, default: true },
        },
      ],
      default: [
        { key: "card", label: "Credit Card", enabled: true },
        { key: "paypal", label: "PayPal", enabled: true },
        { key: "cod", label: "Cash on Delivery", enabled: true },
      ],
    },
  },
  { timestamps: true }
);

// Find the singleton, creating it with defaults on first access.
settingsSchema.statics.getSingleton = async function () {
  let doc = await this.findOne({ key: "store" });
  if (!doc) doc = await this.create({ key: "store" });
  return doc;
};

export default mongoose.model("Settings", settingsSchema);
