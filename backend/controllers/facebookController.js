const fbClient = require("../utils/fbClient");
const generateProof = require("../utils/generateProof");

// 🔒 Move these to ENV in production
const ACCESS_TOKEN =
    "EAANKDV86S6gBRMrqeSHAtcjZAt9JRcKhfjituzCt9ZCUoobNZCIgRT4bDqkZCpLZCeks83yJtBSxhZBdmNCza1evrqJGkKkWOnLPckLqG01Q5HcHmGxs8ZCFuyKerZAx1jG9W6tPq4RFQsAbU7tjznq4HpFJg0EckvGQnUcZCO23PdOFaq7BYynKbZCZBSYGgwl";

const APP_SECRET_PROOF =
    "b4e95a2fbc498da4f06af7f0bcce97f369401e1b87d57d21810867f40f977a77";






exports.getAccounts = async (req, res) => {
    try {
        const { data } = await fbClient.get("/v17.0/me/accounts", {
            params: {
                access_token: ACCESS_TOKEN,
                appsecret_proof: APP_SECRET_PROOF,
            },
        });

        // ✅ SEND FULL DATA (including page access_token)
        res.json(data.data);

    } catch (err) {
        console.error("getAccounts Error:", err.response?.data || err.message);
        res.status(500).json(err.response?.data || err.message);
    }
};


// ✅ 2. Get page details (check IG link)
exports.getPageDetails = async (req, res) => {
    try {
        const { id } = req.params;

        const { data } = await fbClient.get(`/v17.0/${id}`, {
            params: {
                fields: "instagram_business_account,name",
                access_token: ACCESS_TOKEN,
                appsecret_proof: APP_SECRET_PROOF,
            },
        });

        res.json(data);
    } catch (err) {
        console.error("getPageDetails Error:", err.response?.data || err.message);
        res.status(500).json(err.response?.data || err.message);
    }
};


// ✅ 3. Instagram media
exports.getInstagramMedia = async (req, res) => {
    try {
        const { igId } = req.params;

        const { data } = await fbClient.get(`/v17.0/${igId}/media`, {
            params: {
                fields:
                    "id,caption,media_type,media_url,timestamp,like_count,comments_count",
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


// ✅ 4. Facebook posts (IMPORTANT FIX)
exports.getFacebookPosts = async (req, res) => {
    try {
        const { pageId } = req.params;
        const { access_token } = req.query;

        if (!access_token) {
            return res.status(400).json({
                error: "Page access token required",
            });
        }


        const appsecret_proof = generateProof(access_token);

        const { data } = await fbClient.get(`/v17.0/${pageId}/posts`, {
            params: {
                fields:
                    "id,message,created_time,full_picture,likes.summary(true),comments.summary(true)",
                limit: 25,
                access_token,
                appsecret_proof, // ✅ generated here
            },
        });

        res.json(data);
    } catch (err) {
        console.error(err.response?.data || err.message);
        res.status(500).json(err.response?.data || err.message);
    }
};

// =========================
// HELPER: PARSE FACEBOOK NEXT URL
// Extracts path + params from a full paging.next URL
// to avoid base URL duplication with axios
// =========================
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

// =========================
// HELPER: FETCH ALL PAGINATED DATA
// Handles cursor-based pagination via paging.next
// Always re-injects access_token + appsecret_proof on every page
// because Facebook strips them from paging.next URLs
// =========================
const fetchAllPages = async (url, params) => {
    let results = [];
    let currentUrl = url;
    let currentParams = params;

    const { access_token, appsecret_proof } = params;

    while (currentUrl) {
        const response = await fbClient.get(currentUrl, { params: currentParams });
        const data = response.data?.data || [];
        results = results.concat(data);

        const nextUrl = response.data?.paging?.next;
        if (nextUrl) {
            const parsed = parseFbNextUrl(nextUrl);
            if (!parsed) break;
            currentUrl = parsed.path;
            currentParams = {
                ...parsed.params,
                access_token,    // always re-inject
                appsecret_proof, // always re-inject
            };
        } else {
            currentUrl = null;
        }
    }

    return results;
};

// =========================
// GET ALL COMMENTS
// GET /api/:pageId/comments?access_token=PAGE_ACCESS_TOKEN
// =========================
exports.getAllComments = async (req, res) => {
    try {
        const { pageId } = req.params;
        const { access_token } = req.query;

        if (!access_token) {
            return res.status(400).json({ error: "Page access token is required." });
        }

        const appsecret_proof = generateProof(access_token);
        const commonParams = { access_token, appsecret_proof };

        // =========================
        // 1. FETCH ALL FACEBOOK POSTS (paginated)
        // Include comments.summary so we can skip posts with 0 comments
        // =========================
        const fbPosts = await fetchAllPages(`/${pageId}/posts`, {
            fields: "id,message,created_time,comments.summary(true)",
            limit: 50,
            ...commonParams,
        });

        console.log(`✅ FB Posts fetched: ${fbPosts.length}`);

        // =========================
        // 2. GET INSTAGRAM BUSINESS ACCOUNT ID
        // =========================
        const pageInfoRes = await fbClient.get(`/${pageId}`, {
            params: {
                fields: "instagram_business_account",
                ...commonParams,
            },
        });

        const igUserId = pageInfoRes.data?.instagram_business_account?.id;
        console.log(`✅ IG User ID: ${igUserId || "Not linked"}`);

        // =========================
        // 3. FETCH ALL INSTAGRAM MEDIA (paginated)
        // =========================
        let igMedia = [];
        if (igUserId) {
            igMedia = await fetchAllPages(`/${igUserId}/media`, {
                fields: "id,caption,media_type,media_url,timestamp,comments_count,like_count",
                limit: 50,
                ...commonParams,
            });
            console.log(`✅ IG Media fetched: ${igMedia.length}`);
        }

        // =========================
        // 4. FETCH FACEBOOK COMMENTS IN PARALLEL
        // Uses filter=stream to get ALL comments (not just top-level)
        // Skips posts that have 0 comments per summary
        // =========================
        const fbDataPromises = fbPosts.map(async (post) => {
            const summaryCount = post.comments?.summary?.total_count ?? null;

            // Skip API call if post has no comments
            if (summaryCount === 0) {
                return {
                    platform: "facebook",
                    postId: post.id,
                    message: post.message || null,
                    createdTime: post.created_time,
                    totalComments: 0,
                    comments: [],
                };
            }

            try {
                const comments = await fetchAllPages(`/${post.id}/comments`, {
                    fields: "id,message,created_time,from{name,id},like_count",
                    filter: "stream", // KEY: gets all comments including replies
                    limit: 50,
                    ...commonParams,
                });

                console.log(`  → Post ${post.id}: ${comments.length} comments`);

                return {
                    platform: "facebook",
                    postId: post.id,
                    message: post.message || null,
                    createdTime: post.created_time,
                    totalComments: comments.length,
                    comments,
                };
            } catch (err) {
                const errMsg = err.response?.data?.error?.message || err.message;
                console.error(`❌ FB comment error [${post.id}]: ${errMsg}`);
                return {
                    platform: "facebook",
                    postId: post.id,
                    message: post.message || null,
                    createdTime: post.created_time,
                    totalComments: 0,
                    comments: [],
                    error: errMsg,
                };
            }
        });

        // =========================
        // 5. FETCH INSTAGRAM COMMENTS IN PARALLEL
        // Skips media with 0 comments_count
        // =========================
        const igDataPromises = igMedia.map(async (media) => {
            // Skip API call if media has no comments
            if ((media.comments_count ?? 0) === 0) {
                return {
                    platform: "instagram",
                    mediaId: media.id,
                    caption: media.caption || null,
                    mediaType: media.media_type,
                    timestamp: media.timestamp,
                    likeCount: media.like_count || 0,
                    totalComments: 0,
                    comments: [],
                };
            }

            try {
                const comments = await fetchAllPages(`/${media.id}/comments`, {
                    fields: "id,text,username,timestamp,replies{id,text,username,timestamp}",
                    limit: 50,
                    ...commonParams,
                });

                console.log(`  → IG Media ${media.id}: ${comments.length} comments`);

                return {
                    platform: "instagram",
                    mediaId: media.id,
                    caption: media.caption || null,
                    mediaType: media.media_type,
                    timestamp: media.timestamp,
                    likeCount: media.like_count || 0,
                    totalComments: comments.length,
                    comments,
                };
            } catch (err) {
                const errMsg = err.response?.data?.error?.message || err.message;
                console.error(`❌ IG comment error [${media.id}]: ${errMsg}`);
                return {
                    platform: "instagram",
                    mediaId: media.id,
                    caption: media.caption || null,
                    mediaType: media.media_type,
                    timestamp: media.timestamp,
                    likeCount: media.like_count || 0,
                    totalComments: 0,
                    comments: [],
                    error: errMsg,
                };
            }
        });

        // =========================
        // 6. RUN ALL COMMENT FETCHES CONCURRENTLY
        // =========================
        const [fbData, igData] = await Promise.all([
            Promise.all(fbDataPromises),
            Promise.all(igDataPromises),
        ]);

        const allData = [...fbData, ...igData];

        const totalFBComments = fbData.reduce((sum, p) => sum + p.totalComments, 0);
        const totalIGComments = igData.reduce((sum, m) => sum + m.totalComments, 0);

        console.log(`✅ Done — FB comments: ${totalFBComments}, IG comments: ${totalIGComments}`);

        // =========================
        // 7. SEND RESPONSE
        // =========================
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
        return res.status(500).json({
            success: false,
            error: errMsg,
        });
    }
};


function calculateScore({ likes = 0, comments = 0, shares = 0, views = 0 }) {
    return likes * 4 + comments * 6 + shares * 8 + views * 0.5;
}

// =========================
// BEST PICKER
// =========================
function getBest(arr) {
    return arr.length ? [...arr].sort((a, b) => b.score - a.score)[0] : null;
}

// =========================
// INSTAGRAM INSIGHTS HELPER — with full debug logging
// =========================
async function fetchIgInsights(itemId, mediaType, commonParams) {
    let views = 0;
    let reach = 0;

    if (mediaType === "VIDEO") {
        // Correct metric order based on what the API actually accepts:
        // "plays" = actual play count (use this first)
        // "views" = same as plays on newer API versions
        // "video_views" = legacy, may return 0 for newer reels
        // "clips_replays_count" = replays only (not total plays)
        // "ig_reels_aggregated_all_plays_count" = includes organic + paid combined
        const viewMetrics = [
            "plays",
            "views",
            "video_views",
            "ig_reels_aggregated_all_plays_count",
            "clips_replays_count",
        ];

        for (const metric of viewMetrics) {
            try {
                const res = await fbClient.get(`/${itemId}/insights`, {
                    params: { metric, ...commonParams },
                });

                const insightData = res.data.data || [];
                for (const insight of insightData) {
                    const val = insight.values?.[0]?.value ?? insight.value ?? 0;
                    if (insight.name === metric) views = val;
                }

                if (views > 0) {
                    console.log(`  ✅ IG views for ${itemId}: ${views} (metric: ${metric})`);
                    break;
                }

            } catch (err) {
                // silently skip and try next metric
            }
        }

        // Fetch reach separately — never combine with video metrics
        try {
            const res = await fbClient.get(`/${itemId}/insights`, {
                params: { metric: "reach", ...commonParams },
            });
            (res.data.data || []).forEach((insight) => {
                const val = insight.values?.[0]?.value ?? insight.value ?? 0;
                if (insight.name === "reach") reach = val;
            });
        } catch (_) { }

    } else {
        // IMAGE / CAROUSEL_ALBUM — only reach available
        try {
            const res = await fbClient.get(`/${itemId}/insights`, {
                params: { metric: "reach", ...commonParams },
            });
            (res.data.data || []).forEach((insight) => {
                const val = insight.values?.[0]?.value ?? insight.value ?? 0;
                if (insight.name === "reach") reach = val;
            });
        } catch (_) { }
    }

    return { views, reach };
}

// =========================
// DASHBOARD CONTROLLER
// GET /api/:pageId/dashboard?access_token=PAGE_ACCESS_TOKEN&since=UNIX&until=UNIX
// =========================
exports.getDashboard = async (req, res) => {
    try {
        const { pageId } = req.params;
        const { access_token, since, until } = req.query;

        if (!access_token) {
            return res.status(400).json({ error: "Page access token required" });
        }

        const appsecret_proof = generateProof(access_token);
        const commonParams = { access_token, appsecret_proof };

        // =========================
        // 1. PAGE INFO
        // =========================
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

        // =========================
        // 2. INSTAGRAM DATA (ALL paginated)
        // =========================
        let igProfile = null;
        let instagramFormatted = [];

        if (pageRes.data.instagram_business_account) {
            const igId = pageRes.data.instagram_business_account.id;

            // Fetch IG profile + ALL media in parallel
            const [igInfoRes, igAllMedia] = await Promise.all([
                fbClient.get(`/${igId}`, {
                    params: {
                        fields: "username,followers_count,media_count",
                        ...commonParams,
                    },
                }),
                fetchAllPages(`/${igId}/media`, {
                    fields: "id,caption,media_type,media_url,like_count,comments_count,timestamp",
                    limit: 50,
                    ...commonParams,
                }),
            ]);

            igProfile = igInfoRes.data;
            console.log(`✅ IG Media fetched: ${igAllMedia.length}`);

            // Fetch insights for each IG media in parallel
            instagramFormatted = await Promise.all(
                igAllMedia.map(async (item) => {
                    const isReel = item.media_type === "VIDEO";

                    // Use the robust helper that tries multiple metric names
                    const { views, reach } = await fetchIgInsights(
                        item.id,
                        item.media_type,
                        commonParams
                    );

                    const likes = item.like_count || 0;
                    const comments = item.comments_count || 0;

                    // Score now correctly includes views for reels
                    const score = calculateScore({ likes, comments, views });

                    return {
                        id: item.id,
                        message: item.caption || "",
                        image: item.media_url || null,
                        created_time: item.timestamp,
                        type: isReel ? "reel" : "post",
                        likes,
                        comments,
                        shares: 0,
                        views,           // ← properly populated for reels
                        engagement: likes + comments + views,
                        score,           // ← now includes views weight
                        reach,
                        platform: "instagram",
                    };
                })
            );

            // Deduplicate IG
            const seenIg = new Set();
            instagramFormatted = instagramFormatted.filter((item) => {
                if (seenIg.has(item.id)) return false;
                seenIg.add(item.id);
                return true;
            });

            console.log(
                `✅ IG Reels with views > 0: ${instagramFormatted.filter((x) => x.type === "reel" && x.views > 0).length
                }`
            );
        }

        // =========================
        // 3. FACEBOOK VIDEOS / REELS — ALL paginated
        // =========================
        const allVideos = await fetchAllPages(`/${pageId}/videos`, {
            fields: "id,description,created_time,length,views,likes.summary(true),comments.summary(true),source,picture",
            limit: 50,
            ...(since && { since }),
            ...(until && { until }),
            ...commonParams,
        });

        console.log(`✅ FB Videos fetched: ${allVideos.length}`);

        const formattedVideos = await Promise.all(
            allVideos.map(async (video) => {
                const likes = video.likes?.summary?.total_count || 0;
                const comments = video.comments?.summary?.total_count || 0;
                const views = video.views || 0;
                const isReel = video.length && video.length <= 90;

                let shares = 0;
                let reach = 0;

                await Promise.all([
                    // Shares
                    fbClient.get(`/${video.id}/sharedposts`, {
                        params: { summary: true, ...commonParams },
                    }).then((r) => {
                        shares = r.data.summary?.total_count || 0;
                    }).catch(() => { }),

                    // Reach / impressions
                    fbClient.get(`/${video.id}/video_insights`, {
                        params: {
                            metric: "total_video_impressions_unique",
                            ...commonParams,
                        },
                    }).then((r) => {
                        reach = r.data.data?.[0]?.values?.[0]?.value || 0;
                    }).catch(() => { }),
                ]);

                return {
                    id: video.id,
                    message: video.description || "",
                    image: video.source || video.picture || null,
                    created_time: video.created_time,
                    type: isReel ? "reel" : "video",
                    likes,
                    comments,
                    shares,
                    views,
                    engagement: likes + comments + shares + views,
                    score: calculateScore({ likes, comments, shares, views }),
                    reach,
                    platform: "facebook",
                };
            })
        );

        // =========================
        // 4. FACEBOOK POSTS — ALL paginated
        // =========================
        const allPosts = await fetchAllPages(`/${pageId}/posts`, {
            fields: "id,message,created_time,full_picture,shares,likes.summary(true),comments.summary(true)",
            limit: 50,
            ...(since && { since }),
            ...(until && { until }),
            ...commonParams,
        });

        console.log(`✅ FB Posts fetched: ${allPosts.length}`);

        // Build a Set of video IDs so we can skip cross-posted videos in posts
        const videoIdSet = new Set(allVideos.map((v) => v.id));

        const formattedPosts = await Promise.all(
            allPosts.map(async (post) => {
                // Skip if this post is actually a video (already handled above)
                if (videoIdSet.has(post.id)) return null;

                // Skip stubs with no content
                if (!post.message && !post.full_picture) return null;

                // Skip cross-posted IG reels
                const pic = post.full_picture || "";
                if (
                    pic.includes("instagram.f") ||
                    pic.includes("cdninstagram.com") ||
                    pic.includes(".mp4")
                ) return null;

                const likes = post.likes?.summary?.total_count || 0;
                const comments = post.comments?.summary?.total_count || 0;
                const shares = post.shares?.count || 0;

                let reach = 0;
                try {
                    const insights = await fbClient.get(`/${post.id}/insights`, {
                        params: {
                            metric: "post_impressions_unique",
                            ...commonParams,
                        },
                    });
                    reach =
                        insights.data.data?.[0]?.values?.[0]?.value ??
                        insights.data.data?.[0]?.value ??
                        0;
                } catch (err) { }

                return {
                    id: post.id,
                    message: post.message || "",
                    image: post.full_picture || null,
                    created_time: post.created_time,
                    type: "post",
                    likes,
                    comments,
                    shares,
                    views: 0,
                    engagement: likes + comments + shares,
                    score: calculateScore({ likes, comments, shares }),
                    reach,
                    platform: "facebook",
                };
            })
        );

        // Filter out nulls from skipped posts
        const filteredPosts = formattedPosts.filter(Boolean);

        // =========================
        // 5. DEDUPLICATE + COMBINE ALL FB CONTENT
        // =========================
        const fbContentRaw = [...filteredPosts, ...formattedVideos];
        const fbContent = [
            ...new Map(fbContentRaw.map((item) => [item.id, item])).values(),
        ];

        // Global dedup across FB + IG (handles rare ID collisions)
        const globalSeen = new Set();
        const allContent = [...fbContent, ...instagramFormatted].filter((item) => {
            const key = `${item.platform}::${item.id}`;
            if (globalSeen.has(key)) return false;
            globalSeen.add(key);
            return true;
        });

        console.log(`✅ Total content after dedup: ${allContent.length}`);

        // =========================
        // 6. BEST CONTENT PICKERS
        // =========================
        const bestByCategory = {
            post: getBest(fbContent.filter((x) => x.type === "post")),
            video: getBest(fbContent.filter((x) => x.type === "video")),
            reel: getBest(fbContent.filter((x) => x.type === "reel")),
        };

        const bestOverall = getBest(fbContent);

        const igBest = {
            post: getBest(instagramFormatted.filter((x) => x.type === "post")),
            reel: getBest(instagramFormatted.filter((x) => x.type === "reel")),  // ← now scores correctly with views
            overall: getBest(instagramFormatted),
        };

        const globalBest = getBest(allContent);

        // =========================
        // 7. MONTHLY BREAKDOWN
        // =========================
        const monthlyMap = {};

        allContent.forEach((item) => {
            if (!item.created_time) return;
            const d = new Date(item.created_time);
            if (isNaN(d.getTime())) return;

            const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

            if (!monthlyMap[month]) {
                monthlyMap[month] = {
                    month,
                    facebook: { posts: 0, likes: 0, comments: 0, shares: 0, engagement: 0, reach: 0 },
                    instagram: { posts: 0, likes: 0, comments: 0, views: 0, engagement: 0, reach: 0 },
                };
            }

            const plat = monthlyMap[month][item.platform];
            plat.posts += 1;
            plat.likes += item.likes || 0;
            plat.comments += item.comments || 0;
            plat.shares = (plat.shares || 0) + (item.shares || 0);
            plat.views = (plat.views || 0) + (item.views || 0);   // ← track IG reel views in monthly
            plat.engagement += item.engagement || 0;
            plat.reach += item.reach || 0;
        });

        // =========================
        // 8. TOTALS SUMMARY
        // =========================
        const totalLikes = allContent.reduce((s, p) => s + (p.likes || 0), 0);
        const totalComments = allContent.reduce((s, p) => s + (p.comments || 0), 0);
        const totalShares = allContent.reduce((s, p) => s + (p.shares || 0), 0);
        const totalViews = allContent.reduce((s, p) => s + (p.views || 0), 0);
        const totalEngagement = allContent.reduce((s, p) => s + (p.engagement || 0), 0);
        const totalReach = allContent.reduce((s, p) => s + (p.reach || 0), 0);

        // =========================
        // 9. FINAL RESPONSE
        // =========================
        return res.status(200).json({
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
                facebookContent: fbContent.length,
                instagramContent: instagramFormatted.length,
                totalLikes,
                totalComments,
                totalShares,
                totalViews,
                totalEngagement,
                totalReach,
            },
            bestOverall,
            globalBest,
            bestByCategory,
            igBest,
            monthly: Object.values(monthlyMap).sort((a, b) =>
                b.month.localeCompare(a.month)
            ),
            data: allContent,
        });

    } catch (err) {
        console.error("❌ Dashboard Error:", err.response?.data || err.message);
        return res.status(500).json({
            success: false,
            error: err.response?.data?.error?.message || err.message || "Internal server error",
        });
    }
};