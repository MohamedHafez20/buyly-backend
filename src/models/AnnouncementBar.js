import mongoose from "mongoose";

// A storefront announcement bar. Every visual property is stored here so the
// admin can restyle the bar entirely from the panel — the frontend renders
// purely from these fields and never hardcodes colours or fonts.
const announcementBarSchema = new mongoose.Schema(
  {
    // --- CONTENT ---
    message: { type: String, required: true, trim: true, maxlength: 240 },
    promoCode: { type: String, trim: true, default: "" },
    linkUrl: { type: String, trim: true, default: "" },
    linkText: { type: String, trim: true, default: "" },

    // --- STYLE ---
    backgroundType: { type: String, enum: ["solid", "gradient"], default: "solid" },
    backgroundColor: { type: String, default: "#111111" }, // hex OR css gradient string
    textColor: { type: String, default: "#ffffff" },
    accentColor: { type: String, default: "#facc15" }, // promo highlight / border accent
    fontFamily: { type: String, default: "system" }, // key from the supported list
    fontSize: { type: String, default: "md" }, // "sm" | "md" | "lg" | numeric px
    fontWeight: { type: String, enum: ["normal", "medium", "bold"], default: "medium" },
    textTransform: {
      type: String,
      enum: ["none", "uppercase", "capitalize"],
      default: "none",
    },
    letterSpacing: { type: Number, default: 0 }, // px
    textAlign: { type: String, enum: ["left", "center", "right"], default: "center" },
    paddingY: { type: Number, default: 10, min: 0, max: 60 }, // px, drives bar height
    borderRadius: { type: Number, default: 0, min: 0, max: 40 }, // px
    borderColor: { type: String, default: "" },
    borderWidth: { type: Number, default: 0, min: 0, max: 10 }, // px
    icon: { type: String, default: "" }, // optional emoji before the text

    // --- BEHAVIOR ---
    isActive: { type: Boolean, default: true },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    dismissible: { type: Boolean, default: true },
    animation: { type: String, enum: ["none", "slide-in", "fade"], default: "none" },
    autoRotateSeconds: { type: Number, default: 5, min: 2, max: 60 },
    sortOrder: { type: Number, default: 0, index: true },
  },
  { timestamps: true }
);

export default mongoose.model("AnnouncementBar", announcementBarSchema);
