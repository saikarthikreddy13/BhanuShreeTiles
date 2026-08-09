const Employee = require('../models/Employee');

const toNumber = (value, fallback = 0) => {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
};

exports.list = async (req, res) => {
	try {
		const employees = await Employee.find().sort({ createdAt: -1 });
		res.json(employees);
	} catch (err) {
		res.status(500).json({ msg: 'Failed to fetch employees' });
	}
};

exports.getOne = async (req, res) => {
	try {
		const employee = await Employee.findById(req.params.id);
		if (!employee) return res.status(404).json({ msg: 'Employee not found' });
		res.json(employee);
	} catch (err) {
		res.status(500).json({ msg: 'Failed to fetch employee' });
	}
};

exports.create = async (req, res) => {
	try {
		const payload = { ...req.body, salary: toNumber(req.body.salary) };
		const employee = await Employee.create(payload);
		res.status(201).json(employee);
	} catch (err) {
		res.status(400).json({ msg: err.message });
	}
};

exports.update = async (req, res) => {
	try {
		const payload = { ...req.body };
		if (req.body.salary !== undefined) payload.salary = toNumber(req.body.salary);
		const employee = await Employee.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true });
		if (!employee) return res.status(404).json({ msg: 'Employee not found' });
		res.json(employee);
	} catch (err) {
		res.status(400).json({ msg: err.message });
	}
};

exports.remove = async (req, res) => {
	try {
		const employee = await Employee.findByIdAndDelete(req.params.id);
		if (!employee) return res.status(404).json({ msg: 'Employee not found' });
		res.json({ msg: 'Employee deleted' });
	} catch (err) {
		res.status(500).json({ msg: 'Failed to delete employee' });
	}
};
