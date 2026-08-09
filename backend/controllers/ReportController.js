const ExcelJS = require('exceljs');
const Sale = require('../models/Sale');
const Purchase = require('../models/Purchase');
const Stock = require('../models/Stock');
const Product = require('../models/Product');

const monthStart = (date = new Date()) => new Date(date.getFullYear(), date.getMonth(), 1);
const weekStart = (date = new Date()) => {
	const result = new Date(date);
	const day = result.getDay();
	const diff = result.getDate() - day + (day === 0 ? -6 : 1);
	return new Date(result.setDate(diff));
};

const buildRange = (range) => {
	const end = new Date();
	switch (range) {
		case 'daily':
			return { from: new Date(end.getFullYear(), end.getMonth(), end.getDate()), to: end };
		case 'weekly':
			return { from: weekStart(end), to: end };
		case 'yearly':
			return { from: new Date(end.getFullYear(), 0, 1), to: end };
		case 'monthly':
		default:
			return { from: monthStart(end), to: end };
	}
};

const querySales = async (from, to) => Sale.find({ createdAt: { $gte: from, $lte: to } }).populate('customer').populate('items.product');
const queryPurchases = async (from, to) => Purchase.find({ createdAt: { $gte: from, $lte: to } }).populate('supplier').populate('items.product');

exports.summary = async (req, res) => {
	try {
		const range = req.query.range || 'monthly';
		const { from, to } = buildRange(range);
		const [sales, purchases, stockRows, products] = await Promise.all([
			querySales(from, to),
			queryPurchases(from, to),
			Stock.find().populate('product'),
			Product.find(),
		]);

		const salesTotal = sales.reduce((sum, sale) => sum + sale.grandTotal, 0);
		const purchaseTotal = purchases.reduce((sum, purchase) => sum + purchase.grandTotal, 0);
		const profit = salesTotal - purchaseTotal;
		const gstCollected = sales.reduce((sum, sale) => sum + sale.gstTotal, 0);
		const lowStock = stockRows.filter((row) => {
			const threshold = row.product?.lowStockThreshold ?? 10;
			return row.quantity <= threshold;
		}).length;

		res.json({
			range,
			from,
			to,
			salesCount: sales.length,
			purchaseCount: purchases.length,
			salesTotal,
			purchaseTotal,
			profit,
			gstCollected,
			lowStock,
			productCount: products.length,
		});
	} catch (err) {
		res.status(500).json({ msg: 'Failed to generate report summary' });
	}
};

exports.sales = async (req, res) => {
	try {
		const { from, to } = buildRange(req.query.range || 'monthly');
		const sales = await querySales(from, to);
		res.json(sales);
	} catch (err) {
		res.status(500).json({ msg: 'Failed to fetch sales report' });
	}
};

exports.purchases = async (req, res) => {
	try {
		const { from, to } = buildRange(req.query.range || 'monthly');
		const purchases = await queryPurchases(from, to);
		res.json(purchases);
	} catch (err) {
		res.status(500).json({ msg: 'Failed to fetch purchase report' });
	}
};

exports.stock = async (req, res) => {
	try {
		const rows = await Stock.find().populate('product').sort({ createdAt: -1 });
		res.json(rows);
	} catch (err) {
		res.status(500).json({ msg: 'Failed to fetch stock report' });
	}
};

exports.gst = async (req, res) => {
	try {
		const { from, to } = buildRange(req.query.range || 'monthly');
		const sales = await querySales(from, to);
		const gstRows = sales.map((sale) => ({
			invoiceNumber: sale.invoiceNumber,
			date: sale.createdAt,
			customer: sale.customer?.name || '',
			gstTotal: sale.gstTotal,
			grandTotal: sale.grandTotal,
		}));
		res.json(gstRows);
	} catch (err) {
		res.status(500).json({ msg: 'Failed to fetch GST report' });
	}
};

exports.profit = async (req, res) => {
	try {
		const { from, to } = buildRange(req.query.range || 'monthly');
		const [sales, purchases] = await Promise.all([querySales(from, to), queryPurchases(from, to)]);
		const salesTotal = sales.reduce((sum, sale) => sum + sale.grandTotal, 0);
		const purchaseTotal = purchases.reduce((sum, purchase) => sum + purchase.grandTotal, 0);
		res.json({ salesTotal, purchaseTotal, profit: salesTotal - purchaseTotal });
	} catch (err) {
		res.status(500).json({ msg: 'Failed to fetch profit report' });
	}
};

exports.exportExcel = async (req, res) => {
	try {
		const type = req.params.type;
		const { from, to } = buildRange(req.query.range || 'monthly');
		const workbook = new ExcelJS.Workbook();
		const worksheet = workbook.addWorksheet(type.toUpperCase());

		let rows = [];
		if (type === 'sales') {
			rows = await querySales(from, to);
			worksheet.columns = [
				{ header: 'Invoice', key: 'invoiceNumber', width: 18 },
				{ header: 'Customer', key: 'customer', width: 24 },
				{ header: 'GST', key: 'gstTotal', width: 12 },
				{ header: 'Grand Total', key: 'grandTotal', width: 14 },
			];
			rows.forEach((row) => worksheet.addRow({
				invoiceNumber: row.invoiceNumber,
				customer: row.customer?.name || '',
				gstTotal: row.gstTotal,
				grandTotal: row.grandTotal,
			}));
		} else if (type === 'purchases') {
			rows = await queryPurchases(from, to);
			worksheet.columns = [
				{ header: 'Invoice', key: 'invoiceNumber', width: 18 },
				{ header: 'Supplier', key: 'supplier', width: 24 },
				{ header: 'GST', key: 'gstTotal', width: 12 },
				{ header: 'Grand Total', key: 'grandTotal', width: 14 },
			];
			rows.forEach((row) => worksheet.addRow({
				invoiceNumber: row.invoiceNumber,
				supplier: row.supplier?.name || '',
				gstTotal: row.gstTotal,
				grandTotal: row.grandTotal,
			}));
		} else if (type === 'stock') {
			rows = await Stock.find().populate('product');
			worksheet.columns = [
				{ header: 'Product', key: 'product', width: 24 },
				{ header: 'Godown', key: 'godownName', width: 18 },
				{ header: 'Rack', key: 'rackNumber', width: 12 },
				{ header: 'Quantity', key: 'quantity', width: 12 },
				{ header: 'Damage', key: 'damageQuantity', width: 12 },
			];
			rows.forEach((row) => worksheet.addRow({
				product: row.product?.name || '',
				godownName: row.godownName,
				rackNumber: row.rackNumber,
				quantity: row.quantity,
				damageQuantity: row.damageQuantity,
			}));
		} else {
			return res.status(400).json({ msg: 'Unsupported export type' });
		}

		res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
		res.setHeader('Content-Disposition', `attachment; filename=${type}-report.xlsx`);
		await workbook.xlsx.write(res);
		res.end();
	} catch (err) {
		res.status(500).json({ msg: 'Failed to export report' });
	}
};
