import InventoryAdjustment from "../models/InventoryAdjustment.js";
import Product from "../models/Product.js";
import { notifyStockLevels } from "../services/notificationService.js";

// GET /api/admin/inventory/history  (admin)
export const getInventoryHistory = async (req, res) => {
  try {
    const history = await InventoryAdjustment.find()
      .populate("product", "name brand image images")
      .populate("user", "name email")
      .sort("-createdAt");
    res.json(history);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/admin/inventory/adjust  (admin)
export const adjustInventory = async (req, res) => {
  try {
    const { productId, quantity, type, reason = "" } = req.body;

    if (!productId || quantity === undefined || !type) {
      return res.status(400).json({ message: "productId, quantity, and type are required" });
    }

    const qty = Number(quantity);
    if (Number.isNaN(qty) || qty === 0) {
      return res.status(400).json({ message: "Quantity must be a non-zero integer" });
    }

    const allowedTypes = ["manual_adjustment", "restock", "returned_item"];
    if (!allowedTypes.includes(type)) {
      return res.status(400).json({ message: `Type must be one of: ${allowedTypes.join(", ")}` });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Prevent stock going below 0
    if (product.stock + qty < 0) {
      return res.status(400).json({ message: `Cannot reduce stock below 0. Current stock is ${product.stock}.` });
    }

    product.stock += qty;
    await product.save();

    // A manual reduction can push a product to low/out-of-stock — alert admins.
    await notifyStockLevels(product);

    const adjustment = await InventoryAdjustment.create({
      product: productId,
      quantity: qty,
      type,
      reason,
      user: req.user.id,
    });

    const populated = await adjustment.populate([
      { path: "product", select: "name brand image images" },
      { path: "user", select: "name email" },
    ]);

    res.status(201).json({
      product: {
        id: product._id,
        name: product.name,
        stock: product.stock,
      },
      adjustment: populated,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
