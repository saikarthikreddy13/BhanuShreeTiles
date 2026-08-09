const Supplier = require('../models/Supplier');

exports.list = async (req, res) => {
	try {
		const suppliers = await Supplier.find().sort({ createdAt: -1 });
		res.json(suppliers);
	} catch (err) {
		res.status(500).json({ msg: 'Failed to fetch suppliers' });
	}
};

exports.getOne = async (req, res) => {
	try {
		const supplier = await Supplier.findById(req.params.id);
		if (!supplier) return res.status(404).json({ msg: 'Supplier not found' });
		res.json(supplier);
	} catch (err) {
		res.status(500).json({ msg: 'Failed to fetch supplier' });
	}
};

exports.create = async (req, res) => {
	try {
		const supplier = await Supplier.create(req.body);
		res.status(201).json(supplier);
	} catch (err) {
		res.status(400).json({ msg: err.message });
	}
};

exports.update = async (req, res) => {
	try {
		const supplier = await Supplier.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
		if (!supplier) return res.status(404).json({ msg: 'Supplier not found' });
		res.json(supplier);
	} catch (err) {
		res.status(400).json({ msg: err.message });
	}
};

exports.remove = async (req, res) => {
	try {
		const supplier = await Supplier.findByIdAndDelete(req.params.id);
		if (!supplier) return res.status(404).json({ msg: 'Supplier not found' });
		res.json({ msg: 'Supplier deleted' });
	} catch (err) {
		res.status(500).json({ msg: 'Failed to delete supplier' });
	}
};

