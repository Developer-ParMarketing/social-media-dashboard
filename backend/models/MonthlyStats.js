const mongoose = require("mongoose");

const MonthlyStatsSchema = new mongoose.Schema({
    pageId: { type: String, required: true },
    month: { type: String, required: true },
    facebook: {
        posts: Number, reels: Number, videos: Number,
        likes: Number, comments: Number, shares: Number,
        views: Number, engagement: Number, reach: Number,
    },
    instagram: {
        posts: Number, reels: Number,
        likes: Number, comments: Number, shares: Number,
        saves: Number, views: Number, engagement: Number,
        reach: Number, totalWatchTimeSec: Number,
    },
    lastSynced: { type: Date, default: Date.now },
}, { timestamps: true });

MonthlyStatsSchema.index({ pageId: 1, month: 1 }, { unique: true });

module.exports = mongoose.model("MonthlyStats", MonthlyStatsSchema);