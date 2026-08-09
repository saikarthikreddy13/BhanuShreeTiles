const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const controller = require('../controllers/GodownController');

router.get('/', auth, controller.list);
router.get('/low-stock', auth, controller.lowStock);
router.post('/', auth, controller.create);
router.post('/transfer-stock', auth, controller.transferStock);
router.post('/damage-stock', auth, controller.markDamage);
router.get('/:id', auth, controller.getOne);
router.put('/:id', auth, controller.update);
router.delete('/:id', auth, controller.remove);

module.exports = router;
