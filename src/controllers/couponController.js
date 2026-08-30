import Coupon from "../models/Coupon.js";

const view = (c) => ({
  id: c._id,
  code: c.code,
  type: c.type,
  value: c.value,
  active: c.active,
  expiresAt: c.expiresAt,
  minSubtotal: c.minSubtotal,
  usageLimit: c.usageLimit,
  usedCount: c.usedCount,
  perUserLimit: c.perUserLimit,
});

// Normalise and validate a coupon payload for create/update.
const buildPayload = (body) => {
  const data = {};
  if (body.code !== undefined) data.code = String(body.code).trim().toUpperCase();
  if (body.type !== undefined) data.type = body.type;
  if (body.value !== undefined) data.value = Number(body.value);
  if (body.active !== undefined) data.active = Boolean(body.active);
  if (body.expiresAt !== undefined) data.expiresAt = body.expiresAt || null;
  if (body.minSubtotal !== undefined) data.minSubtotal = Number(body.minSubtotal) || 0;
  if (body.usageLimit !== undefined)
    data.usageLimit = body.usageLimit === null || body.usageLimit === "" ? null : Number(body.usageLimit);
  if (body.perUserLimit !== undefined)
    data.perUserLimit = body.perUserLimit === null || body.perUserLimit === "" ? null : Number(body.perUserLimit);
  return data;
};

const validate = (data) => {
  if (data.type && !["percent", "fixed"].includes(data.type)) {
    return "Type must be 'percent' or 'fixed'";
  }
  if (data.value != null && (Number.isNaN(data.value) || data.value < 0)) {
    return "Value must be a non-negative number";
  }
  if (data.type === "percent" && data.value != null && data.value > 100) {
    return "Percent discount cannot exceed 100";
  }
  return null;
};

// GET /api/admin/coupons  (admin)
export const getCoupons = async (req, res) => {
  try {
    const coupons = await Coupon.find().sort("-createdAt");
    res.json(coupons.map(view));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/admin/coupons  (admin)
export const createCoupon = async (req, res) => {
  try {
    const data = buildPayload(req.body);
    if (!data.code) return res.status(400).json({ message: "Coupon code is required" });
    if (!data.type || data.value == null) {
      return res.status(400).json({ message: "Type and value are required" });
    }
    const err = validate(data);
    if (err) return res.status(400).json({ message: err });

    const coupon = await Coupon.create(data);
    res.status(201).json(view(coupon));
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: "That code already exists" });
    res.status(400).json({ message: err.message });
  }
};

// PATCH /api/admin/coupons/:id  (admin)
export const updateCoupon = async (req, res) => {
  try {
    const data = buildPayload(req.body);
    const err = validate(data);
    if (err) return res.status(400).json({ message: err });

    const coupon = await Coupon.findByIdAndUpdate(req.params.id, data, {
      new: true,
      runValidators: true,
    });
    if (!coupon) return res.status(404).json({ message: "Coupon not found" });
    res.json(view(coupon));
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: "That code already exists" });
    res.status(400).json({ message: err.message });
  }
};

// DELETE /api/admin/coupons/:id  (admin)
export const deleteCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findByIdAndDelete(req.params.id);
    if (!coupon) return res.status(404).json({ message: "Coupon not found" });
    res.json({ message: "Coupon deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
