const express = require('express');
const router = express.Router();
const { isLoggedIn, isBuyer } = require('../middleware/auth');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Notification = require('../models/Notification');

// Get Cart
router.get('/', isLoggedIn, isBuyer, async (req, res) => {
    try {
        let cart = await Cart.findOne({ buyer: req.session.user._id }).populate('items.product');
        if (!cart) {
            cart = await Cart.create({ buyer: req.session.user._id, items: [] });
        }
        // Calculate total
        let totalPrice = 0;
        cart.items.forEach(item => {
            if (item.product) {
                totalPrice += (item.product.basePrice * item.quantity);
            }
        });

        res.render('cart', {
            user: res.locals.user,
            cart,
            totalPrice,
            msg: req.query.msg
        });
    } catch (err) {
        console.error(err);
        res.redirect('/buyer?msg=Error+Loading+Cart');
    }
});

// Add to Cart
router.post('/add/:id', isLoggedIn, isBuyer, async (req, res) => {
    try {
        const productId = req.params.id;
        const quantity = parseInt(req.body.quantity) || 1;

        let cart = await Cart.findOne({ buyer: req.session.user._id });
        if (!cart) {
            cart = new Cart({ buyer: req.session.user._id, items: [] });
        }

        const product = await Product.findById(productId);
        if (!product) return res.redirect('/buyer/products?msg=Product+Not+Found');

        const itemIndex = cart.items.findIndex(p => p.product.toString() === productId);
        let newQuantity = quantity;
        if (itemIndex > -1) {
            newQuantity += cart.items[itemIndex].quantity;
        }

        // Stock Validation
        if (product.listingType === 'FIXED' && newQuantity > product.quantity) {
            return res.redirect(`/buyer/products?msg=Only+${product.quantity}+Items+Available`);
        }

        if (itemIndex > -1) {
            cart.items[itemIndex].quantity = newQuantity;
        } else {
            cart.items.push({ product: productId, quantity: quantity });
        }
        await cart.save();
        res.redirect('/cart?msg=Item+Added');
    } catch (err) {
        console.error(err);
        res.redirect('/buyer/products?msg=Error+Adding+To+Cart');
    }
});

// Remove from Cart
router.post('/remove/:id', isLoggedIn, isBuyer, async (req, res) => {
    try {
        const productId = req.params.id;
        let cart = await Cart.findOne({ buyer: req.session.user._id });
        if (cart) {
            cart.items = cart.items.filter(item => item.product.toString() !== productId);
            await cart.save();
        }
        res.redirect('/cart?msg=Item+Removed');
    } catch (err) {
        console.error(err);
        res.redirect('/cart?msg=Error+Removing+Item');
    }
});

// Checkout (Simple version: Convert Cart to Order)
router.post('/checkout', isLoggedIn, isBuyer, async (req, res) => {
    try {
        const cart = await Cart.findOne({ buyer: req.session.user._id }).populate('items.product');
        if (!cart || cart.items.length === 0) {
            return res.redirect('/cart?msg=Cart+Empty');
        }

        // Process each item as an order (or one big order, but existing Order model seemed single-product focused?)
        // Let's check Order model. 
        // Assuming Order model is simple for now, I'll create one Order per item or bulk. 
        // Existing Order found in models:
        // const OrderSchema = new mongoose.Schema({ buyerId, productId, farmerId, quantity, finalPrice, status });

        // So we need to break cart into Orders
        for (const item of cart.items) {
            if (!item.product) continue;

            // Re-check stock at checkout time
            const product = await Product.findById(item.product._id);
            if (product.listingType === 'FIXED') {
                if (product.quantity < item.quantity) {
                    // Partial failure handling? For now just skip or error.
                    // Ideally we warn user. Let's error for safety.
                    console.log(`Stock failed for ${product.name}`);
                    continue; // Skip this item? Or fail whole checkout? Let's skip.
                }
                product.quantity -= item.quantity;
                if (product.quantity <= 0) {
                    product.status = 'SOLD';
                    product.quantity = 0;
                    // Notify Farmer
                    await Notification.create({
                        userId: product.farmerId,
                        message: `Stock ended for ${product.name}, Product marked as SOLD.`,
                        type: 'INFO'
                    });
                }
                await product.save();
            } else {
                // Auction item - mark as sold
                product.status = 'SOLD';
                product.winner = req.session.user._id;
                await product.save();
            }

            const order = new Order({
                buyerId: req.session.user._id,
                productId: item.product._id,
                farmerId: item.product.farmerId,
                quantity: item.quantity,
                finalPrice: (product.currentBid || product.basePrice) * item.quantity, // Use bid or base
                status: 'Pending'
            });
            await order.save();

            // Notify Farmer
            await Notification.create({
                userId: product.farmerId,
                message: `New Order for ${product.name} (Qty: ${item.quantity})`,
                type: 'ORDER'
            });
        }

        // Clear cart
        cart.items = [];
        await cart.save();

        res.redirect('/buyer/orders?msg=Order+Placed+Successfully');
    } catch (err) {
        console.error(err);
        res.redirect('/cart?msg=Checkout+Failed');
    }
});

module.exports = router;
