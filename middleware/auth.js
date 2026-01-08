const User = require('../models/User');

// attachUser: attach a user object to res.locals.user safely
// It will not throw if session is missing and will set res.locals.user = null when unauthenticated
async function attachUser(req, res, next) {
  try {
    res.locals.user = null;
    if (req.session && req.session.user) {
      // If session stores full user object
      res.locals.user = req.session.user;
      return next();
    }

    if (req.session && req.session.userId) {
      // Attempt to load user lazily, but don't fail the request if DB is down
      try {
        const user = await User.findById(req.session.userId).lean();
        res.locals.user = user || null;
      } catch (err) {
        res.locals.user = null;
      }
    }

    return next();
  } catch (err) {
    res.locals.user = null;
    return next();
  }
}

// 🔐 Only logged-in users
function isLoggedIn(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.redirect('/auth/login');
  }
  // Ensure res.locals.user is set
  if (!res.locals.user) {
    res.locals.user = req.session.user;
  }
  return next();
}

// 👨‍🌾 Farmer only
function isFarmer(req, res, next) {
  const user = res.locals.user || req.session?.user;
  if (!user || user.role !== 'farmer') {
    return res.status(403).send('Forbidden: Farmers only');
  }
  return next();
}

// 🧑‍💼 Buyer only
function isBuyer(req, res, next) {
  const user = res.locals.user || req.session?.user;
  if (!user || user.role !== 'buyer') {
    return res.status(403).send('Forbidden: Buyers only');
  }
  return next();
}

// 🛠 Admin only
function isAdmin(req, res, next) {
  const user = res.locals.user || req.session?.user;
  if (!user || user.role !== 'admin') {
    return res.status(403).send('Forbidden: Admins only');
  }
  return next();
}

module.exports = {
  attachUser,
  isLoggedIn,
  isFarmer,
  isBuyer,
  isAdmin
};
