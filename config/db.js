// config/db.js
const mongoose = require("mongoose");

function connect() {
  const mongoUri = process.env.MONGO_URI;
  
  if (!mongoUri) {
    console.error("❌ MONGO_URI is not set in .env file");
    console.log("Please set MONGO_URI in your .env file with your MongoDB Atlas connection string");
    console.log("Format: mongodb+srv://<username>:<password>@cluster.mongodb.net/agreeconnect?retryWrites=true&w=majority");
    process.exit(1);
  }

  // Check if MONGO_URI still has placeholder values
  if (mongoUri.includes('<username>') || mongoUri.includes('<password>')) {
    console.error("❌ Please replace <username> and <password> in MONGO_URI with your actual MongoDB Atlas credentials");
    process.exit(1);
  }

  // MongoDB Atlas connection (mongoose 7+ handles options automatically)
  mongoose.connect(mongoUri)
    .then(() => {
      console.log("✅ MongoDB Atlas Connected Successfully");
    })
    .catch(err => {
      console.error("❌ DB Connection Error:", err.message);
      console.log("\n💡 Troubleshooting:");
      console.log("   1. Check your MongoDB Atlas cluster is running");
      console.log("   2. Verify your IP address is whitelisted in Atlas → Network Access");
      console.log("   3. Confirm your database user credentials are correct");
      console.log("   4. Ensure your MONGO_URI format is correct");
      console.log("   5. Make sure you've replaced <username> and <password> in .env");
      process.exit(1);
    });
}

module.exports = { connect };
