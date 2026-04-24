const express = require("express");
const router = express.Router();
const {
    getMedia,
    getProfile,
    getMediaInsights,
    getBestPosts,

} = require("../controllers/instagramController");


router.get("/media", getMedia);
router.get("/profile", getProfile);
router.get("/media-insights/:id", getMediaInsights);
router.get("/best-posts", getBestPosts);


module.exports = router;