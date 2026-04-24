const express = require("express");
const cors = require("cors");

const adsRoutes = require("./routes/ads");
const instaRoutes = require("./routes/instagram");
const facebookRoutes = require("./routes/facebook");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/ads", adsRoutes);
app.use("/api/instagram", instaRoutes);
app.use("/api/facebook", facebookRoutes);

app.listen(5000, () => {
    console.log("Server running on port 5000");
});