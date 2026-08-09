require('dotenv').config();
const path = require('path');
const express = require('express');
const morgan = require('morgan');
const helmet = require('helmet');
const cors = require('cors');

const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const productRoutes = require('./routes/productRoutes');
const customerRoutes = require('./routes/customerRoutes');
const supplierRoutes = require('./routes/supplierRoutes');
const stockRoutes = require('./routes/stockRoutes');
const saleRoutes = require('./routes/saleRoutes');
const purchaseRoutes = require('./routes/purchaseRoutes');
const godownRoutes = require('./routes/godownRoutes');
const reportRoutes = require('./routes/reportRoutes');
const employeeRoutes = require('./routes/employeeRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const brandRoutes = require('./routes/brandRoutes');

const Product = require('./models/Product');
const Customer = require('./models/Customer');
const Supplier = require('./models/Supplier');
const Stock = require('./models/Stock');
const Sale = require('./models/Sale');
const Purchase = require('./models/Purchase');
const Godown = require('./models/Godown');
const Employee = require('./models/Employee');
const Setting = require('./models/Setting');
const Category = require('./models/Category');
const Brand = require('./models/Brand');

// Connect to database
connectDB();

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/sales', saleRoutes);
app.use('/api/purchases', purchaseRoutes);
app.use('/api/godowns', godownRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/brands', brandRoutes);
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Dashboard summary endpoint
app.get('/api/dashboard/summary', async (req, res) => {
  try {
    const [products, customers, suppliers, stock] = await Promise.all([
      Product.countDocuments(),
      Customer.countDocuments(),
      Supplier.countDocuments(),
      Stock.aggregate([{ $group: { _id: null, total: { $sum: '$quantity' } } }]),
    ]);
    const [salesCount, purchasesCount] = await Promise.all([
      Sale.countDocuments(),
      Purchase.countDocuments(),
    ]);
    const [godownCount, lowStockCount] = await Promise.all([
      Godown.countDocuments(),
      Stock.find().populate('product').then((rows) => rows.filter((row) => (row.product?.lowStockThreshold ?? 10) >= row.quantity).length),
    ]);
    const [employeeCount, settingsCount] = await Promise.all([
      Employee.countDocuments(),
      Setting.countDocuments(),
    ]);
    const [categoryCount, brandCount] = await Promise.all([
      Category.countDocuments(),
      Brand.countDocuments(),
    ]);

    res.json({
      products,
      customers,
      suppliers,
      totalStock: stock[0]?.total || 0,
      salesCount,
      purchasesCount,
      godownCount,
      lowStockCount,
      employeeCount,
      settingsCount,
      categoryCount,
      brandCount,
    });
  } catch (err) {
    res.status(500).json({ msg: 'Failed to load dashboard summary' });
  }
});

// Serve frontend static files
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Frontend fallback for non-API routes
app.use((req, res, next) => {
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(404).json({ msg: 'Route not found' });
  }
  return res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
