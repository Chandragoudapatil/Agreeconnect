const express = require('express');
const router = express.Router();

const { isLoggedIn, isBuyer } = require('../middleware/auth');
const Product = require('../models/Product');
const Bid = require('../models/Bid');
const Order = require('../models/Order');
const User = require('../models/User'); // Required for watchlist update
const Notification = require('../models/Notification'); // Required for notifications
const Review = require('../models/Review');

/* =========================
   BUYER DASHBOARD
========================= */
router.get('/', isLoggedIn, isBuyer, async (req, res) => {
  try {
    const buyerId = req.session.user._id;

    // 1. Active Bids (Count)
    // We can count unique products user has bid on that are still OPEN
    // Or just count total bids. Let's do distinct products bid on.
    const uniqueBids = await Bid.distinct('productId', { buyerId });
    // Filter these to see which are still OPEN (optional for speed, or just count all active bids)
    // For simplicity, let's just count how many distinct products they engaged with.
    const activeBidsCount = uniqueBids.length;

    // 2. Won Bids / Orders
    // Won bids turn into Orders.
    const wonOrders = await Order.find({ buyerId });
    const wonBidsCount = wonOrders.length;

    // 3. Total Orders
    const totalOrdersCount = wonOrders.length;

    // 4. Total Spent
    const totalSpent = wonOrders.reduce((sum, order) => sum + (order.finalPrice || 0), 0);

    // 5. Fetch recent active products for the dashboard table
    const products = await Product.find({ status: 'OPEN' }).limit(10);

    // 6. Fetch Notifications
    const notifications = await Notification.find({ userId: buyerId }).sort({ createdAt: -1 }).limit(5);

    res.render('buyer', {
      user: res.locals.user,
      stats: {
        activeBids: activeBidsCount,
        wonBids: wonBidsCount,
        totalOrders: totalOrdersCount,
        totalSpent: totalSpent
      },
      products,
      notifications // Pass notifications
    });
  } catch (err) {
    console.error(err);
    res.render('buyer', {
      user: res.locals.user,
      stats: { activeBids: 0, wonBids: 0, totalOrders: 0, totalSpent: 0 },
      products: []
    });
  }
});

/* =========================
   PROFILE
========================= */
router.get('/profile', isLoggedIn, isBuyer, (req, res) => {
  res.render('buyer-profile', { user: res.locals.user });
});

router.post('/profile', isLoggedIn, isBuyer, async (req, res) => {
  try {
    const { name, email, phone } = req.body;
    await User.findByIdAndUpdate(req.session.user._id, { name, email, phone });
    // Update session user
    req.session.user.name = name;
    req.session.user.email = email;
    req.session.user.phone = phone;
    res.redirect('/buyer/profile?msg=Profile+Updated');
  } catch (err) {
    console.error(err);
    res.redirect('/buyer/profile?msg=Error+Updating+Profile');
  }
});

/* =========================
   BROWSE PRODUCTS
========================= */
router.get('/products', isLoggedIn, isBuyer, async (req, res) => {
  try {
    const { search, location, minPrice, maxPrice } = req.query;
    let query = { status: 'OPEN' };

    // Search by Name (Regex)
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }

    // Price Filter
    if (minPrice || maxPrice) {
      query.basePrice = {};
      if (minPrice) query.basePrice.$gte = Number(minPrice);
      if (maxPrice) query.basePrice.$lte = Number(maxPrice);
    }

    // Location Filter (Requires populating Farmer)
    // Since Product has farmerId, we need to filter based on Farmer's location.
    // Mongoose doesn't support deep filtering efficiently on populated fields without aggregate.
    // For simplicity, we fetch all open products, populate farmer, then filter in JS.
    // OR: Find farmers matching location first.

    let products = await Product.find(query).populate('farmerId');

    if (location) {
      products = products.filter(p =>
        p.farmerId && p.farmerId.location &&
        p.farmerId.location.toLowerCase().includes(location.toLowerCase())
      );
    }

    // --- FETCH RATINGS (Aggregated by Farmer) ---
    // We want to show ratings on the product card (for fixed price items)
    // 1. Get all unique farmer IDs from the products
    const farmerIds = [...new Set(products.map(p => p.farmerId ? p.farmerId._id : null).filter(id => id))];

    // 2. Aggregate reviews for these farmers
    const ratingsMap = {}; // { farmerId: { average: 4.5, count: 10 } }

    if (farmerIds.length > 0) {
      const reviews = await Review.aggregate([
        { $match: { farmerId: { $in: farmerIds } } },
        {
          $group: {
            _id: '$farmerId',
            average: { $avg: '$rating' },
            count: { $sum: 1 }
          }
        }
      ]);

      // Map to easier object
      reviews.forEach(r => {
        ratingsMap[r._id.toString()] = {
          average: parseFloat(r.average.toFixed(1)),
          count: r.count
        };
      });
    }

    res.render('buyer-products', {
      user: res.locals.user,
      products,
      msg: req.query.msg,
      searchQuery: search,
      locationQuery: location,
      ratingsMap // Pass the ratings map
    });
  } catch (err) {
    console.error(err);
    res.render('buyer-products', {
      user: res.locals.user,
      products: [],
      msg: 'Error loading products'
    });
  }
});

/* =========================
   PLACE A BID  ✅ FIXED
========================= */
router.post('/bid/:id', isLoggedIn, isBuyer, async (req, res) => {
  try {
    const productId = req.params.id;
    const bidAmount = parseFloat(req.body.bidAmount);

    // 🔒 Prevent NaN or empty input
    if (!bidAmount || isNaN(bidAmount)) {
      console.log('Invalid bid amount:', req.body.bidAmount);
      return res.redirect('/buyer/products?msg=Invalid+Bid+Amount');
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.redirect('/buyer/products?msg=Product+Not+Found');
    }

    // Bid must be higher than current
    if (bidAmount <= product.currentBid) {
      return res.redirect('/buyer/products?msg=Bid+Too+Low');
    }

    // Save bid
    const bid = new Bid({
      productId: product._id,
      buyerId: req.session.user._id,
      amount: bidAmount
    });
    await bid.save();

    // Update product
    product.currentBid = bidAmount;
    await product.save();

    // --- REAL-TIME UPDATE ---
    if (req.io) {
      req.io.emit('bid_update', {
        productId: product._id,
        newBid: bidAmount,
        bidderName: req.session.user.name
      });
    }

    // --- NOTIFICATION ---
    // Notify previous winner if exists (logic omitted for brevity, simpler: notify Owner/Farmer)
    await Notification.create({
      userId: product.farmerId,
      message: `New bid of ₹${bidAmount} on ${product.name}`,
      type: 'BID'
    });

    // Redirect after POST (IMPORTANT)
    res.redirect('/buyer/products?msg=Bid+Placed+Successfully');
  } catch (err) {
    console.error(err);
    res.redirect('/buyer/products?msg=Error+Placing+Bid');
  }
});

/* =========================
   WATCHLIST
========================= */
router.post('/watchlist/toggle', isLoggedIn, isBuyer, async (req, res) => {
  try {
    const { productId } = req.body;
    const user = await User.findById(req.session.user._id);

    const index = user.watchlist.indexOf(productId);
    if (index === -1) {
      user.watchlist.push(productId);
    } else {
      user.watchlist.splice(index, 1);
    }
    await user.save();

    // Update session
    req.session.user.watchlist = user.watchlist;

    res.json({ success: true, watchlist: user.watchlist });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

/* =========================
   MY BIDS
========================= */
router.get('/bids', isLoggedIn, isBuyer, async (req, res) => {
  try {
    const bids = await Bid.find({ buyerId: req.session.user._id })
      .populate('productId');
    res.render('buyer-bids', {
      user: res.locals.user,
      bids
    });
  } catch (err) {
    console.error(err);
    res.render('buyer-bids', {
      user: res.locals.user,
      bids: []
    });
  }
});

/* =========================
   ORDERS
========================= */
router.get('/orders', isLoggedIn, isBuyer, async (req, res) => {
  try {
    const orders = await Order.find({ buyerId: req.session.user._id }).populate('farmerId', 'name email phone');
    res.render('buyer-orders', {
      user: res.locals.user,
      orders
    });
  } catch (err) {
    console.error(err);
    res.render('buyer-orders', {
      user: res.locals.user,
      orders: []
    });
  }
});
// Cancel Bid
router.post('/bids/:id/cancel', isLoggedIn, isBuyer, async (req, res) => {
  try {
    const bid = await Bid.findOne({ _id: req.params.id, buyerId: req.session.user._id });
    if (!bid) {
      return res.redirect('/buyer/bids?msg=Bid+Not+Found');
    }

    // Capture Product ID before deleting
    const productId = bid.productId;

    // Delete Bid
    await Bid.deleteOne({ _id: bid._id });

    // Recalculate Product Price (Highest Bid or Base Price)
    const nextHighestBid = await Bid.findOne({ productId: productId }).sort({ amount: -1 });
    const product = await Product.findById(productId);

    if (product) {
      if (nextHighestBid) {
        product.currentBid = nextHighestBid.amount;
      } else {
        product.currentBid = product.basePrice; // Reset to base
      }
      await product.save();
    }

    res.redirect('/buyer/bids?msg=Bid+Cancelled');
  } catch (err) {
    console.error(err);
    res.redirect('/buyer/bids?msg=Error+Cancelling+Bid');
  }
});

// Cancel Order
router.post('/orders/:id/cancel', isLoggedIn, isBuyer, async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, buyerId: req.session.user._id });
    if (!order) {
      return res.redirect('/buyer/orders?msg=Order+Not+Found');
    }

    if (order.status === 'Delivered' || order.status === 'Cancelled') {
      return res.redirect('/buyer/orders?msg=Cannot+Cancel+Completed+Order');
    }

    order.status = 'Cancelled';
    await order.save();

    // Restore Stock if Fixed Price
    const product = await Product.findById(order.productId);
    if (product && product.listingType === 'FIXED') {
      product.quantity += (order.quantity || 1);
      if (product.status === 'SOLD' || product.quantity > 0) {
        product.status = 'OPEN';
      }
      await product.save();
    }

    res.redirect('/buyer/orders?msg=Order+Cancelled');
  } catch (err) {
    console.error(err);
    res.redirect('/buyer/orders?msg=Error+Cancelling+Order');
  }
});

// Submit Review
router.post('/reviews/add', isLoggedIn, isBuyer, async (req, res) => {
  try {
    const { orderId, farmerId, rating, comment } = req.body;

    // Basic validation
    if (!rating || rating < 1 || rating > 5) {
      return res.redirect('/buyer/orders?msg=Invalid+Rating');
    }

    // Create Review
    await Review.create({
      orderId,
      buyerId: req.session.user._id,
      farmerId,
      rating: parseInt(rating),
      comment
    });

    // Notify Farmer
    await Notification.create({
      userId: farmerId,
      message: `You received a ${rating}-star review!`,
      type: 'SYSTEM'
    });

    res.redirect('/buyer/orders?msg=Review+Submitted');
  } catch (err) {
    console.error(err);
    res.redirect('/buyer/orders?msg=Error+Submitting+Review');
  }
});

module.exports = router;
