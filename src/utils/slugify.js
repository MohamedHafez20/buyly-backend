// Turn a display name into a URL-safe slug.
export const slugify = (str = "") =>
  str
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// Generate a slug that is unique within the given Mongoose model.
// Appends -2, -3, ... on collision so we never violate the unique index.
export const uniqueSlug = async (Model, name, excludeId = null) => {
  const base = slugify(name) || "item";
  let slug = base;
  let n = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const query = { slug };
    if (excludeId) query._id = { $ne: excludeId };
    const clash = await Model.findOne(query).select("_id").lean();
    if (!clash) return slug;
    n += 1;
    slug = `${base}-${n}`;
  }
};
