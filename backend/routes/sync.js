const express = require("express");
const router = express.Router();
const generateProof = require("../utils/generateProof");
const fbClient = require("../utils/fbClient");

const Page = require("../models/Page");
const Content = require("../models/Content");
const MonthlyStats = require("../models/MonthlyStats");
const IgProfile = require("../models/IgProfile");
const Comment = require("../models/Comment");

const { getDashboardData } = require("../controllers/facebookController");

// ── helpers (same fetchAllPages logic, local copy) ──
const parseFbNextUrl = (fullUrl) => {
    try {
        const parsed = new URL(fullUrl);
        return { path: parsed.pathname, params: Object.fromEntries(parsed.searchParams.entries()) };
    } catch { return null; }
};

const fetchAllPages = async (url, params) => {
    let results = [];
    let currentUrl = url;
    let currentParams = { ...params };
    const { access_token, appsecret_proof } = params;
    while (currentUrl) {
        try {
            const response = await fbClient.get(currentUrl, { params: currentParams });
            results = results.concat(response.data?.data || []);
            const nextUrl = response.data?.paging?.next;
            if (nextUrl) {
                const parsed = parseFbNextUrl(nextUrl);
                if (!parsed) break;
                currentUrl = parsed.path;
                currentParams = { ...parsed.params, access_token, appsecret_proof };
            } else { currentUrl = null; }
        } catch (err) {
            console.warn(` fetchAllPages error:`, err.response?.data?.error?.message || err.message);
            break;
        }
    }
    return results;
};

// ── fetch + upsert all comments for a page ──
async function syncComments(pageId, access_token, appsecret_proof) {
    const commonParams = { access_token, appsecret_proof };
    const allCommentDocs = [];

    try {
        console.log(` syncComments: starting for ${pageId}`);

        // 1. FB posts
        const fbPosts = await fetchAllPages(`/${pageId}/posts`, {
            fields: "id,comments.summary(true)",
            limit: 50,
            ...commonParams,
        });
        console.log(` FB posts found: ${fbPosts.length}`);

        for (const post of fbPosts) {
            const count = post.comments?.summary?.total_count ?? 0;
            if (count === 0) continue;
            try {
                const comments = await fetchAllPages(`/${post.id}/comments`, {
                    fields: "id,message,created_time,from{name,id},like_count",
                    filter: "stream",
                    limit: 50,
                    ...commonParams,
                });
                for (const c of comments) {
                    allCommentDocs.push({
                        pageId,
                        postId: post.id,
                        platform: "facebook",
                        commentId: c.id,
                        username: c.from?.name || "Unknown",
                        text: c.message || "",
                        timestamp: c.created_time ? new Date(c.created_time) : null,
                        fromName: c.from?.name || null,
                        fromId: c.from?.id || null,
                        likeCount: c.like_count || 0,
                        replies: [],
                        lastSynced: new Date(),
                    });
                }
            } catch (err) {
                console.warn(` FB comments failed for post ${post.id}:`, err.message);
            }
        }
        console.log(` FB comments collected: ${allCommentDocs.filter(c => c.platform === 'facebook').length}`);

        // 2. IG media
        try {
            const pageInfoRes = await fbClient.get(`/${pageId}`, {
                params: { fields: "instagram_business_account", ...commonParams },
            });
            const igUserId = pageInfoRes.data?.instagram_business_account?.id;

            if (igUserId) {
                const igMedia = await fetchAllPages(`/${igUserId}/media`, {
                    fields: "id,comments_count",
                    limit: 33,
                    ...commonParams,
                });
                console.log(` IG media found: ${igMedia.length}`);

                for (const media of igMedia) {
                    if ((media.comments_count ?? 0) === 0) continue;
                    try {
                        const comments = await fetchAllPages(`/${media.id}/comments`, {
                            fields: "id,text,username,timestamp,replies{id,text,username,timestamp}",
                            limit: 50,
                            ...commonParams,
                        });
                        for (const c of comments) {
                            allCommentDocs.push({
                                pageId,
                                postId: media.id,
                                platform: "instagram",
                                commentId: c.id,
                                username: c.username || "Unknown",
                                text: c.text || "",
                                timestamp: c.timestamp ? new Date(c.timestamp) : null,
                                fromName: null,
                                fromId: null,
                                likeCount: 0,
                                replies: c.replies?.data || [],
                                lastSynced: new Date(),
                            });
                        }
                    } catch (err) {
                        console.warn(` IG comments failed for ${media.id}:`, err.message);
                    }
                }
                console.log(` IG comments collected: ${allCommentDocs.filter(c => c.platform === 'instagram').length}`);
            }
        } catch (err) {
            console.warn(` IG profile fetch failed:`, err.message);
        }

        // 3. Bulk upsert
        console.log(` Total comments to save: ${allCommentDocs.length}`);

        if (allCommentDocs.length) {
            const bulkOps = allCommentDocs.map((c) => ({
                updateOne: {
                    filter: { pageId: c.pageId, commentId: c.commentId, platform: c.platform },
                    update: { $set: c },
                    upsert: true,
                },
            }));
            const result = await Comment.bulkWrite(bulkOps, { ordered: false });
            console.log(` Comments saved: upserted=${result.upsertedCount} modified=${result.modifiedCount}`);
        } else {
            console.log(` No comments found to save`);
        }

        return allCommentDocs.length;

    } catch (err) {
        console.error(" syncComments error:", err.message);
        return 0;
    }
}

// ══════════════════════════════════════════════
// POST /api/sync/:pageId  — fetch from Meta + save to DB
// ══════════════════════════════════════════════
router.post("/:pageId", async (req, res) => {
    const { pageId } = req.params;
    const { access_token } = req.body;

    if (!access_token) {
        return res.status(400).json({ error: "access_token required in body" });
    }

    try {
        // ✅ Return 202 immediately (don't wait for sync)
        res.status(202).json({
            success: true,
            message: "Sync started in background",
            status: "processing",
            pageId,
        });

        // ✅ Run everything in background without waiting
        setImmediate(async () => {
            try {
                console.log(`\n🔄 SYNC START (background): ${pageId}`);
                const startTime = Date.now();

                const appsecret_proof = generateProof(access_token);

                // 1. Dashboard data
                const dashboardData = await getDashboardData(pageId, access_token);

                // 2. Upsert Page
                await Page.findOneAndUpdate(
                    { pageId },
                    { pageId, name: dashboardData.page.name, followers: dashboardData.page.followers, accessToken: access_token, lastSynced: new Date() },
                    { upsert: true, new: true }
                );

                // 3. Upsert IG Profile
                if (dashboardData.instagram?.profile) {
                    const igp = dashboardData.instagram.profile;
                    await IgProfile.findOneAndUpdate(
                        { pageId },
                        { pageId, igId: igp.id, username: igp.username, followers_count: igp.followers_count, media_count: igp.media_count, lastSynced: new Date() },
                        { upsert: true, new: true }
                    );
                }

                // 4. Upsert content
                const allContent = dashboardData.data || [];
                if (allContent.length) {
                    const bulkOps = allContent.map((item) => ({
                        updateOne: {
                            filter: { pageId, contentId: item.id, platform: item.platform },
                            update: { $set: { ...item, contentId: item.id, pageId, lastSynced: new Date() } },
                            upsert: true,
                        },
                    }));
                    await Content.bulkWrite(bulkOps, { ordered: false });
                    console.log(`✅ Content saved: ${allContent.length} items`);
                }

                // 5. Upsert monthly stats
                const monthly = dashboardData.monthly || [];
                if (monthly.length) {
                    const monthlyOps = monthly.map((m) => ({
                        updateOne: {
                            filter: { pageId, month: m.month },
                            update: { $set: { ...m, pageId, lastSynced: new Date() } },
                            upsert: true,
                        },
                    }));
                    await MonthlyStats.bulkWrite(monthlyOps, { ordered: false });
                }

                // 6. Sync comments
                const commentCount = await syncComments(pageId, access_token, appsecret_proof);
                console.log(`✅ Comments synced: ${commentCount} items`);

                const durationMs = Date.now() - startTime;
                console.log(`✅ SYNC COMPLETE (background): ${pageId}`);
                console.log(`   Duration: ${(durationMs / 1000).toFixed(1)}s`);

            } catch (err) {
                console.error(`\n❌ SYNC FAILED (background): ${pageId}`);
                console.error(`   Error: ${err.message}`);
            }
        });

    } catch (err) {
        console.error("❌ Sync start error:", err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// ══════════════════════════════════════════════
// GET /api/sync/:pageId  — read from DB
// ══════════════════════════════════════════════
router.get("/:pageId", async (req, res) => {
    const { pageId } = req.params;

    try {
        const page = await Page.findOne({ pageId });
        if (!page) return res.status(404).json({ error: "Page not found. Run a sync first." });

        const [igProfile, allContent, monthly, allComments] = await Promise.all([
            IgProfile.findOne({ pageId }),
            Content.find({ pageId }).sort({ created_time: -1 }).lean(),
            MonthlyStats.find({ pageId }).sort({ month: 1 }).lean(),
            Comment.find({ pageId }).sort({ timestamp: -1 }).lean(),  // ← NEW
        ]);

        const fbContent = allContent.filter(c => c.platform === "facebook");
        const igContent = allContent.filter(c => c.platform === "instagram");
        const sum = (arr, key) => arr.reduce((s, i) => s + (i[key] || 0), 0);
        const igReels = igContent.filter(c => c.type === "reel");

        const summary = {
            totalContent: allContent.length,
            facebookContent: fbContent.length,
            instagramContent: igContent.length,
            totalLikes: sum(allContent, "likes"),
            totalComments: sum(allContent, "comments"),
            totalShares: sum(allContent, "shares"),
            totalSaves: sum(allContent, "saves"),
            totalViews: sum(allContent, "views"),
            totalEngagement: sum(allContent, "engagement"),
            totalReach: sum(allContent, "reach"),
            reels: {
                ig: {
                    count: igReels.length,
                    totalWatchTimeSec: sum(igReels, "totalWatchTimeSec"),
                    totalWatchTimeMin: Math.round(sum(igReels, "totalWatchTimeSec") / 60),
                    avgWatchTimeSec: igReels.length ? Math.round(sum(igReels, "avgWatchTimeSec") / igReels.length * 10) / 10 : 0,
                    avgSkipRatePct: "0%",
                },
            },
        };

        const getBest = (arr) => arr.length ? [...arr].sort((a, b) => b.score - a.score)[0] : null;

        // ← Flatten comments to match the shape the frontend expects
        const flatComments = allComments.map(c => ({
            platform: c.platform,
            postId: c.postId,
            username: c.username,
            text: c.text,
            timestamp: c.timestamp,
        }));

        return res.status(200).json({
            success: true,
            syncedAt: page.lastSynced,
            page: { name: page.name, followers: page.followers },
            instagram: {
                profile: igProfile || null,
                data: igContent,
                best: {
                    post: getBest(igContent.filter(c => c.type === "post")),
                    reel: getBest(igContent.filter(c => c.type === "reel")),
                    overall: getBest(igContent),
                    mostWatched: [...igContent.filter(c => c.type === "reel" && c.avgWatchTimeSec > 0)].sort((a, b) => b.avgWatchTimeSec - a.avgWatchTimeSec)[0] || null,
                    bestRetention: [...igContent.filter(c => c.type === "reel" && c.views >= 100 && c.skipRate != null)].sort((a, b) => a.skipRate - b.skipRate)[0] || null,
                },
            },
            facebook: {
                data: fbContent,
                best: {
                    post: getBest(fbContent.filter(c => c.type === "post")),
                    reel: getBest(fbContent.filter(c => c.type === "reel")),
                    video: getBest(fbContent.filter(c => c.type === "video")),
                },
            },
            summary,
            bestOverall: getBest(allContent),
            globalBest: getBest(allContent),
            bestByCategory: {
                post: getBest(fbContent.filter(c => c.type === "post")),
                reel: getBest(fbContent.filter(c => c.type === "reel")),
                video: getBest(fbContent.filter(c => c.type === "video")),
            },
            igBest: {
                post: getBest(igContent.filter(c => c.type === "post")),
                reel: getBest(igContent.filter(c => c.type === "reel")),
                overall: getBest(igContent),
            },
            monthly,
            data: allContent.map(c => ({ ...c, id: c.contentId })),
            comments: flatComments,   // ← NEW: comments now in GET response
        });

    } catch (err) {
        console.error(" DB read error:", err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});


// GET /api/sync/:pageId/content
// ?page=1&limit=24&platform=all|facebook|instagram&type=all|post|reel|video&since=YYYY-MM-DD&until=YYYY-MM-DD
router.get("/:pageId/content", async (req, res) => {
    const { pageId } = req.params;
    let { page = 1, limit = 24, platform = "all", type = "all", since, until } = req.query;

    page = Math.max(1, parseInt(page));
    limit = Math.min(100, Math.max(1, parseInt(limit)));

    try {
        const query = { pageId };
        if (platform !== "all") query.platform = platform;
        if (type !== "all") query.type = type;
        if (since || until) {
            query.created_time = {};
            if (since) query.created_time.$gte = new Date(since);
            if (until) query.created_time.$lte = new Date(`${until}T23:59:59`);
        }

        const [items, total] = await Promise.all([
            Content.find(query)
                .sort({ created_time: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            Content.countDocuments(query),
        ]);

        // pull only the comments relevant to this page of posts
        const postIds = items.map((i) => i.contentId);
        const comments = postIds.length
            ? await Comment.find({ pageId, postId: { $in: postIds } }).sort({ timestamp: -1 }).lean()
            : [];

        const commentsByPost = {};
        for (const c of comments) {
            (commentsByPost[c.postId] ||= []).push({
                platform: c.platform,
                username: c.username,
                text: c.text,
                timestamp: c.timestamp,
            });
        }

        const data = items.map((i) => ({
            ...i,
            id: i.contentId,
            postComments: commentsByPost[i.contentId] || [],
            commentCount: (commentsByPost[i.contentId] || []).length,
        }));

        res.json({
            success: true,
            data,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
        });
    } catch (err) {
        console.error("content list error:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;