const express = require("express");
const router = express.Router();

const {
    getAccounts,
    getPageDetails,
    getInstagramMedia,
    getFacebookPosts,
    getDashboard,
    getAllComments,

} = require("../controllers/facebookController");

// 🔹 Pages list
router.get("/accounts", getAccounts);

// 🔹 Check IG linked
router.get("/page/:id", getPageDetails);

// 🔹 Instagram posts
router.get("/instagram/:igId", getInstagramMedia);

// 🔹 Facebook posts
router.get("/posts/:pageId", getFacebookPosts);
router.get("/dashboard/:pageId", getDashboard);
router.get("/comments/:pageId", getAllComments);


module.exports = router;