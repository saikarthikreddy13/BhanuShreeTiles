const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true, unique: true, trim: true },
  email: { type: String, unique: true, lowercase: true, trim: true, sparse: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'manager', 'sales', 'store'], default: 'sales' },
  createdAt: { type: Date, default: Date.now },
});

UserSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

UserSchema.methods.comparePassword = function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);
