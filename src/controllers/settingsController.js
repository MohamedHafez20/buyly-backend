import Settings from "../models/Settings.js";

// Public projection — only the fields the storefront is allowed to read.
const publicView = (s) => ({
  storeName: s.storeName,
  currency: s.currency,
  authImage: s.authImage || "",
  freeShippingThreshold: s.freeShippingThreshold,
  shippingFlatRate: s.shippingFlatRate,
  taxRatePercent: s.taxRatePercent,
  // Only enabled methods are exposed to shoppers; the admin view returns all.
  paymentMethods: (s.paymentMethods || [])
    .filter((m) => m.enabled)
    .map((m) => ({ key: m.key, label: m.label })),
});

// Admin projection — the full, editable configuration.
const adminView = (s) => ({
  storeName: s.storeName,
  currency: s.currency,
  authImage: s.authImage || "",
  freeShippingThreshold: s.freeShippingThreshold,
  shippingFlatRate: s.shippingFlatRate,
  taxRatePercent: s.taxRatePercent,
  paymentMethods: (s.paymentMethods || []).map((m) => ({
    key: m.key,
    label: m.label,
    enabled: m.enabled,
  })),
});

// GET /api/settings  (public) — store name, currency, pricing rules for display.
export const getSettings = async (req, res) => {
  try {
    const settings = await Settings.getSingleton();
    res.json(publicView(settings));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/admin/settings  (admin) — full editable configuration.
export const getAdminSettings = async (req, res) => {
  try {
    const settings = await Settings.getSingleton();
    res.json(adminView(settings));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const NUMERIC = ["freeShippingThreshold", "shippingFlatRate", "taxRatePercent"];
// `authImage` accepts an empty string (reset to the bundled default banner).
const TEXT = ["storeName", "currency", "authImage"];

// PATCH /api/admin/settings  (admin) — update store configuration.
export const updateSettings = async (req, res) => {
  try {
    const settings = await Settings.getSingleton();

    for (const key of TEXT) {
      if (req.body[key] !== undefined) settings[key] = req.body[key];
    }

    for (const key of NUMERIC) {
      if (req.body[key] === undefined) continue;
      const num = Number(req.body[key]);
      if (Number.isNaN(num) || num < 0) {
        return res.status(400).json({ message: `${key} must be a non-negative number` });
      }
      settings[key] = num;
    }

    if (req.body.paymentMethods !== undefined) {
      if (!Array.isArray(req.body.paymentMethods)) {
        return res.status(400).json({ message: "paymentMethods must be an array" });
      }
      const cleaned = [];
      for (const m of req.body.paymentMethods) {
        if (!m?.key || !m?.label) {
          return res.status(400).json({ message: "Each payment method needs a key and label" });
        }
        cleaned.push({ key: String(m.key), label: String(m.label), enabled: m.enabled !== false });
      }
      if (!cleaned.some((m) => m.enabled)) {
        return res.status(400).json({ message: "At least one payment method must be enabled" });
      }
      settings.paymentMethods = cleaned;
    }

    await settings.save();
    res.json(adminView(settings));
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};
