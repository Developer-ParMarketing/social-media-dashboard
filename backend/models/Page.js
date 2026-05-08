const mongoose = require("mongoose");

const PageSchema = new mongoose.Schema({
    pageId: { type: String, required: true, unique: true },
    name: String,
    followers: Number,
    accessToken: String,
    lastSynced: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model("Page", PageSchema);