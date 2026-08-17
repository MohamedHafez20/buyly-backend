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
  "badge",
  "features",
  "rating",
  "reviews",
  "status",
  "category",
];

// Pick only allowed keys that were actually provided in the body.
const pickBody = (body) => {
  const out = {};
  for (const key of EDITABLE) {
    if (body[key] !== undefined) out[key] = body[key];
  }
  return out;
};

// Keep the legacy single `image` field in sync with images[0].
const syncPrimaryImage = (doc) => {
  if (Array.isArray(doc.images)) doc.image = doc.images[0] || "";
};

// GET /api/products?category=<id>&search=<q>&status=<active|draft>  (public)
export const getProducts = async (req, res) => {
  try {
    const filter = {};
    if (req.query.category) filter.category = req.query.category;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.search) {
      filter.name = { $regex: req.query.search, $options: "i" };
    }

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
    data.slug = await uniqueSlug(Product, data.name);
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

    // Regenerate the slug only when the name changes.
    if (data.name) {
      data.slug = await uniqueSlug(Product, data.name, req.params.id);
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
