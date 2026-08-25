const mongoose = require("mongoose");
const {
    SENTIMENTS,
    REPLY_STATUSES,
    PRIORITIES,
    CLASSIFICATION_METHODS,
    CATEGORIES,
} = require("../constants/moderation");

const AnalysisSchema = new mongoose.Schema({
    sentiment: { type: String, enum: SENTIMENTS, default: "unreviewed" },
    sentimentScore: Number,
    sentimentConfidence: Number,
    classificationMethod: { type: String, enum: CLASSIFICATION_METHODS, default: "hybrid" },
    matchedCategory: { type: String, enum: [...CATEGORIES, null], default: null },
    matchedCategories: { type: [String], enum: CATEGORIES, default: [] },
    categoryMatches: [{
        category: { type: String, enum: CATEGORIES },
        guidebookId: { type: mongoose.Schema.Types.ObjectId, ref: "Guidebook" },
        confidence: Number,
        triggers: [String],
    }],
    matchedGuidebookId: { type: mongoose.Schema.Types.ObjectId, ref: "Guidebook" },
    matchedTriggers: [String],
    matchConfidence: Number,
    overallConfidence: Number,
    priority: { type: String, enum: PRIORITIES, default: "normal" },
    recommendedAction: String,
    escalationReason: String,
    isLeadInquiry: { type: Boolean, default: false },
    complaintFallbackUsed: { type: Boolean, default: false },
    analyzedAt: Date,
    analyzedTextHash: String,
}, { _id: false });

const ReplySchema = new mongoose.Schema({
    status: { type: String, enum: REPLY_STATUSES, default: "unreviewed" },
    suggestedReply: String,
    finalReply: String,
    reviewedBy: String,
    reviewedAt: Date,
    repliedAt: Date,
    platformReplyId: String,
}, { _id: false });

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
    isBrandAuthored: { type: Boolean, default: false },
    // IG-specific
    replies: { type: Array, default: [] },
    lastSynced: { type: Date, default: Date.now },
    lastCommentCheck: { type: Date, default: null },
    analysis: { type: AnalysisSchema, default: () => ({}) },
    reply: { type: ReplySchema, default: () => ({}) },
}, { timestamps: true });

CommentSchema.index({ pageId: 1, commentId: 1, platform: 1 }, { unique: true });
CommentSchema.index({ pageId: 1, postId: 1 });
CommentSchema.index({ pageId: 1, "reply.status": 1, "analysis.sentiment": 1 });
CommentSchema.index({ pageId: 1, "analysis.priority": 1 });
CommentSchema.index({ pageId: 1, "analysis.matchedCategory": 1 });
CommentSchema.index({ pageId: 1, "analysis.matchedCategories": 1 });
module.exports = mongoose.model("Comment", CommentSchema);