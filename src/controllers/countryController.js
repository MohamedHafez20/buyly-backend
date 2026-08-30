import Country from "../models/Country.js";

const normalizeRate = (value, label, { max } = {}) => {
  if (value === "" || value === null || value === undefined) return { value: null };
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || (max !== undefined && number > max)) {
    return { error: `${label} must be a valid number${max !== undefined ? ` from 0 to ${max}` : " greater than or equal to 0"}` };
  }
  return { value: number };
};

const normalizeCountryInput = (body, { partial = false } = {}) => {
  const data = {};

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return { error: "Country name is required" };
    data.name = name;
  } else if (!partial) {
    return { error: "Country name is required" };
  }

  if (body.code !== undefined) {
    const code = String(body.code).trim().toUpperCase();
    if (code && !/^[A-Z]{2}$/.test(code)) {
      return { error: "Country code must be a valid 2-letter ISO code" };
    }
    data.code = code;
  }

  if (body.enabled !== undefined) data.enabled = Boolean(body.enabled);

  if (body.order !== undefined) {
    const order = Number(body.order);
    if (!Number.isFinite(order)) return { error: "Display order must be a valid number" };
    data.order = order;
  }

  if (body.shippingRate !== undefined) {
    const shippingRate = normalizeRate(body.shippingRate, "Shipping rate");
    if (shippingRate.error) return shippingRate;
    data.shippingRate = shippingRate.value;
  }

  if (body.taxRate !== undefined) {
    const taxRate = normalizeRate(body.taxRate, "Tax rate", { max: 100 });
    if (taxRate.error) return taxRate;
    data.taxRate = taxRate.value;
  }

  return { data };
};

const hasDuplicateCode = async (code, ignoreId) => {
  if (!code) return false;
  const match = await Country.findOne({ code });
  return Boolean(match && match._id.toString() !== String(ignoreId || ""));
};

const view = (c) => ({
  id: c._id,
  name: c.name,
  code: c.code,
  enabled: c.enabled,
  order: c.order,
  shippingRate: c.shippingRate,
  taxRate: c.taxRate,
});

// GET /api/countries  (public) — enabled countries for the checkout form.
export const getCountries = async (req, res) => {
  try {
    const countries = await Country.find({ enabled: true }).sort({ order: 1, name: 1 });
    res.json(countries.map(view));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/admin/countries  (admin) — every country, including disabled.
export const getAllCountries = async (req, res) => {
  try {
    const countries = await Country.find().sort({ order: 1, name: 1 });
    res.json(countries.map(view));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/admin/countries  (admin)
export const createCountry = async (req, res) => {
  try {
    const normalized = normalizeCountryInput(req.body);
    if (normalized.error) {
      return res.status(400).json({ message: normalized.error });
    }
    if (await hasDuplicateCode(normalized.data.code)) {
      return res.status(409).json({ message: "That country code already exists" });
    }
    const country = await Country.create(normalized.data);
    res.status(201).json(view(country));
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: "That country already exists" });
    }
    res.status(400).json({ message: err.message });
  }
};

// PATCH /api/admin/countries/:id  (admin)
export const updateCountry = async (req, res) => {
  try {
    const normalized = normalizeCountryInput(req.body, { partial: true });
    if (normalized.error) {
      return res.status(400).json({ message: normalized.error });
    }
    if (await hasDuplicateCode(normalized.data.code, req.params.id)) {
      return res.status(409).json({ message: "That country code already exists" });
    }
    const country = await Country.findByIdAndUpdate(req.params.id, normalized.data, {
      new: true,
      runValidators: true,
    });
    if (!country) return res.status(404).json({ message: "Country not found" });
    res.json(view(country));
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: "That country already exists" });
    }
    res.status(400).json({ message: err.message });
  }
};

// DELETE /api/admin/countries/:id  (admin)
export const deleteCountry = async (req, res) => {
  try {
    const country = await Country.findByIdAndDelete(req.params.id);
    if (!country) return res.status(404).json({ message: "Country not found" });
    res.json({ message: "Country deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
