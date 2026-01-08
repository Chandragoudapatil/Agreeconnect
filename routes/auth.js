// routes/auth.js
const express = require("express");
const bcrypt = require("bcrypt");
const User = require("../models/User");

const router = express.Router();

router.get("/login", (req, res) => res.render("login"));
router.get("/register", (req, res) => res.render("register"));

router.post("/register", async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password || !role) {
      return res.send("❌ All fields are required");
    }

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.send("❌ Email already registered. Try login.");
    }

    const hashed = await bcrypt.hash(password, 10);

    await User.create({
      name,
      email,
      password: hashed,
      role
    });

    res.redirect("/auth/login");
  } catch (err) {
    console.error("Registration error:", err);
    res.send("❌ Registration failed. Please try again.");
  }
});


router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.send("❌ Email and password are required");
    }

    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.send("❌ Invalid Credentials");
    }

    req.session.user = user;

    if (user.role === "farmer") res.redirect("/farmer");
    else if (user.role === "buyer") res.redirect("/buyer");
    else res.redirect("/admin");
  } catch (err) {
    console.error("Login error:", err);
    res.send("❌ Login failed. Please try again.");
  }
});

router.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/auth/login"));
});

module.exports = router;
