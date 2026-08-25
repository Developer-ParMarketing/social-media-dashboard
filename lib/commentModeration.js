export const CATEGORY_LABELS = {
    poor_service: "Poor Service",
    pricing: "Pricing / Refund",
    delay: "Delay",
    technical_issue: "Technical",
    complaint: "Complaint",
    scam_fraud: "Scam / Fraud",
    accusation: "Accusation",
    angry_customer: "Angry Customer",
    abuse_harassment: "Abuse / Harassment",
};

export const SENTIMENT_STYLES = {
    negative: "bg-red-100 text-red-700 border-red-200",
    positive: "bg-green-100 text-green-700 border-green-200",
    neutral: "bg-gray-100 text-gray-600 border-gray-200",
    spam: "bg-orange-100 text-orange-700 border-orange-200",
    abuse: "bg-purple-100 text-purple-800 border-purple-300",
    unreviewed: "bg-slate-100 text-slate-600 border-slate-200",
};

export const PRIORITY_STYLES = {
    critical: "bg-red-600 text-white",
    high: "bg-amber-500 text-white",
    normal: "bg-slate-200 text-slate-700",
};

export const STATUS_STYLES = {
    unreviewed: "bg-slate-100 text-slate-600",
    suggested: "bg-blue-100 text-blue-700",
    approved: "bg-indigo-100 text-indigo-700",
    rejected: "bg-rose-100 text-rose-700",
    ignored: "bg-gray-100 text-gray-500",
    replied: "bg-emerald-100 text-emerald-700",
};

/** Approve/reject/ignore/replied — one-time human review, locked in DB */
export const TERMINAL_REPLY_STATUSES = Object.freeze([
    "approved",
    "rejected",
    "ignored",
    "replied",
]);

export function isReplyReviewLocked(reply) {
    return TERMINAL_REPLY_STATUSES.includes(reply?.status);
}

/** Text shown in report “Final / Posted Reply” — only after a review decision */
export function getReviewedFinalReply(reply) {
    if (!reply || !isReplyReviewLocked(reply)) return "";
    return (reply.finalReply || "").trim();
}

/** Row/card highlight for negative & spam */
export function getCommentHighlightClass(analysis) {
    const sentiment = analysis?.sentiment;
    const priority = analysis?.priority;

    if (sentiment === "spam") {
        return "border-l-4 border-l-orange-500 bg-gradient-to-r from-orange-50 to-orange-50/30 ring-1 ring-orange-200/80";
    }
    if (sentiment === "abuse") {
        return "border-l-4 border-l-purple-600 bg-gradient-to-r from-purple-100 to-purple-50/40 ring-1 ring-purple-300";
    }
    if (sentiment === "negative") {
        if (priority === "critical") {
            return "border-l-4 border-l-red-600 bg-gradient-to-r from-red-100 to-red-50/40 ring-1 ring-red-300";
        }
        return "border-l-4 border-l-red-500 bg-gradient-to-r from-red-50 to-red-50/30 ring-1 ring-red-200/80";
    }
    return "border-l-4 border-l-transparent";
}

export function isFlaggedComment(analysis) {
    return analysis?.sentiment === "negative" || analysis?.sentiment === "spam" || analysis?.sentiment === "abuse";
}

export function isAbuseComment(analysis) {
    return analysis?.sentiment === "abuse";
}

export function isSpamComment(analysis) {
    return analysis?.sentiment === "spam";
}

export function getFlaggedLabel(analysis) {
    if (analysis?.sentiment === "abuse") return "Abuse / Harassment";
    if (analysis?.sentiment === "spam") return "Spam";
    if (analysis?.sentiment === "negative") return "Negative";
    return null;
}

export function getFlaggedBadgeStyle(analysis) {
    if (analysis?.sentiment === "spam") return "bg-orange-200 text-orange-900 border-orange-300";
    if (analysis?.sentiment === "abuse") return "bg-purple-200 text-purple-900 border-purple-300";
    return "bg-red-200 text-red-900 border-red-300";
}

/** CS guidebook replies apply only to negative complaints — not spam or abuse */
export function getMatchedCategories(analysis) {
    if (analysis?.matchedCategories?.length) return analysis.matchedCategories;
    if (analysis?.matchedCategory) return [analysis.matchedCategory];
    return [];
}

export function getCategoryMatchLabels(analysis) {
    return getMatchedCategories(analysis).map((cat) => CATEGORY_LABELS[cat] || cat);
}

export function isPrimaryCategory(analysis, category) {
    return analysis?.matchedCategory === category;
}

export function isLeadInquiry(analysis) {
    return Boolean(analysis?.isLeadInquiry);
}

/** Human-readable labels for matchedTriggers prefixes */
export function formatMatchTrigger(trigger) {
    if (!trigger) return "";
    if (trigger.startsWith("example:")) return `Example match: ${trigger.slice(8)}`;
    if (trigger.startsWith("hinglish:")) return `Hinglish: ${trigger.slice(9)}`;
    if (trigger.startsWith("fuzzy:")) return `Typo match: ${trigger.slice(6)}`;
    if (trigger.startsWith("context:")) return `Context: ${trigger.slice(8)}`;
    if (trigger.startsWith("abuse:")) return `Abuse: ${trigger.slice(6)}`;
    if (trigger.startsWith("lead:")) return "Lead inquiry";
    if (trigger === "general concern") return "General concern (weak)";
    return trigger;
}

export function getMatchInsight(analysis) {
    if (!analysis) return null;
    const triggers = (analysis.matchedTriggers || []).map(formatMatchTrigger).filter(Boolean);
    return {
        categories: getMatchedCategories(analysis),
        categoryLabels: getCategoryMatchLabels(analysis),
        primaryCategory: analysis.matchedCategory,
        triggers,
        matchConfidence: analysis.matchConfidence ?? null,
        overallConfidence: analysis.overallConfidence ?? null,
        complaintFallbackUsed: Boolean(analysis.complaintFallbackUsed),
        isLeadInquiry: Boolean(analysis.isLeadInquiry),
        classificationMethod: analysis.classificationMethod,
    };
}

export function getPrimaryCategory(analysis) {
    if (!analysis) return null;
    return analysis.matchedCategory || analysis.matchedCategories?.[0] || null;
}

/** CS approve-and-post workflow — not for spam/abuse action notes */
export function needsCustomerServiceReply(analysis) {
    return analysis?.sentiment === "negative";
}

/** Any highlighted comment should show a suggested reply or action */
export function shouldShowSuggestedReply(analysis) {
    return analysis?.sentiment === "negative" || analysis?.sentiment === "spam" || analysis?.sentiment === "abuse";
}

export function getSuggestedReplyLabel(analysis) {
    if (analysis?.sentiment === "spam" || analysis?.sentiment === "abuse") return "Suggested action";
    return "Suggested reply";
}

export function countFlaggedComments(comments) {
    return (comments || []).filter((c) => isFlaggedComment(c.analysis) && !isBrandComment(c)).length;
}

/** Comment authored by the page/brand (e.g. SingleDebt) — not a customer comment */
export function isBrandComment(comment, brandNames = []) {
    if (comment?.isBrandAuthored) return true;
    const names = brandNames.filter(Boolean).map((n) => n.toLowerCase());
    const u = (comment?.username || comment?.fromName || "").toLowerCase();
    if (!u || names.length === 0) return false;
    return names.some((n) => n && (u === n || u.includes(n) || n.includes(u)));
}

/** Customer comments only, with orphan page replies attached */
export function filterCustomerComments(comments, brandNames = []) {
    return (comments || []).filter((c) => !isBrandComment(c, brandNames));
}

/** Replies on the platform posted by the page/brand (e.g. SingleDebt) */
export function extractPageReplies(comment, brandNames = []) {
    const names = brandNames.filter(Boolean).map((n) => n.toLowerCase());
    return (comment.replies || []).filter((r) => {
        const u = (r.username || r.from?.name || r.fromName || "").toLowerCase();
        return names.some((n) => n && (u.includes(n) || n.includes(u)));
    });
}

export function getPageReplyText(comment, brandNames) {
    const pageReplies = extractPageReplies(comment, brandNames);
    if (!pageReplies.length) return null;
    const r = pageReplies[0];
    return r.text || r.message || "";
}

function normalizeReplyText(text) {
    return (text || "")
        .toLowerCase()
        .replace(/contact youwithin/gi, "contact you within")
        .replace(/(\d+)\s*hrs/gi, "$1 hrs")
        .replace(/\s+/g, " ")
        .trim();
}

function replyIntentSet(text) {
    const n = normalizeReplyText(text);
    const intents = new Set();
    if (/\b(dm|direct message|inbox|message us|reach out)\b/i.test(n)) intents.add("dm");
    if (/\b(phone|number|contact|call|whatsapp|reach|touch|consultation|details)\b/i.test(n)) intents.add("contact");
    if (/\b(help|assist|support|look into|resolve|fix|experts?|get back|will contact you|contact you\s*within|contact you)\b/i.test(n)) {
        intents.add("help");
    }
    if (/\b(sorry|apolog|regret|understand|concern)\b/i.test(n)) intents.add("empathy");
    if (/\b(share your contact|share your contact number|contact number|contact details|along with concern|get back to you|will contact you|contact you\s*within)\b/i.test(n)) {
        intents.add("contact");
        intents.add("help");
    }
    return intents;
}

/** Team reply already follows CS playbook — don't nag reviewer to change it */
function isPageReplyAdequate(posted, suggested, analysis) {
    const postedNorm = normalizeReplyText(posted);
    const suggestedNorm = normalizeReplyText(suggested);
    if (!postedNorm) return false;

    if (postedNorm === suggestedNorm) return true;
    if (postedNorm.length > 20 && suggestedNorm.length > 20) {
        if (postedNorm.includes(suggestedNorm.slice(0, 30)) || suggestedNorm.includes(postedNorm.slice(0, 30))) {
            return true;
        }
    }

    // Standard lead-capture: ask for contact + concern + promise follow-up (handles typos like "contact youwithin")
    if (
        /\b(kindly\s+dm|share your contact|share your contact number|contact number|contact details|contact detail)\b/i.test(postedNorm)
        && /\b(will contact you|contact you\s*within|get back|get in touch|within \d+|48\s*hr|hours)\b/i.test(postedNorm)
    ) {
        return true;
    }
    if (
        /\b(share your contact|contact number)\b/i.test(postedNorm)
        && /\bconcern\b/i.test(postedNorm)
        && /\b(will contact you|contact you\s*within|within \d+|48\s*hr)\b/i.test(postedNorm)
    ) {
        return true;
    }

    const postedIntents = replyIntentSet(posted);
    const suggestedIntents = replyIntentSet(suggested);

    let overlap = 0;
    for (const intent of postedIntents) {
        if (suggestedIntents.has(intent)) overlap += 1;
    }

    const csCategories = new Set([
        "technical_issue", "complaint", "poor_service", "pricing", "delay", "angry_customer", "accusation", "scam_fraud",
    ]);
    const category = analysis?.matchedCategory;

    if (postedIntents.has("contact") && postedIntents.has("help")) {
        if (!category || csCategories.has(category)) return true;
    }

    if (postedIntents.has("dm") && (postedIntents.has("contact") || postedIntents.has("help"))) {
        if (!category || csCategories.has(category)) return true;
    }

    if (overlap >= 2 && (postedIntents.has("dm") || postedIntents.has("contact"))) return true;

    return false;
}

/** True when a flagged comment has a page reply that differs from our suggestion */
export function pageReplyNeedsReview(comment, brandNames) {
    if (!needsCustomerServiceReply(comment.analysis)) return false;
    if (!isFlaggedComment(comment.analysis)) return false;
    const posted = getPageReplyText(comment, brandNames);
    const suggested = comment.reply?.suggestedReply || comment.reply?.finalReply;
    if (!posted && suggested) return true;
    if (!posted) return false;
    if (!suggested) return false;

    if (isPageReplyAdequate(posted, suggested, comment.analysis)) return false;

    const a = normalizeReplyText(posted);
    const b = normalizeReplyText(suggested);
    if (a === b) return false;
    if (a.length > 20 && b.length > 20 && (a.includes(b.slice(0, 30)) || b.includes(a.slice(0, 30)))) return false;
    return true;
}
