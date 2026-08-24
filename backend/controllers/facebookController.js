const fbClient = require("../utils/fbClient");
const generateProof = require("../utils/generateProof");
const { withConcurrencyLimit } = require("../utils/concurrency");
const Content = require("../models/Content");


// 🔒 Move these to ENV in production
const ACCESS_TOKEN =
    "EAANKDV86S6gBRRc1c1zjb7ackeHpbkYWxaX5LVyyCFOzHyC5IbZAdUlgqI7fKrmZAdsH0QiJ0TVNdNKm0bZBWulqZAhF5N9W5vjLlYZATw5MW1QXcrsja7mHrfxFpOOhLN9RTpwmll0nh8jYHugsB0YbH87KXbBEbAlAzVlQdPW8057S0sPCvDOZAwlpDI";

const APP_SECRET_PROOF =
    "6c55244b1d22a51fe9be91f325c7cab378c74cc490305f2a8a0f8d11da8652d9";

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function calculateScore({ likes = 0, comments = 0, shares = 0, views = 0, saves = 0, watchTimeMs = 0, reelDurationMs = 0 }) {
    let base = likes * 4 + comments * 6 + shares * 8 + views * 0.5 + saves * 5;
    if (reelDurationMs > 0 && watchTimeMs > 0) {
        const completionRate = Math.min(watchTimeMs / reelDurationMs, 1);
        base += completionRate * 20;
    }
    return Math.round(base);
}

function toContentItem(doc) {
    const { _id, __v, createdAt, updatedAt, pageId, lastSynced, lastCommentCheck, contentId, ...rest } = doc;
    return { id: contentId, ...rest };
}

function getBest(arr) {
    if (!arr.length) return null;
    return [...arr].sort((a, b) => {
        const metricA = a.type === "post" ? (a.engagement || 0) : (a.views || 0);
        const metricB = b.type === "post" ? (b.engagement || 0) : (b.views || 0);
        return metricB - metricA;
    })[0];
}
function shouldRefreshInsights(existingDoc, itemTimestamp, recentDays = 14) {
    if (!existingDoc) return true; // never synced — must fetch
    const isRecent = itemTimestamp &&
        new Date(itemTimestamp) >= new Date(Date.now() - recentDays * 86400000);
    return isRecent;
}
const parseFbNextUrl = (fullUrl) => {
    try {
        const parsed = new URL(fullUrl);
        return {
            path: parsed.pathname,
            params: Object.fromEntries(parsed.searchParams.entries()),
        };
    } catch {
        return null;
    }
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
                    console.warn(`⚠️ fetchAllPages error on ${currentUrl}:`, err.response?.data?.error?.message || err.message);
                    return results; // give up, but return what we have
                }
                const delay = 2000 * attempt;
                console.warn(`⏳ Rate limited, retrying in ${delay}ms (attempt ${attempt}/3)`);
                await new Promise((r) => setTimeout(r, delay));
            }
        }

        const data = response.data?.data || [];
        results = results.concat(data);

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
async function fetchIgReelInsights(itemId, commonParams) {
    const result = {
        views: 0, reach: 0,
        avgWatchTimeMs: 0, avgWatchTimeSec: 0,
        totalWatchTimeMs: 0, totalWatchTimeSec: 0,
        saves: 0, shares: 0, likes: 0, comments: 0,
        skipRate: 0, skipRatePct: "0%",
        crosspostedViews: 0, facebookViews: 0,
    };

    const reelMetrics = [
        "views", "reach", "ig_reels_avg_watch_time",
        "ig_reels_video_view_total_time", "likes", "comments",
        "shares", "saved", "reels_skip_rate",
    ].join(",");

    try {
        const res = await fbClient.get(`/${itemId}/insights`, {
            params: { metric: reelMetrics, ...commonParams },
        });

        for (const insight of (res.data.data || [])) {
            const val = insight.values?.[0]?.value ?? insight.value ?? 0;
            switch (insight.name) {
                case "views": result.views = val; break;
                case "reach": result.reach = val; break;
                case "ig_reels_avg_watch_time":
                    result.avgWatchTimeMs = val;
                    result.avgWatchTimeSec = Math.round(val / 1000 * 10) / 10;
                    break;
                case "ig_reels_video_view_total_time":
                    result.totalWatchTimeMs = val;
                    result.totalWatchTimeSec = Math.round(val / 1000);
                    break;
                case "likes": result.likes = val; break;
                case "comments": result.comments = val; break;
                case "shares": result.shares = val; break;
                case "saved": result.saves = val; break;
                case "reels_skip_rate":
                    result.skipRate = val / 100;
                    result.skipRatePct = `${Math.round(val)}%`;
                    break;
            }
        }

        console.log(`  ✅ IG Reel ${itemId} | views:${result.views} avgWatch:${result.avgWatchTimeSec}s skip:${result.skipRatePct}`);
    } catch (err) {
        console.warn(`  ⚠️ Reel batch metrics failed [${itemId}]: ${err.response?.data?.error?.message || err.message}`);
        try {
            const res = await fbClient.get(`/${itemId}/insights`, {
                params: { metric: "views", ...commonParams },
            });
            for (const insight of (res.data.data || [])) {
                if (insight.name === "views") result.views = insight.values?.[0]?.value ?? insight.value ?? 0;
            }
        } catch (_) { }
    }

    try {
        const cpRes = await fbClient.get(`/${itemId}/insights`, {
            params: { metric: "crossposted_views,facebook_views", ...commonParams },
        });
        for (const insight of (cpRes.data.data || [])) {
            const val = insight.values?.[0]?.value ?? insight.value ?? 0;
            if (insight.name === "crossposted_views") result.crosspostedViews = val;
            if (insight.name === "facebook_views") result.facebookViews = val;
        }
    } catch (_) { }

    return result;
}

async function fetchIgPostInsights(itemId, commonParams) {
    const result = { reach: 0, saves: 0, follows: 0, profileVisits: 0 };
    try {
        const res = await fbClient.get(`/${itemId}/insights`, {
            params: { metric: "reach,saved,follows,profile_visits", ...commonParams },
        });
        for (const insight of (res.data.data || [])) {
            const val = insight.values?.[0]?.value ?? insight.value ?? 0;
            switch (insight.name) {
                case "reach": result.reach = val; break;
                case "saved": result.saves = val; break;
                case "follows": result.follows = val; break;
                case "profile_visits": result.profileVisits = val; break;
            }
        }
    } catch (_) { }
    return result;
}

async function fetchFbVideoInsights(videoId, isReel, commonParams) {
    const result = {
        reach: 0, shares: 0,
        avgWatchTimeSec: null, totalWatchTimeSec: null,
        retention3sViews: 0, minutesViewed: 0,
    };

    const baseMetrics = [
        "total_video_impressions_unique", "total_video_shares",
        "total_video_avg_time_watched", "total_video_view_total_time",
        "total_video_views_unique",
    ];

    const reelMetrics = isReel ? [
        "post_video_avg_time_watched", "post_video_view_time",
        "post_video_views_15s", "fb_reels_total_plays", "fb_reels_replay_count",
    ] : [];

    const allMetrics = [...baseMetrics, ...(isReel ? reelMetrics : [])].join(",");

    try {
        const res = await fbClient.get(`/${videoId}/video_insights`, {
            params: { metric: allMetrics, ...commonParams },
        });

        for (const insight of (res.data.data || [])) {
            const val = insight.values?.[0]?.value ?? insight.value ?? 0;
            switch (insight.name) {
                case "total_video_impressions_unique": result.reach = val; break;
                case "total_video_shares": result.shares = val; break;
                case "total_video_avg_time_watched":
                    result.avgWatchTimeSec = val > 0 ? Math.round(val / 1000 * 10) / 10 : null;
                    break;
                case "total_video_view_total_time":
                    result.totalWatchTimeSec = val > 0 ? Math.round(val / 1000) : null;
                    break;
                case "post_video_views_15s": result.retention3sViews = val; break;
                case "fb_reels_total_plays":
                    if (val > 0) result.fbReelsPlays = val;
                    break;
                case "fb_reels_replay_count": result.fbReelsReplays = val; break;
            }
        }
    } catch (err) {
        console.warn(`  ⚠️ FB video_insights failed [${videoId}]: ${err.response?.data?.error?.message || err.message}`);
        try {
            const fallback = await fbClient.get(`/${videoId}/video_insights`, {
                params: { metric: "total_video_impressions_unique", ...commonParams },
            });
            result.reach = fallback.data.data?.[0]?.values?.[0]?.value || 0;
        } catch (_) { }
    }

    return result;
}

// ─────────────────────────────────────────────
// CORE DATA FUNCTION  ← used by getDashboard AND the sync route
// ─────────────────────────────────────────────

/**
 * Fetches all dashboard data from the Meta API.
 * Returns a plain object (no req/res involved).
 *
 * @param {string} pageId
 * @param {string} access_token   - page-level access token
 * @param {string|null} since     - unix timestamp string (optional)
 * @param {string|null} until     - unix timestamp string (optional)
 * @returns {Promise<object>}     - the full dashboard payload
 */
exports.getDashboardData = async (pageId, access_token, since = null, until = null) => {
    const appsecret_proof = generateProof(access_token);
    const commonParams = { access_token, appsecret_proof };
    const existingContent = await Content.find({ pageId }).lean();
    const insightsMap = new Map(
        existingContent.map((c) => [`${c.platform}::${c.contentId}`, c])
    );

    // ── 1. PAGE INFO ──────────────────────────────
    const pageRes = await fbClient.get(`/${pageId}`, {
        params: {
            fields: "name,fan_count,followers_count,instagram_business_account",
            ...commonParams,
        },
    });

    const page = {
        name: pageRes.data.name,
        followers: pageRes.data.followers_count || pageRes.data.fan_count || 0,
    };

    console.log(`✅ Page: ${page.name} | Followers: ${page.followers}`);

    // ── 2. INSTAGRAM DATA ─────────────────────────
    let igProfile = null;
    let instagramFormatted = [];
    const igReelIdSet = new Set();

    if (pageRes.data.instagram_business_account) {
        const igId = pageRes.data.instagram_business_account.id;

        const [igInfoRes, igAllMedia] = await Promise.all([
            fbClient.get(`/${igId}`, {
                params: { fields: "username,followers_count,media_count", ...commonParams },
            }),
            fetchAllPages(`/${igId}/media`, {
                fields: "id,caption,media_type,media_url,like_count,comments_count,timestamp",
                limit: 33,
                ...commonParams,
            }),
        ]);

        igProfile = igInfoRes.data;
        console.log(`✅ IG Media fetched: ${igAllMedia.length} (profile reports ${igProfile.media_count})`);

        const filteredIgMedia = igAllMedia.filter((item) => {
            if (!since && !until) return true;
            const ts = new Date(item.timestamp).getTime() / 1000;
            if (since && ts < Number(since)) return false;
            if (until && ts > Number(until)) return false;
            return true;
        });

        console.log(`✅ IG Media after date filter: ${filteredIgMedia.length}`);

        instagramFormatted = await withConcurrencyLimit(
            filteredIgMedia.map((item) => async () => {
                const isReel = item.media_type === "VIDEO";
                const key = `instagram::${item.id}`;
                const existing = insightsMap.get(key);

                // ADD THIS — skip the API call for old, already-synced items
                if (!shouldRefreshInsights(existing, item.timestamp)) {
                    return toContentItem(existing);;
                }
                // END ADD

                if (isReel) {
                    const ins = await fetchIgReelInsights(item.id, commonParams);
                    const approxDurationMs = ins.views > 0
                        ? Math.round(ins.totalWatchTimeMs / ins.views)
                        : 0;
                    const completionRate = (approxDurationMs > 0 && ins.avgWatchTimeMs > 0)
                        ? Math.min(ins.avgWatchTimeMs / approxDurationMs, 1)
                        : 0;

                    const score = calculateScore({
                        likes: ins.likes || item.like_count || 0,
                        comments: ins.comments || item.comments_count || 0,
                        shares: ins.shares,
                        views: ins.views,
                        saves: ins.saves,
                        watchTimeMs: ins.avgWatchTimeMs,
                        reelDurationMs: approxDurationMs,
                    });

                    return {
                        id: item.id,
                        mediaId: item.id,
                        message: item.caption || "",
                        image: item.media_url || null,
                        created_time: item.timestamp,
                        type: "reel",
                        platform: "instagram",
                        likes: ins.likes || item.like_count || 0,
                        comments: ins.comments || item.comments_count || 0,
                        shares: ins.shares,
                        saves: ins.saves,
                        views: ins.views,
                        reach: ins.reach,
                        crosspostedViews: ins.crosspostedViews,
                        facebookViews: ins.facebookViews,
                        avgWatchTimeSec: ins.avgWatchTimeSec,
                        avgWatchTimeMs: ins.avgWatchTimeMs,
                        totalWatchTimeSec: ins.totalWatchTimeSec,
                        totalWatchTimeMs: ins.totalWatchTimeMs,
                        skipRate: ins.skipRate,
                        skipRatePct: ins.skipRatePct,
                        completionRate: Math.round(completionRate * 100),
                        approxDurationSec: Math.round(approxDurationMs / 1000),
                        engagement: (ins.likes || item.like_count || 0) + (ins.comments || item.comments_count || 0) + ins.shares + ins.saves,
                        score,
                    };
                } else {
                    const ins = await fetchIgPostInsights(item.id, commonParams);
                    const likes = item.like_count || 0;
                    const comments = item.comments_count || 0;
                    const score = calculateScore({ likes, comments, saves: ins.saves });

                    return {
                        id: item.id,
                        mediaId: item.id,
                        message: item.caption || "",
                        image: item.media_url || null,
                        created_time: item.timestamp,
                        type: "post",
                        platform: "instagram",
                        likes,
                        comments,
                        shares: 0,
                        saves: ins.saves,
                        follows: ins.follows,
                        views: 0,
                        reach: ins.reach,
                        profileVisits: ins.profileVisits,
                        engagement: likes + comments,
                        score,
                        avgWatchTimeSec: null,
                        skipRate: null,
                        completionRate: null,
                    };
                }
            }),
            5  // ← Max 5 concurrent requests to Meta API
        );

        // Deduplicate IG
        const seenIg = new Set();
        instagramFormatted = instagramFormatted.filter((item) => {
            if (seenIg.has(item.id)) return false;
            seenIg.add(item.id);
            return true;
        });

        console.log(`✅ IG Reels: ${instagramFormatted.filter(x => x.type === "reel").length} | Posts: ${instagramFormatted.filter(x => x.type === "post").length}`);
    }

    // ── 3. FACEBOOK VIDEOS / REELS ────────────────
    const allVideos = await fetchAllPages(`/${pageId}/videos`, {
        fields: "id,description,created_time,length,views,likes.summary(true),comments.summary(true),source,picture",
        limit: 50,
        ...(since && { since }),
        ...(until && { until }),
        ...commonParams,
    });

    console.log(`✅ FB Videos fetched: ${allVideos.length}`);

    const videoIdSet = new Set(allVideos.map((v) => v.id));

    // ✅ FIXED - Similar pattern for Facebook videos
    const formattedVideos = await withConcurrencyLimit(
        allVideos.map((video) => async () => {
            const key = `facebook::${video.id}`;
            const existing = insightsMap.get(key);

            // ADD THIS
            if (!shouldRefreshInsights(existing, video.created_time)) {
                return toContentItem(existing);;
            }
            // END ADD

            const likes = video.likes?.summary?.total_count || 0;
            const comments = video.comments?.summary?.total_count || 0;
            const views = video.views || 0;
            const isReel = video.length && video.length <= 90;
            const fbIns = await fetchFbVideoInsights(video.id, isReel, commonParams);
            const finalViews = (isReel && fbIns.fbReelsPlays > 0) ? fbIns.fbReelsPlays : views;

            return {
                id: video.id,
                mediaId: video.id,
                message: video.description || "",
                image: video.source || video.picture || null,
                created_time: video.created_time,
                type: isReel ? "reel" : "video",
                platform: "facebook",
                likes,
                comments,
                shares: fbIns.shares,
                saves: 0,
                views: finalViews,
                reach: fbIns.reach,
                avgWatchTimeSec: fbIns.avgWatchTimeSec,
                totalWatchTimeSec: fbIns.totalWatchTimeSec,
                reelsReplays: fbIns.fbReelsReplays || null,
                views15s: isReel ? (fbIns.retention3sViews || 0) : null,
                skipRate: null,
                completionRate: null,
                engagement: likes + comments + fbIns.shares + finalViews,
                score: calculateScore({ likes, comments, shares: fbIns.shares, views: finalViews }),
            };
        }),
        5  // ← Max 5 concurrent
    );

    // ── 4. FACEBOOK POSTS ─────────────────────────
    const allPosts = await fetchAllPages(`/${pageId}/posts`, {
        fields: "id,message,created_time,full_picture,shares,likes.summary(true),comments.summary(true)",
        limit: 50,
        ...(since && { since }),
        ...(until && { until }),
        ...commonParams,
    });

    console.log(`✅ FB Posts fetched: ${allPosts.length}`);

    // ✅ FIXED - Facebook posts (with insights fetch)
    const formattedPosts = await withConcurrencyLimit(
        allPosts.map((post) => async () => {
            if (videoIdSet.has(post.id)) return null;
            if (igReelIdSet.has(post.id)) return null;
            if (!post.message && !post.full_picture) return null;

            const pic = post.full_picture || "";
            if (
                pic.includes("instagram.f") ||
                pic.includes("cdninstagram.com") ||
                pic.includes("instagram.com") ||
                pic.includes(".mp4") ||
                pic.includes("video.f") ||
                pic.includes("video-") ||
                /\/v\/[a-zA-Z0-9_-]+\.mp4/.test(pic)
            ) return null;

            const postIdBase = post.id.split("_")[1] || post.id;
            const isVideoPost = allVideos.some((v) => {
                const videoIdBase = v.id.split("_")[1] || v.id;
                return videoIdBase === postIdBase;
            });
            if (isVideoPost) return null;

            const likes = post.likes?.summary?.total_count || 0;
            const comments = post.comments?.summary?.total_count || 0;
            const shares = post.shares?.count || 0;
            const key = `facebook::${post.id}`;
            const existing = insightsMap.get(key);
            if (!shouldRefreshInsights(existing, post.created_time)) {
                return toContentItem(existing);;
            }
            let reach = 0;
            try {
                const insights = await fbClient.get(`/${post.id}/insights`, {
                    params: { metric: "post_impressions_unique", ...commonParams },
                });
                reach = insights.data.data?.[0]?.values?.[0]?.value ?? insights.data.data?.[0]?.value ?? 0;
            } catch (_) { }

            return {
                id: post.id,
                mediaId: post.id,
                message: post.message || "",
                image: post.full_picture || null,
                created_time: post.created_time,
                type: "post",
                platform: "facebook",
                likes,
                comments,
                shares,
                saves: 0,
                views: 0,
                reach,
                engagement: likes + comments + shares,
                score: calculateScore({ likes, comments, shares }),
                avgWatchTimeSec: null,
                skipRate: null,
                completionRate: null,
            };
        }),
        5  // ← Max 5 concurrent insights fetches
    );

    const filteredPosts = formattedPosts.filter(Boolean);

    // ── 5. DEDUPLICATE + COMBINE ──────────────────
    const fbContentRaw = [...filteredPosts, ...formattedVideos];
    const fbContent = [...new Map(fbContentRaw.map((item) => [item.id, item])).values()];
    const globalSeen = new Set();
    const allContent = [...fbContent, ...instagramFormatted].filter((item) => {
        const key = `${item.platform}::${item.id}`;
        if (globalSeen.has(key)) return false;
        globalSeen.add(key);
        return true;
    });

    // ✅ Count IG content AFTER dedup
    const igContentAfterDedup = allContent.filter(item => item.platform === "instagram").length;

    console.log(`✅ Total content after dedup: ${allContent.length} (FB: ${fbContent.length}, IG: ${igContentAfterDedup})`);
    // ── 6. BEST CONTENT PICKERS ───────────────────
    const bestByCategory = {
        post: getBest(fbContent.filter((x) => x.type === "post")),
        video: getBest(fbContent.filter((x) => x.type === "video")),
        reel: getBest(fbContent.filter((x) => x.type === "reel")),
    };

    const bestOverall = getBest(fbContent);

    const igBest = {
        post: getBest(instagramFormatted.filter((x) => x.type === "post")),
        reel: getBest(instagramFormatted.filter((x) => x.type === "reel")),
        overall: getBest(instagramFormatted),
        mostWatched: instagramFormatted
            .filter((x) => x.type === "reel" && x.avgWatchTimeSec > 0)
            .sort((a, b) => b.avgWatchTimeSec - a.avgWatchTimeSec)[0] || null,
        bestRetention: instagramFormatted
            .filter((x) => x.type === "reel" && x.views >= 100 && x.skipRate !== null)
            .sort((a, b) => a.skipRate - b.skipRate)[0] || null,
    };

    const globalBest = getBest(allContent);
    // ✅ Count IG items AFTER all dedup
    const igFinalCount = allContent.filter(item => item.platform === "instagram").length;
    const fbFinalCount = allContent.filter(item => item.platform === "facebook").length;

    console.log(`📊 FINAL COUNTS (after dedup):`);
    console.log(`   IG: ${igFinalCount} (was ${instagramFormatted.length} before dedup)`);
    console.log(`   FB: ${fbFinalCount} (was ${fbContent.length} before dedup)`);
    console.log(`   Total: ${allContent.length}`);

    // ── 7. MONTHLY BREAKDOWN ──────────────────────
    const monthlyMap = {};


    allContent.forEach((item) => {
        if (!item.created_time) return;
        const d = new Date(item.created_time);
        if (isNaN(d.getTime())) return;

        const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

        if (!monthlyMap[month]) {
            monthlyMap[month] = {
                month,
                facebook: { posts: 0, reels: 0, videos: 0, likes: 0, comments: 0, shares: 0, views: 0, engagement: 0, reach: 0 },
                instagram: { posts: 0, reels: 0, likes: 0, comments: 0, shares: 0, saves: 0, views: 0, engagement: 0, reach: 0, totalWatchTimeSec: 0 },
            };
        }

        const plat = monthlyMap[month][item.platform];

        if (item.type === "post") plat.posts += 1;
        else if (item.type === "reel") plat.reels += 1;
        else if (item.type === "video") plat.videos = (plat.videos || 0) + 1;

        plat.likes += item.likes || 0;
        plat.comments += item.comments || 0;
        plat.shares = (plat.shares || 0) + (item.shares || 0);
        plat.saves = (plat.saves || 0) + (item.saves || 0);
        plat.views = (plat.views || 0) + (item.views || 0);
        plat.engagement += item.engagement || 0;
        plat.reach += item.reach || 0;

        if (item.platform === "instagram" && item.totalWatchTimeSec) {
            monthlyMap[month].instagram.totalWatchTimeSec += item.totalWatchTimeSec;
        }
    });

    // ── 8. TOTALS SUMMARY ─────────────────────────
    const totalLikes = allContent.reduce((s, p) => s + (p.likes || 0), 0);
    const totalComments = allContent.reduce((s, p) => s + (p.comments || 0), 0);
    const totalShares = allContent.reduce((s, p) => s + (p.shares || 0), 0);
    const totalSaves = allContent.reduce((s, p) => s + (p.saves || 0), 0);
    const totalViews = allContent.reduce((s, p) => s + (p.views || 0), 0);
    const totalEngagement = allContent.reduce((s, p) => s + (p.engagement || 0), 0);
    const totalReach = allContent.reduce((s, p) => s + (p.reach || 0), 0);

    const igReels = instagramFormatted.filter((x) => x.type === "reel");
    const totalReelWatchTimeSec = igReels.reduce((s, r) => s + (r.totalWatchTimeSec || 0), 0);
    const avgReelWatchTimeSec = igReels.length > 0
        ? Math.round((igReels.reduce((s, r) => s + (r.avgWatchTimeSec || 0), 0) / igReels.length) * 10) / 10
        : 0;
    const avgReelSkipRate = igReels.filter(r => r.skipRate > 0).length > 0
        ? Math.round(
            igReels.filter(r => r.skipRate > 0).reduce((s, r) => s + r.skipRate, 0)
            / igReels.filter(r => r.skipRate > 0).length * 100
        )
        : 0;

    const fbReels = fbContent.filter((x) => x.type === "reel");
    const fbReelsWithWatchTime = fbReels.filter(r => r.avgWatchTimeSec != null);
    const fbAvgWatchTimeSec = fbReelsWithWatchTime.length > 0
        ? Math.round(fbReelsWithWatchTime.reduce((s, r) => s + r.avgWatchTimeSec, 0) / fbReelsWithWatchTime.length * 10) / 10
        : 0;

    // ── 9. RETURN PAYLOAD ─────────────────────────
    return {
        success: true,
        page,
        instagram: {
            profile: igProfile || null,
            best: igBest,
            data: instagramFormatted,
        },
        facebook: {
            best: bestByCategory,
            data: fbContent,
        },
        summary: {
            totalContent: allContent.length,
            facebookContent: fbFinalCount,
            instagramContent: igFinalCount,
            totalLikes,
            totalComments,
            totalShares,
            totalSaves,
            totalViews,
            totalEngagement,
            totalReach,
            reels: {
                ig: {
                    count: igReels.length,
                    totalWatchTimeSec: totalReelWatchTimeSec,
                    totalWatchTimeMin: Math.round(totalReelWatchTimeSec / 60),
                    avgWatchTimeSec: avgReelWatchTimeSec,
                    avgSkipRatePct: `${avgReelSkipRate}%`,
                },
                fb: {
                    count: fbReels.length,
                    avgWatchTimeSec: fbAvgWatchTimeSec,
                },
            },
        },
        bestOverall,
        globalBest,
        bestByCategory,
        igBest,
        monthly: Object.values(monthlyMap).sort((a, b) => a.month.localeCompare(b.month)),
        data: allContent,
    };
};

// ─────────────────────────────────────────────
// HTTP HANDLERS
// ─────────────────────────────────────────────

exports.getAccounts = async (req, res) => {
    try {
        const { data } = await fbClient.get("/v17.0/me/accounts", {
            params: { access_token: ACCESS_TOKEN, appsecret_proof: APP_SECRET_PROOF },
        });
        res.json(data.data);
    } catch (err) {
        console.error("getAccounts Error:", err.response?.data || err.message);
        res.status(500).json(err.response?.data || err.message);
    }
};

exports.getPageDetails = async (req, res) => {
    try {
        const { id } = req.params;
        const { data } = await fbClient.get(`/v17.0/${id}`, {
            params: { fields: "instagram_business_account,name", access_token: ACCESS_TOKEN, appsecret_proof: APP_SECRET_PROOF },
        });
        res.json(data);
    } catch (err) {
        console.error("getPageDetails Error:", err.response?.data || err.message);
        res.status(500).json(err.response?.data || err.message);
    }
};

exports.getInstagramMedia = async (req, res) => {
    try {
        const { igId } = req.params;
        const { data } = await fbClient.get(`/v17.0/${igId}/media`, {
            params: {
                fields: "id,caption,media_type,media_url,timestamp,like_count,comments_count",
                limit: 50,
                access_token: ACCESS_TOKEN,
                appsecret_proof: APP_SECRET_PROOF,
            },
        });
        res.json(data);
    } catch (err) {
        console.error("getInstagramMedia Error:", err.response?.data || err.message);
        res.status(500).json(err.response?.data || err.message);
    }
};

exports.getFacebookPosts = async (req, res) => {
    try {
        const { pageId } = req.params;
        const { access_token } = req.query;
        if (!access_token) return res.status(400).json({ error: "Page access token required" });

        const appsecret_proof = generateProof(access_token);
        const { data } = await fbClient.get(`/v17.0/${pageId}/posts`, {
            params: {
                fields: "id,message,created_time,full_picture,likes.summary(true),comments.summary(true)",
                limit: 25,
                access_token,
                appsecret_proof,
            },
        });
        res.json(data);
    } catch (err) {
        console.error(err.response?.data || err.message);
        res.status(500).json(err.response?.data || err.message);
    }
};

exports.getAllComments = async (req, res) => {
    try {
        const { pageId } = req.params;
        const { access_token } = req.query;
        if (!access_token) return res.status(400).json({ error: "Page access token is required." });

        const appsecret_proof = generateProof(access_token);
        const commonParams = { access_token, appsecret_proof };

        const fbPosts = await fetchAllPages(`/${pageId}/posts`, {
            fields: "id,message,created_time,comments.summary(true)",
            limit: 50,
            ...commonParams,
        });

        console.log(`✅ FB Posts fetched: ${fbPosts.length}`);

        const pageInfoRes = await fbClient.get(`/${pageId}`, {
            params: { fields: "instagram_business_account", ...commonParams },
        });
        const igUserId = pageInfoRes.data?.instagram_business_account?.id;

        let igMedia = [];
        if (igUserId) {
            igMedia = await fetchAllPages(`/${igUserId}/media`, {
                fields: "id,caption,media_type,media_url,timestamp,comments_count,like_count",
                limit: 50,
                ...commonParams,
            });
        }

        const fbDataPromises = fbPosts.map(async (post) => {
            const summaryCount = post.comments?.summary?.total_count ?? null;
            if (summaryCount === 0) {
                return { platform: "facebook", postId: post.id, message: post.message || null, createdTime: post.created_time, totalComments: 0, comments: [] };
            }
            try {
                const comments = await fetchAllPages(`/${post.id}/comments`, {
                    fields: "id,message,created_time,from{name,id},like_count",
                    filter: "stream",
                    limit: 50,
                    ...commonParams,
                });
                return { platform: "facebook", postId: post.id, message: post.message || null, createdTime: post.created_time, totalComments: comments.length, comments };
            } catch (err) {
                const errMsg = err.response?.data?.error?.message || err.message;
                return { platform: "facebook", postId: post.id, message: post.message || null, createdTime: post.created_time, totalComments: 0, comments: [], error: errMsg };
            }
        });

        const igDataPromises = igMedia.map(async (media) => {
            if ((media.comments_count ?? 0) === 0) {
                return { platform: "instagram", mediaId: media.id, caption: media.caption || null, mediaType: media.media_type, timestamp: media.timestamp, likeCount: media.like_count || 0, totalComments: 0, comments: [] };
            }
            try {
                const comments = await fetchAllPages(`/${media.id}/comments`, {
                    fields: "id,text,username,timestamp,replies{id,text,username,timestamp}",
                    limit: 50,
                    ...commonParams,
                });
                return { platform: "instagram", mediaId: media.id, caption: media.caption || null, mediaType: media.media_type, timestamp: media.timestamp, likeCount: media.like_count || 0, totalComments: comments.length, comments };
            } catch (err) {
                const errMsg = err.response?.data?.error?.message || err.message;
                return { platform: "instagram", mediaId: media.id, caption: media.caption || null, mediaType: media.media_type, timestamp: media.timestamp, likeCount: media.like_count || 0, totalComments: 0, comments: [], error: errMsg };
            }
        });

        const [fbData, igData] = await Promise.all([Promise.all(fbDataPromises), Promise.all(igDataPromises)]);
        const allData = [...fbData, ...igData];

        const totalFBComments = fbData.reduce((sum, p) => sum + p.totalComments, 0);
        const totalIGComments = igData.reduce((sum, m) => sum + m.totalComments, 0);

        return res.status(200).json({
            success: true,
            summary: {
                facebookPosts: fbPosts.length,
                instagramPosts: igMedia.length,
                totalFacebookComments: totalFBComments,
                totalInstagramComments: totalIGComments,
                totalComments: totalFBComments + totalIGComments,
            },
            data: allData,
        });

    } catch (err) {
        const errMsg = err.response?.data?.error?.message || err.message;
        console.error("❌ getAllComments error:", errMsg);
        return res.status(500).json({ success: false, error: errMsg });
    }
};

/**
 * GET /api/facebook/dashboard/:pageId?access_token=...
 * HTTP wrapper — calls getDashboardData and sends the result.
 */
exports.getDashboard = async (req, res) => {
    try {
        const { pageId } = req.params;
        const { access_token, since, until } = req.query;

        if (!access_token) {
            return res.status(400).json({ error: "Page access token required" });
        }

        const data = await exports.getDashboardData(pageId, access_token, since, until);
        return res.status(200).json(data);

    } catch (err) {
        console.error("❌ Dashboard Error:", err.response?.data || err.message);
        return res.status(500).json({
            success: false,
            error: err.response?.data?.error?.message || err.message || "Internal server error",
        });
    }
};