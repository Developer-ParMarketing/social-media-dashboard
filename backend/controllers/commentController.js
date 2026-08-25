const Comment = require("../models/Comment");
const Page = require("../models/Page");
const IgProfile = require("../models/IgProfile");
const Guidebook = require("../models/Guidebook");
const {
    analyzeCommentText,
    processCommentsForPage,
    analyzeSingleComment,
    loadGuidebooks,
    loadPlaybook,
} = require("../services/commentProcessor");
const {
    resolveBrandName,
    createGuidebookOverride,
    cloneGuidebookToPage,
    getPlaybookMeta,
    saveGlobalPlaybook,
    saveAccountPlaybook,
    clearAccountPlaybook,
    DEFAULT_PLAYBOOK,
} = require("../services/playbookService");
const { getBrandNames } = require("../utils/commentHelpers");
const {
    learnFromApproval,
    learnFromRejection,
    resolveGuidebookEntry,
    appendExampleComment,
} = require("../services/guidebookLearning");
const { schedulePageReanalysis, scheduleGuidebookReanalysis, scheduleAllPagesReanalysis } = require("../services/reanalyzeTrigger");
const { CATEGORY_LABELS, REPLY_STATUSES, SENTIMENTS, PRIORITIES } = require("../constants/moderation");

const TERMINAL_REPLY_STATUSES = new Set(["approved", "rejected", "ignored", "replied"]);

function buildInboxQuery(pageId, filters) {
    const query = {
        pageId,
        isBrandAuthored: { $ne: true },
    };

    if (filters.sentiment && filters.sentiment !== "all") {
        query["analysis.sentiment"] = filters.sentiment;
    }
    if (filters.status && filters.status !== "all") {
        query["reply.status"] = filters.status;
    }
    if (filters.category && filters.category !== "all") {
        query.$or = [
            { "analysis.matchedCategories": filters.category },
            { "analysis.matchedCategory": filters.category },
        ];
    }
    if (filters.priority && filters.priority !== "all") {
        query["analysis.priority"] = filters.priority;
    }
    if (filters.platform && filters.platform !== "all") {
        query.platform = filters.platform;
    }
    if (filters.needsReview === "true") {
        query["reply.status"] = { $in: ["unreviewed", "suggested"] };
        query["analysis.sentiment"] = { $in: ["negative", "spam", "abuse"] };
    }
    if (filters.bucket === "lead") {
        query["analysis.isLeadInquiry"] = true;
    }
    if (filters.excludeLeads === "true") {
        query["analysis.isLeadInquiry"] = { $ne: true };
    }

    return query;
}

exports.getInboxStats = async (req, res) => {
    try {
        const { pageId } = req.params;

        const [total, bySentiment, byStatus, byPriority, needsReview, leads, page] = await Promise.all([
            Comment.countDocuments({ pageId, isBrandAuthored: { $ne: true } }),
            Comment.aggregate([
                { $match: { pageId, isBrandAuthored: { $ne: true } } },
                { $group: { _id: "$analysis.sentiment", count: { $sum: 1 } } },
            ]),
            Comment.aggregate([
                { $match: { pageId, isBrandAuthored: { $ne: true } } },
                { $group: { _id: "$reply.status", count: { $sum: 1 } } },
            ]),
            Comment.aggregate([
                { $match: { pageId, isBrandAuthored: { $ne: true } } },
                { $group: { _id: "$analysis.priority", count: { $sum: 1 } } },
            ]),
            Comment.countDocuments({
                pageId,
                isBrandAuthored: { $ne: true },
                "reply.status": { $in: ["unreviewed", "suggested"] },
                "analysis.sentiment": { $in: ["negative", "spam", "abuse"] },
            }),
            Comment.countDocuments({
                pageId,
                isBrandAuthored: { $ne: true },
                "analysis.isLeadInquiry": true,
            }),
            Page.findOne({ pageId }).select("repliesSyncedAt").lean(),
        ]);

        const toMap = (arr) => Object.fromEntries(arr.map((x) => [x._id || "unknown", x.count]));

        res.json({
            success: true,
            stats: {
                total,
                needsReview,
                leads,
                bySentiment: toMap(bySentiment),
                byStatus: toMap(byStatus),
                byPriority: toMap(byPriority),
                repliesSyncedAt: page?.repliesSyncedAt || null,
            },
            labels: { categories: CATEGORY_LABELS, sentiments: SENTIMENTS, statuses: REPLY_STATUSES, priorities: PRIORITIES },
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.getInbox = async (req, res) => {
    try {
        const { pageId } = req.params;
        let { page = 1, limit = 30, sort = "priority" } = req.query;
        page = Math.max(1, parseInt(page));
        limit = Math.min(100, Math.max(1, parseInt(limit)));

        const query = buildInboxQuery(pageId, req.query);

        const sortMap = {
            priority: { "analysis.priority": -1, timestamp: -1 },
            newest: { timestamp: -1 },
            oldest: { timestamp: 1 },
            confidence: { "analysis.matchConfidence": -1, "analysis.overallConfidence": -1, timestamp: -1 },
        };

        const [items, total] = await Promise.all([
            Comment.find(query)
                .sort(sortMap[sort] || sortMap.priority)
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            Comment.countDocuments(query),
        ]);

        res.json({
            success: true,
            data: items,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
            labels: { categories: CATEGORY_LABELS },
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.getComment = async (req, res) => {
    try {
        const comment = await Comment.findById(req.params.id).lean();
        if (!comment) return res.status(404).json({ error: "Comment not found" });
        res.json({ success: true, data: comment });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.listReplyDeskAccounts = async (req, res) => {
    try {
        const accounts = await Page.find({}).select("pageId name").sort({ name: 1 }).lean();
        res.json({
            success: true,
            data: accounts.map((account) => ({
                pageId: account.pageId,
                name: account.name || account.pageId,
            })),
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.reviewComment = async (req, res) => {
    try {
        const { action, finalReply, reviewedBy, category } = req.body;
        const comment = await Comment.findById(req.params.id);
        if (!comment) return res.status(404).json({ error: "Comment not found" });

        const now = new Date();
        const currentStatus = comment.reply?.status || "unreviewed";

        if (
            (action === "approve" || action === "reject" || action === "ignore")
            && TERMINAL_REPLY_STATUSES.has(currentStatus)
        ) {
            return res.status(409).json({
                error: `Comment already reviewed (${currentStatus}). Approve/reject can only be done once.`,
            });
        }

        switch (action) {
            case "approve": {
                const approvedText = (finalReply || comment.reply.suggestedReply || "").trim();
                if (!approvedText) {
                    return res.status(400).json({ error: "No reply text to approve" });
                }
                comment.reply.status = "approved";
                comment.reply.finalReply = approvedText;
                comment.reply.reviewedBy = reviewedBy || "admin";
                comment.reply.reviewedAt = now;
                break;
            }
            case "reject": {
                const rejectedText = (finalReply || comment.reply.suggestedReply || "").trim();
                comment.reply.status = "rejected";
                comment.reply.finalReply = rejectedText;
                comment.reply.reviewedBy = reviewedBy || "admin";
                comment.reply.reviewedAt = now;
                break;
            }
            case "ignore":
                comment.reply.status = "ignored";
                comment.reply.reviewedBy = reviewedBy || "admin";
                comment.reply.reviewedAt = now;
                break;
            case "escalate":
                comment.analysis.priority = "critical";
                comment.analysis.recommendedAction = "internal_review";
                comment.reply.status = comment.reply.status === "replied" ? "replied" : "suggested";
                if (finalReply) comment.reply.finalReply = finalReply;
                break;
            case "update_reply":
                if (TERMINAL_REPLY_STATUSES.has(currentStatus)) {
                    return res.status(409).json({ error: "Cannot edit reply after review is complete." });
                }
                comment.reply.finalReply = finalReply;
                if (comment.reply.status === "unreviewed") comment.reply.status = "suggested";
                break;
            case "set_category":
                if (category) {
                    comment.analysis.matchedCategory = category;
                    comment.analysis.matchedCategories = [category];
                    comment.analysis.categoryMatches = [{
                        category,
                        confidence: 100,
                        triggers: ["manual"],
                    }];
                    comment.analysis.classificationMethod = "manual";
                }
                break;
            default:
                return res.status(400).json({ error: "Invalid action" });
        }

        await comment.save();

        let learning = null;
        const matchedCategory = comment.analysis?.matchedCategory;
        const pageScope = comment.pageId || null;

        if (action === "approve" && matchedCategory && comment.text?.trim()) {
            learning = await learnFromApproval({
                pageId: pageScope,
                category: matchedCategory,
                commentText: comment.text,
                replyText: comment.reply.finalReply || finalReply || comment.reply.suggestedReply,
                username: comment.username,
            });
        }

        if ((action === "reject" || action === "ignore") && matchedCategory && comment.text?.trim()) {
            learning = await learnFromRejection({
                pageId: pageScope,
                category: matchedCategory,
                commentText: comment.text,
                replyText: finalReply || comment.reply.suggestedReply || "",
            });
        }

        if (comment.pageId && (action === "approve" || action === "reject")) {
            schedulePageReanalysis(comment.pageId, action);
        }

        res.json({ success: true, data: comment, learning, reanalysisScheduled: Boolean(comment.pageId && (action === "approve" || action === "reject")) });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.analyzePage = async (req, res) => {
    try {
        const { pageId } = req.params;
        const [page, igProfile] = await Promise.all([
            Page.findOne({ pageId }),
            IgProfile.findOne({ pageId }),
        ]);
        const brandNames = getBrandNames(page?.name, igProfile?.username);
        const result = await processCommentsForPage(pageId, page?.name || "our team", brandNames);
        res.json({ success: true, ...result });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.reanalyzeComment = async (req, res) => {
    try {
        const comment = await analyzeSingleComment(req.params.id);
        if (!comment) return res.status(404).json({ error: "Comment not found" });
        res.json({ success: true, data: comment });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

function escapeCsv(value) {
    const str = String(value ?? "").replace(/"/g, '""');
    return `"${str}"`;
}

function mapCommentToReportRow(c) {
    const replyStatus = c.reply?.status || "unreviewed";
    const reviewed = TERMINAL_REPLY_STATUSES.has(replyStatus);
    return {
        id: c._id,
        date: c.timestamp,
        platform: c.platform,
        postId: c.postId,
        username: c.username || "Anonymous",
        comment: c.text || "",
        sentiment: c.analysis?.sentiment || "unreviewed",
        category: c.analysis?.matchedCategory || "",
        categories: c.analysis?.matchedCategories || (c.analysis?.matchedCategory ? [c.analysis.matchedCategory] : []),
        categoryLabel: CATEGORY_LABELS[c.analysis?.matchedCategory] || "",
        categoryLabels: (c.analysis?.matchedCategories || [])
            .map((cat) => CATEGORY_LABELS[cat])
            .filter(Boolean)
            .join(", "),
        confidence: c.analysis?.overallConfidence || 0,
        matchConfidence: c.analysis?.matchConfidence || 0,
        priority: c.analysis?.priority || "normal",
        replyStatus,
        suggestedReply: c.reply?.suggestedReply || "",
        finalReply: reviewed ? (c.reply?.finalReply || "") : "",
        repliedAt: c.reply?.repliedAt || null,
        reviewedBy: c.reply?.reviewedBy || "",
        reviewedAt: c.reply?.reviewedAt || null,
    };
}

function buildReportSummaryPipeline() {
    return [
        {
            $group: {
                _id: null,
                total: { $sum: 1 },
                negative: { $sum: { $cond: [{ $eq: ["$analysis.sentiment", "negative"] }, 1, 0] } },
                spam: { $sum: { $cond: [{ $eq: ["$analysis.sentiment", "spam"] }, 1, 0] } },
                abuse: { $sum: { $cond: [{ $eq: ["$analysis.sentiment", "abuse"] }, 1, 0] } },
                withSuggestedReply: {
                    $sum: {
                        $cond: [{ $ne: [{ $ifNull: ["$reply.suggestedReply", ""] }, ""] }, 1, 0],
                    },
                },
                withFinalReply: {
                    $sum: {
                        $cond: [
                            {
                                $and: [
                                    { $in: ["$reply.status", Array.from(TERMINAL_REPLY_STATUSES)] },
                                    { $ne: [{ $ifNull: ["$reply.finalReply", ""] }, ""] },
                                ],
                            },
                            1,
                            0,
                        ],
                    },
                },
                replied: { $sum: { $cond: [{ $eq: ["$reply.status", "replied"] }, 1, 0] } },
            },
        },
    ];
}

function escapeRegex(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildSearchFilter(search) {
    const term = (search || "").trim();
    if (!term || term.length > 200) return null;

    const regex = { $regex: escapeRegex(term), $options: "i" };
    return {
        $or: [
            { text: regex },
            { username: regex },
            { "reply.suggestedReply": regex },
            { "reply.finalReply": regex },
        ],
    };
}

function mergeQueryConditions(baseQuery, conditions) {
    const filters = conditions.filter(Boolean);
    if (!filters.length) return baseQuery;

    const { $or, $and, ...rest } = baseQuery;
    const andParts = [...($and || [])];
    if ($or) andParts.unshift({ $or });

    andParts.push(...filters);

    if (andParts.length === 1) {
        return { ...rest, ...andParts[0] };
    }
    return { ...rest, $and: andParts };
}

function buildReportQuery(pageId, queryParams = {}) {
    const { hasReply, search } = queryParams;
    const base = buildInboxQuery(pageId, queryParams);

    const hasReplyFilter = hasReply === "true"
        ? {
            $or: [
                { "reply.suggestedReply": { $exists: true, $ne: "" } },
                { "reply.finalReply": { $exists: true, $ne: "" } },
            ],
        }
        : null;

    return mergeQueryConditions(base, [hasReplyFilter, buildSearchFilter(search)]);
}

exports.getReport = async (req, res) => {
    try {
        const { pageId } = req.params;
        const { format, hasReply } = req.query;
        const query = buildReportQuery(pageId, req.query);

        if (format === "csv") {
            const comments = await Comment.find(query).sort({ timestamp: -1 }).lean();
            const rows = comments.map(mapCommentToReportRow);
            const headers = [
                "Date", "Platform", "Username", "Comment", "Sentiment", "Category",
                "Category Match", "Overall Score", "Priority", "Reply Status", "Suggested Reply", "Final Reply",
                "Replied At", "Reviewed By",
            ];
            const csvLines = [
                headers.join(","),
                ...rows.map((r) => [
                    escapeCsv(r.date ? new Date(r.date).toISOString() : ""),
                    escapeCsv(r.platform),
                    escapeCsv(r.username),
                    escapeCsv(r.comment),
                    escapeCsv(r.sentiment),
                    escapeCsv(r.categoryLabel || r.category),
                    escapeCsv(r.matchConfidence),
                    escapeCsv(r.confidence),
                    escapeCsv(r.priority),
                    escapeCsv(r.replyStatus),
                    escapeCsv(r.suggestedReply),
                    escapeCsv(r.finalReply),
                    escapeCsv(r.repliedAt ? new Date(r.repliedAt).toISOString() : ""),
                    escapeCsv(r.reviewedBy),
                ].join(",")),
            ];
            res.setHeader("Content-Type", "text/csv; charset=utf-8");
            const sentimentPart = req.query.sentiment && req.query.sentiment !== "all" ? req.query.sentiment : "all";
            const statusPart = req.query.status && req.query.status !== "all" ? req.query.status : "all";
            res.setHeader(
                "Content-Disposition",
                `attachment; filename="comments-${pageId}-${sentimentPart}-${statusPart}.csv"`
            );
            // UTF-8 BOM helps Excel open Hindi / special characters correctly
            return res.send(`\uFEFF${csvLines.join("\n")}`);
        }

        let page = Math.max(1, parseInt(req.query.page, 10) || 1);
        let limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));

        const [comments, summaryRows, total, pageDoc] = await Promise.all([
            Comment.find(query)
                .sort({ timestamp: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            Comment.aggregate([{ $match: query }, ...buildReportSummaryPipeline()]),
            Comment.countDocuments(query),
            Page.findOne({ pageId }).select("repliesSyncedAt").lean(),
        ]);

        const rows = comments.map(mapCommentToReportRow);
        const summary = summaryRows[0]
            ? {
                total: summaryRows[0].total,
                negative: summaryRows[0].negative,
                spam: summaryRows[0].spam,
                abuse: summaryRows[0].abuse,
                withSuggestedReply: summaryRows[0].withSuggestedReply,
                withFinalReply: summaryRows[0].withFinalReply,
                replied: summaryRows[0].replied,
            }
            : {
                total: 0,
                negative: 0,
                spam: 0,
                abuse: 0,
                withSuggestedReply: 0,
                withFinalReply: 0,
                replied: 0,
            };

        res.json({
            success: true,
            data: rows,
            summary,
            repliesSyncedAt: pageDoc?.repliesSyncedAt || null,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit) || 1,
            },
            labels: { categories: CATEGORY_LABELS },
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.testAnalysis = async (req, res) => {
    try {
        const { text, pageId } = req.body;
        if (!text) return res.status(400).json({ error: "text is required" });

        const page = pageId ? await Page.findOne({ pageId }) : null;
        const guidebooks = await loadGuidebooks(pageId || null);
        const playbook = pageId ? await loadPlaybook(pageId) : DEFAULT_PLAYBOOK;
        const brandName = resolveBrandName(page?.name, playbook);
        const result = analyzeCommentText(text, guidebooks, { brandName, playbook });

        const matchedGuidebook = result.analysis.matchedGuidebookId
            ? guidebooks.find((g) => String(g._id) === String(result.analysis.matchedGuidebookId))
            : guidebooks.find((g) => g.category === result.analysis.matchedCategory);

        let suggestedReply = result.reply.suggestedReply;
        if (suggestedReply) {
            suggestedReply = suggestedReply.replace(/\{\{username\}\}/gi, "Customer");
        }

        res.json({
            success: true,
            result: {
                ...result,
                reply: { ...result.reply, suggestedReply },
                matchedGuidebook: matchedGuidebook
                    ? { category: matchedGuidebook.category, label: matchedGuidebook.label }
                    : null,
                matchedGuidebooks: (result.analysis.categoryMatches || []).map((match) => ({
                    category: match.category,
                    label: CATEGORY_LABELS[match.category] || match.category,
                    confidence: match.confidence,
                    triggers: match.triggers,
                    isPrimary: match.category === result.analysis.matchedCategory,
                })),
                isLeadInquiry: Boolean(result.analysis.isLeadInquiry),
                complaintFallbackUsed: Boolean(result.analysis.complaintFallbackUsed),
            },
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// ── Guidebook CRUD ──

exports.listGuidebook = async (req, res) => {
    try {
        const { pageId } = req.query;
        const query = pageId ? { $or: [{ pageId: null }, { pageId }] } : {};
        const entries = await Guidebook.find(query).sort({ sortOrder: 1, category: 1 }).lean();
        res.json({ success: true, data: entries, labels: { categories: CATEGORY_LABELS } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.getGuidebookEntry = async (req, res) => {
    try {
        const entry = await Guidebook.findById(req.params.id).lean();
        if (!entry) return res.status(404).json({ error: "Not found" });
        res.json({ success: true, data: entry });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.createGuidebookEntry = async (req, res) => {
    try {
        const entry = await Guidebook.create(req.body);
        scheduleGuidebookReanalysis(entry.pageId, "guidebook create");
        res.status(201).json({ success: true, data: entry, reanalysisScheduled: true });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

exports.updateGuidebookEntry = async (req, res) => {
    try {
        const entry = await Guidebook.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!entry) return res.status(404).json({ error: "Not found" });
        scheduleGuidebookReanalysis(entry.pageId, "guidebook update");
        res.json({ success: true, data: entry, reanalysisScheduled: true });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

exports.deleteGuidebookEntry = async (req, res) => {
    try {
        const entry = await Guidebook.findByIdAndDelete(req.params.id);
        if (!entry) return res.status(404).json({ error: "Not found" });
        scheduleGuidebookReanalysis(entry.pageId, "guidebook delete");
        res.json({ success: true, reanalysisScheduled: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.seedGuidebook = async (req, res) => {
    try {
        const force = req.query.force === "true" || req.body?.force === true;
        const { seedDefaultGuidebook } = require("../services/commentProcessor");
        const { seedGlobalPlaybook, getPlaybookMeta } = require("../services/playbookService");

        await seedDefaultGuidebook({ force });
        await seedGlobalPlaybook({ force });

        const categories = await Guidebook.find({ pageId: null }).sort({ sortOrder: 1 }).lean();
        const meta = await getPlaybookMeta(null);

        scheduleAllPagesReanalysis("guidebook seed");

        res.json({
            success: true,
            force,
            categories: categories.length,
            playbook: meta.playbook,
            data: categories,
            reanalysisScheduled: true,
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// ── Playbook (global + optional per-account overrides) ──

exports.getGlobalPlaybook = async (req, res) => {
    try {
        const meta = await getPlaybookMeta(null);
        res.json({ success: true, data: meta });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.updateGlobalPlaybook = async (req, res) => {
    try {
        await saveGlobalPlaybook(req.body);
        const meta = await getPlaybookMeta(null);
        scheduleAllPagesReanalysis("playbook global");
        res.json({ success: true, data: meta, reanalysisScheduled: true });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

exports.getPlaybook = async (req, res) => {
    try {
        const { pageId } = req.params;
        const page = await Page.findOne({ pageId }).lean();
        if (!page) return res.status(404).json({ error: "Account not found" });
        const meta = await getPlaybookMeta(pageId);
        res.json({ success: true, data: { pageId, ...meta, defaults: DEFAULT_PLAYBOOK } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.updatePlaybook = async (req, res) => {
    try {
        const { pageId } = req.params;
        const page = await Page.findOne({ pageId });
        if (!page) return res.status(404).json({ error: "Account not found" });
        await saveAccountPlaybook(pageId, req.body);
        const meta = await getPlaybookMeta(pageId);
        schedulePageReanalysis(pageId, "playbook account");
        res.json({ success: true, data: meta, reanalysisScheduled: true });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

exports.resetPlaybook = async (req, res) => {
    try {
        const { pageId } = req.params;
        const page = await Page.findOne({ pageId });
        if (!page) return res.status(404).json({ error: "Account not found" });
        await clearAccountPlaybook(pageId);
        const meta = await getPlaybookMeta(pageId);
        res.json({ success: true, data: meta });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.cloneGuidebookToPage = async (req, res) => {
    try {
        const { pageId } = req.params;
        const page = await Page.findOne({ pageId });
        if (!page) return res.status(404).json({ error: "Account not found" });
        const result = await cloneGuidebookToPage(pageId);
        schedulePageReanalysis(pageId, "guidebook clone");
        res.json({ success: true, ...result, reanalysisScheduled: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.overrideGuidebookCategory = async (req, res) => {
    try {
        const { pageId, category } = req.params;
        const page = await Page.findOne({ pageId });
        if (!page) return res.status(404).json({ error: "Account not found" });
        const entry = await createGuidebookOverride(pageId, category, req.body);
        schedulePageReanalysis(pageId, "guidebook override");
        res.json({ success: true, data: entry, reanalysisScheduled: true });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

/** Add a real comment's text as a guidebook example for better future matching */
exports.addCommentToGuidebook = async (req, res) => {
    try {
        const { id } = req.params;
        const { category: categoryOverride, pageId: scopePageId } = req.body || {};

        const comment = await Comment.findById(id).lean();
        if (!comment?.text?.trim()) {
            return res.status(404).json({ success: false, error: "Comment not found or empty" });
        }

        const category = categoryOverride
            || comment.analysis?.matchedCategory
            || comment.analysis?.matchedCategories?.[0];
        if (!category) {
            return res.status(400).json({
                success: false,
                error: "No category — re-analyze the comment first or pass category in the body",
            });
        }

        // Default to global guidebook examples unless caller scopes to an account override
        const pageId = scopePageId === undefined ? null : scopePageId;
        const entry = await resolveGuidebookEntry(pageId, category);
        if (!entry) {
            return res.status(404).json({ success: false, error: `Guidebook category "${category}" not found` });
        }

        const text = comment.text.trim();
        const { added, exampleCount } = await appendExampleComment(entry, text);

        scheduleGuidebookReanalysis(comment.pageId || pageId, "add example");

        res.json({
            success: true,
            data: {
                guidebookId: entry._id,
                category: entry.category,
                exampleCount,
                added: text,
                wasNew: added,
            },
            reanalysisScheduled: true,
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
