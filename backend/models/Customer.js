const mongoose = require('mongoose');

const CustomerSchema = new mongoose.Schema(
	{
		name: { type: String, required: true, trim: true },
		phone: { type: String, required: true, trim: true },
		email: { type: String, trim: true, lowercase: true, default: '' },
		gstNumber: { type: String, trim: true, default: '' },
		address: { type: String, default: '' },
		city: { type: String, default: '' },
		outstandingBalance: { type: Number, default: 0, min: 0 },
		notes: { type: String, default: '' },
	},
	{ timestamps: true }
);

module.exports = mongoose.model('Customer', CustomerSchema);

