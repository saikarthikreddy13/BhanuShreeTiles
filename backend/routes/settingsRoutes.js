const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const controller = require('../controllers/SettingController');

router.get('/', auth, controller.get);
router.get('/public', controller.getPublic);
router.put('/', auth, controller.uploadMiddleware, controller.update);

module.exports = router;
