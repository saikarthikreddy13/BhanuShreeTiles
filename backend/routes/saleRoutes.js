const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const controller = require('../controllers/SaleController');

router.get('/', auth, controller.list);
router.get('/:id', auth, controller.getOne);
router.post('/', auth, controller.create);
router.put('/:id', auth, controller.update);
router.delete('/:id', auth, controller.remove);
router.get('/:id/pdf', auth, controller.invoicePdf);

module.exports = router;

