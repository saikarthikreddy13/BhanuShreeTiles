const Product = require('../models/Product');

const toNumber = (value, fallback = 0) => {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
};

exports.list = async (req, res) => {
	try {
		const { q = '', category = '', brand = '' } = req.query;
		const filter = {};
		if (q) {
			filter.$or = [
				{ name: { $regex: q, $options: 'i' } },
				{ sku: { $regex: q, $options: 'i' } },
				{ category: { $regex: q, $options: 'i' } },
			];
		}
		if (category) filter.category = category;
		if (brand) filter.brand = brand;
		const products = await Product.find(filter).sort({ createdAt: -1 });
		res.json(products);
	} catch (err) {
		res.status(500).json({ msg: 'Failed to fetch products' });
	}
};

exports.getOne = async (req, res) => {
	try {
		const product = await Product.findById(req.params.id);
		if (!product) return res.status(404).json({ msg: 'Product not found' });
		res.json(product);
	} catch (err) {
		res.status(500).json({ msg: 'Failed to fetch product' });
	}
};

exports.create = async (req, res) => {
	try {
		const payload = {
			...req.body,
			price: toNumber(req.body.price),
			mrp: toNumber(req.body.mrp),
			gstRate: toNumber(req.body.gstRate),
			stock: toNumber(req.body.stock),
			lowStockThreshold: toNumber(req.body.lowStockThreshold, 10),
		};
		const product = await Product.create(payload);
		res.status(201).json(product);
	} catch (err) {
		res.status(400).json({ msg: err.message });
	}
};

exports.update = async (req, res) => {
	try {
		const payload = {
			...req.body,
			price: req.body.price !== undefined ? toNumber(req.body.price) : undefined,
			mrp: req.body.mrp !== undefined ? toNumber(req.body.mrp) : undefined,
			gstRate: req.body.gstRate !== undefined ? toNumber(req.body.gstRate) : undefined,
			stock: req.body.stock !== undefined ? toNumber(req.body.stock) : undefined,
			lowStockThreshold: req.body.lowStockThreshold !== undefined ? toNumber(req.body.lowStockThreshold, 10) : undefined,
		};
		Object.keys(payload).forEach((key) => payload[key] === undefined && delete payload[key]);
		const product = await Product.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true });
		if (!product) return res.status(404).json({ msg: 'Product not found' });
		res.json(product);
	} catch (err) {
		res.status(400).json({ msg: err.message });
	}
};

exports.remove = async (req, res) => {
	try {
		const product = await Product.findByIdAndDelete(req.params.id);
		if (!product) return res.status(404).json({ msg: 'Product not found' });
		res.json({ msg: 'Product deleted' });
	} catch (err) {
		res.status(500).json({ msg: 'Failed to delete product' });
	}
};

