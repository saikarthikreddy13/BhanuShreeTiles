const mongoose = require('mongoose');

const SettingSchema = new mongoose.Schema(
	{
		companyName: { type: String, default: 'Bhanu Shree Tiles & Taps' },
		tagline: { type: String, default: '' },
		gstNumber: { type: String, default: '' },
		phone: { type: String, default: '' },
		email: { type: String, default: '', lowercase: true, trim: true },
		address: { type: String, default: '' },
		bankName: { type: String, default: '' },
		accountNumber: { type: String, default: '' },
		ifscCode: { type: String, default: '' },
		logoUrl: { type: String, default: '' },
		invoicePrefix: { type: String, default: 'BST' },
		invoiceFooter: { type: String, default: '' },
		emailHost: { type: String, default: '' },
		emailPort: { type: Number, default: 587 },
		emailUser: { type: String, default: '' },
		emailPassword: { type: String, default: '' },
		whatsappNumber: { type: String, default: '' },
		updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
	},
	{ timestamps: true }
);

module.exports = mongoose.model('Setting', SettingSchema);
