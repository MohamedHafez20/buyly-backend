import mongoose from "mongoose";
import Review from "../models/Review.js";
import Product from "../models/Product.js";

const view = (r) => ({
  id: r._id,
  product: r.product,
  user: r.user,
  name: r.name,
  rating: r.rating,
  comment: r.comment,
  status: r.status,
  createdAt: r.createdAt,
});

const normalizeComment = (comment = "") => {
  const text = String(comment).trim();
  if (text.length > 2000) {
    return { error: "Comment must be 2000 characters or fewer" };
  }
  return { value: text };
};

// Recompute a product's denormalised rating/review-count from its APPROVED
// reviews. Called after any review change so the storefront always shows real
// numbers instead of the seeded placeholders.
export const recalcProductRating = async (productId) => {
  const agg = await Review.aggregate([
    { $match: { product: new mongoose.Types.ObjectId(String(productId)), status: "approved" } },
    { $group: { _id: "$product", avg: { $avg: "$rating" }, count: { $sum: 1 } } },
  ]);
  const { avg = 0, count = 0 } = agg[0] || {};
  await Product.findByIdAndUpdate(productId, {
    rating: Math.round(avg * 10) / 10,
    reviews: count,
  });
};

// GET /api/products/:id/reviews  (public) — approved reviews for a product.
export const getProductReviews = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid product id" });
    }
    const reviews = await Review.find({ product: id, status: "approved" }).sort("-createdAt");
    res.json(reviews.map(view));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/products/:id/reviews  (auth) — create a review.
export const createReview = async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, comment = "" } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid product id" });
    }
    const numRating = Number(rating);
    if (!Number.isInteger(numRating) || numRating < 1 || numRating > 5) {
      return res.status(400).json({ message: "Rating must be a whole number from 1 to 5" });
    }
    const normalizedComment = normalizeComment(comment);
    if (normalizedComment.error) {
      return res.status(400).json({ message: normalizedComment.error });
    }
    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ message: "Product not found" });

    const review = await Review.create({
      product: id,
      user: req.user.id,
      name: req.user.name || "Customer",
      rating: numRating,
      comment: normalizedComment.value,
    });

    await recalcProductRating(id);
    res.status(201).json(view(review));
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: "You have already reviewed this product" });
    }
    res.status(400).json({ message: err.message });
  }
};

// PATCH /api/reviews/:id  (auth, owner) — edit own review.
export const updateReview = async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) return res.status(404).json({ message: "Review not found" });
    if (review.user.toString() !== req.user.id) {
      return res.status(403).json({ message: "You can only edit your own review" });
    }

    if (req.body.rating !== undefined) {
      const numRating = Number(req.body.rating);
      if (!Number.isInteger(numRating) || numRating < 1 || numRating > 5) {
        return res.status(400).json({ message: "Rating must be a whole number from 1 to 5" });
      }
      review.rating = numRating;
    }
    if (req.body.comment !== undefined) {
      const normalizedComment = normalizeComment(req.body.comment);
      if (normalizedComment.error) {
        return res.status(400).json({ message: normalizedComment.error });
      }
      review.comment = normalizedComment.value;
    }

    await review.save();
    await recalcProductRating(review.product);
    res.json(view(review));
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// DELETE /api/reviews/:id  (auth, owner or admin)
export const deleteReview = async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) return res.status(404).json({ message: "Review not found" });
    if (req.user.role !== "admin" && review.user.toString() !== req.user.id) {
      return res.status(403).json({ message: "Not authorized to delete this review" });
    }
    const productId = review.product;
    await review.deleteOne();
    await recalcProductRating(productId);
    res.json({ message: "Review deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// --- admin moderation ---

// GET /api/admin/reviews?status=&product=  (admin)
export const getAllReviews = async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.product && mongoose.isValidObjectId(req.query.product)) {
      filter.product = req.query.product;
    }
    const reviews = await Review.find(filter)
      .populate("product", "name slug")
      .sort("-createdAt");
    res.json(
      reviews.map((r) => ({
        ...view(r),
        productName: r.product?.name || "",
        productSlug: r.product?.slug || "",
      }))
    );
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PATCH /api/admin/reviews/:id  (admin) — approve / reject.
export const moderateReview = async (req, res) => {
  try {
    const { status } = req.body;
    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({ message: "Status must be 'approved' or 'rejected'" });
    }
    const review = await Review.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    if (!review) return res.status(404).json({ message: "Review not found" });
    await recalcProductRating(review.product);
    res.json(view(review));
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};
