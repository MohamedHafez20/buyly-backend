// POST /api/upload  (admin) — accepts one or more image files under the "images"
// field and returns their public paths. Paths are relative (/uploads/<file>) so
// they stay valid regardless of the host the API is served from; the frontend
// resolves them against the API origin.
export const uploadImages = (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ message: "No image files received" });
  }
  const urls = req.files.map((f) => `/uploads/${f.filename}`);
  res.status(201).json({ urls });
};
