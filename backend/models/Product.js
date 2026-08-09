const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema(
	{
		sku: { type: String, unique: true, sparse: true, trim: true },
		name: { type: String, required: true, trim: true },
		category: { type: String, required: true, trim: true },
		brand: { type: String, trim: true, default: '' },
		finish: { type: String, trim: true, default: '' },
		size: { type: String, trim: true, default: '' },
		color: { type: String, trim: true, default: '' },
		thickness: { type: String, trim: true, default: '' },
		price: { type: Number, required: true, min: 0 },
		mrp: { type: Number, min: 0, default: 0 },
		gstRate: { type: Number, min: 0, default: 0 },
		unit: { type: String, default: 'box' },
		stock: { type: Number, default: 0, min: 0 },
		lowStockThreshold: { type: Number, default: 10, min: 0 },
		description: { type: String, default: '' },
		images: [{ type: String }],
		barcode: { type: String, default: '' },
		qrCode: { type: String, default: '' },
		isActive: { type: Boolean, default: true },
	},
	{ timestamps: true }
);

module.exports = mongoose.model('Product', ProductSchema);

