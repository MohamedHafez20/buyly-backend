import mongoose from "mongoose";
import AnnouncementBar from "../models/AnnouncementBar.js";

// Supported font-family keys. The frontend maps each key to a concrete,
// web-safe font stack so the admin preview matches the storefront exactly.
export const FONT_FAMILIES = ["system", "serif", "mono", "rounded", "condensed"];
const FONT_WEIGHTS = ["normal", "medium", "bold"];
const TEXT_TRANSFORMS = ["none", "uppercase", "capitalize"];
const TEXT_ALIGNS = ["left", "center", "right"];
const ANIMATIONS = ["none", "slide-in", "fade"];
const FONT_SIZE_PRESETS = ["sm", "md", "lg"];

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const isHex = (v) => typeof v === "string" && HEX_RE.test(v.trim());
const isGradient = (v) =>
  typeof v === "string" && /^(linear|radial|conic)-gradient\(.+\)$/.test(v.trim());

const view = (b) => ({
  id: b._id,
  message: b.message,
  promoCode: b.promoCode,
  linkUrl: b.linkUrl,
  linkText: b.linkText,
  backgroundType: b.backgroundType,
  backgroundColor: b.backgroundColor,
  textColor: b.textColor,
  accentColor: b.accentColor,
  fontFamily: b.fontFamily,
  fontSize: b.fontSize,
  fontWeight: b.fontWeight,
  textTransform: b.textTransform,
  letterSpacing: b.letterSpacing,
  textAlign: b.textAlign,
  paddingY: b.paddingY,
  borderRadius: b.borderRadius,
  borderColor: b.borderColor,
  borderWidth: b.borderWidth,
  icon: b.icon,
  isActive: b.isActive,
  startDate: b.startDate,
  endDate: b.endDate,
  dismissible: b.dismissible,
  animation: b.animation,
  autoRotateSeconds: b.autoRotateSeconds,
  sortOrder: b.sortOrder,
});

// Validate a numeric field lies within [min, max]. Returns an error string or null.
const numInRange = (label, value, min, max) => {
  const n = Number(value);
  if (Number.isNaN(n)) return `${label} must be a number`;
  if (n < min || n > max) return `${label} must be between ${min} and ${max}`;
  return null;
};

// Whole-payload validation. `partial` skips required-field checks (for PATCH).
const validate = (body, { partial = false } = {}) => {
  const errors = {};

  if (!partial || body.message !== undefined) {
    if (!body.message || !String(body.message).trim()) {
      errors.message = "Message is required";
    }
  }

  // Background: solid → hex; gradient → css gradient string.
  const bgType = body.backgroundType;
  if (bgType !== undefined && !["solid", "gradient"].includes(bgType)) {
    errors.backgroundType = "Background type must be 'solid' or 'gradient'";
  }
  if (body.backgroundColor !== undefined) {
    const effectiveType = bgType || "solid";
    if (effectiveType === "gradient") {
      if (!isGradient(body.backgroundColor)) {
        errors.backgroundColor = "Enter a valid CSS gradient, e.g. linear-gradient(90deg,#f00,#00f)";
      }
    } else if (!isHex(body.backgroundColor)) {
      errors.backgroundColor = "Background must be a valid hex colour (e.g. #111111)";
    }
  }

  for (const [key, label] of [
    ["textColor", "Text colour"],
    ["accentColor", "Accent colour"],
  ]) {
    if (body[key] !== undefined && !isHex(body[key])) {
      errors[key] = `${label} must be a valid hex colour`;
    }
  }
  // borderColor may be empty (no border) or a hex value.
  if (body.borderColor !== undefined && body.borderColor !== "" && !isHex(body.borderColor)) {
    errors.borderColor = "Border colour must be a valid hex colour";
  }

  if (body.fontFamily !== undefined && !FONT_FAMILIES.includes(body.fontFamily)) {
    errors.fontFamily = `Font must be one of: ${FONT_FAMILIES.join(", ")}`;
  }
  if (body.fontWeight !== undefined && !FONT_WEIGHTS.includes(body.fontWeight)) {
    errors.fontWeight = "Invalid font weight";
  }
  if (body.textTransform !== undefined && !TEXT_TRANSFORMS.includes(body.textTransform)) {
    errors.textTransform = "Invalid text transform";
  }
  if (body.textAlign !== undefined && !TEXT_ALIGNS.includes(body.textAlign)) {
    errors.textAlign = "Invalid text alignment";
  }
  if (body.animation !== undefined && !ANIMATIONS.includes(body.animation)) {
    errors.animation = "Invalid animation";
  }

  if (body.fontSize !== undefined) {
    const fs = String(body.fontSize);
    const asNum = Number(fs);
    if (!FONT_SIZE_PRESETS.includes(fs) && (Number.isNaN(asNum) || asNum < 8 || asNum > 48)) {
      errors.fontSize = "Font size must be sm/md/lg or a number between 8 and 48";
    }
  }

  const ranges = [
    ["letterSpacing", "Letter spacing", -5, 20],
    ["paddingY", "Vertical padding", 0, 60],
    ["borderRadius", "Border radius", 0, 40],
    ["borderWidth", "Border width", 0, 10],
    ["autoRotateSeconds", "Auto-rotate seconds", 2, 60],
  ];
  for (const [key, label, min, max] of ranges) {
    if (body[key] !== undefined) {
      const err = numInRange(label, body[key], min, max);
      if (err) errors[key] = err;
    }
  }

  // Schedule: end must be after start when both provided.
  const start = body.startDate ? new Date(body.startDate) : null;
  const end = body.endDate ? new Date(body.endDate) : null;
  if (start && Number.isNaN(start.getTime())) errors.startDate = "Invalid start date";
  if (end && Number.isNaN(end.getTime())) errors.endDate = "Invalid end date";
  if (start && end && !errors.startDate && !errors.endDate && end <= start) {
    errors.endDate = "End date must be after the start date";
  }

  return Object.keys(errors).length ? errors : null;
};

// Fields a client may set. Everything else is ignored.
const EDITABLE = [
  "message", "promoCode", "linkUrl", "linkText",
  "backgroundType", "backgroundColor", "textColor", "accentColor",
  "fontFamily", "fontSize", "fontWeight", "textTransform", "letterSpacing",
  "textAlign", "paddingY", "borderRadius", "borderColor", "borderWidth", "icon",
  "isActive", "startDate", "endDate", "dismissible", "animation",
  "autoRotateSeconds", "sortOrder",
];

const pick = (body) => {
  const out = {};
  for (const key of EDITABLE) {
    if (body[key] !== undefined) out[key] = body[key];
  }
  return out;
};

const fieldError = (fields) =>
  ({ success: false, error: { code: "VALIDATION_ERROR", message: "The request contains invalid data.", fields } });

// GET /api/announcements  (public) — currently-visible bars only.
export const getActiveBars = async (req, res) => {
  try {
    const now = new Date();
    const bars = await AnnouncementBar.find({
      isActive: true,
      $and: [
        { $or: [{ startDate: null }, { startDate: { $lte: now } }] },
        { $or: [{ endDate: null }, { endDate: { $gte: now } }] },
      ],
    }).sort({ sortOrder: 1, createdAt: 1 });
    res.json(bars.map(view));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/announcements/all  (admin) — every bar, active or not.
export const getAllBars = async (req, res) => {
  try {
    const bars = await AnnouncementBar.find().sort({ sortOrder: 1, createdAt: 1 });
    res.json(bars.map(view));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/announcements  (admin)
export const createBar = async (req, res) => {
  try {
    const errors = validate(req.body);
    if (errors) return res.status(422).json(fieldError(errors));

    // New bars go to the end unless a sortOrder was supplied.
    let data = pick(req.body);
    if (data.sortOrder === undefined) {
      const last = await AnnouncementBar.findOne().sort("-sortOrder").select("sortOrder").lean();
      data.sortOrder = last ? last.sortOrder + 1 : 0;
    }

    const bar = await AnnouncementBar.create(data);
    res.status(201).json(view(bar));
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// PATCH /api/announcements/:id  (admin)
export const updateBar = async (req, res) => {
  try {
    const errors = validate(req.body, { partial: true });
    if (errors) return res.status(422).json(fieldError(errors));

    const bar = await AnnouncementBar.findByIdAndUpdate(req.params.id, pick(req.body), {
      new: true,
      runValidators: true,
    });
    if (!bar) return res.status(404).json({ message: "Announcement bar not found" });
    res.json(view(bar));
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// DELETE /api/announcements/:id  (admin)
export const deleteBar = async (req, res) => {
  try {
    const bar = await AnnouncementBar.findByIdAndDelete(req.params.id);
    if (!bar) return res.status(404).json({ message: "Announcement bar not found" });
    res.json({ message: "Announcement bar deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PATCH /api/announcements/reorder  (admin) — body: { order: [id, id, ...] }
export const reorderBars = async (req, res) => {
  try {
    const order = Array.isArray(req.body?.order) ? req.body.order : null;
    if (!order) return res.status(400).json({ message: "order must be an array of bar ids" });

    const ops = [];
    order.forEach((id, index) => {
      if (mongoose.isValidObjectId(id)) {
        ops.push({ updateOne: { filter: { _id: id }, update: { sortOrder: index } } });
      }
    });
    if (ops.length) await AnnouncementBar.bulkWrite(ops);

    const bars = await AnnouncementBar.find().sort({ sortOrder: 1, createdAt: 1 });
    res.json(bars.map(view));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
