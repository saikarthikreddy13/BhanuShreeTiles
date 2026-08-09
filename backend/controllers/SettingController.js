const fs = require('fs');
const path = require('path');
const multer = require('multer');
const Setting = require('../models/Setting');

const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
	fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
	destination: uploadDir,
	filename: (req, file, cb) => {
		const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
		const ext = path.extname(file.originalname) || '.png';
		cb(null, `logo-${uniqueSuffix}${ext}`);
	},
});

const upload = multer({ storage });

exports.uploadMiddleware = upload.single('logo');

exports.get = async (req, res) => {
	try {
		let settings = await Setting.findOne().sort({ updatedAt: -1 });
		if (!settings) {
			settings = await Setting.create({});
		}
		res.json(settings);
	} catch (err) {
		res.status(500).json({ msg: 'Failed to fetch settings' });
	}
};

exports.update = async (req, res) => {
	try {
		let settings = await Setting.findOne();
		if (!settings) {
			settings = new Setting({});
		}

		const fields = [
			'companyName', 'tagline', 'gstNumber', 'phone', 'email', 'address',
			'bankName', 'accountNumber', 'ifscCode', 'invoicePrefix', 'invoiceFooter',
			'emailHost', 'emailPort', 'emailUser', 'emailPassword', 'whatsappNumber',
		];

		fields.forEach((field) => {
			if (req.body[field] !== undefined) {
				settings[field] = field === 'emailPort' ? Number(req.body[field] || 0) : req.body[field];
			}
		});

		if (req.file) {
			settings.logoUrl = `/uploads/${req.file.filename}`;
		}

		settings.updatedBy = req.user?.id;
		await settings.save();
		res.json(settings);
	} catch (err) {
		res.status(400).json({ msg: err.message });
	}
};

exports.getPublic = async (req, res) => {
	try {
		const settings = await Setting.findOne().sort({ updatedAt: -1 });
		res.json(settings || {});
	} catch (err) {
		res.status(500).json({ msg: 'Failed to fetch public settings' });
	}
};
