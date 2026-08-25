/** Shared enums — single source of truth for moderation workflow */

const SENTIMENTS = Object.freeze([
    "unreviewed",
    "positive",
    "neutral",
    "negative",
    "spam",
    "abuse",
]);

const REPLY_STATUSES = Object.freeze([
    "unreviewed",
    "suggested",
    "approved",
    "rejected",
    "ignored",
    "replied",
]);

const PRIORITIES = Object.freeze(["normal", "high", "critical"]);

const CLASSIFICATION_METHODS = Object.freeze([
    "keyword",
    "nlp",
    "hybrid",
    "manual",
]);

const CATEGORIES = Object.freeze([
    "poor_service",
    "pricing",
    "delay",
    "technical_issue",
    "complaint",
    "scam_fraud",
    "accusation",
    "angry_customer",
    "abuse_harassment",
]);

const RECOMMENDED_ACTIONS = Object.freeze([
    "reply_publicly",
    "dm_customer",
    "internal_review",
    "escalate_legal",
    "hide_comment",
    "no_action",
    "escalate_hr",
]);

const CATEGORY_LABELS = Object.freeze({
    poor_service: "Poor Service",
    pricing: "Pricing / Refund",
    delay: "Delay / Delivery",
    technical_issue: "Technical Issue",
    complaint: "General Complaint",
    scam_fraud: "Scam / Fraud",
    accusation: "Accusation",
    angry_customer: "Angry Customer",
    abuse_harassment: "Abuse / Harassment",
});

module.exports = {
    SENTIMENTS,
    REPLY_STATUSES,
    PRIORITIES,
    CLASSIFICATION_METHODS,
    CATEGORIES,
    RECOMMENDED_ACTIONS,
    CATEGORY_LABELS,
};
