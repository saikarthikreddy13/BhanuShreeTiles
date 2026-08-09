const Category = require('../models/Category');

const slugify = (value) =>
	String(value || '')
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');

exports.list = async (req, res) => {
	try {
		const categories = await Category.find().sort({ createdAt: -1 });
		res.json(categories);
	} catch (err) {
		res.status(500).json({ msg: 'Failed to fetch categories' });
	}
};

exports.getOne = async (req, res) => {
	try {
		const category = await Category.findById(req.params.id);
		if (!category) return res.status(404).json({ msg: 'Category not found' });
		res.json(category);
	} catch (err) {
		res.status(500).json({ msg: 'Failed to fetch category' });
	}
};

exports.create = async (req, res) => {
	try {
		const payload = { ...req.body };
		if (!payload.slug && payload.name) payload.slug = slugify(payload.name);
		const category = await Category.create(payload);
		res.status(201).json(category);
	} catch (err) {
		res.status(400).json({ msg: err.message });
	}
};

exports.update = async (req, res) => {
	try {
		const payload = { ...req.body };
		if (payload.name && !payload.slug) payload.slug = slugify(payload.name);
		const category = await Category.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true });
		if (!category) return res.status(404).json({ msg: 'Category not found' });
		res.json(category);
	} catch (err) {
		res.status(400).json({ msg: err.message });
	}
};

exports.remove = async (req, res) => {
	try {
		const category = await Category.findByIdAndDelete(req.params.id);
		if (!category) return res.status(404).json({ msg: 'Category not found' });
		res.json({ msg: 'Category deleted' });
	} catch (err) {
		res.status(500).json({ msg: 'Failed to delete category' });
	}
};
