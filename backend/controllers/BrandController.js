const Brand = require('../models/Brand');

const slugify = (value) =>
	String(value || '')
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');

exports.list = async (req, res) => {
	try {
		const brands = await Brand.find().sort({ createdAt: -1 });
		res.json(brands);
	} catch (err) {
		res.status(500).json({ msg: 'Failed to fetch brands' });
	}
};

exports.getOne = async (req, res) => {
	try {
		const brand = await Brand.findById(req.params.id);
		if (!brand) return res.status(404).json({ msg: 'Brand not found' });
		res.json(brand);
	} catch (err) {
		res.status(500).json({ msg: 'Failed to fetch brand' });
 	}
};

exports.create = async (req, res) => {
	try {
		const payload = { ...req.body };
		if (!payload.slug && payload.name) payload.slug = slugify(payload.name);
		const brand = await Brand.create(payload);
		res.status(201).json(brand);
	} catch (err) {
		res.status(400).json({ msg: err.message });
	}
};

exports.update = async (req, res) => {
	try {
		const payload = { ...req.body };
		if (payload.name && !payload.slug) payload.slug = slugify(payload.name);
		const brand = await Brand.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true });
		if (!brand) return res.status(404).json({ msg: 'Brand not found' });
		res.json(brand);
	} catch (err) {
		res.status(400).json({ msg: err.message });
	}
};

exports.remove = async (req, res) => {
	try {
		const brand = await Brand.findByIdAndDelete(req.params.id);
		if (!brand) return res.status(404).json({ msg: 'Brand not found' });
		res.json({ msg: 'Brand deleted' });
	} catch (err) {
		res.status(500).json({ msg: 'Failed to delete brand' });
	}
};
