const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: String,
  description: String,
  basePrice: Number,
  quantity: {
    type: Number,
    default: 1
  },
  unitSize: {
    type: String,
    default: '1 Unit'
  },
  farmerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  currentBid: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    default: 'OPEN' // OPEN, SOLD, CLOSED
  },
  winner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  biddingEndTime: Date,
  acceptedByFarmer: {
    type: Boolean,
    default: false
  },
  listingType: {
    type: String,
    enum: ['AUCTION', 'FIXED'],
    default: 'AUCTION'
  }
});

module.exports = mongoose.model('Product', productSchema);
