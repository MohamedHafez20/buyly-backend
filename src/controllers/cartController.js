import mongoose from "mongoose";
import Cart from "../models/Cart.js";
import { priceCart, PricingError } from "../services/pricingService.js";

// Load (or lazily create) the current user's cart document.
const getOrCreateCart = async (userId) => {
  let cart = await Cart.findOne({ user: userId });
  if (!cart) cart = await Cart.create({ user: userId, items: [] });
  return cart;
};

// Every cart response the frontend receives is a fully priced summary, so the
// client never has to compute anything itself.
const respondWithCart = async (res, cart, status = 200) => {
  const summary = await priceCart(cart.items, { strict: false });
  res.status(status).json(summary);
};

// POST /api/cart/summary  (public) — price an arbitrary item list, optionally
// with a coupon code. Used by guests (and for instant checkout previews)
// without touching the DB cart.
export const getSummary = async (req, res) => {
  try {
    const summary = await priceCart(req.body?.items || [], {
      strict: false,
      couponCode: req.body?.couponCode || null,
      country: req.body?.country || null,
    });
    res.json(summary);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
};

// GET /api/cart  (auth) — the signed-in user's persisted cart, priced.
export const getCart = async (req, res) => {
  try {
    const cart = await getOrCreateCart(req.user.id);
    await respondWithCart(res, cart);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/cart/items  (auth) — add a product (or increase its quantity).
export const addItem = async (req, res) => {
  try {
    const { product, quantity = 1 } = req.body;
    const qty = Number(quantity);
    if (!mongoose.isValidObjectId(product)) {
      return res.status(400).json({ message: "A valid product id is required" });
    }
    if (!Number.isInteger(qty) || qty < 1) {
      return res.status(400).json({ message: "Quantity must be a whole number of at least 1" });
    }

    const cart = await getOrCreateCart(req.user.id);
    const line = cart.items.find((i) => i.product.toString() === product);
    if (line) line.quantity = Math.min(line.quantity + qty, 99);
    else cart.items.push({ product, quantity: Math.min(qty, 99) });

    await cart.save();
    await respondWithCart(res, cart, 201);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PATCH /api/cart/items/:productId  (auth) — set an exact quantity.
export const updateItem = async (req, res) => {
  try {
    const { productId } = req.params;
    const qty = Number(req.body.quantity);
    if (!Number.isInteger(qty) || qty < 1) {
      return res.status(400).json({ message: "Quantity must be a whole number of at least 1" });
    }

    const cart = await getOrCreateCart(req.user.id);
    const line = cart.items.find((i) => i.product.toString() === productId);
    if (!line) return res.status(404).json({ message: "Item not in cart" });

    line.quantity = Math.min(qty, 99);
    await cart.save();
    await respondWithCart(res, cart);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// DELETE /api/cart/items/:productId  (auth) — remove one line.
export const removeItem = async (req, res) => {
  try {
    const { productId } = req.params;
    const cart = await getOrCreateCart(req.user.id);
    cart.items = cart.items.filter((i) => i.product.toString() !== productId);
    await cart.save();
    await respondWithCart(res, cart);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// DELETE /api/cart  (auth) — empty the cart.
export const clearCart = async (req, res) => {
  try {
    const cart = await getOrCreateCart(req.user.id);
    cart.items = [];
    await cart.save();
    await respondWithCart(res, cart);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/cart  (auth) — replace the whole cart with the given item list.
// Used for idempotent write-through sync from the client (no quantity doubling).
export const replaceCart = async (req, res) => {
  try {
    const incoming = Array.isArray(req.body?.items) ? req.body.items : [];
    const seen = new Map();
    for (const raw of incoming) {
      const id = raw?.product;
      const qty = Number(raw?.quantity);
      if (!mongoose.isValidObjectId(id)) continue;
      // Bundle line: keep as one line, identified by its client uid.
      if (raw?.bundleTierId && mongoose.isValidObjectId(raw.bundleTierId)) {
        const uid = String(raw.uid || `${Date.now()}-${Math.random()}`);
        seen.set(`bundle|${uid}`, {
          product: id,
          quantity: 1,
          uid,
          bundleTierId: raw.bundleTierId,
          pieces: (Array.isArray(raw.pieces) ? raw.pieces : []).map((p) => ({
            color: String(p?.color || ""),
            size: String(p?.size || ""),
            sku: String(p?.sku || ""),
          })),
        });
        continue;
      }
      if (!Number.isInteger(qty) || qty < 1) continue;
      const color = String(raw?.color || "");
      const size = String(raw?.size || "");
      const sku = String(raw?.sku || "");
      // Collapse duplicate lines for the same product AND variant; different
      // variants of the same product stay separate.
      const key = `${id}|${color}|${size}`;
      const existing = seen.get(key);
      if (existing) existing.quantity = Math.min(existing.quantity + qty, 99);
      else seen.set(key, { product: id, quantity: Math.min(qty, 99), color, size, sku });
    }

    const cart = await getOrCreateCart(req.user.id);
    cart.items = [...seen.values()];
    await cart.save();
    await respondWithCart(res, cart);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/cart/merge  (auth) — fold a guest's local cart into the server cart
// on login. Quantities for shared products are summed (capped at 99).
export const mergeCart = async (req, res) => {
  try {
    const incoming = Array.isArray(req.body?.items) ? req.body.items : [];
    const cart = await getOrCreateCart(req.user.id);

    for (const raw of incoming) {
      const id = raw?.product;
      const qty = Number(raw?.quantity);
      if (!mongoose.isValidObjectId(id)) continue;
      // Bundle lines are never merged — each is its own line.
      if (raw?.bundleTierId && mongoose.isValidObjectId(raw.bundleTierId)) {
        const uid = String(raw.uid || `${Date.now()}-${Math.random()}`);
        if (!cart.items.some((i) => i.uid && i.uid === uid)) {
          cart.items.push({
            product: id,
            quantity: 1,
            uid,
            bundleTierId: raw.bundleTierId,
            pieces: (Array.isArray(raw.pieces) ? raw.pieces : []).map((p) => ({
              color: String(p?.color || ""),
              size: String(p?.size || ""),
              sku: String(p?.sku || ""),
            })),
          });
        }
        continue;
      }
      if (!Number.isInteger(qty) || qty < 1) continue;
      const color = String(raw?.color || "");
      const size = String(raw?.size || "");
      const sku = String(raw?.sku || "");

      const line = cart.items.find(
        (i) => i.product.toString() === String(id) && (i.color || "") === color && (i.size || "") === size,
      );
      if (line) line.quantity = Math.min(line.quantity + qty, 99);
      else cart.items.push({ product: id, quantity: Math.min(qty, 99), color, size, sku });
    }

    await cart.save();
    await respondWithCart(res, cart);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
