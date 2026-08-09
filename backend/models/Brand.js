const mongoose = require('mongoose');

const BrandSchema = new mongoose.Schema(
	{
		name: { type: String, required: true, unique: true, trim: true },
		slug: { type: String, unique: true, sparse: true, trim: true },
		logoUrl: { type: String, default: '' },
		description: { type: String, default: '' },
		isActive: { type: Boolean, default: true },
	},
	{ timestamps: true }
);

module.exports = mongoose.model('Brand', BrandSchema);
