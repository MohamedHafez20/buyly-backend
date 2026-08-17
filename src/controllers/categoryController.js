import Category from "../models/Category.js";
import Product from "../models/Product.js";
import { uniqueSlug } from "../utils/slugify.js";

const EDITABLE = ["name", "description", "image", "icon", "status"];
const pickBody = (body) => {
  const out = {};
  for (const key of EDITABLE) if (body[key] !== undefined) out[key] = body[key];
  return out;
};

// Attach a productCount to each category via a single grouped query.
const withCounts = async (categories) => {
  const counts = await Product.aggregate([
    { $group: { _id: "$category", count: { $sum: 1 } } },
  ]);
  const map = new Map(counts.map((c) => [String(c._id), c.count]));
  return categories.map((c) => ({
    ...c,
    productCount: map.get(String(c._id)) || 0,
  }));
};

// GET /api/categories  (public)
export const getCategories = async (req, res) => {
  try {
    const categories = await Category.find().sort("name").lean();
    res.json(await withCounts(categories));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/categories  (admin)
export const createCategory = async (req, res) => {
  try {
    const data = pickBody(req.body);
    if (!data.name) return res.status(400).json({ message: "Name is required" });

    const exists = await Category.findOne({ name: data.name });
    if (exists)
      return res.status(409).json({ message: "Category already exists" });

    data.slug = await uniqueSlug(Category, data.name);
    const category = await Category.create(data);
    res.status(201).json(category);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// PATCH /api/categories/:id  (admin)
export const updateCategory = async (req, res) => {
  try {
    const data = pickBody(req.body);
    if (data.name) data.slug = await uniqueSlug(Category, data.name, req.params.id);

    const category = await Category.findByIdAndUpdate(req.params.id, data, {
      new: true,
      runValidators: true,
    });
    if (!category)
      return res.status(404).json({ message: "Category not found" });
    res.json(category);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// DELETE /api/categories/:id  (admin) — blocked while products still use it.
export const deleteCategory = async (req, res) => {
  try {
    const inUse = await Product.countDocuments({ category: req.params.id });
    if (inUse > 0) {
      return res.status(409).json({
        message: `Cannot delete: ${inUse} product(s) still use this category`,
      });
    }
    const category = await Category.findByIdAndDelete(req.params.id);
    if (!category)
      return res.status(404).json({ message: "Category not found" });
    res.json({ message: "Category deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
