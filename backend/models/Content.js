const mongoose = require("mongoose");

const ContentSchema = new mongoose.Schema({
    pageId: { type: String, required: true, index: true },
    contentId: { type: String, required: true },
    mediaId: String,
    platform: { type: String, enum: ["facebook", "instagram"] },
    type: { type: String, enum: ["post", "reel", "video"] },
    message: String,
    image: String,
    created_time: Date,
    likes: { type: Number, default: 0 },
    comments: { type: Number, default: 0 },
    shares: { type: Number, default: 0 },
    saves: { type: Number, default: 0 },
    views: { type: Number, default: 0 },
    reach: { type: Number, default: 0 },
    engagement: { type: Number, default: 0 },
    score: { type: Number, default: 0 },
    avgWatchTimeSec: Number,
    avgWatchTimeMs: Number,
    totalWatchTimeSec: Number,
    totalWatchTimeMs: Number,
    skipRate: Number,
    skipRatePct: String,
    completionRate: Number,
    approxDurationSec: Number,
    crosspostedViews: Number,
    facebookViews: Number,
    follows: Number,
    profileVisits: Number,
    reelsReplays: Number,
    views15s: Number,
    lastSynced: { type: Date, default: Date.now },
    lastCommentCheck: { type: Date, default: null },
}, { timestamps: true });

ContentSchema.index({ pageId: 1, contentId: 1, platform: 1 }, { unique: true });
ContentSchema.index({ pageId: 1, platform: 1, type: 1, created_time: -1 });

module.exports = mongoose.model("Content", ContentSchema);