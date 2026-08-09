const PDFDocument = require('pdfkit');
const Sale = require('../models/Sale');
const Product = require('../models/Product');
const Stock = require('../models/Stock');
const Customer = require('../models/Customer');

const formatNumber = (value) => Number(Number(value || 0).toFixed(2));
const nextInvoiceNumber = async () => {
	const count = await Sale.countDocuments();
	return `SAL-${String(count + 1).padStart(5, '0')}`;
};

const calculateItem = (item) => {
	const quantity = Number(item.quantity || 0);
	const price = Number(item.price || 0);
	const gstRate = Number(item.gstRate || 0);
	const discount = Number(item.discount || 0);
	const taxable = quantity * price - discount;
	const gstAmount = (taxable * gstRate) / 100;
	return {
		quantity,
		price,
		gstRate,
		discount,
		amount: formatNumber(Math.max(taxable + gstAmount, 0)),
		gstAmount: formatNumber(gstAmount),
	};
};

const updateStockAfterSale = async (items) => {
	for (const item of items) {
		const stock = await Stock.findOne({ product: item.product });
		if (!stock || stock.quantity < item.quantity) {
			const product = await Product.findById(item.product);
			throw new Error(`Insufficient stock for ${product?.name || 'selected product'}`);
		}
		stock.quantity -= item.quantity;
		await stock.save();
		await Product.findByIdAndUpdate(item.product, { stock: stock.quantity });
	}
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

const buildSalePayload = async (body) => {
	const items = (body.items || []).map((item) => ({
		product: item.product,
		...calculateItem(item),
	}));
	const subtotal = formatNumber(items.reduce((sum, item) => sum + item.quantity * item.price, 0));
	const discountTotal = formatNumber(items.reduce((sum, item) => sum + Number(item.discount || 0), 0));
	const gstTotal = formatNumber(items.reduce((sum, item) => sum + item.gstRate * ((item.quantity * item.price - item.discount) / 100), 0));
	const grandTotal = formatNumber(items.reduce((sum, item) => sum + item.amount, 0));

	return {
		customer: body.customer,
		billDate: body.billDate || new Date(),
		items,
		subtotal,
		gstTotal,
		discountTotal,
		grandTotal,
		paymentMode: body.paymentMode || 'cash',
		paymentStatus: body.paymentStatus || 'paid',
		notes: body.notes || '',
	};
};

const buildPurchasePayload = async (body) => {
	const items = (body.items || []).map((item) => ({
		product: item.product,
		quantity: Number(item.quantity || 0),
		price: Number(item.price || 0),
		gstRate: Number(item.gstRate || 0),
		amount: formatNumber((Number(item.quantity || 0) * Number(item.price || 0)) + (((Number(item.quantity || 0) * Number(item.price || 0)) * Number(item.gstRate || 0)) / 100)),
	}));
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

exports.list = async (req, res) => {
	try {
		const sales = await Sale.find().populate('customer').populate('items.product').sort({ createdAt: -1 });
		res.json(sales);
	} catch (err) {
		res.status(500).json({ msg: 'Failed to fetch sales' });
	}
};

exports.getOne = async (req, res) => {
	try {
		const sale = await Sale.findById(req.params.id).populate('customer').populate('items.product');
		if (!sale) return res.status(404).json({ msg: 'Sale not found' });
		res.json(sale);
	} catch (err) {
		res.status(500).json({ msg: 'Failed to fetch sale' });
	}
};

exports.create = async (req, res) => {
	try {
		const payload = await buildSalePayload(req.body);
		const invoiceNumber = await nextInvoiceNumber();
		await updateStockAfterSale(payload.items);
		const sale = await Sale.create({ ...payload, invoiceNumber, createdBy: req.user?.id });
		res.status(201).json(sale);
	} catch (err) {
		res.status(400).json({ msg: err.message });
	}
};

exports.update = async (req, res) => {
	try {
		const existing = await Sale.findById(req.params.id);
		if (!existing) return res.status(404).json({ msg: 'Sale not found' });

		for (const item of existing.items) {
			const stock = await Stock.findOne({ product: item.product });
			if (stock) {
				stock.quantity += item.quantity;
				await stock.save();
				await Product.findByIdAndUpdate(item.product, { stock: stock.quantity });
			}
		}

		const payload = await buildSalePayload(req.body);
		await updateStockAfterSale(payload.items);

		const sale = await Sale.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true });
		res.json(sale);
	} catch (err) {
		res.status(400).json({ msg: err.message });
	}
};

exports.remove = async (req, res) => {
	try {
		const sale = await Sale.findById(req.params.id);
		if (!sale) return res.status(404).json({ msg: 'Sale not found' });

		for (const item of sale.items) {
			const stock = await Stock.findOne({ product: item.product });
			if (stock) {
				stock.quantity += item.quantity;
				await stock.save();
				await Product.findByIdAndUpdate(item.product, { stock: stock.quantity });
			}
		}

		await Sale.findByIdAndDelete(req.params.id);
		res.json({ msg: 'Sale deleted' });
	} catch (err) {
		res.status(500).json({ msg: 'Failed to delete sale' });
	}
};

exports.invoicePdf = async (req, res) => {
	try {
		const sale = await Sale.findById(req.params.id).populate('customer').populate('items.product');
		if (!sale) return res.status(404).json({ msg: 'Sale not found' });

		res.setHeader('Content-Type', 'application/pdf');
		res.setHeader('Content-Disposition', `attachment; filename=${sale.invoiceNumber}.pdf`);

		const doc = new PDFDocument({ margin: 40 });
		doc.pipe(res);

		doc.fontSize(20).text('Bhanu Shree Tiles & Taps', { align: 'center' });
		doc.fontSize(12).text(`Invoice: ${sale.invoiceNumber}`, { align: 'center' });
		doc.moveDown();
		doc.text(`Customer: ${sale.customer?.name || 'N/A'}`);
		doc.text(`Date: ${new Date(sale.billDate).toLocaleDateString()}`);
		doc.moveDown();

		sale.items.forEach((item) => {
			doc.text(`${item.product?.name || 'Product'} x ${item.quantity} @ ${item.price} = ${item.amount}`);
		});

		doc.moveDown();
		doc.text(`Subtotal: ${sale.subtotal}`);
		doc.text(`GST: ${sale.gstTotal}`);
		doc.text(`Discount: ${sale.discountTotal}`);
		doc.fontSize(14).text(`Grand Total: ${sale.grandTotal}`);

		doc.end();
	} catch (err) {
		res.status(500).json({ msg: 'Failed to generate invoice PDF' });
	}
};

exports._internal = {
	buildPurchasePayload,
	updateStockAfterPurchase,
};

