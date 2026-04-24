const express = require("express");
const router = express.Router();
const { getAdsInsights } = require("../controllers/adsController");

router.get("/insights", getAdsInsights);

module.exports = router;