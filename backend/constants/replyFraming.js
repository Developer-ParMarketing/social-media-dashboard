/**
 * Universal reply framing policy — applies to every negative comment.
 *
 * Default: category-specific reply WITHOUT quoting the customer's words.
 * Embed {{issue}} ONLY when we have a curated English summary and strong match confidence.
 */

const natural = require("natural");
const { CATEGORY_LABELS } = require("./moderation");
const { resolveHinglishIssueLabel, isHinglishDominant, PHRASE_LABELS } = require("./hinglishIssueLabels");

const MIN_CONFIDENCE_TO_EMBED = 62;

/** Category replies when we must NOT quote the comment (safe default for all cases) */
const NO_ISSUE_TEMPLATES = Object.freeze({
    angry_customer: "Hi {{username}}, we're sorry to have disappointed you. {{cta}}",
    complaint: "Hi {{username}}, we're sorry to hear about your experience. {{cta}}",
    poor_service: "Hi {{username}}, we're truly sorry about your experience with us. {{cta}}",
    pricing: "Hi {{username}}, we'd like to look into your billing concern. {{cta}}",
    delay: "Hi {{username}}, we're sorry for the inconvenience you've faced. {{cta}}",
    technical_issue: "Hi {{username}}, we're sorry you're having trouble reaching us. {{cta}}",
    scam_fraud: "Hi {{username}}, we take your concern very seriously and would like to understand privately. {{cta_urgent}}",
    accusation: "Hi {{username}}, we appreciate you raising this — we'd like to clarify. {{cta}}",
    default: "Hi {{username}}, we're sorry to hear from you on this. {{cta}}",
});

const WEAK_ISSUE_PHRASES = new Set([
    "very bad", "really bad", "bad", "worst", "complaint", "general complaint",
    "your concern", "general concern", "your recent experience", "this difficult time",
]);

const CURATED_LABELS = new Set(PHRASE_LABELS.map((p) => p.label));

function normalize(text) {
    return (text || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function issueEchoesComment(issue, commentText) {
    const i = normalize(issue);
    const c = normalize(commentText);
    if (!i || !c || i.length < 6) return false;

    if (c.includes(i) && i.length >= Math.min(20, c.length * 0.45)) return true;
    if (i.includes(c) && c.length >= 20) return true;

    try {
        if (natural.JaroWinklerDistance(i, c, { ignoreCase: true }) >= 0.82) return true;
    } catch {
        /* ignore */
    }
    return false;
}

function isCategoryLabelEcho(issue) {
    const lower = normalize(issue);
    if (!lower) return true;
    if (WEAK_ISSUE_PHRASES.has(lower)) return true;
    for (const label of Object.values(CATEGORY_LABELS)) {
        if (label.toLowerCase() === lower) return true;
    }
    for (const cat of Object.keys(CATEGORY_LABELS)) {
        if (cat.replace(/_/g, " ") === lower) return true;
    }
    return false;
}

function isCuratedSummary(issue) {
    if (!issue) return false;
    if (CURATED_LABELS.has(issue)) return true;
    if (/^(your |payment |calls being|that you|this difficult|not receiving|your fraud)/i.test(issue)) {
        return true;
    }
    return false;
}

function hasStrongTrigger(matchMeta = {}) {
    const triggers = matchMeta.matchedTriggers || [];
    return triggers.some(
        (t) =>
            t
            && !t.startsWith("context:")
            && !t.startsWith("example:")
            && t !== "general concern"
    );
}

/**
 * Can this issue phrase appear inside a public reply?
 */
function isEmbeddableIssue(issue, commentText = "") {
    if (!issue || issue === "your concern" || issue === "general concern") return false;
    if (isCategoryLabelEcho(issue)) return false;

    const lower = normalize(issue);

    if (isHinglishDominant(issue) && !isCuratedSummary(issue)) return false;

    const commentLen = (commentText || "").replace(/@\w+/g, "").trim().length;
    const wordCount = lower.split(/\s+/).filter(Boolean).length;

    if (commentLen > 30 && wordCount <= 2 && lower.length < 18) return false;
    if (issueEchoesComment(issue, commentText)) return false;

    return true;
}

/**
 * Should we use a template with {{issue}} or the safe no-issue template?
 */
function shouldEmbedIssueInReply(issue, commentText, matchMeta = {}) {
    if (!isEmbeddableIssue(issue, commentText)) return false;

    const curatedFromComment = resolveHinglishIssueLabel(commentText);
    if (curatedFromComment && normalize(issue) === normalize(curatedFromComment)) return true;
    if (isCuratedSummary(issue)) return true;

    if (matchMeta.complaintFallbackUsed || matchMeta.weakMatch) return false;

    const confidence = matchMeta.matchConfidence ?? 0;
    if (confidence < MIN_CONFIDENCE_TO_EMBED) return false;

    if (!hasStrongTrigger(matchMeta)) return false;

    const words = normalize(issue).split(/\s+/).filter(Boolean).length;
    if (words >= 3) return true;
    if (words >= 2 && issue.length >= 14) return true;

    return confidence >= 72 && words >= 1 && issue.length >= 8;
}

function pickReplyTemplate({ guidebook, category, intensity, embedIssue }) {
    if (!embedIssue) {
        return (guidebook?.templates?.noIssue
            || NO_ISSUE_TEMPLATES[category]
            || NO_ISSUE_TEMPLATES.default);
    }
    if (!guidebook?.template) {
        return NO_ISSUE_TEMPLATES[category] || NO_ISSUE_TEMPLATES.default;
    }
    const variants = guidebook.templates || {};
    if (intensity === "severe" && variants.severe) return Array.isArray(variants.severe) ? variants.severe[0] : variants.severe;
    if (intensity === "moderate" && variants.moderate) return Array.isArray(variants.moderate) ? variants.moderate[0] : variants.moderate;
    if (intensity === "mild" && variants.mild) return Array.isArray(variants.mild) ? variants.mild[0] : variants.mild;
    return guidebook.template;
}

/** Scan reply for policy violations (used in tests) */
function replyViolatesFramingPolicy(reply, commentText) {
    if (!reply) return [];
    const violations = [];
    const r = reply.toLowerCase();
    const c = normalize(commentText);

    if (/thank you for flagging/i.test(r)) violations.push("generic flagging opener");
    if (/going through this/i.test(r)) violations.push("generic going-through-this");
    if (/regarding general complaint/i.test(r)) violations.push("category label leaked");

    if (c.length >= 12 && r.includes(c.slice(0, Math.min(28, c.length)))) {
        violations.push("raw comment pasted");
    }

    for (const label of Object.values(CATEGORY_LABELS)) {
        if (r.includes(`regarding ${label.toLowerCase()}`)) {
            violations.push(`regarding category label: ${label}`);
        }
    }

    if (/\bregarding very bad\b/i.test(r)) violations.push("weak trigger quoted");

    return violations;
}

module.exports = {
    NO_ISSUE_TEMPLATES,
    WEAK_ISSUE_PHRASES,
    MIN_CONFIDENCE_TO_EMBED,
    isEmbeddableIssue,
    shouldEmbedIssueInReply,
    pickReplyTemplate,
    issueEchoesComment,
    isCategoryLabelEcho,
    replyViolatesFramingPolicy,
};
