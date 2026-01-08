const express = require('express');
const router = express.Router();
const { isLoggedIn, isFarmer } = require('../middleware/auth');
const Product = require('../models/Product');
const Order = require('../models/Order');

// Dashboard
router.get('/', isLoggedIn, isFarmer, async (req, res) => {
  try {
    const products = await Product.find({ farmerId: req.session.user._id });
    const orders = await Order.find({ farmerId: req.session.user._id }).populate('buyerId', 'name email phone');

    // Calculate stats
    const totalSales = orders.reduce((sum, o) => sum + (o.finalPrice || 0), 0);
    const totalOrders = orders.length;
    const activeProducts = products.filter(p => p.status === 'OPEN').length;
    const soldProducts = products.filter(p => p.status === 'SOLD').length;

    res.render('farmer', {
      user: res.locals.user,
      products,
      stats: {
        totalSales,
        totalOrders,
        activeProducts,
        soldProducts
      }
    });
  } catch (err) {
    console.error(err);
    res.render('farmer', {
      user: res.locals.user,
      products: [],
      stats: { totalSales: 0, totalOrders: 0, activeProducts: 0, soldProducts: 0 }
    });
  }
});

// Add product page
router.get('/add-product', isLoggedIn, isFarmer, (req, res) => {
  res.render('farmer-add-product', { user: res.locals.user });
});

// Add product action
// Add product action
router.post('/add-product', isLoggedIn, isFarmer, async (req, res) => {
  try {
    const { name, description, quantity, price, listingType, duration, unitSize } = req.body;

    let biddingEndTime = null;
    if (listingType === 'AUCTION' && duration) {
      // Set end time = Now + Hours
      const hours = parseFloat(duration);
      biddingEndTime = new Date(Date.now() + hours * 60 * 60 * 1000);
    }

    await Product.create({
      farmerId: req.session.user._id,
      name,
      description: description || '',
      quantity,
      basePrice: price,
      basePrice: price,
      currentBid: price, // Start bidding at base price
      listingType: listingType || 'AUCTION',
      unitSize: unitSize || '1 Unit',
      biddingEndTime
    });
    res.redirect('/farmer/products?msg=Product+Created+Successfully');
  } catch (err) {
    console.error(err);
    res.redirect('/farmer/add-product');
  }
});

// Products list
router.get('/products', isLoggedIn, isFarmer, async (req, res) => {
  try {
    const products = await Product.find({ farmerId: req.session.user._id });
    res.render('farmer-products', {
      user: res.locals.user,
      products,
      msg: req.query.msg
    });
  } catch (err) {
    console.error(err);
    res.render('farmer-products', {
      user: res.locals.user,
      products: [],
      msg: 'Error loading products'
    });
  }
});

// Sell Product / Accept Highest Bid
router.post('/product/:id/sell', isLoggedIn, isFarmer, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.redirect('/farmer/products');
    }

    // Check if there is even a bid
    const Bid = require('../models/Bid');
    const highestBid = await Bid.findOne({ productId: product._id }).sort({ amount: -1 });

    if (!highestBid) {
      // Cannot sell without a bid
      // In a real app, flash a message here
      console.log('No bids found for product');
      return res.redirect('/farmer/products');
    }

    // 1. Mark product as SOLD
    product.status = 'SOLD';
    product.winner = highestBid.buyerId;
    await product.save();

    // 2. Create Order
    await Order.create({
      productId: product._id,
      buyerId: highestBid.buyerId,
      farmerId: req.session.user._id,
      finalPrice: highestBid.amount,
      date: new Date()
    });

    res.redirect('/farmer/orders');
  } catch (err) {
    console.error(err);
    res.redirect('/farmer/products');
  }
});

// Delete Product (Cancel Listing)
router.post('/product/:id/delete', isLoggedIn, isFarmer, async (req, res) => {
  try {
    const product = await Product.findOne({ _id: req.params.id, farmerId: req.session.user._id });
    if (product) {
      // Optional: specific checks if already sold
      if (product.status === 'SOLD') {
        return res.redirect('/farmer/products?msg=Cannot+Delete+Sold+Product');
      }
      await Product.findByIdAndDelete(req.params.id);

      // Also delete associated bids?
      const Bid = require('../models/Bid');
      await Bid.deleteMany({ productId: req.params.id });

      return res.redirect('/farmer/products?msg=Product+Deleted');
    }
    res.redirect('/farmer/products?msg=Product+Not+Found');
  } catch (err) {
    console.error(err);
    res.redirect('/farmer/products?msg=Error+Deleting+Product');
  }
});

// Cancel Order
router.post('/orders/:id/cancel', isLoggedIn, isFarmer, async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, farmerId: req.session.user._id });
    if (order) {
      if (order.status === 'Delivered' || order.status === 'Cancelled') {
        return res.redirect('/farmer/orders?msg=Cannot+Cancel+Completed+Order');
      }
      order.status = 'Cancelled';
      await order.save();

      // Optional: Restore product stock if it was a fixed price item?
      // For now, let's keep it simple or ask user. 
      // If we want to restore stock, we'd need to look up the product.
      const product = await Product.findById(order.productId);
      if (product && product.listingType === 'FIXED') {
        product.quantity += (order.quantity || 1);
        // If it was SOLD, maybe reopen it? 
        if (product.status === 'SOLD' && product.quantity > 0) {
          product.status = 'OPEN';
        }
        await product.save();
      }

      return res.redirect('/farmer/orders?msg=Order+Cancelled');
    }
    res.redirect('/farmer/orders?msg=Order+Not+Found');
  } catch (err) {
    console.error(err);
    res.redirect('/farmer/orders?msg=Error+Cancelling+Order');
  }
});

// Accept Order (Fixed Price Workflow)
router.post('/orders/:id/accept', isLoggedIn, isFarmer, async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, farmerId: req.session.user._id });
    if (order) {
      if (order.status !== 'Pending') {
        return res.redirect('/farmer/orders?msg=Order+Already+Processed');
      }
      // Update Status to 'Accepted'
      // (User requested: "Accepted")
      // Typically: Pending -> Accepted -> In Progress -> Shipped...
      order.status = 'Accepted';
      await order.save();

      return res.redirect('/farmer/orders?msg=Order+Accepted');
    }
    res.redirect('/farmer/orders?msg=Order+Not+Found');
  } catch (err) {
    console.error(err);
    res.redirect('/farmer/orders?msg=Error+Accepting+Order');
  }
});

// Orders
router.get('/orders', isLoggedIn, isFarmer, async (req, res) => {
  try {
    const orders = await Order.find({ farmerId: req.session.user._id }).populate('buyerId', 'name email phone');
    res.render('farmer-orders', { user: res.locals.user, orders });
  } catch (err) {
    console.error(err);
    res.render('farmer-orders', { user: res.locals.user, orders: [] });
  }
});

const User = require('../models/User');

// Profile Page
router.get('/profile', isLoggedIn, isFarmer, (req, res) => {
  res.render('farmer-profile', {
    user: res.locals.user,
    msg: req.query.msg
  });
});

// Update Profile
router.post('/profile', isLoggedIn, isFarmer, async (req, res) => {
  try {
    const { name, email, phone, location } = req.body;
    await User.findByIdAndUpdate(req.session.user._id, { name, email, phone, location });

    // Update session
    req.session.user.name = name;
    req.session.user.email = email;
    req.session.user.phone = phone;
    req.session.user.location = location;

    res.redirect('/farmer/profile?msg=Profile+Updated');
  } catch (err) {
    console.error(err);
    res.redirect('/farmer/profile?msg=Error+Updating+Profile');
  }
});

module.exports = router;
