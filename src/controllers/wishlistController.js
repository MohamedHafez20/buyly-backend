import mongoose from "mongoose";
import Product from "../models/Product.js";
import Wishlist from "../models/Wishlist.js";

const ids = (products) => products.map((id) => id.toString());

const ensureWishlist = async (userId) => {
  let wishlist = await Wishlist.findOne({ user: userId });
  if (!wishlist) {
    wishlist = await Wishlist.create({ user: userId, products: [] });
  }
  return wishlist;
};

const validateProductId = async (productId) => {
  if (!mongoose.isValidObjectId(productId)) {
    return "Invalid product id";
  }
  const exists = await Product.exists({ _id: productId });
  return exists ? null : "Product not found";
};

// GET /api/wishlist  (customer)
export const getWishlist = async (req, res) => {
  try {
    const wishlist = await ensureWishlist(req.user.id);
    res.json(ids(wishlist.products));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/wishlist/toggle  (customer)
export const toggleWishlist = async (req, res) => {
  try {
    const { productId } = req.body;
    if (!productId) {
      return res.status(400).json({ message: "productId is required" });
    }
    const productError = await validateProductId(productId);
    if (productError) {
      return res.status(productError === "Product not found" ? 404 : 400).json({ message: productError });
    }

    const wishlist = await ensureWishlist(req.user.id);

    const index = wishlist.products.findIndex((id) => id.toString() === productId);
    let added = false;
    if (index > -1) {
      wishlist.products.splice(index, 1);
    } else {
      wishlist.products.push(productId);
      added = true;
    }

    await wishlist.save();
    res.json({ wishlist: ids(wishlist.products), added });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/wishlist/merge  (customer)
export const mergeWishlist = async (req, res) => {
  try {
    const products = Array.isArray(req.body.products) ? req.body.products : [];
    const uniqueIds = [...new Set(products.map((id) => String(id)))];
    const invalidId = uniqueIds.find((id) => !mongoose.isValidObjectId(id));
    if (invalidId) {
      return res.status(400).json({ message: "Invalid product id" });
    }

    const existingProducts = await Product.find({ _id: { $in: uniqueIds } }).select("_id");
    const existingIds = existingProducts.map((product) => product._id);
    const wishlist = await ensureWishlist(req.user.id);
    wishlist.products = [...new Set([...ids(wishlist.products), ...ids(existingIds)])];
    await wishlist.save();

    res.json(ids(wishlist.products));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
