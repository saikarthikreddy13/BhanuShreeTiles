const Stock = require('../models/Stock');

exports.list = async (req, res) => {
	try {
		const stocks = await Stock.find().populate('product').sort({ createdAt: -1 });
		res.json(stocks);
	} catch (err) {
		res.status(500).json({ msg: 'Failed to fetch stock' });
	}
};

exports.upsert = async (req, res) => {
	try {
		const { product, godownName, rackNumber = '', quantity = 0, damageQuantity = 0, reservedQuantity = 0 } = req.body;
		const stock = await Stock.findOneAndUpdate(
			{ product, godownName },
			{ rackNumber, quantity, damageQuantity, reservedQuantity },
			{ new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
		);
		res.status(201).json(stock);
	} catch (err) {
		res.status(400).json({ msg: err.message });
	}
};

exports.remove = async (req, res) => {
	try {
		const stock = await Stock.findByIdAndDelete(req.params.id);
		if (!stock) return res.status(404).json({ msg: 'Stock not found' });
		res.json({ msg: 'Stock deleted' });
	} catch (err) {
		res.status(500).json({ msg: 'Failed to delete stock' });
	}
};

