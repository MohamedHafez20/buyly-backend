import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "./config/db.js";
import Product from "./models/Product.js";

// One-off, idempotent backfill: give every product that predates the `gender`
// field a safe default so existing data keeps working. "unisex" means the item
// shows under the ALL tab (and neither the MEN nor WOMEN tab) until an admin
// classifies it. Run with:  node src/migrateGender.js
const run = async () => {
  await connectDB();

  const result = await Product.updateMany(
    { $or: [{ gender: { $exists: false } }, { gender: null }, { gender: "" }] },
    { $set: { gender: "unisex" } }
  );

  const matched = result.matchedCount ?? result.n ?? 0;
  const modified = result.modifiedCount ?? result.nModified ?? 0;
  console.log(
    `Gender backfill complete — ${matched} product(s) needed a default, ${modified} updated to "unisex".`
  );

  await mongoose.disconnect();
  process.exit(0);
};

run().catch((err) => {
  console.error("Gender migration failed:", err);
  process.exit(1);
});
