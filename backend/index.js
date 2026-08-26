const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
require("dotenv").config();

const adsRoutes = require("./routes/ads");
const instaRoutes = require("./routes/instagram");
const facebookRoutes = require("./routes/facebook");
const syncRoutes = require("./routes/sync");
const commentsRoutes = require("./routes/comments");

const app = express();
const PORT = process.env.PORT || 8019;

// Local dev: mongodb://127.0.0.1:27017/social_dashboard
// Team server (if reachable): mongodb://admin:Admin%40123@14.96.214.34:27017/social_dashboard?authSource=admin
const MONGODB_URI =
    process.env.MONGODB_URI ||
    "mongodb://admin:Parmarketing%404545%23@127.0.0.1:27017/social_dashboard?authSource=admin";

app.use(cors());
app.use(express.json());

async function start() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log("MongoDB connected");
    } catch (err) {
        console.error("MongoDB connection error:", err.message);
        console.error(
            "Start MongoDB locally (brew services start mongodb-community) or set MONGODB_URI in backend/.env"
        );
        process.exit(1);
    }

    app.use("/api/ads", adsRoutes);
    app.use("/api/instagram", instaRoutes);
    app.use("/api/facebook", facebookRoutes);
    app.use("/api/sync", syncRoutes);
    app.use("/api/comments", commentsRoutes);

    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

start();