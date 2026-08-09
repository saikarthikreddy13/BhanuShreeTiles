const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const controller = require('../controllers/ProductController');

router.get('/', controller.list);
router.get('/:id', controller.getOne);
router.post('/', auth, controller.create);
router.put('/:id', auth, controller.update);
router.delete('/:id', auth, controller.remove);

module.exports = router;

