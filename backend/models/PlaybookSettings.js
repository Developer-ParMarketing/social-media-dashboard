const mongoose = require("mongoose");

/** Global (pageId: null) or per-account playbook overrides */
const PlaybookSettingsSchema = new mongoose.Schema({
    pageId: { type: String, default: null, index: true, unique: true },
    replyCta: String,
    replyCtaUrgent: String,
    neutralLeadsEnabled: { type: Boolean, default: true },
    leadInquiryTriggers: { type: [String], default: [] },
    brandDisplayName: String,
}, { timestamps: true });

module.exports = mongoose.model("PlaybookSettings", PlaybookSettingsSchema);
