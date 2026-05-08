const mongoose = require("mongoose");

const IgProfileSchema = new mongoose.Schema({
    pageId: { type: String, required: true, unique: true },
    igId: String,
    username: String,
    followers_count: Number,
    media_count: Number,
    lastSynced: { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model("IgProfile", IgProfileSchema);