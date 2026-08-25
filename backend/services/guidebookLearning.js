const Guidebook = require("../models/Guidebook");
const { createGuidebookOverride } = require("./playbookService");
const { exampleSimilarity } = require("../constants/exampleMatching");

const MAX_LEARNED = 80;
const APPROVED_MATCH_THRESHOLD = 0.82;
const REJECTED_REPLY_THRESHOLD = 0.88;

async function appendExampleComment(entry, text) {
    if (!entry?._id || !text?.trim()) {
        return { added: false, exampleCount: entry?.exampleComments?.length || 0 };
    }

    const trimmed = text.trim();
    const examples = [...(entry.exampleComments || [])];
    if (examples.some((e) => e.trim().toLowerCase() === trimmed.toLowerCase())) {
        return { added: false, exampleCount: examples.length };
    }

    examples.push(trimmed);
    await Guidebook.findByIdAndUpdate(entry._id, { $set: { exampleComments: examples } });
    entry.exampleComments = examples;
    return { added: true, exampleCount: examples.length };
}

async function resolveGuidebookEntry(pageId, category) {
    if (!category) return null;

    const filter = pageId ? { pageId, category } : { pageId: null, category };
    let entry = await Guidebook.findOne(filter);
    if (!entry && pageId) {
        entry = await createGuidebookOverride(pageId, category, {});
    }
    if (!entry) {
        entry = await Guidebook.findOne({ pageId: null, category });
    }
    return entry;
}

function normalizeReplyForStorage(reply, username) {
    let text = (reply || "").trim();
    if (!text) return "";
    const u = (username || "").trim();
    if (u && !/^(unknown|anonymous)$/i.test(u)) {
        text = text.replace(new RegExp(u.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "{{username}}");
    }
    return text;
}

function pushLearned(list, item, keyFn) {
    const next = Array.isArray(list) ? [...list] : [];
    const key = keyFn(item);
    const idx = next.findIndex((row) => keyFn(row) === key);
    if (idx >= 0) next.splice(idx, 1);
    next.push(item);
    if (next.length > MAX_LEARNED) next.splice(0, next.length - MAX_LEARNED);
    return next;
}

async function learnFromApproval({ pageId, category, commentText, replyText, username }) {
    const entry = await resolveGuidebookEntry(pageId, category);
    if (!entry || !commentText?.trim() || !replyText?.trim()) {
        return { learned: false, reason: "missing_entry_or_text" };
    }

    const comment = commentText.trim();
    const reply = normalizeReplyForStorage(replyText, username);
    await appendExampleComment(entry, comment);

    entry.approvedReplies = pushLearned(
        entry.approvedReplies,
        { comment, reply, learnedAt: new Date() },
        (row) => `${row.comment}`.toLowerCase()
    );

    entry.rejectedReplies = (entry.rejectedReplies || []).filter(
        (row) => exampleSimilarity(comment, row.comment) < APPROVED_MATCH_THRESHOLD
    );

    await entry.save();
    return {
        learned: true,
        category: entry.category,
        approvedCount: entry.approvedReplies.length,
        exampleCount: entry.exampleComments.length,
    };
}

async function learnFromRejection({ pageId, category, commentText, replyText }) {
    const entry = await resolveGuidebookEntry(pageId, category);
    if (!entry || !commentText?.trim()) {
        return { learned: false, reason: "missing_entry_or_text" };
    }

    const comment = commentText.trim();
    const reply = (replyText || "").trim();
    if (reply) {
        entry.rejectedReplies = pushLearned(
            entry.rejectedReplies,
            { comment, reply, learnedAt: new Date() },
            (row) => `${row.comment}|${row.reply}`.toLowerCase()
        );
    }

    await entry.save();
    return {
        learned: true,
        category: entry.category,
        rejectedCount: (entry.rejectedReplies || []).length,
    };
}

function findLearnedApprovedReply(guidebook, commentText) {
    const rows = guidebook?.approvedReplies || [];
    if (!commentText?.trim() || !rows.length) return null;

    let best = null;
    let bestSim = 0;
    for (const row of rows) {
        const sim = exampleSimilarity(commentText, row.comment);
        if (sim >= APPROVED_MATCH_THRESHOLD && sim > bestSim && row.reply?.trim()) {
            bestSim = sim;
            best = row.reply.trim();
        }
    }
    return best;
}

function isSimilarToRejectedReply(guidebook, commentText, replyText) {
    const rows = guidebook?.rejectedReplies || [];
    if (!commentText?.trim() || !replyText?.trim() || !rows.length) return false;

    const replyNorm = replyText.trim().toLowerCase();
    for (const row of rows) {
        if (exampleSimilarity(commentText, row.comment) < APPROVED_MATCH_THRESHOLD) continue;
        const rejected = (row.reply || "").trim().toLowerCase();
        if (!rejected) continue;
        if (rejected === replyNorm) return true;
        if (exampleSimilarity(replyText, row.reply) >= REJECTED_REPLY_THRESHOLD) return true;
    }
    return false;
}

module.exports = {
    resolveGuidebookEntry,
    appendExampleComment,
    learnFromApproval,
    learnFromRejection,
    findLearnedApprovedReply,
    isSimilarToRejectedReply,
};
