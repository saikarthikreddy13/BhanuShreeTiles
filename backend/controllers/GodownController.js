const Godown = require('../models/Godown');
const Stock = require('../models/Stock');
const Product = require('../models/Product');

exports.list = async (req, res) => {
	try {
		const godowns = await Godown.find().sort({ createdAt: -1 });
		res.json(godowns);
	} catch (err) {
		res.status(500).json({ msg: 'Failed to fetch godowns' });
	}
};

exports.getOne = async (req, res) => {
	try {
		const godown = await Godown.findById(req.params.id);
		if (!godown) return res.status(404).json({ msg: 'Godown not found' });
		res.json(godown);
	} catch (err) {
		res.status(500).json({ msg: 'Failed to fetch godown' });
	}
};

exports.create = async (req, res) => {
	try {
		const godown = await Godown.create(req.body);
		res.status(201).json(godown);
	} catch (err) {
		res.status(400).json({ msg: err.message });
	}
};

exports.update = async (req, res) => {
	try {
		const godown = await Godown.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
		if (!godown) return res.status(404).json({ msg: 'Godown not found' });
		res.json(godown);
	} catch (err) {
		res.status(400).json({ msg: err.message });
	}
};

exports.remove = async (req, res) => {
	try {
		const godown = await Godown.findByIdAndDelete(req.params.id);
		if (!godown) return res.status(404).json({ msg: 'Godown not found' });
		res.json({ msg: 'Godown deleted' });
	} catch (err) {
		res.status(500).json({ msg: 'Failed to delete godown' });
	}
};

exports.transferStock = async (req, res) => {
	try {
		const { product, fromGodownName, toGodownName, quantity, fromRackNumber = '', toRackNumber = '' } = req.body;
		const transferQty = Number(quantity || 0);
		if (!product || !fromGodownName || !toGodownName || transferQty <= 0) {
			return res.status(400).json({ msg: 'Missing transfer fields' });
		}

		const fromStock = await Stock.findOne({ product, godownName: fromGodownName });
		if (!fromStock || fromStock.quantity < transferQty) {
			return res.status(400).json({ msg: 'Insufficient stock in source godown' });
		}

		fromStock.quantity -= transferQty;
		await fromStock.save();

		const toStock = await Stock.findOneAndUpdate(
			{ product, godownName: toGodownName },
			{ $inc: { quantity: transferQty }, rackNumber: toRackNumber },
			{ new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
		);

		const productDoc = await Product.findById(product);
		if (productDoc) {
			const totalStock = await Stock.aggregate([
				{ $match: { product: productDoc._id } },
				{ $group: { _id: null, total: { $sum: '$quantity' } } },
			]);
			await Product.findByIdAndUpdate(productDoc._id, { stock: totalStock[0]?.total || 0 });
		}

		res.json({ msg: 'Stock transferred', fromStock, toStock });
	} catch (err) {
		res.status(400).json({ msg: err.message });
	}
};

exports.markDamage = async (req, res) => {
	try {
		const { product, godownName, quantity, rackNumber = '' } = req.body;
		const damageQty = Number(quantity || 0);
		if (!product || !godownName || damageQty <= 0) {
			return res.status(400).json({ msg: 'Missing damage fields' });
		}

		const stock = await Stock.findOne({ product, godownName });
		if (!stock || stock.quantity < damageQty) {
			return res.status(400).json({ msg: 'Insufficient stock to mark as damaged' });
		}

		stock.quantity -= damageQty;
		stock.damageQuantity += damageQty;
		if (rackNumber) stock.rackNumber = rackNumber;
		await stock.save();

		const totalStock = await Stock.aggregate([
			{ $match: { product: stock.product } },
			{ $group: { _id: null, total: { $sum: '$quantity' } } },
		]);
		await Product.findByIdAndUpdate(stock.product, { stock: totalStock[0]?.total || 0 });

		res.json({ msg: 'Damage recorded', stock });
	} catch (err) {
		res.status(400).json({ msg: err.message });
	}
};

exports.lowStock = async (req, res) => {
	try {
		const stockRows = await Stock.find().populate('product');
		const lowStock = stockRows.filter((row) => {
			const threshold = row.product?.lowStockThreshold ?? 10;
			return row.quantity <= threshold;
		});
		res.json(lowStock);
	} catch (err) {
		res.status(500).json({ msg: 'Failed to fetch low stock list' });
	}
};
