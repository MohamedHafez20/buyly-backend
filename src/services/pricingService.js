import mongoose from "mongoose";
import Product from "../models/Product.js";
import Settings from "../models/Settings.js";
import Coupon from "../models/Coupon.js";
import Order from "../models/Order.js";

// Round to 2 decimal places, avoiding binary float drift (e.g. 6.995 -> 7.00).
const money = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// Resolve which variant of a product a cart line refers to. Prefers an exact
// SKU match, then falls back to a color+size match. Returns null when the
// product has no variants or the line carries no variant selection.
export function matchVariant(product, { sku = "", color = "", size = "" } = {}) {
  const variants = Array.isArray(product?.variants) ? product.variants : [];
  if (!variants.length) return null;
  if (!sku && !color && !size) return null;
  if (sku) {
    const bySku = variants.find((v) => v.sku && v.sku === sku);
    if (bySku) return bySku;
  }
  return variants.find((v) => v.color === color && v.size === size) || null;
}

// Thrown for any pricing problem that should block an order (missing product,
// bad quantity, insufficient stock). The controller maps it to a 4xx response.
export class PricingError extends Error {
  constructor(message, status = 400, code = "PRICING_ERROR") {
    super(message);
    this.name = "PricingError";
    this.status = status;
    this.code = code;
  }
}

// Validate a coupon code against the current subtotal and (optionally) the
// user's redemption history. Returns a plain result the caller can act on.
// In preview mode an invalid coupon is reported, not thrown, so the cart still
// prices without it; in strict mode the caller throws on `error`.
async function resolveCoupon(code, subtotal, userId) {
  const clean = String(code || "").trim().toUpperCase();
  if (!clean) return { coupon: null, discount: 0, error: null };

  const coupon = await Coupon.findOne({ code: clean });
  if (!coupon || !coupon.active) {
    return { coupon: null, discount: 0, error: "Invalid coupon code" };
  }
  if (coupon.expiresAt && coupon.expiresAt.getTime() < Date.now()) {
    return { coupon: null, discount: 0, error: "This coupon has expired" };
  }
  if (subtotal < coupon.minSubtotal) {
    return {
      coupon: null,
      discount: 0,
      error: `Spend at least ${coupon.minSubtotal} to use this coupon`,
    };
  }
  if (coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit) {
    return { coupon: null, discount: 0, error: "This coupon has reached its usage limit" };
  }
  if (coupon.perUserLimit != null && userId) {
    const used = await Order.countDocuments({ user: userId, "coupon.code": clean });
    if (used >= coupon.perUserLimit) {
      return { coupon: null, discount: 0, error: "You have already used this coupon" };
    }
  }

  // Discount never exceeds the subtotal.
  const raw =
    coupon.type === "percent" ? (subtotal * coupon.value) / 100 : coupon.value;
  const discount = money(Math.min(raw, subtotal));
  return { coupon, discount, error: null };
}

// Resolve the raw client cart ([{ product, quantity }]) into an authoritative,
// server-computed price breakdown. This is the single source of truth for
// money in the app — both the cart summary endpoint and order placement use it.
//
// Options:
//   strict = false (default) — for cart/checkout preview. Invalid lines (missing
//            product, out of stock) are kept and flagged so the UI can warn, but
//            the totals only ever count what is genuinely purchasable.
//   strict = true — for placing an order. Any invalid line throws PricingError,
//            so a bad cart can never become a paid order.
//   couponCode — optional discount code; validated server-side.
//   userId — used to enforce per-user coupon limits.
export async function priceCart(rawItems = [], { strict = false, couponCode = null, userId = null, country = null } = {}) {
  const settings = await Settings.getSingleton();

  let countryDoc = null;
  if (country) {
    const isId = mongoose.isValidObjectId(country);
    countryDoc = await mongoose.model("Country").findOne(
      isId
        ? { _id: country }
        : {
            $or: [
              { name: new RegExp("^^" + String(country).trim() + "$", "i") },
              { code: String(country).trim().toUpperCase() }
            ]
          }
    );
  }

  const activeShippingRate = (countryDoc && countryDoc.shippingRate !== null && countryDoc.shippingRate !== undefined)
    ? countryDoc.shippingRate
    : settings.shippingFlatRate;

  const activeTaxRate = (countryDoc && countryDoc.taxRate !== null && countryDoc.taxRate !== undefined)
    ? countryDoc.taxRate
    : settings.taxRatePercent;

  const items = [];
  let subtotal = 0;

  for (const raw of Array.isArray(rawItems) ? rawItems : []) {
    const id = raw?.product;
    const quantity = Number(raw?.quantity);
    const rawColor = String(raw?.color || "");
    const rawSize = String(raw?.size || "");
    const rawSku = String(raw?.sku || "");
    const rawBundleTierId = raw?.bundleTierId || null;
    const rawUid = String(raw?.uid || "");
    const rawPieces = Array.isArray(raw?.pieces) ? raw.pieces : [];

    if (!mongoose.isValidObjectId(id)) {
      if (strict) throw new PricingError("Invalid product reference in cart");
      continue; // skip garbage lines in preview mode
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      if (strict) throw new PricingError("Quantity must be a whole number of at least 1");
      continue;
    }

    const product = await Product.findById(id);

    if (!product || product.status !== "active") {
      if (strict) {
        throw new PricingError(
          product ? "This product is no longer available" : "Product not found",
          404
        );
      }
      // Preview: surface an unavailable line the UI can render as removed.
      items.push({
        product: id,
        name: product?.name || "Unavailable product",
        slug: product?.slug || null,
        image: product?.images?.[0] || product?.image || null,
        price: product?.price ?? 0,
        quantity,
        color: rawColor,
        size: rawSize,
        sku: rawSku,
        uid: rawUid,
        bundleTierId: rawBundleTierId,
        pieces: rawPieces,
        lineTotal: 0,
        stock: 0,
        available: false,
        reason: product ? "unavailable" : "not_found",
      });
      continue;
    }

    // --- Bundle line ("buy N for a fixed price") ---------------------------
    // The whole line is one bundle: price is the tier's fixed total, and each
    // piece consumes one unit of its own variant. Never trusts client price.
    if (rawBundleTierId) {
      const tier = (product.bundleOffers || []).find(
        (t) => String(t._id) === String(rawBundleTierId)
      );
      const base = {
        product: product._id,
        name: product.name,
        slug: product.slug,
        image: product.images?.[0] || product.image || null,
        price: product.price,
        quantity: 1,
        uid: rawUid,
        bundleTierId: rawBundleTierId,
        bundleQuantity: tier?.quantity ?? rawPieces.length,
        bundlePrice: tier?.bundlePrice ?? 0,
        bundleLabel: tier?.label || "",
      };

      if (!tier || tier.active === false) {
        if (strict) {
          throw new PricingError(
            tier ? "This bundle offer is no longer active" : "Bundle offer not found",
            tier ? 400 : 404,
            "BUNDLE_INVALID"
          );
        }
        items.push({ ...base, pieces: rawPieces, lineTotal: 0, stock: 0, available: false, reason: "unavailable" });
        continue;
      }
      if (rawPieces.length !== tier.quantity) {
        if (strict) throw new PricingError(`This bundle needs exactly ${tier.quantity} pieces`, 400, "BUNDLE_PIECES");
        items.push({ ...base, pieces: rawPieces, lineTotal: 0, stock: 0, available: false, reason: "invalid_pieces" });
        continue;
      }

      const hasVariants = Array.isArray(product.variants) && product.variants.length > 0;
      const resolvedPieces = [];
      const demand = new Map(); // sku -> count
      let ok = true;
      let problem = "";
      for (const pc of rawPieces) {
        if (hasVariants) {
          const v = matchVariant(product, { sku: pc?.sku || "", color: pc?.color || "", size: pc?.size || "" });
          if (!v) { ok = false; problem = "Choose an available colour and size for every piece"; break; }
          resolvedPieces.push({ color: v.color, size: v.size, sku: v.sku });
          demand.set(v.sku, (demand.get(v.sku) || 0) + 1);
        } else {
          resolvedPieces.push({ color: pc?.color || "", size: pc?.size || "", sku: "" });
        }
      }
      if (ok && hasVariants) {
        for (const [sku, count] of demand) {
          const v = product.variants.find((x) => x.sku === sku);
          if (!v || v.stock < count) { ok = false; problem = `Not enough stock for ${v ? `${v.color}/${v.size}` : "a selected variant"}`; break; }
        }
      } else if (ok && product.stock < tier.quantity) {
        ok = false;
        problem = `Only ${product.stock} left in stock for ${product.name}`;
      }

      if (!ok) {
        if (strict) throw new PricingError(problem, 409, "BUNDLE_STOCK");
        items.push({ ...base, pieces: resolvedPieces.length ? resolvedPieces : rawPieces, lineTotal: 0, stock: 0, available: false, reason: "insufficient_stock" });
        continue;
      }

      const lineTotal = money(tier.bundlePrice);
      subtotal += lineTotal;
      items.push({ ...base, pieces: resolvedPieces, lineTotal, stock: tier.quantity, available: true });
      continue;
    }

    // Resolve the specific variant this line refers to; its stock (not the
    // product-level sum) governs availability. Lines without a variant selection
    // fall back to product.stock, so non-variant products are unchanged.
    const variant = matchVariant(product, { sku: rawSku, color: rawColor, size: rawSize });
    const availableStock = variant ? variant.stock : product.stock;
    const lineColor = variant ? variant.color : rawColor;
    const lineSize = variant ? variant.size : rawSize;
    const lineSku = variant ? variant.sku : rawSku;

    const inStock = availableStock >= quantity;
    if (!inStock && strict) {
      const label = variant ? ` (${variant.color}/${variant.size})` : "";
      throw new PricingError(
        `Only ${availableStock} left in stock for ${product.name}${label}`,
        409
      );
    }

    // Preview mode only bills the quantity that can actually be fulfilled, so
    // the displayed total never overstates what the customer would be charged.
    const billableQty = strict ? quantity : Math.min(quantity, availableStock);
    const lineTotal = money(product.price * billableQty);
    subtotal += lineTotal;

    items.push({
      product: product._id,
      name: product.name,
      slug: product.slug,
      image: product.images?.[0] || product.image || null,
      price: product.price,
      quantity,
      color: lineColor,
      size: lineSize,
      sku: lineSku,
      lineTotal,
      stock: availableStock,
      available: inStock,
      ...(inStock ? {} : { reason: "insufficient_stock" }),
    });
  }

  subtotal = money(subtotal);

  // Coupon discount is applied to the subtotal first; shipping and tax are then
  // computed on the discounted amount.
  const { coupon, discount, error: couponError } = await resolveCoupon(
    couponCode,
    subtotal,
    userId
  );
  if (strict && couponError) throw new PricingError(couponError, 400, "COUPON_INVALID");

  const discountedSubtotal = money(Math.max(0, subtotal - discount));

  // Shipping: free at/above the threshold (and for an empty cart), otherwise
  // the flat rate. Tax: a flat percentage of the discounted subtotal.
  const shipping =
    discountedSubtotal <= 0 || discountedSubtotal >= settings.freeShippingThreshold
      ? 0
      : money(activeShippingRate);
  const tax = money((discountedSubtotal * activeTaxRate) / 100);
  const total = money(discountedSubtotal + shipping + tax);
  const freeShippingGap = money(
    Math.max(0, settings.freeShippingThreshold - discountedSubtotal)
  );

  return {
    items,
    subtotal,
    discount,
    coupon: coupon
      ? { code: coupon.code, type: coupon.type, value: coupon.value, discount }
      : null,
    couponError,
    shipping,
    tax,
    total,
    currency: settings.currency,
    taxRatePercent: activeTaxRate,
    freeShippingThreshold: settings.freeShippingThreshold,
    freeShippingGap,
    country: countryDoc ? { id: countryDoc._id, name: countryDoc.name, code: countryDoc.code } : null,
    // True only when every line is purchasable — the checkout button keys off this.
    fulfillable: items.length > 0 && items.every((i) => i.available),
  };
}
