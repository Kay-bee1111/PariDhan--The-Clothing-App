// Backend
require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const app = express();

const jwtSecret = process.env.JWT_SECRET || "defaultSecretKey";

app.use(express.json());

app.use(cors({ origin: "http://localhost:3000", credentials: true }));


mongoose.connect("mongodb://localhost:27017/ecommerce", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Product Schema
const ProductSchema = new mongoose.Schema({
  name: String,
  price: Number,
  image: String,
});
const Product = mongoose.model("Product", ProductSchema);

// User Schema
const UserSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
  cart: [{ productId: mongoose.Schema.Types.ObjectId, quantity: Number }],
  favorites: [{ productId: mongoose.Schema.Types.ObjectId }],
});
const User = mongoose.model("User", UserSchema);

// ✅ Order Schema (New)
const OrderSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  products: [{ productId: mongoose.Schema.Types.ObjectId, quantity: Number }],
  totalAmount: Number,
  status: { type: String, default: "Pending" }, // Pending, Shipped, Delivered, Canceled
  createdAt: { type: Date, default: Date.now }
});
const Order = mongoose.model("Order", OrderSchema);

// Middleware for authentication
const authenticate = (req, res, next) => {
  const authHeader = req.header("Authorization");
  if (!authHeader) return res.status(401).json({ error: "Access denied" });

  const token = authHeader.split(" ")[1]; // Remove "Bearer" prefix
  try {
    const verified = jwt.verify(token, jwtSecret);
    req.user = verified;
    next();
  } catch (error) {
    res.status(400).json({ error: "Invalid token" });
  }
};

// ✅ Place Order API (Moves items from cart to orders)
app.post("/orders", authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (user.cart.length === 0) {
      return res.status(400).json({ error: "Cart is empty" });
    }

    // Calculate total amount
    let totalAmount = 0;
    for (const item of user.cart) {
      const product = await Product.findById(item.productId);
      if (product) {
        totalAmount += product.price * item.quantity;
      }
    }

    // Create Order
    const order = new Order({
      userId: user._id,
      products: user.cart,
      totalAmount,
    });

    await order.save();
    user.cart = []; // Empty the cart after ordering
    await user.save();

    res.json({ message: "Order placed successfully", order });
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});
// ✅ Get all products API (Fix for 404 error)
app.get("/products", async (req, res) => {
  try {
    const products = await Product.find();
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});


// ✅ Get User Orders API
app.get("/orders", authenticate, async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.user.id }).populate("products.productId");
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ✅ Cancel Order API
app.delete("/orders/:orderId", authenticate, async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.orderId, userId: req.user.id });
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (order.status !== "Pending") {
      return res.status(400).json({ error: "Only pending orders can be canceled" });
    }

    order.status = "Canceled";
    await order.save();
    res.json({ message: "Order canceled successfully" });
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.listen(5000, () => console.log("Server running on port 5000"));
