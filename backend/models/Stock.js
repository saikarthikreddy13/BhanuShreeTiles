const mongoose = require('mongoose');

const StockSchema = new mongoose.Schema(
	{
		product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
		godownName: { type: String, required: true, trim: true },
		rackNumber: { type: String, default: '' },
		quantity: { type: Number, default: 0, min: 0 },
		damageQuantity: { type: Number, default: 0, min: 0 },
		reservedQuantity: { type: Number, default: 0, min: 0 },
	},
	{ timestamps: true }
);

StockSchema.index({ product: 1, godownName: 1 }, { unique: true });

module.exports = mongoose.model('Stock', StockSchema);

