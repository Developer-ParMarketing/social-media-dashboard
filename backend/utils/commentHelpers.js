/** Shared helpers for brand vs customer comment detection and thread shaping */

function normalizeName(s) {
    return (s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function getBrandNames(pageName, igUsername) {
    return [pageName, igUsername].filter(Boolean);
}

function isBrandAuthor(comment, brandNames = [], pageId) {
    if (comment?.isBrandAuthored) return true;

    const fromId = comment?.fromId || comment?.from?.id;
    if (fromId && pageId && String(fromId) === String(pageId)) return true;

    const names = brandNames.filter(Boolean).map(normalizeName);
    const u = normalizeName(comment?.username || comment?.fromName || comment?.from?.name || "");
    if (!u || names.length === 0) return false;

    return names.some((n) => n && (u === n || u.includes(n) || n.includes(u)));
}

function toReplyShape(r) {
    return {
        username: r.username || r.from?.name || r.fromName || "Unknown",
        text: r.text || r.message || "",
        timestamp: r.timestamp || r.created_time || null,
        from: r.from || (r.fromName ? { name: r.fromName } : undefined),
        fromName: r.fromName || r.from?.name || null,
    };
}

function pageReplyOnComment(replies, brandNames) {
    const names = brandNames.filter(Boolean).map(normalizeName);
    return (replies || []).filter((r) => {
        const u = normalizeName(r.username || r.from?.name || r.fromName || "");
        return names.some((n) => n && (u === n || u.includes(n) || n.includes(u)));
    });
}

/**
 * Facebook page replies often appear as separate top-level comments.
 * Attach them to the nearest preceding customer comment on the same post.
 */
function attachOrphanPageReplies(comments, brandNames = [], pageId) {
    const sorted = [...comments].sort((a, b) => {
        const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return ta - tb;
    });

    const customerComments = [];

    for (const c of sorted) {
        if (isBrandAuthor(c, brandNames, pageId)) {
            const reply = toReplyShape(c);
            const target = [...customerComments]
                .reverse()
                .find((cust) => {
                    if (cust.postId !== c.postId) return false;
                    const existing = pageReplyOnComment(cust.replies, brandNames);
                    return !existing.some(
                        (pr) => normalizeName(pr.text || pr.message) === normalizeName(reply.text)
                    );
                });

            if (target) {
                target.replies = target.replies || [];
                target.replies.push(reply);
            }
            continue;
        }

        customerComments.push({
            ...c,
            replies: (c.replies || []).map(toReplyShape),
        });
    }

    return customerComments.sort((a, b) => {
        const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return tb - ta;
    });
}

function shapePostComment(c) {
    return {
        _id: c._id,
        platform: c.platform,
        postId: c.postId,
        username: c.username,
        text: c.text,
        timestamp: c.timestamp,
        fromId: c.fromId,
        fromName: c.fromName,
        analysis: c.analysis || {},
        reply: c.reply || {},
        replies: c.replies || [],
    };
}

function buildCommentsByPost(allComments, brandNames = [], pageId) {
    const merged = attachOrphanPageReplies(allComments, brandNames, pageId);
    const byPost = {};

    for (const c of merged) {
        if (isBrandAuthor(c, brandNames, pageId)) continue;
        (byPost[c.postId] ||= []).push(shapePostComment(c));
    }

    return byPost;
}

function countCustomerComments(allComments, brandNames = [], pageId) {
    return attachOrphanPageReplies(allComments, brandNames, pageId).filter(
        (c) => !isBrandAuthor(c, brandNames, pageId)
    ).length;
}

module.exports = {
    normalizeName,
    getBrandNames,
    isBrandAuthor,
    toReplyShape,
    attachOrphanPageReplies,
    shapePostComment,
    buildCommentsByPost,
    countCustomerComments,
    pageReplyOnComment,
};
