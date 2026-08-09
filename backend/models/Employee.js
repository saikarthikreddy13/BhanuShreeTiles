const mongoose = require('mongoose');

const EmployeeSchema = new mongoose.Schema(
	{
		name: { type: String, required: true, trim: true },
		employeeCode: { type: String, required: true, unique: true, trim: true },
		role: { type: String, required: true, trim: true },
		phone: { type: String, default: '' },
		email: { type: String, default: '', lowercase: true, trim: true },
		address: { type: String, default: '' },
		salary: { type: Number, default: 0, min: 0 },
		joinDate: { type: Date, default: Date.now },
		status: { type: String, enum: ['active', 'inactive'], default: 'active' },
		notes: { type: String, default: '' },
	},
	{ timestamps: true }
);

module.exports = mongoose.model('Employee', EmployeeSchema);
