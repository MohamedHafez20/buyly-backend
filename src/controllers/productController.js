import mongoose from "mongoose";
import Product from "../models/Product.js";
import { uniqueSlug } from "../utils/slugify.js";

// Fields a client is allowed to set on a product.
const EDITABLE = [
  "name",
  "description",
  "brand",
  "price",
  "oldPrice",
  "stock",
  "images",
  "colors",
  "sizes",
  "variants",
  "bundleOffers",
  "badge",
  "features",
  "rating",
  "reviews",
  "status",
  "gender",
  "category",
];

// The only genders we ever persist. "all" is a frontend filter, never stored.
const GENDERS = ["men", "women", "unisex"];

// Coerce any incoming gender to a valid stored value, falling back to "unisex"
// so an unexpected/empty value can never break a write.
const normalizeGender = (value) => {
  const g = String(value ?? "").trim().toLowerCase();
  return GENDERS.includes(g) ? g : "unisex";
};

// Pick only allowed keys that were actually provided in the body.
const pickBody = (body) => {
  const out = {};
  for (const key of EDITABLE) {
    if (body[key] !== undefined) out[key] = body[key];
  }
  return out;
};

const HEX_RE = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/;

// Coerce incoming colors into the canonical [{ name, hex }] shape. Accepts both
// the new object form and the legacy "just a name" string form so older clients
// and existing data keep working. Entries without a name are dropped; an invalid
// hex is stored as an empty string (the storefront then falls back to a swatch).
const normalizeColorsInput = (colors) => {
  if (!Array.isArray(colors)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of colors) {
    let name = "";
    let hex = "";
    let image = "";
    if (typeof raw === "string") {
      name = raw.trim();
    } else if (raw && typeof raw === "object") {
      name = String(raw.name || "").trim();
      hex = String(raw.hex || "").trim();
      // Optional per-color image (relative /uploads path or absolute URL). The
      // storefront shows it as the hero image when that swatch is selected.
      image = String(raw.image || "").trim();
    }
    if (!name) continue;
    if (hex && !HEX_RE.test(hex)) hex = "";
    if (hex) hex = hex.toLowerCase();
    const key = name.toLowerCase();
    if (seen.has(key)) continue; // de-duplicate by name
    seen.add(key);
    out.push({ name, hex, image });
  }
  return out;
};

// Keep the legacy single `image` field in sync with images[0].
const syncPrimaryImage = (doc) => {
  if (Array.isArray(doc.images)) doc.image = doc.images[0] || "";
};

// Build a stable, human-readable SKU from a base (product slug) + color + size.
const skuFor = (base, color, size) =>
  [base, color, size]
    .map((s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]+/g, ""))
    .filter(Boolean)
    .join("-") || "VAR";

// Coerce incoming variants into [{ sku, color, size, stock }]. De-duplicates by
// color+size, floors stock to a non-negative integer, and generates an SKU when
// the client didn't supply one. `base` (the product slug) prefixes the SKU.
const normalizeVariantsInput = (variants, base) => {
  if (!Array.isArray(variants)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of variants) {
    if (!raw || typeof raw !== "object") continue;
    const color = String(raw.color || "").trim();
    const size = String(raw.size || "").trim();
    if (!color && !size) continue; // a variant must identify at least one axis
    const key = `${color.toLowerCase()}|${size.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    let stock = Number(raw.stock);
    stock = Number.isFinite(stock) && stock > 0 ? Math.floor(stock) : 0;
    const sku = raw.sku ? String(raw.sku).trim() : skuFor(base, color, size);
    out.push({ sku, color, size, stock });
  }
  return out;
};

const totalVariantStock = (variants) =>
  variants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0);

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// Validate & normalize bundle tiers against the product's base price. Throws a
// clear Error (surfaced as a 400) on any rule violation so an invalid bundle can
// never be saved. Preserves each tier's _id on edit so cart/order references stay
// stable. The base price itself is never modified here.
const normalizeBundleOffersInput = (offers, basePrice) => {
  if (!Array.isArray(offers)) return [];
  const base = Number(basePrice);
  if (!Number.isFinite(base) || base <= 0) {
    throw new Error("A valid base price is required before adding bundle offers");
  }
  const seenQty = new Set();
  const out = [];
  for (const raw of offers) {
    if (!raw || typeof raw !== "object") continue;
    const quantity = Number(raw.quantity);
    if (!Number.isInteger(quantity) || quantity < 2) {
      throw new Error("Each bundle tier needs a whole quantity of at least 2");
    }
    if (seenQty.has(quantity)) {
      throw new Error(`Duplicate bundle quantity ${quantity} — each tier must have a unique quantity`);
    }
    seenQty.add(quantity);

    const bundlePrice = Number(raw.bundlePrice);
    if (!Number.isFinite(bundlePrice) || bundlePrice <= 0) {
      throw new Error("Each bundle tier needs a price greater than 0");
    }
    const fullPrice = round2(base * quantity);
    if (bundlePrice >= fullPrice) {
      throw new Error(
        `Bundle price for "buy ${quantity}" must be less than ${fullPrice} (${quantity} × base price)`
      );
    }

    const offer = {
      quantity,
      bundlePrice: round2(bundlePrice),
      label: String(raw.label || "").trim(),
      active: raw.active !== false,
    };
    if (raw._id && mongoose.isValidObjectId(raw._id)) offer._id = raw._id;
    out.push(offer);
  }
  return out;
};

// When a product defines variants, product-level `stock` becomes the derived sum
// so every product-level flow (pricing, checkout, inventory admin) stays correct.
const applyVariants = (data, base) => {
  if (data.variants === undefined) return;
  data.variants = normalizeVariantsInput(data.variants, base);
  if (data.variants.length) data.stock = totalVariantStock(data.variants);
};

// GET /api/products?category=<id>&search=<q>&status=<active|draft>&gender=<men|women|all>  (public)
export const getProducts = async (req, res) => {
  try {
    const filter = {};
    if (req.query.category) filter.category = req.query.category;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.search) {
      filter.name = { $regex: req.query.search, $options: "i" };
    }
    // Gender filtering happens in the database. "unisex" products belong to both
    // audiences, so the Men tab returns men + unisex and the Women tab returns
    // women + unisex. Asking for "unisex" returns only unisex; "all" (and any
    // missing/unknown value) applies no constraint, returning every product
    // including legacy documents without a gender.
    const gender = String(req.query.gender ?? "").trim().toLowerCase();
    if (gender === "men") filter.gender = { $in: ["men", "unisex"] };
    else if (gender === "women") filter.gender = { $in: ["women", "unisex"] };
    else if (gender === "unisex") filter.gender = "unisex";

    const products = await Product.find(filter)
      .populate("category", "name slug")
      .sort("-createdAt");
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/products/:idOrSlug  (public)
export const getProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const query = mongoose.isValidObjectId(id) ? { _id: id } : { slug: id };
    const product = await Product.findOne(query).populate("category", "name slug");
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json(product);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/products  (admin)
export const createProduct = async (req, res) => {
  try {
    const data = pickBody(req.body);
    if (!data.name || data.price == null || !data.category) {
      return res
        .status(400)
        .json({ message: "Name, price, and category are required" });
    }
    if (data.colors !== undefined) data.colors = normalizeColorsInput(data.colors);
    data.gender = normalizeGender(data.gender); // always land on a valid stored value
    data.slug = await uniqueSlug(Product, data.name);
    applyVariants(data, data.slug);
    if (data.bundleOffers !== undefined) {
      data.bundleOffers = normalizeBundleOffersInput(data.bundleOffers, data.price);
    }
    syncPrimaryImage(data);

    const product = await Product.create(data);
    const populated = await product.populate("category", "name slug");
    res.status(201).json(populated);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// PATCH /api/products/:id  (admin)
export const updateProduct = async (req, res) => {
  try {
    const data = pickBody(req.body);
    if (data.colors !== undefined) data.colors = normalizeColorsInput(data.colors);
    if (data.gender !== undefined) data.gender = normalizeGender(data.gender);

    // Regenerate the slug only when the name changes.
    if (data.name) {
      data.slug = await uniqueSlug(Product, data.name, req.params.id);
    }

    // Variants need the product slug (SKU base) and bundle offers need the base
    // price; look up the current product when this update doesn't include them.
    if (data.variants !== undefined || data.bundleOffers !== undefined) {
      const existing = await Product.findById(req.params.id).select("slug price").lean();
      if (!existing) return res.status(404).json({ message: "Product not found" });
      if (data.variants !== undefined) {
        applyVariants(data, data.slug || existing.slug || "var");
      }
      if (data.bundleOffers !== undefined) {
        const basePrice = data.price !== undefined ? data.price : existing.price;
        data.bundleOffers = normalizeBundleOffersInput(data.bundleOffers, basePrice);
      }
    }

    if (data.images !== undefined) syncPrimaryImage(data);

    const product = await Product.findByIdAndUpdate(req.params.id, data, {
      new: true,
      runValidators: true,
    }).populate("category", "name slug");
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json(product);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// DELETE /api/products/:id  (admin)
export const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json({ message: "Product deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
