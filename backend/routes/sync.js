const express = require("express");
const router = express.Router();
const generateProof = require("../utils/generateProof");
const fbClient = require("../utils/fbClient");
const { withConcurrencyLimit } = require("../utils/concurrency");

const Page = require("../models/Page");
const Content = require("../models/Content");
const MonthlyStats = require("../models/MonthlyStats");
const IgProfile = require("../models/IgProfile");
const Comment = require("../models/Comment");
const FollowerSnapshot = require("../models/FollowerSnapshot");

const { getDashboardData } = require("../controllers/facebookController");
const { processCommentsForPage } = require("../services/commentProcessor");
const { getBrandNames } = require("../utils/commentHelpers");

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
        let response;
        let attempt = 0;
        while (true) {
            try {
                response = await fbClient.get(currentUrl, { params: currentParams });
                break;
            } catch (err) {
                const isRateLimit = err.response?.data?.error?.code === 4 || err.response?.status === 429;
                attempt++;
                if (!isRateLimit || attempt > 3) {
                    console.warn(` fetchAllPages error:`, err.response?.data?.error?.message || err.message);
                    return results;
                }
                await new Promise((r) => setTimeout(r, 2000 * attempt));
            }
        }

        results = results.concat(response.data?.data || []);
        const nextUrl = response.data?.paging?.next;
        if (nextUrl) {
            const parsed = parseFbNextUrl(nextUrl);
            if (!parsed) break;
            currentUrl = parsed.path;
            currentParams = { ...parsed.params, access_token, appsecret_proof };
        } else {
            currentUrl = null;
        }
    }
    return results;
};

// ══════════════════════════════════════════════
// INCREMENTAL COMMENT SYNC — FIXED
// Reuses Content docs already saved by getDashboardData in this same
// sync run, instead of re-fetching FB posts / IG media lists from Meta
// a second time. Tracks "checked" via Content.lastCommentCheck so pages
// with zero comments don't get re-scanned on every single sync forever.
// ══════════════════════════════════════════════
async function syncComments(pageId, access_token, appsecret_proof, { recentDays = 30 } = {}) {
    const commonParams = { access_token, appsecret_proof };
    const allCommentDocs = [];
    const checkedIds = []; // { contentId, platform } — every item we actually attempted this run

    try {
        console.log(`\n💬 syncComments: starting for ${pageId} (recent window: ${recentDays}d)`);
        const cutoff = new Date(Date.now() - recentDays * 86400000);

        // Reuse content already synced this run — no second Meta fetch needed
        const allContent = await Content.find(
            { pageId },
            "contentId platform created_time lastCommentCheck"
        ).lean();

        const toCheck = allContent.filter((c) => {
            const isRecent = c.created_time && new Date(c.created_time) >= cutoff;
            const neverChecked = !c.lastCommentCheck;
            return isRecent || neverChecked;
        });

        const fbToCheck = toCheck.filter((c) => c.platform === "facebook");
        const igToCheck = toCheck.filter((c) => c.platform === "instagram");

        const fbTotal = allContent.filter((c) => c.platform === "facebook").length;
        const igTotal = allContent.filter((c) => c.platform === "instagram").length;

        console.log(`  FB content to check comments for: ${fbToCheck.length}/${fbTotal} (recent or never-checked)`);
        console.log(`  IG content to check comments for: ${igToCheck.length}/${igTotal} (recent or never-checked)`);

        // ── 1. FB comments ──────────────────────────
        await withConcurrencyLimit(
            fbToCheck.map((post) => async () => {
                checkedIds.push({ contentId: post.contentId, platform: "facebook" });
                try {
                    const comments = await fetchAllPages(`/${post.contentId}/comments`, {
                        fields: "id,message,created_time,from{name,id},like_count",
                        filter: "stream",
                        limit: 50,
                        ...commonParams,
                    });
                    for (const c of comments) {
                        allCommentDocs.push({
                            pageId,
                            postId: post.contentId,
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
                    console.warn(`  FB comments failed for post ${post.contentId}:`, err.message);
                }
            }),
            5
        );
        console.log(`  FB comments collected: ${allCommentDocs.filter((c) => c.platform === "facebook").length}`);

        // ── 2. IG comments ──────────────────────────
        await withConcurrencyLimit(
            igToCheck.map((media) => async () => {
                checkedIds.push({ contentId: media.contentId, platform: "instagram" });
                try {
                    const comments = await fetchAllPages(`/${media.contentId}/comments`, {
                        fields: "id,text,username,timestamp,replies{id,text,username,timestamp}",
                        limit: 50,
                        ...commonParams,
                    });
                    for (const c of comments) {
                        allCommentDocs.push({
                            pageId,
                            postId: media.contentId,
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
                    console.warn(`  IG comments failed for ${media.contentId}:`, err.message);
                }
            }),
            5
        );
        console.log(`  IG comments collected: ${allCommentDocs.filter((c) => c.platform === "instagram").length}`);

        // ── 3. Bulk upsert comments ─────────────────
        console.log(`  Total comments to save: ${allCommentDocs.length}`);
        if (allCommentDocs.length) {
            const bulkOps = allCommentDocs.map((c) => ({
                updateOne: {
                    filter: { pageId: c.pageId, commentId: c.commentId, platform: c.platform },
                    update: { $set: c },
                    upsert: true,
                },
            }));
            const result = await Comment.bulkWrite(bulkOps, { ordered: false });
            console.log(`  Comments saved: upserted=${result.upsertedCount} modified=${result.modifiedCount}`);
        } else {
            console.log(`  No new comments to save`);
        }

        // ── 4. Mark everything we checked, regardless of result ──
        if (checkedIds.length) {
            const checkOps = checkedIds.map(({ contentId, platform }) => ({
                updateOne: {
                    filter: { pageId, contentId, platform },
                    update: { $set: { lastCommentCheck: new Date() } },
                },
            }));
            await Content.bulkWrite(checkOps, { ordered: false });
            console.log(`  Marked ${checkedIds.length} items as comment-checked`);
        }

        return allCommentDocs.length;
    } catch (err) {
        console.error(" syncComments error:", err.message);
        return 0;
    }
}

// ══════════════════════════════════════════════
// POST /api/sync/:pageId  — fetch from Meta + save to DB
// ?full=true forces a full comment resync (all content, not just recent)
// ══════════════════════════════════════════════
const MIN_SYNC_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes cooldown

router.post("/:pageId", async (req, res) => {
    const { pageId } = req.params;
    const { access_token } = req.body;
    const fullResync = req.query.full === "true";

    if (!access_token) {
        return res.status(400).json({ error: "access_token required in body" });
    }

    try {
        const existingPage = await Page.findOne({ pageId });
        if (existingPage?.lastSyncStarted) {
            const elapsed = Date.now() - existingPage.lastSyncStarted.getTime();
            if (elapsed < MIN_SYNC_INTERVAL_MS) {
                const waitMin = Math.ceil((MIN_SYNC_INTERVAL_MS - elapsed) / 60000);
                return res.status(429).json({
                    error: `Sync ran recently. Please wait ~${waitMin} more minute(s) before syncing again.`,
                });
            }
        }

        await Page.findOneAndUpdate(
            { pageId },
            { pageId, lastSyncStarted: new Date(), syncStatus: "processing" },
            { upsert: true }
        );

        res.status(202).json({
            success: true,
            message: "Sync started in background",
            status: "processing",
            pageId,
        });

        setImmediate(async () => {
            try {
                console.log(`\n🔄 SYNC START (background): ${pageId}${fullResync ? " [FULL RESYNC]" : ""}`);
                const startTime = Date.now();

                const appsecret_proof = generateProof(access_token);

                // 1. Dashboard data (content + insights — still fetches all content
                //    listings each time since that part is cheap; per-item insight
                //    calls are the existing withConcurrencyLimit-based logic)
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

                // 3.5. Snapshot today's follower counts
                try {
                    const today = new Date().toISOString().slice(0, 10);
                    console.log(`📸 Saving follower snapshot for ${today}: FB=${dashboardData.page.followers} IG=${dashboardData.instagram?.profile?.followers_count || 0}`);
                    await FollowerSnapshot.findOneAndUpdate(
                        { pageId, date: today },
                        {
                            pageId,
                            date: today,
                            fbFollowers: dashboardData.page.followers,
                            igFollowers: dashboardData.instagram?.profile?.followers_count || 0,
                        },
                        { upsert: true, new: true }
                    );
                } catch (err) {
                    console.error(`❌ Follower snapshot FAILED:`, err.message);
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

                // 6. Sync comments — INCREMENTAL by default
                //    Pass ?full=true on the sync request to force a complete
                //    comment resync across all content (useful occasionally,
                //    e.g. once a month, to catch anything the recent-window missed).
                const commentCount = await syncComments(pageId, access_token, appsecret_proof, {
                    recentDays: fullResync ? 999999 : 30,
                });
                console.log(`✅ Comments synced: ${commentCount} items`);

                const brandNames = getBrandNames(
                    dashboardData.page?.name,
                    dashboardData.instagram?.profile?.username
                );
                try {
                    const analysisResult = await processCommentsForPage(
                        pageId,
                        dashboardData.page?.name || "our team",
                        brandNames
                    );
                    console.log(`✅ Comment analysis: ${analysisResult.processed}/${analysisResult.total} updated`);
                } catch (analyzeErr) {
                    console.error(`⚠ Comment analysis failed (sync data saved): ${analyzeErr.message}`);
                }

                await Page.findOneAndUpdate({ pageId }, { syncStatus: "complete" });

                const durationMs = Date.now() - startTime;
                console.log(`✅ SYNC COMPLETE (background): ${pageId}`);
                console.log(`   Duration: ${(durationMs / 1000).toFixed(1)}s`);
            } catch (err) {
                await Page.findOneAndUpdate({ pageId }, { syncStatus: "failed" }).catch(() => {});
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

        const [igProfile, allContentRaw, monthly, allComments] = await Promise.all([
            IgProfile.findOne({ pageId }),
            Content.find({ pageId }).sort({ created_time: -1 }).lean(),
            MonthlyStats.find({ pageId }).sort({ month: 1 }).lean(),
            Comment.find({ pageId }).sort({ timestamp: -1 }).lean(),
        ]);

        const flatComments = [];
        for (const c of allComments) {
            flatComments.push({
                platform: c.platform,
                postId: c.postId,
                username: c.username,
                text: c.text,
                timestamp: c.timestamp,
            });
            for (const r of (c.replies || [])) {
                flatComments.push({
                    platform: c.platform,
                    postId: c.postId,
                    username: r.username || r.from?.name || "Unknown",
                    text: r.text || r.message || "",
                    timestamp: r.timestamp || r.created_time,
                });
            }
        }

        const commentsByPost = {};
        for (const c of flatComments) {
            (commentsByPost[c.postId] ||= []).push(c);
        }
        const allContent = allContentRaw.map((c) => ({
            ...c,
            postComments: commentsByPost[c.contentId] || [],
            commentCount: (commentsByPost[c.contentId] || []).length,
        }));

        const fbContent = allContent.filter((c) => c.platform === "facebook");
        const igContent = allContent.filter((c) => c.platform === "instagram");
        const sum = (arr, key) => arr.reduce((s, i) => s + (i[key] || 0), 0);
        const igReels = igContent.filter((c) => c.type === "reel");

        const summary = {
            totalContent: allContent.length,
            facebookContent: fbContent.length,
            instagramContent: igContent.length,
            totalLikes: sum(allContent, "likes"),
            totalComments: flatComments.length,
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
                    avgWatchTimeSec: igReels.length ? Math.round((sum(igReels, "avgWatchTimeSec") / igReels.length) * 10) / 10 : 0,
                    avgSkipRatePct: "0%",
                },
            },
        };

        const getBest = (arr) => {
            if (!arr.length) return null;
            return [...arr].sort((a, b) => {
                const metricA = a.type === "post" ? (a.engagement || 0) : (a.views || 0);
                const metricB = b.type === "post" ? (b.engagement || 0) : (b.views || 0);
                return metricB - metricA;
            })[0];
        };

        return res.status(200).json({
            success: true,
            syncedAt: page.lastSynced,
            syncStatus: page.syncStatus || "idle",
            syncing: page.syncStatus === "processing",
            page: { name: page.name, followers: page.followers },
            instagram: {
                profile: igProfile || null,
                data: igContent,
                best: {
                    post: getBest(igContent.filter((c) => c.type === "post")),
                    reel: getBest(igContent.filter((c) => c.type === "reel")),
                    overall: getBest(igContent),
                    mostWatched: [...igContent.filter((c) => c.type === "reel" && c.avgWatchTimeSec > 0)].sort((a, b) => b.avgWatchTimeSec - a.avgWatchTimeSec)[0] || null,
                    bestRetention: [...igContent.filter((c) => c.type === "reel" && c.views >= 100 && c.skipRate != null)].sort((a, b) => a.skipRate - b.skipRate)[0] || null,
                },
            },
            facebook: {
                data: fbContent,
                best: {
                    post: getBest(fbContent.filter((c) => c.type === "post")),
                    reel: getBest(fbContent.filter((c) => c.type === "reel")),
                    video: getBest(fbContent.filter((c) => c.type === "video")),
                },
            },
            summary,
            bestOverall: getBest(allContent),
            globalBest: getBest(allContent),
            bestByCategory: {
                post: getBest(fbContent.filter((c) => c.type === "post")),
                reel: getBest(fbContent.filter((c) => c.type === "reel")),
                video: getBest(fbContent.filter((c) => c.type === "video")),
            },
            igBest: {
                post: getBest(igContent.filter((c) => c.type === "post")),
                reel: getBest(igContent.filter((c) => c.type === "reel")),
                overall: getBest(igContent),
            },
            monthly,
            data: allContent.map((c) => ({ ...c, id: c.contentId })),
            comments: flatComments,
        });
    } catch (err) {
        console.error(" DB read error:", err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/sync/:pageId/content
router.get("/:pageId/content", async (req, res) => {
    const { pageId } = req.params;
    let { page = 1, limit = 24, platform = "all", type = "all", since, until, hasComments } = req.query;

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
        if (hasComments === "true") {
            const postIdsWithComments = await Comment.distinct("postId", { pageId });
            query.contentId = { $in: postIdsWithComments };
        }

        const [items, total] = await Promise.all([
            Content.find(query).sort({ created_time: -1 }).skip((page - 1) * limit).limit(limit).lean(),
            Content.countDocuments(query),
        ]);

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

// GET /api/sync/:pageId/followers?days=30
router.get("/:pageId/followers", async (req, res) => {
    const { pageId } = req.params;
    const days = Math.min(365, Math.max(1, parseInt(req.query.days) || 30));

    try {
        const since = new Date();
        since.setDate(since.getDate() - days);
        const sinceStr = since.toISOString().slice(0, 10);

        const snapshots = await FollowerSnapshot.find({ pageId, date: { $gte: sinceStr } }).sort({ date: 1 }).lean();

        if (snapshots.length === 0) {
            return res.json({ success: true, snapshots: [], fbGain: 0, igGain: 0 });
        }

        const first = snapshots[0];
        const last = snapshots[snapshots.length - 1];

        res.json({
            success: true,
            snapshots,
            fbGain: last.fbFollowers - first.fbFollowers,
            igGain: last.igFollowers - first.igFollowers,
            fbCurrent: last.fbFollowers,
            igCurrent: last.igFollowers,
            periodDays: days,
        });
    } catch (err) {
        console.error("followers history error:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;