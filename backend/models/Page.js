const mongoose = require("mongoose");

const PageSchema = new mongoose.Schema({
    pageId: { type: String, required: true, unique: true },
    name: String,
    followers: Number,
    accessToken: String,
    lastSynced: { type: Date, default: null },
    lastSyncStarted: { type: Date, default: null },
    syncStatus: { type: String, enum: ["idle", "processing", "complete", "failed"], default: "idle" },
    repliesSyncedAt: { type: Date, default: null },
    playbook: {
        replyCta: String,
        replyCtaUrgent: String,
        neutralLeadsEnabled: Boolean,
        leadInquiryTriggers: { type: [String], default: [] },
        brandDisplayName: String,
    },
}, { timestamps: true });

module.exports = mongoose.model("Page", PageSchema);