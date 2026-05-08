const mongoose = require("mongoose");

const CommentSchema = new mongoose.Schema({
    pageId: { type: String, required: true, index: true },
    postId: { type: String, required: true },
    platform: { type: String, enum: ["facebook", "instagram"] },
    commentId: { type: String, required: true },
    username: String,
    text: String,
    timestamp: Date,
    // FB-specific
    fromName: String,
    fromId: String,
    likeCount: Number,
    // IG-specific
    replies: { type: Array, default: [] },
    lastSynced: { type: Date, default: Date.now },
}, { timestamps: true });

CommentSchema.index({ pageId: 1, commentId: 1, platform: 1 }, { unique: true });

module.exports = mongoose.model("Comment", CommentSchema);