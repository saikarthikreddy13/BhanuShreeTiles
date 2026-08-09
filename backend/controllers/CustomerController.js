const Customer = require('../models/Customer');

exports.list = async (req, res) => {
	try {
		const customers = await Customer.find().sort({ createdAt: -1 });
		res.json(customers);
	} catch (err) {
		res.status(500).json({ msg: 'Failed to fetch customers' });
	}
};

exports.getOne = async (req, res) => {
	try {
		const customer = await Customer.findById(req.params.id);
		if (!customer) return res.status(404).json({ msg: 'Customer not found' });
		res.json(customer);
	} catch (err) {
		res.status(500).json({ msg: 'Failed to fetch customer' });
	}
};

exports.create = async (req, res) => {
	try {
		const customer = await Customer.create(req.body);
		res.status(201).json(customer);
	} catch (err) {
		res.status(400).json({ msg: err.message });
	}
};

exports.update = async (req, res) => {
	try {
		const customer = await Customer.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
		if (!customer) return res.status(404).json({ msg: 'Customer not found' });
		res.json(customer);
	} catch (err) {
		res.status(400).json({ msg: err.message });
	}
};

exports.remove = async (req, res) => {
	try {
		const customer = await Customer.findByIdAndDelete(req.params.id);
		if (!customer) return res.status(404).json({ msg: 'Customer not found' });
		res.json({ msg: 'Customer deleted' });
	} catch (err) {
		res.status(500).json({ msg: 'Failed to delete customer' });
	}
};

