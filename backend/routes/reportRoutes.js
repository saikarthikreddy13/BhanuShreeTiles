const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const controller = require('../controllers/ReportController');

router.get('/summary', auth, controller.summary);
router.get('/sales', auth, controller.sales);
router.get('/purchases', auth, controller.purchases);
router.get('/stock', auth, controller.stock);
router.get('/gst', auth, controller.gst);
router.get('/profit', auth, controller.profit);
router.get('/export/:type', auth, controller.exportExcel);

module.exports = router;
