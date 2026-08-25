const mongoose = require("mongoose");
const { CATEGORIES, PRIORITIES } = require("../constants/moderation");

const GuidebookSchema = new mongoose.Schema({
    /** null = global default; set pageId to override per brand/page */
    pageId: { type: String, default: null, index: true },

    category: {
        type: String,
        required: true,
        enum: CATEGORIES,
        index: true,
    },
    label: { type: String, required: true },

    /** Keywords/phrases that trigger this category (case-insensitive substring match) */
    triggers: { type: [String], default: [] },

    /** Example comments used to train / validate matching quality */
    exampleComments: { type: [String], default: [] },

    /** Human-approved comment → reply pairs for this category */
    approvedReplies: [{
        comment: String,
        reply: String,
        learnedAt: { type: Date, default: Date.now },
    }],

    /** Rejected suggestions — avoid similar replies for similar comments */
    rejectedReplies: [{
        comment: String,
        reply: String,
        learnedAt: { type: Date, default: Date.now },
    }],

    description: String,

    /** How the agent should respond — tone, empathy, steps */
    instructions: { type: String, required: true },

    /** Phrases that must never appear in a public reply */
    dontSay: { type: [String], default: [] },

    /** Reply template with {{username}}, {{issue}}, {{brand}} placeholders */
    template: { type: String, required: true },

    /** Alternate templates picked by sentiment intensity (optional) */
    templates: {
        mild: { type: [String], default: [] },
        moderate: { type: [String], default: [] },
        severe: { type: [String], default: [] },
    },

    /** Minimum match confidence (0–100) to auto-assign this category */
    confidenceThreshold: { type: Number, default: 55, min: 0, max: 100 },

    defaultPriority: { type: String, enum: PRIORITIES, default: "normal" },
    recommendedAction: { type: String, default: "reply_publicly" },

    /** Escalation keywords specific to this category */
    escalationTriggers: { type: [String], default: [] },

    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
}, { timestamps: true });

GuidebookSchema.index({ pageId: 1, category: 1 }, { unique: true });

module.exports = mongoose.model("Guidebook", GuidebookSchema);
