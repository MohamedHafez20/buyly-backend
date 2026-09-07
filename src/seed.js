import "dotenv/config";
import bcrypt from "bcryptjs";
import connectDB from "./config/db.js";
import mongoose from "mongoose";
import Category from "./models/Category.js";
import Product from "./models/Product.js";
import User from "./models/User.js";
import Order from "./models/Order.js";
import Settings from "./models/Settings.js";
import Country from "./models/Country.js";
import Coupon from "./models/Coupon.js";
import Review from "./models/Review.js";
import AnnouncementBar from "./models/AnnouncementBar.js";
import { recalcProductRating } from "./controllers/reviewController.js";
import { slugify } from "./utils/slugify.js";

// ---- Categories (mirrors the original frontend catalog) ----
const categories = [
  { name: "Short Sleeves", icon: "shirt", description: "Lightweight & breathable training tees", image: "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?q=80&w=500&auto=format&fit=crop" },
  { name: "Long Sleeves", icon: "shirt", description: "Premium hoodies, pullovers & layers", image: "https://images.unsplash.com/photo-1556821840-3a63f95609a7?q=80&w=500&auto=format&fit=crop" },
  { name: "Sweatpants", icon: "layers", description: "Tapered joggers & everyday sweats", image: "https://images.unsplash.com/photo-1551854838-212c50b4c184?q=80&w=500&auto=format&fit=crop" },
  { name: "Jackets", icon: "wind", description: "All-weather jackets & windbreakers", image: "https://images.unsplash.com/photo-1544441893-675973e31985?q=80&w=500&auto=format&fit=crop" },
  { name: "Footwear", icon: "footprints", description: "Engineered running shoes & trainers", image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?q=80&w=500&auto=format&fit=crop" },
  { name: "Accessories", icon: "watch", description: "Essential training bags & caps", image: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?q=80&w=500&auto=format&fit=crop" },
];

// ---- Products (category referenced by name, resolved after insert) ----
const products = [
  { name: "AeroDry Performance Tee", category: "Short Sleeves", price: 38, oldPrice: 48, rating: 4.8, reviews: 342, badge: "Best Seller", brand: "Aero", stock: 40, description: "A lightweight training t-shirt built with moisture-wicking technology and mesh ventilation panels to keep you dry and comfortable during your most intense workouts.", features: ["Moisture-wicking AeroDry fabric", "Anti-odor treatment", "Flatlock stitching to reduce chafing", "Athletic fit"], images: ["https://images.unsplash.com/photo-1521572267360-ee0c2909d518?q=80&w=800&auto=format&fit=crop", "https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?q=80&w=800&auto=format&fit=crop"], colors: ["Jet Black", "Pure White", "Slate Blue"], sizes: ["S", "M", "L", "XL"] },
  { name: "Evolve Oversized Tee", category: "Short Sleeves", price: 42, rating: 4.6, reviews: 184, badge: "New", brand: "Evolve", stock: 40, description: "Designed with an oversized streetwear silhouette and heavy-weight organic cotton, this tee offers ultimate versatility from workout to rest day.", features: ["100% heavyweight organic cotton", "Drop shoulder details", "Ribbed high-neck collar", "Breathable relaxed fit"], images: ["https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?q=80&w=800&auto=format&fit=crop", "https://images.unsplash.com/photo-1503341455253-b264120f9017?q=80&w=800&auto=format&fit=crop"], colors: ["Oatmeal", "Washed Olive", "Vintage Black"], sizes: ["XS", "S", "M", "L", "XL"] },
  { name: "Apex Seamless Tee", category: "Short Sleeves", price: 45, oldPrice: 55, rating: 4.7, reviews: 288, badge: "Hot", brand: "Apex", stock: 40, description: "Engineered with a seamless knit body to eliminate irritation, the Apex Tee moves with you. Targeted knit zones map your body for active heat zoning.", features: ["Fully seamless construction", "Zoned body-mapping breathability", "4-way premium stretch", "Silver-ion anti-bacterial tech"], images: ["https://images.unsplash.com/photo-1581655353564-df123a1eb820?q=80&w=800&auto=format&fit=crop", "https://images.unsplash.com/photo-1578587018452-892bacefd3f2?q=80&w=800&auto=format&fit=crop"], colors: ["Charcoal Gray", "Royal Blue", "Sage Green"], sizes: ["S", "M", "L", "XL"] },
  { name: "Core Cotton Essential Tee", category: "Short Sleeves", price: 28, rating: 4.4, reviews: 95, brand: "Core", stock: 40, description: "An everyday workout wardrobe essential. Made from ultra-soft ringspun cotton-poly blend that retains shape and comfort washed after washed.", features: ["Premium cotton-poly blend", "Reinforced neck seams", "Pre-shrunk fabric finish", "Standard classic fit"], images: ["https://images.unsplash.com/photo-1562157873-818bc0726f68?q=80&w=800&auto=format&fit=crop", "https://images.unsplash.com/photo-1576566588028-4147f3842f27?q=80&w=800&auto=format&fit=crop"], colors: ["Heather Gray", "Pure White", "Navy Blue"], sizes: ["S", "M", "L", "XL", "XXL"] },
  { name: "Pursuit Pullover Hoodie", category: "Long Sleeves", price: 68, oldPrice: 85, rating: 4.9, reviews: 524, badge: "Best Seller", brand: "Aero", stock: 40, description: "Crafted with premium double-knit fleece, the Pursuit Hoodie delivers lightweight warmth and sleek style. Featuring hidden secure zip pockets for convenience.", features: ["Double-knit breathable fleece", "Sleek crossover hood design", "Hidden secure zipper pocket", "Ribbed cuffs with thumbholes"], images: ["https://images.unsplash.com/photo-1556821840-3a63f95609a7?q=80&w=800&auto=format&fit=crop", "https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?q=80&w=800&auto=format&fit=crop"], colors: ["Carbon Black", "Dusty Rose", "Bone White"], sizes: ["S", "M", "L", "XL"] },
  { name: "Seamless Active Long Sleeve", category: "Long Sleeves", price: 48, rating: 4.5, reviews: 112, brand: "Evolve", stock: 40, description: "Form-fitting, supportive, and sweat-wicking. This seamless long sleeve crop is designed with textured contour lines to flatter your physique while you train.", features: ["Tight supportive form-fit", "Contouring knit details", "Thumbholes at cuffs", "Breathable open-back detailing"], images: ["https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?q=80&w=800&auto=format&fit=crop", "https://images.unsplash.com/photo-1548624149-f9b1859aa7d0?q=80&w=800&auto=format&fit=crop"], colors: ["Plum Red", "Sage Green", "Carbon Black"], sizes: ["XS", "S", "M", "L"] },
  { name: "Element Quarter-Zip Pullover", category: "Long Sleeves", price: 58, rating: 4.7, reviews: 215, badge: "New", brand: "Apex", stock: 40, description: "The ideal layering piece for early morning runs or cold gym commutes. Features a stand-up collar, wind-resistant chest panel, and reflective accents.", features: ["Thermal loopback lining", "Wind-resistant front panels", "Reflective branding details", "Chin guard at zipper top"], images: ["https://images.unsplash.com/photo-1543163521-1bf539c55dd2?q=80&w=800&auto=format&fit=crop", "https://images.unsplash.com/photo-1517841905240-472988babdf9?q=80&w=800&auto=format&fit=crop"], colors: ["Cobalt Blue", "Off White", "Deep Charcoal"], sizes: ["S", "M", "L", "XL"] },
  { name: "Fleece Training Joggers", category: "Sweatpants", price: 55, oldPrice: 70, rating: 4.8, reviews: 432, badge: "Best Seller", brand: "Aero", stock: 40, description: "Tapered joggers cut from ultra-soft loopback cotton fleece. Featuring deep front pockets, an adjustable internal drawcord, and sleek ankle cuffs.", features: ["Loopback premium cotton fleece", "Modern tapered joggers fit", "Deep side pockets + back zip pocket", "Adjustable flat drawcord"], images: ["https://images.unsplash.com/photo-1551854838-212c50b4c184?q=80&w=800&auto=format&fit=crop", "https://images.unsplash.com/photo-1605518216938-7c31b7b14ad0?q=80&w=800&auto=format&fit=crop"], colors: ["Heather Gray", "Jet Black", "Khaki Sand"], sizes: ["S", "M", "L", "XL"] },
  { name: "Apex Utility Cargo Jogger", category: "Sweatpants", price: 65, rating: 4.4, reviews: 85, brand: "Apex", stock: 40, description: "Fusing street style with athletic performance. Made from stretch water-resistant nylon, featuring tactical zippered cargo pockets.", features: ["Stretch water-resistant nylon fabric", "Sleek zip utility pockets", "Elastic waistband and ankle cuffs", "Durable build"], images: ["https://images.unsplash.com/photo-1580906853634-11a7354039c1?q=80&w=800&auto=format&fit=crop", "https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?q=80&w=800&auto=format&fit=crop"], colors: ["Military Olive", "Carbon Black", "Steel Gray"], sizes: ["S", "M", "L", "XL"] },
  { name: "RestDay Heavyweight Sweatpants", category: "Sweatpants", price: 50, rating: 4.6, reviews: 154, badge: "New", brand: "Core", stock: 40, description: "Unmatched comfort in an oversized drape. Built with thick organic cotton for lounging or training in cold climates.", features: ["450gsm heavyweight organic cotton", "Thick elasticated waistband", "Relaxed oversized aesthetic", "Brushed fleece interior"], images: ["https://images.unsplash.com/photo-1620799139507-2a76f79a2f4d?q=80&w=800&auto=format&fit=crop", "https://images.unsplash.com/photo-1620799140188-3b2a02fd9a77?q=80&w=800&auto=format&fit=crop"], colors: ["Oatmeal Speckle", "Midnight Black", "Washed Sage"], sizes: ["S", "M", "L", "XL"] },
  { name: "Repel Lightweight Windbreaker", category: "Jackets", price: 85, oldPrice: 110, rating: 4.7, reviews: 312, badge: "Hot", brand: "Apex", stock: 40, description: "A featherlight, highly packable outer layer designed to shield you from the wind and rain. Features a storm hood, water-repellent finish, and active ventilation.", features: ["Durable water repellent (DWR) coating", "Highly packable into own chest pocket", "Adjustable cinch cord storm hood", "Underarm mesh breathable vents"], images: ["https://images.unsplash.com/photo-1544441893-675973e31985?q=80&w=800&auto=format&fit=crop", "https://images.unsplash.com/photo-1548883354-7622d03aca27?q=80&w=800&auto=format&fit=crop"], colors: ["Slate Blue", "Charcoal Black", "Volt Green"], sizes: ["S", "M", "L", "XL"] },
  { name: "Sherpa Thermal Zip Jacket", category: "Jackets", price: 95, rating: 4.8, reviews: 142, badge: "Best Seller", brand: "Core", stock: 40, description: "Made with soft thick sherpa fleece to trap heat. Features high-quality nylon panels at the collar and chest pocket for extra durability and modern contrast.", features: ["High-pile insulating sherpa fleece", "Contrast nylon panels + chest zip pocket", "Thick premium zippers", "Elbow reinforcements"], images: ["https://images.unsplash.com/photo-1608256246200-53e635b5b65f?q=80&w=800&auto=format&fit=crop", "https://images.unsplash.com/photo-1608256246067-1755dc0a7fa0?q=80&w=800&auto=format&fit=crop"], colors: ["Cream Beige", "Olive Gray", "Triple Black"], sizes: ["S", "M", "L", "XL"] },
  { name: "Bolt Carbon Running Shoes", category: "Footwear", price: 140, oldPrice: 180, rating: 4.9, reviews: 754, badge: "Best Seller", brand: "Kinetic", stock: 40, description: "Engineered for your fastest runs. The Bolt Carbon features a full-length carbon fiber propulsion plate sandwiched in high-rebound nitrogen-infused foam.", features: ["Full-length carbon fiber plate", "Nitrogen-infused foam cushioning", "Breathable engineered mesh upper", "High-abrasion rubber outsole"], images: ["https://images.unsplash.com/photo-1542291026-7eec264c27ff?q=80&w=800&auto=format&fit=crop", "https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?q=80&w=800&auto=format&fit=crop"], colors: ["Neon Crimson", "White Platinum", "Stealth Black"], sizes: ["8", "9", "10", "11", "12"] },
  { name: "Evolve Studio Trainer", category: "Footwear", price: 110, rating: 4.6, reviews: 292, badge: "New", brand: "Evolve", stock: 40, description: "A versatile studio shoe built for functional fitness. A flat, stable heel provides support for squats and lifts, while a flexible forefoot allows dynamic movement.", features: ["Low-profile stable heel structure", "Side wraps for lateral stability", "Knitted sock-like slip-on cuff", "Lightweight responsive cushion"], images: ["https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?q=80&w=800&auto=format&fit=crop", "https://images.unsplash.com/photo-1600185365926-3a2ce3cdb9eb?q=80&w=800&auto=format&fit=crop"], colors: ["Pastel Pink", "White Silver", "Slate Dark"], sizes: ["6", "7", "8", "9", "10"] },
  { name: "Apex Gym Duffle Bag", category: "Accessories", price: 48, oldPrice: 60, rating: 4.8, reviews: 362, badge: "Best Seller", brand: "Apex", stock: 40, description: "The ultimate training duffle. Features a dedicated ventilated shoe compartment, a waterproof wet-dry pouch, and a padded sleeve for your tech.", features: ["Ventilated shoe pocket", "Waterproof wet/dry bag", '15" padded laptop sleeve', "Durable water-resistant base"], images: ["https://images.unsplash.com/photo-1553062407-98eeb64c6a62?q=80&w=800&auto=format&fit=crop", "https://images.unsplash.com/photo-1622560480605-d83c853bc5c3?q=80&w=800&auto=format&fit=crop"], colors: ["Black Out", "Slate Gray", "Forest Green"], sizes: ["One Size"] },
  { name: "Core Athlete Cap", category: "Accessories", price: 22, rating: 4.5, reviews: 116, brand: "Core", stock: 40, description: "Keep the sun out of your eyes and focus on your form. This lightweight cap features sweat-wicking materials and perforated side panels for maximum airflow.", features: ["Sweat-wicking performance fabrics", "Perforated laser-cut vent panels", "Adjustable low-profile strap clasp", "Anti-glare under-bill design"], images: ["https://images.unsplash.com/photo-1588850561407-ed78c282e89b?q=80&w=800&auto=format&fit=crop", "https://images.unsplash.com/photo-1534215754734-18e55d13ce35?q=80&w=800&auto=format&fit=crop"], colors: ["Triple Black", "Classic White", "Sage Green"], sizes: ["One Size"] },
];

// Merchandising gender per product (by name). Anything not listed falls back to
// "unisex". Gives a realistic spread across the MEN / WOMEN / ALL storefront tabs.
const genderByName = {
  "AeroDry Performance Tee": "men",
  "Evolve Oversized Tee": "unisex",
  "Apex Seamless Tee": "men",
  "Core Cotton Essential Tee": "unisex",
  "Pursuit Pullover Hoodie": "women",
  "Seamless Active Long Sleeve": "women",
  "Element Quarter-Zip Pullover": "men",
  "Fleece Training Joggers": "unisex",
  "Apex Utility Cargo Jogger": "men",
  "RestDay Heavyweight Sweatpants": "unisex",
  "Repel Lightweight Windbreaker": "men",
  "Sherpa Thermal Zip Jacket": "unisex",
  "Bolt Carbon Running Shoes": "men",
  "Evolve Studio Trainer": "women",
  "Apex Gym Duffle Bag": "unisex",
  "Core Athlete Cap": "unisex",
};

const users = [
  { name: "Admin", email: "admin@buyly.com", password: "admin123", role: "admin" },
  { name: "Demo Shopper", email: "user@buyly.com", password: "user123", role: "user" },
];

const run = async () => {
  await connectDB();

  console.log("Clearing existing catalog...");
  await Promise.all([
    Product.deleteMany({}),
    Category.deleteMany({}),
    Order.deleteMany({}),
    User.deleteMany({ email: { $in: users.map((u) => u.email) } }),
  ]);

  console.log("Seeding categories...");
  const catDocs = await Category.insertMany(
    categories.map((c) => ({ ...c, slug: slugify(c.name), status: "active" }))
  );
  const catByName = new Map(catDocs.map((c) => [c.name, c._id]));

  console.log("Seeding products...");
  // Ratings/review counts are derived from real Review documents below, not
  // from static seed values.
  const productDocs = await Product.insertMany(
    products.map((p) => ({
      ...p,
      rating: 0,
      reviews: 0,
      category: catByName.get(p.category),
      slug: slugify(p.name),
      image: p.images?.[0] || "",
      status: "active",
      gender: genderByName[p.name] || "unisex",
    }))
  );

  console.log("Seeding users...");
  for (const u of users) {
    const hashed = await bcrypt.hash(u.password, 10);
    await User.create({ ...u, password: hashed });
  }

  console.log("Seeding reviewers and reviews...");
  await Review.deleteMany({});
  const reviewerData = [
    { name: "Jordan Ellis", email: "jordan@example.com" },
    { name: "Priya Nair", email: "priya@example.com" },
    { name: "Marcus Lee", email: "marcus@example.com" },
    { name: "Sofia Alvarez", email: "sofia@example.com" },
  ];
  await User.deleteMany({ email: { $in: reviewerData.map((r) => r.email) } });
  const reviewers = [];
  for (const r of reviewerData) {
    const hashed = await bcrypt.hash("password123", 10);
    reviewers.push(await User.create({ ...r, password: hashed, role: "user" }));
  }

  const comments = [
    "Excellent quality and fits perfectly. Highly recommend!",
    "Great value for the price. Would buy again.",
    "Comfortable and well made, though delivery took a few days.",
    "Exactly as described. Very happy with this purchase.",
    "Solid product but sizing runs a little small.",
    "Love it — became my go-to right away.",
  ];
  let reviewCount = 0;
  for (const product of productDocs) {
    // 2-4 distinct reviewers per product.
    const howMany = 2 + Math.floor(Math.random() * 3);
    const chosen = [...reviewers].sort(() => Math.random() - 0.5).slice(0, howMany);
    for (const reviewer of chosen) {
      await Review.create({
        product: product._id,
        user: reviewer._id,
        name: reviewer.name,
        rating: 3 + Math.floor(Math.random() * 3), // 3-5 stars
        comment: comments[Math.floor(Math.random() * comments.length)],
      });
      reviewCount += 1;
    }
    await recalcProductRating(product._id);
  }

  console.log("Seeding store settings...");
  await Settings.deleteMany({});
  await Settings.create({
    key: "store",
    storeName: "Buyly",
    currency: "USD",
    freeShippingThreshold: 75,
    shippingFlatRate: 6.99,
    taxRatePercent: 8,
    paymentMethods: [
      { key: "card", label: "Credit Card", enabled: true },
      { key: "paypal", label: "PayPal", enabled: true },
      { key: "cod", label: "Cash on Delivery", enabled: true },
    ],
  });

  console.log("Seeding countries...");
  await Country.deleteMany({});
  await Country.insertMany([
    { name: "United States", code: "US", enabled: true, order: 1 },
    { name: "Canada", code: "CA", enabled: true, order: 2 },
    { name: "United Kingdom", code: "GB", enabled: true, order: 3 },
    { name: "Australia", code: "AU", enabled: true, order: 4 },
    { name: "Germany", code: "DE", enabled: true, order: 5 },
  ]);

  console.log("Seeding coupons...");
  await Coupon.deleteMany({});
  await Coupon.insertMany([
    { code: "WELCOME10", type: "percent", value: 10, active: true, minSubtotal: 0 },
    { code: "SAVE20", type: "fixed", value: 20, active: true, minSubtotal: 100 },
  ]);

  console.log("Seeding announcement bars...");
  await AnnouncementBar.deleteMany({});
  await AnnouncementBar.insertMany([
    {
      message: "Free shipping on orders over $75",
      icon: "🚚",
      backgroundType: "solid",
      backgroundColor: "#111111",
      textColor: "#ffffff",
      accentColor: "#facc15",
      fontFamily: "system",
      fontSize: "sm",
      fontWeight: "bold",
      textTransform: "uppercase",
      letterSpacing: 1,
      textAlign: "center",
      paddingY: 10,
      dismissible: true,
      animation: "fade",
      sortOrder: 0,
    },
    {
      message: "Use code WELCOME10 for 10% off your first order",
      promoCode: "WELCOME10",
      linkUrl: "/shop",
      linkText: "Shop Now",
      icon: "🎉",
      backgroundType: "gradient",
      backgroundColor: "linear-gradient(90deg,#6d28d9,#db2777)",
      textColor: "#ffffff",
      accentColor: "#fde047",
      fontFamily: "rounded",
      fontSize: "sm",
      fontWeight: "medium",
      textTransform: "none",
      letterSpacing: 0,
      textAlign: "center",
      paddingY: 10,
      borderRadius: 0,
      dismissible: true,
      animation: "slide-in",
      autoRotateSeconds: 6,
      sortOrder: 1,
    },
  ]);

  console.log("\nSeed complete:");
  console.log(`  ${catDocs.length} categories`);
  console.log(`  ${products.length} products`);
  console.log(`  ${users.length} users`);
  console.log(`  ${reviewCount} reviews (from ${reviewers.length} reviewers)`);
  console.log("\nLogin credentials:");
  console.log("  Admin  ->  admin@buyly.com / admin123");
  console.log("  User   ->  user@buyly.com  / user123");

  await mongoose.disconnect();
  process.exit(0);
};

run().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
