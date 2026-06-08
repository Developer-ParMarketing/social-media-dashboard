const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");


const adsRoutes = require("./routes/ads");
const instaRoutes = require("./routes/instagram");
const facebookRoutes = require("./routes/facebook");
const syncRoutes = require("./routes/sync");


const app = express();

app.use(cors());
app.use(express.json());

// mongoose.connect("mongodb://admin:Admin%40123@14.96.214.34:27017/social_dashboard?authSource=admin")
mongoose.connect("mongodb://admin:Parmarketing%404545%23@localhost:27017/social_dashboard?authSource=admin")
    .then(() => console.log("MongoDB connected"))
    .catch((err) => console.error("MongoDB connection error:", err));


app.use("/api/ads", adsRoutes);
app.use("/api/instagram", instaRoutes);
app.use("/api/facebook", facebookRoutes);
app.use("/api/sync", syncRoutes);

app.listen(8019, () => {
    console.log("Server running on port 8019");
});