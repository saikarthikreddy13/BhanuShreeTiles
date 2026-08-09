const User = require('../models/User');
const jwt = require('jsonwebtoken');

const generateToken = (user) => {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET || 'secret', {
    expiresIn: '7d',
  });
};

exports.register = async (req, res) => {
  try {
    const { name, phone, email, password, role } = req.body;
    if (!name || !phone || !password) return res.status(400).json({ msg: 'Missing fields' });
    let user = await User.findOne({ phone });
    if (user) return res.status(400).json({ msg: 'User already exists' });
    if (email) {
      const emailUser = await User.findOne({ email });
      if (emailUser) return res.status(400).json({ msg: 'Email already exists' });
    }
    user = new User({ name, phone, email, password, role });
    await user.save();
    const token = generateToken(user);
    res.json({ token, user: { id: user._id, name: user.name, phone: user.phone, email: user.email, role: user.role } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
};

exports.login = async (req, res) => {
  try {
    const { phone, email, password } = req.body;
    const identifier = phone || email;
    if (!identifier || !password) return res.status(400).json({ msg: 'Missing phone or password' });
    const user = phone ? await User.findOne({ phone }) : await User.findOne({ email });
    if (!user) return res.status(400).json({ msg: 'Invalid credentials' });
    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(400).json({ msg: 'Invalid credentials' });
    const token = generateToken(user);
    res.json({ token, user: { id: user._id, name: user.name, phone: user.phone, email: user.email, role: user.role } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
};

exports.me = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
};
