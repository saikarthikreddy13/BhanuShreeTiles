const mongoose = require('mongoose');

const PurchaseItemSchema = new mongoose.Schema(
	{
		product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
		quantity: { type: Number, required: true, min: 1 },
		price: { type: Number, required: true, min: 0 },
		gstRate: { type: Number, default: 0, min: 0 },
		amount: { type: Number, required: true, min: 0 },
	},
	{ _id: false }
);

const PurchaseSchema = new mongoose.Schema(
	{
		invoiceNumber: { type: String, required: true, unique: true },
		supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
		billDate: { type: Date, default: Date.now },
		items: { type: [PurchaseItemSchema], default: [] },
		subtotal: { type: Number, required: true, default: 0 },
		gstTotal: { type: Number, required: true, default: 0 },
		grandTotal: { type: Number, required: true, default: 0 },
		paymentMode: { type: String, default: 'credit' },
		paymentStatus: { type: String, enum: ['paid', 'pending', 'partial'], default: 'pending' },
		notes: { type: String, default: '' },
		createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
	},
	{ timestamps: true }
);

module.exports = mongoose.model('Purchase', PurchaseSchema);

