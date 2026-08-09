const PDFDocument = require('pdfkit');
const Purchase = require('../models/Purchase');
const Product = require('../models/Product');
const Stock = require('../models/Stock');
const Supplier = require('../models/Supplier');

const formatNumber = (value) => Number(Number(value || 0).toFixed(2));

const nextInvoiceNumber = async () => {
	const count = await Purchase.countDocuments();
	return `PUR-${String(count + 1).padStart(5, '0')}`;
};

const buildPayload = (body) => {
	const items = (body.items || []).map((item) => {
		const quantity = Number(item.quantity || 0);
		const price = Number(item.price || 0);
		const gstRate = Number(item.gstRate || 0);
		const base = quantity * price;
		const amount = formatNumber(base + (base * gstRate) / 100);
		return {
			product: item.product,
			quantity,
			price,
			gstRate,
			amount,
		};
	});

	const subtotal = formatNumber(items.reduce((sum, item) => sum + item.quantity * item.price, 0));
	const gstTotal = formatNumber(items.reduce((sum, item) => sum + ((item.quantity * item.price) * item.gstRate) / 100, 0));
	const grandTotal = formatNumber(items.reduce((sum, item) => sum + item.amount, 0));

	return {
		supplier: body.supplier,
		billDate: body.billDate || new Date(),
		items,
		subtotal,
		gstTotal,
		grandTotal,
		paymentMode: body.paymentMode || 'credit',
		paymentStatus: body.paymentStatus || 'pending',
		notes: body.notes || '',
	};
};

const updateStockAfterPurchase = async (items) => {
	for (const item of items) {
		const stock = await Stock.findOne({ product: item.product, godownName: 'Main Godown' });
		if (stock) {
			stock.quantity += item.quantity;
			await stock.save();
			await Product.findByIdAndUpdate(item.product, { stock: stock.quantity });
		} else {
			const created = await Stock.create({ product: item.product, godownName: 'Main Godown', quantity: item.quantity });
			await Product.findByIdAndUpdate(item.product, { stock: created.quantity });
		}
	}
};

exports.list = async (req, res) => {
	try {
		const purchases = await Purchase.find().populate('supplier').populate('items.product').sort({ createdAt: -1 });
		res.json(purchases);
	} catch (err) {
		res.status(500).json({ msg: 'Failed to fetch purchases' });
	}
};

exports.getOne = async (req, res) => {
	try {
		const purchase = await Purchase.findById(req.params.id).populate('supplier').populate('items.product');
		if (!purchase) return res.status(404).json({ msg: 'Purchase not found' });
		res.json(purchase);
	} catch (err) {
		res.status(500).json({ msg: 'Failed to fetch purchase' });
	}
};

exports.create = async (req, res) => {
	try {
		const payload = buildPayload(req.body);
		const invoiceNumber = await nextInvoiceNumber();
		await updateStockAfterPurchase(payload.items);
		const purchase = await Purchase.create({ ...payload, invoiceNumber, createdBy: req.user?.id });
		res.status(201).json(purchase);
	} catch (err) {
		res.status(400).json({ msg: err.message });
	}
};

exports.update = async (req, res) => {
	try {
		const existing = await Purchase.findById(req.params.id);
		if (!existing) return res.status(404).json({ msg: 'Purchase not found' });

		for (const item of existing.items) {
			const stock = await Stock.findOne({ product: item.product, godownName: 'Main Godown' });
			if (stock) {
				stock.quantity = Math.max(0, stock.quantity - item.quantity);
				await stock.save();
				await Product.findByIdAndUpdate(item.product, { stock: stock.quantity });
			}
		}

		const payload = buildPayload(req.body);
		await updateStockAfterPurchase(payload.items);
		const purchase = await Purchase.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true });
		res.json(purchase);
	} catch (err) {
		res.status(400).json({ msg: err.message });
	}
};

exports.remove = async (req, res) => {
	try {
		const purchase = await Purchase.findById(req.params.id);
		if (!purchase) return res.status(404).json({ msg: 'Purchase not found' });

		for (const item of purchase.items) {
			const stock = await Stock.findOne({ product: item.product, godownName: 'Main Godown' });
			if (stock) {
				stock.quantity = Math.max(0, stock.quantity - item.quantity);
				await stock.save();
				await Product.findByIdAndUpdate(item.product, { stock: stock.quantity });
			}
		}

		await Purchase.findByIdAndDelete(req.params.id);
		res.json({ msg: 'Purchase deleted' });
	} catch (err) {
		res.status(500).json({ msg: 'Failed to delete purchase' });
	}
};

exports.invoicePdf = async (req, res) => {
	try {
		const purchase = await Purchase.findById(req.params.id).populate('supplier').populate('items.product');
		if (!purchase) return res.status(404).json({ msg: 'Purchase not found' });

		res.setHeader('Content-Type', 'application/pdf');
		res.setHeader('Content-Disposition', `attachment; filename=${purchase.invoiceNumber}.pdf`);

		const doc = new PDFDocument({ margin: 40 });
		doc.pipe(res);
		doc.fontSize(20).text('Bhanu Shree Tiles & Taps', { align: 'center' });
		doc.fontSize(12).text(`Purchase Bill: ${purchase.invoiceNumber}`, { align: 'center' });
		doc.moveDown();
		doc.text(`Supplier: ${purchase.supplier?.name || 'N/A'}`);
		doc.text(`Date: ${new Date(purchase.billDate).toLocaleDateString()}`);
		doc.moveDown();

		purchase.items.forEach((item) => {
			doc.text(`${item.product?.name || 'Product'} x ${item.quantity} @ ${item.price} = ${item.amount}`);
		});

		doc.moveDown();
		doc.text(`Subtotal: ${purchase.subtotal}`);
		doc.text(`GST: ${purchase.gstTotal}`);
		doc.fontSize(14).text(`Grand Total: ${purchase.grandTotal}`);
		doc.end();
	} catch (err) {
		res.status(500).json({ msg: 'Failed to generate purchase PDF' });
	}
};

