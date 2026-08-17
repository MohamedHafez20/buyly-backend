import Product from "../models/Product.js";
import User from "../models/User.js";
import Order from "../models/Order.js";

// Orders in these states count as realised revenue (not pending / cancelled).
const REVENUE_STATES = ["paid", "shipped", "delivered"];

// GET /api/admin/stats  (admin) — powers the dashboard.
export const getStats = async (req, res) => {
  try {
    const [
      totalProducts,
      totalUsers,
      totalOrders,
      revenueAgg,
      recentOrders,
      recentProducts,
      lowStock,
      statusAgg,
    ] = await Promise.all([
      Product.countDocuments(),
      User.countDocuments(),
      Order.countDocuments(),
      Order.aggregate([
        { $match: { status: { $in: REVENUE_STATES } } },
        { $group: { _id: null, total: { $sum: "$total" } } },
      ]),
      Order.find()
        .populate("user", "name email")
        .sort("-createdAt")
        .limit(6)
        .lean(),
      Product.find()
        .populate("category", "name")
        .sort("-createdAt")
        .limit(6)
        .lean(),
      Product.find({ stock: { $lte: 5 } })
        .sort("stock")
        .limit(6)
        .select("name stock price images image")
        .lean(),
      Order.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    ]);

    // Sales for the last 7 days (by day), realised revenue only.
    const since = new Date();
    since.setDate(since.getDate() - 6);
    since.setHours(0, 0, 0, 0);
    const salesAgg = await Order.aggregate([
      { $match: { createdAt: { $gte: since }, status: { $in: REVENUE_STATES } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          total: { $sum: "$total" },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const ordersByStatus = statusAgg.reduce((acc, s) => {
      acc[s._id] = s.count;
      return acc;
    }, {});

    res.json({
      totals: {
        products: totalProducts,
        users: totalUsers,
        orders: totalOrders,
        revenue: revenueAgg[0]?.total || 0,
      },
      ordersByStatus,
      salesByDay: salesAgg.map((s) => ({
        date: s._id,
        total: s.total,
        count: s.count,
      })),
      recentOrders,
      recentProducts,
      lowStock,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
