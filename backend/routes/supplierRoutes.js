const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const controller = require('../controllers/SupplierController');

router.get('/', auth, controller.list);
router.get('/:id', auth, controller.getOne);
router.post('/', auth, controller.create);
router.put('/:id', auth, controller.update);
router.delete('/:id', auth, controller.remove);

module.exports = router;

