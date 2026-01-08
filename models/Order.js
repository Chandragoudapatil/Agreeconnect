// models/Order.js
const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  buyerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  farmerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  finalPrice: Number,
  status: { type: String, default: 'Pending' }, // Pending, Shipped, Delivered, Cancelled
  date: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Order", orderSchema);
