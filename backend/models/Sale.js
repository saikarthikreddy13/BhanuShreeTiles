const mongoose = require('mongoose');

const SaleItemSchema = new mongoose.Schema(
	{
		product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
		quantity: { type: Number, required: true, min: 1 },
		price: { type: Number, required: true, min: 0 },
		gstRate: { type: Number, default: 0, min: 0 },
		discount: { type: Number, default: 0, min: 0 },
		amount: { type: Number, required: true, min: 0 },
	},
	{ _id: false }
);

const SaleSchema = new mongoose.Schema(
	{
		invoiceNumber: { type: String, required: true, unique: true },
		customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
		billDate: { type: Date, default: Date.now },
		items: { type: [SaleItemSchema], default: [] },
		subtotal: { type: Number, required: true, default: 0 },
		gstTotal: { type: Number, required: true, default: 0 },
		discountTotal: { type: Number, required: true, default: 0 },
		grandTotal: { type: Number, required: true, default: 0 },
		paymentMode: { type: String, default: 'cash' },
		paymentStatus: { type: String, enum: ['paid', 'pending', 'partial'], default: 'paid' },
		notes: { type: String, default: '' },
		createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
	},
	{ timestamps: true }
);

module.exports = mongoose.model('Sale', SaleSchema);

