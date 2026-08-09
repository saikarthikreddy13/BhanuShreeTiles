const mongoose = require('mongoose');

const GodownSchema = new mongoose.Schema(
	{
		name: { type: String, required: true, unique: true, trim: true },
		location: { type: String, default: '' },
		managerName: { type: String, default: '' },
		phone: { type: String, default: '' },
		capacity: { type: Number, default: 0, min: 0 },
		notes: { type: String, default: '' },
		isActive: { type: Boolean, default: true },
	},
	{ timestamps: true }
);

module.exports = mongoose.model('Godown', GodownSchema);
