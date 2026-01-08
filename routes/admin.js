const express = require('express');
const router = express.Router();
const { isLoggedIn, isAdmin } = require('../middleware/auth');
const User = require('../models/User');
const Product = require('../models/Product');
const Order = require('../models/Order');

// Dashboard
router.get('/', isLoggedIn, isAdmin, async (req, res) => {
  try {
    const users = await User.find();
    const products = await Product.find();
    const orders = await Order.find();
    res.render('admin', { user: res.locals.user, users, products, orders });
  } catch (err) {
    console.error(err);
    res.render('admin', { user: res.locals.user, users: [], products: [], orders: [] });
  }
});

// Users
router.get('/users', isLoggedIn, isAdmin, async (req, res) => {
  try {
    const users = await User.find();
    res.render('admin-users', { user: res.locals.user, users });
  } catch (err) {
    console.error(err);
    res.render('admin-users', { user: res.locals.user, users: [] });
  }
});

// Products
router.get('/products', isLoggedIn, isAdmin, async (req, res) => {
  try {
    const products = await Product.find().populate('farmerId'); // Assuming product has farmerId
    res.render('admin-products', { user: res.locals.user, products });
  } catch (err) {
    console.error(err);
    res.render('admin-products', { user: res.locals.user, products: [] });
  }
});

// Orders
router.get('/orders', isLoggedIn, isAdmin, async (req, res) => {
  try {
    const orders = await Order.find().populate('buyerId').populate('productId').populate('farmerId');
    res.render('admin-orders', { user: res.locals.user, orders });
  } catch (err) {
    console.error(err);
    res.render('admin-orders', { user: res.locals.user, orders: [] });
  }
});

/* =========================
   ACTIONS
========================= */

// Delete User
router.post('/users/delete/:id', isLoggedIn, isAdmin, async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.redirect('/admin/users');
  } catch (err) {
    console.error(err);
    res.redirect('/admin/users');
  }
});

// Delete Product
router.post('/products/delete/:id', isLoggedIn, isAdmin, async (req, res) => {
  try {
    await Product.findByIdAndDelete(req.params.id);
    res.redirect('/admin/products');
  } catch (err) {
    console.error(err);
    res.redirect('/admin/products');
  }
});

// Update Order Status
router.post('/orders/status/:id', isLoggedIn, isAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    await Order.findByIdAndUpdate(req.params.id, { status });
    res.redirect('/admin/orders');
  } catch (err) {
    console.error(err);
    res.redirect('/admin/orders');
  }
});

module.exports = router;
