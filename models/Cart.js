const mongoose = require('mongoose');

const CartSchema = new mongoose.Schema({
  buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  items: [{ product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' }, quantity: Number }],
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Cart', CartSchema);
