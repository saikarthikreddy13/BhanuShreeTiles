const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const controller = require('../controllers/StockController');

router.get('/', auth, controller.list);
router.post('/', auth, controller.upsert);
router.delete('/:id', auth, controller.remove);

module.exports = router;

