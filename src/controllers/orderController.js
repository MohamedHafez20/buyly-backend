import Order from "../models/Order.js";
import Product from "../models/Product.js";
import User from "../models/User.js";
import Cart from "../models/Cart.js";
import Coupon from "../models/Coupon.js";
import InventoryAdjustment from "../models/InventoryAdjustment.js";
import { priceCart, PricingError } from "../services/pricingService.js";
import {
  notifyOrderPlaced,
  notifyOrderStatusChanged,
  notifyPaymentResult,
  notifyStockLevels,
} from "../services/notificationService.js";

// Re-check low/out-of-stock levels for a set of product ids and alert admins.
// Safe: the service helpers swallow their own errors so this never disrupts the
// order flow it runs after.
const checkStockForProducts = async (productIds) => {
  for (const pid of [...new Set(productIds.map(String))]) {
    const product = await Product.findById(pid).select("name stock lowStockThreshold").lean();
    await notifyStockLevels(product);
  }
};

// Apply a signed stock delta for an order item. When the item carries a variant
// SKU that still exists on the product, the variant's stock and the product-level
// sum move together; otherwise only the product-level stock moves (non-variant
// products, or a variant removed since purchase). Historical orders keep working
// regardless of later catalog changes.
const changeStock = async (item, delta) => {
  if (item.sku) {
    const r = await Product.updateOne(
      { _id: item.product, "variants.sku": item.sku },
      { $inc: { "variants.$.stock": delta, stock: delta } }
    );
    if (r.matchedCount > 0) return;
  }
  await Product.findByIdAndUpdate(item.product, { $inc: { stock: delta } });
};

// Stock currently available for an order item: the variant's stock when the item
// has a still-existing variant SKU, else the product-level stock.
const availableForItem = (product, item) => {
  if (item.sku && Array.isArray(product.variants)) {
    const v = product.variants.find((x) => x.sku === item.sku);
    if (v) return v.stock;
  }
  return product.stock;
};

// Decrement (sign -1) or restock (sign +1) for an order item. Bundle lines move
// one unit per piece (against each piece's own variant); normal lines move by
// their quantity.
const applyItemStock = async (item, sign) => {
  if (Array.isArray(item.pieces) && item.pieces.length) {
    for (const piece of item.pieces) {
      await changeStock({ product: item.product, sku: piece.sku }, sign);
    }
  } else {
    await changeStock(item, sign * item.quantity);
  }
};

// Total units an order item consumes (a bundle consumes one unit per piece).
const itemUnits = (item) =>
  Array.isArray(item.pieces) && item.pieces.length ? item.pieces.length : item.quantity;

// Returns a shortfall message if the product can't currently satisfy the item
// (per-SKU demand for bundles, per-variant for normal lines), else null.
const stockShortfall = (product, item) => {
  if (!product) return "Product no longer exists";
  if (Array.isArray(item.pieces) && item.pieces.length) {
    const demand = new Map();
    for (const p of item.pieces) demand.set(p.sku || "", (demand.get(p.sku || "") || 0) + 1);
    for (const [sku, count] of demand) {
      if (sku) {
        const v = (product.variants || []).find((x) => x.sku === sku);
        const stock = v ? v.stock : product.stock;
        if (stock < count) return `'${product.name}' variant is out of stock`;
      } else if (product.stock < count) {
        return `'${product.name}' only has ${product.stock} in stock`;
      }
    }
    return null;
  }
  const available = availableForItem(product, item);
  if (available < item.quantity) {
    const label = item.sku ? ` (${item.color}/${item.size})` : "";
    return `'${product.name}'${label} only has ${available} in stock`;
  }
  return null;
};

// POST /api/orders  (customer) — place an order
export const createOrder = async (req, res) => {
  try {
    const { items, shippingAddress, couponCode, country } = req.body;
    // items from frontend: [{ product: "<id>", quantity: 2 }, ...]

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Order must have at least one item" });
    }

    // Re-price the whole cart server-side. In strict mode this throws on any
    // missing product, bad quantity, insufficient stock or invalid coupon — the
    // same rules the storefront previews, but now authoritative. The frontend's
    // numbers are never trusted: every figure below comes from here.
    const priced = await priceCart(items, {
      strict: true,
      couponCode,
      userId: req.user.id,
      country,
    });

    const orderItems = priced.items.map((i) =>
      i.bundleTierId
        ? {
            product: i.product,
            name: i.name,
            price: i.bundlePrice,
            quantity: 1,
            bundleTierId: i.bundleTierId,
            bundlePrice: i.bundlePrice,
            bundleLabel: i.bundleLabel || "",
            pieces: (i.pieces || []).map((p) => ({
              color: p.color || "",
              size: p.size || "",
              sku: p.sku || "",
            })),
          }
        : {
            product: i.product,
            name: i.name,
            price: i.price,
            quantity: i.quantity,
            color: i.color || "",
            size: i.size || "",
            sku: i.sku || "",
          }
    );

    const order = await Order.create({
      user: req.user.id,
      items: orderItems,
      subtotal: priced.subtotal,
      discount: priced.discount,
      coupon: priced.coupon,
      shipping: priced.shipping,
      tax: priced.tax,
      total: priced.total,
      shippingAddress,
    });

    // Decrement stock and record inventory adjustments now that the order
    // exists (so each adjustment can reference the real order id).
    for (const item of orderItems) {
      await applyItemStock(item, -1);
      await InventoryAdjustment.create({
        product: item.product,
        quantity: -itemUnits(item),
        type: "purchase",
        reason: `Checkout for order ${order._id}${item.bundleTierId ? ` · bundle x${itemUnits(item)}` : item.sku ? ` · ${item.sku}` : ""}`,
        user: req.user.id,
      });
    }

    // Record the redemption so usage limits are enforced going forward.
    if (priced.coupon) {
      await Coupon.updateOne({ code: priced.coupon.code }, { $inc: { usedCount: 1 } });
    }

    // The purchase is complete — empty the user's persisted cart.
    await Cart.findOneAndUpdate({ user: req.user.id }, { items: [] });

    // Fire notifications: confirm to the buyer, alert admins of the new order,
    // and surface any product that dropped to a low/out-of-stock level. All
    // helpers are self-guarding, so a notification failure never fails the order.
    const buyer = await User.findById(req.user.id).select("name").lean();
    await notifyOrderPlaced(order, buyer?.name || "A customer");
    await checkStockForProducts(orderItems.map((i) => i.product));

    res.status(201).json(order);
  } catch (err) {
    if (err instanceof PricingError) {
      return res.status(err.status).json({ message: err.message, code: err.code });
    }
    res.status(500).json({ message: err.message });
  }
};

// GET /api/orders/my  (customer) — own order history
export const getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user.id }).sort("-createdAt");
    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/orders/:id  (customer sees own, admin sees any)
export const getOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    if (req.user.role !== "admin" && order.user.toString() !== req.user.id) {
      return res.status(403).json({ message: "Not authorized to view this order" });
    }
    res.json(order);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/admin/orders  (admin) — the purchases dashboard
export const getAllOrders = async (req, res) => {
  try {
    const orders = await Order.find()
      .populate("user", "name email")
      .sort("-createdAt");
    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PATCH /api/admin/orders/:id/status  (admin)
export const updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ["pending", "paid", "shipped", "delivered", "cancelled"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    const previousStatus = order.status;
    if (previousStatus === status) {
      return res.json(order);
    }

    // If transitioning to "cancelled" from a non-cancelled state, RESTOCK items.
    if (status === "cancelled" && previousStatus !== "cancelled") {
      for (const item of order.items) {
        await applyItemStock(item, 1);
        await InventoryAdjustment.create({
          product: item.product,
          quantity: itemUnits(item),
          type: "order_cancellation",
          reason: `Restock due to order cancellation of ${order._id}${item.bundleTierId ? ` · bundle` : item.sku ? ` · ${item.sku}` : ""}`,
          user: req.user.id,
        });
      }
    }

    // If transitioning FROM "cancelled" to a non-cancelled state, check and DECREMENT items.
    if (status !== "cancelled" && previousStatus === "cancelled") {
      // Check stock first — per piece for bundles, per variant for normal lines.
      for (const item of order.items) {
        const product = await Product.findById(item.product);
        const shortfall = stockShortfall(product, item);
        if (shortfall) {
          return res.status(409).json({ message: `Insufficient stock to reactivate order. ${shortfall}.` });
        }
      }

      // Decrement stock
      for (const item of order.items) {
        await applyItemStock(item, -1);
        await InventoryAdjustment.create({
          product: item.product,
          quantity: -itemUnits(item),
          type: "purchase",
          reason: `Stock deduction due to reactivation of order ${order._id}${item.bundleTierId ? ` · bundle` : item.sku ? ` · ${item.sku}` : ""}`,
          user: req.user.id,
        });
      }
    }

    order.status = status;
    await order.save();

    // Notify the customer of the new status (and admins on a cancellation). If
    // the order was reactivated from "cancelled", stock was just decremented —
    // re-check levels so a reactivation can raise a low/out-of-stock alert.
    await notifyOrderStatusChanged(order);
    if (previousStatus === "cancelled" && status !== "cancelled") {
      await checkStockForProducts(order.items.map((i) => i.product));
    }

    res.json(order);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
// POST /api/orders/:id/pay  (customer)
export const payOrder = async (req, res) => {
  try {
    const { cardNumber, cardExpiry, cardCvc } = req.body;
    const order = await Order.findById(req.params.id);
    
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (order.user.toString() !== req.user.id) {
      return res.status(403).json({ message: "Not authorized to pay for this order" });
    }
    if (order.status !== "pending") {
      return res.status(400).json({ message: `Order is already in state: ${order.status}` });
    }

    // Simulate payment processing.
    // If the card ends with 0000, we fail it to test error scenarios!
    const cleanCard = String(cardNumber || "").replace(/\s/g, "");
    if (cleanCard.endsWith("0000")) {
      // Payment failed — release the stock this order reserved at creation and
      // cancel it, so a declined payment never holds inventory hostage.
      for (const item of order.items) {
        await applyItemStock(item, 1);
        await InventoryAdjustment.create({
          product: item.product,
          quantity: itemUnits(item),
          type: "order_cancellation",
          reason: `Restock due to declined payment on order ${order._id}${item.bundleTierId ? ` · bundle` : item.sku ? ` · ${item.sku}` : ""}`,
          user: req.user.id,
        });
      }
      order.status = "cancelled";
      await order.save();

      // Warn the customer and flag a payment issue for admins.
      await notifyPaymentResult(order, { success: false });

      return res.status(402).json({
        message: "Payment declined by issuing bank (insufficient funds or incorrect details).",
        code: "PAYMENT_DECLINED",
      });
    }

    // Success! Update status to paid.
    order.status = "paid";
    await order.save();

    // Confirm the payment to the customer.
    await notifyPaymentResult(order, { success: true });

    res.json({
      message: "Payment processed successfully",
      order,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/orders/webhook/stripe  (public webhook)
export const handleStripeWebhook = async (req, res) => {
  try {
    const token = req.headers["x-webhook-signature"];
    if (token !== "stripe_test_secret_signature") {
      return res.status(401).json({ message: "Invalid signature" });
    }

    const { orderId, status } = req.body;
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Order not found" });

    if (status === "payment_intent.succeeded") {
      order.status = "paid";
      await order.save();
      return res.json({ received: true, status: "paid" });
    }

    res.json({ received: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/orders/webhook/paypal  (public webhook)
export const handlePaypalWebhook = async (req, res) => {
  try {
    const token = req.headers["x-webhook-signature"];
    if (token !== "paypal_test_secret_signature") {
      return res.status(401).json({ message: "Invalid signature" });
    }

    const { orderId, eventType } = req.body;
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Order not found" });

    if (eventType === "PAYMENT.CAPTURE.COMPLETED") {
      order.status = "paid";
      await order.save();
      return res.json({ received: true, status: "paid" });
    }

    res.json({ received: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
